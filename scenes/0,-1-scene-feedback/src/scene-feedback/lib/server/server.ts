import { Entity, PlayerIdentityData, engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { getSceneInformation } from '~system/Runtime'
import {
  HEARTBEAT_MS,
  INTRO_ANSWERS,
  INTRO_ID,
  IntroSpec,
  limitComment,
  MAX_RATING,
  SKIPPED_LABEL,
  findQuestion
} from '../shared/series'
import { room } from '../shared/messages'
import { scaleLabels, scaleName } from '../shared/scales'
import { ServerHeartbeat } from '../shared/schemas'
import { sinceLoad } from '../shared/clock'
import { CsvRow, formatRow, sanitizeId, utf8Length } from './csv'
import { CURRENT_PART_KEY, PartStore, writeBatch } from './parts'

// Responses buffer in memory, then flush into numbered CSV parts in scene Storage.
// Flush after FLUSH_COOLDOWN_MS, or at once when the last player leaves: no shutdown hook.
// one flush writes at most this much, the rest goes in the next: a bigger batch could never fit a part
const BATCH_MAX_BYTES = 200 * 1024
const FLUSH_COOLDOWN_MS = 60_000
const LOAD_RETRY_MS = 5_000
const FLUSH_RETRY_MS = 5_000
// Per address: caps what one client can write. A legit visit sends a few rows.
const RATE_WINDOW_MS = 10 * 60_000
const RATE_MAX_ROWS = 100
// a resend after that is still deduped against the part being written, unless it rolled over meanwhile
const SEEN_KEEP_MS = 10 * 60_000
// Storage down for long: past this, Responses go unacked (clients resend, then give up) instead of filling memory
const MAX_PENDING_ROWS = 2000

// acked, not yet in Storage
const pending = new Map<string, string>()
// id → accepted at: a resend is re-acked, not re-added
const seen = new Map<string, number>()
// address → accepted-at times within RATE_WINDOW_MS
const recentRows = new Map<string, number[]>()

let currentPart = 0 // 0 = not loaded yet: responses are not accepted
let flushing = false
let lastFlushAt = 0
// last player left: flush now, retried until it succeeds
let flushRequested = false
let failedAt = 0
let pendingFullLogged = false
let playerCount = 0
let sceneVersion = ''

let heartbeatEntity: Entity

// flushes always read what Storage holds now, not the SDK's cache
const store: PartStore = {
  get: <T>(key: string) => Storage.get<T>(key, { fresh: true }),
  set: (key, value) => Storage.set(key, value),
  delete: (key) => Storage.delete(key),
  list: async (prefix) => {
    const entries: { key: string; value: unknown }[] = []
    for (;;) {
      const page = await Storage.getValues({ prefix, offset: entries.length })
      entries.push(...page.data)
      if (page.data.length === 0 || entries.length >= page.pagination.total) return entries
    }
  }
}

let intro: IntroSpec | null = null

export async function startServer(introSpec: IntroSpec | null): Promise<void> {
  intro = introSpec
  heartbeatEntity = engine.addEntity()
  ServerHeartbeat.create(heartbeatEntity, { beatAt: Date.now() })
  syncEntity(heartbeatEntity, [ServerHeartbeat.componentId])

  room.onMessage('feedbackSubmit', (data, context) => {
    if (context) receiveResponse(data, context.from)
  })

  // Not awaited: readiness must never hang on a runtime call that isn't Storage.
  void readSceneVersion().then((version) => (sceneVersion = version))
  await loadCurrentPart()
  // clients count the server alive only once beatAt changes: not before responses are accepted
  engine.addSystem(heartbeatSystem)
  engine.addSystem(flushSystem)
  console.log(`[SERVER] Feedback server ready at +${sinceLoad()}, writing part ${currentPart}, ${countPlayers()} player(s)`)
}

// Entity id tail: new on every deploy, so builds never mix. Every CID starts with "bafkrei".
async function readSceneVersion(): Promise<string> {
  try {
    const { urn } = await getSceneInformation({})
    console.log(`[SERVER] Scene urn: ${urn}`)
    // preview: base64 of the project path
    if (urn.startsWith('b64-')) return 'preview'
    const entityId = urn.split(':').pop()?.split('?')[0] ?? ''
    return entityId.slice(-10)
  } catch (e) {
    console.log('[SERVER] Could not read the scene version:', e)
    return ''
  }
}

// No response accepted until this succeeds: an empty CSV would overwrite the stored one.
async function loadCurrentPart(): Promise<void> {
  for (;;) {
    try {
      const stored = await Storage.get<number>(CURRENT_PART_KEY, { fresh: true })
      currentPart = Math.max(1, stored ?? 1)
      // written once so flushes don't hit a 404 (the SDK logs each as ERROR)
      if (stored === null) await Storage.set(CURRENT_PART_KEY, currentPart)
      return
    } catch (e) {
      console.log('[SERVER] Could not read the current CSV part, retrying:', e)
      await sleep(LOAD_RETRY_MS)
    }
  }
}

function receiveResponse(
  data: {
    requestId: string
    questionId: string
    trigger: string
    rating: number
    comment: string
    commentShown: boolean
    secondsInScene: number
    platform: string
  },
  from: string
): void {
  // not loaded: no ack, so the client keeps resending
  if (currentPart === 0) return
  const ack = (ok: boolean) => void room.send('feedbackSaved', { requestId: data.requestId, ok }, { to: [from] })

  const id = sanitizeId(data.requestId)
  if (seen.has(id)) return ack(true)

  if (id === '') return ack(false)
  // no ack: the client resends for 30 s, then drops it
  if (pending.size >= MAX_PENDING_ROWS) {
    if (!pendingFullLogged) console.log(`[SERVER] ${MAX_PENDING_ROWS} rows pending; new responses wait for space`)
    pendingFullLogged = true
    return
  }
  pendingFullLogged = false
  if (!withinRate(from.toLowerCase())) {
    console.log(`[SERVER] ${from} over ${RATE_MAX_ROWS} rows in ${RATE_WINDOW_MS / 60_000} min, dropped`)
    return ack(false)
  }
  if (data.questionId === INTRO_ID) return receiveIntroAnswer(id, data, from, ack)
  const question = findQuestion(data.questionId)
  if (!question) return ack(false)

  const rating =
    !question.commentOnly && Number.isInteger(data.rating) && data.rating >= 1 && data.rating <= MAX_RATING
      ? data.rating
      : null
  const commentShown = question.commentOnly || (data.commentShown && question.commentPrompt !== undefined)
  const comment = commentShown ? limitComment(data.comment.trim()) : ''
  const row: CsvRow = {
    ...baseRow(id, data, from),
    questionId: question.id,
    questionText: question.text,
    rating,
    ratingLabel:
      !question.commentOnly && rating !== null
        ? scaleLabels(question.scale)[rating - 1]
        : comment === '' ? SKIPPED_LABEL : '',
    scale: question.commentOnly ? '' : scaleName(question.scale),
    commentPrompt: commentShown ? question.commentPrompt ?? '' : '',
    comment
  }

  accept(row)
  console.log(`[SERVER] ${question.id} rating=${rating ?? '-'} from ${row.address}, ${pending.size} pending`)
  ack(true)
}

function receiveIntroAnswer(
  id: string,
  data: { trigger: string; rating: number; secondsInScene: number; platform: string },
  from: string,
  ack: (ok: boolean) => void
): void {
  const answer = INTRO_ANSWERS[data.rating]
  if (!Number.isInteger(data.rating) || answer === undefined) return ack(false)
  const row: CsvRow = {
    ...baseRow(id, data, from),
    questionId: INTRO_ID,
    questionText: intro?.title ?? '',
    rating: null,
    ratingLabel: answer,
    scale: '',
    commentPrompt: '',
    comment: ''
  }
  accept(row)
  console.log(`[SERVER] intro ${row.ratingLabel} from ${row.address}, ${pending.size} pending`)
  ack(true)
}

// the columns every row has, whatever was answered
function baseRow(
  id: string,
  data: { trigger: string; secondsInScene: number; platform: string },
  from: string
): Pick<CsvRow, 'id' | 'serverTs' | 'version' | 'trigger' | 'secondsInScene' | 'playersInScene' | 'address' | 'isGuest' | 'platform'> {
  const address = from.toLowerCase()
  return {
    id,
    serverTs: Date.now(),
    version: sceneVersion,
    trigger: data.trigger.slice(0, 40),
    secondsInScene: Math.max(0, data.secondsInScene),
    playersInScene: countPlayers(),
    address,
    isGuest: findIsGuest(address),
    platform: data.platform.slice(0, 20)
  }
}

function accept(row: CsvRow): void {
  const { id, address } = row
  const now = Date.now()
  seen.set(id, now)
  const times = recentRows.get(address)
  if (times) times.push(now)
  else recentRows.set(address, [now])
  pending.set(id, formatRow(row))
}

function withinRate(address: string): boolean {
  const now = Date.now()
  const times = (recentRows.get(address) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (times.length === 0) recentRows.delete(address)
  else recentRows.set(address, times)
  return times.length < RATE_MAX_ROWS
}

function forgetOld(): void {
  const now = Date.now()
  for (const [id, at] of seen) if (now - at > SEEN_KEEP_MS) seen.delete(id)
  for (const address of [...recentRows.keys()]) withinRate(address)
}

// After a redeploy two instances overlap briefly: writeBatch() never rewrites a key, so neither loses the other's rows.
async function flush(): Promise<void> {
  if (flushing || pending.size === 0) return
  flushing = true
  lastFlushAt = Date.now()
  const batch: [string, string][] = []
  let batchBytes = 0
  for (const entry of pending) {
    batchBytes += utf8Length(entry[1]) + 1
    if (batch.length > 0 && batchBytes > BATCH_MAX_BYTES) break
    batch.push(entry)
  }
  const more = batch.length < pending.size
  try {
    const result = await writeBatch(store, batch, currentPart)
    currentPart = result.part
    if (result.rolledOver) console.log(`[SERVER] Rolled over to part ${currentPart}`)
    for (const [id] of batch) pending.delete(id)
    // the rest of an oversized batch goes next; rows that arrived during this flush keep a request
    flushRequested = more || (flushRequested && pending.size > 0)
    const where = result.key ? `${result.key} (${result.bytes} B, merged ${result.merged} version(s))` : `part ${currentPart}`
    console.log(`[SERVER] Flushed ${result.written} row(s) to ${where}`)
  } catch (e) {
    // rows stay pending: retried after FLUSH_RETRY_MS if requested, else at the next cooldown
    failedAt = Date.now()
    console.log('[SERVER] Flush failed:', e)
  } finally {
    flushing = false
  }
}

function flushSystem(): void {
  if (currentPart === 0) return

  const count = countPlayers()
  if (playerCount > 0 && count === 0) flushRequested = true
  playerCount = count

  if (pending.size === 0) {
    flushRequested = false
    return
  }
  if (flushing) return
  const now = Date.now()
  const retryDue = flushRequested && now - failedAt >= FLUSH_RETRY_MS
  if (retryDue || now - lastFlushAt >= FLUSH_COOLDOWN_MS) {
    forgetOld()
    void flush()
  }
}

function countPlayers(): number {
  let count = 0
  for (const _ of engine.getEntitiesWith(PlayerIdentityData)) count++
  return count
}

function findIsGuest(address: string): boolean | null {
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address.toLowerCase() === address) return identity.isGuest
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let elapsed = 0
    const system = (dt: number) => {
      elapsed += dt * 1000
      if (elapsed < ms) return
      engine.removeSystem(system)
      resolve()
    }
    engine.addSystem(system)
  })
}

let heartbeatAcc = 0
function heartbeatSystem(dt: number): void {
  heartbeatAcc += dt
  if (heartbeatAcc < HEARTBEAT_MS / 1000) return
  heartbeatAcc = 0
  ServerHeartbeat.getMutable(heartbeatEntity).beatAt = Date.now()
}
