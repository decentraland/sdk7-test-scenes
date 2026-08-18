import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// All message payloads must be declared with Schemas.Map(...) — plain JS objects
// fail binary serialization. Everything the server broadcasts (results, verdict,
// live rig) travels via synced components instead — see shared/schemas.ts — so the
// only messages here are the client's requests to re-run something.
export const Messages = {
  // Client → server: re-run the whole server-side suite. Intent only; the client
  // never runs the server's tests for it.
  runServerSuite: Schemas.Map({}),

  // Client → server: re-run one server-side test by index.
  runServerTest: Schemas.Map({ index: Schemas.Int }),

  // Server → one client: a transient notice to toast (e.g. "a run is already in flight").
  notice: Schemas.Map({ text: Schemas.String })
}

export const room = registerMessages(Messages)
