// Planner benchmark in the shape of upstream's HTNBenchmark (HTNBenchmark/README.md, Benchmarks/main_benchmark.txt):
// per scenario plans/s, µs per plan, p50 / p95 / p99 / max latency and failures; the lifecycle (world state, setup,
// first plan, warmed plans); structural counters per plan (upstream's "Structural events (total / per plan)") and
// what counting costs. Run by scripts/htn-bench.ts (npm run htn:bench); test/htn/planner/bench.test.ts smoke-tests it.
import { bool, float, int, list, sym, vec3, type Atom } from '../../src/htn-planner/htn/atom'
import type { DomainIR } from '../../src/htn-planner/htn/ir'
import { newPlanStats, PlanRunner, type DecompositionStatus, type PlannerOptions, type PlanStats } from '../../src/htn-planner/htn/planner'
import { addFacts, WorldState, type WorldFacts } from '../../src/htn-planner/htn/world-state'
import { CALLTERM_SETS } from '../../src/examples/upstream/conformance-callterms'
import { aaaCombatDomain } from '../../src/examples/upstream/generated/AAACombatNPC.htn'
import { aaaCombatNPCHighOrderFacts } from '../../src/examples/upstream/generated/AAACombatNPC_high_order.facts'
import { aaaCombatNPCIdleFacts } from '../../src/examples/upstream/generated/AAACombatNPC_idle.facts'
import { aaaCombatNPCMeleeFacts } from '../../src/examples/upstream/generated/AAACombatNPC_melee.facts'
import { aaaCombatNPCSearchFacts } from '../../src/examples/upstream/generated/AAACombatNPC_search.facts'
import { complexScenarioDomain } from '../../src/examples/upstream/generated/complex_scenario.htn'
import { complexScenarioCombatFacts } from '../../src/examples/upstream/generated/complex_scenario_combat.facts'
import { complexScenarioEmergencyFacts } from '../../src/examples/upstream/generated/complex_scenario_emergency.facts'
import { complexScenarioIdleFacts } from '../../src/examples/upstream/generated/complex_scenario_idle.facts'
import { complexScenarioMobilityFacts } from '../../src/examples/upstream/generated/complex_scenario_mobility.facts'
import { complexScenarioRecoveryFacts } from '../../src/examples/upstream/generated/complex_scenario_recovery.facts'
import { complexScenarioRecursive100Facts } from '../../src/examples/upstream/generated/complex_scenario_recursive_100.facts'
import { guardDomain } from '../../src/examples/guard/guard.htn'
import { stalkerFacts } from '../../src/examples/stalker/stalker-actions'
import { stalkerDomain } from '../../src/examples/stalker/stalker.htn'
import { GuardBlackboard } from '../../src/htn-planner/npc/blackboard'
import { CrowdLevel } from '../../src/playground/levels/crowd'
import { StalkerLevel } from '../../src/playground/levels/stalker'
import type { LevelSim } from '../../src/playground/sim'
import { parseDomain } from '../../test/htn/planner/domain-text'
import { compileDomainFile } from '../../tools/htn/compiler'
import * as nodePath from 'node:path'
import { measureAllocation } from './alloc'

/** One benchmark scenario: a domain, a world and a top-level method (upstream BenchmarkCase, main.cpp:208-213). */
export interface BenchCase {
  name: string
  category: string
  domain: DomainIR
  method: string
  args?: readonly Atom[]
  /** A fresh world each call; `facts` is set when the world comes from a world state (the lifecycle times it). */
  world: () => WorldState
  facts?: WorldFacts
  options?: (world: WorldState) => PlannerOptions
  /** Heavy: fewer iterations (upstream FactHeavy100). */
  heavy?: boolean
}

const testCallterms = (w: WorldState): PlannerOptions => ({
  callterms: CALLTERM_SETS.test,
  context: { world: w, vars: {}, trace: [], counters: {}, errors: [] }
})

function fromFacts(name: string, category: string, domain: DomainIR, method: string, facts: WorldFacts, heavy = false): BenchCase {
  return {
    name,
    category,
    domain,
    method,
    facts,
    heavy,
    options: testCallterms,
    world: () => {
      const w = new WorldState()
      addFacts(w, facts)
      return w
    }
  }
}

