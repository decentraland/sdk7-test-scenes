import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// All message payloads must be declared with Schemas.Map(...) — plain JS objects
// fail binary serialization. Keep every message well under the 13 KB transport limit.
export const Messages = {
  // Client → server: "I just clicked the score orb." The client never reports a
  // score — only the action. The server is the sole authority on the actual count.
  claimPoint: Schemas.Map({ nonce: Schemas.Int }),

  // Server → one client: your authoritative running total after a successful claim.
  scoreUpdate: Schemas.Map({ total: Schemas.Int }),

  // Server → one client: a claim was rejected (e.g. you were too far from the orb).
  claimRejected: Schemas.Map({ reason: Schemas.String })
}

export const room = registerMessages(Messages)
