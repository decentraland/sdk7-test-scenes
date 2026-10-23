// A playground level run headless, for a terminal and for AI agents (`npm run htn:level`, scripts/htn-level.ts): the
// level's own tester script on a fixed dt from a seed, until the script has done its rounds or the time is up. The
// result is plain data (`--json` prints it as it is): every check of every round with the sim time it passed, failed
// or is waiting since, a summary per NPC, and on request each NPC's event history. The same LevelSim the station
// runs in the scene: nothing here decides a check, it only reads them. Pure, no SDK calls.
import { buildSession, formatTask } from '../htn-planner'
import type { AgentLogEntry, DebugSession, SessionAgent } from '../htn-planner'
import { historyRows, readableReason } from '../debugger/history-rows'
import { flatMetrics, formatMetric, formatMetricsTable, LevelMetrics, meanMetrics, observeLevel } from './metrics'
import { LEVEL_DT, LevelSim } from './sim'

export interface LevelRunOptions {
  /** The level's rng seed; default the level's own (DEFAULT_SEED). */
  seed?: number
  /** Simulated seconds at most (default DEFAULT_LIMIT). */
  seconds?: number
  /** Seconds per update (default 1/30, LEVEL_DT). */
  dt?: number
  /** Rounds of the tester script (default 1). */
  rounds?: number
  /** Also the NPCs' event histories. */
  verbose?: boolean
  /** Keep every run and event of every planner (RECORD_ALL), for levelSession; default: the board's last ones. */
  record?: boolean
  /** The level's ablation (LevelSim.ablation; ablation.ts), default none. */
  ablation?: string
  /** The domain variant (LevelSim.variant; variants.ts), default none: the level's own domains. */
  variant?: string
  /** LevelSim.stagger: the tester's script starts after a wait drawn from the seed in [0, stagger) s. */
  stagger?: number
  /** Read the outcome metrics (metrics.ts) into the result. */
  metrics?: boolean
}

/** A run's outcome metrics: one number per metric (metrics.ts METRICS; null: not defined here), and the detail. */
export interface RunMetrics {
  values: Record<string, number | null>
  detail: LevelMetrics
}

/** Runs and events a recorded run keeps per planner: all of them, for any run a terminal would wait for. */
export const RECORD_ALL = 100_000

export const DEFAULT_LIMIT = 600

export interface CheckOutcome {
  round: number
  label: string
  /** waiting: the script is on it now; pending: not reached yet (out of time before it). */
  state: 'pass' | 'fail' | 'waiting' | 'pending'
  /** Level time it passed / failed at (waiting: now). */
  at: number
  /** Seconds it took (pass), waited before giving up (fail), or has waited so far (waiting). */
  seconds: number
}

export interface NpcSummary {
  id: string
  mode: string
  /** The branch its current top-level plan chose ('' without a trace). */
  branch: string
  /** The planning status of its last replan ('succeeded', 'no_plan'...). */
  status: string
  plansMade: number
  replans: number
  /** The running step ('' when idle). */
  step: string
  lastReplanReason: string
  lastReplanAt: number
  position: { x: number; y: number; z: number }
}

export interface HistoryLine {
  npc: string
  t: number
  /** A collapsed run of identical events: how many and until when. */
  count?: number
  until?: number
  kind: string
  text: string
}

export interface LevelRunResult {
  level: { id: string; number: number; title: string }
  seed: number
  dt: number
  rounds: number
  limit: number
  /** Simulated seconds run. */
  seconds: number
  /** The script did all its rounds within the limit. */
  finished: boolean
  /** Finished and no check failed. */
  ok: boolean
  /** The ablation, the domain variant and the stagger it ran with (absent: none). */
  ablation?: string
  variant?: string
  stagger?: number
  checks: CheckOutcome[]
  npcs: NpcSummary[]
  /** With `verbose`: every NPC's events, oldest first (its last entries: the history is a bounded ring). */
  history?: HistoryLine[]
  /** With `metrics`. */
  metrics?: RunMetrics
}

