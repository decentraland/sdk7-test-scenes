// Planner benchmark, upstream HTNBenchmark's shape (HTNBenchmark/README.md): npm run htn:bench [-- options]
//   --quick              few plans per scenario and a short crowd run (a smoke run, seconds)
//   --iterations N       plans timed as one block per scenario (default 20000)
//   --samples N          plans timed one by one for p50 / p95 / p99 (default 5000)
//   --alloc-plans N      warm plans whose heap bytes are measured per scenario (default 5000, 0: off)
//   --crowd-seconds N    simulated seconds per many-NPC run (default 120)
//   --no-crowd           skip the many-NPC runs
//   --repeats N          run everything N times, each in a fresh process (its own JIT), report the median of each
//                        number (default 1; 5 with --json/--compare)
//   --out FILE           also write the text report to FILE (e.g. benchmarks/main_benchmark.txt)
//   --json FILE          also write the report as JSON (e.g. benchmarks/main_benchmark.json, the --compare baseline)
//   --compare FILE       compare with a --json report from the same machine: exit 1 when p50 / p95 / plans/s /
//                        bytes per plan / NPCs per ms / planning p99 got worse by more than the threshold
//   --threshold PCT      what counts as worse for --compare, % (default 10)
//   --update-counters    rewrite benchmarks/counters.baseline.json (the npm test counter gate) and print what changed
//   --check-counters     only the counter gate: exit 1 on any difference with the baseline (what npm test runs)
// Bundled and run by scripts/htn-bench.mjs (with --expose-gc). Numbers are Node's V8; see docs/htn-guidance.md for the
// scene runtime, and for how to read and compare them.
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as nodePath from 'node:path'
import { exposedGc } from './bench/alloc'
import { COMPARE_RULES, compareReports, diffCounters, formatComparison, formatCounterDiff, mergeRepeats, rangesOf, type BenchReport } from './bench/compare'
import { collectCounters, COUNTERS_BASELINE, readCounters, writeCounters } from './bench/counters'
import { budgetLabel, crowdName, formatCrowd, formatGame, runCrowd, type CrowdOptions, type CrowdResult } from './bench/crowd'
import {
  benchCases,
  DEFAULT_BENCH,
  formatAlloc,
  formatCounters,
  formatLifecycle,
  formatOverhead,
  formatSuite,
  runCase,
  type BenchOptions,
  type CaseResult
} from './bench/suite'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const text = (name: string): string | undefined => {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
const value = (name: string, fallback: number) => {
  const v = text(name)
  return v === undefined ? fallback : Number(v)
}
const at = (file: string) => nodePath.resolve(ROOT, file)

// ---- the counter gate --------------------------------------------------------------------------------------------

function runCounterGate(): void {
  const baseline = readCounters(ROOT)
  const current = collectCounters()
  const changes = baseline ? diffCounters(baseline, current) : []
  console.log(baseline ? formatCounterDiff(changes, COUNTERS_BASELINE) : `${COUNTERS_BASELINE}: none yet`)
  if (flag('--update-counters')) {
    writeCounters(ROOT, current)
    console.log(`written: ${COUNTERS_BASELINE}`)
  } else process.exitCode = baseline && changes.length === 0 ? 0 : 1
}

// ---- the timed bench ---------------------------------------------------------------------------------------------

const quick = flag('--quick')
const opts: BenchOptions = {
  iterations: value('--iterations', quick ? 500 : DEFAULT_BENCH.iterations),
  samples: value('--samples', quick ? 200 : DEFAULT_BENCH.samples),
  budgetMs: quick ? 150 : DEFAULT_BENCH.budgetMs,
  allocPlans: value('--alloc-plans', quick ? 500 : DEFAULT_BENCH.allocPlans)
}
const crowdSeconds = value('--crowd-seconds', quick ? 20 : 120)

/** One run of everything: the suite first (the lifecycle's "first plan" is only cold for the first scenario of a
 *  process), then the crowds: recorder off and on; with a shared budget per frame (the scene default CROWD_BUDGET,
 *  and a time budget), recorder off; then at 60 fps. */
function measure(): { suite: CaseResult[]; crowd: CrowdResult[] } {
  const crowdRuns: CrowdOptions[] = []
  for (const size of [10, 25, 50]) for (const record of [false, true]) crowdRuns.push({ size, seconds: crowdSeconds, record })
  for (const budget of [{ maxPlansPerFrame: 3 }, { planBudgetMs: 0.25 }]) for (const size of [10, 25, 50]) crowdRuns.push({ size, seconds: crowdSeconds, record: false, budget })
  for (const size of [10, 25, 50]) crowdRuns.push({ size, seconds: crowdSeconds, record: false, fps: 60 })
  const suite = benchCases().map(c => runCase(c, opts))
  return { suite, crowd: flag('--no-crowd') ? [] : crowdRuns.map(runCrowd) }
}

/** A repeat in its own process (--child-out FILE): the raw results for the parent to merge. */
function runChild(file: string): void {
  raisePriority()
  fs.writeFileSync(file, JSON.stringify(measure()))
}

/** Above the editor, the browser and the rest on a busy desktop, where the OS lets us (else as it is). */
function raisePriority(): void {
  try {
    os.setPriority(os.constants.priority.PRIORITY_HIGH)
  } catch {
    try {
      os.setPriority(os.constants.priority.PRIORITY_ABOVE_NORMAL)
    } catch {
      // Not allowed: run at normal priority.
    }
  }
}

/** The options a repeat's process gets: the measuring ones, not the reporting ones. */
function childArgs(file: string): string[] {
  const withValue = new Set(['--out', '--json', '--compare', '--threshold', '--repeats'])
  const kept: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (withValue.has(args[i])) i++
    else kept.push(args[i])
  }
  return [...kept, '--child-out', file]
}

