import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distribution, measureWorkload, WORKLOADS } from '../../scripts/bench/execution'

test('release CPU reports count cold/warm/batched work and keep raw samples in microseconds', () => {
  const config = { warmup: 1, samples: 2, batch: 2 }
  const operations = 1 + (config.warmup + config.samples) * config.batch
  for (const name of WORKLOADS) {
    let clock = 0
    const row = measureWorkload(name, config, () => ++clock)
    assert.equal(row.coldUs, 1000)
    assert.deepEqual(row.samplesUs, [500, 500])
    assert.equal(row.warm.p99, 500)
    assert.equal(row.unit, 'microseconds per operation')
    assert.equal(row.dimensions.trace, false)
    if (name.startsWith('plan-')) {
      assert.equal(row.accounting.plans, operations)
      assert.ok(row.accounting.primitiveSteps > 0)
      assert.ok(Number(row.dimensions.factRows) > 0)
    } else if (name.startsWith('dispatch-')) {
      assert.equal(row.accounting.runs, operations)
      assert.equal(row.accounting.completions, operations * Number(row.dimensions.primitiveSteps))
    } else if (name.startsWith('action-')) {
      assert.equal(row.accounting.starts, operations)
      assert.equal(row.accounting.completions, operations)
      assert.ok(row.accounting.updates > operations)
      if (name === 'action-wait') assert.equal(row.accounting.updates, operations * 15)
    } else {
      assert.equal(row.accounting.frames, operations)
      assert.equal(row.accounting.npcTicks, operations * Number(row.dimensions.npcs))
      assert.equal(row.accounting.checks, 0)
      assert.ok(row.accounting.plans > 0)
      assert.ok(row.accounting.reasoning > 0)
      assert.equal(row.accounting.moving, Number(row.dimensions.npcs))
      if (name === 'tick-32-replan') assert.equal(row.accounting.plans, operations * 32)
    }
  }
})

test('release CPU distributions reject empty/invalid samples and preserve tails', () => {
  assert.throws(() => distribution([]))
  assert.throws(() => distribution([NaN]))
  assert.deepEqual(distribution([4, 1, 3, 2]), { p50: 2, p95: 4, p99: 4, max: 4, mean: 2.5 })
  assert.throws(() => measureWorkload('plan-idle', { warmup: 0, samples: 1, batch: 1 }))
})