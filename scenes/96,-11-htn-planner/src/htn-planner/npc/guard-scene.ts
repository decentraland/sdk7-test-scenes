// ECS integration for HTN guards: bodies (spawned capsules or an existing entity such as an NPC
// from the composite), a per-frame system that feeds the agents and writes their poses, and clean
// despawn. No `~system/*` imports, so it runs headless in tests.
import { engine, Entity, Material, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion } from '@dcl/sdk/math'
import { formatAtom, formatTask, type Atom } from '../htn/atom'
import type { DomainIR } from '../htn/ir'
import { DecompositionStatus, PlannerOptions, PlanRunner } from '../htn/planner'
import { WorldState } from '../htn/world-state'
import { atomName, type GuardEvent, type GuardTuning } from './actions'
import { GuardAgent, GuardAgentOptions, GuardMode, PlannerFactory, PlanRunnerLike } from './agent'
import { FLAT_GROUND, Kinematic, Terrain } from './movement'
import type { HearingConfig } from './hearing'
import type { AgentHistory } from './history'
import type { NoiseBus } from './noise'
import { sceneClock } from './clock-scene'
import { noiseBus, retainPlayerNoise } from './noise-scene'
import type { LineOfSight, PerceptionConfig, TargetSample } from './perception'
import { RaycastLineOfSight } from './raycast-los'
import { PlanBudget, type PlanBudgetOptions } from './plan-budget'
import type { Vec3 } from './vec'

export const MODE_COLORS: Record<GuardMode, { r: number; g: number; b: number }> = {
  patrol: { r: 0.25, g: 0.55, b: 0.35 },
  alert: { r: 0.95, g: 0.92, b: 0.2 },
  investigate: { r: 0.95, g: 0.65, b: 0.1 },
  chase: { r: 0.95, g: 0.1, b: 0.08 }
}

/**
 * A real PlanRunner over `domain`. Like upstream's demo host (AIHTNDemoWandererAgent.cpp:136-137, Report with a
 * stderr callback), callterm errors use the 'report' policy and diagnostics go to the console, unless `options`
 * sets calltermErrorPolicy / onDiagnostic.
 */
export function plannerFor(domain: DomainIR, options: PlannerOptions = {}): PlannerFactory {
  return world =>
    new PlanRunner(domain, world, {
      calltermErrorPolicy: 'report',
      onDiagnostic: d => console.log(`[htn] ${d.code}: ${d.message}`),
      ...options
    })
}

// ---- bodies ------------------------------------------------------------------

export interface GuardBody {
  /** Entity whose Transform follows the guard. */
  readonly entity: Entity
  /** Entities that must not block this guard's line of sight. */
  readonly ownEntities: readonly Entity[]
  /** Initial pose (feet on the ground), if the body has one. */
  readonly initialPose?: { position: Vec3; yaw: number }
  write(k: Kinematic): void
  setMode(mode: GuardMode): void
  dispose(): void
}

const yawRotation = (yaw: number) => Quaternion.fromEulerDegrees(0, (yaw * 180) / Math.PI, 0)

function paint(entity: Entity, c: { r: number; g: number; b: number }) {
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(c.r, c.g, c.b, 1),
    emissiveColor: Color3.create(c.r, c.g, c.b),
    emissiveIntensity: 0.8,
    roughness: 1,
    metallic: 0
  })
}

