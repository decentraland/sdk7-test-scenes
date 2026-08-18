import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { HEARTBEAT_FRESHNESS_MS } from '../shared/config'
import { ResultSink, Summary, runAll, runSingle, summarize } from '../shared/runner'
import { ServerHeartbeat, Support, TestStatus } from '../shared/schemas'
import { TEST_COUNT, testByIndex } from '../shared/tests'

// Client-side, UI-facing state. Kept in its own module to avoid a circular import
// between setup.ts (builds the world) and ui.tsx (renders the panel).

// --- The CLIENT column ----------------------------------------------------------
// The client's own results never go over the wire. They are a per-renderer control
// run: this client's own engine is the reference the server column is read against,
// so a result that travelled from another machine would be worthless here.
const status: TestStatus[] = new Array(TEST_COUNT).fill(TestStatus.Idle)
const detail: string[] = new Array(TEST_COUNT).fill('')
const durationMs: number[] = new Array(TEST_COUNT).fill(0)

let summary: Summary = summarize(status)
let running = false
let currentIndex = -1

export function getClientResults() {
  return { status, detail, durationMs }
}
export function getClientSummary(): Summary {
  return summary
}
export function isClientRunning(): boolean {
  return running
}
export function getClientCurrentIndex(): number {
  return currentIndex
}

const clientSink: ResultSink = {
  begin(index: number): void {
    status[index] = TestStatus.Running
    detail[index] = ''
  },
  finish(index: number, testStatus: TestStatus, testDetail: string, elapsed: number): void {
    status[index] = testStatus
    detail[index] = testDetail
    durationMs[index] = elapsed
    // Keep the summary live during a run so the banner's client half fills in as it
    // goes, instead of snapping into place at the end.
    summary = summarize(status)

    // Mirror the server's per-row logging. The panel can only show so many rows at
    // once, so the log is where you read the full client column — and it is the only
    // way to compare the two columns row-by-row from outside the game.
    const test = testByIndex(index)
    const glyph = testStatus === TestStatus.Pass ? 'PASS' : 'FAIL'
    console.log(`[CLIENT] ${glyph} #${index} ${test?.name ?? '?'} (${elapsed}ms) — ${testDetail}`)
  },
  setRunning(isRunning: boolean, index: number): void {
    running = isRunning
    currentIndex = index
  },
  publishSummary(next: Summary): void {
    summary = next
  },
  statuses(): TestStatus[] {
    return status
  },
  log(line: string): void {
    console.log(`[CLIENT] ${line}`)
  }
}

export function runClientSuite(): void {
  if (running) {
    showToast('A client run is already in flight.')
    return
  }
  void runAll(clientSink)
}

export function runClientTest(index: number): void {
  if (running) {
    showToast('A client run is already in flight.')
    return
  }
  void runSingle(index, clientSink)
}

// --- Transient toast message ----------------------------------------------------
let toastText = ''
let toastUntil = 0
export function showToast(message: string): void {
  toastText = message
  toastUntil = Date.now() + 3000
}
export function getToast(): string {
  return Date.now() < toastUntil ? toastText : ''
}

// --- Server liveness ------------------------------------------------------------
// isStateSyncronized() only proves the CRDT room is connected — that room can be
// replaying a stale snapshot from a previous server run while the server is still
// cold-booting (~15 s in production) or hasn't started at all. So we track the
// CLIENT-side time at which the heartbeat value last *changed*, not the value
// itself: a stale snapshot never advances, so it can't read as "alive", and
// server/client clock skew is irrelevant.
//
// This scene leans on that harder than most: "platform frozen at the start" is
// exactly what a missing tween system AND a stale snapshot both look like, so the
// verdict is only meaningful while the heartbeat says the server is awake.
let lastBeatValue = 0
let lastBeatSeenAt = 0

export function pollHeartbeat(): void {
  for (const [, heartbeat] of engine.getEntitiesWith(ServerHeartbeat)) {
    if (heartbeat.beatAt !== lastBeatValue) {
      lastBeatValue = heartbeat.beatAt
      lastBeatSeenAt = Date.now()
    }
    break
  }
}

export function isServerAlive(): boolean {
  if (!isStateSyncronized()) return false
  if (lastBeatSeenAt === 0) return false // never observed a tick yet
  return Date.now() - lastBeatSeenAt < HEARTBEAT_FRESHNESS_MS
}

export { Support }
