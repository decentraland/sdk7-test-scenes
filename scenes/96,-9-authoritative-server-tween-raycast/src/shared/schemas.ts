import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { TEST_COUNT } from './tests'

// ---------------------------------------------------------------------------
// Synced, server-authoritative components.
//
// The component DEFINITIONS run on both sides (so client + server share the same
// componentId / type). The validateBeforeChange() calls, however, only mean
// something on the server and MUST be wrapped in isServer() — see registerValidators().
//
// Components are split by CHANGE RATE: the 8 Hz live-rig sample must never drag
// the whole results table along with it over the wire.
// ---------------------------------------------------------------------------

export enum TestStatus {
  Idle = 0,
  Running = 1,
  Pass = 2,
  Fail = 3
}

// A capability verdict, kept separate from a test result on purpose: "we have not
// probed yet" and "we probed and the feature is missing" must not render the same.
export enum Support {
  Unknown = 0,
  Supported = 1,
  Unsupported = 2
}

// The SERVER's results table, one slot per registered test (TESTS[i] ↔ slot i).
// Worst case ≈ 17 × (enum + string≤90 + int + int64) ≈ 2 KB, well under the ~12 KB
// CRDT chunk cap. Client results are NOT here — they never leave the client that
// produced them (see client/state.ts), because each client's column is about its
// own renderer.
export const ServerResults = engine.defineComponent('tweenray::ServerResults', {
  status: Schemas.Array(Schemas.EnumNumber<TestStatus>(TestStatus, TestStatus.Idle)),
  detail: Schemas.Array(Schemas.String),
  durationMs: Schemas.Array(Schemas.Int)
})

// The headline verdict, derived by the server from its own run. Small and rarely
// written, so the banner never waits on the results table.
export const ServerCapabilities = engine.defineComponent('tweenray::Capabilities', {
  tween: Schemas.EnumNumber<Support>(Support, Support.Unknown),
  raycast: Schemas.EnumNumber<Support>(Support, Support.Unknown),
  tweenPassed: Schemas.Int,
  tweenTotal: Schemas.Int,
  raycastPassed: Schemas.Int,
  raycastTotal: Schemas.Int,
  // True while a suite run is in flight, so clients can disable the RUN buttons.
  running: Schemas.Boolean,
  // -1 when idle, otherwise the test index currently executing.
  currentIndex: Schemas.Int,
  completedAt: Schemas.Int64
})

// The always-on live rig, sampled by the server at RIG_SAMPLE_HZ. This is the
// glanceable half of the scene: `platformPosition` is where the SERVER's engine
// believes its tweened platform is, and `beamBreaks` only ever increments if the
// server's own raycast saw that platform cross its beam. On a server missing
// either feature the position stays frozen at the start and beamBreaks stays 0.
export const LiveRig = engine.defineComponent('tweenray::LiveRig', {
  platformPosition: Schemas.Vector3,
  // TweenState.state as the server reads it, or -1 when no TweenState exists at all.
  tweenState: Schemas.Int,
  tweenProgress: Schemas.Float,
  // Distinct RaycastResult.tickNumber values the server has observed. Stuck at 0
  // means the raycast never resolved even once.
  rayTicks: Schemas.Int,
  // Distance to the beam's current hit, or -1 when the beam is clear.
  beamHitLength: Schemas.Float,
  // Clear → hit transitions since the server booted. The rig's headline number.
  beamBreaks: Schemas.Int,
  sampledAt: Schemas.Int64
})

// A liveness heartbeat the server pulses every ~2 s. Clients use it to tell
// "server actually awake" from "room merely connected to a stale CRDT snapshot" —
// which matters a lot here, because a stale snapshot and a server with no tween
// system both look like a frozen platform.
export const ServerHeartbeat = engine.defineComponent('tweenray::Heartbeat', {
  beatAt: Schemas.Int64
})

// Register the server-only write guards. Custom components use the global
// (no-entity) validateBeforeChange overload. Called from main() on BOTH sides;
// the isServer() guard makes it a no-op on clients (calling it there errors).
export function registerValidators(): void {
  if (!isServer()) return

  const serverOnly = (value: { senderAddress: string }) =>
    value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase()

  ServerResults.validateBeforeChange(serverOnly)
  ServerCapabilities.validateBeforeChange(serverOnly)
  LiveRig.validateBeforeChange(serverOnly)
  ServerHeartbeat.validateBeforeChange(serverOnly)
}

// Build the initial (all-Idle) results arrays, one slot per registered test.
export function emptyResults() {
  return {
    status: new Array(TEST_COUNT).fill(TestStatus.Idle) as TestStatus[],
    detail: new Array(TEST_COUNT).fill('') as string[],
    durationMs: new Array(TEST_COUNT).fill(0) as number[]
  }
}