/** The metrics --compare checks in a section: their spread over the repeats goes into the JSON (the noise band). */
const compared = (section: 'scenarios' | 'crowd') => COMPARE_RULES.filter(r => r.section === section).map(r => r.metric)

function runBench(): void {
  const out = text('--out')
  const jsonOut = text('--json')
  const compareWith = text('--compare')
  const threshold = value('--threshold', 10) / 100
  const repeats = Math.max(1, value('--repeats', jsonOut !== undefined || compareWith !== undefined ? 5 : 1))

  const lines: string[] = []
  const print = (line = '') => {
    console.log(line)
    lines.push(line)
  }

  const cpu = os.cpus()[0]?.model.trim() ?? 'unknown cpu'
  print('HTN planner benchmark (TS port of urosidoki/htn_planner; shape of upstream HTNBenchmark)')
  print(`  node:              ${process.version} (${cpu})`)
  print(`  iterations/case:   ${opts.iterations} (FactHeavy100: ${Math.min(opts.iterations, 2000)}), ${opts.budgetMs} ms cap per phase`)
  print(`  latency samples:   ${opts.samples} (FactHeavy100: ${Math.min(opts.samples, 500)})`)
  print(`  allocations:       ${opts.allocPlans} warm plans per case (FactHeavy100: a tenth): V8 heap used + what each GC freed`)
  print(`                     (node:v8 GCProfiler), net of an empty loop; a few bytes per plan; --expose-gc ${exposedGc ? 'on' : 'off'}`)
  print(`  repeats:           ${repeats}${repeats > 1 ? ' processes (each number the median; lifecycle and first tick from the first)' : ''}`)
  print('')

  // One run here; several: each in a fresh process (a JIT can settle differently from one process to the next).
  const runs: ReturnType<typeof measure>[] = []
  if (repeats === 1) {
    raisePriority()
    runs.push(measure())
  }
  else {
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'htn-bench-repeat-'))
    try {
      for (let r = 0; r < repeats; r++) {
        const file = nodePath.join(dir, `run${r}.json`)
        console.log(`repeat ${r + 1} of ${repeats}...`)
        const child = spawnSync(process.execPath, [...process.execArgv, process.argv[1], ...childArgs(file)], { stdio: ['ignore', 'ignore', 'inherit'] })
        if (child.status !== 0 || !fs.existsSync(file)) {
          console.error(`htn:bench: repeat ${r + 1} failed (exit ${child.status})`)
          process.exitCode = 1
          return
        }
        runs.push(JSON.parse(fs.readFileSync(file, 'utf8')) as ReturnType<typeof measure>)
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
  const suiteRuns = runs.map(r => r.suite)
  const crowdResults = runs.map(r => r.crowd).filter(c => c.length > 0)
  const results = mergeRepeats(suiteRuns, ['worldUs', 'setupUs', 'firstUs'])
  const crowd = mergeRepeats(crowdResults, ['firstTickMs'])

  print(formatSuite(results))
  print('')
  print(formatLifecycle(results))
  print('')
  print(formatCounters(results))
  print('')
  print(formatAlloc(results))
  print('')
  print(formatOverhead(results))
  if (crowd.length > 0) {
    print('')
    print(formatCrowd(crowd))
    print('')
    print(formatGame(crowd.filter(c => !c.record && c.budget?.planBudgetMs === undefined)))
  }

  const failures = suiteRuns.flat().reduce((n, r) => n + r.failures, 0)
  print('')
  print(`Baseline result: ${failures === 0 ? 'PASS' : 'FAIL'}  total_failures=${failures}`)
  if (out !== undefined) {
    fs.mkdirSync(nodePath.dirname(at(out)), { recursive: true })
    fs.writeFileSync(at(out), lines.join('\n') + '\n')
    console.log(`written: ${out}`)
  }

  const report: BenchReport = {
    kind: 'htn-bench',
    version: 1,
    machine: { node: process.version, cpu, platform: process.platform },
    date: new Date().toISOString().slice(0, 10),
    options: { iterations: opts.iterations, samples: opts.samples, repeats, crowdSeconds, exposeGc: exposedGc },
    scenarios: results.map((r, i) => ({
      name: r.name,
      plansPerSecond: r.plansPerSecond,
      usPerPlan: r.usPerPlan,
      p50: r.p50,
      p95: r.p95,
      p99: r.p99,
      max: r.max,
      bytesPerPlan: r.bytesPerPlan,
      gcCount: r.gcCount,
      gcMs: r.gcMs,
      range: rangesOf(suiteRuns, i, compared('scenarios'))
    })),
    crowd: crowd.map((c, i) => ({
      name: crowdName(c),
      size: c.size,
      fps: c.fps,
      record: c.record,
      budget: budgetLabel(c.budget),
      tickMeanMs: c.tickMeanMs,
      tickP50: c.tickP50,
      tickP95: c.tickP95,
      tickP99: c.tickP99,
      planP50: c.planP50,
      planP95: c.planP95,
      planP99: c.planP99,
      npcsPerMs: c.npcsPerMs,
      npcsPerMsP95: c.npcsPerMsP95,
      bytesPerFrame: c.bytesPerFrame,
      gcCount: c.gcCount,
      gcMs: c.gcMs,
      range: rangesOf(crowdResults, i, compared('crowd'))
    }))
  }
  if (jsonOut !== undefined) {
    fs.mkdirSync(nodePath.dirname(at(jsonOut)), { recursive: true })
    fs.writeFileSync(at(jsonOut), JSON.stringify(report, (_, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 2) + '\n')
    console.log(`written: ${jsonOut}`)
  }

  let regressions = 0
  if (compareWith !== undefined) {
    const baseline = JSON.parse(fs.readFileSync(at(compareWith), 'utf8')) as BenchReport
    const comparison = compareReports(baseline, report, { threshold })
    regressions = comparison.regressions.length
    console.log('')
    console.log(formatComparison(comparison, { threshold, baseline: compareWith }))
  }
  process.exitCode = failures === 0 && regressions === 0 ? 0 : 1
}

if (flag('--update-counters') || flag('--check-counters')) runCounterGate()
else if (text('--child-out') !== undefined) runChild(text('--child-out')!)
else runBench()
