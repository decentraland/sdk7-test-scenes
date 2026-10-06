import { QUESTION_BANK } from './lib/bank'
import { IntroSpec, QuestionSpec } from './lib/shared/series'

// ── The only file to edit ──────────────────────────────────────────────────────────

// Shows one "Ask <id>" button per Question (top-left). Turn off before release.
export const DEBUG = true

// Asked once per visit before the first Question the game asks: Give feedback goes on,
// Skip or x means no Questions this visit (Leave feedback still works). null: no Intro.
// avatar (optional): above the title, in a circle. Left out: the scene owner's avatar face
// (scene.json "owner", else the World's owner). Another wallet address: that avatar's face.
// A picture: a path in the scene ('assets/images/creator-avatar.png') or a URL. null: none.
// Dynamic mode: true — the game's ask() shows Questions only to playtest participants:
// players who said yes to the Intro (feedback.intro()) or whom you enrolled
// (feedback.enroll()). false — to everyone, except players who said no to the Intro.
export const ASK_PARTICIPANTS_ONLY = true

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
    commentPrompt: 'What made them easy or hard to spot? (optional)' // leave it out for a rating-only Question
  },

  // Your own Question on your own scale: five labels, 1 → 5, 5 being the best. A frequency
  // scale like this one is not in lib/shared/scales.ts, so it is spelled out here.
  nextCoinKnown: {
    text: 'How often did you know where the next coin was?',
    scale: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always']
    // No commentPrompt: always rating only, wherever it is asked — no comment field.
  }
} satisfies Record<string, QuestionSpec>

