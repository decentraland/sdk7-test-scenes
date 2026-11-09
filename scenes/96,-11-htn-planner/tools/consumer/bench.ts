// Optional Node consumer measurements. Runtime and author scenarios stay independent of the demo catalogue.
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { PlanRunner, newPlanStats, type DecompositionStatus, type PlanStats, type PlanStep } from '../../src/htn-planner/htn/planner'
import { formatTask } from '../../src/htn-planner/htn/atom'
import { PlanTraceRecorder } from '../../src/htn-planner/htn/trace'
import { compareReports, diffCounters, mergeRepeats, rangesOf, type BenchReport, type Comparison, type CounterChange, type CountersFile, type ScenarioTiming } from '../../scripts/bench/compare'
import { exposedGc, measureAllocation } from '../../scripts/bench/alloc'
import { loadConsumer, type LoadedConsumer } from './load'
import type { ConsumerManifest, ConsumerScenario } from './manifest'

export interface MeasureOptions {
  samples: number
  warmup: number
  repeats: number
  budgetMs: number
  totalMs: number
  allocPlans: number
  seed: number
  trace: boolean
}

export interface MeasureRow extends ScenarioTiming {
  samples: number
  sampleCounts: number[]
  coldSamples: number[]
  warmups: number
  worldUs: number
  setupUs: number
  coldUs: number
  status: DecompositionStatus
  plan: readonly PlanStep[]
  stats: PlanStats
  peakCallFrames: number
  traceNodes: number
  failures: number
  allocPlans: number
}

export interface MeasureReport {
  kind: 'htn-consumer-measure'
  version: 1
  implementation: string
  machine: BenchReport['machine'] & { arch: string; v8: string; esbuild: string }
  date: string
  options: MeasureOptions
  scenarios: MeasureRow[]
  comparison?: MeasureComparison
}

export interface MeasureComparison {
  compatible: boolean
  notes: string[]
  structural: CounterChange[]
  timing: Comparison | null
}

export const QUICK_MEASURE: MeasureOptions = {
  samples: 200, warmup: 30, repeats: 3, budgetMs: 100, totalMs: 10000, allocPlans: 0, seed: 1, trace: false
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const percentile = (sorted: readonly number[], p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p / 100) - 1)] ?? 0

/** Times plan() only. Expectation checks, world construction and recorder setup are outside each warm sample.
 * Cold means the first plan on a fresh runner, in a fresh scenario worker; compilation is outside this timing.
 * A deterministic clock may be injected by tests; production always uses performance.now(). */
export function measureScenario(
  loaded: LoadedConsumer, scenario: ConsumerScenario, options: MeasureOptions,
  now: () => number = () => performance.now()
): MeasureRow {
  if (scenario.expect.status === 'invalid_world') throw new Error(`${scenario.name}: invalid_world is a check fixture, not a planning measurement`)
  let start = now()
  const world = loaded.world(scenario)
  const worldUs = (now() - start) * 1000
  start = now()
  const bindings = loaded.bindings(world, options.seed)
  const recorder = options.trace ? new PlanTraceRecorder(loaded.domain, { worlds: false, keep: 1 }) : undefined
  const runner = new PlanRunner(loaded.domain, world, {
    ...bindings, mode: scenario.mode, trace: recorder, calltermErrorPolicy: 'report',
    onDiagnostic: d => { throw new Error(`${scenario.name}: ${d.code}: ${d.message}`) }
  })
  const setupUs = (now() - start) * 1000
  const args = scenario.args ?? []
  let failures = 0
  const check = (status: DecompositionStatus) => {
    if (status !== scenario.expect.status || !same(runner.steps.map(s => formatTask(s.name, s.args)), scenario.expect.plan)) failures++
  }
  start = now()
  const status = runner.plan(scenario.method, args)
  const coldUs = (now() - start) * 1000
  check(status)
  const plan: PlanStep[] = JSON.parse(JSON.stringify(runner.steps))
  let warmups = 0
  const warmStop = now() + options.budgetMs
  while (warmups < options.warmup && now() < warmStop) {
    check(runner.plan(scenario.method, args))
    warmups++
  }
  const latency: number[] = []
  const stop = now() + options.budgetMs
  while (latency.length < options.samples && now() < stop) {
    start = now()
    const result = runner.plan(scenario.method, args)
    latency.push((now() - start) * 1000)
    check(result)
  }
  if (latency.length === 0) throw new Error(`${scenario.name}: no warm samples within the phase budget`)
  latency.sort((a, b) => a - b)
  const usPerPlan = latency.reduce((sum, us) => sum + us, 0) / latency.length

  // A fresh seeded binding/context makes counters independent of timing iteration counts and clock noise.
  const counterWorld = loaded.world(scenario)
  const stats = newPlanStats()
  const counting = new PlanRunner(loaded.domain, counterWorld, { ...loaded.bindings(counterWorld, options.seed), mode: scenario.mode, stats })
  const counterStatus = counting.plan(scenario.method, args)
  if (counterStatus !== scenario.expect.status || !same(counting.steps.map(s => formatTask(s.name, s.args)), scenario.expect.plan)) failures++
  let allocationStatus = status
  const alloc = options.allocPlans > 0 && exposedGc ? measureAllocation(() => {
    // Keep author expectation checking out of the allocation figure, too.
    allocationStatus = runner.plan(scenario.method, args)
  }, options.allocPlans) : null
  if (alloc) check(allocationStatus)
  return {
    name: scenario.name, samples: latency.length, sampleCounts: [latency.length], coldSamples: [coldUs], warmups, worldUs, setupUs, coldUs, status, plan,
    stats: { ...stats }, peakCallFrames: counting.executionInfo.peakCallFrames,
    traceNodes: recorder?.lastPlan?.nodes.length ?? 0, failures,
    plansPerSecond: usPerPlan > 0 ? 1e6 / usPerPlan : 0, usPerPlan,
    p50: percentile(latency, 50), p95: percentile(latency, 95), p99: percentile(latency, 99), max: latency[latency.length - 1],
    bytesPerPlan: alloc?.bytesPerCall ?? null, allocPlans: alloc ? options.allocPlans : 0,
    gcCount: alloc?.gcCount ?? 0, gcMs: alloc?.gcMs ?? 0
  }
}

