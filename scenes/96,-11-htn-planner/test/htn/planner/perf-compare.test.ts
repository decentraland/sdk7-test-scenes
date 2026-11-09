// The performance gate's pure logic (scripts/bench/compare.ts): the structural-counter diff that npm test fails on,
// and the timing comparison of `npm run htn:bench -- --compare`. Hand-made inputs; the real gate is perf-gate.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  compareReports,
  diffCounters,
  formatComparison,
  formatCounterDiff,
  mergeRepeats,
  npcsPerMs,
  rangesOf,
  type BenchReport,
  type CountersFile
} from '../../../scripts/bench/compare'
import { measureAllocation } from '../../../scripts/bench/alloc'

const counters = (idleRows: number, plan = ['!idle']): CountersFile => ({
  about: 'test',
  version: 1,
  scenarios: {
    Idle: { plans: 3, status: 'succeeded', plan, peakCallFrames: 4, stats: { methods: 6, factRowsTested: idleRows } },
    Combat: { plans: 3, status: 'succeeded', plan: ['!fight'], peakCallFrames: 6, stats: { methods: 9, factRowsTested: 36 } }
  },
  runs: { 'crowd 10': { plansMade: 27, stats: { methods: 27 } } }
})

test('counter diff: equal files give no change, whatever the about text', () => {
  assert.deepEqual(diffCounters(counters(12), { ...counters(12), about: 'other' }), [])
})

test('counter diff: one changed counter, with its scope, path, before and after', () => {
  assert.deepEqual(diffCounters(counters(12), counters(18)), [{ scope: 'scenarios / Idle', path: 'stats.factRowsTested', before: 12, after: 18 }])
})

test('counter diff: a changed plan step, a new and a missing scenario', () => {
  const base = counters(12)
  const cur = counters(12, ['!idle', '!wait'])
  delete (cur.scenarios as Record<string, unknown>).Combat
  cur.scenarios['New feature'] = { plans: 3, status: 'succeeded', plan: [], peakCallFrames: 1, stats: { methods: 1 } }
  const changes = diffCounters(base, cur)
  assert.deepEqual(changes, [
    { scope: 'scenarios / Idle', path: 'plan[1]', before: undefined, after: '!wait' },
    { scope: 'scenarios / Combat', path: '', before: 'scenario', after: undefined },
    { scope: 'scenarios / New feature', path: '', before: undefined, after: 'scenario' }
  ])
})

test('counter diff text: grouped per scenario, deltas in numbers and percent, how to accept it', () => {
  const text = formatCounterDiff(diffCounters(counters(12), counters(18)), 'benchmarks/counters.baseline.json')
  assert.match(text, /1 change in 1 scenario/)
  assert.match(text, /scenarios \/ Idle\n\s+stats\.factRowsTested\s+12 -> 18\s+\(\+6, \+50\.0%\)/)
  assert.match(text, /npm run htn:bench -- --update-counters/)
  assert.equal(formatCounterDiff([], 'x.json'), 'Structural counters equal x.json')
})

const report = (p50: number, plansPerSecond: number, bytesPerPlan: number | null, npcs: number): BenchReport => ({
  kind: 'htn-bench',
  version: 1,
  machine: { node: 'v22', cpu: 'cpu', platform: 'win32' },
  date: '2026-10-16',
  options: { iterations: 1, samples: 1, repeats: 1, crowdSeconds: 1, exposeGc: true },
  scenarios: [{ name: 'Idle', plansPerSecond, usPerPlan: 1e6 / plansPerSecond, p50, p95: p50 * 2, p99: p50 * 3, max: p50 * 9, bytesPerPlan, gcCount: 0, gcMs: 0 }],
  crowd: [
    {
      name: '50 npcs 30fps',
      size: 50,
      fps: 30,
      record: false,
      budget: 'none',
      tickMeanMs: 50 / npcs,
      tickP50: 1,
      tickP95: 1,
      tickP99: 1,
      planP50: 0,
      planP95: 0.1,
      planP99: 0.2,
      npcsPerMs: npcs,
      npcsPerMsP95: npcs / 2,
      bytesPerFrame: 1000,
      gcCount: 0,
      gcMs: 0
    }
  ]
})

