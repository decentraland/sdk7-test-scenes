import { QuestionSpec } from './shared/series'

const DEFAULT_COMMENT_PROMPT = 'What most affected your rating? (optional)'

// Default Questions, selected for the Wk 4–6 pilot from the research bank
// (player-feedback-question-bank-2026-09.md). Use them as they are: to reword one,
// copy it into your series under your own id, so answers to different wordings
// never share an id.
//
// Each comment: the rating scale, then when to ask — the player must have
// encountered the situation, not necessarily succeeded.
export const QUESTION_BANK = {
  // EASE · after receiving performance feedback (score, success)
  E04: {
    text: 'How easy or difficult was it to tell how well you were doing?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // CLEAR · after facing a challenge
  H02: {
    text: 'How clear was what you needed to do to succeed?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // AMOUNT · after several attempts
  H04: {
    text: 'How much did you feel you improved while playing?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // CLEAR · while working toward a goal
  P03: {
    text: 'How clear was your progress toward the goal?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // SATISFY · after receiving rewards
  P05: {
    text: 'How satisfying were the rewards you received?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // ENJOY · after repeating the main activity
  P06: {
    text: 'How enjoyable was repeating the main activity?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // CLEAR · after completing a goal, when more play is intended
  P10: {
    text: 'After completing a goal, how clear was what to do next?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // ENJOY · after experiencing the space
  W04: {
    text: 'How enjoyable was the atmosphere?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // EASE · after seeing other players doing an activity
  S01: {
    text: 'How easy or difficult was it to tell what other players were doing?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // EASE · after trying to join, including unsuccessful attempts
  S03: {
    text: 'How easy or difficult was it to join an activity with other players?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // ENJOY · after actual shared play
  S06: {
    text: 'How enjoyable was playing with other people?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // ENJOY · after actual solo play (others merely being visible is not shared play)
  S09: {
    text: 'How enjoyable was playing on your own?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // INTEREST · at a pause
  T01: {
    text: 'How interested are you in playing more right now?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // INTEREST · near the end of a visit, if revisits matter
  T02: {
    text: 'How interested are you in coming back another day?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // CLEAR · when repeatable content exists
  T03: {
    text: 'How clear is what you could do on another visit?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // INTEREST · after something worth sharing
  T08: {
    text: 'How interested are you in inviting a friend to play?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // WORTH · at a stopping point
  T09: {
    text: 'How worthwhile did this visit feel?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // SATISFIED · after actually playing
  Q01: {
    text: 'How satisfied were you with how smoothly the game ran?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // EASE · after getting stuck
  Q04: {
    text: 'After getting stuck, how easy or difficult was it to get back to playing?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  },
  // EASE · when important objects had to be told apart
  Q07: {
    text: 'How easy or difficult was it to tell the important objects apart?',
    commentPrompt: DEFAULT_COMMENT_PROMPT
  }
} satisfies Record<string, QuestionSpec>
