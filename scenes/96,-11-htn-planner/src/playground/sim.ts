// One playground level without the ECS: an HTN agent, the tester bot that plays the visitor's part from a script,
// and the level's props. The script doubles as an in-world auto-test: its `expect` steps wait for the agent to
// react and record pass / fail, shown on the station board and asserted by test/playground. Station coordinates
// are local to the pad centre (x right, z away from the visitor); the ECS layer (station.ts) adds the pad origin.
// Deterministic: time is only the dt `update` gets (the scene's SimClock, or a fixed dt headless), random numbers only
// `rng` (seeded by `seed`; `init(seed)`, `reset(seed)`), and the wall clock only feeds planning-time metrics. The same
// seed and dt give the same run, in the scene and headless (test/playground/determinism.test.ts, `npm run htn:level`).
import {
  ActionRegistry,
  AgentHistory,
  agentHistory,
  Box,
  chosenBindings,
  chosenBranchName,
  chosenPath,
  formatAtom,
  formatTask,
  GeometricLineOfSight,
  GuardAgent,
  GuardEvent,
  GuardTuning,
  HearingConfig,
  NoiseBus,
  NoiseEvent,
  PerceptionConfig,
  DEFAULT_SEED,
  Rng,
  PlanBudget,
  newPlanStats,
  plannerFor,
  PlanTraceRecorder,
  stepToward,
  PlanRun,
  rootMethod,
  skipRuns,
  TargetSample,
  Vec3,
  distanceXZ
} from '../htn-planner'
import type { DomainIR, PlannerOptions, PlanTracer, WorldState } from '../htn-planner'
import { Ablation, ablateSetup, generalAblations } from './ablation'
import { DomainVariant, variantSetup, variantsFor } from './variants'

export type Shape = 'box' | 'sphere' | 'cylinder'

/** A prop the station draws; re-read every frame, matched by id. */
export interface Marker {
  id: string
  shape: Shape
  position: Vec3
  scale: Vec3
  color: { r: number; g: number; b: number }
  glow?: number
  label?: string
  /** Blocks the player (and, when listed in occluders, sight). */
  solid?: boolean
}

/** A tester script step. A script loops; `expect` steps are the checks. */
export type TesterStep =
  | { kind: 'walk'; to: WalkTarget; speed?: number; say: string }
  | { kind: 'wait'; seconds: number; say: string }
  | { kind: 'act'; run: () => void; say: string }
  | { kind: 'expect'; label: string; that: () => boolean; within: number; say?: string }

/** A spot name, a point, or a point that moves (re-read every frame, e.g. in front of the NPC). */
export type WalkTarget = string | Vec3 | (() => Vec3)

export const walk = (to: WalkTarget, say: string, speed?: number): TesterStep => ({ kind: 'walk', to, say, speed })
export const wait = (seconds: number, say: string): TesterStep => ({ kind: 'wait', seconds, say })
export const act = (say: string, run: () => void): TesterStep => ({ kind: 'act', run, say })
export const expect = (label: string, that: () => boolean, within: number, say?: string): TesterStep => ({ kind: 'expect', label, that, within, say })

export interface CheckResult {
  label: string
  state: 'pending' | 'waiting' | 'pass' | 'fail'
  /** Seconds the agent took (pass) or waited (fail). */
  seconds: number
  round: number
  /** Level time it passed or failed at; while waiting, the time it started waiting (0 while pending). */
  at: number
}

/** The headless step: 30 updates per simulated second, as the tests run levels. */
export const LEVEL_DT = 1 / 30
/** Resolved checks a level keeps in `checkLog`. */
const CHECK_LOG_SIZE = 512

export interface Bubble {
  text: string
  until: number
}

export interface Control {
  label: string
  run: () => void
}

export interface LevelInfo {
  id: string
  number: number
  title: string
  /** The .domain file, as shown on the board. */
  source: string
  /** Plain-language lesson, 2-4 short lines. */
  lesson: string[]
  /** What to watch, one line. */
  watch: string
}

