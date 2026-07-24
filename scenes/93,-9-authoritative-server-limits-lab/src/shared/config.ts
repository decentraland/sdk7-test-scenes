// ---------------------------------------------------------------------------
// Tunables for the limits lab. Everything here is shared by client + server so
// the UI can label a test with the same number the server actually pushes.
// ---------------------------------------------------------------------------

// Heartbeat cadence (server pulse) and the freshness window clients use to
// decide the server is actually alive (~3× the pulse interval). A destructive
// test that disposes the isolate stops the pulse; clients see the dot go stale
// within HEARTBEAT_FRESHNESS_MS — that staleness IS the pass signal.
export const HEARTBEAT_MS = 2000
export const HEARTBEAT_FRESHNESS_MS = 6000

// The hammurabi-headless limit defaults, mirrored here purely for UI display and
// for sizing the bursts below. These are the server's compiled-in defaults (see
// hammurabi-headless/src/lib/misc/limits.ts); an operator can raise them via
// HAMMURABI_* env vars, in which case a test may stop firing — that is expected
// and is itself a useful thing for QA to observe.
export const LIMITS = {
  maxConcurrentFetches: 32,
  fetchTimeoutMs: 15000,
  maxFetchRedirects: 5,
  maxBodyBytes: 10 * 1024 * 1024,
  maxWsMessageBytes: 1024 * 1024,
  maxOpenSockets: 32,
  maxInflightHostCalls: 40,
  maxSendMessages: 512,
  maxCommsMessageBytes: 30000,
  maxMessagesPerWindow: 300,
  rateWindowMs: 1000,
  maxLiveEntities: 100000,
  maxSyncExecutionMs: 10000,
  maxAsyncTurnMs: 60000,
  isolateMemoryLimitBytes: 256 * 1024 * 1024
}

// External endpoints the fetch / WebSocket tests hit. These must be reachable
// from the SERVER host (the headless runner), not the client. They are grouped
// here precisely so QA can repoint them at internal infra if the public ones
// are blocked, rate-limited or flaky.
export const ENDPOINTS = {
  // A fast 200 OK, used to fill the concurrent-fetch pool.
  fetchOk: 'https://httpbin.org/get',
  // Holds the response headers ~25 s — longer than fetchTimeoutMs (15 s). NOTE:
  // httpbin's /delay caps at 10 s (under the limit, so it never times out); /drip
  // with a `delay` param is NOT capped, so it's the one that actually fires.
  fetchDelay: 'https://httpbin.org/drip?duration=1&delay=25&numbytes=10',
  // Issues 10 hops — more than maxFetchRedirects (5).
  fetchRedirects: 'https://httpbin.org/redirect/10',
  // A body far larger than maxBodyBytes (10 MB). NOTE: httpbin's /bytes caps at
  // ~100 KB (under the limit), so use a real large file instead — 100 MB here,
  // of which only ~10 MB is read before the cap throws.
  fetchBigBody: 'https://proof.ovh.net/files/100Mb.dat',
  // A WebSocket echo server that accepts the connection (the oversized send is
  // rejected locally by the isolate before it leaves, so echo behaviour is moot).
  wsEcho: 'wss://ws.postman-echo.com/raw'
}

// Test sizing — each burst is set comfortably past the corresponding limit so
// the cap fires deterministically rather than sitting right on the boundary.
export const FETCH_BURST = 40 // > maxConcurrentFetches (32)
export const WS_BURST = 40 // > maxOpenSockets (32)
export const HOSTCALL_BURST = 60 // > maxInflightHostCalls (40)
export const SEND_BURST = 700 // > maxSendMessages (512)
export const WS_OVERSIZE_BYTES = 1_200_000 // > maxWsMessageBytes (1 MB)

// Entity-spam batch per tick and the selectable targets shown in the UI.
export const ENTITY_BATCH = 1000
export const ENTITY_TARGETS = [10000, 50000, 100000]

// How long the inbound-rate-limit flood runs (client floods, server counts) and
// how many pings the client emits per frame. At ~30 fps, 40/frame ≈ 1200/s —
// well over the 300/s cap, maximizing the chance the flood survives the SDK's
// per-frame message batching enough to actually trip the inbound limiter.
export const FLOOD_DURATION_MS = 3000
export const FLOOD_PER_FRAME = 40

// Result detail strings are truncated to this before being written to a synced
// component, keeping TestResults well under the CRDT chunk cap.
export const RESULT_DETAIL_MAX = 80
