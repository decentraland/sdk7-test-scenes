// Planning times on a coarse clock (src/debugger/timing.ts): the Explorer's performance.now() is Date.now(), 1 ms
// steps, and a plan takes well under 1 ms, so one reading is 0 or 1; the mean over many plans is the real figure.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetWaits, clockStep, formatMs, planTimes } from '../../src/debugger/timing'
import { runTitle } from '../../src/debugger/runs'
import type { PlanRun } from '../../src/htn-planner'

/** A clock that moves by `step` every `every` reads. */
function steppedClock(step: number, every: number) {
  let reads = 0
  return () => Math.floor(reads++ / every) * step
}

test('clockStep: the smallest step the clock moves by', () => {
  assert.equal(clockStep(steppedClock(1, 50)), 1)
  assert.equal(clockStep(steppedClock(0.005, 1)), 0.005)
  assert.equal(clockStep(() => 7, 3, 1000), Infinity, 'a clock that never moves')
})

test('formatMs: below a coarse clock step it says so; a fine clock shows two decimals', () => {
  assert.equal(formatMs(0, 1), '<1 ms')
  assert.equal(formatMs(1, 1), '1 ms')
  assert.equal(formatMs(3, 1), '3 ms')
  assert.equal(formatMs(0.25, 0.001), '0.25 ms')
  assert.equal(formatMs(0, 0.001), '0.00 ms')
  assert.equal(formatMs(12.4, 0.001), '12 ms')
})

test('planTimes: the mean over every plan (unbiased on a 1 ms clock), last and max read against the step', () => {
  const m = { lastPlanMs: 0, totalPlanMs: 3, maxPlanMs: 1, plansMade: 40, tasksCompleted: 5 }
  assert.equal(planTimes(m, 1), 'mean 0.075 ms · last <1 ms · max 1 ms (1 ms clock)')
  assert.equal(planTimes({ ...m, lastPlanMs: 0.31, totalPlanMs: 12, maxPlanMs: 0.9 }, 0.001), 'mean 0.30 ms · last 0.31 ms · max 0.90 ms')
  assert.equal(planTimes({ ...m, plansMade: 0, totalPlanMs: 0 }, 1), 'no plan yet')
})

test('runTitle: a run timed below the clock step', () => {
  const run: PlanRun = { seq: 3, deferred: false, method: 0, args: [], status: 'succeeded', plan: [], ms: 0, world: 0, nodes: [] }
  assert.equal(runTitle(run, 'behave', 1), '#3 behave · succeeded · 0 steps · <1 ms')
})

test('budgetWaits: nothing without waits, else how often and the longest wait in frames', () => {
  assert.equal(budgetWaits({}), '')
  assert.equal(budgetWaits({ budgetDeferred: 0, budgetMaxWaitFrames: 0 }), '')
  assert.equal(budgetWaits({ budgetDeferred: 3, budgetMaxWaitFrames: 2 }), 'budget: waited 3× · max 2 fr')
})
