import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

// ---------------------------------------------------------------------------
// Synced, server-authoritative components.
//
// The component DEFINITIONS run on both sides (so client + server share the same
// componentId / type). The validateBeforeChange() calls, however, only mean
// something on the server and MUST be wrapped in isServer() — see registerValidators().
// ---------------------------------------------------------------------------

// The ranked leaderboard. Two parallel arrays (atomic & compact) instead of a
// stringified blob, so the synced payload stays small and typed. This component
// only changes when the ranking changes — never every frame.
export const Leaderboard = engine.defineComponent('leaderboard::Board', {
  names: Schemas.Array(Schemas.String),
  scores: Schemas.Array(Schemas.Int),
  updatedAt: Schemas.Int64 // Date.now() is 13 digits → needs Int64, not Number
})

// A liveness heartbeat the server pulses every ~2 s. Kept in its own component
// (atomic design): a fast-changing field never piggybacks on the slow-changing
// leaderboard. Clients use it to tell "server actually awake" from "room merely
// connected to a stale CRDT snapshot".
export const ServerHeartbeat = engine.defineComponent('leaderboard::Heartbeat', {
  beatAt: Schemas.Int64
})

// Register the server-only write guards. Custom components use the global
// (no-entity) validateBeforeChange overload. Called from main() on BOTH sides;
// the isServer() guard makes it a no-op on clients (calling it there errors).
export function registerValidators(): void {
  if (!isServer()) return

  const serverOnly = (value: { senderAddress: string }) =>
    value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase()

  Leaderboard.validateBeforeChange(serverOnly)
  ServerHeartbeat.validateBeforeChange(serverOnly)
}
