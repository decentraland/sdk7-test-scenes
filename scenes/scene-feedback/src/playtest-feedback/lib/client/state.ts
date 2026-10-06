import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { getPlatform } from '@dcl/sdk/platform'
import { room } from '../shared/messages'
import {
  HEARTBEAT_FRESHNESS_MS,
  INTRO_ID,
  IntroSpec,
  MAX_COMMENT_LENGTH,
  NOT_EXPERIENCED,
  Question,
  findQuestion
} from '../shared/series'
import { ServerHeartbeat } from '../shared/schemas'
import { sinceLoad } from '../shared/clock'
import { findSceneOwner } from './owner'

// --- Server liveness -------------------------------------------------------------
// Track when the heartbeat value last *changed* on the client clock: a stale CRDT
// snapshot from a previous server run never advances, so it can't read as alive.
let lastBeatValue = 0
let lastBeatSeenAt = 0

function pollHeartbeat(): void {
  for (const [, hb] of engine.getEntitiesWith(ServerHeartbeat)) {
    if (hb.beatAt !== lastBeatValue) {
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

// --- Asking ------------------------------------------------------------------------
// 'not-shown': asked before at this Trigger this visit, the server never came up, or
// the player closed the Group before reaching this Question.
export type AskResult = 'submitted' | 'skipped' | 'failed' | 'not-shown'

export type AskOptions = {
  // Show again even if the player already saw this Question at this Trigger.
  repeat?: boolean
  // Which Questions of this call show the comment field: true (default) all, false none,
  // or a list of ids — only those. It can only hide the field: a Question without
  // commentPrompt never shows one.
  comment?: boolean | readonly string[]
  // Who asked. 'game' (default): the Intro once per visit. 'player' (leaveFeedback()):
  // the Intro every time; a yes to it counts for the rest of the visit, a no only drops
  // this Group. 'debug': no Intro, the player's answer to it is left alone.
  source?: AskSource
}

export type AskSource = 'game' | 'player' | 'debug'

// leaveFeedback() asks everything, out of context: the player may not have met what a
// Question is about, so it offers "I didn't experience this". The game asks in context.
function offersNotExperienced(source: AskSource): boolean {
  return source === 'player'
}

// One ask() call: a Group of Questions shown one after another in one panel.
type Ask = {
  // The Questions to show, each with its position in the ids passed to ask().
  // comment: whether this step shows the comment field. answer: kept by Next/Back
  // until the Group is sent. requestId: set when the step's Response is sent.
  steps: {
    question: Question
    slot: number
    comment: boolean
    answer?: { rating: number; comment: string }
    requestId?: string
  }[]
  // The furthest step shown: steps up to it get a Response, the rest are not-shown.
  reached: number
  trigger: string
  source: AskSource
  // 'intro': the Intro on its own (showIntro()), no steps; its outcome is results[0]:
  // submitted = accepted, skipped = declined.
  kind: 'group' | 'intro'
  // The Intro was answered yes for this Group (leaveFeedback() shows it first).
  introDone: boolean
  // One per id passed to ask(), in the same order; 'not-shown' until answered.
  results: AskResult[]
  resolve: (results: AskResult[]) => void
  askedAt: number
}

// Groups wait here while another one is open or the server is still waking up.
const queue: Ask[] = []
// The Group on screen now, and the index of its step on screen.
let current: Ask | undefined
let step = 0
// "id|trigger" of every Question shown this visit.
const shown = new Set<string>()
// A queued Group gives up if the server stays down this long.
const SERVER_WAIT_MS = 120_000

// trigger labels the moment the Questions were asked, e.g. 'after-first-round',
// so answers given at different moments can be told apart. Questions already shown
// (or waiting) at this trigger are dropped from the Group unless options.repeat.
export function askQuestions(questionIds: readonly string[], trigger: string, options: AskOptions = {}): Promise<AskResult[]> {
  const results: AskResult[] = questionIds.map(() => 'not-shown')
  const steps: Ask['steps'] = []
  const source = options.source ?? 'game'
  // Dynamic (the game's ask()): never after a no; with participantsOnly, only for
  // participants. While the Intro is waiting or on screen, the Questions wait behind it.
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

  return new Promise((resolve) =>
    queue.push({ kind: 'group', steps, reached: 0, trigger, source, introDone: false, results, resolve, askedAt: Date.now() })
  )
}

function commentAllowed(question: Question, comment: AskOptions['comment'] = true): boolean {
  if (question.commentPrompt === undefined) return false
  return typeof comment === 'boolean' ? comment : comment.includes(question.id)
}

// Shown this visit, on screen now, or waiting in the queue, at this trigger.
function isTaken(questionId: string, trigger: string): boolean {
  const same = (a: Ask) => a.trigger === trigger && a.steps.some((s) => s.question.id === questionId)
  return shown.has(`${questionId}|${trigger}`) || (current !== undefined && same(current)) || queue.some(same)
}

// Opens the next queued Group once nothing is on screen and the server is up.
function processQueue(): void {
  const alive = isServerAlive()
  // The Intro needs no server to show: straight in the player's face on arrival. Its
  // answer waits in the outbox until the server is up.
  if (!alive && feedback.phase === 'idle' && queue[0]?.kind === 'intro') {
    feedback.phase = 'intro'
    return
  }
  if (!alive) {
    for (let i = queue.length - 1; i >= 0; i--) {
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
  if (current.source === 'player' && participation === 'unknown') participation = 'in'
  showStep(0)
}

// --- Participation ------------------------------------------------------------------
// Whether this player takes part in the playtest this visit, which gates the game's
// ask(). 'in': a yes to the Intro, or feedback.enroll() (e.g. players picked by the
// creator, no Intro). 'out': a no to the Intro. With participantsOnly, ask() shows
// Questions only to 'in'; without it, to everyone but 'out'.
export type Participation = 'unknown' | 'in' | 'out'
let participation: Participation = 'unknown'
let participantsOnly = true

export function getParticipation(): Participation {
  return participation
}

export function enroll(): void {
  console.log('[FEEDBACK] player enrolled')
  participation = 'in'
}

// --- The Intro ---------------------------------------------------------------------
// Shown when the scene calls showIntro(), once per visit, queued like a Group: its
// answer sets the participation. Until it is answered, the game's Questions wait behind
// it. leaveFeedback() shows it before its own Group, every time, whatever the
// participation.
let intro: IntroSpec | null = null

export function introSpec(): IntroSpec | null {
  return intro
}

// The picture in the Intro's circle: INTRO.avatar, or by default the scene owner's
// wallet once found (null until then, or if there is none).
let sceneOwner: string | null = null
export function introAvatar(): string | null {
  if (!intro) return null
  return intro.avatar === undefined ? sceneOwner : intro.avatar
}

export type IntroResult = 'accepted' | 'declined' | 'not-shown'

export function showIntro(trigger: string, source: AskSource = 'game'): Promise<IntroResult> {
  const pending = (a: Ask) => a.kind === 'intro'
  // Participation already known, already waiting, or no INTRO. Debug shows it regardless.
  if (!intro || queue.some(pending) || (source !== 'debug' && participation !== 'unknown')) {
    return Promise.resolve('not-shown')
  }
  return new Promise<AskResult[]>((resolve) =>
    queue.push({ kind: 'intro', steps: [], reached: 0, trigger, source, introDone: false, results: ['not-shown'], resolve, askedAt: Date.now() })
  ).then(([r]) => (r === 'submitted' ? 'accepted' : r === 'skipped' ? 'declined' : 'not-shown'))
}

function introPending(): boolean {
  return feedback.phase === 'intro' || queue.some((a) => a.kind === 'intro')
}

// Set at module load, so feedback.intro() and enroll() work from main().
export function configure(introSpec: IntroSpec | null, onlyParticipants: boolean): void {
  intro = introSpec
  participantsOnly = onlyParticipants
}

function needsIntro(ask: Ask): boolean {
  if (ask.kind === 'intro') return true
  return intro !== null && ask.source === 'player' && !ask.introDone
}

export function acceptIntro(): void {
  if (feedback.phase !== 'intro') return
  console.log('[FEEDBACK] intro accepted')
  sendIntroAnswer(true)
  participation = 'in'
  feedback.phase = 'idle'
  const ask = queue[0]
  if (ask?.kind === 'intro') {
    queue.shift()
    ask.results[0] = 'submitted'
    ask.resolve(ask.results)
    // A Leave feedback press made while this Intro was up: just answered, don't ask again.
    for (const waiting of queue) if (waiting.source === 'player') waiting.introDone = true
  } else if (ask) {
    ask.introDone = true
  }
  processQueue()
}

export function declineIntro(): void {
  if (feedback.phase !== 'intro') return
  console.log('[FEEDBACK] intro declined')
  sendIntroAnswer(false)
  feedback.phase = 'idle'
  // From Leave feedback: only this Group is dropped, the game's Questions are not affected.
  if (queue[0]?.kind === 'group' && queue[0].source === 'player') {
    const [dropped] = queue.splice(0, 1)
    return dropped.resolve(dropped.results)
  }
  const [answered] = queue.splice(0, 1)
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
  const { question, comment, answer } = current.steps[index]
  shown.add(`${question.id}|${current.trigger}`)
  feedback.phase = 'open'
  feedback.question = question
  feedback.trigger = current.trigger
  feedback.withComment = comment
  feedback.offerNotExperienced = offersNotExperienced(current.source)
  feedback.step = index + 1
  feedback.steps = current.steps.length
  feedback.rating = answer?.rating ?? 0
  feedback.comment = answer?.comment ?? ''
}

// --- The Group on screen -------------------------------------------------------------
// idle → [intro →] open ⇄ (Next / Back between steps) → sending → saved (auto-closes)
//                                                              ↘ failed (retry or close)
// Answers stay on the client until Submit on the last step, then go out together.
// Closing early (× or Skip) sends what was answered so far, in the background.
export type Phase = 'idle' | 'intro' | 'open' | 'sending' | 'saved' | 'failed'

const RESEND_MS = 3000
const GIVE_UP_MS = 30000
// After the last ack: show 'Thanks' briefly, then fade the panel out.
const SAVED_HOLD_MS = 300
const SAVED_FADE_MS = 200

export const feedback = {
  phase: 'idle' as Phase,
  question: undefined as Question | undefined,
  trigger: '',
  withComment: true,
  offerNotExperienced: false,
  // Position in the Group, 1-based: "step of steps" in the progress bar.
  step: 1,
  steps: 1,
  rating: 0, // 0 = no rating, NOT_EXPERIENCED = "I didn't experience this"
  comment: ''
}

let savedAt = 0
const enteredAt = Date.now()

export function setRating(value: number): void {
  // Tapping the selected rating (or "I didn't experience this") again clears it.
  feedback.rating = feedback.rating === value ? 0 : value
}

export function setComment(value: string): void {
  feedback.comment = value.slice(0, MAX_COMMENT_LENGTH)
}

// A rating or a comment: either one is an answer.
export function hasAnswer(): boolean {
  return feedback.rating !== 0 || (feedback.withComment && feedback.comment.trim() !== '')
}

export function isFirstStep(): boolean {
  return feedback.step <= 1
}

export function isLastStep(): boolean {
  return feedback.step >= feedback.steps
}

// The last step of a Group is answered: only Submit is left ("Completed" replaces the bar).
export function isCompleted(): boolean {
  return feedback.steps > 1 && isLastStep() && hasAnswer()
}

function keepAnswer(): void {
  if (!current) return
  current.steps[step].answer = hasAnswer() ? { rating: feedback.rating, comment: feedback.comment } : undefined
}

export function nextStep(): void {
  if (!current || feedback.phase !== 'open' || !hasAnswer() || isLastStep()) return
  keepAnswer()
  showStep(step + 1)
}

export function previousStep(): void {
  if (!current || feedback.phase !== 'open' || isFirstStep()) return
  keepAnswer()
  showStep(step - 1)
}

// Submit on the last step: every reached step goes out as one Response each.
export function submitGroup(): void {
  if (!current || feedback.phase !== 'open' || !hasAnswer() || !isLastStep()) return
  keepAnswer()
  submission.clear()
  for (const id of sendGroup(current)) submission.set(id, 'pending')
  feedback.phase = 'sending'
}

// Skip: this Question only, recorded as skipped (whatever was entered is dropped). The
// Group goes on to the next one; on the last (or only) one it closes like ×.
export function skipStep(): void {
  if (!current || feedback.phase !== 'open') return
  current.steps[step].answer = undefined
  if (isLastStep()) return closeGroup()
  showStep(step + 1)
}

// ×: the Group ends here. Answers kept with Next go out in the background,
// the step on screen is recorded as skipped (whatever was entered there is dropped
// unless it was kept before), steps never reached get no Response.
export function closeGroup(): void {
  if (!current || feedback.phase !== 'open') return
  sendGroup(current)
  finishGroup()
}

// Close after a failed save: whatever was not saved stays 'failed'.
export function giveUpGroup(): void {
  if (!current || feedback.phase !== 'failed') return
  for (const [id, state] of submission) if (state !== 'acked') outbox.delete(id)
  finishGroup()
}

export function retryGroup(): void {
  if (feedback.phase !== 'failed') return
  for (const [id, state] of submission) {
    const row = outbox.get(id)
    if (state === 'failed' && row) {
      submission.set(id, 'pending')
      row.firstSentAt = Date.now()
      transmit(id, row, 'resend')
    }
  }
  feedback.phase = 'sending'
}

// 1 while the panel is interactive; drops to 0 during the post-ack fade.
export function panelOpacity(): number {
  if (feedback.phase !== 'saved') return 1
  const fading = Date.now() - savedAt - SAVED_HOLD_MS
  return fading <= 0 ? 1 : Math.max(0, 1 - fading / SAVED_FADE_MS)
}

// Resolves the Group's Promise: reached steps are submitted or skipped (failed if their
// save failed), the rest not-shown.
function finishGroup(): void {
  if (!current) return
  const done = current
  done.steps.forEach((s, i) => {
    if (i > done.reached) return
    const failed = s.requestId !== undefined && submission.get(s.requestId) === 'failed'
    done.results[s.slot] = failed ? 'failed' : s.answer ? 'submitted' : 'skipped'
  })
  submission.clear()
  feedback.phase = 'idle'
  feedback.question = undefined
  current = undefined
  done.resolve(done.results)
}

// --- Sending ---------------------------------------------------------------------------
// Every Response sits in the outbox until the server acks it; unacked ones are resent
// every RESEND_MS while the server is up, and dropped after GIVE_UP_MS.
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
// The Responses of the Submit on screen, by requestId.
const submission = new Map<string, 'pending' | 'acked' | 'failed'>()

// One Response per reached step; returns their requestIds.
function sendGroup(ask: Ask): string[] {
  const ids: string[] = []
  ask.steps.forEach((s, i) => {
    if (i > ask.reached) return
    const id = newRequestId()
    s.requestId = id
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
    ids.push(id)
  })
  return ids
}

// The Intro's answer gets its own CSV row, so the share of players who agree to answer
// can be counted. Sent in the background like a closed Group. rating carries the answer
// (1 accepted, 0 declined); the server writes it as ratingLabel.
function sendIntroAnswer(accepted: boolean): void {
  const id = newRequestId()
  const row: OutboxRow = {
    payload: {
      requestId: id,
      questionId: INTRO_ID,
      trigger: queue[0]?.trigger ?? '',
      rating: accepted ? 1 : 0,
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
  // ~12 chars, e.g. "mfqz8k2x4f7a": unique enough to dedupe resends and merge rows.
  return Date.now().toString(36) + Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')
}

function updateSubmission(): void {
  if (feedback.phase !== 'sending') return
  const states = [...submission.values()]
  if (states.every((s) => s === 'acked')) {
    feedback.phase = 'saved'
    savedAt = Date.now()
  } else if (!states.includes('pending')) {
    feedback.phase = 'failed'
  }
}

export function setupFeedbackState(): void {
  if (intro && intro.avatar === undefined) void findSceneOwner().then((owner) => (sceneOwner = owner))
  room.onMessage('feedbackSaved', (data) => {
    console.log(`[FEEDBACK] ack ${data.requestId} ok=${data.ok}`)
    if (!outbox.delete(data.requestId)) return
    if (submission.has(data.requestId)) submission.set(data.requestId, data.ok ? 'acked' : 'failed')
    updateSubmission()
  })

  engine.addSystem(() => {
    pollHeartbeat()
    const now = Date.now()
    const alive = isServerAlive()
    for (const [id, row] of outbox) {
      // The give-up clock runs only while the server is up (e.g. an Intro answered
      // before a cold start finished).
      if (!alive) row.firstSentAt = now
      const state = submission.get(id)
      // Failed and waiting for Try again.
      if (state === 'failed') continue
      if (now - row.firstSentAt > GIVE_UP_MS) {
        console.log(`[FEEDBACK] no ack for ${id} after ${GIVE_UP_MS / 1000} s, giving up`)
        // Kept for a retry while its Submit is on screen; background ones are dropped.
        if (state === 'pending') submission.set(id, 'failed')
        else outbox.delete(id)
      } else if (now - row.lastSentAt > RESEND_MS && alive) {
        transmit(id, row, 'resend')
      }
    }
    updateSubmission()
    if (feedback.phase === 'saved' && now - savedAt > SAVED_HOLD_MS + SAVED_FADE_MS) finishGroup()
    processQueue()
  })
}
