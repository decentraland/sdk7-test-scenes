import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// All message payloads must be declared with Schemas.Map(...) — plain JS objects
// fail binary serialization. Every message here is intentionally tiny; anything
// "broadcast" (test results, runner state, tallies) travels via synced
// components instead — see shared/schemas.ts.
//
// The one deliberate exception is `commsBurst`: it is emitted 700× in a single
// server turn precisely to overflow maxSendMessages, so clients can measure how
// many actually arrive.
export const Messages = {
  // Client → server: "run test <testIndex>." `param` carries the entity-spam
  // target (0 when unused). Intent only — the client never runs the test itself.
  runTest: Schemas.Map({ testIndex: Schemas.Int, param: Schemas.Int }),

  // Client → server: despawn all entity-spam entities.
  cleanup: Schemas.Map({}),

  // Server → all: one of the 700-message burst (#7). Clients count arrivals.
  commsBurst: Schemas.Map({ testIndex: Schemas.Int, seq: Schemas.Int }),

  // Client → server: how many `commsBurst` messages I received (#7).
  reportCommsTally: Schemas.Map({ testIndex: Schemas.Int, received: Schemas.Int }),

  // Client → server: a tiny flood ping (#8). Sent hundreds/sec for ~3 s.
  floodPing: Schemas.Map({ seq: Schemas.Int }),

  // Client → server: how many flood pings I sent in total (#8).
  reportFloodSent: Schemas.Map({ testIndex: Schemas.Int, sent: Schemas.Int }),

  // Server → one client: a transient notice to toast (e.g. "runner busy").
  notice: Schemas.Map({ text: Schemas.String })
}

export const room = registerMessages(Messages)