/** Capsule-ish guard: cylinder body, sphere head, a small "nose" showing where it looks. No collider. */
export function createCapsuleBody(): GuardBody {
  const root = engine.addEntity()
  Transform.create(root, {})
  const body = engine.addEntity()
  Transform.create(body, { parent: root, position: { x: 0, y: 0.65, z: 0 }, scale: { x: 0.6, y: 1.3, z: 0.6 } })
  MeshRenderer.setCylinder(body)
  const head = engine.addEntity()
  Transform.create(head, { parent: root, position: { x: 0, y: 1.55, z: 0 }, scale: { x: 0.45, y: 0.45, z: 0.45 } })
  MeshRenderer.setSphere(head)
  const nose = engine.addEntity()
  Transform.create(nose, { parent: root, position: { x: 0, y: 1.55, z: 0.25 }, scale: { x: 0.12, y: 0.12, z: 0.2 } })
  MeshRenderer.setBox(nose)
  paint(nose, { r: 0.9, g: 0.9, b: 0.85 })
  const parts = [root, body, head, nose]
  let mode: GuardMode | null = null
  return {
    entity: root,
    ownEntities: parts,
    write(k) {
      const t = Transform.getMutable(root)
      t.position = { x: k.position.x, y: k.position.y, z: k.position.z }
      t.rotation = yawRotation(k.yaw)
    },
    setMode(next) {
      if (next === mode) return
      mode = next
      paint(body, MODE_COLORS[next])
      paint(head, MODE_COLORS[next])
    },
    dispose() {
      for (const e of parts.slice().reverse()) engine.removeEntity(e)
    }
  }
}

/**
 * Drive an existing entity (e.g. an NPC placed in the composite) as a guard body. Its Transform and
 * those of its `attachments` (separate root entities that make up the figure, moved rigidly with it)
 * are saved and restored on dispose; other components (mesh, material, collider, pointer events) are
 * left alone. `facingYaw` is the direction the figure looks in its own frame (PI = looks along -Z).
 * The mode is shown by a small floating sphere above it.
 */
export function possessEntityBody(
  entity: Entity,
  opts: { groundY: number; facingYaw?: number; attachments?: readonly Entity[]; indicatorHeight?: number }
): GuardBody {
  const snapshot = (e: Entity) => {
    const t = Transform.get(e)
    return { entity: e, position: { ...t.position }, rotation: { ...t.rotation }, scale: { ...t.scale }, parent: t.parent }
  }
  const main = snapshot(entity)
  const attached = (opts.attachments ?? []).map(snapshot)
  const facing = opts.facingYaw ?? 0
  const feetOffset = main.position.y - opts.groundY
  const indicatorHeight = opts.indicatorHeight ?? feetOffset * 2 + 0.5
  const indicator = engine.addEntity()
  // Same parent as the figure, so a figure placed under a scene root still gets its indicator above it.
  Transform.create(indicator, { parent: main.parent, position: { ...main.position }, scale: { x: 0.3, y: 0.3, z: 0.3 } })
  MeshRenderer.setSphere(indicator)
  const baseYaw = quaternionYaw(main.rotation)
  let mode: GuardMode | null = null
  return {
    entity,
    ownEntities: [entity, indicator, ...attached.map(a => a.entity)],
    initialPose: { position: { x: main.position.x, y: opts.groundY, z: main.position.z }, yaw: baseYaw + facing },
    write(k) {
      const delta = k.yaw - facing - baseYaw
      const turn = yawRotation(delta)
      const t = Transform.getMutable(entity)
      t.position = { x: k.position.x, y: k.position.y + feetOffset, z: k.position.z }
      t.rotation = Quaternion.multiply(turn, main.rotation)
      const c = Math.cos(delta)
      const s = Math.sin(delta)
      for (const a of attached) {
        const ox = a.position.x - main.position.x
        const oz = a.position.z - main.position.z
        const at = Transform.getMutable(a.entity)
        at.position = {
          x: t.position.x + ox * c + oz * s,
          y: t.position.y + (a.position.y - main.position.y),
          z: t.position.z - ox * s + oz * c
        }
        at.rotation = Quaternion.multiply(turn, a.rotation)
      }
      Transform.getMutable(indicator).position = { x: k.position.x, y: k.position.y + indicatorHeight, z: k.position.z }
    },
    setMode(next) {
      if (next === mode) return
      mode = next
      paint(indicator, MODE_COLORS[next])
    },
    dispose() {
      engine.removeEntity(indicator)
      for (const a of [main, ...attached]) {
        Transform.createOrReplace(a.entity, { position: a.position, rotation: a.rotation, scale: a.scale, parent: a.parent })
      }
    }
  }
}

