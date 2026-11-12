import { RESULT_DETAIL_MAX } from '../shared/config'
import { RunnerState, TestResults, TestStatus } from '../shared/schemas'
import { TestCategory, testByIndex } from '../shared/tests'
import { DESTRUCTIVE_TESTS } from './tests/destructive'
import { SAFE_TESTS } from './tests/safe'
import { errMsg, RunnerCtx } from './types'

// ---------------------------------------------------------------------------
// One-test-at-a-time orchestration. The runner guards the busy flag, flips the
// synced TestResults slot for the chosen test, runs its function, and records
// the outcome. Destructive tests never return (the isolate dies), so their slot
// simply stays "Running" — that, plus the stale heartbeat, is expected.
// ---------------------------------------------------------------------------

let ctx: RunnerCtx

export function initRunner(c: RunnerCtx): void {
  ctx = c
}

// Returns false (with no state change) if the runner is already busy, so the
// caller can notify the requester.
export function runTest(testIndex: number, param: number): boolean {
  const test = testByIndex(testIndex)
  if (!test) return true // unknown index — silently ignore, nothing to report

  const rs = RunnerState.getMutable(ctx.stateEntity)
  if (rs.busy) return false

  const fn = test.category === TestCategory.Safe ? SAFE_TESTS[test.id] : DESTRUCTIVE_TESTS[test.id]
  if (!fn) return true

  begin(testIndex)
  const startedAt = Date.now()

  // Run detached: the message handler returns immediately, results arrive via
  // the synced TestResults component.
  void Promise.resolve()
    .then(() => fn(ctx, param))
    .then(
      (outcome) => finish(testIndex, outcome.pass ? TestStatus.Pass : TestStatus.Fail, outcome.detail, startedAt),
      (e) => finish(testIndex, TestStatus.Fail, `unexpected error: ${errMsg(e)}`, startedAt)
    )

  return true
}

function begin(testIndex: number): void {
  const rs = RunnerState.getMutable(ctx.stateEntity)
  rs.busy = true
  rs.currentTestIndex = testIndex

  const r = TestResults.getMutable(ctx.stateEntity)
  r.status[testIndex] = TestStatus.Running
  r.detail[testIndex] = ''
  r.updatedAt[testIndex] = Date.now()
}

function finish(testIndex: number, status: TestStatus, detail: string, startedAt: number): void {
  const r = TestResults.getMutable(ctx.stateEntity)
  r.status[testIndex] = status
  r.detail[testIndex] = truncate(detail)
  r.durationMs[testIndex] = Date.now() - startedAt
  r.updatedAt[testIndex] = Date.now()

  const rs = RunnerState.getMutable(ctx.stateEntity)
  rs.busy = false
  rs.currentTestIndex = -1
}

function truncate(s: string): string {
  return s.length > RESULT_DETAIL_MAX ? `${s.slice(0, RESULT_DETAIL_MAX - 1)}…` : s
}
