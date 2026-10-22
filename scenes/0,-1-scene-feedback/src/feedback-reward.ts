import type { AskResult } from './scene-feedback'

// Visit-local score and recognition, not spendable currency, a platform badge or a collectible.
// Physical pickup/round progress stays in game.tsx and never uses this score.
export const CONTRIBUTOR_TITLE = 'Playtest Contributor'
export const FEEDBACK_BONUS = 5
export const BOOST_PICKUPS = 5
let unlocked = false
let coinScore = 0
let boostedPickupsRemaining = 0

export function recordFeedbackParticipation(result: AskResult | readonly AskResult[]): void {
  const results = typeof result === 'string' ? [result] : result
  // Only participation matters. No rating value or comment sentiment is inspected.
  // submitted describes the client action, not confirmed Storage persistence.
  if (unlocked || !results.includes('submitted')) return
  unlocked = true
  coinScore += FEEDBACK_BONUS
  boostedPickupsRemaining = BOOST_PICKUPS
  console.log('[SCENE] feedback reward: +5 coin score, x2 for next 5 pickups and ' + CONTRIBUTOR_TITLE)
}

// Called once for each actual pickup, after the game's duplicate-click guard.
// The bonus and multiplier never create pickups or advance a round.
export function recordCoinPickup(): void {
  const boosted = boostedPickupsRemaining > 0
  coinScore += boosted ? 2 : 1
  if (boosted) boostedPickupsRemaining--
}

export function getCoinScore(): number {
  return coinScore
}

export function getBoostPickupsRemaining(): number {
  return boostedPickupsRemaining
}

export function hasContributorTitle(): boolean {
  return unlocked
}