/** Yaw (radians, 0 = +Z) of a rotation's forward vector. */
export function quaternionYaw(q: { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y))
}

// ---- squad -------------------------------------------------------------------

export interface GuardSpec {
  id: string
  route: readonly Vec3[]
  routeStart?: number
  /** Default: the body's initial pose, else the route's start waypoint facing the next one. */
  start?: { position: Vec3; yaw: number }
  body: () => GuardBody
}

/**
 * Builds a guard's runners over its world. `guard` is the spec it builds for, so a host can give each guard its own
 * options (a trace recorder per guard, say). A PlannerFactory (`plannerFor(domain)`) is one: it ignores the guard.
 */
export type GuardPlannerFactory = (world: WorldState, guard: GuardSpec) => PlanRunnerLike

/** Passed on to every guard's agent as they are (see GuardAgentOptions). */
export type SquadPlanningOptions = Pick<GuardAgentOptions, 'onNoPlan' | 'maxPlanningPasses' | 'clock' | 'replanThrottle' | 'topLevel' | 'activePlan' | 'continueTask' | 'reasoning' | 'reasoningPasses'>

/**
 * A squad planner (upstream docs/USE_CASES.md section 4): one planner over a shared snapshot assigns roles, each
 * guard's own planner carries its order out. Every update, before the guards tick, the squad world is cleared and
 * `snapshot` writes it; a changed key (or a spawn, a remove, a reload, `requestDecision`) plans `topLevel` again.
 * Each step `(<order> <member> <arguments>...)` becomes the fact `(<fact> <arguments>...)` in that guard's world,
 * written by the guard's `syncFacts` (its key: the orders; a changed order replans the guard, an unchanged one does
 * not interrupt it). A successful plan replaces all orders (a guard with none gets no fact); no plan keeps them.
 */
export interface SquadPlannerOptions {
  /** The squad's runner over the squad's own world, e.g. `plannerFor(squadDomain)`. */
  planner: PlannerFactory
  /** Its top-level method, e.g. 'assign_roles'. */
  topLevel: string
  /** Writes the shared snapshot into the (cleared) squad world; returns a short key, a change decides again. */
  snapshot: (world: WorldState, guards: readonly GuardHandle[]) => string
  /** The primitive that gives an order; default '!order'. */
  order?: string
  /** The fact a guard gets its orders as; default 'order'. */
  fact?: string
  /** Every decision, after its orders are applied. */
  onDecision?: (decision: SquadDecision) => void
  /**
   * Seconds of squad time (the sum of the updates' clamped dt, as a guard's `time`) between two decisions; default
   * 0: every change decides in the update that sees it. A snapshot change or a plain `requestDecision` inside the
   * interval is remembered (the first reason stands) and decided, from the snapshot as it is then, in the first
   * update after the interval. Urgent requests do not wait: the start, a spawn or `remove` ('roster'), a `reload`
   * and `requestDecision(reason, true)`; they restart the interval like any decision.
   */
  minInterval?: number
}

/** One squad decision. */
export interface SquadDecision {
  /** 'start', 'snapshot <old> -> <new>', 'roster' (a guard spawned or removed), 'reload', or requestDecision's. */
  reason: string
  status: DecompositionStatus
  /** The squad plan, `!order a flank`… */
  plan: string[]
  /** Steps not applied: not an order, or an order for a guard the squad does not have. */
  ignored: string[]
  /** Frames the decision waited for the squad's `budget` (0 without one). */
  waitedFrames: number
}

