import { QUESTION_BANK } from './lib/bank'
import { IntroSpec, QuestionSpec } from './lib/shared/series'

// ── The only file to edit ──────────────────────────────────────────────────────────

// Shows one "Ask <id>" button per Question (top-left). Turn off before release.
export const DEBUG = true

// Asked once per visit before the first Question the game asks: Give feedback goes on,
// Skip or x means no Questions this visit (Leave feedback still works). null: no Intro.
// image (optional): a picture above the title, e.g. 'images/creator.png'.
export const INTRO: IntroSpec | null = {
  title: "Hi, we're the Coin Hunt team!",
  text: "We're testing a new experience and would love to hear what you think. Your feedback will help us make it better."
}

// This scene's Questions. Once live, never change a Question's text under the same id —
// give it a new one, so answers to different wordings never mix.
export const QUESTIONS = {
  // From the bank, as is: text, scale and comment prompt all come from lib/bank.ts.
  nextGoal: QUESTION_BANK.coreLoop.nextGoal,
  repeatLoop: QUESTION_BANK.coreLoop.repeatLoop,
  playMore: QUESTION_BANK.motivation.playMore,
  worthIt: QUESTION_BANK.motivation.worthIt,

  // Your own Question inspired by the bank and a shared scale: 
  coinSpotting: {
    text: 'How easy or difficult was it to spot the coins?', // bank's "the important objects" replaced by "coins" 
    scale: 'EASE', // a shared scale: code from lib/shared/scales.ts (EASE, CLEAR, ENJOY, …).
    // No commentPrompt: rating only, no comment field. Asked mid-round — a quick tap, not a pause to type.
  },

  // Your own Question on your own scale: five labels, 1 → 5, 5 being the best. A frequency
  // scale like this one is not in lib/shared/scales.ts, so it is spelled out here.
  nextCoinKnown: {
    text: 'How often did you know where the next coin was?',
    scale: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
    commentPrompt: 'What helped you find the next coin, or what got in the way? (optional)'
  }
} satisfies Record<string, QuestionSpec>

// The "Leave feedback" button (top-right): the Question it opens whenever the player
// wants, as often as they want. null hides the button.
export const FEEDBACK_BUTTON: keyof typeof QUESTIONS | null = 'worthIt'
