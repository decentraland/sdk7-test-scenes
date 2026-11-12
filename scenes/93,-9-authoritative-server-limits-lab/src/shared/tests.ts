import { ENTITY_TARGETS } from './config'

// ---------------------------------------------------------------------------
// The test registry — the single source of truth shared by the UI and the
// server dispatch. Both sides iterate TESTS keyed by `index`, so a row in the
// panel and the server branch that runs it can never drift apart. Adding a test
// is a one-line edit here; everything else keys off `index`.
// ---------------------------------------------------------------------------

export enum TestCategory {
  Safe = 0, // the server catches an error or measures dropped/shed counts
  Destructive = 1 // the server isolate is disposed — the whole scene dies
}

export interface TestDescriptor {
  id: string // stable key, e.g. 'fetch-concurrency'
  index: number // 0..N — the compact array slot used by every synced component
  name: string // short human label for the UI row
  category: TestCategory
  limitLabel: string // the limit + its default, e.g. 'maxConcurrentFetches = 32'
  description: string // one line: what the server does
  expected: string // what QA should see when the limit fires (the pass criterion)
  paramOptions?: number[] // if present, the UI shows a value picker (entity spam)
}

// Order matters: the UI renders in this order, Safe first then Destructive.
export const TESTS: TestDescriptor[] = [
  {
    id: 'fetch-concurrency',
    index: 0,
    name: 'Concurrent fetches',
    category: TestCategory.Safe,
    limitLabel: 'maxConcurrentFetches = 32',
    description: 'Fires 40 fetches at once from the server.',
    expected: 'Some reject with "too many concurrent requests"; detail shows N rejected.'
  },
  {
    id: 'fetch-timeout',
    index: 1,
    name: 'Fetch timeout',
    category: TestCategory.Safe,
    limitLabel: 'fetchTimeoutMs = 15000',
    description: 'Fetches an endpoint that delays ~30 s.',
    expected: 'Rejects with "timeout after Nms" (after the retries).'
  },
  {
    id: 'fetch-redirects',
    index: 2,
    name: 'Fetch redirects',
    category: TestCategory.Safe,
    limitLabel: 'maxFetchRedirects = 5',
    description: 'Fetches an endpoint that issues 10 redirects.',
    expected: 'Rejects with "fetch: too many redirects".'
  },
  {
    id: 'fetch-body-size',
    index: 3,
    name: 'Fetch body size',
    category: TestCategory.Safe,
    limitLabel: 'maxBodyBytes = 10 MB',
    description: 'Fetches a >10 MB response body.',
    expected: 'Rejects with "response body exceeds N bytes".'
  },
  {
    id: 'ws-message-size',
    index: 4,
    name: 'WebSocket message size',
    category: TestCategory.Safe,
    limitLabel: 'maxWsMessageBytes = 1 MB',
    description: 'Sends a >1 MB frame + a small sentinel to a WS echo server.',
    expected: 'Oversized frame is dropped (silent to the scene); only the sentinel echoes back.'
  },
  {
    id: 'ws-open-sockets',
    index: 5,
    name: 'Open sockets',
    category: TestCategory.Safe,
    limitLabel: 'maxOpenSockets = 32',
    description: 'Opens 40 WebSockets from the server.',
    expected: 'The 33rd constructor throws "too many open connections for this scene".'
  },
  {
    id: 'inflight-host-calls',
    index: 6,
    name: 'In-flight host calls',
    category: TestCategory.Safe,
    limitLabel: 'maxInflightHostCalls = 40',
    description: 'Bursts 60 simultaneous host calls.',
    expected: 'Excess reject with "too many concurrent host calls".'
  },
  {
    id: 'send-binary-burst',
    index: 7,
    name: 'Outbound comms burst',
    category: TestCategory.Safe,
    limitLabel: 'maxSendMessages = 512',
    description: 'Server emits 700 messages in one turn; clients tally arrivals.',
    expected: 'Clients receive fewer than 700 (excess silently dropped).'
  },
  {
    id: 'inbound-rate-limit',
    index: 8,
    name: 'Inbound rate limit',
    category: TestCategory.Safe,
    limitLabel: 'maxMessagesPerWindow = 300 / s',
    description: 'A client floods tiny messages for ~3 s; server counts arrivals.',
    expected: 'Server-received count plateaus near 300/s while the client sent more.'
  },
  {
    id: 'entity-spam',
    index: 9,
    name: 'Entity spam',
    category: TestCategory.Safe,
    limitLabel: 'maxLiveEntities = 100000',
    description: 'Server spawns entities (server-side only) in 1k/tick batches to a target.',
    expected: 'Live/made counters climb, stalling near the cap at 100k. Cleanup despawns.',
    paramOptions: ENTITY_TARGETS
  },
  {
    id: 'sync-timeout',
    index: 10,
    name: 'Sync execution timeout',
    category: TestCategory.Destructive,
    limitLabel: 'maxSyncExecutionMs = 10000',
    description: 'Server busy-waits >10 s inside one sync turn.',
    expected: 'V8 aborts and disposes the isolate — the server dies (heartbeat goes stale).'
  },
  {
    id: 'async-turn-timeout',
    index: 11,
    name: 'Async turn timeout',
    category: TestCategory.Destructive,
    limitLabel: 'maxAsyncTurnMs = 60000',
    description: 'Server hangs a turn (a transport whose send never resolves).',
    expected: 'Engine loop freezes (heartbeat stops within seconds); watchdog disposes the isolate at 60 s.'
  },
  {
    id: 'memory-oom',
    index: 12,
    name: 'Isolate memory OOM',
    category: TestCategory.Destructive,
    limitLabel: 'isolateMemoryLimitBytes = 256 MB',
    description: 'Server allocates buffers until it exhausts the isolate heap.',
    expected: 'isolated-vm terminates the isolate — the server dies (heartbeat goes stale).'
  }
]

export const TEST_COUNT = TESTS.length

export function testByIndex(index: number): TestDescriptor | undefined {
  return TESTS[index]
}

export function testById(id: string): TestDescriptor | undefined {
  return TESTS.find((t) => t.id === id)
}