export interface LevelArgs {
  level: string
  seed?: number
  seconds: number
  dt: number
  rounds: number
  json: boolean
  verbose: boolean
  list: boolean
  /** Write a DebugSession of the run there (levelSession). */
  session?: string
  /** --seed a-b or a,b,c: a run per seed (then `seed` is unset). */
  seeds?: number[]
  /** --metrics: the outcome metrics table. */
  metrics?: boolean
  /** --ablate <name|all>. */
  ablate?: string
  /** --variant <name|all>: a domain variant (variants.ts); all: the level as it is and each of its variants. */
  variant?: string
  /** --stagger S. */
  stagger?: number
}

export const LEVEL_USAGE = `usage: npm run htn:level -- <level id|number> [--seed N|a-b|a,b] [--seconds S] [--dt 1/30] [--rounds N] [--json] [--verbose] [--session <file>]
                     [--metrics] [--ablate <name|all>] [--variant <name|all>] [--stagger S]
       npm run htn:level -- --list
  Runs the level's tester script headless until it has done --rounds rounds (default 1) or --seconds of sim time
  (default ${DEFAULT_LIMIT}) are up. Prints each check with its sim time, one line per NPC; --verbose adds the event
  history, --json prints one object. --session writes every plan run, world and event of every NPC (and of a squad
  planner) as a DebugSession JSON for npm run htn:view. Exit 0: every check passed; 1: a check failed or the time ran
  out; 2: usage.
  --metrics: the outcome metrics (docs/htn-level-metrics.md), also in --json as "metrics". --ablate <name>: the level
  with one parameter changed (an unknown name lists the level's); all: the level and each of its ablations side by
  side. --variant <name>: the level's NPCs on another shape of their domain (flat: the frozen before shape of the
  stalker and the guard, test/fixtures/reference); all: the level as it is and each of its variants side by side
  (with --ablate: every pair). --stagger S: the tester starts after a wait drawn from the seed in [0, S) s. Several seeds, --ablate all or --variant all: a line per run and a table of the
  means over the seeds; exit 1 only when a run without an ablation failed.`

/** A number, or a fraction like 1/30. */
function parseNumber(text: string | undefined): number {
  if (text === undefined || text.trim() === '') return NaN
  const m = /^\s*([0-9.eE+-]+)\s*\/\s*([0-9.eE+-]+)\s*$/.exec(text)
  return m ? Number(m[1]) / Number(m[2]) : Number(text)
}

/** The command line, or what is wrong with it. */
export function parseLevelArgs(argv: readonly string[]): LevelArgs | { error: string } {
  const out: LevelArgs = { level: '', seconds: DEFAULT_LIMIT, dt: LEVEL_DT, rounds: 1, json: false, verbose: false, list: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = (check: (n: number) => boolean, what: string): number | string => {
      const n = parseNumber(argv[++i])
      return Number.isFinite(n) && check(n) ? n : `${a} needs ${what}, got ${argv[i] ?? 'nothing'}`
    }
    let v: number | string | undefined
    if (a === '--json') out.json = true
    else if (a === '--verbose') out.verbose = true
    else if (a === '--list') out.list = true
    else if (a === '--session') {
      const file = argv[++i]
      if (file === undefined || file === '') return { error: '--session needs a file' }
      out.session = file
    }
    else if (a === '--metrics') out.metrics = true
    else if (a === '--ablate') {
      const name = argv[++i]
      if (name === undefined || name === '' || name.startsWith('-')) return { error: '--ablate needs a name (or all)' }
      out.ablate = name
    } else if (a === '--variant') {
      const name = argv[++i]
      if (name === undefined || name === '' || name.startsWith('-')) return { error: '--variant needs a name (or all)' }
      out.variant = name
    } else if (a === '--seed' && /^\s*-?\d+\s*[-,]/.test(argv[i + 1] ?? '')) {
      const seeds = parseSeeds(argv[++i])
      if (typeof seeds === 'string') return { error: seeds }
      if (seeds.length === 1) out.seed = seeds[0]
      else out.seeds = seeds
    } else if (a === '--seed') v = value(n => Number.isInteger(n), 'a whole number')
    else if (a === '--stagger') v = value(n => n >= 0, 'a number of seconds from 0')
    else if (a === '--seconds') v = value(n => n > 0, 'a positive number')
    else if (a === '--dt') v = value(n => n > 0 && n <= 1, 'a step in seconds (0, 1], e.g. 1/30')
    else if (a === '--rounds') v = value(n => Number.isInteger(n) && n >= 1, 'a whole number from 1')
    else if (a.startsWith('-')) return { error: `unknown option ${a}` }
    else if (out.level) return { error: `one level at a time (got ${out.level} and ${a})` }
    else out.level = a
    if (typeof v === 'string') return { error: v }
    if (typeof v === 'number') {
      if (a === '--seed') out.seed = v
      else if (a === '--stagger') out.stagger = v
      else if (a === '--seconds') out.seconds = v
      else if (a === '--dt') out.dt = v
      else out.rounds = v
    }
  }
  if (!out.level && !out.list) return { error: 'which level? (--list shows them)' }
  return out
}

