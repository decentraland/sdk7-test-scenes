// The structural-counter gate (scripts/bench/counters.ts): every bench scenario and every seeded level run counted,
// against benchmarks/counters.baseline.json. Any difference fails with a per-scenario, per-counter diff: a planner
// change that does more (or less) work shows here, on every machine, without a clock. Accept a deliberate one with
// `npm run htn:bench -- --update-counters` and commit the baseline with the change (docs/htn-guidance.md).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectCounters, COUNTERS_BASELINE, levelCounters, readCounters } from '../../../scripts/bench/counters'
import { diffCounters, formatCounterDiff } from '../../../scripts/bench/compare'
import { CrowdLevel } from '../../../src/playground/levels/crowd'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()

test(`structural counters equal ${COUNTERS_BASELINE}`, () => {
  const baseline = readCounters(ROOT)
  assert.ok(baseline, `${COUNTERS_BASELINE} is missing: npm run htn:bench -- --update-counters`)
  const current = collectCounters()
  const changes = diffCounters(baseline, current)
  assert.equal(changes.length, 0, formatCounterDiff(changes, COUNTERS_BASELINE))
  // Every scenario planned, every level planned.
  for (const [name, s] of Object.entries(current.scenarios)) assert.equal(s.status, 'succeeded', name)
  for (const [name, r] of Object.entries(current.runs)) assert.ok((r.plansMade as number) > 0, name)
})

test('counting changes nothing a level does: the same plans and steps with and without counters', () => {
  const counted = levelCounters(new CrowdLevel(10), 30, false)
  const level = new CrowdLevel(10)
  level.recordTraces = false
  level.init()
  level.advanceTime(30)
  assert.equal(counted.plansMade, level.crew.reduce((n, m) => n + m.agent.metrics.plansMade, 0))
  assert.equal(counted.tasksCompleted, level.crew.reduce((n, m) => n + m.agent.metrics.tasksCompleted, 0))
  assert.equal(level.agent.metrics.totalStats, null, 'off by default')
  // And the same counters twice: nothing in them reads a clock.
  assert.deepEqual(levelCounters(new CrowdLevel(10), 30, false), counted)
})