/** The world of a playground agent after `seconds` of its level (its own facts, as it plans them in the scene). */
function levelWorld(make: () => LevelSim, seconds: number, setup?: (level: LevelSim) => void): () => WorldState {
  let cached: WorldState | undefined
  return () => {
    if (cached === undefined) {
      const level = make().init()
      setup?.(level)
      for (let t = 0; t < seconds; t += 1 / 30) level.update(1 / 30)
      cached = level.agent.blackboard.world
    }
    return cached
  }
}

const vec3Of = (x: number, z: number) => ({ x, y: 0, z })

/** A level world with one more belief to update: the upkeep's last rule holds, so it checks every rule and plans one step. */
function withStaleBelief(base: () => WorldState, add: (w: WorldState) => void): () => WorldState {
  return () => {
    const w = base()
    add(w)
    return w
  }
}

/** A stalker that lost the target it hunts, on a patrol, with an old noise: its search, low in the reference's list. */
function stalkerSearchWorld(): WorldState {
  const b = new GuardBlackboard()
  b.setTime(40)
  b.setSelfPosition(vec3Of(0, 0))
  b.setVisible([])
  b.setRoute([vec3Of(0, 4), vec3Of(0, 16)])
  stalkerFacts.setPlayerNoiseKinds(b.world, ['steps', 'run', 'land'])
  stalkerFacts.setWatching(b.world)
  stalkerFacts.setNoticed(b.world, 'player')
  b.remember({ id: 'player', position: vec3Of(5, 6), time: 38 })
  return b.world
}

/**
 * The continue ablation's guard (test/fixtures/continue/guard_continue.domain: a copy of the guard as it was before the guard kit include, plus continue_chase,
 * GuardAgentOptions.continueTask), compiled once; null when it does not compile (its rows are left out).
 */
let continueGuard: DomainIR | null | undefined
function continueGuardDomain(): DomainIR | null {
  if (continueGuard === undefined) {
    const r = compileDomainFile(nodePath.join(process.env.HTN_REPO_ROOT ?? process.cwd(), 'test/fixtures/continue/guard_continue.domain'))
    continueGuard = r.ok ? r.ir : null
  }
  return continueGuard
}

/**
 * A guard chasing A when B, nearer, comes into sight (target_visible rows nearest first); `running`: the agent
 * publishes the running chase as `(running chase A)` (continueTask on).
 */
function retargetWorld(running: boolean): () => WorldState {
  return () => {
    const b = new GuardBlackboard()
    b.setTime(30)
    b.setSelfPosition(vec3Of(0, 0))
    b.setRoute([vec3Of(0, -10), vec3Of(0, 10)])
    b.setAlert('calm')
    b.setVisible([
      { id: 'B', position: vec3Of(2, 2), distance: 2.8 },
      { id: 'A', position: vec3Of(-4, 5), distance: 6.4 }
    ])
    if (running) b.world.add('running', sym('chase'), sym('A'))
    return b.world
  }
}

/** The continue rows: the continue branch holds (the plan is `!continue`), the same world without it, and it fails. */
function continueCases(): BenchCase[] {
  const domain = continueGuardDomain()
  if (domain === null) return []
  return [
    { name: 'Continue holds', category: 'guard_continue: (!continue)', domain, method: 'behave', world: retargetWorld(true) },
    { name: 'Retarget', category: 'guard.domain: same, no branch', domain: guardDomain, method: 'behave', world: retargetWorld(true) },
    { name: 'Continue miss', category: 'guard_continue: branch fails', domain, method: 'behave', world: retargetWorld(false) }
  ]
}

