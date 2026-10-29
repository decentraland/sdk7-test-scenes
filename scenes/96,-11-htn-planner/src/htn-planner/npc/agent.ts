// One HTN-driven guard, independent of the ECS: sense → sync WorldState → (re)plan → execute.
// The scene layer (guard-scene.ts) feeds target samples and copies `kinematic` to a Transform.
//
// Replan policy:
//  - immediately when there is no plan, the plan completed, a step failed, or a deferred step failed
//    to decompose. A step with no executor (unknown name, or the executor rejected the arguments) is no failure:
//    it runs as a 0.05 s no-op, as upstream HTNDemo's host does, and a `diagnostic` event says so once per primitive;
//  - on a perception change (a target acquired or lost: the set of visible targets or of last-seen
//    memories changed), throttled to one replan per `replanThrottle` seconds;
//  - on a hearing escalation: the noise level rose (none < wary < alarmed: a noise heard after quiet,
//    or the alert meter became alarmed), throttled the same way. Not while a target is visible, so
//    noises never interrupt a chase. A newer noise at the same level does not replan (that would
//    restart turn + listen on every footstep); the domain picks it up when its plan ends;
//  - when planning finds nothing and no plan runs, retry on the next tick, one planner call per tick (upstream
//    HTNDemo: "retrying next update", no cooldown). `replanThrottle` paces only the triggers above.
// A sense runs and replans only if the domain reads its facts (DomainIR.facts): sight needs target_visible or
// last_seen, hearing needs heard_noise or alert. A domain that never looks at them (a courier carrying boxes) would
// only get its running plan cut, and pay for line-of-sight checks and facts nobody reads: its agent does not see or
// hear at all (no target_visible / last_seen / heard_noise rows, mode stays 'patrol'; a `syncFacts` that derives
// facts from blackboard sight needs a domain that reads target_visible or last_seen). Without a domain on the runner,
// or with callterms (they may read the blackboard), every sense runs and replans. What the domain reads is
// taken from the active runner's `domain` and recomputed when that object changes (a reload, an adopted
// candidate). The "not while a target is visible" noise gate applies only if the domain reads target_visible: a
// domain that cannot see a chase has none to protect.
//
// A replan while a plan runs does not touch it (upstream docs/USE_CASES.md, pattern 2): the agent plans a
// candidate in a second runner on the same world (planning into the active runner would replace its plan), then
//  - an equivalent candidate (the same steps, names and arguments, as the rest of the running plan from its
//    current step) is dropped: the running step, the plan index and the step's progress go on;
//  - a different one cancels the running step and becomes the active plan (the runners swap roles);
//  - no plan: `onNoPlan` 'keep' (default) lets the running plan go on, 'cancel' stops it and retries.
// A successful empty plan is a deliberate "nothing to do", often after a callterm changed the world: the agent
// syncs the facts and plans again in the same tick, up to `maxPlanningPasses` (upstream HTNDemo
// MaxImmediatePlanningPasses); after the last pass the empty plan stands and completes on the next tick.
// `metrics` counts planner calls and their time (upstream HTNDemo's planner stats), the runner's execution info (peak
// call frames, last error) and, when the runner counts (PlannerOptions.stats), its structural counters.
//
// Belief upkeep (`reasoning`, upstream docs/USE_CASES.md pattern 1, "`reasoning` performs administrative work such as
// selecting a threat or updating memory"; opt-in): before every planning of `topLevel` (each replan) the agent plans the
// reasoning method in a runner of its own on the same world and runs its steps at once (bookkeeping primitives:
// forget a stale memory, drop a noise, unfocus), then plans it again until it finds nothing to do (no plan or an
// empty one), at most `reasoningPasses` times. So the decision list never spends a plan, a tick and a cut running step
// on a bookkeeping branch, and the decision is planned against beliefs that are already up to date. Its steps are not
// plan steps (no `step` events); the replan event lists them in `upkeep`. A step must finish in its executor's start().
//
// The running-plan check (`activePlan`, upstream docs/USE_CASES.md pattern 1): while a step runs the agent publishes it
// as `(running <action> <arguments>...)`; on every tick a step runs, before any replan, it plans the check method in a
// third runner on the same world. Success lets the step go on (its progress kept). Anything else cancels the step and
// plans `topLevel` at once, without the candidate comparison: the domain said the running plan is invalid, so an
// equivalent candidate must not keep it. If that plan is the same again from the rejected step on, the two methods
// disagree: a diagnostic, and that step runs on unchecked (upstream would cancel it on every update).
//
// The continue convention (`continueTask`, opt-in; Killzone 2 / Decima continue branches): the domain answers a replan
// with a plan that is only the continue task (`(!continue)`) to say "keep the running plan". The agent then keeps it as
// it keeps an equivalent candidate (running step, plan index and progress go on; no cue replays), and the replan event
// says `continued`. The domain reads what runs from two facts: the running step, `(running <action> <arguments>...)`
// (the running-plan check's fact, published while a step runs), and the plan's own name, `(active_plan <name>
// <arguments>...)`, written by the `!begin_plan <name> <arguments>...` marker step and cleared by `!end_plan` and
// whenever the plan is dropped (a new plan adopted, the plan done or failed, a reload, a stop). A continue plan with no
// plan to keep, or a continue step inside a longer plan, idles one tick (diagnostic `continue_idle`, once). The planner
// knows nothing of it: `!continue`, `!begin_plan` and `!end_plan` are ordinary primitives (upstream DOMAIN_LANGUAGE),
// with no executor while the option is off.
//
// A shared per-frame budget (`planBudget`, plan-budget.ts) gates every replan above, the check's too: a replan it
// refuses waits for a later frame while the running step goes on (an agent with no plan stands still); the request is
// urgent when nothing runs. The running-plan check itself is not budgeted: it decides whether the step may go on.
import { formatTask, sym, type Atom } from '../htn/atom'
import { ACCEPTS_ANYTHING, acceptingBranches } from '../htn/check-method'
import type { DomainIR } from '../htn/ir'
import { atomEquals } from '../htn/match'
import type { DecompositionStatus, ExecutionInfo, PlanRunner, PlanStats, PlanStep, RuntimeDiagnostic } from '../htn/planner'
import { literalText } from '../htn/titles'
import { snapshotWorld, worldDiff, WorldSnapshot, WorldState } from '../htn/world-state'
import type { FactRow } from '../htn/world-state'
import { ActionContext, ActionExecutor, ActionRegistry, ActionStatus, DEFAULT_TUNING, GUARD_ACTIONS, GuardEvent, GuardTuning, instant, ReplanEvent, ReplanTrigger, timed } from './actions'
import { GuardBlackboard } from './blackboard'
import type { AgentHistory } from './history'
import type { PlanBudget } from './plan-budget'
import { FLAT_GROUND, Kinematic, settle, Terrain } from './movement'
import { AlertLevel, DEFAULT_HEARING, HeardNoise, Hearing, HearingConfig, HearingResult } from './hearing'
import type { NoiseEvent } from './noise'
import { CLEAR_LINE_OF_SIGHT, DEFAULT_PERCEPTION, LineOfSight, Perception, PerceptionConfig, PerceptionResult, TargetSample } from './perception'
import { copy, Vec3 } from './vec'

