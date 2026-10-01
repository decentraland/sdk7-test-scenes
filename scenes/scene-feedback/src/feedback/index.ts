import { isServer } from '@dcl/sdk/network'
import { setQuestions, QuestionSpec } from './shared/questions'
import { registerValidators } from './shared/schemas'
import { AskOptions, AskResult, askQuestion, setupFeedbackState } from './client/state'
import { setupUi } from './client/ui'

// Static side-effect import: registerMessages() defines a component under the
// hood, so it must run at module load, before the engine seals.
import './shared/messages'

export { QUESTION_BANK } from './bank'
export type { AskOptions, AskResult, QuestionSpec }

export type FeedbackConfig<Q extends Record<string, QuestionSpec>> = {
  // The Question series: id → Question. Keep an id once it is live; give a
  // reworded Question a new id so answers to different wordings never mix.
  questions: Q
  // Shows one "Ask <id>" button per Question. Turn off before release.
  debug?: boolean
}

export type Feedback<Q> = {
  // Call once from main(), on the client and the server alike.
  start(): void
  // Queues the Question and shows it once nothing else is on screen and the
  // server is up. Resolves when the player is done with it.
  // By default a Question is shown once per visit per trigger.
  ask(questionId: keyof Q & string, trigger: string, options?: AskOptions): Promise<AskResult>
}

let created = false

// Call at module load (e.g. in your questions file), so the client and the server
// both know the Questions before main() runs.
export function createFeedback<Q extends Record<string, QuestionSpec>>(config: FeedbackConfig<Q>): Feedback<Q> {
  if (created) throw new Error('createFeedback() can only be called once per scene')
  created = true
  setQuestions(config.questions)

  let started = false
  return {
    start() {
      if (started) return
      started = true
      registerValidators()
      if (isServer()) {
        // Dynamic import keeps @dcl/sdk/server (Storage) out of the client path.
        // Not awaited: the scene's own main() must not wait for Storage.
        void import('./server/server').then(({ startServer }) => startServer())
        return
      }
      setupFeedbackState()
      setupUi(config.debug ?? false)
    },
    ask(questionId, trigger, options) {
      if (!started) console.log('[FEEDBACK] ask() before start(): call feedback.start() in main()')
      // Questions are shown to players: the server has no screen.
      if (isServer()) return Promise.resolve('not-shown')
      return askQuestion(questionId, trigger, options)
    }
  }
}