/** `1-5` (a range) or `1,3,7` (a list) as seeds, or what is wrong with it. */
export function parseSeeds(text: string): number[] | string {
  const range = /^\s*(-?\d+)\s*-\s*(-?\d+)\s*$/.exec(text)
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])]
    if (to < from || to - from > 999) return `--seed ${text}: a range from low to high, at most 1000 seeds`
    return Array.from({ length: to - from + 1 }, (_, i) => from + i)
  }
  const list = text.split(',').map(t => t.trim())
  if (list.every(t => /^-?\d+$/.test(t))) return list.map(Number)
  return `--seed needs a whole number, a range a-b or a list a,b,c; got ${text}`
}

export interface LevelMaker {
  make: () => LevelSim
}

/** A level by id ('crowd') or menu number ('9'). */
export function findLevel<T extends LevelMaker>(levels: readonly T[], key: string): T | undefined {
  return levels.find(p => {
    const info = p.make().info
    return info.id === key || String(info.number) === key
  })
}

export function formatLevelList(levels: readonly LevelMaker[]): string {
  return levels
    .map(p => {
      const level = p.make().init()
      return `${String(level.info.number).padStart(3)}  ${level.info.id.padEnd(12)} ${level.info.title}  (${level.checks.length} checks, ${level.crew.length} NPC${level.crew.length === 1 ? '' : 's'})`
    })
    .join('\n')
}

/** Run `level` (not yet initialised) headless; see LevelRunOptions. */
export function runLevel(level: LevelSim, opts: LevelRunOptions = {}): LevelRunResult {
  const dt = opts.dt ?? LEVEL_DT
  const rounds = opts.rounds ?? 1
  const limit = opts.seconds ?? DEFAULT_LIMIT
  if (opts.record) {
    level.traceKeep = RECORD_ALL
    level.historySize = RECORD_ALL
    level.keepRetired = true
  }
  if (opts.ablation !== undefined) level.ablation = opts.ablation
  if (opts.variant !== undefined) level.variant = opts.variant
  if (opts.stagger !== undefined) level.stagger = opts.stagger
  const observer = opts.metrics ? observeLevel(level, rounds) : null
  level.init(opts.seed)
  while (level.round <= rounds && limit - level.time > 1e-9) {
    const step = Math.min(dt, limit - level.time)
    level.update(step)
    observer?.sample(step)
  }
  const finished = level.round > rounds
  const checks: CheckOutcome[] = level.checkLog
    .filter(c => c.round <= rounds)
    .map(c => ({ round: c.round, label: c.label, state: c.state as 'pass' | 'fail', at: c.at, seconds: c.seconds }))
  if (!finished) {
    // This round's checks the script has not resolved yet: the one it is on, then those it did not reach.
    for (const c of level.checks) {
      if (c.round === level.round && (c.state === 'pass' || c.state === 'fail')) continue
      if (c.round === level.round && c.state === 'waiting') checks.push({ round: c.round, label: c.label, state: 'waiting', at: level.time, seconds: level.time - c.at })
      else checks.push({ round: level.round, label: c.label, state: 'pending', at: 0, seconds: 0 })
    }
  }
  const result: LevelRunResult = {
    level: { id: level.info.id, number: level.info.number, title: level.info.title },
    seed: level.seed,
    dt,
    rounds,
    limit,
    seconds: level.time,
    finished,
    ok: finished && checks.every(c => c.state === 'pass'),
    ...(opts.ablation !== undefined ? { ablation: opts.ablation } : {}),
    ...(opts.variant !== undefined ? { variant: opts.variant } : {}),
    ...(opts.stagger ? { stagger: opts.stagger } : {}),
    checks,
    npcs: level.crew.map(m => {
      const a = m.agent
      const step = a.runner.current()
      const p = a.kinematic.position
      return {
        id: m.id,
        mode: a.mode,
        branch: level.chosenOf(m),
        status: a.lastPlanStatus,
        plansMade: a.metrics.plansMade,
        replans: m.replans,
        step: step ? formatTask(step.name, step.args) : '',
        lastReplanReason: a.lastReplanReason,
        lastReplanAt: m.lastReplanAt,
        position: { x: p.x, y: p.y, z: p.z }
      }
    })
  }
  if (observer) {
    const detail = observer.reader.result()
    result.metrics = { values: flatMetrics(detail), detail }
  }
  if (opts.verbose) {
    result.history = level.crew.flatMap(m =>
      historyRows(m.history.toArray(), [])
        .reverse()
        .map(r => {
          const line: HistoryLine = { npc: m.id, t: r.t, kind: r.kind, text: r.text }
          if (r.count !== undefined) {
            line.count = r.count
            line.until = r.until
          }
          return line
        })
    )
  }
  return result
}

