import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { getPlatform, isMobile } from '@dcl/sdk/platform'
import { getRealm } from '~system/Runtime'
import { room } from '../shared/messages'
import {
  HEARTBEAT_FRESHNESS_MS,
  INTRO_ANSWERS,
  INTRO_ID,
  IntroAnswer,
  IntroSpec,
  MAX_COMMENT_LENGTH,
  Question,
  findQuestion
} from '../shared/series'
import { ServerHeartbeat } from '../shared/schemas'
import { sinceLoad } from '../shared/clock'
import { findSceneOwner } from './owner'

// Alive = heartbeat value changed recently on the client clock. A stale CRDT snapshot from
// an earlier server run never advances.
let lastBeatValue = 0
let lastBeatSeenAt = 0

function pollHeartbeat(): void {
  for (const [, hb] of engine.getEntitiesWith(ServerHeartbeat)) {
    if (hb.beatAt !== lastBeatValue) {
      // first value seen may be a stale snapshot: alive from the first change
      if (lastBeatValue === 0) {
        lastBeatValue = hb.beatAt
        break
      }
      if (lastBeatSeenAt === 0) console.log(`[FEEDBACK] first server heartbeat at +${sinceLoad()}`)
      lastBeatValue = hb.beatAt
      lastBeatSeenAt = Date.now()
    }
    break
  }
}

export function isServerAlive(): boolean {
  if (!isStateSyncronized()) return false
  if (lastBeatSeenAt === 0) return false
  return Date.now() - lastBeatSeenAt < HEARTBEAT_FRESHNESS_MS
}

// not-shown: already asked at this trigger this visit, server never came up, or Group closed before it
export type AskResult = 'submitted' | 'skipped' | 'not-shown'

export type AskOptions = {
  repeat?: boolean
  comment?: boolean | readonly string[]
  // game (default): Intro once per visit. player (leaveFeedback): Intro every time, a greeting only:
  // yes opens the Group, no drops it, participation untouched. debug: no Intro, participation untouched.
  source?: AskSource
}

export type AskSource = 'game' | 'player' | 'debug'

// one ask() call
type Ask = {
  // slot: index in ask()'s ids. answer: kept by Next/Back until sent.
  steps: {
    question: Question
    slot: number
    comment: boolean
    answer?: { rating: number; comment: string }
  }[]
  // furthest step shown: steps up to it get a Response, the rest not-shown
  reached: number
  trigger: string
  source: AskSource
  // intro: the Intro alone (showIntro()), no steps. results[0]: submitted = accepted, skipped = declined.
  kind: 'group' | 'intro'
  // Intro answered yes for this Group (leaveFeedback shows it first)
  introDone: boolean
  // one per id passed to ask(), same order
  results: AskResult[]
  resolve: (results: AskResult[]) => void
  askedAt: number
}

const queue: Ask[] = []
let current: Ask | undefined
let step = 0
// "id|trigger" shown this visit
const shown = new Set<string>()
// a queued Group gives up if the server stays down this long
const SERVER_WAIT_MS = 120_000

