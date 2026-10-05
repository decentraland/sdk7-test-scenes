import { isServer } from '@dcl/sdk/network'
import { engine } from '@dcl/sdk/ecs'
import { setQuestions } from './shared/series'
import { registerValidators } from './shared/schemas'
import { sinceLoad } from './shared/clock'
import { AskResult, askQuestions, setupFeedbackState } from './client/state'
import { setupUi } from './client/ui'
import { DEBUG, FEEDBACK_BUTTON, QUESTIONS } from '../questions'

// Static side-effect import: registerMessages() defines a component under the
// hood, so it must run at module load, before the engine seals.
import './shared/messages'

export type { AskResult }

// Importing { feedback } anywhere is the whole setup, on the client and the server.
// The Questions are set at module load; the rest starts on the first engine tick,
// which always comes after the scene's main(): syncEntity throws before that.
setQuestions(QUESTIONS)
console.log('[FEEDBACK] loaded')

function startOnFirstTick(): void {
  engine.removeSystem(startOnFirstTick)
  console.log(`[FEEDBACK] starting on the ${isServer() ? 'server' : 'client'} at +${sinceLoad()}`)
  if (isServer()) {
    registerValidators()
    // Dynamic import keeps @dcl/sdk/server (Storage) out of the client path.
    void import('./server/server').then(({ startServer }) => startServer())
    return
  }
  setupFeedbackState()
  setupUi(DEBUG, FEEDBACK_BUTTON)
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

export const feedback = { ask }