export interface AgentSetup {
  /** Default: the level id. */
  id?: string
  /** 'figure': the station drives a ready-made figure (possessEntityBody) instead of a capsule; 'model': the
   *  level's playground brings its own body (levelPlayground's `view`, e.g. an animated model), else a capsule. */
  body?: 'capsule' | 'figure' | 'model'
  domain: DomainIR
  start: { position: Vec3; yaw: number }
  route?: Vec3[]
  routeStart?: number
  tuning?: Partial<GuardTuning>
  perception?: Partial<PerceptionConfig>
  hearing?: Partial<HearingConfig>
  /** Walls the agent cannot see through (local coordinates). */
  occluders?: Box[]
  /** Gaze apart from the body (GuardAgentOptions.sightYaw). */
  sightYaw?: () => number
  /** Sight filter on top of the occluders, e.g. a shelter that hides whoever is inside. */
  canSee?: (target: Vec3) => boolean
  /** The running-plan check (GuardAgentOptions.activePlan), e.g. 'active_plan'. */
  activePlan?: string
  /** Continue-plan convention (GuardAgentOptions.continueTask), e.g. '!continue'; off when absent. */
  continueTask?: string
  /** Belief upkeep (GuardAgentOptions.reasoning), e.g. 'reasoning'; its runs stay out of the board's recorder. */
  reasoning?: string
  /**
   * Where the domain's behaviour branch names are, for `chosen` / `doing` (default 1: the root's chosen branch).
   * 2: the branch chosen one level below the root, in the method the root's branch called (a tiered domain whose root
   * branches are tiers); the root's own when it called none.
   */
  chosenDepth?: number
}

/** One NPC of the level, with its own planner, trace and board counters. */
export interface CrewMember {
  id: string
  body: 'capsule' | 'figure' | 'model'
  agent: GuardAgent
  trace: PlanTraceRecorder
  /** The agent's last events, for the debugger's timeline. */
  history: AgentHistory
  /** Replans, counting those that kept the running plan. */
  replans: number
  lastReplanAt: number
  /** The last replan kept the running plan (an equivalent candidate, or no plan under onNoPlan 'keep'). */
  lastReplanKept: boolean
  doneSteps: string[]
  /** Steps the running-plan check rejected (`check` events), the last one and when (level time). */
  rejections: number
  lastRejected: string
  lastRejectedAt: number
  /** Level time it was built at: its agent's clock starts there at 0 (a respawn builds a new member). */
  spawnedAt: number
  /** AgentSetup.chosenDepth (absent: 1). */
  chosenDepth?: number
}

/** A crew member before its agent exists (the agent's event handler needs the member); set `agent` next. */
export function unbuiltMember(id: string, body: CrewMember['body'], trace: PlanTraceRecorder, history: AgentHistory): Omit<CrewMember, 'agent'> & { agent?: GuardAgent } {
  return { id, body, trace, history, replans: 0, lastReplanAt: 0, lastReplanKept: false, doneSteps: [], rejections: 0, lastRejected: '', lastRejectedAt: 0, spawnedAt: 0 }
}

/** A place of the level a metric watches (docs/htn-level-metrics.md): held while an NPC stands within `radius` m. */
export interface Post {
  id: string
  at: Vec3
  radius: number
}

/** Told every event of every NPC of the level as the level gets it (a metrics reader, LevelSim.observer). */
export type LevelEventTap = (e: GuardEvent, member: CrewMember) => void

/** A planner of a level that is not an NPC (a squad planner), as the debugger reads it. */
export interface LevelPlanner {
  id: string
  label: string
  domain: DomainIR
  recorder: PlanTraceRecorder | null
  world: WorldState
  /** Its decisions as `replan` events on the level's clock, for a timeline (absent: it keeps none). */
  history?: AgentHistory
  /** Its last decision: status, why, and its plan. */
  status(): { lastStatus: string; reason: string; steps: readonly string[] }
}

const TESTER_SPEED = 2.2
/** Visitors further than this from the pad centre are not on the station. */
export const PAD_HALF = { x: 14, z: 13 }