test('timing compare: within the threshold passes, the rows say so', () => {
  const r = compareReports(report(10, 100000, 500, 500), report(10.5, 98000, 510, 490), { threshold: 0.1 })
  assert.deepEqual(r.regressions, [])
  assert.deepEqual(r.notes, [])
  assert.ok(r.rows.length >= 5)
  assert.ok(r.rows.every(row => row.status === 'same'))
})

test('timing compare: a slower p50, fewer plans/s, more bytes and fewer NPCs per ms are regressions', () => {
  const r = compareReports(report(10, 100000, 500, 500), report(12, 80000, 700, 400), { threshold: 0.1 })
  const flagged = r.regressions.map(x => `${x.name}.${x.metric}`)
  assert.deepEqual(flagged.sort(), ['50 npcs 30fps.npcsPerMs', 'Idle.bytesPerPlan', 'Idle.p50', 'Idle.p95', 'Idle.plansPerSecond'])
  const p50 = r.regressions.find(x => x.metric === 'p50')!
  assert.equal(p50.before, 10)
  assert.equal(p50.after, 12)
  assert.ok(Math.abs(p50.worse - 0.2) < 1e-9)
  // A looser threshold lets them through.
  assert.deepEqual(compareReports(report(10, 100000, 500, 500), report(12, 80000, 700, 400), { threshold: 0.5 }).regressions, [])
})

test('timing compare: faster is an improvement, never a regression', () => {
  const r = compareReports(report(10, 100000, 500, 500), report(5, 200000, 100, 1000), { threshold: 0.1 })
  assert.deepEqual(r.regressions, [])
  assert.ok(r.rows.filter(x => x.status === 'improvement').length >= 4)
})

test('timing compare: a change under the absolute floor (timer resolution) is not flagged', () => {
  // p50 1.2 -> 1.4 us is +17%, but 0.2 us is about the clock's resolution.
  const r = compareReports(report(1.2, 100000, 500, 500), report(1.4, 100000, 500, 500), { threshold: 0.1 })
  assert.deepEqual(r.regressions.map(x => x.metric), [])
})

test('timing compare: rows only on one side and another machine are notes, not regressions', () => {
  const base = report(10, 100000, 500, 500)
  const cur = report(10, 100000, 500, 500)
  cur.machine = { ...cur.machine, cpu: 'other cpu' }
  cur.scenarios.push({ ...cur.scenarios[0], name: 'New feature' })
  cur.crowd = []
  const r = compareReports(base, cur, { threshold: 0.1 })
  assert.deepEqual(r.regressions, [])
  assert.equal(r.notes.length, 3)
  assert.match(r.notes.join('\n'), /another machine/)
  assert.match(r.notes.join('\n'), /New feature: only in the current run/)
  assert.match(r.notes.join('\n'), /50 npcs 30fps: only in the baseline/)
})

test('timing compare: a null bytes/plan (no measurement) is skipped', () => {
  const r = compareReports(report(10, 100000, null, 500), report(10, 100000, 900, 500), { threshold: 0.1 })
  assert.deepEqual(r.regressions, [])
  assert.ok(!r.rows.some(x => x.metric === 'bytesPerPlan'))
})

test('timing compare: with repeats, a change inside the spread of the runs is noise, outside it a regression', () => {
  // Baseline repeats of p50 spread 9..12, current 10.5..14: medians +20%, but the ranges overlap.
  const base = report(10, 100000, 500, 500)
  base.scenarios[0].range = { p50: [9, 12] }
  const noisy = report(12, 100000, 500, 500)
  noisy.scenarios[0].range = { p50: [10.5, 14] }
  const r = compareReports(base, noisy, { threshold: 0.1 })
  assert.ok(!r.regressions.some(x => x.metric === 'p50'))
  assert.equal(r.rows.find(x => x.metric === 'p50')!.status, 'noise')
  // Every current run slower than every baseline run: a regression.
  const slow = report(14, 100000, 500, 500)
  slow.scenarios[0].range = { p50: [12.5, 15] }
  assert.ok(compareReports(base, slow, { threshold: 0.1 }).regressions.some(x => x.metric === 'p50'))
  // The same for higher-is-better: plans/s 100k (95k..105k) against 80k (70k..96k) overlaps.
  base.scenarios[0].range = { plansPerSecond: [95000, 105000] }
  const fewer = report(10, 80000, 500, 500)
  fewer.scenarios[0].range = { plansPerSecond: [70000, 96000] }
  assert.equal(compareReports(base, fewer, { threshold: 0.1 }).rows.find(x => x.metric === 'plansPerSecond')!.status, 'noise')
  fewer.scenarios[0].range = { plansPerSecond: [70000, 90000] }
  assert.equal(compareReports(base, fewer, { threshold: 0.1 }).rows.find(x => x.metric === 'plansPerSecond')!.status, 'regression')
})