export function askQuestions(questionIds: readonly string[], trigger: string, options: AskOptions = {}): Promise<AskResult[]> {
  const results: AskResult[] = questionIds.map(() => 'not-shown')
  const steps: Ask['steps'] = []
  const source = options.source ?? 'game'
  // while an Intro is pending, Questions queue behind it instead of being dropped
  if (source === 'game') {
    const out = participation === 'out'
    const notYet = participation === 'unknown' && participantsOnly && !introPending()
    if (out || notYet) {
      const why = out ? 'player said no to the Intro' : 'not a participant: feedback.intro() or feedback.enroll() first'
      console.log(`[FEEDBACK] ${why}, not showing ${questionIds.join(', ')}`)
      return Promise.resolve(results)
    }
  }
  if (source === 'player' && (current?.source === 'player' || queue.some((a) => a.source === 'player'))) {
    console.log('[FEEDBACK] leaveFeedback() already open or waiting, ignored')
    return Promise.resolve(results)
  }
  questionIds.forEach((id, slot) => {
    const question = findQuestion(id)
    if (!question) return console.log(`[FEEDBACK] unknown question ${id}`)
    if (!options.repeat && isTaken(question.id, trigger)) return
    if (steps.some((s) => s.question.id === question.id)) return
    steps.push({ question, slot, comment: commentAllowed(question, options.comment) })
  })
  if (steps.length === 0) return Promise.resolve(results)

  return new Promise((resolve) => {
    const ask: Ask = { kind: 'group', steps, reached: 0, trigger, source, introDone: false, results, resolve, askedAt: Date.now() }
    if (source !== 'player') {
      queue.push(ask)
      return
    }
    // the player asked: whatever the game has on screen closes, a game Intro comes back after
    if (feedback.phase === 'open') closeGroup()
    if (feedback.phase === 'intro') feedback.phase = 'idle'
    queue.unshift(ask)
  })
}

function commentAllowed(question: Question, comment: AskOptions['comment'] = true): boolean {
  if (question.commentPrompt === undefined) return false
  return typeof comment === 'boolean' ? comment : comment.includes(question.id)
}

function isTaken(questionId: string, trigger: string): boolean {
  const same = (a: Ask) => a.trigger === trigger && a.steps.some((s) => s.question.id === questionId)
  return shown.has(`${questionId}|${trigger}`) || (current !== undefined && same(current)) || queue.some(same)
}

function processQueue(): void {
  const alive = isServerAlive()
  // An Intro alone shows without the server, its answer waits in the outbox. One with Questions
  // behind it waits for the server with them, so Give feedback leads straight into the first.
  if (!alive && feedback.phase === 'idle' && queue[0]?.kind === 'intro' && queue.length === 1) {
    feedback.phase = 'intro'
    return
  }
  if (!alive) {
    for (let i = queue.length - 1; i >= 0; i--) {
      // the Intro on screen stays until answered
      if (i === 0 && feedback.phase === 'intro') continue
      if (Date.now() - queue[i].askedAt < SERVER_WAIT_MS) continue
      const ids = queue[i].steps.map((s) => s.question.id).join(', ')
      console.log(`[FEEDBACK] server not up after ${SERVER_WAIT_MS / 1000} s, not showing ${ids}`)
      const [expired] = queue.splice(i, 1)
      expired.resolve(expired.results)
    }
    return
  }
  if (feedback.phase !== 'idle' || queue.length === 0) return

  if (needsIntro(queue[0])) {
    feedback.phase = 'intro'
    return
  }
  if (queue[0].kind === 'intro') return
  current = queue.shift()!
  showStep(0)
}

// Gates the game's ask() this visit. in: yes to the Intro, or enroll(). out: no to the Intro.
export type Participation = 'unknown' | 'in' | 'out'
let participation: Participation = 'unknown'
let participantsOnly = true

export function getParticipation(): Participation {
  return participation
}

// Own CSV row (enrolled), to tell these players from Intro yeses. Drops an unanswered game Intro.
export function enroll(trigger: string): void {
  if (participation === 'in') return console.log('[FEEDBACK] already a participant, enroll ignored')
  console.log(`[FEEDBACK] player enrolled (${trigger})`)
  participation = 'in'
  sendIntroAnswer('enrolled', trigger)
  const index = queue.findIndex((a) => a.kind === 'intro' && a.source === 'game')
  if (index === -1) return
  const [dropped] = queue.splice(index, 1)
  if (index === 0 && feedback.phase === 'intro') feedback.phase = 'idle'
  dropped.resolve(dropped.results)
  processQueue()
}

let intro: IntroSpec | null = null

export function introSpec(): IntroSpec | null {
  return intro
}

