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
let firstSentAt = 0
let lastSentAt = 0
let savedAt = 0
const enteredAt = Date.now()

// trigger labels the moment the Question was asked, e.g. 'after-first-round',
// so answers given at different moments can be told apart.
export function askQuestion(questionId: string, trigger: string): void {
  const question = findQuestion(questionId)
  if (!question || !isServerAlive()) return
  feedback.phase = 'open'
  feedback.question = question
  feedback.trigger = trigger
  feedback.rating = 0
  feedback.comment = ''
}

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
  closeFeedback()
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

export function closeFeedback(): void {
  feedback.phase = 'idle'
  feedback.question = undefined
}

function send(kind: 'send' | 'resend' = 'send'): void {
  if (!feedback.question) return
  console.log(`[FEEDBACK] ${kind} ${requestId} ${feedback.question.id}`)
  lastSentAt = Date.now()
  void room.send('submitResponse', {
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
  room.onMessage('responseSaved', (data) => {
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
      closeFeedback()
    }
  })
}
