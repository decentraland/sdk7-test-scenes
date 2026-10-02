import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// All message payloads must be declared with Schemas.Map(...) — plain JS objects
// fail binary serialization.
export const Messages = {
  // Client → server: platform proof. The server awards TEST_BADGE to the sender AND
  // to ABSENT_ADDRESS, with no validation of its own, and reports both results. The
  // second must fail at the platform layer (presence gate + badges service).
  tryAward: Schemas.Map({}),

  // Client → server: anti-cheat proof. The server awards TARGET_BADGE only if its
  // own copy of the sender's position is within CLAIM_RADIUS of the target.
  claimBadge: Schemas.Map({}),

  // Server → one client: the outcome of one award attempt.
  //   kind: 'present' | 'absent' | 'claim'
  awardResult: Schemas.Map({ kind: Schemas.String, ok: Schemas.Boolean, reason: Schemas.String })
}

export const room = registerMessages(Messages)