export abstract class LevelSim {
  abstract readonly info: LevelInfo
  readonly bus = new NoiseBus()
  /** The level's NPCs; most levels have one. The board shows `crew[focus]`. */
  crew: CrewMember[] = []
  focus = 0
  time = 0
  /** The player, in local coordinates, while on the pad (set by the station). */
  player: Vec3 | null = null
  tester: { position: Vec3; yaw: number } = { position: { x: 0, y: 0, z: 0 }, yaw: 0 }
  testerSay = ''
  testerPaused = false
  readonly bubbles: Record<'npc' | 'tester', Bubble | null> = { npc: null, tester: null }
  checks: CheckResult[] = []
  /** Board colour per branch name (#rrggbb); others by position. */
  branchColors: Record<string, string> = {}
  /** Board text scale (big domains get a smaller font). */
  boardScale = 1
  round = 1
  catches = 0
  /** Record every plan for the board and the debugger (the default). Off: the planners run without a recorder
   *  (the board's chosen branch and the trace-based checks then stay empty); for load measurements. */
  recordTraces = true
  /** Runs each NPC's recorder keeps (the board and the in-scene debugger read the last ones); a recorded session
   *  (headless.ts `record`) keeps them all. Set before init(). */
  traceKeep = 32
  /** Entries each NPC's event history keeps (a run of identical events is one); a recorded session keeps them all. */
  historySize = 256
  /** Keep the crew a rebuild replaces (a respawn) in `retired`, for a recorded session; reset() forgets them. */
  keepRetired = false
  /** NPCs a rebuild replaced, oldest first (only with keepRetired). */
  retired: CrewMember[] = []
  /** Enable runner structural counters (PlannerOptions.stats). Each agent's `metrics.totalStats` sums only
   *  decision/replan decompositions, excluding checks, reasoning upkeep and deferred expansions. Off by default.
   *  Set before init(): the deterministic counter gate (scripts/bench/counters.ts) reads those decision totals. */
  countStats = false
  /** A planning budget per frame shared by the crew (plan-budget.ts), or null. Set before init(); reset() keeps it.
   *  Deterministic with `maxPlansPerFrame` only: `planBudgetMs` reads the wall clock (inject PlanBudgetOptions.clock). */
  planBudget: PlanBudget | null = null
  /** The seed of `rng`; init(seed) / reset(seed) set it, reset() keeps it. */
  seed = DEFAULT_SEED
  /** The level's only source of random numbers, reseeded from `seed` by init() and reset(); fork it per NPC. */
  rng = new Rng(DEFAULT_SEED)
  /** Every check that passed or failed, oldest first (the last CHECK_LOG_SIZE): `checks` shows only the latest. */
  checkLog: CheckResult[] = []
  /** The ablation this run makes (ablation.ts: the same brain with one parameter changed; `ablations()` lists the
   *  level's), or null: the level as it is. Set before init(); reset() keeps it. A name the level does not have changes nothing. */
  ablation: string | null = null
  /** The domain variant its NPCs run (variants.ts: another shape of the same brain, registered by a tool; `variants()`
   *  lists the level's), or null: the level's own domains. Set before init(); reset() keeps it. The scene never sets it. */
  variant: string | null = null
  /** s: the tester starts its script after a wait drawn from the seed in [0, stagger), so the NPCs meet it at
   *  another point of their round each seed (metrics over seeds, docs/htn-level-metrics.md). 0, the default: at once. Set before init(). */
  stagger = 0
  /** The wait this run drew from `stagger` (level time the script starts at). */
  scriptDelay = 0
  /** Level time the script's current round started (round 1: scriptDelay). */
  roundStartedAt = 0
  /** The targets the NPCs were offered on the last update (who they could sense). */
  targetsNow: TargetSample[] = []
  /** Every NPC event as the level gets it, for a reader outside the scene (metrics.ts); null in the scene. */
  observer: LevelEventTap | null = null
  private script: TesterStep[] = []
  private stepIndex = 0
  private stepTime = 0
  private stepStarted = false
  private walkTarget: Vec3 | undefined
  private checkIndex = new Map<TesterStep, number>()

