// The seeded random numbers of the simulation (src/htn-planner/npc/rng.ts): one seed, the same numbers on every run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SEED, Rng } from '../../src/htn-planner/npc/rng'

const draw = (r: Rng, n: number) => Array.from({ length: n }, () => r.next())

test('the same seed gives the same numbers; another seed others', () => {
  assert.deepEqual(draw(new Rng(7), 20), draw(new Rng(7), 20))
  assert.notDeepEqual(draw(new Rng(7), 20), draw(new Rng(8), 20))
  assert.deepEqual(draw(new Rng(), 5), draw(new Rng(DEFAULT_SEED), 5), 'no seed: the default one')
})

test('numbers are in [0, 1) and spread over it', () => {
  const xs = draw(new Rng(1), 10000)
  assert.ok(xs.every(x => x >= 0 && x < 1))
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  assert.ok(Math.abs(mean - 0.5) < 0.02, `mean ${mean}`)
  const buckets = new Array(10).fill(0)
  for (const x of xs) buckets[Math.floor(x * 10)]++
  assert.ok(buckets.every(b => b > 850 && b < 1150), buckets.join(' '))
})

test('int, range and pick stay in their bounds', () => {
  const r = new Rng(3)
  for (let i = 0; i < 1000; i++) {
    const n = r.int(4)
    assert.ok(Number.isInteger(n) && n >= 0 && n < 4)
    const x = r.range(-2, 3)
    assert.ok(x >= -2 && x < 3)
    assert.ok(['a', 'b'].includes(r.pick(['a', 'b'])))
  }
  assert.equal(r.int(0), 0)
  assert.throws(() => r.pick([]))
})

test('a fork is its own stream: the same per label, independent of how much the parent drew', () => {
  const a = new Rng(5)
  const b = new Rng(5)
  draw(b, 3)
  assert.deepEqual(draw(a.fork('guard-1'), 5), draw(b.fork('guard-1'), 5))
  assert.notDeepEqual(draw(new Rng(5).fork('guard-1'), 5), draw(new Rng(5).fork('guard-2'), 5))
  assert.notDeepEqual(draw(new Rng(5).fork('guard-1'), 5), draw(new Rng(6).fork('guard-1'), 5))
})

test('seeds are whole 32-bit numbers: a fraction or a negative seed still works and is kept', () => {
  assert.equal(new Rng(-1).seed, 0xffffffff)
  assert.equal(new Rng(2.9).seed, 2)
  assert.ok(draw(new Rng(-1), 3).every(x => x >= 0 && x < 1))
})
