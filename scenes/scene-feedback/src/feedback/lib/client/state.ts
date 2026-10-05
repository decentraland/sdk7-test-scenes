import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { getPlatform } from '@dcl/sdk/platform'
import { room } from '../shared/messages'
import { HEARTBEAT_FRESHNESS_MS, IntroSpec, MAX_COMMENT_LENGTH, Question, findQuestion } from '../shared/series'
import { ServerHeartbeat } from '../shared/schemas'
import { sinceLoad } from '../shared/clock'

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
  // Who asked. 'game' (default): goes through the Intro. 'player' (Leave feedback):
  // no Intro, and it counts as a yes for the rest of the visit. 'debug': no Intro,
  // the player's answer to it is left alone.
  source?: AskSource
}

export type AskSource = 'game' | 'player' | 'debug'

// One ask() call: a Group of Questions shown one after another in one panel.
type Ask = {
  // The Questions to show, each with its position in the ids passed to ask().
  // comment: whether this step shows the comment field.
  steps: { question: Question; slot: number; comment: boolean }[]
  trigger: string
  source: AskSource
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
  if (consent === 'declined' && source === 'game') {
    console.log(`[FEEDBACK] player declined feedback this visit, not showing ${questionIds.join(', ')}`)
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
    queue.push({ steps, trigger, source, results, resolve, askedAt: Date.now() })
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

  if (intro && consent === 'unknown' && queue[0].source === 'game') {
    feedback.phase = 'intro'
    return
  }
  current = queue.shift()!
  if (current.source === 'player') consent = 'given'
  showStep(0)
}

// --- The Intro ---------------------------------------------------------------------
// Once per visit, before the first Group the game asks: yes opens it, no (Skip or x)
// drops it and every later ask() this visit. Leave feedback still works after a no.
let intro: IntroSpec | null = null
let consent: 'unknown' | 'given' | 'declined' = 'unknown'

export function introSpec(): IntroSpec | null {
  return intro
}

export function acceptIntro(): void {
  if (feedback.phase !== 'intro') return
  console.log('[FEEDBACK] intro accepted')
  consent = 'given'
  feedback.phase = 'idle'
  processQueue()
}

export function declineIntro(): void {
  if (feedback.phase !== 'intro') return
  console.log('[FEEDBACK] intro declined')
  consent = 'declined'
  feedback.phase = 'idle'
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].source !== 'game') continue
    const [dropped] = queue.splice(i, 1)
    dropped.resolve(dropped.results)
  }
}

// Debug: forget the answer, so the next ask() shows the Intro again.
export function resetIntro(): void {
  consent = 'unknown'
}

function showStep(index: number): void {
  if (!current) return
  step = index
  const { question, comment } = current.steps[index]
  shown.add(`${question.id}|${current.trigger}`)
  feedback.phase = 'open'
  feedback.question = question
  feedback.trigger = current.trigger
  feedback.withComment = comment
  feedback.step = index + 1
  feedback.steps = current.steps.length
  feedback.rating = 0
  feedback.comment = ''
}

// --- The Question currently on screen ----------------------------------------------
// idle → open → sending → (next step: open) | saved (auto-closes) | failed (retry or close)
export type Phase = 'idle' | 'intro' | 'open' | 'sending' | 'saved' | 'failed'

const RESEND_MS = 3000
const GIVE_UP_MS = 30000
// After the last ack of a Group: show 'Thanks' briefly, then fade the panel out.
const SAVED_HOLD_MS = 300
const SAVED_FADE_MS = 200

export const feedback = {
  phase: 'idle' as Phase,
  question: undefined as Question | undefined,
  trigger: '',
  withComment: true,
  // Position in the Group, 1-based: "step of steps" in the progress bar.
  step: 1,
  steps: 1,
  rating: 0, // 0 = no rating
  comment: ''
}

let requestId = ''
let sentAnswer = false
let firstSentAt = 0
let lastSentAt = 0
let savedAt = 0
const enteredAt = Date.now()

export function setRating(value: number): void {
  // Tapping the selected star again clears the rating.
  feedback.rating = feedback.rating === value ? 0 : value
}