/** The slice of PlanRunner the agent uses, so tests can inject a scripted fake. `domain` picks the senses that replan. */
export type PlanRunnerLike = Pick<PlanRunner, 'plan' | 'resolve' | 'current' | 'complete' | 'clear' | 'steps'> & {
  /** `name`, `methods` and `topLevel`, when there, let the agent check `activePlan` before it plans it. */
  readonly domain?: Pick<DomainIR, 'facts' | 'callterms'> & Partial<Pick<DomainIR, 'name' | 'methods' | 'topLevel'>>
  /** PlanRunner's: read after every planner call for `metrics`; a runner without them leaves those metrics empty. */
  readonly executionInfo?: Readonly<ExecutionInfo>
  readonly stats?: Readonly<PlanStats> | null
}
export type PlannerFactory = (world: WorldState) => PlanRunnerLike

const TIME_EPSILON = 1e-6

/** Fact changes listed on a replan event at most (the rest is counted). */
const MAX_CHANGES = 12

/**
 * The facts the agent writes every tick: its clock and its position. Their rows differ at nearly every replan, so a
 * replan names them in `volatile`, not in `changes` (ReplanEvent).
 */
export const VOLATILE_FACTS: readonly string[] = ['now', 'self_position']

const factName = (k: string) => k.slice(0, k.lastIndexOf('/'))

/**
 * The rows that changed between two snapshots, of the facts `reads` lists (all when undefined) but not the
 * `volatile` ones (by name), as `+ (name args)` / `- (name args)`, removals first, at most MAX_CHANGES lines (then
 * `… +N more`).
 */
export function factChanges(before: WorldSnapshot, after: WorldSnapshot, reads?: readonly string[], volatile: readonly string[] = []): string[] {
  return changeLines(worldDiff(before, after), reads, volatile)
}

function changeLines(d: ReturnType<typeof worldDiff>, reads: readonly string[] | undefined, volatile: readonly string[]): string[] {
  const keep = (k: string) => (reads === undefined || reads.includes(k)) && !volatile.includes(factName(k))
  const line = (sign: string, k: string, row: FactRow) => `${sign} (${[factName(k), ...row.map(literalText)].join(' ')})`
  const out: string[] = []
  for (const k of Object.keys(d.removed).sort()) if (keep(k)) for (const r of d.removed[k]) out.push(line('-', k, r))
  for (const k of Object.keys(d.added).sort()) if (keep(k)) for (const r of d.added[k]) out.push(line('+', k, r))
  return out.length > MAX_CHANGES ? [...out.slice(0, MAX_CHANGES), `… +${out.length - MAX_CHANGES} more`] : out
}

/** The `volatile` facts (by name) of those `reads` lists (all when undefined) whose rows changed, sorted. */
function volatileNames(d: ReturnType<typeof worldDiff>, reads: readonly string[] | undefined, volatile: readonly string[]): string[] {
  const names = new Set<string>()
  for (const k of [...Object.keys(d.removed), ...Object.keys(d.added)]) {
    if ((reads === undefined || reads.includes(k)) && volatile.includes(factName(k))) names.add(factName(k))
  }
  return [...names].sort()
}

const sameTexts = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** The fact the agent publishes the running step as, when it checks the running plan (GuardAgentOptions.activePlan). */
export const RUNNING_FACT = 'running'

/** The running step's row of RUNNING_FACT: the primitive's name without '!' as a symbol, then its arguments. */
export function runningRow(step: { name: string; args: readonly Atom[] }): Atom[] {
  return [sym(step.name.startsWith('!') ? step.name.slice(1) : step.name), ...step.args]
}

/**
 * The fact the continue convention (GuardAgentOptions.continueTask) publishes the running plan's name as:
 * `(active_plan <name> <arguments>...)`, the arguments of its `!begin_plan` step (Decima).
 */
export const ACTIVE_PLAN_FACT = 'active_plan'

/** The marker steps of the continue convention: `(!begin_plan <name> <arguments>...)` ... `(!end_plan)`. */
export const BEGIN_PLAN = '!begin_plan'
export const END_PLAN = '!end_plan'

/** A continue step the agent runs (no plan to keep, or not alone in its plan): it idles one tick. */
function oneTick(): ActionExecutor {
  return { start: () => 'running', update: () => 'done', cancel: () => {} }
}

/** How long a step with no executor takes: upstream HTNDemo's no-op (AIHTNDemoWandererAgent.cpp:415-416). */
export const NO_EXECUTOR_SECONDS = 0.05

export type GuardMode = 'patrol' | 'alert' | 'investigate' | 'chase'

const NOISE_RANK: Record<AlertLevel | 'none', number> = { none: 0, calm: 1, wary: 1, alarmed: 2 }

interface SenseReads {
  visible: boolean
  memory: boolean
  hearing: boolean
}

/** Which sensed facts the domain queries (see the replan policy above). */
function senseReads(domain: PlanRunnerLike['domain']): SenseReads {
  if (!domain || domain.callterms.length > 0) return { visible: true, memory: true, hearing: true }
  const reads = (fact: string) => domain.facts.includes(fact)
  return { visible: reads('target_visible/2'), memory: reads('last_seen/3'), hearing: reads('heard_noise/4') || reads('alert/1') }
}

/** Same steps by kind, name and arguments: the candidate-plan equivalence (USE_CASES 2: "relevant task arguments,
 *  targets and action identity"). Deferred steps compare by name and arguments too, not by what they expand to. */
function sameSteps(a: readonly PlanStep[], b: readonly PlanStep[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.kind !== y.kind || x.name !== y.name || x.args.length !== y.args.length) return false
    for (let j = 0; j < x.args.length; j++) if (!atomEquals(x.args[j], y.args[j])) return false
  }
  return true
}

/** `performance` is not in the scene's type libraries. Node has it; the Explorer defines it as a Date.now() shim. */
declare const performance: { now(): number } | undefined

/** Milliseconds for the planning metrics: performance.now() where there is one, else Date.now() (1 ms steps). */
function defaultClock(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
}

/** Decision/replan metrics of one agent, plus separate check/upkeep counts and times. Deferred expansions are not counted. */
export interface PlanningMetrics {
  /** Duration of the last decision/replan decomposition, ms. */
  lastPlanMs: number
  totalPlanMs: number
  maxPlanMs: number
  /** Decision/replan decompositions: every pass, of an adopted plan or a dropped candidate. */
  plansMade: number
  /** Steps that ended `done`. */
  tasksCompleted: number
  /** Call frames the last decision/replan decomposition peaked at; 0 if the runner does not say. */
  lastPeakCallFrames: number
  /** The highest decision/replan peak, against `callFrameCapacity`: how much of maxDepth those decompositions use. */
  maxPeakCallFrames: number
  /** The runner's call-frame capacity (PlannerOptions.maxDepth); 0 if the runner does not say. */
  callFrameCapacity: number
  /** The last decision/replan decomposition's runtime error (upstream last_error), or null. */
  lastError: RuntimeDiagnostic | null
  /**
   * Structural counters of the last decision/replan decomposition and their sum over those passes only.
   * Running-plan checks, reasoning upkeep and deferred expansions are excluded; check/upkeep counts and times
   * are reported separately below. Null unless the runner counts (PlannerOptions.stats). Replaced, never changed
   * in place, so a copied `metrics` keeps its numbers.
   */
  lastStats: PlanStats | null
  totalStats: PlanStats | null
  /** Running-plan checks (GuardAgentOptions.activePlan) and their time, ms; not in `plansMade` / `totalPlanMs`. */
  checksMade: number
  totalCheckMs: number
  /** Replans the shared `planBudget` refused (one per tick), and the most frames one replan waited for it. */
  budgetDeferred: number
  budgetMaxWaitFrames: number
  /** Planner calls of the belief upkeep (GuardAgentOptions.reasoning) and their time, ms; not in `plansMade`. */
  reasoningMade: number
  totalReasoningMs: number
  /** Replans that kept the running plan because the domain planned the continue task (GuardAgentOptions.continueTask). */
  continued: number
}