export interface GuardSquadOptions extends SquadPlanningOptions {
  /** Builds each guard's runners, e.g. `plannerFor(guardDomain)`; it is told which guard it builds for. */
  planner: GuardPlannerFactory
  /** Default: SDK raycasts, ignoring every guard body in this squad. */
  lineOfSight?: LineOfSight
  /** Default: the local player (engine.PlayerEntity Transform) as target 'player'. */
  targets?: () => TargetSample[]
  /** Default: FLAT_GROUND (y = 0, no bounds). */
  terrain?: Terrain
  tuning?: Partial<GuardTuning>
  perception?: Partial<PerceptionConfig>
  hearing?: Partial<HearingConfig>
  /** Noises the guards hear. Default: the scene bus (noise-scene.ts, emitNoise). null: deaf. */
  noise?: NoiseBus | null
  /** Run the local player's footstep/landing noise system while spawned. Default: true with the scene bus. */
  playerNoise?: boolean
  /** Wall muffling for hearing. Default: none (SDK raycasts answer a frame late, too late for one-off noises). */
  hearingLineOfSight?: LineOfSight
  onEvent?: (event: GuardEvent) => void
  /** Each guard's debugger timeline (GuardAgentOptions.history): its own ring, or undefined for none. Default: none. */
  history?: (guard: GuardSpec) => AgentHistory | undefined
  /**
   * s, the longest step `update` takes (default 0.1): a longer dt is clamped. The squad's system runs a frame of the
   * scene clock (clock-scene.ts, a time scale above 1) in pieces of at most this, so nothing is lost.
   */
  maxDt?: number
  /**
   * Tick the guards with the squad's own ECS system while spawned. Default: true. The system reads the scene's
   * simulation clock (`sceneClock()`), so the debugger's pause, step and time scale hold the squad too. false: no
   * system is added; a host that runs its own loop calls `update(dt)` once per frame (with the system as well, the
   * guards would run twice as fast). The player noise system (`playerNoise`) runs either way.
   */
  system?: boolean
  /** Extra facts for every guard (GuardAgentOptions.syncFacts); with `squad`, after the orders, keys joined by '|'. */
  syncFacts?: GuardAgentOptions['syncFacts']
  /** Game-owned action factories, merged over the built-in guard actions for each agent. */
  actions?: GuardAgentOptions['actions']
  /** A squad planner whose orders reach the guards as facts. Unset: the guards plan on their own. */
  squad?: SquadPlannerOptions
  /**
   * One planning budget per frame for everything the squad plans: every guard's replans and the squad decision
   * (plan-budget.ts). A run it refuses waits for a later frame, fairly (longest waiting first, urgent ones first);
   * a guard keeps its running step meanwhile, the squad its orders. Counters: `budget.stats`, each guard's
   * `metrics.budgetDeferred` / `budgetMaxWaitFrames`, `SquadDecision.waitedFrames`. Unset: no budget, as before.
   */
  budget?: PlanBudgetOptions
}

export interface GuardHandle {
  readonly spec: GuardSpec
  readonly agent: GuardAgent
  readonly body: GuardBody
}

export function playerTargets(): TargetSample[] {
  const t = Transform.getOrNull(engine.PlayerEntity)
  return t ? [{ id: 'player', position: { x: t.position.x, y: t.position.y, z: t.position.z } }] : []
}

/** A set of guards ticked by one ECS system (or by the host, `system: false`); with `squad`, one squad planner gives them orders. */
export class GuardSquad {
  /** The squad planner's world: the shared snapshot, rewritten every update (with the `squad` option). */
  readonly squadWorld = new WorldState()
  /** The planning budget per frame shared by the guards and the squad planner (option `budget`), or null. */
  readonly budget: PlanBudget | null
  private handles: GuardHandle[] = []
  private readonly liveHandles = new Set<GuardHandle>()
  private ownLos: RaycastLineOfSight | null = null
  /** The squad's system: this frame of the scene clock, in steps of at most maxDt; nothing while paused. */
  private readonly system = () => {
    if (this.clock.dt <= 0) return
    this.budget?.beginFrame()
    this.clock.each(this.opts.maxDt ?? 0.1, dt => this.updateStep(dt))
  }
  private readonly clock = sceneClock()
  private systemAdded = false
  /** Spawned and not despawned since: the noise cursor and the player noise are set up. */
  private started = false
  private noiseCursor = 0
  private releasePlayerNoise: (() => void) | null = null
  private planner: GuardPlannerFactory
  private squadPlanner: PlannerFactory | null
  private squadRunner: PlanRunnerLike | null = null
  private readonly orderRows = new Map<string, Atom[][]>()
  /** Per guard, the order rows its world has now (their arities are cleared before the next write). */
  private readonly applied = new Map<string, Atom[][]>()
  private snapshotKey = ''
  private pendingDecision: string | null = 'start'
  /** The pending decision does not wait for `minInterval`. */
  private pendingUrgent = true
  /** Squad time, s: the sum of the updates' clamped dt. */
  private time = 0
  private lastDecisionAt = -Infinity
  private last: SquadDecision | null = null

