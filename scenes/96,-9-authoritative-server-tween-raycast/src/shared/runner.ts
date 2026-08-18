import { RESULT_DETAIL_MAX, TEST_TIMEOUT_MS } from './config'
import { errMsg, waitMs } from './harness'
import { Support, TestStatus } from './schemas'
import { TestOutcome, suiteFn } from './suite'
import { RAYCAST_TESTS, RAYCAST_PROBE_INDEX, TESTS, TWEEN_TESTS, TWEEN_PROBE_INDEX } from './tests'

// ---------------------------------------------------------------------------
// One orchestration, two consumers. The server drives it and writes into synced
// components; the client drives it and writes into local module state. Sharing the
// loop is not just tidiness — if the two sides sequenced or timed their runs
// differently, the panel's side-by-side comparison would stop being evidence.
// ---------------------------------------------------------------------------

export interface Summary {
  tween: Support
  raycast: Support
  tweenPassed: number
  tweenTotal: number
  raycastPassed: number
  raycastTotal: number
}

// Where a run reports to. Deliberately push-based: results have to become visible
// row by row as they land, because an unsupported host spends several seconds per
// row waiting out timeouts and a silent panel would look hung.
export interface ResultSink {
  begin(index: number): void
  finish(index: number, status: TestStatus, detail: string, durationMs: number): void
  setRunning(running: boolean, currentIndex: number): void
  publishSummary(summary: Summary): void
  // Reads the sink's current statuses back, so the verdict can be recomputed after
  // ANY finished test — including a single-row re-run, which must be able to flip the
  // banner if the row it re-ran was a probe.
  statuses(): TestStatus[]
  log(line: string): void
}

let busy = false

export function isRunning(): boolean {
  return busy
}

// Runs one test and records it. Returns its status so runAll can summarize without
// reading the sink back.
async function runOne(index: number, sink: ResultSink): Promise<TestStatus> {
  const test = TESTS[index]
  const fn = suiteFn(index)
  if (!test || !fn) return TestStatus.Idle

  sink.begin(index)
  sink.setRunning(true, index)
  const startedAt = Date.now()

  let status = TestStatus.Fail
  let detail = ''
  try {
    // The per-test ceiling. Every wait inside a test already has its own deadline,
    // so hitting this one means a test is genuinely stuck rather than merely
    // waiting on a component the host will never write — worth saying out loud.
    // `null` is the timeout sentinel — a plain value the compiler can narrow on.
    const outcome = await Promise.race<TestOutcome | null>([
      fn(),
      waitMs(TEST_TIMEOUT_MS).then(() => null)
    ])
    if (outcome === null) {
      detail = `test exceeded its ${TEST_TIMEOUT_MS}ms ceiling`
    } else {
      status = outcome.pass ? TestStatus.Pass : TestStatus.Fail
      detail = outcome.detail
    }
  } catch (e) {
    detail = `unexpected error: ${errMsg(e)}`
  }

  const durationMs = Date.now() - startedAt
  sink.finish(index, status, truncate(detail), durationMs)
  // Republish after every row, so the banner and the row fill in together rather
  // than the verdict lagging a whole run behind.
  sink.publishSummary(summarize(sink.statuses()))
  return status
}

// Runs one test on demand. Returns false without touching anything if a run is
// already in flight, so the caller can tell the requester why nothing happened.
export async function runSingle(index: number, sink: ResultSink): Promise<boolean> {
  if (busy) return false
  busy = true
  try {
    await runOne(index, sink)
  } finally {
    busy = false
    sink.setRunning(false, -1)
  }
  return true
}

// Runs the whole suite in registry order and publishes the verdict at the end.
// Sequential on purpose: the tests share the lab lanes and several of them read
// timing, so overlapping runs would contaminate each other.
export async function runAll(sink: ResultSink): Promise<boolean> {
  if (busy) return false
  busy = true

  try {
    for (const test of TESTS) {
      await runOne(test.index, sink)
    }
  } finally {
    busy = false
    sink.setRunning(false, -1)
  }

  // A banner rather than a line, so it survives being skimmed in a log stream. This
  // is what QA copies when recording which server build was under test.
  const summary = summarize(sink.statuses())
  sink.log(
    '══════════════════════════════════════════════\n' +
      ` TWEEN   : ${supportName(summary.tween)} — ${summary.tweenPassed}/${summary.tweenTotal} passed\n` +
      ` RAYCAST : ${supportName(summary.raycast)} — ${summary.raycastPassed}/${summary.raycastTotal} passed\n` +
      '══════════════════════════════════════════════'
  )
  return true
}

// The verdict rests on the two PROBE rows, not on the pass tally: a probe failure
// means the host never wrote the component, which is a categorically different
// finding from "the feature is there but one detail is wrong". A host that passes
// its probe but fails other rows reads as Supported — with a visible partial score.
export function summarize(statuses: TestStatus[]): Summary {
  const passed = (tests: typeof TWEEN_TESTS) => tests.filter((t) => statuses[t.index] === TestStatus.Pass).length
  const verdict = (probeIndex: number): Support => {
    const probe = statuses[probeIndex]
    if (probe === TestStatus.Pass) return Support.Supported
    if (probe === TestStatus.Fail) return Support.Unsupported
    return Support.Unknown
  }

  return {
    tween: verdict(TWEEN_PROBE_INDEX),
    raycast: verdict(RAYCAST_PROBE_INDEX),
    tweenPassed: passed(TWEEN_TESTS),
    tweenTotal: TWEEN_TESTS.length,
    raycastPassed: passed(RAYCAST_TESTS),
    raycastTotal: RAYCAST_TESTS.length
  }
}

export function supportName(support: Support): string {
  switch (support) {
    case Support.Supported:
      return 'SUPPORTED'
    case Support.Unsupported:
      return 'NOT SUPPORTED'
    default:
      return 'unknown'
  }
}

function truncate(detail: string): string {
  return detail.length > RESULT_DETAIL_MAX ? `${detail.slice(0, RESULT_DETAIL_MAX - 1)}…` : detail
}