/**
 * The level's run as a DebugSession: every NPC (its runs, worlds, metrics, events and its world now for the drift)
 * and every other planner of the level with a recorder (a squad planner: its own domain, its decisions as replans).
 * An NPC a respawn replaced (LevelSim.retired) is an agent of its own, `stalker (2)` for the second one, and every
 * NPC's times are moved from its own clock (0 when it was built) to the level's, so one timeline holds them all.
 * Run the level with `record` first, or the recorders hold only their last runs and no retired NPC.
 */
export function levelSession(level: LevelSim): DebugSession {
  const count = new Map<string, number>()
  const members = [...level.retired, ...level.crew].map(m => {
    const n = (count.get(m.id) ?? 0) + 1
    count.set(m.id, n)
    return { m, id: n === 1 ? m.id : `${m.id} (${n})`, current: level.crew.includes(m) }
  })
  const agents: SessionAgent[] = members.map(({ m, id, current }) => {
    const a: SessionAgent = { id, recorder: m.trace, metrics: { ...m.agent.metrics } }
    if (current) a.world = m.agent.blackboard.world
    return a
  })
  const histories: { toArray(): AgentLogEntry[] }[] = members.map(({ m, id }) => ({
    toArray: () =>
      m.history.toArray().map(e => {
        const out: AgentLogEntry = { ...e, t: e.t + m.spawnedAt, event: id === m.id ? e.event : { ...e.event, guard: id } }
        if (e.until !== undefined) out.until = e.until + m.spawnedAt
        return out
      })
  }))
  for (const p of level.planners()) {
    if (p.recorder) agents.push({ id: p.id, recorder: p.recorder, world: p.world })
    if (p.history) histories.push(p.history)
  }
  const session = buildSession({ domain: level.crew[0].trace.domain, agents, histories })
  const offset = new Map(members.map(({ m, id }) => [id, m.spawnedAt]))
  for (const r of session.runs) if (r.t !== undefined) r.t += offset.get(r.agent) ?? 0
  session.runs.sort((x, y) => (x.t ?? 0) - (y.t ?? 0) || (x.agent === y.agent ? x.seq - y.seq : 0))
  return session
}

/** 0: every check passed; 1: a check failed or the time ran out. */
export function levelRunExitCode(r: LevelRunResult): 0 | 1 {
  return r.ok ? 0 : 1
}

const STATE_TAG: Record<CheckOutcome['state'], string> = { pass: 'PASS', fail: 'FAIL', waiting: 'WAIT', pending: '----' }
const s1 = (n: number) => n.toFixed(1)
const s2 = (n: number) => n.toFixed(2)

/** `1/30` for a dt that is one over a whole number, else the number. */
function dtText(dt: number): string {
  const inv = 1 / dt
  return Math.abs(inv - Math.round(inv)) < 1e-9 ? `1/${Math.round(inv)}` : String(dt)
}

