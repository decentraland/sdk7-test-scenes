// The performance gate's pure logic, tested in test/htn/planner/perf-compare.test.ts:
//  - structural counters: diff two counter files (benchmarks/counters.baseline.json against a fresh collection,
//    scripts/bench/counters.ts) into readable lines. Deterministic, so npm test fails on any difference.
//  - timing: compare two `npm run htn:bench -- --json` reports, flag what got worse by more than a threshold and
//    beyond the noise (every repeat of the current run worse than every repeat of the baseline). Wall clock, so only
//    on the same machine, and never in CI.
//  - repeats: the median of several runs, and the game metric (NPCs per ms of frame).

// ---- structural counters ------------------------------------------------------------------------------------------

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** benchmarks/counters.baseline.json: per bench scenario and per seeded level run, its counters and results. */
export interface CountersFile {
  about: string
  version: 1
  scenarios: Record<string, { [key: string]: Json }>
  runs: Record<string, { [key: string]: Json }>
}

export interface CounterChange {
  /** 'scenarios / Idle', 'runs / crowd 10 npcs 30fps'. */
  scope: string
  /** 'stats.factRowsTested', 'plan[1]'; '' for a whole scenario only on one side. */
  path: string
  /** undefined: not on that side. A whole scenario on one side only is 'scenario'. */
  before: Json | undefined
  after: Json | undefined
}

const SECTIONS = ['scenarios', 'runs'] as const

/** Leaves of `value` by path ('a.b[2].c'), in key order. */
function flatten(value: Json, path: string, out: Map<string, Json>): Map<string, Json> {
  if (Array.isArray(value)) value.forEach((v, i) => flatten(v, `${path}[${i}]`, out))
  else if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) flatten(v, path === '' ? k : `${path}.${k}`, out)
  else out.set(path, value)
  return out
}

/** Every difference between two counter files, scenario by scenario in the baseline's order, then new ones. */
export function diffCounters(baseline: CountersFile, current: CountersFile): CounterChange[] {
  const changes: CounterChange[] = []
  for (const section of SECTIONS) {
    const base = baseline[section] ?? {}
    const cur = current[section] ?? {}
    for (const name of Object.keys(base)) {
      const scope = `${section} / ${name}`
      if (!(name in cur)) {
        changes.push({ scope, path: '', before: 'scenario', after: undefined })
        continue
      }
      const a = flatten(base[name], '', new Map())
      const b = flatten(cur[name], '', new Map())
      for (const [path, before] of a) if (!b.has(path) || b.get(path) !== before) changes.push({ scope, path, before, after: b.get(path) })
      for (const [path, after] of b) if (!a.has(path)) changes.push({ scope, path, before: undefined, after })
    }
    for (const name of Object.keys(cur)) if (!(name in base)) changes.push({ scope: `${section} / ${name}`, path: '', before: undefined, after: 'scenario' })
  }
  return changes
}

const show = (v: Json | undefined) => (v === undefined ? '(none)' : typeof v === 'string' ? JSON.stringify(v) : String(v))
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function delta(before: Json | undefined, after: Json | undefined): string {
  if (typeof before !== 'number' || typeof after !== 'number') return ''
  const d = after - before
  const sign = d > 0 ? '+' : ''
  const pct = before === 0 ? '' : `, ${sign}${((d * 100) / before).toFixed(1)}%`
  return `  (${sign}${d}${pct})`
}

/** The diff for a failing test or a review: grouped per scenario, numbers with their deltas, how to accept it. */
export function formatCounterDiff(changes: readonly CounterChange[], baselinePath: string): string {
  if (changes.length === 0) return `Structural counters equal ${baselinePath}`
  const scopes = [...new Set(changes.map(c => c.scope))]
  const out = [`Structural counters differ from ${baselinePath}: ${plural(changes.length, 'change')} in ${plural(scopes.length, 'scenario')}`]
  const width = Math.max(...changes.map(c => c.path.length), 8)
  for (const scope of scopes) {
    out.push(`  ${scope}`)
    for (const c of changes.filter(x => x.scope === scope)) {
      if (c.path === '') out.push(`    ${c.after === undefined ? 'only in the baseline (removed)' : 'only in the current run (new)'}`)
      else out.push(`    ${c.path.padEnd(width)}  ${show(c.before)} -> ${show(c.after)}${delta(c.before, c.after)}`)
    }
  }
  out.push('A deliberate change: npm run htn:bench -- --update-counters, and commit the baseline with it.')
  return out.join('\n')
}

// ---- timing reports -----------------------------------------------------------------------------------------------

