import { Entity, PlayerIdentityData, engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { getSceneInformation } from '~system/Runtime'
import {
  HEARTBEAT_MS,
  INTRO_ANSWERS,
  INTRO_ID,
  IntroSpec,
  MAX_COMMENT_LENGTH,
  MAX_RATING,
  SKIPPED_LABEL,
  findQuestion
} from '../shared/series'
import { room } from '../shared/messages'
import { scaleLabels, scaleName } from '../shared/scales'
import { ServerHeartbeat } from '../shared/schemas'
import { sinceLoad } from '../shared/clock'
import { CSV_HEADER, CsvRow, formatRow, hasRow, sanitizeId, utf8Length } from './csv'

// Responses buffer in memory, then flush into numbered CSV parts in scene Storage.
// Flush after FLUSH_COOLDOWN_MS, or at once when the last player leaves: no shutdown hook.
// Keys named like files: owners find them in the storage UI.
const CURRENT_PART_KEY = 'playtest-feedback-csv-head' // the number of the part being written
const PART_MAX_BYTES = 400 * 1024 // Storage caps one value at 512 KB
const FLUSH_COOLDOWN_MS = 60_000
const LOAD_RETRY_MS = 5_000

// acked, not yet in Storage
const pending = new Map<string, string>()
// acked this session: a resend is re-acked, not re-added
const seen = new Set<string>()

let currentPart = 0 // 0 = not loaded yet: responses are not accepted
let flushing = false
let lastFlushAt = 0
let playerCount = 0
let sceneVersion = ''

let heartbeatEntity: Entity

let intro: IntroSpec | null = null

export async function startServer(introSpec: IntroSpec | null): Promise<void> {
  intro = introSpec
  heartbeatEntity = engine.addEntity()
  ServerHeartbeat.create(heartbeatEntity, { beatAt: Date.now() })
  syncEntity(heartbeatEntity, [ServerHeartbeat.componentId])
  engine.addSystem(heartbeatSystem)
  engine.addSystem(flushSystem)

  room.onMessage('feedbackSubmit', (data, context) => {
    if (context) receiveResponse(data, context.from)
  })

  // Not awaited: readiness must never hang on a runtime call that isn't Storage.
  void readSceneVersion().then((version) => (sceneVersion = version))
  await loadCurrentPart()
  console.log(`[SERVER] Feedback server ready at +${sinceLoad()}, writing ${partKey(currentPart)}, ${countPlayers()} player(s)`)
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
  if (data.questionId === INTRO_ID) return receiveIntroAnswer(id, data, from, ack)
  const question = findQuestion(data.questionId)
  if (!question) return ack(false)

  const rating = Number.isInteger(data.rating) && data.rating >= 1 && data.rating <= MAX_RATING ? data.rating : null
  const commentShown = data.commentShown && question.commentPrompt !== undefined
  const comment = commentShown ? data.comment.trim().slice(0, MAX_COMMENT_LENGTH) : ''
  const address = from.toLowerCase()
  const row: CsvRow = {
    id,
    serverTs: Date.now(),
    version: sceneVersion,
    questionId: question.id,
    questionText: question.text,
    trigger: data.trigger.slice(0, 40),
    rating,
    ratingLabel: rating !== null ? scaleLabels(question.scale)[rating - 1] : comment === '' ? SKIPPED_LABEL : '',
    scale: scaleName(question.scale),
    commentPrompt: commentShown ? question.commentPrompt ?? '' : '',
    comment,
    secondsInScene: Math.max(0, data.secondsInScene),
    playersInScene: countPlayers(),
    address,
    isGuest: findIsGuest(address),
    platform: data.platform
  }

  seen.add(id)
  pending.set(id, formatRow(row))
  console.log(`[SERVER] ${question.id} rating=${rating ?? '-'} from ${address}, ${pending.size} pending`)
  ack(true)
}

function receiveIntroAnswer(
  id: string,
  data: { trigger: string; rating: number; secondsInScene: number; platform: string },
  from: string,
  ack: (ok: boolean) => void
): void {
  const address = from.toLowerCase()
  const answer = INTRO_ANSWERS[data.rating]
  if (!Number.isInteger(data.rating) || answer === undefined) return ack(false)
  const row: CsvRow = {
    id,
    serverTs: Date.now(),
    version: sceneVersion,
    questionId: INTRO_ID,
    questionText: intro?.title ?? '',
    trigger: data.trigger.slice(0, 40),
    rating: null,
    ratingLabel: answer,
    scale: '',
    commentPrompt: '',
    comment: '',
    secondsInScene: Math.max(0, data.secondsInScene),
    playersInScene: countPlayers(),
    address,
    isGuest: findIsGuest(address),
    platform: data.platform
  }
  seen.add(id)
  pending.set(id, formatRow(row))
  console.log(`[SERVER] intro ${row.ratingLabel} from ${address}, ${pending.size} pending`)
  ack(true)
}

// Re-read and merge by id right before writing: after a redeploy two instances overlap briefly.
async function flush(): Promise<void> {
  if (flushing || pending.size === 0) return
  flushing = true
  lastFlushAt = Date.now()
  const batch = [...pending.entries()]
  try {
    const storedPart = (await Storage.get<number>(CURRENT_PART_KEY, { fresh: true })) ?? 1
    currentPart = Math.max(currentPart, storedPart)

    let csv = (await Storage.get<string>(partKey(currentPart), { fresh: true })) ?? CSV_HEADER
    const rows = batch.filter(([id]) => !hasRow(csv, id)).map(([, row]) => row)
    const appended = rows.length > 0 ? `${csv}\n${rows.join('\n')}` : csv

    // never append to a part with other columns (older code)
    const otherColumns = csv.split('\n', 1)[0] !== CSV_HEADER
    const full = utf8Length(appended) > PART_MAX_BYTES && csv !== CSV_HEADER
    if (rows.length > 0 && (otherColumns || full)) {
      currentPart += 1
      csv = `${CSV_HEADER}\n${rows.join('\n')}`
      if (!(await Storage.set(CURRENT_PART_KEY, currentPart))) throw new Error('could not advance the part index')
      console.log(`[SERVER] ${otherColumns ? 'Columns changed' : 'Part full'}, rolled over to ${partKey(currentPart)}`)
    } else {
      csv = appended
    }

    if (!(await Storage.set(partKey(currentPart), csv))) throw new Error('Storage.set returned false')
    for (const [id] of batch) pending.delete(id)
    console.log(`[SERVER] Flushed ${rows.length} row(s) to ${partKey(currentPart)} (${utf8Length(csv)} B)`)
  } catch (e) {
    // rows stay pending for the next cooldown
    console.log('[SERVER] Flush failed:', e)
  } finally {
    flushing = false
  }
}

function flushSystem(): void {
  if (currentPart === 0) return

  const count = countPlayers()
  const lastPlayerLeft = playerCount > 0 && count === 0
  playerCount = count

  if (pending.size === 0) return
  if (lastPlayerLeft || Date.now() - lastFlushAt >= FLUSH_COOLDOWN_MS) void flush()
}

function countPlayers(): number {
  let count = 0
  for (const _ of engine.getEntitiesWith(PlayerIdentityData)) count++
  return count
}

function partKey(index: number): string {
  return `playtest-feedback-${index}.csv`
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
