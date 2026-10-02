import { QuestionSpec } from './shared/series'

// Default Questions, selected for the Wk 4–6 pilot from the research bank
// (player-feedback-question-bank-2026-09.md). Use them as they are: to reword one,
// copy it into your series under your own id, so answers to different wordings
// never share an id.
//
// Each comment: the rating scale, then when to ask — the player must have
// encountered the situation, not necessarily succeeded.
//
// Comment prompts are tailored per Question but stay neutral, open to both good
// and bad experiences: asking only for problems skews the comments. The research
// doc's generic fallback is "What most affected your rating? (optional)".
export const QUESTION_BANK = {
  // EASE · after receiving performance feedback (score, success)
  E04: {
    text: 'How easy or difficult was it to tell how well you were doing?',
    commentPrompt: 'What showed you how well you were doing, or what was missing? (optional)'
  },
  // CLEAR · after facing a challenge
  H02: {
    text: 'How clear was what you needed to do to succeed?',
    commentPrompt: 'What helped or confused you about how to succeed? (optional)'
  },
  // AMOUNT · after several attempts
  H04: {
    text: 'How much did you feel you improved while playing?',
    commentPrompt: 'What, if anything, did you get better at? (optional)'
  },
  // CLEAR · while working toward a goal
  P03: {
    text: 'How clear was your progress toward the goal?',
    commentPrompt: 'What showed your progress, or what would have helped? (optional)'
  },
  // SATISFY · after receiving rewards
  P05: {
    text: 'How satisfying were the rewards you received?',
    commentPrompt: 'Which reward stood out, for better or worse? (optional)'
  },
  // ENJOY · after repeating the main activity
  P06: {
    text: 'How enjoyable was repeating the main activity?',
    commentPrompt: 'What made repeating it more or less fun? (optional)'
  },
  // CLEAR · after completing a goal, when more play is intended
  P10: {
    text: 'After completing a goal, how clear was what to do next?',
    commentPrompt: 'What did you think you should do next? (optional)'
  },
  // ENJOY · after experiencing the space
  W04: {
    text: 'How enjoyable was the atmosphere?',
    commentPrompt: 'What shaped the atmosphere for you? (optional)'
  },
  // EASE · after seeing other players doing an activity
  S01: {
    text: 'How easy or difficult was it to tell what other players were doing?',
    commentPrompt: "What made other players' actions easy or hard to follow? (optional)"
  },
  // EASE · after trying to join, including unsuccessful attempts
  S03: {
    text: 'How easy or difficult was it to join an activity with other players?',
    commentPrompt: 'What happened when you tried to join? (optional)'
  },
  // ENJOY · after actual shared play
  S06: {
    text: 'How enjoyable was playing with other people?',
    commentPrompt: 'What made playing with others better or worse? (optional)'
  },
  // ENJOY · after actual solo play (others merely being visible is not shared play)
  S09: {
    text: 'How enjoyable was playing on your own?',
    commentPrompt: 'What made playing on your own better or worse? (optional)'
  },
  // INTEREST · at a pause
  T01: {
    text: 'How interested are you in playing more right now?',
    commentPrompt: 'What makes you want to keep playing, or stop? (optional)'
  },
  // INTEREST · near the end of a visit, if revisits matter
  T02: {
    text: 'How interested are you in coming back another day?',
    commentPrompt: 'What, if anything, would bring you back? (optional)'
  },
  // CLEAR · when repeatable content exists
  T03: {
    text: 'How clear is what you could do on another visit?',
    commentPrompt: 'What would you do on your next visit? (optional)'
  },
  // INTEREST · after something worth sharing
  T08: {
    text: 'How interested are you in inviting a friend to play?',
    commentPrompt: 'What would you tell a friend about it? (optional)'
  },
  // WORTH · at a stopping point
  T09: {
    text: 'How worthwhile did this visit feel?',
    commentPrompt: 'What made the visit worth your time, or not? (optional)'
  },
  // SATISFIED · after actually playing
  Q01: {
    text: 'How satisfied were you with how smoothly the game ran?',
    commentPrompt: 'Where, if anywhere, did it slow down or stutter? (optional)'
  },
  // EASE · after getting stuck
  Q04: {
    text: 'After getting stuck, how easy or difficult was it to get back to playing?',
    commentPrompt: 'What got you stuck, and how did you get out? (optional)'
  },
  // EASE · when important objects had to be told apart
  Q07: {
    text: 'How easy or difficult was it to tell the important objects apart?',
    commentPrompt: 'Which objects were easy or hard to tell apart? (optional)'
  }
} satisfies Record<string, QuestionSpec>