/** Zeroed planning metrics, for any host that reports them (the agent, the stations). */
export function newPlanningMetrics(): PlanningMetrics {
  return {
    lastPlanMs: 0,
    totalPlanMs: 0,
    maxPlanMs: 0,
    plansMade: 0,
    tasksCompleted: 0,
    lastPeakCallFrames: 0,
    maxPeakCallFrames: 0,
    callFrameCapacity: 0,
    lastError: null,
    lastStats: null,
    totalStats: null,
    checksMade: 0,
    totalCheckMs: 0,
    budgetDeferred: 0,
    budgetMaxWaitFrames: 0,
    reasoningMade: 0,
    totalReasoningMs: 0,
    continued: 0
  }
}

export interface GuardAgentOptions {
  id: string
  planner: PlannerFactory
  lineOfSight: LineOfSight
  start: { position: Vec3; yaw: number }
  route?: readonly Vec3[]
  routeStart?: number
  tuning?: Partial<GuardTuning>
  perception?: Partial<PerceptionConfig>
  /** Independent gaze direction in world radians. Does not rotate locomotion. */
  sightYaw?: () => number
  hearing?: Partial<HearingConfig>
  /** Occlusion for wall muffling of noises; default none (walls do not muffle). */
  hearingLineOfSight?: LineOfSight
  terrain?: Terrain
  actions?: ActionRegistry // merged over GUARD_ACTIONS
  topLevel?: string // default 'behave'
  /**
   * The running-plan check (upstream docs/USE_CASES.md pattern 1), a top-level method with no arguments, e.g.
   * 'active_plan'. Unset: no check, no running fact. Set: while a step runs the agent publishes it as
   * `(running <action> <arguments>...)` (RUNNING_FACT, runningRow; `(!attack A)` -> `(running attack A)`), and on
   * every tick a step runs it plans this method in a runner of its own on the agent's world, before any replan.
   * Success (its steps are ignored) lets the step go on; anything else cancels the step and plans `topLevel` at
   * once, bypassing the candidate comparison (event `check`, then a replan 'active_plan failed'). Give it one branch
   * per action and no catch-all: a branch with no condition and no tasks accepts every step (diagnostic
   * `active_plan_fallback`). A method the domain lacks: diagnostic `active_plan_invalid`, no check.
   */
  activePlan?: string
  /**
   * Belief upkeep (upstream docs/USE_CASES.md pattern 1), a top-level method with no arguments, e.g. 'reasoning'.
   * Unset (default): none. Set: before every planning of `topLevel` it is planned in a runner of its own on the
   * agent's world and its steps run at once, through the same executors (each must finish in start(): forget,
   * forget_noise, unfocus...; one that does not is cancelled, diagnostic `reasoning_not_instant`), then planned again
   * until it finds nothing to do (no plan, or an empty plan), at most `reasoningPasses` times (more: diagnostic
   * `reasoning_unsettled`). The replan event lists the steps in `upkeep`; `metrics.reasoningMade` / `totalReasoningMs`
   * count it. A method the domain lacks: diagnostic `reasoning_invalid`, no upkeep. Give it one branch per rule, each
   * a bookkeeping step whose effect makes its own condition false.
   */
  reasoning?: string
  /**
   * The continue convention (Killzone 2 / Decima continue branches), the name of a primitive, e.g. '!continue'. Unset
   * (default): none; the task and the markers below are steps like any other. Set:
   *  - a replan whose plan is only this task, while a plan runs, keeps the running plan and its running step with its
   *    progress (no restart, no cue replay); the replan event has `kept` and `continued`, its `plan` is the running
   *    plan; `metrics.continued` counts them. A continue task not alone in its plan, or one planned with no plan to
   *    keep, runs as a step that idles one tick (diagnostic `continue_idle`, once);
   *  - the running step is published as `(running <action> <arguments>...)` (RUNNING_FACT, as with `activePlan`);
   *  - `(!begin_plan <name> <arguments>...)` writes `(active_plan <name> <arguments>...)` (ACTIVE_PLAN_FACT) and
   *    `(!end_plan)` clears it, both instant; dropping the plan (a new plan adopted, done, failed, a reload, a stop)
   *    clears it too, so it names the plan that runs, never an old one.
   * Write a continue branch directly above the behaviour branch it guards, with the fact as its condition:
   * `(continue_chase (and (running chase ?t) (target_visible ?t ?any_p)) ((!continue)))`. The planner is unchanged.
   */
  continueTask?: string
  /** Reasoning plans per replan at most (default 4): the rules that may apply one after another, plus one. */
  reasoningPasses?: number
  /** s, default 0 (as upstream: no cooldown): the least time between trigger replans (perception, hearing,
   *  syncFacts, a non-urgent requestReplan). A completed plan or a failed step replans at once, a no-plan retry on
   *  the next tick. A flickering trigger then costs a plan per tick (H2 keeps an equivalent plan): set e.g. 0.25. */
  replanThrottle?: number
  maxStepsPerTick?: number // instant steps chained in one tick, default 8
  /**
   * A replan found no plan while a plan runs: 'keep' (default) lets it go on, 'cancel' stops it and retries on the
   * next tick. Keep, because a trigger replan only asks whether something better exists: "nothing" is no
   * reason to stand still mid-step, and the running plan ends (and replans) on its own. With nothing running
   * (no plan yet, plan completed, step failed) both retry on every tick until a plan is found (upstream HTNDemo).
   */
  onNoPlan?: 'keep' | 'cancel'
  maxPlanningPasses?: number // planner calls per replan while the plan is successful but empty, default 4 (upstream)
  clock?: () => number // ms, for `metrics`; default performance.now(), else Date.now()
  onEvent?: (event: GuardEvent) => void
  /** A debugger's timeline: every event is appended with the agent's time (npc/history.ts). Off by default. */
  history?: AgentHistory
  /**
   * Extra facts for another domain (e.g. Stalker, src/examples/stalker/stalker-actions.ts): called every tick after
   * perception and hearing; writes its facts into `agent.blackboard.world` and returns a short key. A
   * change of the key requests a replan, like a perception change.
   */
  syncFacts?: (agent: GuardAgent) => string
  /**
   * Facts the host writes every tick (from syncFacts: a distance, a timer), by name: like the agent's own `now` and
   * `self_position` (VOLATILE_FACTS) a replan names them in `volatile`, not in `changes`.
   */
  volatileFacts?: readonly string[]
  /**
   * A planning budget per frame shared with other agents (and a squad planner); the host calls its `beginFrame()`
   * once per frame before the ticks (GuardSquad's `budget` option does). A replan it refuses waits for a later frame
   * (the running step goes on). Unset: every replan runs when due.
   */
  planBudget?: PlanBudget
}