export interface ScenarioTiming {
  name: string
  plansPerSecond: number
  usPerPlan: number
  /** Latency of one plan, µs. */
  p50: number
  p95: number
  p99: number
  max: number
  /** Heap bytes allocated per warm plan (scripts/bench/alloc.ts); null when not measured. */
  bytesPerPlan: number | null
  /** Garbage collections and their ms while measuring the allocations. */
  gcCount: number
  gcMs: number
  /** With repeats: the lowest and highest of each compared number over the runs (the noise band). */
  range?: Ranges
}

/** Per metric, [lowest, highest] over the repeats. */
export type Ranges = Record<string, [number, number]>

export interface CrowdTiming {
  /** '50 npcs 30fps', '50 npcs 30fps 3/f', '10 npcs 30fps recorder'. */
  name: string
  size: number
  fps: number
  record: boolean
  budget: string
  /** ms per frame of the whole AI update (every agent's tick, planning included), after the first second. */
  tickMeanMs: number
  tickP50: number
  tickP95: number
  tickP99: number
  /** ms per frame spent planning. */
  planP50: number
  planP95: number
  planP99: number
  /** NPCs one ms of frame runs: size / tickMeanMs, and size / tickP95. */
  npcsPerMs: number
  npcsPerMsP95: number
  bytesPerFrame: number | null
  gcCount: number
  gcMs: number
  range?: Ranges
}

/** `npm run htn:bench -- --json FILE`: medians over `options.repeats` runs. */
export interface BenchReport {
  kind: 'htn-bench'
  version: 1
  machine: { node: string; cpu: string; platform: string }
  date: string
  options: { iterations: number; samples: number; repeats: number; crowdSeconds: number; exposeGc: boolean }
  scenarios: ScenarioTiming[]
  crowd: CrowdTiming[]
}

interface Rule {
  section: 'scenarios' | 'crowd'
  metric: string
  better: 'higher' | 'lower'
  /** A change smaller than this (in the metric's unit) is never flagged: timer resolution, a few bytes. */
  floor: number
  digits: number
}

/** What --compare checks. Latencies in µs (the clock steps 0.1 µs), crowd ms per frame, bytes. */
export const COMPARE_RULES: readonly Rule[] = [
  { section: 'scenarios', metric: 'plansPerSecond', better: 'higher', floor: 0, digits: 0 },
  { section: 'scenarios', metric: 'p50', better: 'lower', floor: 0.5, digits: 3 },
  { section: 'scenarios', metric: 'p95', better: 'lower', floor: 0.5, digits: 3 },
  { section: 'scenarios', metric: 'bytesPerPlan', better: 'lower', floor: 64, digits: 0 },
  { section: 'crowd', metric: 'npcsPerMs', better: 'higher', floor: 0, digits: 0 },
  { section: 'crowd', metric: 'planP99', better: 'lower', floor: 0.05, digits: 3 }
]

export interface CompareRow {
  section: 'scenarios' | 'crowd'
  name: string
  metric: string
  before: number
  after: number
  /** How much worse, relative: +0.2 is 20% worse (slower, fewer, bigger), negative is better. */
  worse: number
  /** noise: over the threshold, but the repeats of both runs overlap (some current run as good as a baseline one). */
  status: 'regression' | 'improvement' | 'noise' | 'same'
  digits: number
}

export interface Comparison {
  rows: CompareRow[]
  regressions: CompareRow[]
  /** Rows on one side only, another machine: said, never failed on. */
  notes: string[]
}

export interface CompareOptions {
  /** Relative change that counts, 0.1 = 10%. */
  threshold: number
}

export function compareReports(baseline: BenchReport, current: BenchReport, o: CompareOptions): Comparison {
  const rows: CompareRow[] = []
  const notes: string[] = []
  const m = baseline.machine
  const c = current.machine
  if (m.cpu !== c.cpu || m.node !== c.node || m.platform !== c.platform)
    notes.push(`the baseline is from another machine (${m.cpu}, node ${m.node}) than this run (${c.cpu}, node ${c.node}): timings only compare on the same one`)
  for (const section of ['scenarios', 'crowd'] as const) {
    const base = new Map<string, ScenarioTiming | CrowdTiming>(baseline[section].map(r => [r.name, r]))
    const cur = new Map<string, ScenarioTiming | CrowdTiming>(current[section].map(r => [r.name, r]))
    for (const name of cur.keys()) if (!base.has(name)) notes.push(`${name}: only in the current run`)
    for (const [name, b] of base) {
      const a = cur.get(name)
      if (a === undefined) {
        notes.push(`${name}: only in the baseline`)
        continue
      }
      for (const rule of COMPARE_RULES.filter(r => r.section === section)) {
        const before = (b as unknown as Record<string, number | null>)[rule.metric]
        const after = (a as unknown as Record<string, number | null>)[rule.metric]
        if (typeof before !== 'number' || typeof after !== 'number') continue
        const diff = rule.better === 'lower' ? after - before : before - after
        const worse = before === 0 ? 0 : diff / before
        const counts = Math.abs(diff) > rule.floor && Math.abs(worse) > o.threshold
        const status = !counts ? 'same' : !beyondNoise(b.range?.[rule.metric], a.range?.[rule.metric], rule, worse > 0) ? 'noise' : worse > 0 ? 'regression' : 'improvement'
        rows.push({ section, name, metric: rule.metric, before, after, worse, status, digits: rule.digits })
      }
    }
  }
  return { rows, regressions: rows.filter(r => r.status === 'regression'), notes }
}

