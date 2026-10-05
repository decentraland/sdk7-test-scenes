import { QUESTION_BANK } from './lib/bank'
import { QuestionSpec } from './lib/shared/series'

// ── The only file to edit ──────────────────────────────────────────────────────────

// Shows one "Ask <id>" button per Question (top-left). Turn off before release.
export const DEBUG = true

// This scene's Questions. Once live, never change a Question's text under the same id —
// give it a new one, so answers to different wordings never mix.
export const QUESTIONS = {
  // From the bank, as is: text, scale and comment prompt all come from lib/bank.ts.
  nextGoal: QUESTION_BANK.coreLoop.nextGoal,
  repeatLoop: QUESTION_BANK.coreLoop.repeatLoop,
  playMore: QUESTION_BANK.motivation.playMore,

  // Your own Question inspired by the bank and a shared scale: 
  coinSpotting: {
    text: 'How easy or difficult was it to spot the coins?', // bank's "the important objects" replaced by "coins" 
    scale: 'EASE', // a shared scale: code from lib/shared/scales.ts (EASE, CLEAR, ENJOY, …).
    commentPrompt: 'What made them easy or hard to spot? (optional)'
  },

  // Your own Question on your own scale: five labels, 1 → 5, 5 being the best. A frequency
  // scale like this one is not in lib/shared/scales.ts, so it is spelled out here.
  nextCoinKnown: {
    text: 'How often did you know where the next coin was?',
    scale: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
    commentPrompt: 'What helped you find the next coin, or what got in the way? (optional)'
  }
} satisfies Record<string, QuestionSpec>
