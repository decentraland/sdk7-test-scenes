// Steady-state allocation guard: a warm PlanRunner allocates (next to) nothing per plan (engine.ts header, as
// upstream's generated planner: 0 alloc/plan). Measured as the bench does (scripts/bench/alloc.ts: V8 heap used plus
// what each GC freed, net of an empty loop, the smaller of two runs). The limits are far above the measured values
// (0-40 B/plan; the 40 are the scenario's host callterms returning a FLOAT) and far below the allocating engine's
// (1.6-14 KB/plan, FactHeavy100 731 KB): noise cannot fail it, a closure or array per node or per plan can.
// Without --expose-gc (npm test) the measurement only lacks its full GC before: what a GC frees is still counted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { measureAllocation } from '../../../scripts/bench/alloc'
import { benchCases } from '../../../scripts/bench/suite'
import { PlanRunner } from '../../../src/htn-planner/htn/planner'

/** Bytes per plan allowed after warm-up, per bench scenario. */
const LIMITS: Record<string, number> = {
  Combat: 256, // complex_scenario: its test callterm get_max_speed returns a new FLOAT (40 B/plan)
  FactHeavy100: 1024,
  'AAA melee': 256,
  'Guard patrol': 256,
  'Stalker patrol': 256
}

test('allocations: a warm runner plans the bench scenarios with (next to) no heap allocation', () => {
  const cases = benchCases().filter(c => c.name in LIMITS)
  assert.equal(cases.length, Object.keys(LIMITS).length, 'every limited scenario exists')
  const report: string[] = []
  for (const c of cases) {
    const world = c.world()
    const runner = new PlanRunner(c.domain, world, c.options?.(world) ?? {})
    const args = c.args ?? []
    const plans = c.heavy ? 100 : 2000
    for (let i = 0; i < plans / 4; i++) runner.plan(c.method, args) // warm: JIT, and every pool at its size
    const m = measureAllocation(() => runner.plan(c.method, args), plans)
    report.push(`${c.name}: ${m.bytesPerCall.toFixed(1)} B/plan`)
    assert.ok(m.bytesPerCall <= LIMITS[c.name], `${c.name}: ${m.bytesPerCall.toFixed(1)} B/plan > ${LIMITS[c.name]}\n${report.join('\n')}`)
  }
  console.log(report.join('\n'))
})
