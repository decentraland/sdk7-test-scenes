import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { bool, formatTask, int } from '../../src/htn-planner/htn/atom'
import { loadConsumer } from '../../tools/consumer/load'
import type { ConsumerManifest } from '../../tools/consumer/manifest'
import { compareMeasures, measureScenario, QUICK_MEASURE, type MeasureReport, type MeasureRow } from '../../tools/consumer/bench'

const options = { ...QUICK_MEASURE, repeats: 3, samples: 10, warmup: 1 }
const source = `(:domain AuthorOwned top_level_domain
  (:method (pick ?inp_threshold) top_level_method
    (scan (and (candidate ?x) (> ?x ?inp_threshold) (call accept ?x)) ((!choose ?x)))))`

function fixture(rows = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'htn measure author with spaces '))
  writeFileSync(join(dir, 'strategy.domain'), source)
  writeFileSync(join(dir, 'busy.worldstate'), Array.from({ length: rows }, (_, i) => `candidate ${-i}`).join('\n') + '\ncandidate 42\n')
  const scenario = { name: 'author pick', method: 'pick', args: [int(41)], world: 'busy.worldstate', expect: { status: 'succeeded' as const, plan: ['!choose 42'] } }
  const manifest: ConsumerManifest = { domain: 'strategy.domain', scenarios: [scenario], callterms: () => ({ callterms: { accept: () => bool(true) } }) }
  return { dir, manifest, scenario, clean: () => rmSync(dir, { recursive: true, force: true }) }
}

function report(row: MeasureRow): MeasureReport {
  return {
    kind: 'htn-consumer-measure', version: 1, implementation: 'same-runtime', date: 'test', options,
    machine: { node: 'v22', v8: 'v8', esbuild: '1', cpu: 'cpu', platform: 'win32', arch: 'x64' },
    scenarios: [{ ...row, range: { p50: [row.p50, row.p50], p95: [row.p95, row.p95], plansPerSecond: [row.plansPerSecond, row.plansPerSecond] } }]
  }
}

test('consumer measure: arbitrary domain, method args, full plan args and unreachable world expectations', () => {
  const f = fixture()
  try {
    const loaded = loadConsumer(f.manifest, f.dir)
    const row = measureScenario(loaded, f.scenario, options)
    assert.equal(row.failures, 0)
    assert.equal(row.status, 'succeeded')
    assert.deepEqual(row.plan.map(s => formatTask(s.name, s.args)), ['!choose 42'])
    assert.equal(row.samples, 10)
    assert.equal(row.bytesPerPlan, null, 'allocations are explicitly unavailable when not requested')
    assert.ok(row.p50 <= row.p95 && row.p95 <= row.p99)
    const wrongArgs = measureScenario(loaded, { ...f.scenario, expect: { status: 'succeeded', plan: ['!choose 41'] } }, options)
    assert.ok(wrongArgs.failures > 0, 'same primitive with wrong argument must fail')
    const missing = measureScenario(loaded, { ...f.scenario, args: [int(99)], expect: { status: 'no_plan', plan: [] } }, options)
    assert.equal(missing.failures, 0)
    assert.equal(missing.status, 'no_plan')
  } finally { f.clean() }
})

test('consumer measure: cold snapshot and warm expectations catch a mutating same-name callterm result', () => {
  const f = fixture()
  try {
    writeFileSync(join(f.dir, 'strategy.domain'), `(:domain Changing top_level_domain
      (:method (pick) top_level_method (b (and (= ?x (call next))) ((!choose ?x)))))`)
    const manifest: ConsumerManifest = {
      domain: 'strategy.domain', scenarios: [], callterms: () => {
        let value = 0
        return { callterms: { next: () => int(++value) } }
      }
    }
    const scenario = { ...f.scenario, method: 'pick', args: [], expect: { status: 'succeeded' as const, plan: ['!choose 1'] } }
    manifest.scenarios = [scenario]
    const row = measureScenario(loadConsumer(manifest, f.dir), scenario, options)
    assert.deepEqual(row.plan.map(s => formatTask(s.name, s.args)), ['!choose 1'])
    assert.ok(row.failures >= options.samples, 'warm argument drift must fail')
  } finally { f.clean() }
})

test('consumer measure: deterministic slow-callterm and heavy-world controls detect regressions without tiny clock assertions', () => {
  const light = fixture()
  const heavy = fixture(2000)
  try {
    const measured = (f: ReturnType<typeof fixture>, costMs: number) => {
      let clock = 0
      f.manifest.callterms = () => ({ callterms: { accept: () => { clock += costMs; return bool(true) } } })
      return measureScenario(loadConsumer(f.manifest, f.dir), f.scenario, options, () => clock)
    }
    const normal = measured(light, 0.01)
    const slow = measured(light, 10)
    assert.ok(compareMeasures(report(normal), report(slow)).timing!.regressions.some(r => r.metric === 'p50'))
    const manyFacts = measured(heavy, 0.01)
    assert.ok(manyFacts.stats.factRowsTested > normal.stats.factRowsTested + 1000)
    const changed = compareMeasures(report(normal), report(manyFacts))
    assert.ok(changed.structural.some(c => c.path === 'stats.factRowsTested'))
    assert.deepEqual(manyFacts.plan, normal.plan, 'heavy world retains intended answer')
    const traced = measureScenario(loadConsumer(light.manifest, light.dir), light.scenario, { ...options, trace: true })
    assert.ok(traced.traceNodes > 0)
    assert.equal(normal.traceNodes, 0)
    assert.deepEqual(traced.stats, normal.stats)
  } finally { light.clean(); heavy.clean() }
})

