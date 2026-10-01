import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { getPlatform } from '@dcl/sdk/platform'
import { room } from '../shared/messages'
import { HEARTBEAT_FRESHNESS_MS, MAX_COMMENT_LENGTH, Question, findQuestion } from '../shared/questions'
import { ServerHeartbeat } from '../shared/schemas'

// --- Server liveness -------------------------------------------------------------
// Track when the heartbeat value last *changed* on the client clock: a stale CRDT
// snapshot from a previous server run never advances, so it can't read as alive.
let lastBeatValue = 0
let lastBeatSeenAt = 0

function pollHeartbeat(): void {
  for (const [, hb] of engine.getEntitiesWith(ServerHeartbeat)) {
    if (hb.beatAt !== lastBeatValue) {
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
// 'not-shown': asked before at this Trigger this visit, or the server never came up.
export type AskResult = 'submitted' | 'skipped' | 'failed' | 'not-shown'

export type AskOptions = {
  // Show again even if the player already saw this Question at this Trigger.
  repeat?: boolean
}

type Ask = {
  question: Question
  trigger: string
  resolve: (result: AskResult) => void
  askedAt: number
}

// Questions wait here while another one is open or the server is still waking up.
const queue: Ask[] = []
// The Ask on screen now.
let current: Ask | undefined
// "id|trigger" of every Question shown this visit.
const shown = new Set<string>()
// A queued Question gives up if the server stays down this long.
const SERVER_WAIT_MS = 120_000

// trigger labels the moment the Question was asked, e.g. 'after-first-round',
// so answers given at different moments can be told apart.
export function askQuestion(questionId: string, trigger: string, options: AskOptions = {}): Promise<AskResult> {
  const question = findQuestion(questionId)
  if (!question) {
    console.log(`[FEEDBACK] unknown question ${questionId}`)
    return Promise.resolve('not-shown')
  }
  const key = `${question.id}|${trigger}`
  const pending = current?.question.id === question.id && current.trigger === trigger
  const queued = queue.some((a) => a.question.id === question.id && a.trigger === trigger)
  if (!options.repeat && (shown.has(key) || pending || queued)) return Promise.resolve('not-shown')

  return new Promise((resolve) => queue.push({ question, trigger, resolve, askedAt: Date.now() }))
}

// Opens the next queued Question once nothing is on screen and the server is up.
function processQueue(): void {
  const alive = isServerAlive()
  if (!alive) {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (Date.now() - queue[i].askedAt < SERVER_WAIT_MS) continue
      console.log(`[FEEDBACK] server not up after ${SERVER_WAIT_MS / 1000} s, not showing ${queue[i].question.id}`)
      queue.splice(i, 1)[0].resolve('not-shown')
    }
    return
  }
  if (feedback.phase !== 'idle' || queue.length === 0) return

  const next = queue.shift()!
  current = next
  shown.add(`${next.question.id}|${next.trigger}`)
  feedback.phase = 'open'
  feedback.question = next.question
  feedback.trigger = next.trigger
  feedback.rating = 0
  feedback.comment = ''
}

// --- The Question currently on screen ----------------------------------------------
// idle → open → sending → saved (auto-closes) | failed (player can retry or close)
export type Phase = 'idle' | 'open' | 'sending' | 'saved' | 'failed'

const RESEND_MS = 3000
const GIVE_UP_MS = 30000
// After the ack: show 'Thanks' briefly, then fade the panel out.
const SAVED_HOLD_MS = 300
const SAVED_FADE_MS = 200

export const feedback = {
  phase: 'idle' as Phase,
  question: undefined as Question | undefined,
  trigger: '',
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

// Submit and Skip are the same action: an empty Response is recorded as skipped.
export function sendResponse(): void {
  if (!feedback.question) return
  requestId = newRequestId()
  sentAnswer = hasAnswer()
  firstSentAt = Date.now()
  feedback.phase = 'sending'
  send()
}

// The close button: recorded like Skip, whatever was entered is discarded.
// Sent once without waiting for the ack — the player shouldn't wait to close.
export function dismissFeedback(): void {
  if (!feedback.question) return
  feedback.rating = 0
  feedback.comment = ''
  requestId = newRequestId()
  send()
  closeFeedback('skipped')
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

export function closeFeedback(result: AskResult): void {
  feedback.phase = 'idle'
  feedback.question = undefined
  current?.resolve(result)
  current = undefined
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
    comment: feedback.comment,
    secondsInScene: Math.round((Date.now() - enteredAt) / 1000),
    platform: getPlatform() ?? 'unknown'
  })
}

export function setupFeedbackState(): void {
  room.onMessage('feedbackSaved', (data) => {
    console.log(`[FEEDBACK] ack ${data.requestId} ok=${data.ok}`)
    if (feedback.phase !== 'sending' || data.requestId !== requestId) return
    if (data.ok) {
      feedback.phase = 'saved'
      savedAt = Date.now()
    } else {
      feedback.phase = 'failed'
    }
  })

  engine.addSystem(() => {
    pollHeartbeat()
    const now = Date.now()
    if (feedback.phase === 'sending') {
      if (now - firstSentAt > GIVE_UP_MS) {
        console.log(`[FEEDBACK] no ack for ${requestId} after ${GIVE_UP_MS / 1000} s, giving up`)
        feedback.phase = 'failed'
      }
      else if (now - lastSentAt > RESEND_MS && isServerAlive()) send('resend')
    } else if (feedback.phase === 'saved' && now - savedAt > SAVED_HOLD_MS + SAVED_FADE_MS) {
      closeFeedback(sentAnswer ? 'submitted' : 'skipped')
    }
    processQueue()
  })
}