export class GuardAgent {
  readonly id: string
  readonly kinematic: Kinematic
  readonly blackboard = new GuardBlackboard()
  readonly perception: Perception
  readonly hearing: Hearing
  readonly tuning: GuardTuning
  readonly terrain: Terrain
  time = 0
  /** Last reason a plan was made, for debugging. */
  lastReplanReason = ''
  /** The last replan, structured (trigger, fact changes, whether the plan changed); null before the first. */
  lastReplan: ReplanEvent | null = null
  /** Status of the last planning; a plan kept under onNoPlan 'keep' runs on with 'no_plan' here. */
  lastPlanStatus: DecompositionStatus | '' = ''
  readonly metrics: PlanningMetrics = newPlanningMetrics()
  lastPerception: PerceptionResult = { visible: [], lost: [], suspicion: 0 }
  lastHearing: HearingResult = { heard: [], loudest: null, latest: null, alert: 0, level: 'calm' }
  /** The loudest noise of the last update that heard any, and the agent time it was heard (debug views). */
  lastHeard: { noise: HeardNoise; at: number } | null = null

  private readonly actions: ActionRegistry
  private readonly lineOfSight: LineOfSight
  private readonly hearingLineOfSight: LineOfSight
  private readonly topLevel: string
  private readonly activePlan?: string
  private readonly continueTask?: string
  /** The running step is published (RUNNING_FACT): with activePlan or continueTask. */
  private readonly publishesRunning: boolean
  /** ACTIVE_PLAN_FACT's arity as published, -1 when nothing is. */
  private activePlanArity = -1
  private continueSaid = false
  private readonly reasoning?: string
  private readonly reasoningPasses: number
  /** The reasoning runner (created on the first replan); off when the method is not in the domain. */
  private reasoner: PlanRunnerLike | null = null
  private reasoningOff = false
  private unsettledSaid = false
  private readonly replanThrottle: number
  private readonly maxStepsPerTick: number
  private readonly onNoPlan: 'keep' | 'cancel'
  private readonly maxPlanningPasses: number
  private readonly clock: () => number
  private planner: PlannerFactory
  /** `active` holds the running plan; candidates are planned into `spare` (created on the first use). */
  private active: PlanRunnerLike
  private spare: PlanRunnerLike | null = null
  private readonly onEvent?: (event: GuardEvent) => void
  private readonly history?: AgentHistory
  private readonly syncFacts?: (agent: GuardAgent) => string
  private readonly volatile: readonly string[]
  private readonly sightYaw?: () => number
  private readonly planBudget?: PlanBudget
  /** The plan a failed check rejected, for the replan that follows it (then `rejected`). */
  private rejectedNext: readonly PlanStep[] | null = null
  private extraKey = ''
  /** Primitives already reported as having no executor (one diagnostic each). */
  private readonly unexecutable = new Set<string>()
  /** The activePlan runner (created on the first check); off when the method is not in the domain. */
  private checker: PlanRunnerLike | null = null
  private checkOff = false
  /** The running step is checked; false for a step the check rejected and the replan made again. */
  private checkStep = true
  /** The rest of the plan the check rejected, compared with the plan that starts next (then null). */
  private rejected: readonly PlanStep[] | null = null
  /** Primitives already reported as active_plan_conflict. */
  private readonly conflicts = new Set<string>()
  /** RUNNING_FACT's arity as published, -1 when nothing is. */
  private runningArity = -1
  private readonly ctx: ActionContext
  private hasPlan = false
  private executor: ActionExecutor | null = null
  private executorName = ''
  private pendingReplan: string | null = 'start'
  /** What asked for the pending replan, when, other triggers since, and frames the budget refused it. */
  private pendingTrigger: ReplanTrigger = 'start'
  /** NaN: asked between ticks, stamped with the next tick's time (the request waited no tick yet). */
  private pendingAt = NaN
  private ticking = false
  private pendingAlso: ReplanTrigger[] = []
  private pendingFrames = 0
  private deniedBudgetFrame = -1
  /** The world the last replan planned against (kept only while someone listens: history or onEvent). */
  private plannedWorld: WorldSnapshot | null = null
  private urgentReplan = true
  private lastReplanAt = -Infinity
  /** stop() is terminal: stale host references and in-flight callbacks cannot resume this agent. */
  private stopped = false
  private perceptionKey = '|'
  private noiseRank = 0
  /** What `readsOf` describes; `reads` recomputes when the active runner's domain is another object. */
  private readsOf: PlanRunnerLike['domain']
  private readsCache: SenseReads
  /** The senses ran last tick: a sense switched off by a domain swap forgets what it knew. */
  private seeing = true
  private hearingOn = true

  constructor(opts: GuardAgentOptions) {
    this.id = opts.id
    this.tuning = { ...DEFAULT_TUNING, ...opts.tuning }
    this.perception = new Perception({ ...DEFAULT_PERCEPTION, ...opts.perception })
    this.hearing = new Hearing({ ...DEFAULT_HEARING, ...opts.hearing })
    this.hearingLineOfSight = opts.hearingLineOfSight ?? CLEAR_LINE_OF_SIGHT
    this.terrain = opts.terrain ?? FLAT_GROUND
    this.kinematic = { position: copy(opts.start.position), yaw: opts.start.yaw }
    settle(this.kinematic, this.terrain)
    this.continueTask = opts.continueTask
    const conventions: Record<string, ActionRegistry[string]> = {}
    if (opts.continueTask !== undefined) {
      conventions[BEGIN_PLAN] = args => instant(() => (this.beginPlan(args), 'done'))
      conventions[END_PLAN] = () => instant(() => (this.dropActivePlan(), 'done'))
      conventions[opts.continueTask] = oneTick
    }
    this.actions = { ...GUARD_ACTIONS, ...conventions, ...opts.actions }
    this.lineOfSight = opts.lineOfSight
    this.topLevel = opts.topLevel ?? 'behave'
    this.activePlan = opts.activePlan
    this.publishesRunning = opts.activePlan !== undefined || opts.continueTask !== undefined
    this.reasoning = opts.reasoning
    this.reasoningPasses = Math.max(1, opts.reasoningPasses ?? 4)
    this.replanThrottle = opts.replanThrottle ?? 0
    this.maxStepsPerTick = opts.maxStepsPerTick ?? 8
    this.onNoPlan = opts.onNoPlan ?? 'keep'
    this.maxPlanningPasses = Math.max(1, opts.maxPlanningPasses ?? 4)
    this.clock = opts.clock ?? defaultClock
    this.onEvent = opts.onEvent
    this.history = opts.history
    this.syncFacts = opts.syncFacts
    this.volatile = [...VOLATILE_FACTS, ...(opts.volatileFacts ?? [])]
    this.sightYaw = opts.sightYaw
    this.planBudget = opts.planBudget
    this.blackboard.setRoute(opts.route ?? [], opts.routeStart ?? 0)
    this.blackboard.setTime(0)
    this.blackboard.setSelfPosition(this.kinematic.position)
    this.blackboard.setVisible([])
    this.blackboard.setAlert('calm')
    this.planner = opts.planner
    this.active = opts.planner(this.blackboard.world)
    this.readsOf = this.active.domain
    this.readsCache = senseReads(this.readsOf)
    const self = this
    this.ctx = {
      id: this.id,
      kinematic: this.kinematic,
      tuning: this.tuning,
      terrain: this.terrain,
      blackboard: this.blackboard,
      targetPosition: id => self.blackboard.visibleTarget(id)?.position,
      emit: e => self.emit(e)
    }
  }

