import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

// ---------------------------------------------------------------------------
// Synced, server-authoritative components.
//
// The component DEFINITIONS run on both sides (so client + server share the same
// componentId / type). The validateBeforeChange() calls, however, only mean
// something on the server and MUST be wrapped in isServer() — see registerValidators().
//
// The components are split atomically by CHANGE RATE, so a 1 Hz countdown never
// re-broadcasts the scoreboard and the once-per-round hall of fame never rides
// along with per-collect score changes.
// ---------------------------------------------------------------------------

export enum RoundPhase {
  Lobby = 0,
  Active = 1,
  Podium = 2
}

// Changes ~once per second (countdown). Smallest possible payload.
// secondsLeft is server-computed so clients need no clock math (skew-free).
export const RoundState = engine.defineComponent('gemrush::RoundState', {
  phase: Schemas.EnumNumber<RoundPhase>(RoundPhase, RoundPhase.Lobby),
  roundNumber: Schemas.Int,
  secondsLeft: Schemas.Int,
  gemsRemaining: Schemas.Int
})

// Changes on every ACCEPTED collect during a round. Parallel arrays (atomic &
// compact), capped at MAX_SCOREBOARD. addresses lets each client highlight itself.
export const RoundScores = engine.defineComponent('gemrush::RoundScores', {
  addresses: Schemas.Array(Schemas.String),
  names: Schemas.Array(Schemas.String),
  scores: Schemas.Array(Schemas.Int)
})

// Changes once per round (podium banner data).
export const LastRound = engine.defineComponent('gemrush::LastRound', {
  roundNumber: Schemas.Int,
  winnerName: Schemas.String,
  winnerScore: Schemas.Int,
  endedAt: Schemas.Int64 // Date.now() is 13 digits → needs Int64
})

// The PERSISTED data, mirrored from server memory: published at boot (after the
// single Storage GET) and once per round end (right after the Storage SETs).
export const HallOfFame = engine.defineComponent('gemrush::HallOfFame', {
  names: Schemas.Array(Schemas.String),
  totalGems: Schemas.Array(Schemas.Int),
  wins: Schemas.Array(Schemas.Int),
  totalRounds: Schemas.Int,
  updatedAt: Schemas.Int64
})

// A liveness heartbeat the server pulses every ~2 s. Clients use it to tell
// "server actually awake" from "room merely connected to a stale CRDT snapshot".
export const ServerHeartbeat = engine.defineComponent('gemrush::Heartbeat', {
  beatAt: Schemas.Int64
})

// One per dynamically spawned gem entity. The gem's position rides HERE — never
// in a synced Transform. Syncing Transform would let a client's local spin
// animation broadcast writes back through the network (Transform has no
// server-only guard); with position inside this guarded component, clients build
// their own local Transform from it and are free to animate.
export const Gem = engine.defineComponent('gemrush::Gem', {
  gemId: Schemas.Int,
  value: Schemas.Int, // NORMAL_VALUE or RARE_VALUE
  position: Schemas.Vector3
})

// Register the server-only write guards. Custom components use the global
// (no-entity) validateBeforeChange overload. Called from main() on BOTH sides;
// the isServer() guard makes it a no-op on clients (calling it there errors).
export function registerValidators(): void {
  if (!isServer()) return

  const serverOnly = (value: { senderAddress: string }) =>
    value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase()

  RoundState.validateBeforeChange(serverOnly)
  RoundScores.validateBeforeChange(serverOnly)
  LastRound.validateBeforeChange(serverOnly)
  HallOfFame.validateBeforeChange(serverOnly)
  ServerHeartbeat.validateBeforeChange(serverOnly)
  Gem.validateBeforeChange(serverOnly)
}