/** The run as text: header, a line per check, the verdict, a line per NPC, the history with `verbose`. */
export function formatLevelRun(r: LevelRunResult): string {
  const lines: string[] = []
  const extra = `${r.ablation !== undefined ? `, ablation ${r.ablation}` : ''}${r.variant !== undefined ? `, variant ${r.variant}` : ''}${r.stagger ? `, stagger ${r.stagger} s` : ''}`
  lines.push(`level ${r.level.number} ${r.level.id}: ${r.level.title}  (seed ${r.seed}, dt ${dtText(r.dt)}, ${r.rounds} round${r.rounds === 1 ? '' : 's'}, limit ${r.limit} s${extra})`)
  const multi = r.rounds > 1
  for (const c of r.checks) {
    const when = c.state === 'pending' ? ' '.repeat(20) : `t=${s2(c.at).padStart(7)} s  ${s2(c.seconds).padStart(6)} s`
    lines.push(`${STATE_TAG[c.state]}  ${when}  ${multi ? `[round ${c.round}] ` : ''}${c.label}`)
  }
  const count = (s: CheckOutcome['state']) => r.checks.filter(c => c.state === s).length
  const tally = `${count('pass')} passed, ${count('fail')} failed, ${count('waiting') + count('pending')} pending`
  if (!r.finished) lines.push(`TIMED OUT at ${s1(r.seconds)} s: ${tally} (script round ${r.checks.find(c => c.state !== 'pass' && c.state !== 'fail')?.round ?? '?'} not done)`)
  else lines.push(`${r.ok ? 'OK' : 'FAILED'}: ${tally}; script round ${r.rounds} done at ${s1(r.seconds)} s`)
  lines.push(`NPCs at ${s1(r.seconds)} s:`)
  const branchOf = (n: NpcSummary) => n.branch || n.status || '-'
  const width = (f: (n: NpcSummary) => string) => Math.max(0, ...r.npcs.map(n => f(n).length))
  const [idW, modeW, branchW] = [width(n => n.id), width(n => n.mode), width(branchOf)]
  for (const n of r.npcs) {
    const reason = n.lastReplanReason ? `  last replan ${s1(n.lastReplanAt)} s: ${readableReason(n.lastReplanReason)}` : ''
    lines.push(`  ${n.id.padEnd(idW)}  ${n.mode.padEnd(modeW)}  ${branchOf(n).padEnd(branchW)}  plans ${n.plansMade}  replans ${n.replans}  step ${n.step || '-'}${reason}`)
  }
  if (r.metrics) lines.push('metrics:', formatMetricsTable([{ label: 'value', metrics: r.metrics.values }]))
  if (r.history) {
    for (const n of r.npcs) {
      const rows = r.history.filter(h => h.npc === n.id)
      lines.push(`history ${n.id} (${rows.length} entries):`)
      for (const h of rows) {
        const repeat = h.count !== undefined && h.count > 1 ? `  ×${h.count} until ${s2(h.until ?? h.t)}` : ''
        lines.push(`  ${s2(h.t).padStart(7)}  ${h.kind.padEnd(9)} ${h.text}${repeat}`)
      }
    }
  }
  return lines.join('\n')
}

// ---- several runs: seeds and ablations side by side ------------------------------------------------------------

export interface LevelSetOptions {
  seeds: readonly number[]
  /** null: the level as it is. */
  ablations: readonly (string | null)[]
  /** Domain variants (variants.ts), null: the level's own domains; default [null]. Each with each ablation. */
  domainVariants?: readonly (string | null)[]
  rounds?: number
  seconds?: number
  dt?: number
  stagger?: number
}

export interface LevelSetRun {
  seed: number
  ok: boolean
  finished: boolean
  seconds: number
  /** Labels of the checks that failed or never passed. */
  failed: string[]
  metrics: RunMetrics
}

export interface LevelSetVariant {
  /** null: the level as it is ('default' in the tables). */
  ablation: string | null
  /** The domain variant (absent: the level's own domains). */
  variant?: string
  change: string
  runs: LevelSetRun[]
  /** Per metric, the mean over the seeds. */
  mean: Record<string, number | null>
}

