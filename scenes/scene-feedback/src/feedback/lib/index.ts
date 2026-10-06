import { isServer } from '@dcl/sdk/network'
import { engine } from '@dcl/sdk/ecs'
import { setQuestions } from './shared/series'
import { registerValidators } from './shared/schemas'
import { sinceLoad } from './shared/clock'
import {
  AskResult,
  IntroResult,
  Participation,
  askQuestions,
  configure,
  enroll,
  getParticipation,
  setupFeedbackState,
  showIntro
} from './client/state'
import { setupUi } from './client/ui'
import { ASK_PARTICIPANTS_ONLY, DEBUG, INTRO, QUESTIONS } from '../questions'

// Static side-effect import: registerMessages() defines a component under the
// hood, so it must run at module load, before the engine seals.
import './shared/messages'

export type { AskResult, IntroResult, Participation }

// Importing { feedback } anywhere is the whole setup, on the client and the server.
// The Questions are set at module load; the rest starts on the first engine tick,
// which always comes after the scene's main(): syncEntity throws before that.
setQuestions(QUESTIONS)
configure(INTRO, ASK_PARTICIPANTS_ONLY)
console.log('[FEEDBACK] loaded')

function startOnFirstTick(): void {
  engine.removeSystem(startOnFirstTick)
  console.log(`[FEEDBACK] starting on the ${isServer() ? 'server' : 'client'} at +${sinceLoad()}`)
  if (isServer()) {
    registerValidators()
    // Dynamic import keeps @dcl/sdk/server (Storage) out of the client path.
    void import('./server/server').then(({ startServer }) => startServer(INTRO))
    return
  }
  setupFeedbackState()
  setupUi(DEBUG)
}
engine.addSystem(startOnFirstTick)

type QuestionId = keyof typeof QUESTIONS

export type AskOptions = {
  // Show again even if the player already saw this Question at this trigger.
  repeat?: boolean
  // Which Questions of this call show the comment field: true (default) all, false none,
  // or a list of ids — only those, e.g. { comment: ['playMore'] }. It can only hide the
  // field: a Question without commentPrompt never shows one.
  comment?: boolean | readonly QuestionId[]
}

// Queues the Question(s) and shows them once nothing else is on screen and the server
// is up. An array is a Group: one panel, one Question after another, with a progress
// bar. Resolves when the player is done: one result, or one per id in the same order.
// By default a Question is shown once per visit per trigger.
function ask(questionId: QuestionId, trigger: string, options?: AskOptions): Promise<AskResult>
function ask(questionIds: readonly QuestionId[], trigger: string, options?: AskOptions): Promise<AskResult[]>
function ask(
  ids: QuestionId | readonly QuestionId[],
  trigger: string,
  options?: AskOptions
): Promise<AskResult | AskResult[]> {
  const group = typeof ids === 'string' ? [ids] : ids
  // Questions are shown to players: the server has no screen.
  const results = isServer()
    ? Promise.resolve(group.map((): AskResult => 'not-shown'))
    : askQuestions(group, trigger, options)
  return typeof ids === 'string' ? results.then((r) => r[0]) : results
}

// Static mode: the player chooses to give feedback — a "Leave feedback" button, a 3D
// kiosk, an area they walk into. Shows the Intro, then a batch prepared for it as one
// Group. Every call, any number of times, whatever the player said to feedback.intro():
// Questions may come again, and each one offers "I didn't experience this". A call while
// the previous one is still open or waiting is ignored (resolves to not-shown).
function leaveFeedback(questionIds: readonly QuestionId[], trigger: string): Promise<AskResult[]> {
  if (isServer()) return Promise.resolve(questionIds.map((): AskResult => 'not-shown'))
  return askQuestions(questionIds, trigger, { repeat: true, source: 'player' })
}

// Dynamic mode: the Intro (INTRO in questions.ts) asks whether the player takes part in
// the playtest: a yes makes them a participant, a no keeps the game's Questions away
// for the visit. Until it is answered, the game's Questions wait behind it. Shown once
// per visit, and only while participation is unknown; otherwise resolves to not-shown.
function intro(trigger: string): Promise<IntroResult> {
  if (isServer()) return Promise.resolve('not-shown')
  return showIntro(trigger)
}

// Makes this player a participant without the Intro, e.g. players the creator picked.
function enrollPlayer(): void {
  if (!isServer()) enroll()
}

// 'in', 'out' (said no to the Intro) or 'unknown'.
function participation(): Participation {
  return getParticipation()
}

export const feedback = { intro, enroll: enrollPlayer, participation, ask, leaveFeedback }