  constructor(private readonly opts: GuardSquadOptions) {
    this.planner = opts.planner
    this.squadPlanner = opts.squad?.planner ?? null
    this.budget = opts.budget ? new PlanBudget(opts.budget) : null
  }

  /** Each guard's orders from the last successful decision: the rows of the order fact, by guard id. */
  get orders(): ReadonlyMap<string, readonly (readonly Atom[])[]> {
    return this.orderRows
  }

  get lastDecision(): SquadDecision | null {
    return this.last
  }

  /**
   * Plan the squad again on the next update (the snapshot key did not change, but something else did). It waits for
   * `minInterval` unless `urgent`. A pending request keeps its first reason; `urgent` makes it urgent.
   */
  requestDecision(reason: string, urgent = false): void {
    if (this.pendingDecision === null) this.pendingDecision = reason
    this.pendingUrgent = this.pendingUrgent || urgent
  }

  get active(): boolean {
    return this.handles.length > 0
  }

  get guards(): readonly GuardHandle[] {
    return this.handles
  }

  spawn(specs: readonly GuardSpec[]): void {
    const terrain = this.opts.terrain ?? FLAT_GROUND
    const los = this.lineOfSight()
    for (const spec of specs) {
      const body = spec.body()
      const start = spec.start ?? body.initialPose ?? routeStartPose(spec)
      const agent = new GuardAgent({
        id: spec.id,
        planner: this.guardPlanner(this.planner, spec),
        lineOfSight: los,
        start,
        route: spec.route.map(p => ({ x: p.x, y: terrain.groundY(p.x, p.z), z: p.z })),
        routeStart: spec.routeStart,
        terrain,
        tuning: this.opts.tuning,
        perception: this.opts.perception,
        hearing: this.opts.hearing,
        hearingLineOfSight: this.opts.hearingLineOfSight,
        onNoPlan: this.opts.onNoPlan,
        maxPlanningPasses: this.opts.maxPlanningPasses,
        clock: this.opts.clock,
        replanThrottle: this.opts.replanThrottle,
        topLevel: this.opts.topLevel,
        activePlan: this.opts.activePlan,
        continueTask: this.opts.continueTask,
        reasoning: this.opts.reasoning,
        reasoningPasses: this.opts.reasoningPasses,
        onEvent: this.opts.onEvent,
        history: this.opts.history?.(spec),
        planBudget: this.budget ?? undefined,
        actions: this.opts.actions,
        syncFacts: this.opts.squad ? a => this.syncOrders(a) : this.opts.syncFacts
      })
      body.write(agent.kinematic)
      body.setMode(agent.mode)
      const handle = { spec, agent, body }
      this.handles.push(handle)
      this.liveHandles.add(handle)
    }
    if (specs.length > 0) this.requestDecision('roster', true)
    if (!this.started) {
      this.started = true
      const bus = this.bus()
      if (bus) this.noiseCursor = bus.lastSeq
      // Before the squad system, so this frame's footsteps are heard this frame.
      if (bus === noiseBus && (this.opts.playerNoise ?? true)) this.releasePlayerNoise = retainPlayerNoise()
      if (this.opts.system ?? true) {
        engine.addSystem(this.system)
        this.systemAdded = true
      }
    }
  }

