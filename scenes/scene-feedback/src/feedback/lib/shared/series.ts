// The scene's Question series (questions.ts), set once at module load, so the
// client and the server (same code, both run it) see the same Questions.
import { Scale } from './scales'

export type QuestionSpec = {
  text: string
  // Labels of the five answers: a code from shared/scales.ts, or your own five labels.
  scale: Scale
  // Placeholder of the comment field. Leave it out for a rating-only Question, e.g. a
  // quick tap mid-play: no comment field is shown.
  commentPrompt?: string
}

// The Intro: asks the player once per visit whether they want to give feedback at all,
// before the first Question the game asks.
export type IntroSpec = {
  title: string
  text: string
  // Optional picture above the title, e.g. the creator's avatar: a path in the scene
  // ('images/creator.png') or a URL.
  image?: string
}

export type Question = {
  id: string
  text: string
  scale: Scale
  commentPrompt?: string
}

let series: Question[] = []

export function setQuestions(specs: Record<string, QuestionSpec>): void {
  series = Object.keys(specs).map((id) => ({
    id,
    text: specs[id].text,
    scale: specs[id].scale,
    commentPrompt: specs[id].commentPrompt
  }))
}

export function allQuestions(): readonly Question[] {
  return series
}

export function findQuestion(id: string): Question | undefined {
  return series.find((q) => q.id === id)
}

export const MAX_RATING = 5
export const MAX_COMMENT_LENGTH = 1000
export const HEARTBEAT_MS = 2000
export const HEARTBEAT_FRESHNESS_MS = 6000