// INTRO.avatar, else the scene owner's wallet once found (null until then, or if none)
let sceneOwner: string | null = null
export function introAvatar(): string | null {
  if (!intro) return null
  return intro.avatar === undefined ? sceneOwner : intro.avatar
}

export type IntroResult = 'accepted' | 'declined' | 'not-shown'

export function showIntro(trigger: string, source: AskSource = 'game'): Promise<IntroResult> {
  const pending = (a: Ask) => a.kind === 'intro'
  // debug shows it even when participation is known
  if (!intro || queue.some(pending) || (source !== 'debug' && participation !== 'unknown')) {
    return Promise.resolve('not-shown')
  }
  return new Promise<AskResult[]>((resolve) =>
    queue.push({ kind: 'intro', steps: [], reached: 0, trigger, source, introDone: false, results: ['not-shown'], resolve, askedAt: Date.now() })
  ).then(([r]) => (r === 'submitted' ? 'accepted' : r === 'skipped' ? 'declined' : 'not-shown'))
}

// a shown Intro stays in the queue until answered; Leave feedback's Intro doesn't count
function introPending(): boolean {
  return queue.some((a) => a.kind === 'intro')
}

// set at module load, so intro() and enroll() work from main()
export function configure(introSpec: IntroSpec | null, onlyParticipants: boolean, previewMobile: boolean): void {
  intro = introSpec
  participantsOnly = onlyParticipants
  if (!intro && onlyParticipants)
    console.log('[FEEDBACK] INTRO is null and ASK_PARTICIPANTS_ONLY is true: ask() shows nothing until feedback.enroll()')
  previewMobileWanted = previewMobile
}

// PREVIEW_MOBILE applies once the realm is known to be a local preview
let previewMobileWanted = false
let previewMobile = false

// Mobile layout: rating only, own panel, 1600x720 virtual screen. false until the explorer reports the platform.
export function isMobileLayout(): boolean {
  return previewMobile || isMobile()
}

function needsIntro(ask: Ask): boolean {
  if (ask.kind === 'intro') return true
  return intro !== null && ask.source === 'player' && !ask.introDone
}

export function acceptIntro(): void {
  if (feedback.phase !== 'intro') return
  console.log('[FEEDBACK] intro accepted')
  sendIntroAnswer('accepted', queue[0]?.trigger ?? '')
  const ask = queue[0]
  // Leave feedback's Intro only greets: participation is the game Intro's
  if (ask?.kind === 'intro' && ask.source === 'game') participation = 'in'
  feedback.phase = 'idle'
  if (ask?.kind === 'intro') {
    queue.shift()
    ask.results[0] = 'submitted'
    ask.resolve(ask.results)
  } else if (ask) {
    ask.introDone = true
  }
  processQueue()
}

export function declineIntro(): void {
  if (feedback.phase !== 'intro') return
  console.log('[FEEDBACK] intro declined')
  sendIntroAnswer('declined', queue[0]?.trigger ?? '')
  feedback.phase = 'idle'
  // from Leave feedback: drop only this Group, the game's Questions are unaffected
  if (queue[0]?.kind === 'group' && queue[0].source === 'player') {
    const [dropped] = queue.splice(0, 1)
    return dropped.resolve(dropped.results)
  }
  const [answered] = queue.splice(0, 1)
  if (!answered) return
  answered.results[0] = 'skipped'
  answered.resolve(answered.results)
  if (answered.source === 'debug') return
  participation = 'out'
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].source !== 'game') continue
    const [dropped] = queue.splice(i, 1)
    dropped.resolve(dropped.results)
  }
}

function showStep(index: number): void {
  if (!current) return
  step = index
  current.reached = Math.max(current.reached, index)
  // mobile: rating only, the phone keyboard would cover the panel. Checked here: at ask() the platform may be unknown.
  if (isMobileLayout()) current.steps[index].comment = false
  const { question, comment, answer } = current.steps[index]
  shown.add(`${question.id}|${current.trigger}`)
  feedback.phase = 'open'
  feedback.question = question
  feedback.trigger = current.trigger
  feedback.withComment = comment
  feedback.step = index + 1
  feedback.steps = current.steps.length
  feedback.rating = answer?.rating ?? 0
  feedback.comment = answer?.comment ?? ''
}