function counters(report: MeasureReport): CountersFile {
  return {
    about: 'Consumer counters: clock independent; one fresh seeded plan', version: 1, runs: {},
    scenarios: Object.fromEntries(report.scenarios.map(row => [row.name, {
      status: row.status, plan: JSON.parse(JSON.stringify(row.plan)), stats: { ...row.stats }, peakCallFrames: row.peakCallFrames
    }]))
  }
}

/** Shared benchmark comparison/noise and counter utilities; incompatible environments never yield a timing verdict. */
export function compareMeasures(base: MeasureReport, current: MeasureReport, threshold = 0.1, allowVersionChange = false): MeasureComparison {
  const notes: string[] = []
  if (base.kind !== current.kind || base.version !== current.version) notes.push('Report kind/schema version differs')
  if (!same(base.machine, current.machine)) notes.push('Node/V8/esbuild/CPU/platform/architecture differs; use the same environment')
  if (base.implementation !== current.implementation && !allowVersionChange) notes.push('Implementation version differs; use --allow-version-change for a deliberate upgrade')
  if (!same(base.options, current.options)) notes.push('Measurement options differ (including seed, traces and sample limits)')
  const compatible = notes.length === 0
  const structural = diffCounters(counters(base), counters(current))
  const toBench = (r: MeasureReport): BenchReport => ({
    kind: 'htn-bench', version: 1, date: r.date, machine: r.machine,
    options: { iterations: r.options.samples, samples: r.options.samples, repeats: r.options.repeats, crowdSeconds: 0, exposeGc: exposedGc },
    scenarios: r.scenarios, crowd: []
  })
  if (base.implementation !== current.implementation && allowVersionChange) notes.push('Deliberate implementation version change allowed')
  return { compatible, notes, structural, timing: compatible ? compareReports(toBench(base), toBench(current), { threshold }) : null }
}

export function formatMeasure(report: MeasureReport): string {
  const lines = [
    `HTN consumer measurement: ${report.machine.node} / ${report.machine.cpu}`,
    `${report.options.repeats} fresh processes/scenario; traces ${report.options.trace ? 'on' : 'off'}; microseconds; compile/startup excluded`,
    'Cold = first plan in a fresh runner/process. Warm = reused runner/world/context after warm-up.'
  ]
  for (const row of report.scenarios) {
    lines.push(`${row.name}: ${row.status} ${JSON.stringify(row.plan)}; failures=${row.failures}`)
    lines.push(`  samples=${row.sampleCounts.join("/")} (per repeat), warmups=${row.warmups}; p50=${row.p50.toFixed(3)} p95=${row.p95.toFixed(3)} p99=${row.p99.toFixed(3)} max=${row.max.toFixed(3)} us`)
    lines.push(`  world=${row.worldUs.toFixed(3)} setup=${row.setupUs.toFixed(3)} cold=${row.coldUs.toFixed(3)} us; peakCallFrames=${row.peakCallFrames}; traceNodes=${row.traceNodes}`)
    lines.push(`  stats=${JSON.stringify(row.stats)}`)
    lines.push(`  V8 heap bytes/plan=${row.bytesPerPlan === null ? 'unavailable (optional; use --alloc-plans N)' : row.bytesPerPlan.toFixed(1)}; allocation plans=${row.allocPlans}; GC=${row.gcCount}/${row.gcMs.toFixed(3)}ms`)
  }
  if (report.comparison) {
    const c = report.comparison
    lines.push(`Comparison: ${!c.compatible ? 'INCOMPATIBLE' : c.structural.length || c.timing?.regressions.length ? 'FAIL' : 'PASS'}`)
    for (const note of [...c.notes, ...(c.timing?.notes ?? [])]) lines.push(`  note: ${note}`)
    for (const change of c.structural) lines.push(`  structural ${change.scope}.${change.path}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`)
    for (const row of c.timing?.rows.filter(r => r.status !== 'same') ?? [])
      lines.push(`  ${row.name}.${row.metric}: ${row.before.toFixed(3)} -> ${row.after.toFixed(3)} (${row.status})`)
  }
  lines.push('Node is not Explorer. Profile your target client and aggregate NPC frame cost; see docs/consumer-benchmark.md.')
  return lines.join('\n')
}