  /** Build the agent and the script. Call once after construction (subclass fields are set by then); `seed`: rng's. */
  init(seed?: number): this {
    if (seed !== undefined) this.seed = seed
    this.rng = new Rng(this.seed)
    if (this.ablation === 'no_budget') this.planBudget = null
    this.scriptDelay = this.stagger > 0 ? this.rng.fork('stagger').next() * this.stagger : 0
    this.roundStartedAt = this.scriptDelay
    this.buildAgent()
    this.tester.position = { ...this.testerStart() }
    this.script = this.testerScript()
    this.checks = []
    this.script.forEach(s => {
      if (s.kind !== 'expect') return
      this.checkIndex.set(s, this.checks.length)
      this.checks.push({ label: s.label, state: 'pending', seconds: 0, round: 0, at: 0 })
    })
    return this
  }

  /** The NPC the board shows. */
  get agent(): GuardAgent {
    return this.crew[this.focus].agent
  }
  get trace(): PlanTraceRecorder {
    return this.crew[this.focus].trace
  }
  get replans(): number {
    return this.crew[this.focus].replans
  }
  get lastReplanAt(): number {
    return this.crew[this.focus].lastReplanAt
  }
  get lastReplanKept(): boolean {
    return this.crew[this.focus].lastReplanKept
  }
  get doneSteps(): string[] {
    return this.crew[this.focus].doneSteps
  }

  /** Fresh agents (and recorders) at their starts; the tester and the script go on. */
  protected buildAgent(): void {
    this.retire()
    this.crew = this.crewSetup().map(unablated => {
      const setup = ablateSetup(variantSetup(unablated, this.variant), this.ablation)
      const walls = new GeometricLineOfSight(setup.occluders ?? [])
      const canSee = setup.canSee
      const los = canSee ? { check: (id: string, eye: Vec3, target: Vec3) => canSee(target) && walls.check(id, eye, target) } : walls
      const trace = new PlanTraceRecorder(setup.domain, { keep: this.traceKeep, time: () => member.agent?.time ?? 0 })
      const history = agentHistory(this.historySize)
      const member = unbuiltMember(setup.id ?? this.info.id, setup.body ?? 'capsule', trace, history)
      member.spawnedAt = this.time
      if (setup.chosenDepth !== undefined) member.chosenDepth = setup.chosenDepth
      // The check's runs (one per tick a step runs) and the upkeep's stay out of the recorder: the board and the
      // debugger show behave's.
      const skipped = [setup.activePlan, setup.reasoning].filter((m): m is string => m !== undefined)
      member.agent = new GuardAgent({
        id: member.id,
        planner: plannerFor(setup.domain, this.plannerOptions(skipped.length > 0 ? skipRuns(trace, setup.domain, skipped) : trace)),
        lineOfSight: los,
        hearingLineOfSight: walls,
        sightYaw: setup.sightYaw,
        start: setup.start,
        route: setup.route,
        routeStart: setup.routeStart,
        tuning: setup.tuning,
        perception: setup.perception,
        hearing: setup.hearing,
        activePlan: setup.activePlan,
        continueTask: setup.continueTask,
        reasoning: setup.reasoning,
        actions: this.actions(),
        syncFacts: a => this.sensed(a),
        onEvent: e => this.onEvent(e, member as CrewMember),
        history,
        planBudget: this.planBudget ?? undefined
      })
      return member as CrewMember
    })
    this.focus = Math.min(this.focus, this.crew.length - 1)
    this.afterInit()
  }

  /** Before a rebuild: the crew it replaces goes to `retired` (keepRetired). */
  protected retire(): void {
    if (this.keepRetired && this.crew.length > 0) this.retired.push(...this.crew)
  }

  /** A runner's options: the recorder `trace` while `recordTraces`, fresh counters while `countStats`. */
  protected plannerOptions(trace: PlanTracer): PlannerOptions {
    const options: PlannerOptions = {}
    if (this.recordTraces) options.trace = trace
    if (this.countStats) options.stats = newPlanStats()
    return options
  }

  // ---- level hooks ---------------------------------------------------------------------------

