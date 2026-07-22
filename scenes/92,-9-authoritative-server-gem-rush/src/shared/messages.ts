import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// All message payloads must be declared with Schemas.Map(...) — plain JS objects
// fail binary serialization. Keep every message well under the 13 KB transport limit.
//
// Messages are only used for per-player request/response. Everything broadcast
// (round phase, timers, gems, scores, hall of fame) travels via synced components
// instead — see shared/schemas.ts.
export const Messages = {
  // Client → server: "I clicked gem <gemId>." Intent only — the client never
  // reports a score or a position; the server validates and counts.
  collectGem: Schemas.Map({ gemId: Schemas.Int }),

  // Server → one client: your collect was accepted; authoritative round total.
  gemCollected: Schemas.Map({ gemId: Schemas.Int, value: Schemas.Int, roundTotal: Schemas.Int }),

  // Server → one client: your collect was rejected (too far / too late / no round).
  collectRejected: Schemas.Map({ gemId: Schemas.Int, reason: Schemas.String }),

  // Client → server: ask for my persisted lifetime stats (sent once after join).
  getMyStats: Schemas.Map({}),

  // Server → one client: lifetime stats loaded from Storage.player.
  myStats: Schemas.Map({
    gamesPlayed: Schemas.Int,
    gemsCollected: Schemas.Int,
    wins: Schemas.Int,
    bestRound: Schemas.Int
  })
}

export const room = registerMessages(Messages)