// The patrol / chase NPC of test/htn/planner/bench.test.ts: roughly the size a scene NPC needs.
const SAMPLE_NPC = `
(:domain Sample top_level_domain
  (:constants (chase_range 12.0) (catch_range 1.5) (patrol_speed 1.0) (chase_speed 3.5))
  (:method (behave ?inp_self) top_level_method
    (catch_player
      (and (#visible_player ?inp_self ?player ?pos) (#distance_to ?inp_self ?pos ?d) (<= ?d @catch_range))
      ((!face ?player) (!grab ?player)))
    (chase_player
      (and (#visible_player ?inp_self ?player ?pos) (#distance_to ?inp_self ?pos ?d) (<= ?d @chase_range))
      ((!growl) (move ?pos @chase_speed) (&recheck ?inp_self)))
    (investigate_noise
      (and (heard_noise ?noise_pos ?time) (not (investigated ?noise_pos)) (call is_recent ?time))
      ((move ?noise_pos @patrol_speed) (!look_around 2.0)))
    (patrol
      (and (patrol_route ?inp_self ?route) (patrol_index ?inp_self ?i) (#waypoint ?route ?i ?wp))
      ((move ?wp @patrol_speed) (!set_patrol_index ?inp_self (% (+ ?i 1) 6))))
    (idle () ((!idle 1.0))))
  (:method (move ?inp_pos ?inp_speed)
    (blocked (and (blocked_cell ?inp_pos)) ((!wait 0.5)))
    (walk () ((!move_to ?inp_pos ?inp_speed))))
  (:method (recheck ?inp_self)
    (still (and (#visible_player ?inp_self ?p ?pos)) ((!chase_step ?pos)))
    (lost () ((!search))))
  (:axiom (visible_player ?inp_self ?out_player ?out_pos)
    (and (player ?out_player ?out_pos) (not (hidden ?out_player)) (call can_see ?inp_self ?out_pos)))
  (:axiom (distance_to ?inp_self ?inp_pos ?out_d)
    (and (position ?inp_self ?self_pos) (= ?out_d (call distance ?self_pos ?inp_pos))))
  (:axiom (waypoint ?inp_route ?inp_i ?out_wp)
    (alt (and (== ?inp_i 0) (split_list ?inp_route ?out_wp ?rest))
         (and (> ?inp_i 0) (split_list ?inp_route ?head ?tail) (#waypoint ?tail (- ?inp_i 1) ?out_wp)))))`

function sampleWorld(hidden: boolean): WorldState {
  const w = new WorldState()
  const self = sym('stalker')
  w.add('position', self, vec3(0, 0, 0))
  w.add('patrol_route', self, list(vec3(1, 0, 1), vec3(5, 0, 1), vec3(5, 0, 5), vec3(1, 0, 5), vec3(-3, 0, 5), vec3(-3, 0, 1)))
  w.add('patrol_index', self, int(4))
  for (let i = 0; i < 8; i++) w.add('blocked_cell', vec3(100 + i, 0, 0))
  for (let i = 0; i < 4; i++) w.add('heard_noise', vec3(i, 0, 9), float(i))
  for (let i = 0; i < 4; i++) w.add('investigated', vec3(i, 0, 9))
  w.add('player', sym('p1'), vec3(30, 0, 30))
  w.add('player', sym('p2'), vec3(2, 0, 2))
  if (hidden) w.add('hidden', sym('p2'))
  return w
}

const dist = (a: Atom, b: Atom): Atom | undefined => {
  if (a.t !== 'list' || b.t !== 'list') return undefined
  const [ax, , az] = a.v.map(x => x.v as number)
  const [bx, , bz] = b.v.map(x => x.v as number)
  return float(Math.hypot(ax - bx, az - bz))
}
const SELF = [sym('stalker')]
const sampleCallterms: PlannerOptions = {
  callterms: {
    can_see: a => {
      const d = dist(vec3(0, 0, 0), a[1])
      return bool(d !== undefined && (d.v as number) < 20)
    },
    distance: a => dist(a[0], a[1]),
    is_recent: () => bool(true)
  }
}

