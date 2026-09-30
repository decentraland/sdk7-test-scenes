// The Question series for this scene. Edit freely; keep ids stable once live,
// and bump the id (e.g. 'F01-v2') when the wording changes, so answers to
// different wordings are never mixed.
//
// More candidates (full bank: player-feedback-question-bank-2026-09.md):
//   E01  How enjoyable was the main activity?          (name it: "…was bowling?")
//   E03  How clear was the result of your actions?
//   C01  How easy or difficult was it to use the controls?
//   T01  How interested are you in playing more right now?
//   H05  After your last failed attempt, how clear was what you could try next?

export type Question = {
  id: string
  text: string
  commentPrompt: string
}

export const QUESTIONS: Question[] = [
  {
    id: 'F01',
    text: 'How easy or difficult was it to work out what to do first?',
    commentPrompt: 'What most affected your rating? (optional)'
  }
]

export function findQuestion(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id)
}

export const MAX_RATING = 5
export const MAX_COMMENT_LENGTH = 1000
export const HEARTBEAT_MS = 2000
export const HEARTBEAT_FRESHNESS_MS = 6000