export interface LevelSetResult {
  level: { id: string; number: number; title: string }
  seeds: number[]
  rounds: number
  limit: number
  stagger: number
  variants: LevelSetVariant[]
}

/**
 * Every ablation (null: none) on every seed, each on a fresh level from `make`, with its metrics; the means per
 * ablation. The names are not checked here (the CLI does): an unknown one runs the level as it is.
 */
export function runLevelSet(make: () => LevelSim, opts: LevelSetOptions): LevelSetResult {
  const probe = make()
  const changes = new Map(probe.ablations().map(a => [a.name, a.change]))
  const variantChanges = new Map(probe.variants().map(v => [v.name, v.change]))
  const variants = (opts.domainVariants ?? [null]).flatMap(variant =>
    opts.ablations.map(ablation => {
      const runs = opts.seeds.map(seed => {
        const r = runLevel(make(), {
          seed,
          rounds: opts.rounds,
          seconds: opts.seconds,
          dt: opts.dt,
          stagger: opts.stagger,
          ablation: ablation ?? undefined,
          variant: variant ?? undefined,
          metrics: true
        })
        const failed = r.checks.filter(c => c.state !== 'pass').map(c => c.label)
        return { seed, ok: r.ok, finished: r.finished, seconds: r.seconds, failed, metrics: r.metrics as RunMetrics }
      })
      const ablated = ablation === null ? 'the level as it is' : (changes.get(ablation) ?? 'not an ablation of this level: as it is')
      const change = variant === null ? ablated : `${variantChanges.get(variant) ?? 'not a variant of this level: its own domains'}; ${ablated}`
      const out: LevelSetVariant = { ablation, change, runs, mean: meanMetrics(runs.map(r => r.metrics.values)) }
      if (variant !== null) out.variant = variant
      return out
    })
  )
  return {
    level: { id: probe.info.id, number: probe.info.number, title: probe.info.title },
    seeds: [...opts.seeds],
    rounds: opts.rounds ?? 1,
    limit: opts.seconds ?? DEFAULT_LIMIT,
    stagger: opts.stagger ?? 0,
    variants
  }
}

/** 0 unless a run without an ablation failed (an ablated run is expected to break checks). */
export function levelSetExitCode(r: LevelSetResult): 0 | 1 {
  return r.variants.every(v => v.ablation !== null || v.runs.every(run => run.ok)) ? 0 : 1
}

/** `1-5` for consecutive seeds, else `1,3,7`. */
function seedsText(seeds: readonly number[]): string {
  const consecutive = seeds.length > 2 && seeds.every((s, i) => i === 0 || s === seeds[i - 1] + 1)
  return consecutive ? `${seeds[0]}-${seeds[seeds.length - 1]}` : seeds.join(',')
}

/** A line per run (its verdict and the checks it did not pass), then the means: a column per ablation. */
export function formatLevelSet(r: LevelSetResult): string {
  const rounds = `${r.rounds} round${r.rounds === 1 ? '' : 's'}`
  const lines = [`level ${r.level.number} ${r.level.id}: ${r.level.title}  (seeds ${seedsText(r.seeds)}, ${rounds}, limit ${r.limit} s${r.stagger ? `, stagger ${r.stagger} s` : ''})`]
  const label = (v: LevelSetVariant) => (v.variant === undefined ? (v.ablation ?? 'default') : v.ablation === null ? v.variant : `${v.variant}+${v.ablation}`)
  for (const v of r.variants) {
    lines.push(`${label(v)}: ${v.change}`)
    for (const run of v.runs) {
      const verdict = run.ok ? 'OK' : run.finished ? `FAILED ${run.failed.length}` : `TIMED OUT, ${run.failed.length} not passed`
      const which = run.ok ? '' : `: ${run.failed.slice(0, 3).join('; ')}${run.failed.length > 3 ? '; ...' : ''}`
      lines.push(`  seed ${run.seed}: ${verdict} at ${formatMetric(run.seconds)} s${which}`)
    }
  }
  lines.push(`means over ${r.seeds.length} seed${r.seeds.length === 1 ? '' : 's'}:`)
  lines.push(formatMetricsTable(r.variants.map(v => ({ label: label(v), metrics: v.mean }))))
  return lines.join('\n')
}