/** Every scenario: upstream's six ComplexScenario cases first (same world states), then other upstream and our domains. */
export function benchCases(): BenchCase[] {
  const sample = parseDomain(SAMPLE_NPC)
  return [
    fromFacts('Idle', 'Small / branch-light', complexScenarioDomain, 'run_scenario', complexScenarioIdleFacts),
    fromFacts('Combat', 'Branching', complexScenarioDomain, 'run_scenario', complexScenarioCombatFacts),
    fromFacts('Emergency', 'Alternative branch', complexScenarioDomain, 'run_scenario', complexScenarioEmergencyFacts),
    fromFacts('Mobility', 'Callterm / movement', complexScenarioDomain, 'run_scenario', complexScenarioMobilityFacts),
    fromFacts('Recovery', 'Conditions / recovery', complexScenarioDomain, 'run_scenario', complexScenarioRecoveryFacts),
    fromFacts('FactHeavy100', 'Fact-heavy / recursive', complexScenarioDomain, 'run_scenario', complexScenarioRecursive100Facts, true),
    fromFacts('AAA high_order', 'AAACombatNPC: orders', aaaCombatDomain, 'run', aaaCombatNPCHighOrderFacts),
    fromFacts('AAA melee', 'AAACombatNPC: melee', aaaCombatDomain, 'run', aaaCombatNPCMeleeFacts),
    fromFacts('AAA search', 'AAACombatNPC: search', aaaCombatDomain, 'run', aaaCombatNPCSearchFacts),
    fromFacts('AAA idle', 'AAACombatNPC: idle', aaaCombatDomain, 'run', aaaCombatNPCIdleFacts),
    { name: 'Sample patrol', category: 'Sample NPC: axiom recursion', domain: sample, method: 'behave', args: SELF, world: () => sampleWorld(true), options: () => sampleCallterms },
    { name: 'Sample chase', category: 'Sample NPC: backtracking', domain: sample, method: 'behave', args: SELF, world: () => sampleWorld(false), options: () => sampleCallterms },
    { name: 'Guard patrol', category: 'guard.domain (level 9)', domain: guardDomain, method: 'behave', world: levelWorld(() => new CrowdLevel(1), 2) },
    {
      name: 'Guard chase',
      category: 'guard.domain: target seen',
      domain: guardDomain,
      method: 'behave',
      world: levelWorld(() => new CrowdLevel(1), 3, level => {
        // The tester stands 4 m in front of the guard, in the yard, and stays.
        level.testerPaused = true
        const k = level.agent.kinematic
        level.teleportTester(vec3Of(k.position.x + Math.sin(k.yaw) * 4, k.position.z + Math.cos(k.yaw) * 4))
      })
    },
    { name: 'Stalker patrol', category: 'stalker.domain (level 7)', domain: stalkerDomain, method: 'behave', world: levelWorld(() => new StalkerLevel(), 2) },
    { name: 'Stalker search', category: 'stalker.domain: lost target', domain: stalkerDomain, method: 'behave', world: stalkerSearchWorld },
    // The belief upkeep the agent plans before behave on every replan (GuardAgentOptions.reasoning). Its usual pass
    // finds nothing to do (every rule checked, the empty fallback: the counters gate's level runs); here its last rule
    // holds (every rule checked, one step).
    {
      name: 'Stalker upkeep',
      category: 'stalker.domain: reasoning',
      domain: stalkerDomain,
      method: 'reasoning',
      world: withStaleBelief(levelWorld(() => new StalkerLevel(), 2), w => w.set('focus', float(1))) // drop_focus
    },
    {
      name: 'Guard upkeep',
      category: 'guard.domain: reasoning',
      domain: guardDomain,
      method: 'reasoning',
      // forget_stale_noise: heard 22 s before the level's 2 s
      world: withStaleBelief(levelWorld(() => new CrowdLevel(1), 2), w => w.set('heard_noise', sym('run'), vec3(1, 0, 1), float(-20), float(0.5)))
    },
    // The continue convention (GuardAgentOptions.continueTask): what the continue branch costs a plan.
    ...continueCases()
  ]
}

// ---- measuring ---------------------------------------------------------------------------------------------------

/** Node's clock (sub-µs); the Explorer's performance.now() is a Date.now() shim, see docs/htn-guidance.md. */
const now = (): number => performance.now()
const NO_ARGS: readonly Atom[] = []

export interface BenchOptions {
  /** Plans timed as one block per scenario (upstream iterations/case, default 20000). */
  iterations: number
  /** Plans timed one by one for the percentiles (upstream latency samples, default 5000). */
  samples: number
  /** Cap per timed phase, ms: a slow scenario runs fewer plans. */
  budgetMs: number
  /** Warm plans whose heap allocations are measured (alloc.ts; FactHeavy100: a tenth), 0: not measured. */
  allocPlans: number
}

export const DEFAULT_BENCH: BenchOptions = { iterations: 20000, samples: 5000, budgetMs: 1500, allocPlans: 5000 }

export interface CaseResult {
  name: string
  category: string
  plans: number
  plansPerSecond: number
  usPerPlan: number
  p50: number
  p95: number
  p99: number
  max: number
  failures: number
  /** Lifecycle: world state from its facts (null: the world comes from a running agent), setup, first plan, µs. */
  worldUs: number | null
  setupUs: number
  firstUs: number
  /** Structural counters of one plan, and its peak call frames (execution info). */
  stats: PlanStats
  peakCallFrames: number
  /** µs per plan without and with PlannerOptions.stats, median of alternating rounds. */
  offUs: number
  onUs: number
  /** V8 heap bytes allocated per warm plan (alloc.ts), null when not measured; GCs and their ms meanwhile. */
  bytesPerPlan: number | null
  allocPlans: number
  gcCount: number
  gcMs: number
}