  /** The runner of the running plan (the agent swaps it with its candidate runner when it adopts a new plan). */
  get runner(): PlanRunnerLike {
    return this.active
  }

  /** Which senses run: those whose facts the active domain reads (see the replan policy above). */
  get sensing(): { sight: boolean; hearing: boolean } {
    const r = this.reads
    return { sight: r.visible || r.memory, hearing: r.hearing }
  }

  /** Where it looks now, world radians: its gaze (GuardAgentOptions.sightYaw) when it has one, else its body's yaw. */
  get gazeYaw(): number {
    const gaze = this.sightYaw?.()
    return gaze !== undefined && Number.isFinite(gaze) ? gaze : this.kinematic.yaw
  }

  /** Name of the running primitive, e.g. '!move_to', or '' between steps. */
  get currentAction(): string {
    return this.executorName
  }

  /** Coarse behavior mode for visuals: what the guard's knowledge says it is doing. */
  get mode(): GuardMode {
    const bb = this.blackboard
    if (bb.visibleTargets.length > 0) return 'chase'
    const noise = bb.heardNoise !== null
    if (noise && bb.alertLevel === 'alarmed') return 'alert'
    if (bb.memories.size > 0) return 'investigate'
    return noise ? 'alert' : 'patrol'
  }

  /**
   * Request a replan from outside (e.g. route changed by a group brain); `trigger` says who asks on the replan event
   * ('request', or 'debug' for a debugger). A request while one is pending joins it (its trigger in `also`).
   */
  requestReplan(reason: string, urgent = false, trigger: ReplanTrigger = 'request'): void {
    if (this.stopped) return
    if (this.pendingReplan === null) {
      this.pendingReplan = reason
      this.pendingTrigger = trigger
      this.pendingAt = this.ticking ? this.time : NaN
      this.pendingAlso = []
      this.pendingFrames = 0
      this.deniedBudgetFrame = -1
    } else if (trigger !== this.pendingTrigger && !this.pendingAlso.includes(trigger)) this.pendingAlso.push(trigger)
    this.urgentReplan = this.urgentReplan || urgent
  }

  /** Replace whatever is pending (a reload, a rejected step, the retry after no plan: they decide alone). */
  private setPending(reason: string, trigger: ReplanTrigger): void {
    this.pendingReplan = null
    this.requestReplan(reason, true, trigger)
  }

  /** `noises`: events emitted since the previous tick (e.g. NoiseBus.since(cursor)). */
  tick(dt: number, targets: readonly TargetSample[], noises: readonly NoiseEvent[] = []): void {
    if (this.stopped) return
    this.time += dt
    if (Number.isNaN(this.pendingAt)) this.pendingAt = this.time
    this.ticking = true
    try {
      this.sense(dt, targets, noises)
      if (!this.stopped) this.execute(dt)
    } finally {
      this.ticking = false
    }
  }

  /**
   * Hot reload: plan from `planner` from now on (a factory over the new domain revision). As upstream's
   * HTNHotReloadDemo (AIHTNDemoWandererAgent.cpp:185-216): the world state, the blackboard, the position, the senses
   * and the metrics stay; the running step is cancelled and the plan is dropped with its pending deferred steps (they
   * belong to the old domain); both runners are replaced, so the old domain never plans again; the agent replans on
   * its next tick (reason 'reload'). Reloading a domain that fails to compile is the caller's choice: keep the old
   * factory (upstream keeps the active domain and rolls back).
   */
  reload(planner: PlannerFactory): void {
    if (this.stopped) return
    this.cancelExecutor()
    if (this.stopped) return
    this.active.clear()
    this.spare?.clear()
    this.planner = planner
    this.active = planner(this.blackboard.world)
    this.spare = null
    this.hasPlan = false
    this.unexecutable.clear()
    this.checker = null
    this.checkOff = false
    this.reasoner = null
    this.reasoningOff = false
    this.unsettledSaid = false
    this.rejected = null
    this.rejectedNext = null
    this.conflicts.clear()
    this.dropActivePlan()
    this.continueSaid = false
    this.setPending('reload', 'reload')
  }

