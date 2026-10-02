import { isServer } from '@dcl/sdk/network'
import { engine } from '@dcl/sdk/ecs'
import { setQuestions } from './shared/series'
import { registerValidators } from './shared/schemas'
import { sinceLoad } from './shared/clock'
import { AskOptions, AskResult, askQuestion, setupFeedbackState } from './client/state'
import { setupUi } from './client/ui'
import { DEBUG, QUESTIONS } from '../questions'

// Static side-effect import: registerMessages() defines a component under the
// hood, so it must run at module load, before the engine seals.
import './shared/messages'

export type { AskOptions, AskResult }

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
  setupUi(DEBUG)
}
engine.addSystem(startOnFirstTick)

export const feedback = {
  // Queues the Question and shows it once nothing else is on screen and the
  // server is up. Resolves when the player is done with it.
  // By default a Question is shown once per visit per trigger.
  ask(questionId: keyof typeof QUESTIONS, trigger: string, options?: AskOptions): Promise<AskResult> {
    // Questions are shown to players: the server has no screen.
    if (isServer()) return Promise.resolve('not-shown')
    return askQuestion(questionId, trigger, options)
  }
}