test('consumer measure: comparison rejects environment/version/options changes and reports overlapping repeats as noise', () => {
  const f = fixture()
  try {
    const row = measureScenario(loadConsumer(f.manifest, f.dir), f.scenario, options)
    const base = report({ ...row, p50: 10, p95: 10, plansPerSecond: 100000 })
    const cur = report({ ...row, p50: 12, p95: 12, plansPerSecond: 100000 })
    base.scenarios[0].range = { p50: [9, 13], p95: [9, 13] }
    cur.scenarios[0].range = { p50: [10, 14], p95: [10, 14] }
    assert.ok(compareMeasures(base, cur).timing!.rows.some(r => r.metric === 'p50' && r.status === 'noise'))
    cur.machine.node = 'another-node'
    assert.equal(compareMeasures(base, cur).compatible, false)
    assert.equal(compareMeasures(base, cur).timing, null)
    cur.machine = { ...base.machine }
    cur.implementation = 'upgrade'
    assert.equal(compareMeasures(base, cur).compatible, false)
    assert.equal(compareMeasures(base, cur, 0.1, true).compatible, true)
    cur.options = { ...base.options, trace: true }
    assert.equal(compareMeasures(base, cur, 0.1, true).compatible, false)
  } finally { f.clean() }
})

test('consumer measure CLI: spaced paths, foreign INIT_CWD, JSON/text, read-only baseline and worker timeout', () => {
  const f = fixture()
  try {
    const file = join(f.dir, 'author fixture.ts')
    writeFileSync(file, `export default {domain:'strategy.domain',scenarios:[{name:'unreachable',world:'busy.worldstate',method:'pick',args:[{t:'int',v:100}],expect:{status:'no_plan',plan:[]}}],callterms:()=>({callterms:{accept:()=>({t:'bool',v:true})}})}`)
    const root = resolve(__dirname, '../../..')
    // __dirname belongs to .test-build; the launcher is in its sibling scripts directory.
    const launcher = join(root, 'scripts/htn-measure.mjs')
    const command = (args: string[]) => spawnSync(process.execPath, [launcher, file, '--samples', '3', '--warmup', '0', '--repeats', '2', ...args], {
      cwd: root, encoding: 'utf8', timeout: 20000, env: { ...process.env, INIT_CWD: 'C:/definitely/not/the/consumer' }
    })
    const json = command(['--json', '-'])
    assert.equal(json.status, 0, json.stderr + json.stdout)
    const parsed = JSON.parse(json.stdout) as MeasureReport
    assert.equal(parsed.scenarios[0].status, 'no_plan')
    assert.equal(parsed.scenarios[0].sampleCounts.length, 2)
    assert.equal(parsed.scenarios[0].coldSamples.length, 2)
    assert.ok(parsed.implementation !== 'unknown')
    const baseline = join(f.dir, 'baseline.json')
    writeFileSync(baseline, JSON.stringify(parsed))
    const before = readFileSync(baseline, 'utf8')
    const badOutput = command(['--compare', baseline, '--json', baseline])
    assert.equal(badOutput.status, 2)
    assert.equal(readFileSync(baseline, 'utf8'), before)
    const text = command([])
    assert.equal(text.status, 0, text.stderr)
    assert.match(text.stdout, /p50=.*p95=.*p99=/)
    const structuralBase = JSON.parse(before) as MeasureReport
    structuralBase.scenarios[0].stats.factRowsTested += 17
    writeFileSync(baseline, JSON.stringify(structuralBase))
    const structural = command(['--compare', baseline, '--json', '-'])
    assert.equal(structural.status, 1, structural.stderr)
    assert.ok(JSON.parse(structural.stdout).comparison.structural.some((c: { path: string }) => c.path === 'stats.factRowsTested'))
    structuralBase.machine.node = 'different-version'
    writeFileSync(baseline, JSON.stringify(structuralBase))
    const incompatible = command(['--compare', baseline, '--json', '-'])
    assert.equal(incompatible.status, 2, incompatible.stderr)
    assert.equal(JSON.parse(incompatible.stdout).comparison.timing, null)
    const instrumented = command(['--trace', '--alloc-plans', '10', '--json', '-'])
    assert.equal(instrumented.status, 0, instrumented.stderr)
    const traced = JSON.parse(instrumented.stdout) as MeasureReport
    assert.ok(traced.scenarios[0].traceNodes > 0)
    assert.ok(traced.scenarios[0].bytesPerPlan !== null && traced.scenarios[0].bytesPerPlan >= 0)
    const invalid = command(['--samples', '0'])
    assert.equal(invalid.status, 2)
    // A deliberately non-returning host call proves the wall bound; no hardware-speed threshold.
    writeFileSync(file, `export default {domain:'strategy.domain',scenarios:[{name:'hung author',world:'busy.worldstate',method:'pick',args:[{t:'int',v:41}],expect:{status:'succeeded',plan:['!choose 42']}}],callterms:()=>({callterms:{accept:()=>{while(true){} }}})}`)
    const timed = command(['--total-ms', '300'])
    assert.equal(timed.status, 2, timed.stderr)
    assert.match(timed.stderr, /timeout|ETIMEDOUT|budget/i)
  } finally { f.clean() }
})