/** Nearest-rank percentile of sorted values. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s[s.length >> 1]
}

/** Plans `runner` until `count` plans or `budgetMs`; returns [plans, µs per plan, failures]. */
function timed(runner: PlanRunner, c: BenchCase, expected: DecompositionStatus, count: number, budgetMs: number): [number, number, number] {
  const method = c.method
  const args = c.args ?? NO_ARGS
  let failures = 0
  let n = 0
  const start = now()
  const stop = start + budgetMs
  // Check the clock every 16 plans: cheap next to a plan, and a slow scenario still stops near the budget.
  while (n < count) {
    if (runner.plan(method, args) !== expected) failures++
    n++
    if ((n & 15) === 0 && now() > stop) break
  }
  return [n, ((now() - start) * 1000) / n, failures]
}

export function runCase(c: BenchCase, opts: BenchOptions = DEFAULT_BENCH): CaseResult {
  // Lifecycle (upstream --lifecycle, main.cpp:440-505): world state, setup, first plan; steady comes from the suite.
  let t = now()
  const world = c.world()
  const worldUs = c.facts !== undefined ? (now() - t) * 1000 : null
  const options = c.options?.(world) ?? {}
  t = now()
  const runner = new PlanRunner(c.domain, world, options)
  const setupUs = (now() - t) * 1000
  const args = c.args ?? NO_ARGS
  t = now()
  const expected = runner.plan(c.method, args)
  const firstUs = (now() - t) * 1000
  // Upstream counts a decomposition that does not succeed as a failure (main.cpp:491).
  let failures = expected === 'succeeded' ? 0 : 1

  const iterations = c.heavy ? Math.min(opts.iterations, 2000) : opts.iterations
  const samples = c.heavy ? Math.min(opts.samples, 500) : opts.samples
  timed(runner, c, expected, Math.min(iterations, 200), opts.budgetMs / 4) // warm-up
  const [plans, usPerPlan, blockFailures] = timed(runner, c, expected, iterations, opts.budgetMs)

  const lat: number[] = []
  failures += blockFailures
  const stop = now() + opts.budgetMs
  for (let i = 0; i < samples && (i < 50 || now() < stop); i++) {
    const s = now()
    const status = runner.plan(c.method, args)
    lat.push((now() - s) * 1000)
    if (status !== expected) failures++
  }
  lat.sort((a, b) => a - b)

  // Counters of one plan, and what counting costs: alternate rounds without and with them.
  const stats = newPlanStats()
  const counting = new PlanRunner(c.domain, world, { ...options, stats })
  counting.plan(c.method, args)
  const counted = { ...stats }
  const peakCallFrames = counting.executionInfo.peakCallFrames
  const round = Math.max(20, Math.min(iterations, Math.round((opts.budgetMs * 1000) / 10 / Math.max(usPerPlan, 0.01))))
  const off: number[] = []
  const on: number[] = []
  for (let r = 0; r < 5; r++) {
    off.push(timed(runner, c, expected, round, opts.budgetMs / 10)[1])
    on.push(timed(counting, c, expected, round, opts.budgetMs / 10)[1])
  }

  // Heap bytes per warm plan, and the collections they cause.
  const allocPlans = c.heavy ? Math.ceil(opts.allocPlans / 10) : opts.allocPlans
  const alloc = allocPlans > 0 ? measureAllocation(() => runner.plan(c.method, args), allocPlans) : null

  return {
    name: c.name,
    category: c.category,
    plans,
    plansPerSecond: 1e6 / usPerPlan,
    usPerPlan,
    p50: percentile(lat, 50),
    p95: percentile(lat, 95),
    p99: percentile(lat, 99),
    max: lat[lat.length - 1] ?? 0,
    failures,
    worldUs,
    setupUs,
    firstUs,
    stats: counted,
    peakCallFrames,
    offUs: median(off),
    onUs: median(on),
    bytesPerPlan: alloc ? alloc.bytesPerCall : null,
    allocPlans,
    gcCount: alloc?.gcCount ?? 0,
    gcMs: alloc?.gcMs ?? 0
  }
}

