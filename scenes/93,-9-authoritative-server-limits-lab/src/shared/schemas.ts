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
// The components are split by CHANGE RATE so the per-frame entity-spam counter
// (RunnerState) never re-broadcasts the whole results table (TestResults).
// ---------------------------------------------------------------------------

export enum TestStatus {
  Idle = 0,
  Running = 1,
  Pass = 2, // the limit fired as expected
  Fail = 3 // the operation unexpectedly succeeded (or the wrong error came back)
}

// The results table. Parallel arrays keyed by test index (TESTS[i] ↔ slot i).
// Worst case ≈ TEST_COUNT × (1 enum + string≤80 + int + int64) ≈ ~1.3 KB — far
// under the ~12 KB CRDT chunk cap. `detail` is truncated to RESULT_DETAIL_MAX.
export const TestResults = engine.defineComponent('limitslab::TestResults', {
  status: Schemas.Array(Schemas.EnumNumber<TestStatus>(TestStatus, TestStatus.Idle)),
  detail: Schemas.Array(Schemas.String),
  durationMs: Schemas.Array(Schemas.Int),
  updatedAt: Schemas.Array(Schemas.Int64)
})

// Small + high-rate: which test is running, the busy flag, and the live entity
// spawn progress. Updated every tick during entity spam, hence kept off the
// TestResults entity so it doesn't drag the results array along each frame.
export const RunnerState = engine.defineComponent('limitslab::RunnerState', {
  busy: Schemas.Boolean,
  currentTestIndex: Schemas.Int, // -1 when idle
  liveEntities: Schemas.Int, // spam entities currently alive
  createdEntities: Schemas.Int // spam entities created so far this run
})

// Aggregated tallies for the two comms tests (indices 7 and 8). The server
// writes what it observes; the UI shows the received/sent ratio (drops are
// silent, so the ratio is the only signal).
export const CommsTally = engine.defineComponent('limitslab::CommsTally', {
  testIndex: Schemas.Int,
  sentByServer: Schemas.Int, // #7: how many messages the server tried to emit
  reportedReceivedTotal: Schemas.Int, // #7: summed across reporting clients
  clientsReporting: Schemas.Int,
  inboundReceivedByServer: Schemas.Int, // #8: messages the server actually got
  inboundSentByClient: Schemas.Int // #8: what the flooding client claims it sent
})

// A "last words" marker the server writes BEFORE a destructive op executes, so
// every client can show which test is about to kill the server. It survives in
// the last synced snapshot after the isolate dies.
export const LastWords = engine.defineComponent('limitslab::LastWords', {
  testIndex: Schemas.Int, // -1 when unset
  message: Schemas.String,
  writtenAt: Schemas.Int64
})

// A liveness heartbeat the server pulses every ~2 s. Clients use it to tell
// "server actually awake" from "room merely connected to a stale CRDT snapshot",
// and — crucially here — to detect a destructive test having killed the server.
export const ServerHeartbeat = engine.defineComponent('limitslab::Heartbeat', {
  beatAt: Schemas.Int64
})

// A trivial component carried by every entity-spam entity so each spawned entity
// is non-empty and counts toward the server's maxLiveEntities. It is NOT synced —
// the spam is server-side only (syncing 100k entities would lock the clients);
// clients watch the RunnerState counter instead.
export const SpamMarker = engine.defineComponent('limitslab::SpamMarker', {
  n: Schemas.Int
})

// Register the server-only write guards. Custom components use the global
// (no-entity) validateBeforeChange overload. Called from main() on BOTH sides;
// the isServer() guard makes it a no-op on clients (calling it there errors).
export function registerValidators(): void {
  if (!isServer()) return

  const serverOnly = (value: { senderAddress: string }) =>
    value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase()

  TestResults.validateBeforeChange(serverOnly)
  RunnerState.validateBeforeChange(serverOnly)
  CommsTally.validateBeforeChange(serverOnly)
  LastWords.validateBeforeChange(serverOnly)
  ServerHeartbeat.validateBeforeChange(serverOnly)
  // SpamMarker is intentionally not guarded: it is never synced (server-side only).
}

// Build the initial (all-Idle) results arrays, one slot per registered test.
export function emptyResults() {
  return {
    status: new Array(TEST_COUNT).fill(TestStatus.Idle) as TestStatus[],
    detail: new Array(TEST_COUNT).fill('') as string[],
    durationMs: new Array(TEST_COUNT).fill(0) as number[],
    updatedAt: new Array(TEST_COUNT).fill(0) as number[]
  }
}