  protected abstract agentSetup(): AgentSetup
  /** Every NPC of the level; default: the one from agentSetup(). */
  protected crewSetup(): AgentSetup[] {
    return [this.agentSetup()]
  }
  /** Primitives over GUARD_ACTIONS. */
  protected actions(): ActionRegistry {
    return {}
  }
  /** Every NPC's syncFacts: the level's facts, after what an ablation takes away (no_memory: what it remembers). */
  protected sensed(agent: GuardAgent): string {
    if (this.ablation === 'no_memory') for (const id of [...agent.blackboard.memories.keys()]) agent.blackboard.forget(id)
    return this.facts(agent)
  }
  /** Write level facts into `agent.blackboard.world` (`this.agent` with one NPC); return a key whose change replans. */
  protected facts(_agent: GuardAgent): string {
    return ''
  }
  protected abstract testerStart(): Vec3
  protected abstract testerScript(): TesterStep[]
  /** Named points of the station. */
  abstract spots(): Record<string, Vec3>
  /** Props to draw. */
  markers(): Marker[] {
    return []
  }
  /** Buttons for the visitor (the same things the tester does). */
  controls(): Control[] {
    return []
  }
  // ---- ablations and what metrics read (docs/htn-level-metrics.md) ------------------------------

  /** The ablations this level has: the general ones that change something for its NPCs, then its own. */
  ablations(): Ablation[] {
    return [...generalAblations(this.crewSetup(), { hearsNoises: this.hearsNoises(), hasBudget: this.planBudget !== null }), ...this.levelAblations()]
  }
  /** The domain variants that change something for this level's NPCs (variants.ts). */
  variants(): DomainVariant[] {
    return variantsFor(this.crewSetup())
  }
  /** The level's own ablations (implemented by the level, reading `ablated(name)`). */
  protected levelAblations(): Ablation[] {
    return []
  }
  /** This run makes ablation `name`. */
  ablated(name: string): boolean {
    return this.ablation === name
  }
  /** Its NPCs get the level's noises (a level whose NPCs hear nothing at all says false). */
  protected hearsNoises(): boolean {
    return true
  }
  /** Whether a noise is a sound (no_hearing drops it); a level's noise that stands for something else says false. */
  protected isSound(_noise: NoiseEvent): boolean {
    return true
  }
  /** Each NPC's role now, by id, for a level that hands out roles (a squad); null: no roles. */
  roles(): Record<string, string> | null {
    return null
  }
  /** Places whose holding a metric measures (a gate); none by default. */
  posts(): Post[] {
    return []
  }
  /** The level's own outcome counts so far, by name (crates served, lures that worked): metrics per round. */
  outcomes(): Record<string, number> {
    return {}
  }

  /** Planners of the level besides its NPCs' (a squad planner): the debugger lists them too. */
  planners(): LevelPlanner[] {
    return []
  }
  /** Extra lines under the board's header (rich text), e.g. the squad's orders. */
  boardNotes(): string[] {
    return []
  }
  /** Whether the agent can see the player at `p` (on the pad). */
  protected playerVisible(_p: Vec3): boolean {
    return true
  }
  /** Whether the tester bot is something the agent can see. */
  protected testerVisible(): boolean {
    return false
  }
  /** How visible a target is now, a factor on the NPCs' sight range (TargetSample.visibility: its light,
   *  camouflage); undefined: the plain range. */
  protected targetVisibility(_id: 'you' | 'tester'): number | undefined {
    return undefined
  }
  /** Whether the NPC is out in the level now: one that is not (waiting off-stage) neither senses nor acts, and the
   *  station hides its body. Default: always. */
  present(_member: CrewMember): boolean {
    return true
  }
  /** Extra arcs for the NPC's sight gizmo (radius m, #rrggbb), e.g. an outer ring where a light draws it to look. */
  senseArcs(_member: CrewMember): { radius: number; hex: string }[] {
    return []
  }
  /** After the agent is built: static facts. */
  protected afterInit(): void {}
  /** Back to the initial props (Reset button). */
  protected resetProps(): void {}
  protected onEvent(e: GuardEvent, member: CrewMember = this.crew[0]): void {
    this.observer?.(e, member)
    if (e.type === 'replan') {
      member.replans++
      member.lastReplanAt = this.time
      member.lastReplanKept = e.kept
      if (!e.kept) member.doneSteps = [] // a kept plan goes on: its done steps stay
    } else if (e.type === 'step_end' && e.status === 'done') {
      // A step may have changed the props; rewrite the facts before a deferred step right after it is expanded.
      this.facts(member.agent)
      const step = member.agent?.runner.current()
      member.doneSteps.push(step ? formatTask(step.name, step.args) : e.name)
      if (member.doneSteps.length > 6) member.doneSteps.shift()
    } else if (e.type === 'check') {
      member.rejections++
      member.lastRejected = e.step
      member.lastRejectedAt = this.time
    } else if (e.type === 'catch') this.catches++
  }