export function setComment(value: string): void {
  feedback.comment = value.slice(0, MAX_COMMENT_LENGTH)
}

export function hasAnswer(): boolean {
  return feedback.rating > 0 || feedback.comment.trim() !== ''
}

export function isLastStep(): boolean {
  return feedback.step >= feedback.steps
}

// Submit, Next and Skip are the same action: an empty Response is recorded as skipped.
export function sendResponse(): void {
  if (!feedback.question) return
  requestId = newRequestId()
  sentAnswer = hasAnswer()
  firstSentAt = Date.now()
  feedback.phase = 'sending'
  send()
}

// The close button: the Question on screen is recorded like Skip, whatever was entered
// is discarded, and the rest of the Group is not shown. Sent once without waiting for
// the ack — the player shouldn't wait to close.
export function dismissFeedback(): void {
  if (!feedback.question) return
  feedback.rating = 0
  feedback.comment = ''
  requestId = newRequestId()
  send()
  finishStep('skipped', false)
}

// The Close button after a failed save: ends the Group.
export function giveUpFeedback(): void {
  finishStep('failed', false)
}

function newRequestId(): string {
  // ~12 chars, e.g. "mfqz8k2x4f7a": unique enough to dedupe resends and merge rows.
  return Date.now().toString(36) + Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')
}

// 1 while the panel is interactive; drops to 0 during the post-ack fade.
export function panelOpacity(): number {
  if (feedback.phase !== 'saved') return 1
  const fading = Date.now() - savedAt - SAVED_HOLD_MS
  return fading <= 0 ? 1 : Math.max(0, 1 - fading / SAVED_FADE_MS)
}

// Records the step's result, then opens the next step or closes the Group.
function finishStep(result: AskResult, next: boolean): void {
  if (!current) return
  current.results[current.steps[step].slot] = result
  if (next && step + 1 < current.steps.length) return showStep(step + 1)

  feedback.phase = 'idle'
  feedback.question = undefined
  const done = current
  current = undefined
  done.resolve(done.results)
}

function send(kind: 'send' | 'resend' = 'send'): void {
  if (!feedback.question) return
  console.log(`[FEEDBACK] ${kind} ${requestId} ${feedback.question.id}`)
  lastSentAt = Date.now()
  void room.send('feedbackSubmit', {
    requestId,
    questionId: feedback.question.id,
    trigger: feedback.trigger,
    rating: feedback.rating,
    comment: feedback.withComment ? feedback.comment : '',
    commentShown: feedback.withComment,
    secondsInScene: Math.round((Date.now() - enteredAt) / 1000),
    platform: getPlatform() ?? 'unknown'
  })
}

export function setupFeedbackState(introSpec: IntroSpec | null): void {
  intro = introSpec
  room.onMessage('feedbackSaved', (data) => {
    console.log(`[FEEDBACK] ack ${data.requestId} ok=${data.ok}`)
    if (feedback.phase !== 'sending' || data.requestId !== requestId) return
    if (!data.ok) {
      feedback.phase = 'failed'
    } else if (!isLastStep()) {
      // Mid-Group: straight to the next Question, no 'Thanks'.
      finishStep(sentAnswer ? 'submitted' : 'skipped', true)
    } else {
      feedback.phase = 'saved'
      savedAt = Date.now()
    }
  })

  engine.addSystem(() => {
    pollHeartbeat()
    const now = Date.now()
    if (feedback.phase === 'sending') {
      if (now - firstSentAt > GIVE_UP_MS) {
        console.log(`[FEEDBACK] no ack for ${requestId} after ${GIVE_UP_MS / 1000} s, giving up`)
        feedback.phase = 'failed'
      } else if (now - lastSentAt > RESEND_MS && isServerAlive()) send('resend')
    } else if (feedback.phase === 'saved' && now - savedAt > SAVED_HOLD_MS + SAVED_FADE_MS) {
      finishStep(sentAnswer ? 'submitted' : 'skipped', true)
    }
    processQueue()
  })
}