// idle → [intro →] open ⇄ (Next / Back) → idle
export type Phase = 'idle' | 'intro' | 'open'

const RESEND_MS = 3000
const GIVE_UP_MS = 30000
// "Thanks" toast after Submit: fades in, holds, fades out
const TOAST_FADE_IN_MS = 200
const TOAST_HOLD_MS = 2000
const TOAST_FADE_OUT_MS = 300

export const feedback = {
  phase: 'idle' as Phase,
  question: undefined as Question | undefined,
  trigger: '',
  withComment: true,
  // 1-based, "step/steps" in the progress bar
  step: 1,
  steps: 1,
  rating: 0, // 0 = no rating
  comment: ''
}

let toastAt = 0
const enteredAt = Date.now()

export function setRating(value: number): void {
  // tapping the selected rating again clears it
  feedback.rating = feedback.rating === value ? 0 : value
}

export function setComment(value: string): void {
  feedback.comment = value.slice(0, MAX_COMMENT_LENGTH)
}

// a rating or a comment, either counts
function hasAnswer(): boolean {
  return feedback.rating !== 0 || (feedback.withComment && feedback.comment.trim() !== '')
}

export function isFirstStep(): boolean {
  return feedback.step <= 1
}

export function isLastStep(): boolean {
  return feedback.step >= feedback.steps
}

// "Completed" replaces the bar: last step answered, only Submit left
export function isCompleted(): boolean {
  return feedback.steps > 1 && isLastStep() && hasAnswer()
}

function keepAnswer(): void {
  if (!current) return
  current.steps[step].answer = hasAnswer() ? { rating: feedback.rating, comment: feedback.comment } : undefined
}

// unanswered: the Question counts as skipped
export function nextStep(): void {
  if (!current || feedback.phase !== 'open' || isLastStep()) return
  keepAnswer()
  showStep(step + 1)
}

export function previousStep(): void {
  if (!current || feedback.phase !== 'open' || isFirstStep()) return
  keepAnswer()
  showStep(step - 1)
}

// One Response per reached step, sent in the background: the panel closes at once.
// Nothing answered: closes like ×, no "Thanks".
export function submitGroup(): void {
  if (!current || feedback.phase !== 'open' || !isLastStep()) return
  keepAnswer()
  if (current.steps.some((s) => s.answer)) showToast()
  sendGroup(current)
  finishGroup()
}

export function showToast(): void {
  toastAt = Date.now()
}

// × and Skip: answers kept with Next are sent, the step on screen counts as skipped (unkept entry dropped),
// unreached steps get no Response.
export function closeGroup(): void {
  if (!current || feedback.phase !== 'open') return
  current.steps[step].answer = undefined
  sendGroup(current)
  finishGroup()
}

// "Thanks" toast: 0 → 1 → 0, null when gone
export function toastOpacity(): number | null {
  const t = Date.now() - toastAt
  const fadeOutAt = TOAST_FADE_IN_MS + TOAST_HOLD_MS
  if (toastAt === 0 || t > fadeOutAt + TOAST_FADE_OUT_MS) return null
  if (t < TOAST_FADE_IN_MS) return t / TOAST_FADE_IN_MS
  return t <= fadeOutAt ? 1 : 1 - (t - fadeOutAt) / TOAST_FADE_OUT_MS
}

function finishGroup(): void {
  if (!current) return
  const done = current
  // the whole Group, reached or not: closing it is an answer to all of it
  for (const s of done.steps) shown.add(`${s.question.id}|${done.trigger}`)
  done.steps.forEach((s, i) => {
    if (i <= done.reached) done.results[s.slot] = s.answer ? 'submitted' : 'skipped'
  })
  feedback.phase = 'idle'
  feedback.question = undefined
  current = undefined
  done.resolve(done.results)
}

