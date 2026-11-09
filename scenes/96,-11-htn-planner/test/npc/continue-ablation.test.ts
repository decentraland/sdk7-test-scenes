// The continue ablation (test/npc/continue-ablation.ts; the table in docs/htn-level-metrics.md): the same guard
// domain with one continue branch, continueTask on and off, two visitors whose distance order keeps flipping.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guardDomain } from '../../src/examples/guard/guard.htn'
import { CONTINUE_SCENARIOS, continueDomain, formatSummaries, runContinueSim, summarize } from './continue-ablation'

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const fixture = continueDomain()

test('the continue fixture compiles', () => {
  assert.deepEqual(fixture.errors, [])
})

for (const scenario of CONTINUE_SCENARIOS) {
  test(`continue ablation (${scenario.name}): off, the continue branch is inert (the live guard's run); on, the guard stops re-targeting`, t => {
    const domain = fixture.ir
    if (domain === null) return
    const off = SEEDS.map(seed => runContinueSim(domain, { seed, scenario }))
    const reference = SEEDS.map(seed => runContinueSim(guardDomain, { seed, scenario }))
    const on = SEEDS.map(seed => runContinueSim(domain, { seed, scenario, continueTask: '!continue' }))
    assert.deepEqual(off, reference, 'continueTask off: nothing publishes (running ...), so the fixture plans as the live guard')
    const sOff = summarize('off', off)
    const sOn = summarize('on', on)
    t.diagnostic(`${scenario.name}, seeds ${SEEDS[0]}-${SEEDS[SEEDS.length - 1]} x ${off[0].seconds} s\n${formatSummaries([sOff, sOn])}`)
    assert.ok(sOff.retargetsPerMin > 2, `the scenario makes the guard re-target: ${sOff.retargetsPerMin}/min`)
    assert.ok(sOn.retargetsPerMin < sOff.retargetsPerMin / 4, `continue branches keep the chase: ${sOn.retargetsPerMin} vs ${sOff.retargetsPerMin}/min`)
    assert.ok(sOn.newPlansPerMin < sOff.newPlansPerMin, 'fewer new plans')
    assert.ok(sOn.continuedPerMin > 0)
    assert.equal(sOff.continuedPerMin, 0)
  })
}
