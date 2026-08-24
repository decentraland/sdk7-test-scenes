import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

// ---------------------------------------------------------------------------
// Synced, server-authoritative components. There is NO gameplay here — these
// only exist to make the DELETE_ENTITY exploit observable:
//
//  • ServerHeartbeat — a liveness pulse (~2 s) so the client UI can show the
//    authoritative server is actually awake.
//  • ServerRoster — the SERVER's own view of getEntitiesWith(PlayerIdentityData,
//    Transform), so the client can compare it against its LOCAL view. The
//    exploit injects a delete into the CLIENT's engine only; the server never
//    sees it, so its roster stays intact — that contrast is the whole point.
//
// Keeping these syncEntity()'d also keeps the @dcl/sdk/network transport
// installed, which is the code path the exploit rides on.
//
// The component DEFINITIONS run on both sides (shared componentId). The
// validateBeforeChange() guards only mean something on the server and MUST be
// wrapped in isServer() — see registerValidators().
// ---------------------------------------------------------------------------
export const ServerHeartbeat = engine.defineComponent('avatarpurge::Heartbeat', {
  beatAt: Schemas.Int64 // Date.now() is 13 digits → needs Int64, not Number
})

// The server's authoritative roster of player entities (parallel arrays, atomic
// & compact). Only the server writes it; clients read it to render the "server
// view" panel next to their own local view.
//
// `numbers`/`versions` decompose each packed id (ADR-117) so the swap bug is
// visible: a slot reused WITH a generation bump shows a new `version`; reused
// WITHOUT one keeps the same number+version while `addresses` changes. `warnings`
// carries the server-side swap detector's findings so clients can see them.
export const ServerRoster = engine.defineComponent('avatarpurge::ServerRoster', {
  ids: Schemas.Array(Schemas.Int),
  numbers: Schemas.Array(Schemas.Int),
  versions: Schemas.Array(Schemas.Int),
  addresses: Schemas.Array(Schemas.String),
  warnings: Schemas.Array(Schemas.String),
  updatedAt: Schemas.Int64
})

// Register the server-only write guards. Called from main() on BOTH sides; the
// isServer() guard makes it a no-op on clients (calling it there errors).
export function registerValidators(): void {
  if (!isServer()) return

  const serverOnly = (value: { senderAddress: string }) =>
    value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase()

  ServerHeartbeat.validateBeforeChange(serverOnly)
  ServerRoster.validateBeforeChange(serverOnly)
}
