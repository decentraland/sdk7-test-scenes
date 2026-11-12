import { engine } from '@dcl/sdk/ecs'
import { LIMITS } from '../../shared/config'
import { LastWords } from '../../shared/schemas'
import { testByIndex } from '../../shared/tests'
import { RunnerCtx, TestFn, TestOutcome } from '../types'

// ---------------------------------------------------------------------------
// The 3 DESTRUCTIVE tests. Each intentionally disposes the server isolate, so
// the whole scene dies until the runner restarts it. There is NO in-band pass:
// the isolate is gone before any result could be written. The pass signal is
// out-of-band — the heartbeat goes stale on every client, and the LastWords
// marker (written + synced just before the kill) names which test did it.
//
// Each test first announces itself via LastWords, forces a heartbeat, and waits
// long enough for that CRDT update to reach clients BEFORE executing the kill.
// ---------------------------------------------------------------------------

const ANNOUNCE_SYNC_MS = 1200

async function announce(ctx: RunnerCtx, testIndex: number): Promise<void> {
  const test = testByIndex(testIndex)
  const lw = LastWords.getMutable(ctx.stateEntity)
  lw.testIndex = testIndex
  lw.message = `Executing "${test?.name ?? testIndex}" — the server is expected to die now.`
  lw.writtenAt = Date.now()
  ctx.beatNow()
  // Let the LastWords + heartbeat updates flush to clients before we stall/kill.
  await ctx.delay(ANNOUNCE_SYNC_MS)
}

// #10 — maxSyncExecutionMs = 10000. Busy-wait past the sync-turn budget so V8
// aborts the callback and the runtime disposes the isolate.
const syncTimeout: TestFn = async (ctx): Promise<TestOutcome> => {
  await announce(ctx, 10)
  const overshoot = LIMITS.maxSyncExecutionMs + 2000
  const start = Date.now()
  // Tight synchronous loop — never yields, so the runtime's sync-execution
  // timeout fires and the isolate is disposed mid-loop.
  while (Date.now() - start < overshoot) {
    // spin
  }
  // Unreachable in practice — the isolate is gone before we get here.
  return { pass: false, detail: 'survived the sync busy-wait (limit not enforced?)' }
}

// #11 — maxAsyncTurnMs = 60000. The runtime races each scene TURN (the SDK's
// onUpdate promise) against this timer. A detached `await new Promise(()=>{})` in
// scene code does NOT hang the turn — the turn's promise is the SDK's, which the
// scene never awaits — so that approach silently does nothing.
//
// The real lever: engine.update() awaits every transport's send() sequentially
// (crdt sendMessages). Registering a transport whose send() never resolves hangs
// the turn, so onUpdate never settles and the watchdog rejects + disposes the
// isolate. The engine loop freezes at that await, so the heartbeat also stops —
// clients see the dot go offline within seconds (not only at the 60 s deadline).
// filter:()=>false keeps it from touching real message routing.
const asyncTurnTimeout: TestFn = async (ctx): Promise<TestOutcome> => {
  await announce(ctx, 11)
  engine.addTransport({
    send: () => new Promise<void>(() => {}),
    filter: () => false,
    type: 'limitslab-hang'
  })
  // The very next turn hangs on the transport above; keep this fn pending so it
  // never records a (never-syncable) result before the isolate is disposed.
  await new Promise<void>(() => {})
  return { pass: false, detail: 'turn did not hang (transport send not awaited?)' }
}

// #12 — isolateMemoryLimitBytes = 256 MB. Exhaust the V8 MANAGED HEAP so the
// isolate's memory limit trips and isolated-vm disposes the isolate.
//
// Deliberately NOT ArrayBuffers/typed arrays: their backing store is external
// memory, and a failed allocation is a *catchable* `RangeError: Array buffer
// allocation failed` that leaves the isolate alive (observed the first time this
// shipped). Retained plain objects/strings grow old-space instead, which trips
// the heap limit and forces disposal.
const memoryOom: TestFn = async (ctx): Promise<TestOutcome> => {
  await announce(ctx, 12)
  const hog: unknown[] = []
  // Tight synchronous loop. If a single allocation throws a catchable error we
  // swallow it and keep piling on pressure — so the isolate dies either from the
  // memory limit or, failing that, from the sync-execution watchdog (the loop
  // never yields). Death is the point; which limit fires is immaterial.
  while (true) {
    try {
      const block = new Array<Record<string, unknown>>(100_000)
      for (let i = 0; i < block.length; i++) block[i] = { i, s: 'limitslab-oom-' + i }
      hog.push(block)
    } catch {
      // ignore and keep going
    }
  }
}

export const DESTRUCTIVE_TESTS: Record<string, TestFn> = {
  'sync-timeout': syncTimeout,
  'async-turn-timeout': asyncTurnTimeout,
  'memory-oom': memoryOom
}