const HELP = `Usage: npm run htn:measure -- path/to/consumer.ts [options]
Author module: export default ConsumerManifest (same contract as htn:check).
  --quick                  bounded default: 3 fresh repeats, 200 samples, 100ms/phase, 10s total
  --full                   explicit longer preset: 5 repeats, 5000 samples, 1s/phase, 60s total
  --scenario NAME          only this author scenario (default: all)
  --samples N --warmup N --repeats N --budget-ms N --total-ms N
  --seed N                 reset author custom-callterm bindings per worker (default 1)
  --trace                  PlanTraceRecorder on (default off; keep one run, no world snapshots)
  --alloc-plans N          optional V8 heap estimate with --expose-gc (default off)
  --json FILE|-            save machine-readable report, or JSON only on stdout
  --out FILE               also save text report
  --compare FILE           read-only baseline; exit 1 on counters/results/timing regression
  --threshold PCT          relative timing threshold (default 10); repeat overlap is noise
  --allow-version-change   permit deliberate runtime/compiler/tool upgrade comparison
Exit: 0 measured/pass, 1 expectation or comparison failure, 2 input/incompatibility/timeout.
No command updates a baseline. A slow synchronous callterm is stopped by the worker timeout.`

function parseOptions(args: string[]): { options: MeasureOptions; values: Map<string, string>; flags: Set<string> } {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  const switches = new Set(['--quick', '--full', '--trace', '--allow-version-change', '--help'])
  const names = new Set(['--samples', '--warmup', '--repeats', '--budget-ms', '--total-ms', '--seed', '--alloc-plans', '--scenario', '--json', '--out', '--compare', '--threshold', '--worker-index', '--worker-out'])
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (switches.has(arg)) flags.add(arg)
    else if (names.has(arg) && args[i + 1] !== undefined && !args[i + 1].startsWith('--')) values.set(arg, args[++i])
    else throw new Error(`Unknown option or missing value: ${arg}`)
  }
  if (flags.has('--quick') && flags.has('--full')) throw new Error('Choose --quick or --full')
  const full = flags.has('--full')
  const defaults = full ? { ...QUICK_MEASURE, samples: 5000, warmup: 200, repeats: 5, budgetMs: 1000, totalMs: 60000 } : QUICK_MEASURE
  const number = (name: string, fallback: number, min: number, max: number): number => {
    const n = values.has(name) ? Number(values.get(name)) : fallback
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer ${min}..${max}${!full ? ' (use --full for larger limits)' : ''}`)
    return n
  }
  return { values, flags, options: {
    samples: number('--samples', defaults.samples, 1, full ? 100000 : 2000),
    warmup: number('--warmup', defaults.warmup, 0, full ? 10000 : 200),
    repeats: number('--repeats', defaults.repeats, 1, full ? 20 : 5),
    budgetMs: number('--budget-ms', defaults.budgetMs, 1, full ? 10000 : 500),
    totalMs: number('--total-ms', defaults.totalMs, 100, full ? 120000 : 10000),
    allocPlans: number('--alloc-plans', 0, 0, full ? 100000 : 2000),
    seed: number('--seed', defaults.seed, 0, 0xffffffff), trace: flags.has('--trace')
  } }
}

/** Called by the small esbuild launcher; each scenario/repeat is isolated from other JIT/author state. */
export function runMeasure(manifest: ConsumerManifest, baseDir: string, args: string[]): void {
  try {
    if (args.includes('--help')) { console.log(HELP); return }
    const { options, values, flags } = parseOptions(args)
    const loaded = loadConsumer(manifest, baseDir)
    const worker = values.get('--worker-index')
    if (worker !== undefined) {
      const scenario = loaded.scenarios[Number(worker)]
      if (!scenario || !values.get('--worker-out')) throw new Error('Invalid worker arguments')
      fs.writeFileSync(values.get('--worker-out')!, JSON.stringify(measureScenario(loaded, scenario, options)))
      return
    }
    const selected = loaded.scenarios.map((scenario, index) => ({ scenario, index })).filter(({ scenario }) => !values.has('--scenario') || scenario.name === values.get('--scenario'))
    if (!selected.length) throw new Error('No matching scenarios in the author manifest')
    const baseline = values.get('--compare')
    for (const output of [values.get('--json'), values.get('--out')])
      if (baseline && output && output !== '-') {
        const samePath = path.resolve(output) === path.resolve(baseline)
        const sameFile = fs.existsSync(output) && fs.existsSync(baseline) && (
          fs.realpathSync(output) === fs.realpathSync(baseline) ||
          (fs.statSync(output).dev === fs.statSync(baseline).dev && fs.statSync(output).ino === fs.statSync(baseline).ino))
        if (samePath || sameFile) throw new Error('Output must differ from the read-only comparison baseline')
      }
    const threshold = values.has('--threshold') ? Number(values.get('--threshold')) / 100 : 0.1
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 10) throw new Error('--threshold must be 0..1000 percent')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htn-consumer-measure-'))
    const rows: MeasureRow[] = []
    const deadline = performance.now() + options.totalMs
    try {
      for (const { scenario, index } of selected) {
        const runs: MeasureRow[][] = []
        for (let repeat = 0; repeat < options.repeats; repeat++) {
          const remaining = Math.floor(deadline - performance.now())
          if (remaining <= 0) throw new Error('Total measurement budget exhausted; select fewer scenarios or use --full')
          const file = path.join(dir, `${index}-${repeat}.json`)
          const childArgs = args.filter((a, i) => a !== '--json' && a !== '--out' && a !== '--compare' && !['--json', '--out', '--compare'].includes(args[i - 1]))
          const env = { ...process.env }
          delete env.NODE_TEST_CONTEXT
          const child = spawnSync(process.execPath, ['--expose-gc', process.argv[1], ...childArgs, '--worker-index', String(index), '--worker-out', file], {
            encoding: 'utf8', timeout: remaining, maxBuffer: 1024 * 1024, env
          })
          if (child.status !== 0 || !fs.existsSync(file)) throw new Error(`${scenario.name}: worker failed/timeout: ${child.error?.message ?? child.stderr ?? child.stdout}`)
          runs.push([JSON.parse(fs.readFileSync(file, 'utf8')) as MeasureRow])
        }
        const row = mergeRepeats(runs, [])[0]
        row.samples = Math.min(...runs.map(r => r[0].samples))
        row.sampleCounts = runs.map(r => r[0].samples)
        row.coldSamples = runs.map(r => r[0].coldUs)
        row.warmups = Math.min(...runs.map(r => r[0].warmups))
        row.failures = runs.reduce((sum, r) => sum + r[0].failures, 0)
        row.range = rangesOf(runs, 0, ['p50', 'p95', 'p99', 'plansPerSecond', 'bytesPerPlan'])
        // State/results/counters must also agree between repeats, regardless of clock measurements.
        for (const run of runs) if (!same({ status: row.status, plan: row.plan, stats: row.stats }, { status: run[0].status, plan: run[0].plan, stats: run[0].stats })) row.failures++
        rows.push(row)
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
    const report: MeasureReport = {
      kind: 'htn-consumer-measure', version: 1,
      implementation: process.env.HTN_MEASURE_IMPLEMENTATION ?? 'unknown',
      machine: { node: process.version, v8: process.versions.v8, esbuild: process.env.HTN_MEASURE_ESBUILD ?? 'unknown', cpu: os.cpus()[0]?.model.trim() ?? 'unknown', platform: process.platform, arch: process.arch },
      date: new Date().toISOString(), options, scenarios: rows
    }
    if (baseline) report.comparison = compareMeasures(JSON.parse(fs.readFileSync(baseline, 'utf8')), report, threshold, flags.has('--allow-version-change'))
    const output = formatMeasure(report)
    const jsonOut = values.get('--json')
    console.log(jsonOut === '-' ? JSON.stringify(report, null, 2) : output)
    const save = (file: string, body: string) => { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, body + '\n') }
    if (jsonOut && jsonOut !== '-') save(jsonOut, JSON.stringify(report, null, 2))
    if (values.has('--out')) save(values.get('--out')!, output)
    process.exitCode = report.comparison?.compatible === false ? 2 : rows.some(row => row.failures > 0) || (report.comparison?.structural.length ?? 0) > 0 || (report.comparison?.timing?.regressions.length ?? 0) > 0 ? 1 : 0
  } catch (error) {
    console.error(`htn:measure: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
}