  /**
   * Hot reload every guard (GuardAgent.reload: world and positions kept, plans dropped, replan next update), as
   * upstream's HTNHotReloadDemo reloads all its NPCs between updates. Later spawns use the new factory (it is told
   * which guard it builds for, as the `planner` option).
   * `squadPlanner` (with the `squad` option): the squad planner's new factory; the orders stay until the squad
   * decides again from it on the next update (reason 'reload'). Without it the squad domain stays.
   */
  reload(planner: GuardPlannerFactory, squadPlanner?: PlannerFactory): void {
    this.planner = planner
    for (const h of this.handles) h.agent.reload(this.guardPlanner(planner, h.spec))
    if (squadPlanner !== undefined && this.opts.squad) {
      this.squadRunner?.clear()
      this.squadPlanner = squadPlanner
      this.squadRunner = null
      this.pendingDecision = 'reload'
      this.pendingUrgent = true
    }
  }

  /** Stop one guard and remove its body (it dropped out); with `squad`, the squad decides again. */
  remove(id: string): void {
    const h = this.handles.find(x => x.spec.id === id)
    if (h === undefined) return
    // Detach before callbacks from stop(): reentrant removal cannot dispose the same body twice.
    this.handles = this.handles.filter(x => x !== h)
    this.liveHandles.delete(h)
    h.agent.stop()
    h.body.dispose()
    this.orderRows.delete(id)
    this.applied.delete(id)
    this.requestDecision('roster', true)
  }

  despawn(): void {
    const handles = this.handles
    this.handles = []
    this.liveHandles.clear()
    for (const h of handles) {
      h.agent.stop()
      h.body.dispose()
    }
    this.orderRows.clear()
    this.applied.clear()
    this.squadRunner?.clear()
    this.squadRunner = null
    this.snapshotKey = ''
    this.pendingDecision = 'start'
    this.pendingUrgent = true
    this.lastDecisionAt = -Infinity
    this.last = null
    if (this.systemAdded) {
      engine.removeSystem(this.system)
      this.systemAdded = false
    }
    this.started = false
    this.releasePlayerNoise?.()
    this.releasePlayerNoise = null
    this.ownLos?.releaseAll()
    this.ownLos = null
  }

  /** One caller-managed frame. The ECS system shares a budget across its clock substeps instead. */
  update(dt: number): void {
    this.budget?.beginFrame()
    this.updateStep(dt)
  }

  private updateStep(dt: number): void {
    const step = Math.min(dt, this.opts.maxDt ?? 0.1)
    this.time += step
    const targets = (this.opts.targets ?? playerTargets)()
    const bus = this.bus()
    const noises = bus ? bus.since(this.noiseCursor) : []
    if (bus) this.noiseCursor = bus.lastSeq
    if (this.opts.squad) this.think(this.opts.squad)
    for (const h of this.handles.slice()) {
      if (!this.liveHandles.has(h)) continue
      h.agent.tick(step, targets, noises)
      if (!this.liveHandles.has(h)) continue
      h.body.write(h.agent.kinematic)
      h.body.setMode(h.agent.mode)
    }
  }

  // ---- squad planner ---------------------------------------------------------

  /** Rewrite the snapshot; decide when its key changed or a decision was asked for, minInterval and the budget allow. */
  private think(squad: SquadPlannerOptions): void {
    const world = this.squadWorld
    world.clearAll()
    const key = squad.snapshot(world, this.handles)
    if (key !== this.snapshotKey) {
      if (this.pendingDecision === null) this.pendingDecision = `snapshot ${this.snapshotKey} -> ${key}`
      this.snapshotKey = key
    }
    if (this.pendingDecision === null) return
    if (!this.pendingUrgent && this.time - this.lastDecisionAt < (squad.minInterval ?? 0) - TIME_EPSILON) return
    const budget = this.budget
    if (budget === null) this.decideNow(squad, 0)
    // Refused: the request stays pending (the orders stay) and asks again next frame.
    else budget.tryRun(this, this.pendingUrgent, () => this.decideNow(squad, budget.lastWaitFrames))
  }