test('timing compare text: the verdict, the threshold and each regression', () => {
  const bad = compareReports(report(10, 100000, 500, 500), report(12, 100000, 500, 500), { threshold: 0.1 })
  const text = formatComparison(bad, { threshold: 0.1, baseline: 'b.json' })
  assert.match(text, /Idle\s+p50\s+10\.000 -> 12\.000\s+\+20\.0% worse\s+REGRESSION/)
  assert.match(text, /Compare: FAIL, 2 regressions over 10%/)
  const good = compareReports(report(10, 100000, 500, 500), report(10, 100000, 500, 500), { threshold: 0.1 })
  assert.match(formatComparison(good, { threshold: 0.1, baseline: 'b.json' }), /Compare: PASS, 0 regressions over 10%/)
})

test('repeats: the range of each compared number over the runs', () => {
  const runs = [[{ name: 'a', p50: 3, p95: 5 }], [{ name: 'a', p50: 1, p95: 6 }], [{ name: 'a', p50: 2, p95: 4 }]]
  assert.deepEqual(rangesOf(runs, 0, ['p50', 'p95']), { p50: [1, 3], p95: [4, 6] })
  assert.equal(rangesOf([runs[0]], 0, ['p50']), undefined)
})

test('repeats: the median of each number, the first run for the rest', () => {
  const runs = [
    [{ name: 'a', p50: 3, first: 100, checks: ['x'] }],
    [{ name: 'a', p50: 1, first: 7, checks: [] }],
    [{ name: 'a', p50: 2, first: 8, checks: [] }]
  ]
  assert.deepEqual(mergeRepeats(runs, ['first']), [{ name: 'a', p50: 2, first: 100, checks: ['x'] }])
  assert.deepEqual(mergeRepeats([runs[0]], []), runs[0])
})

test('game metric: NPCs per ms of frame from the crowd size and its mean ms per frame', () => {
  assert.equal(npcsPerMs(50, 0.1), 500)
  assert.equal(npcsPerMs(50, 0), 0)
})

let sink: unknown
test('allocation meter: known objects measure their V8 size, an empty call nothing', () => {
  // A literal can cost 56 B before V8 optimizes it (40 B + allocation-site bookkeeping).
  // A warmed constructor gives the same two-field calibration object without that JIT dependency.
  class Pair {
    a = 1
    b = 2
  }
  const pair = () => {
    sink = new Pair()
  }
  const array = () => {
    sink = new Array(100).fill(0)
  }
  for (const fn of [pair, array]) for (let i = 0; i < 2000; i++) fn() // warm
  // A GC landing mid-measurement under a loaded full test run can skew one reading: up to three tries each.
  const within = (fn: () => void, lo: number, hi: number) => {
    const seen: number[] = []
    for (let i = 0; i < 3; i++) {
      const b = measureAllocation(fn, 20000).bytesPerCall
      if (b >= lo && b <= hi) return { ok: true, seen }
      seen.push(b)
    }
    return { ok: false, seen }
  }
  // 8-byte fields without pointer compression (Node's default), 4 with it: an object of 2 fields 20-40 B.
  const p = within(pair, 16, 48)
  assert.ok(p.ok, `pair ${p.seen.join(', ')}`)
  const a = within(array, 400, 900)
  assert.ok(a.ok, `array ${a.seen.join(', ')}`)
  const empty = within(() => {}, 0, 2)
  assert.ok(empty.ok, `empty ${empty.seen.join(', ')}`)
  assert.ok(sink !== undefined)
})

// Delay of V8 optimization reproduced the loaded-CI literal reading (~56 B instead of 40 B).
test('allocation meter: calibration works without the optimizing JIT', { skip: process.execArgv.includes('--no-opt') }, () => {
  // A nested --test otherwise exits successfully without running any files.
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const child = spawnSync(process.execPath, [
    '--no-opt', '--test', __filename
  ], { encoding: 'utf8', env })
  assert.equal(child.status, 0, child.error?.message ?? child.stdout + child.stderr)
})