// ---- report ------------------------------------------------------------------------------------------------------

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length))
const lpad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s)
const f = (v: number, d = 3) => v.toFixed(d)

export function formatSuite(results: readonly CaseResult[]): string {
  const out: string[] = []
  out.push('Baseline suite')
  out.push(
    pad('scenario', 16) +
      pad('category', 30) +
      ['plans/s', 'us/plan', 'p50 us', 'p95 us', 'p99 us', 'max us'].map(h => lpad(h, 11)).join('') +
      lpad('failures', 10) +
      lpad('bytes/plan', 12)
  )
  for (const r of results) {
    out.push(
      pad(r.name, 16) +
        pad(r.category, 30) +
        [f(r.plansPerSecond, 0), f(r.usPerPlan), f(r.p50), f(r.p95), f(r.p99), f(r.max)].map(v => lpad(v, 11)).join('') +
        lpad(String(r.failures), 10) +
        lpad(r.bytesPerPlan === null ? '-' : f(r.bytesPerPlan, 0), 12)
    )
  }
  return out.join('\n')
}

export function formatLifecycle(results: readonly CaseResult[]): string {
  const out = ['Lifecycle: world state / setup / first plan / warmed plans (us; first includes the JIT warming up)']
  out.push(pad('scenario', 16) + ['worldstate', 'setup', 'first', 'steady'].map(h => lpad(h, 12)).join(''))
  for (const r of results) {
    out.push(pad(r.name, 16) + [r.worldUs === null ? '-' : f(r.worldUs, 1), f(r.setupUs, 1), f(r.firstUs, 1), f(r.usPerPlan)].map(v => lpad(v, 12)).join(''))
  }
  return out.join('\n')
}

const STAT_COLUMNS: [keyof PlanStats, string][] = [
  ['methods', 'methods'],
  ['branches', 'branches'],
  ['branchRetries', 'br.retry'],
  ['branchBacktracks', 'br.back'],
  ['tasks', 'tasks'],
  ['conditions', 'conds'],
  ['axioms', 'axioms'],
  ['callterms', 'calls'],
  ['factQueries', 'f.query'],
  ['factRowsTested', 'f.tested'],
  ['factRowsMatched', 'f.match'],
  ['factChoicePoints', 'f.choice'],
  ['factChoiceRetries', 'f.retry'],
  ['bindings', 'binds'],
  ['unbinds', 'unbinds']
]

export function formatCounters(results: readonly CaseResult[]): string {
  const out = ['Structural counters per plan (PlannerOptions.stats) and peak call frames (PlanRunner.executionInfo)']
  out.push(pad('scenario', 16) + STAT_COLUMNS.map(([, h]) => lpad(h, 9)).join('') + lpad('frames', 8))
  for (const r of results) out.push(pad(r.name, 16) + STAT_COLUMNS.map(([k]) => lpad(String(r.stats[k]), 9)).join('') + lpad(String(r.peakCallFrames), 8))
  return out.join('\n')
}

/** Heap allocations per plan and the garbage collections they cost (alloc.ts: how it measures, how precise). */
export function formatAlloc(results: readonly CaseResult[]): string {
  const out = ['Allocations: V8 heap bytes per warm plan (heap used + what each GC freed, net of an empty loop), and the GCs meanwhile']
  out.push(pad('scenario', 16) + ['bytes/plan', 'plans', 'GCs', 'GC ms', 'GC us/plan'].map(h => lpad(h, 12)).join(''))
  for (const r of results) {
    const cells = r.bytesPerPlan === null ? ['-', '0', '-', '-', '-'] : [f(r.bytesPerPlan, 1), String(r.allocPlans), String(r.gcCount), f(r.gcMs, 3), f((r.gcMs * 1000) / r.allocPlans, 3)]
    out.push(pad(r.name, 16) + cells.map(v => lpad(v, 12)).join(''))
  }
  return out.join('\n')
}

export function formatOverhead(results: readonly CaseResult[]): string {
  const out = ['Counting cost: us/plan without and with PlannerOptions.stats (median of 5 alternating rounds)']
  out.push(pad('scenario', 16) + ['off', 'on', 'on/off'].map(h => lpad(h, 11)).join(''))
  for (const r of results) out.push(pad(r.name, 16) + [f(r.offUs), f(r.onUs), f(r.onUs / r.offUs, 2)].map(v => lpad(v, 11)).join(''))
  return out.join('\n')
}