  private decideNow(squad: SquadPlannerOptions, waitedFrames: number): void {
    const reason = this.pendingDecision ?? ''
    this.pendingDecision = null
    this.pendingUrgent = false
    this.lastDecisionAt = this.time
    this.decide(squad, reason, waitedFrames)
  }

  /** Plan the squad and turn its order steps into each guard's order rows (USE_CASES.md:78-83). */
  private decide(squad: SquadPlannerOptions, reason: string, waitedFrames: number): void {
    const runner = (this.squadRunner ??= (this.squadPlanner ?? squad.planner)(this.squadWorld))
    const status = runner.plan(squad.topLevel, [])
    const plan = status === 'succeeded' ? runner.steps.map(s => formatTask(s.name, s.args)) : []
    const ignored: string[] = []
    if (status === 'succeeded') {
      const order = squad.order ?? '!order'
      const ids = new Set(this.handles.map(h => h.spec.id))
      this.orderRows.clear()
      // Deferred steps expand against the snapshot as it is now (resolve), as a guard's do.
      while (runner.resolve() === 'ready') {
        const step = runner.current()!
        runner.complete()
        const task = formatTask(step.name, step.args)
        const member = atomName(step.args[0])
        if (step.name !== order) ignored.push(`${task}: not an order`)
        else if (member === undefined || !ids.has(member)) ignored.push(`${task}: no guard ${step.args[0] === undefined ? '' : formatAtom(step.args[0])}`)
        else {
          const rows = this.orderRows.get(member) ?? []
          rows.push(step.args.slice(1))
          this.orderRows.set(member, rows)
        }
      }
    }
    runner.clear()
    const decision: SquadDecision = { reason, status, plan, ignored, waitedFrames }
    this.last = decision
    if (squad.onDecision) squad.onDecision(decision)
    else for (const line of ignored) console.log(`[htn squad] ${line}`)
  }

  /** A guard's syncFacts with the `squad` option: its orders as facts, then the host's own facts. */
  private syncOrders(agent: GuardAgent): string {
    const fact = this.opts.squad?.fact ?? 'order'
    const world = agent.blackboard.world
    for (const row of this.applied.get(agent.id) ?? []) world.clear(fact, row.length)
    const rows = this.orderRows.get(agent.id) ?? []
    for (const row of rows) world.add(fact, ...row)
    this.applied.set(agent.id, rows)
    const key = rows.map(r => r.map(formatAtom).join(' ')).join(';')
    const extra = this.opts.syncFacts
    return extra ? `${key}|${extra(agent)}` : key
  }

  /** The agent's factory for one guard. */
  private guardPlanner(planner: GuardPlannerFactory, spec: GuardSpec): PlannerFactory {
    return world => planner(world, spec)
  }

  private bus(): NoiseBus | null {
    return this.opts.noise === undefined ? noiseBus : this.opts.noise
  }

  private lineOfSight(): LineOfSight {
    if (this.opts.lineOfSight) return this.opts.lineOfSight
    if (!this.ownLos) {
      const self = this
      this.ownLos = new RaycastLineOfSight({
        ignore: function* () {
          for (const h of self.handles) yield* h.body.ownEntities
        }
      })
    }
    return this.ownLos
  }
}

/** Float slack for comparing accumulated time with an interval (as the agent's throttle). */
const TIME_EPSILON = 1e-6

function routeStartPose(spec: GuardSpec): { position: Vec3; yaw: number } {
  const n = spec.route.length
  if (n === 0) return { position: { x: 0, y: 0, z: 0 }, yaw: 0 }
  const i = (spec.routeStart ?? 0) % n
  const p = spec.route[i]
  const next = spec.route[(i + 1) % n]
  return { position: { ...p }, yaw: Math.atan2(next.x - p.x, next.z - p.z) }
}
