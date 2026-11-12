import { AvatarBase, AvatarNametag, engine } from '@dcl/sdk/ecs'
import type { AskResult } from './scene-feedback'

// Visit-local score and an SDK avatar plate, not currency, a profile title or a collectible.
// Physical pickup/round progress stays in game.tsx and never uses this score.
export const CONTRIBUTOR_TITLE = 'Playtest Contributor'
export const FEEDBACK_BONUS = 5
export const BOOST_PICKUPS = 5
let unlocked = false
let coinScore = 0
let boostedPickupsRemaining = 0

export function recordFeedbackParticipation(result: AskResult | readonly AskResult[]): void {
  const results = typeof result === 'string' ? [result] : result
  // Require an answered current Group; rating values and comment sentiment never matter.
  // submitted describes the client action, not confirmed Storage persistence.
  if (unlocked || results.length === 0 || !results.every((answer) => answer === 'submitted')) return
  unlocked = true
  coinScore += FEEDBACK_BONUS
  boostedPickupsRemaining = BOOST_PICKUPS
  applyContributorTag()
  console.log('[SCENE] completed-Group reward: +5 coin score, x2 for next 5 pickups and avatar tag')
}

// AvatarNametag is local to this client; it does not change the player's profile or relay a title.
function applyContributorTag(): void {
  AvatarNametag.createOrReplace(engine.PlayerEntity, { label: CONTRIBUTOR_TITLE })
}

export function setupFeedbackReward(): void {
  // Only target the reserved local-player entity; never retain a remote player's entity id.
  AvatarBase.onChange(engine.PlayerEntity, (avatar) => {
    if (!unlocked) return
    if (avatar) applyContributorTag()
    else AvatarNametag.deleteFrom(engine.PlayerEntity)
  })
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