  /** Permanently stop this agent and release its plan/resources (despawn, possession end). Idempotent. */
  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.cancelExecutor()
    this.active.clear()
    this.spare?.clear()
    this.hasPlan = false
    this.dropActivePlan()
    this.lineOfSight.release?.(this.id)
    this.planBudget?.forget(this)
  }

  // ---- sensing ---------------------------------------------------------------

  /** Which sensed facts the active runner's domain reads; recomputed only when its `domain` is another object. */
  private get reads(): SenseReads {
    const domain = this.active.domain
    if (domain !== this.readsOf) {
      this.readsOf = domain
      this.readsCache = senseReads(domain)
    }
    return this.readsCache
  }

  private sense(dt: number, targets: readonly TargetSample[], noises: readonly NoiseEvent[]): void {
    const bb = this.blackboard
    bb.setTime(this.time)
    bb.setSelfPosition(this.kinematic.position)
    const reads = this.reads
    if (reads.visible || reads.memory) this.see(dt, targets)
    else if (this.seeing) this.stopSeeing()
    const key = this.knowledgeKey()
    if (key !== this.perceptionKey) {
      this.emit({ type: 'sense', guard: this.id, what: 'perception', from: this.perceptionKey, to: key })
      if (this.stopped) return
      this.requestReplan(`perception ${this.perceptionKey} -> ${key}`, false, 'perception')
      this.perceptionKey = key
    }
    if (reads.hearing) this.listen(dt, noises)
    else if (this.hearingOn) this.stopHearing()
    if (this.stopped) return
    if (this.syncFacts) {
      const extra = this.syncFacts(this)
      if (this.stopped) return
      if (extra !== this.extraKey) {
        this.emit({ type: 'sense', guard: this.id, what: 'facts', from: this.extraKey, to: extra })
        if (this.stopped) return
        this.requestReplan(`facts ${this.extraKey} -> ${extra}`, false, 'facts')
        this.extraKey = extra
      }
    }
  }

  private see(dt: number, targets: readonly TargetSample[]): void {
    this.seeing = true
    const bb = this.blackboard
    const gaze = this.sightYaw?.()
    const observer = gaze !== undefined && Number.isFinite(gaze) ? { position: this.kinematic.position, yaw: gaze } : this.kinematic
    const result = this.perception.update(dt, this.time, this.id, observer, targets, this.lineOfSight)
    this.lastPerception = result
    for (const lost of result.lost) bb.remember(lost)
    bb.setVisible(result.visible)
  }

  /** The domain reads no sight fact (any more): drop what sight knew, so no stale fact or chase mode stays. */
  private stopSeeing(): void {
    this.seeing = false
    const bb = this.blackboard
    this.perception.reset()
    this.lineOfSight.release?.(this.id)
    this.lastPerception = { visible: [], lost: [], suspicion: 0 }
    bb.setVisible([])
    for (const id of [...bb.memories.keys()]) bb.forget(id)
  }

  private listen(dt: number, noises: readonly NoiseEvent[]): void {
    this.hearingOn = true
    const bb = this.blackboard
    const result = this.hearing.update(dt, this.time, this.id, this.kinematic.position, noises, this.hearingLineOfSight)
    this.lastHearing = result
    for (const h of result.heard) {
      this.emit({ type: 'heard', guard: this.id, kind: h.kind, source: h.source, perceived: h.perceived, muffled: h.muffled, alert: result.alert, level: result.level })
      if (this.stopped) return
    }
    if (result.loudest) {
      const h = result.loudest
      this.lastHeard = { noise: h, at: this.time }
      bb.hear({ kind: h.kind, position: h.position, time: this.time, loudness: h.perceived })
    }
    bb.setAlert(result.level)
    const rank = this.currentNoiseRank()
    const chasing = this.reads.visible && bb.visibleTargets.length > 0
    if (this.reads.hearing && rank > this.noiseRank && !chasing) {
      this.requestReplan(`noise ${bb.heardNoise?.kind ?? ''} ${result.level}`, false, 'hearing')
    }
    this.noiseRank = rank
  }

  /** The domain reads no hearing fact (any more): forget the noise, calm down. */
  private stopHearing(): void {
    this.hearingOn = false
    this.hearing.reset()
    this.lastHearing = { heard: [], loudest: null, latest: null, alert: 0, level: 'calm' }
    this.lastHeard = null
    this.blackboard.forgetNoise()
    this.blackboard.setAlert('calm')
    this.noiseRank = 0
  }

  private currentNoiseRank(): number {
    return this.blackboard.heardNoise === null ? 0 : NOISE_RANK[this.blackboard.alertLevel]
  }

  /** Which targets are visible and which are remembered, as far as the domain reads them: the facts that select
   *  top-level branches. */
  private knowledgeKey(): string {
    const visible = this.reads.visible ? this.blackboard.visibleTargets.map(t => t.id).join(',') : ''
    const remembered: string[] = []
    if (this.reads.memory) this.blackboard.memories.forEach((_m, id) => remembered.push(id))
    return `${visible}|${remembered.join(',')}`
  }

  // ---- planning and execution -----------------------------------------------

  private execute(dt: number): void {
    let replannedThisTick = false
    let deferredThisTick = false
    if (this.executor !== null && this.activePlan !== undefined && this.checkStep && !this.checkRunning(this.activePlan)) this.rejectRunning()
    let dtLeft = dt
    for (let i = 0; i < this.maxStepsPerTick && !this.stopped; i++) {
      // At most one replan per tick; a throttled request waits while the current step keeps running.
      if (this.pendingReplan !== null && !replannedThisTick && !deferredThisTick) {
        if (this.urgentReplan || this.time - this.lastReplanAt >= this.replanThrottle - TIME_EPSILON) {
          if (this.budgetedReplan(this.pendingReplan)) replannedThisTick = true
          else deferredThisTick = true
        }
      }
      if (this.stopped || !this.hasPlan) break

      let status: ActionStatus
      if (this.executor === null) {
        const resolution = this.active.resolve()
        if (resolution !== 'ready') {
          this.hasPlan = false
          if (resolution === 'completed') this.requestReplan('plan completed', true, 'plan_done')
          else this.requestReplan('deferred step failed', true, 'deferred_failed')
          continue
        }
        const step = this.active.current()
        if (step === null) {
          this.hasPlan = false
          this.requestReplan('no current step', true, 'plan_done')
          continue
        }
        const factory = Object.prototype.hasOwnProperty.call(this.actions, step.name) ? this.actions[step.name] : undefined
        let executor = factory ? factory(step.args, this.ctx) : null
        if (this.stopped) return
        this.emit({ type: 'step', guard: this.id, name: step.name, args: step.args })
        if (this.stopped) return
        if (executor === null) {
          this.noExecutor(step.name, factory ? `the ${step.name} executor rejected ${formatTask(step.name, step.args)}` : `no executor for ${step.name}`)
          if (this.stopped) return
          executor = timed(NO_EXECUTOR_SECONDS)
        }
        this.executor = executor
        this.executorName = step.name
        if (this.publishesRunning) this.publishRunning(step)
        if (this.stopped) return
        status = executor.start()
      } else {
        status = this.executor.update(dtLeft)
        dtLeft = 0
      }

      if (this.stopped) return
      if (status === 'running') break
      const name = this.executorName
      this.executor = null
      this.executorName = ''
      this.unpublishRunning()
      this.emit({ type: 'step_end', guard: this.id, name, status })
      if (this.stopped) return
      if (status === 'done') {
        this.metrics.tasksCompleted++
        this.active.complete()
      } else this.failPlan('step failed')
    }
  }

  /** Upstream runs an unknown primitive as a no-op; ours also says so, once per primitive. */
  private noExecutor(name: string, what: string): void {
    if (this.unexecutable.has(name)) return
    this.unexecutable.add(name)
    this.diagnostic('no_executor', `${what}: runs as a ${NO_EXECUTOR_SECONDS} s no-op`)
  }

  /** A `diagnostic` event; on the console when nobody listens. */
  private diagnostic(code: Extract<GuardEvent, { type: 'diagnostic' }>['code'], message: string): void {
    if (this.onEvent === undefined && this.history === undefined) console.log(`[htn ${this.id}] ${message}`)
    this.emit({ type: 'diagnostic', guard: this.id, code, message })
  }

  // ---- the running-plan check (activePlan) ------------------------------------

  /** Plan the check method in its own runner: true lets the running step go on (also when there is no check). */
  private checkRunning(method: string): boolean {
    const runner = this.checkRunner(method)
    if (runner === null) return true
    const started = this.clock()
    const status = runner.plan(method, [])
    this.metrics.checksMade++
    this.metrics.totalCheckMs += this.clock() - started
    runner.clear()
    if (status === 'invalid_call') {
      this.checkOff = true
      this.checker = null
      this.diagnostic('active_plan_invalid', `activePlan: '${method}' is not a top-level method with no arguments: the running plan is not checked`)
      return true
    }
    if (status === 'succeeded') return true
    const step = this.active.current()
    this.emit({ type: 'check', guard: this.id, method, step: step === null ? this.executorName : formatTask(step.name, step.args), status })
    return false
  }

  /**
   * The check runner, created on the first check. When the runner says what its domain has, the method is looked up
   * first (missing: active_plan_invalid, no check) and a branch that always succeeds is reported (active_plan_fallback:
   * it accepts any running step, upstream USE_CASES.md:33-34; the compiler's check-method-fallback, same rule).
   */
  private checkRunner(method: string): PlanRunnerLike | null {
    if (this.checker !== null || this.checkOff) return this.checker
    const runner = this.planner(this.blackboard.world)
    const domain = runner.domain
    if (domain?.topLevel !== undefined && domain.methods !== undefined) {
      const id = domain.topLevel[method]?.[0]
      if (id === undefined) {
        this.checkOff = true
        const owner = domain.name === undefined ? '' : ` of domain '${domain.name}'`
        this.diagnostic('active_plan_invalid', `activePlan: '${method}' is not a top-level method${owner} with no arguments: the running plan is not checked`)
        return null
      }
      const checked = domain.methods[id]
      for (const branch of checked === undefined ? [] : acceptingBranches(checked)) {
        this.diagnostic('active_plan_fallback', `activePlan '${method}': branch '${branch.name}' ${ACCEPTS_ANYTHING}`)
      }
    }
    this.checker = runner
    return runner
  }

  /** The check failed: cancel the running step and plan again now (budget permitting), without the candidate comparison. */
  private rejectRunning(): void {
    this.rejectedNext = this.active.steps.slice()
    this.cancelExecutor()
    this.active.clear()
    this.hasPlan = false
    this.setPending('active_plan failed', 'active_plan')
  }

  /**
   * At the start of a step: if the plan the check rejected is back (the same steps from the rejected one on), check
   * and plan disagree; the step runs unchecked, else the check would cancel it on every tick.
   */
  private checkStarting(): void {
    this.checkStep = true
    const rejected = this.rejected
    this.rejected = null
    if (rejected === null || !sameSteps(this.active.steps, rejected)) return
    this.checkStep = false
    const step = rejected[0]
    if (this.conflicts.has(step.name)) return
    this.conflicts.add(step.name)
    const task = formatTask(step.name, step.args)
    this.diagnostic(
      'active_plan_conflict',
      `activePlan '${this.activePlan}' rejects ${task}, but ${this.topLevel} plans ${task} again: the two methods disagree; the step runs on unchecked`
    )
  }

  private publishRunning(step: { name: string; args: readonly Atom[] }): void {
    const world = this.blackboard.world
    if (this.runningArity >= 0) world.clear(RUNNING_FACT, this.runningArity)
    const row = runningRow(step)
    world.add(RUNNING_FACT, ...row)
    this.runningArity = row.length
    this.checkStarting()
  }

  private unpublishRunning(): void {
    if (this.runningArity < 0) return
    this.blackboard.world.clear(RUNNING_FACT, this.runningArity)
    this.runningArity = -1
  }

  // ---- the continue convention (continueTask) ----------------------------------------------------------------

  /** `(!begin_plan <name> <arguments>...)`: the running plan's name, as ACTIVE_PLAN_FACT. */
  private beginPlan(args: readonly Atom[]): void {
    this.dropActivePlan()
    this.blackboard.world.add(ACTIVE_PLAN_FACT, ...args)
    this.activePlanArity = args.length
  }

  /** `(!end_plan)`, and the plan dropped: no active plan. */
  private dropActivePlan(): void {
    if (this.activePlanArity < 0) return
    this.blackboard.world.clear(ACTIVE_PLAN_FACT, this.activePlanArity)
    this.activePlanArity = -1
  }

  /** The plan is only the continue task. */
  private continues(runner: PlanRunnerLike): boolean {
    const steps = runner.steps
    return steps.length === 1 && steps[0].kind === 'primitive' && steps[0].name === this.continueTask
  }

  /** A new plan with the continue task in it keeps nothing: its continue step idles one tick (said once). */
  private noteContinueSteps(): void {
    if (this.continueSaid) return
    const steps = this.active.steps
    if (!steps.some(s => s.kind === 'primitive' && s.name === this.continueTask)) return
    this.continueSaid = true
    const why =
      steps.length === 1
        ? 'planned with no running plan to keep'
        : `${this.continueTask} is not the only step of the plan [${steps.map(s => formatTask(s.name, s.args)).join(', ')}]`
    this.diagnostic('continue_idle', `continueTask: ${why}; the step idles one tick`)
  }

  private failPlan(reason: string): void {
    this.executor = null
    this.executorName = ''
    this.active.clear()
    this.hasPlan = false
    this.requestReplan(reason, true, 'step_failed')
  }

  /** Replan now, or, with a shared budget that refuses it this frame, false (the request stays pending). */
  private budgetedReplan(reason: string): boolean {
    const budget = this.planBudget
    if (budget === undefined) {
      this.replan(reason)
      return true
    }
    if (!budget.tryRun(this, this.urgentReplan || !this.hasPlan, () => this.replan(reason))) {
      this.metrics.budgetDeferred++ // Denied attempts, including substeps.
      if (this.deniedBudgetFrame !== budget.stats.frame) {
        this.pendingFrames++
        this.deniedBudgetFrame = budget.stats.frame
      }
      return false
    }
    this.metrics.budgetMaxWaitFrames = Math.max(this.metrics.budgetMaxWaitFrames, budget.lastWaitFrames)
    return true
  }

  private replan(reason: string): void {
    // Nothing runs: no active plan either (a plan done or failed since), before the upkeep and the decision read it.
    if (!this.hasPlan) this.dropActivePlan()
    // Beliefs first: what the decision below, the trigger keys and the fact changes read is the world after upkeep.
    const upkeep = this.reasoning === undefined ? null : this.upkeep(this.reasoning)
    if (this.stopped) return
    const trigger = this.pendingTrigger
    const also = this.pendingAlso
    const waited = this.time - this.pendingAt
    const budgetFrames = this.pendingFrames
    const previous = this.hasPlan ? this.active.steps.map(s => formatTask(s.name, s.args)) : []
    const changes = this.worldChanges()
    this.rejected = this.rejectedNext
    this.rejectedNext = null
    this.pendingReplan = null
    this.urgentReplan = false
    this.lastReplanAt = this.time
    this.lastReplanReason = reason
    this.perceptionKey = this.knowledgeKey() // the new plan accounts for what is known now
    this.noiseRank = this.currentNoiseRank()
    // A running plan stays in the active runner; the candidate goes to the spare one.
    const running = this.hasPlan
    if (!running) this.active.clear()
    const target = running ? this.spareRunner() : this.active
    const { status, passes } = this.planInto(target)
    if (this.stopped) return
    this.lastPlanStatus = status
    let kept = false
    let continued = false
    if (status !== 'succeeded') {
      target.clear()
      kept = running && this.onNoPlan === 'keep'
      if (!kept) {
        this.cancelExecutor()
        this.active.clear()
        this.hasPlan = false
        this.dropActivePlan()
        // Nothing to do: try again on the next tick, past the throttle (H7; upstream HTNDemo TryPlan, "Planning
        // failed; retrying next update"). At most one replan per tick bounds it to one planner call per tick.
        this.setPending('retry after ' + status, 'no_plan_retry')
      }
    } else if (running && this.continueTask !== undefined && this.continues(target)) {
      kept = continued = true
      this.metrics.continued++
      target.clear()
    } else if (running && this.equivalent(target)) {
      kept = true
      target.clear()
    } else {
      if (running) this.adopt(target)
      if (this.stopped) return
      this.hasPlan = true
      if (this.continueTask !== undefined) this.noteContinueSteps()
    }
    const plan = this.hasPlan ? this.active.steps.map(s => formatTask(s.name, s.args)) : []
    const event: ReplanEvent = { type: 'replan', guard: this.id, reason, status, plan, kept, passes, trigger, changed: !sameTexts(plan, previous) }
    if (continued) event.continued = true
    if (also.length > 0) event.also = also
    if (waited > TIME_EPSILON) event.waited = Math.round(waited * 1000) / 1000
    if (budgetFrames > 0) event.budgetFrames = budgetFrames
    if (changes !== undefined) {
      event.changes = changes.changes
      if (changes.volatile.length > 0) event.volatile = changes.volatile
    }
    if (previous.length > 0) event.previous = previous
    if (upkeep !== null && upkeep.length > 0) event.upkeep = upkeep
    this.lastReplan = event
    this.emit(event)
  }

  // ---- belief upkeep (reasoning) ----------------------------------------------------------------------------

  /**
   * Plan the reasoning method and run its steps at once, again until it has nothing to do (at most reasoningPasses
   * plans). Returns the steps run, as text (null when there is no reasoning runner). After a change the host's facts
   * are synced again, so the key of a fact the upkeep dropped does not ask for one more replan.
   */
  private upkeep(method: string): string[] | null {
    const runner = this.reasoningRunner(method)
    if (runner === null) return null
    const applied: string[] = []
    let settled = false
    for (let pass = 0; pass < this.reasoningPasses && !settled && !this.stopped; pass++) {
      const started = this.clock()
      const status = runner.plan(method, [])
      this.metrics.reasoningMade++
      this.metrics.totalReasoningMs += this.clock() - started
      if (status === 'invalid_call') {
        runner.clear()
        this.reasoningOff = true
        this.reasoner = null
        this.diagnostic('reasoning_invalid', `reasoning: '${method}' is not a top-level method with no arguments: no belief upkeep`)
        return null
      }
      settled = status !== 'succeeded' || runner.resolve() !== 'ready'
      while (!settled && !this.stopped && runner.resolve() === 'ready') {
        const step = runner.current()
        if (step === null) break
        applied.push(formatTask(step.name, step.args))
        this.runAtOnce(step)
        runner.complete()
      }
      runner.clear()
    }
    if (this.stopped) return applied
    if (!settled && !this.unsettledSaid) {
      this.unsettledSaid = true
      this.diagnostic('reasoning_unsettled', `reasoning '${method}' used its ${this.reasoningPasses}-plan budget before confirming settlement; allow a final empty pass or inspect rules for non-progress`)
    }
    if (applied.length > 0 && this.syncFacts) this.extraKey = this.syncFacts(this)
    return applied
  }

  /** The reasoning runner, created on the first use; null when off (no such top-level method). */
  private reasoningRunner(method: string): PlanRunnerLike | null {
    if (this.reasoner !== null || this.reasoningOff) return this.reasoner
    const runner = this.planner(this.blackboard.world)
    const domain = runner.domain
    if (domain?.topLevel !== undefined && domain.topLevel[method]?.[0] === undefined) {
      this.reasoningOff = true
      const owner = domain.name === undefined ? '' : ` of domain '${domain.name}'`
      this.diagnostic('reasoning_invalid', `reasoning: '${method}' is not a top-level method${owner} with no arguments: no belief upkeep`)
      return null
    }
    this.reasoner = runner
    return runner
  }

  /** An upkeep step: its executor must finish in start(); one that runs on is cancelled (reported once per primitive). */
  private runAtOnce(step: { name: string; args: readonly Atom[] }): void {
    const factory = Object.prototype.hasOwnProperty.call(this.actions, step.name) ? this.actions[step.name] : undefined
    const executor = factory ? factory(step.args, this.ctx) : null
    if (executor === null) {
      this.noExecutor(step.name, factory ? `the ${step.name} executor rejected ${formatTask(step.name, step.args)}` : `no executor for ${step.name}`)
      return
    }
    if (executor.start() !== 'running') return
    executor.cancel()
    const key = `reasoning ${step.name}`
    if (this.unexecutable.has(key)) return
    this.unexecutable.add(key)
    this.diagnostic('reasoning_not_instant', `reasoning step ${formatTask(step.name, step.args)} did not finish at once: cancelled (upkeep steps must be instant)`)
  }

  /**
   * The facts the domain reads that changed since the previous replan, the volatile ones apart (undefined on the
   * first, or when nobody listens: the snapshot costs a copy of the world's tables per replan).
   */
  private worldChanges(): { changes: string[]; volatile: string[] } | undefined {
    if (this.history === undefined && this.onEvent === undefined) return undefined
    const now = snapshotWorld(this.blackboard.world)
    const before = this.plannedWorld
    this.plannedWorld = now
    if (before === null) return undefined
    if (before.revision === now.revision) return { changes: [], volatile: [] }
    const d = worldDiff(before, now)
    const reads = this.active.domain?.facts
    return { changes: changeLines(d, reads, this.volatile), volatile: volatileNames(d, reads, this.volatile) }
  }

  /**
   * Plan into `runner`, again while the plan is successful but empty: that is deliberate completion, often a
   * callterm that changed the world, so the host facts are synced and the next pass sees them (upstream HTNDemo
   * TryPlan). The budget keeps a domain that never gets past an empty plan from spinning within a tick.
   */
  private planInto(runner: PlanRunnerLike): { status: DecompositionStatus; passes: number } {
    let status: DecompositionStatus = 'no_plan'
    let passes = 0
    while (passes < this.maxPlanningPasses) {
      if (passes > 0 && this.syncFacts) this.extraKey = this.syncFacts(this)
      passes++
      const started = this.clock()
      status = runner.plan(this.topLevel, [])
      this.recordPlanning(this.clock() - started, runner)
      if (status !== 'succeeded' || runner.steps.length > 0) break
    }
    return { status, passes }
  }

  private recordPlanning(ms: number, runner: PlanRunnerLike): void {
    const m = this.metrics
    m.lastPlanMs = ms
    m.totalPlanMs += ms
    m.maxPlanMs = Math.max(m.maxPlanMs, ms)
    m.plansMade++
    const info = runner.executionInfo
    if (info !== undefined) {
      m.lastPeakCallFrames = info.peakCallFrames
      m.maxPeakCallFrames = Math.max(m.maxPeakCallFrames, info.peakCallFrames)
      m.callFrameCapacity = info.callFrameCapacity
      m.lastError = info.lastError
    }
    const stats = runner.stats
    if (stats) {
      m.lastStats = { ...stats }
      const total = { ...stats }
      const prev = m.totalStats
      if (prev !== null) for (const k in total) total[k as keyof PlanStats] += prev[k as keyof PlanStats]
      m.totalStats = total
    }
  }

  /**
   * The candidate repeats the running plan from its current step on (see sameSteps). The running plan has already
   * expanded the deferred step it is in, so a candidate that starts with a deferred step is expanded too (against
   * the world as it is now, as adopting it would) before the second comparison.
   */
  private equivalent(candidate: PlanRunnerLike): boolean {
    const running = this.active.steps
    if (sameSteps(candidate.steps, running)) return true
    const head = candidate.steps[0]
    if (head === undefined || head.kind !== 'deferred' || running.length === 0 || running[0].kind !== 'primitive') return false
    return candidate.resolve() === 'ready' && sameSteps(candidate.steps, running)
  }

  /** Cancel the running step and make the candidate's runner the active one; the old one becomes the spare. */
  private adopt(candidate: PlanRunnerLike): void {
    this.cancelExecutor()
    this.active.clear()
    this.dropActivePlan()
    this.spare = this.active
    this.active = candidate
  }

  private spareRunner(): PlanRunnerLike {
    if (this.spare === null) this.spare = this.planner(this.blackboard.world)
    return this.spare
  }

  private cancelExecutor(): void {
    if (this.executor === null) return
    const executor = this.executor
    const name = this.executorName
    // Clear before user code: cancel() and the event callback may call stop/remove again.
    this.executor = null
    this.executorName = ''
    this.unpublishRunning()
    executor.cancel()
    this.emit({ type: 'step_end', guard: this.id, name, status: 'cancelled' })
  }

  private emit(event: GuardEvent): void {
    this.history?.push({ t: this.time, event })
    this.onEvent?.(event)
  }
}
