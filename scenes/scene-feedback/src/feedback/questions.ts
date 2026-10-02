import { QUESTION_BANK } from './lib/bank'
import { QuestionSpec } from './lib/shared/series'

// ── The only file to edit ──────────────────────────────────────────────────────────

// Shows one "Ask <id>" button per Question (top-left). Turn off before release.
export const DEBUG = true

// This scene's Questions: pick from the bank (lib/bank.ts), add your own.
// Once live, never change a Question's text under the same id — give it a new one,
// so answers to different wordings never mix.
export const QUESTIONS = {
  // Bank objectContrast ("the important objects") reworded for this game: own id, own prompt.
  coinSpotting: {
    text: 'How easy or difficult was it to spot the coins?',
    commentPrompt: 'What made them easy or hard to spot? (optional)'
  },
  nextGoal: QUESTION_BANK.coreLoop.nextGoal,
  repeatLoop: QUESTION_BANK.coreLoop.repeatLoop,
  playMore: QUESTION_BANK.motivation.playMore
} satisfies Record<string, QuestionSpec>