  // ---- helpers for levels --------------------------------------------------------------------

  /** The branch the agent's current top-level plan chose (or its last deferred expansion, if newer). */
  get chosen(): string {
    return this.chosenOf(this.crew[this.focus])
  }

  /** The run behind `chosen`: the newer of the top-level plan and a top-level deferred expansion. */
  get chosenRun(): PlanRun | null {
    return this.chosenRunOf(this.crew[this.focus])
  }

  chosenOf(member: CrewMember): string {
    const run = this.chosenRunOf(member)
    if ((member.chosenDepth ?? 1) < 2) return chosenBranchName(run, member.trace.domain)
    // Depth first: the root's branch, then the branch of the first method it called (if any).
    const path = chosenPath(run, member.trace.domain)
    const at = path[Math.min(path.length, member.chosenDepth ?? 1) - 1]
    return at === undefined ? '' : at.slice(at.indexOf('.') + 1)
  }

  chosenRunOf(member: CrewMember): PlanRun | null {
    const plan = member.trace.lastPlan
    const deferred = member.trace.lastDeferred
    if (deferred && plan && deferred.seq > plan.seq && rootMethod(deferred) && member.trace.domain.methods[deferred.method].topLevel) return deferred
    return plan
  }

  /** Value of a variable bound by the chosen root branch, e.g. binding('?shelf') = 'shelf_b'; '' if unbound. */
  binding(name: string): string {
    const bound = chosenBindings(this.chosenRun, this.trace.domain).find(b => '?' + b.name === name)
    return bound === undefined ? '' : formatAtom(bound.value)
  }

  /** The chosen branch is `name` and the agent is executing it. */
  doing(name: string): boolean {
    return this.doingOf(this.crew[this.focus], name)
  }

  doingOf(member: CrewMember, name: string): boolean {
    return this.chosenOf(member) === name && member.agent.lastPlanStatus === 'succeeded'
  }

  say(who: 'npc' | 'tester', text: string, seconds = 2) {
    this.bubbles[who] = { text, until: this.time + seconds }
  }

  spot(name: string): Vec3 | undefined {
    return this.spots()[name]
  }

  /** Noise at a local position, heard by this station's agent only. */
  noise(kind: string, position: Vec3, loudness?: number): NoiseEvent {
    return this.bus.emit({ kind, position, loudness, source: 'tester' })
  }

  // ---- running -------------------------------------------------------------------------------

  private noiseCursor = 0

  /** `extraNoises`: the player's footsteps on the pad (local coordinates). */
  update(dt: number, extraNoises: readonly NoiseEvent[] = []): void {
    this.time += dt
    this.bus.advance(dt)
    if (!this.testerPaused && this.time >= this.scriptDelay) this.runScript(dt)
    const targets: TargetSample[] = []
    if (this.player && this.playerVisible(this.player)) targets.push(this.sample('you', this.player))
    if (this.testerVisible()) targets.push(this.sample('tester', this.tester.position))
    const heard = [...this.bus.since(this.noiseCursor), ...extraNoises]
    const noises = this.ablation === 'no_hearing' ? heard.filter(n => !this.isSound(n)) : heard
    this.noiseCursor = this.bus.lastSeq
    this.targetsNow = targets
    this.planBudget?.beginFrame()
    this.tickCrew(dt, targets, noises)
    for (const k of ['npc', 'tester'] as const) {
      const b = this.bubbles[k]
      if (b && b.until <= this.time) this.bubbles[k] = null
    }
  }

  private sample(id: 'you' | 'tester', position: Vec3): TargetSample {
    const visibility = this.targetVisibility(id)
    return visibility === undefined ? { id, position } : { id, position, visibility }
  }

