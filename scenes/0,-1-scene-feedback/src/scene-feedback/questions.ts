import { QUESTION_BANK } from './lib/bank'
import { IntroSpec, QuestionSpec } from './lib/shared/series'

// Scene-specific feedback configuration.

// "Ask <id>" button per Question, top-left. Visible only in preview and to the World's
// owner/deployers, never to players. Still, turn off before release.
export const DEBUG = true

// Local preview only: the mobile layout on desktop, to check it without a phone. Ignored once
// deployed. Size the explorer window like a phone, e.g. 1600x720.
export const PREVIEW_MOBILE = false

// true: the game's ask() shows Questions only to participants (yes to the Intro, or feedback.enroll()).
// false: to everyone except players who said no.
export const ASK_PARTICIPANTS_ONLY = true

// Opt-in shown by feedback.intro(). Give feedback: participant. Skip / ×: no Questions this
// visit (Leave feedback still works). null: no Intro.
// avatar (optional), circle above the title:
// - left out: scene owner's face (scene.json "owner", else the World's owner)
// - a wallet address: that avatar's face
// - an image path ('assets/images/creator-avatar.png') or URL
// - null: none
export const INTRO: IntroSpec | null = {
  title: 'Help improve Coin Hunt',
  text: "Help us check coin visibility and the hunt's flow with short ratings; comments are optional. Send any answer for +5 coin score, x2 score on your next 5 pickups and the Playtest Contributor title, this visit only. Any rating counts. Skip and keep playing normally. Score is not currency. Answers and wallet address are saved for review."
}

// Once live, never change a Question's text under its id: new wording, new id.
export const QUESTIONS = {
  // from the bank as is: text, scale, comment prompt from lib/bank.ts
  nextGoal: QUESTION_BANK.coreLoop.nextGoal,
  repeatLoop: QUESTION_BANK.coreLoop.repeatLoop,
  playMore: QUESTION_BANK.motivation.playMore,
  worthIt: QUESTION_BANK.motivation.worthIt,

  // own Question: bank wording adapted to the game, shared scale
  coinSpotting: {
    text: 'How easy or difficult was it to spot the coins?', // bank C08's "important information" → "coins"
    scale: 'EASE', // code from lib/shared/scales.ts (EASE, CLEAR, ENJOY, …)
    commentPrompt: 'What made them easy or hard to spot? (optional)' // omit for rating only
  },

  // own Question, own scale: five labels, 1 → 5, 5 best
  nextCoinKnown: {
    text: 'How often did you know where the next coin was?',
    scale: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always']
    // no commentPrompt: rating only wherever asked
  },

  // text only: no scale; the field stays visible even when ask() passes comment: false.
  // Available in debug; attach it to your own end-of-round event when useful.
  anythingWrong: {
    text: 'Was there anything annoying, unusual, or wrong during the round?',
    commentOnly: true,
    commentPrompt: 'What happened, and what were you trying to do?'
  }
} satisfies Record<string, QuestionSpec>