/**
 * Whether the change is beyond the repeats' noise: every current run worse (or, for an improvement, better) than
 * every baseline run. Without the ranges of both (a single run), the threshold alone decides.
 */
function beyondNoise(base: [number, number] | undefined, cur: [number, number] | undefined, rule: Rule, worse: boolean): boolean {
  if (base === undefined || cur === undefined) return true
  const [bLow, bHigh] = base
  const [cLow, cHigh] = cur
  const curHigher = cLow > bHigh
  const curLower = cHigh < bLow
  // Lower is better: worse means higher. Higher is better: worse means lower.
  return rule.better === 'lower' ? (worse ? curHigher : curLower) : worse ? curLower : curHigher
}

export function formatComparison(r: Comparison, o: CompareOptions & { baseline: string }): string {
  const pct = `${Math.round(o.threshold * 100)}%`
  const out = [`Compare with ${o.baseline} (threshold ${pct}; same machine only, see docs/htn-guidance.md)`]
  const shown = r.rows.filter(x => x.status !== 'same')
  const nameWidth = Math.max(16, ...shown.map(x => x.name.length + 2))
  for (const x of shown) {
    const sign = x.worse > 0 ? '+' : '-'
    out.push(
      x.name.padEnd(nameWidth) +
        x.metric.padEnd(16) +
        `${x.before.toFixed(x.digits)} -> ${x.after.toFixed(x.digits)}`.padEnd(28) +
        `${sign}${Math.abs(x.worse * 100).toFixed(1)}% ${x.worse > 0 ? 'worse' : 'better'}`.padEnd(16) +
        (x.status === 'regression' ? 'REGRESSION' : x.status === 'noise' ? 'noise (the runs overlap)' : 'improvement')
    )
  }
  out.push(`${r.rows.length - shown.length} of ${r.rows.length} values within ${pct}`)
  for (const n of r.notes) out.push(`note: ${n}`)
  out.push(`Compare: ${r.regressions.length === 0 ? 'PASS' : 'FAIL'}, ${r.regressions.length} regressions over ${pct}`)
  return out.join('\n')
}

// ---- repeats and the game metric ----------------------------------------------------------------------------------

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Several runs of the same rows (same order) into one: each number the median over the runs, except `firstOnly`
 * (a cold first plan is only cold in the first run) and anything not a number, both taken from the first run.
 */
export function mergeRepeats<T extends object>(runs: readonly (readonly T[])[], firstOnly: readonly (keyof T)[]): T[] {
  if (runs.length <= 1) return runs.length === 0 ? [] : [...runs[0]]
  return runs[0].map((first, i) => {
    const merged = { ...first } as Record<string, unknown>
    for (const key of Object.keys(first)) {
      const v = (first as Record<string, unknown>)[key]
      if (typeof v !== 'number' || firstOnly.includes(key as keyof T)) continue
      const values = runs.map(run => (run[i] as Record<string, unknown>)[key]).filter((x): x is number => typeof x === 'number')
      merged[key] = median(values)
    }
    return merged as T
  })
}

/** The [lowest, highest] of `keys` of row `i` over the runs; undefined for a single run (no spread to tell). */
export function rangesOf<T extends object>(runs: readonly (readonly T[])[], i: number, keys: readonly string[]): Ranges | undefined {
  if (runs.length < 2) return undefined
  const out: Ranges = {}
  for (const key of keys) {
    const values = runs.map(run => (run[i] as Record<string, unknown>)[key]).filter((x): x is number => typeof x === 'number')
    if (values.length > 0) out[key] = [Math.min(...values), Math.max(...values)]
  }
  return out
}

/** NPCs that one ms of frame runs, from a crowd's size and its ms per frame (0 when nothing was measured). */
export function npcsPerMs(size: number, msPerFrame: number): number {
  return msPerFrame > 0 ? size / msPerFrame : 0
}