  /** Every NPC that is present senses, thinks and moves; a level whose NPCs something else ticks (a GuardSquad)
   *  overrides it. */
  protected tickCrew(dt: number, targets: TargetSample[], noises: readonly NoiseEvent[]): void {
    for (const m of this.crew) if (this.present(m)) m.agent.tick(dt, targets, noises)
  }

  /** Run `seconds` of simulated time in steps of `dt` (the last one shorter if they do not divide). */
  advanceTime(seconds: number, dt = LEVEL_DT): void {
    if (!(dt > 0)) throw new Error(`advanceTime: dt must be positive, got ${dt}`)
    const end = this.time + seconds
    while (end - this.time > 1e-9) this.update(Math.min(dt, end - this.time))
  }

  /** The station is gone: release what the level holds outside itself (an ECS system). */
  dispose(): void {}

  /** Who is at `id` now: 'tester', 'you'. */
  positionOf(id: string): Vec3 | undefined {
    if (id === 'tester') return this.tester.position
    if (id === 'you') return this.player ?? undefined
    return undefined
  }

  /** Start over: props, NPCs, tester, script, checks, time 0, rng reseeded (`seed`, else the current one). */
  reset(seed?: number): void {
    this.resetProps()
    for (const m of this.crew) m.agent.stop()
    this.time = 0
    this.bus.clear()
    this.bus.now = 0
    this.noiseCursor = this.bus.lastSeq
    this.checkLog = []
    this.testerSay = ''
    this.tester.yaw = 0
    this.walkTarget = undefined
    this.retired = []
    this.crew = []
    this.init(seed)
    this.stepIndex = 0
    this.stepTime = 0
    this.stepStarted = false
    this.round = 1
    this.catches = 0
    this.bubbles.npc = this.bubbles.tester = null
  }

  teleportTester(p: Vec3): void {
    this.tester.position = { ...p }
  }

  get currentStep(): TesterStep | undefined {
    return this.script[this.stepIndex]
  }

  private runScript(dt: number): void {
    // Instant steps (act, an expect already true) chain within one frame, up to the script length.
    for (let guard = 0; guard <= this.script.length; guard++) {
      const step = this.script[this.stepIndex]
      if (!step) return
      if (!this.stepStarted) {
        this.stepStarted = true
        this.stepTime = 0
        if (step.say) this.testerSay = step.say
        if (step.kind === 'walk') this.walkTarget = typeof step.to === 'string' ? this.spot(step.to) : typeof step.to === 'function' ? undefined : step.to
        if (step.kind === 'expect') {
          const c = this.checks[this.checkIndex.get(step) ?? 0]
          c.state = 'waiting'
          c.round = this.round
          c.at = this.time
        }
      }
      if (!this.advance(step, dt)) return
      dt = 0
      this.stepStarted = false
      this.stepIndex++
      if (this.stepIndex >= this.script.length) {
        this.stepIndex = 0
        this.round++
        this.roundStartedAt = this.time
      }
    }
  }

  private resolve(c: CheckResult, state: 'pass' | 'fail'): void {
    c.state = state
    c.seconds = this.stepTime
    c.at = this.time
    this.checkLog.push({ ...c })
    if (this.checkLog.length > CHECK_LOG_SIZE) this.checkLog.shift()
  }

  /** true when the step is finished. */
  private advance(step: TesterStep, dt: number): boolean {
    this.stepTime += dt
    switch (step.kind) {
      case 'walk': {
        const to = typeof step.to === 'function' ? step.to() : this.walkTarget
        if (!to) return true
        const k = { position: this.tester.position, yaw: this.tester.yaw }
        const arrived = distanceXZ(k.position, to) <= 0.15 || stepToward(k, to, dt, { speed: step.speed ?? TESTER_SPEED, turnRate: 12, arrivalRadius: 0.15 })
        this.tester.yaw = k.yaw
        return arrived
      }
      case 'wait':
        return this.stepTime >= step.seconds
      case 'act':
        step.run()
        return true
      case 'expect': {
        const c = this.checks[this.checkIndex.get(step) ?? 0]
        if (step.that()) {
          this.resolve(c, 'pass')
          return true
        }
        if (this.stepTime >= step.within) {
          this.resolve(c, 'fail')
          return true
        }
        return false
      }
    }
  }
}
