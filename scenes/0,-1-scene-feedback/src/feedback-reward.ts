import type { AskResult } from './scene-feedback'

// A scene-local cosmetic example, not a platform badge or a collectible.
// Module state lasts for this visit only; the library and the CSV stay unchanged.
export const CONTRIBUTOR_TITLE = 'Playtest Contributor'
let unlocked = false

export function recordFeedbackParticipation(result: AskResult | readonly AskResult[]): void {
  const results = typeof result === 'string' ? [result] : result
  // Only participation matters. No rating value or comment sentiment is inspected.
  // submitted describes the client action, not confirmed Storage persistence.
  if (unlocked || !results.includes('submitted')) return
  unlocked = true
  console.log('[SCENE] title unlocked for this visit: ' + CONTRIBUTOR_TITLE)
}

export function hasContributorTitle(): boolean {
  return unlocked
}
