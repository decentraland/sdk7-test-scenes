import { QUESTION_BANK, createFeedback } from './feedback'

// This scene's Question series: pick from the bank, add your own.
// Once live, never change a Question's text under the same id — give it a new one.
export const feedback = createFeedback({
  questions: {
    COIN01: {
      text: 'How easy or difficult was it to spot the coins?',
      commentPrompt: 'What made them easy or hard to spot? (optional)'
    },
    P10: QUESTION_BANK.P10,
    P06: QUESTION_BANK.P06,
    T01: QUESTION_BANK.T01
  },
  debug: true
})