// Each Response stays in the outbox until acked: resent every RESEND_MS while the server is up,
// dropped after GIVE_UP_MS.
type Payload = {
  requestId: string
  questionId: string
  trigger: string
  rating: number
  comment: string
  commentShown: boolean
  secondsInScene: number
  platform: string
}
type OutboxRow = { payload: Payload; firstSentAt: number; lastSentAt: number }
const outbox = new Map<string, OutboxRow>()

function sendGroup(ask: Ask): void {
  ask.steps.forEach((s, i) => {
    if (i > ask.reached) return
    const id = newRequestId()
    const answer = s.answer
    const row: OutboxRow = {
      payload: {
        requestId: id,
        questionId: s.question.id,
        trigger: ask.trigger,
        rating: answer?.rating ?? 0,
        comment: s.comment ? (answer?.comment ?? '') : '',
        commentShown: s.comment,
        secondsInScene: Math.round((Date.now() - enteredAt) / 1000),
        platform: getPlatform() ?? 'unknown'
      },
      firstSentAt: Date.now(),
      lastSentAt: 0
    }
    outbox.set(id, row)
    transmit(id, row, 'send')
  })
}

// Own CSV row, to count who agrees to answer. rating = index in INTRO_ANSWERS, the server writes it as ratingLabel.
function sendIntroAnswer(answer: IntroAnswer, trigger: string): void {
  const id = newRequestId()
  const row: OutboxRow = {
    payload: {
      requestId: id,
      questionId: INTRO_ID,
      trigger,
      rating: INTRO_ANSWERS.indexOf(answer),
      comment: '',
      commentShown: false,
      secondsInScene: Math.round((Date.now() - enteredAt) / 1000),
      platform: getPlatform() ?? 'unknown'
    },
    firstSentAt: Date.now(),
    lastSentAt: 0
  }
  outbox.set(id, row)
  transmit(id, row, 'send')
}

function transmit(id: string, row: OutboxRow, kind: 'send' | 'resend'): void {
  console.log(`[FEEDBACK] ${kind} ${id} ${row.payload.questionId}`)
  row.lastSentAt = Date.now()
  void room.send('feedbackSubmit', row.payload)
}

function newRequestId(): string {
  // ~12 chars, e.g. "mfqz8k2x4f7a": unique enough to dedupe resends and merge rows
  return Date.now().toString(36) + Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')
}

export function setupFeedbackState(): void {
  if (intro && intro.avatar === undefined) void findSceneOwner().then((owner) => (sceneOwner = owner))
  if (previewMobileWanted)
    void getRealm({}).then(({ realmInfo }) => {
      previewMobile = realmInfo?.isPreview === true
      console.log(`[FEEDBACK] PREVIEW_MOBILE ${previewMobile ? 'on' : 'ignored: not a local preview'}`)
    })
  room.onMessage('feedbackSaved', (data) => {
    console.log(`[FEEDBACK] ack ${data.requestId} ok=${data.ok}`)
    outbox.delete(data.requestId)
  })

  engine.addSystem(() => {
    pollHeartbeat()
    const now = Date.now()
    const alive = isServerAlive()
    for (const [id, row] of outbox) {
      // give-up clock runs only while the server is up, for example an Intro answered during a cold start
      if (!alive) row.firstSentAt = now
      if (now - row.firstSentAt > GIVE_UP_MS) {
        console.log(`[FEEDBACK] no ack for ${id} after ${GIVE_UP_MS / 1000} s, giving up`)
        outbox.delete(id)
      } else if (now - row.lastSentAt > RESEND_MS && alive) {
        transmit(id, row, 'resend')
      }
    }
    processQueue()
  })
}
