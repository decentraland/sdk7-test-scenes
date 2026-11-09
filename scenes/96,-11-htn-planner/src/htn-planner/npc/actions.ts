// Executors for the guard's primitive tasks. The planner only names actions (`!move_to ...`);
// these give them duration and effects. An executor is created per plan step:
// start() → update(dt)* → 'done' | 'failed', or cancel() when the agent replans mid-step.
import type { Atom } from '../htn/atom'
import type { GuardBlackboard } from './blackboard'
import { Kinematic, MoveParams, stepToward, Terrain, turnToward } from './movement'
import { distanceXZ, DEG, Vec3, yawTo } from './vec'

export type ActionStatus = 'running' | 'done' | 'failed'

export interface ActionExecutor {
  start(): ActionStatus
  update(dt: number): ActionStatus
  cancel(): void
}

export interface GuardTuning {
  walkSpeed: number // patrol, m/s
  hurrySpeed: number // investigate
  runSpeed: number // chase
  turnRate: number // rad/s
  arrivalRadius: number // m
  catchRadius: number // m, horizontal distance at which a chase ends in a catch
  lookAroundDeg: number // half-angle of the look-around sweep
  moveTimeoutSlack: number // s added to distance/speed before a move gives up (counts as arrived)
}

export const DEFAULT_TUNING: GuardTuning = {
  walkSpeed: 1.3,
  hurrySpeed: 2.4,
  runSpeed: 3.4,
  turnRate: 220 * DEG,
  arrivalRadius: 0.3,
  catchRadius: 1.2,
  lookAroundDeg: 70,
  moveTimeoutSlack: 4
}

/** What executors may touch: the guard's pose, memory, tuning and host hooks. */
export interface ActionContext {
  readonly id: string
  readonly kinematic: Kinematic
  readonly tuning: GuardTuning
  readonly terrain: Terrain
  readonly blackboard: GuardBlackboard
  /** Current position of a target the guard has detected (live while detected), else undefined. */
  targetPosition(id: string): Vec3 | undefined
  /** Host event hook (catch, arrivals...). */
  emit(event: GuardEvent): void
}

/**
 * What asked for a replan: the agent's start or a reload; a sense (`perception`: the visible / remembered targets
 * the domain reads; `hearing`: the noise level rose; `facts`: the syncFacts key changed); the plan ran out
 * (`plan_done`), a step failed (`step_failed`), a deferred step found no plan (`deferred_failed`); the retry after
 * no plan (`no_plan_retry`, every tick until one is found); the running-plan check rejected the step
 * (`active_plan`); the host (`request`, GuardAgent.requestReplan) or a debugger (`debug`).
 */
export type ReplanTrigger =
  | 'start'
  | 'reload'
  | 'perception'
  | 'hearing'
  | 'facts'
  | 'plan_done'
  | 'step_failed'
  | 'deferred_failed'
  | 'no_plan_retry'
  | 'active_plan'
  | 'request'
  | 'debug'

/**
 * The agent planned. `plan`: what it runs now. `kept`: a plan was running and goes on as it was (the candidate
 * was equivalent, or found nothing under onNoPlan 'keep'). `passes`: planner calls in this replan (a successful
 * empty plan plans again at once). The rest (GuardAgent sets them; other hosts may leave them out):
 * - `trigger`: what asked for it (the first request; `also`: other triggers that asked before it ran);
 * - `waited`: seconds between the request and the replan (the throttle, the shared budget); `budgetFrames`: frames
 *   the shared budget refused it;
 * - `changes`: the facts the domain reads that changed since the previous replan, `+ (fact args)` / `- (fact args)`
 *   (only with a history or onEvent; absent on the first replan). The volatile facts (the agent's `now` and
 *   `self_position`, written every tick, and a host's GuardAgentOptions.volatileFacts) are never listed: their rows
 *   differ at nearly every replan, so they would only crowd out the facts that mean something;
 * - `volatile`: the volatile facts the domain reads that changed, by name (absent: none, or no `changes`), so a
 *   replan whose `changes` is empty still says the clock moved (a time condition may have flipped);
 * - `previous`: the rest of the running plan before it (absent: nothing ran); `changed`: the plan now differs from
 *   it (false: kept, or the same steps again).
 */
export interface ReplanEvent {
  type: 'replan'
  guard: string
  reason: string
  /** Decomposition status, or deferred_failed when validation of a deferred candidate failed. */
  status: string
  plan: string[]
  kept: boolean
  passes: number
  trigger?: ReplanTrigger
  also?: ReplanTrigger[]
  waited?: number
  budgetFrames?: number
  changes?: string[]
  volatile?: string[]
  previous?: string[]
  changed?: boolean
  /** The belief upkeep's steps (GuardAgentOptions.reasoning) run before this plan was made, in order; absent: none. */
  upkeep?: string[]
  /**
   * The domain planned only the continue task (GuardAgentOptions.continueTask): the running plan goes on (`kept`;
   * `plan` is the running plan, not the continue task). Absent: not a continue.
   */
  continued?: true
}

/**
 * `no_executor` .. `active_plan_conflict`: see the `diagnostic` event. The belief upkeep (GuardAgentOptions.reasoning):
 * `reasoning_invalid`, no such top-level method (no upkeep); `reasoning_not_instant` (once per primitive), an upkeep step
 * that did not finish at once (cancelled); `reasoning_unsettled` (once), the upkeep still had steps after its last plan.
 * The continue convention (GuardAgentOptions.continueTask): `continue_idle` (once), a plan with the continue task that
 * keeps nothing (no plan was running, or the task is not the plan's only step): the step idles one tick.
 */
export type AgentDiagnosticCode =
  | 'no_executor'
  | 'active_plan_invalid'
  | 'active_plan_fallback'
  | 'active_plan_conflict'
  | 'reasoning_invalid'
  | 'reasoning_not_instant'
  | 'reasoning_unsettled'
  | 'continue_idle'

export type GuardEvent =
  | { type: 'catch'; guard: string; target: string }
  | { type: 'step'; guard: string; name: string; args: readonly Atom[] }
  | { type: 'step_end'; guard: string; name: string; status: ActionStatus | 'cancelled' }
  | ReplanEvent
  | { type: 'heard'; guard: string; kind: string; source: string; perceived: number; muffled: boolean; alert: number; level: string }
  /**
   * What the agent knows changed and asked for a replan: `perception` (the visible / remembered targets the domain
   * reads, as `visible|remembered` ids) or `facts` (the key syncFacts returned).
   */
  | { type: 'sense'; guard: string; what: 'perception' | 'facts'; from: string; to: string }
  /**
   * The running-plan check (GuardAgentOptions.activePlan) found no plan for the running step `step`: the agent
   * cancels it and plans again (a `step_end` cancelled and a `replan` 'active_plan failed' follow). Passed checks
   * are not events (one per tick).
   */
  | { type: 'check'; guard: string; method: string; step: string; status: string }
  /**
   * A host problem the planner cannot see, said once per agent (and again after a reload).
   * `no_executor` (once per primitive): a plan step whose name has no executor, or whose executor rejected the
   * arguments (returned null); the step runs as a 0.05 s no-op (upstream HTNDemo's host), the plan goes on.
   * The running-plan check (GuardAgentOptions.activePlan): `active_plan_invalid`, the method is not a top-level method
   * of the domain (the agent does not check); `active_plan_fallback`, a branch of it always succeeds and accepts any
   * running step (htn/check-method.ts; the compiler warns too, `--check-method`); `active_plan_conflict` (once per primitive), the check rejected a step and the replan
   * made the same plan again (the methods disagree; that step is not checked again).
   */
  | { type: 'diagnostic'; guard: string; code: AgentDiagnosticCode; message: string }
  /** A domain-specific moment for the host (Stalker: noticed, gave_up, despawn). */
  | { type: 'signal'; guard: string; name: string; target?: string }

export type ActionFactory = (args: readonly Atom[], ctx: ActionContext) => ActionExecutor | null

// ---- atom decoding -------------------------------------------------------

export function atomNumber(a: Atom | undefined): number | undefined {
  return a && (a.t === 'int' || a.t === 'float') ? a.v : undefined
}

export function atomName(a: Atom | undefined): string | undefined {
  return a && (a.t === 'sym' || a.t === 'str') ? a.v : undefined
}

export function atomVec3(a: Atom | undefined): Vec3 | undefined {
  if (!a || a.t !== 'list' || a.v.length !== 3) return undefined
  const [x, y, z] = a.v.map(atomNumber)
  return x === undefined || y === undefined || z === undefined ? undefined : { x, y, z }
}

// ---- executors -----------------------------------------------------------

/** Executor whose work happens in start(); update keeps reporting the result. */
export function instant(run: () => ActionStatus): ActionExecutor {
  let status: ActionStatus = 'running'
  return {
    start: () => (status = run()),
    update: () => status,
    cancel: () => {}
  }
}

export function timed(seconds: number, tick: (dt: number, elapsed: number) => void = () => {}): ActionExecutor {
  let elapsed = 0
  return {
    start: () => (seconds <= 0 ? 'done' : 'running'),
    update(dt) {
      elapsed += dt
      tick(dt, elapsed)
      return elapsed >= seconds - 1e-6 ? 'done' : 'running' // tolerate float drift of summed frame times
    },
    cancel: () => {}
  }
}

export function speedForGait(gait: string | undefined, t: GuardTuning): number | undefined {
  switch (gait) {
    case 'walk': return t.walkSpeed
    case 'hurry': return t.hurrySpeed
    case 'run': return t.runSpeed
    default: return undefined
  }
}

/** `(!move_to ?position ?gait)`: walk to a fixed point. Gives up (as arrived) after a generous timeout. */
const moveTo: ActionFactory = (args, ctx) => {
  const target = atomVec3(args[0])
  const speed = speedForGait(atomName(args[1]), ctx.tuning)
  if (!target || speed === undefined) return null
  const params: MoveParams = { speed, turnRate: ctx.tuning.turnRate, arrivalRadius: ctx.tuning.arrivalRadius }
  const timeout = distanceXZ(ctx.kinematic.position, target) / speed + ctx.tuning.moveTimeoutSlack
  let elapsed = 0
  return {
    start: () => (distanceXZ(ctx.kinematic.position, target) <= params.arrivalRadius ? 'done' : 'running'),
    update(dt) {
      elapsed += dt
      return stepToward(ctx.kinematic, target, dt, params, ctx.terrain) || elapsed >= timeout ? 'done' : 'running'
    },
    cancel: () => {}
  }
}

/** `(!chase ?target)`: run at the live target position until within catch radius; fails if it is no longer detected. */
const chase: ActionFactory = (args, ctx) => {
  const id = atomName(args[0])
  if (id === undefined) return null
  const params: MoveParams = { speed: ctx.tuning.runSpeed, turnRate: ctx.tuning.turnRate, arrivalRadius: ctx.tuning.catchRadius }
  const check = (): ActionStatus => {
    const p = ctx.targetPosition(id)
    if (!p) return 'failed'
    return distanceXZ(ctx.kinematic.position, p) <= params.arrivalRadius ? 'done' : 'running'
  }
  return {
    start: check,
    update(dt) {
      const p = ctx.targetPosition(id)
      if (!p) return 'failed'
      return stepToward(ctx.kinematic, p, dt, params, ctx.terrain) ? 'done' : 'running'
    },
    cancel: () => {}
  }
}

/** `(!catch ?target)`: the host decides what a catch means (onCatch hook). Instant. */
const catchTarget: ActionFactory = (args, ctx) => {
  const id = atomName(args[0])
  if (id === undefined) return null
  return instant(() => {
    const p = ctx.targetPosition(id)
    if (p) ctx.kinematic.yaw = yawTo(ctx.kinematic.position, p)
    ctx.emit({ type: 'catch', guard: ctx.id, target: id })
    return 'done'
  })
}

/** `(!look_around ?seconds)`: sweep the gaze left and right around the current heading. */
const lookAround: ActionFactory = (args, ctx) => {
  const seconds = atomNumber(args[0])
  if (seconds === undefined) return null
  const base = ctx.kinematic.yaw
  const amplitude = ctx.tuning.lookAroundDeg * DEG
  return timed(seconds, (dt, elapsed) => {
    const desired = base + amplitude * Math.sin((elapsed / seconds) * 2 * Math.PI)
    turnToward(ctx.kinematic, desired, dt, ctx.tuning.turnRate)
  })
}

/** `(!wait ?seconds)` */
const wait: ActionFactory = args => {
  const seconds = atomNumber(args[0])
  return seconds === undefined ? null : timed(seconds)
}

/** `(!forget ?target)`: drop the last-seen memory. Instant. */
const forget: ActionFactory = (args, ctx) => {
  const id = atomName(args[0])
  if (id === undefined) return null
  return instant(() => {
    ctx.blackboard.forget(id)
    return 'done'
  })
}

/** `(!turn_to ?position)`: turn in place to face a point (e.g. toward a noise). */
const turnTo: ActionFactory = (args, ctx) => {
  const target = atomVec3(args[0])
  if (!target) return null
  const facing = () => yawTo(ctx.kinematic.position, target)
  const turn = (dt: number): ActionStatus =>
    distanceXZ(ctx.kinematic.position, target) < 1e-3 || turnToward(ctx.kinematic, facing(), dt, ctx.tuning.turnRate) ? 'done' : 'running'
  return { start: () => turn(0), update: turn, cancel: () => {} }
}

/** `(!listen ?seconds)`: stand still and listen; hearing keeps running, a new noise can replan. */
const listen: ActionFactory = args => {
  const seconds = atomNumber(args[0])
  return seconds === undefined ? null : timed(seconds)
}

/** `(!forget_noise ?time)`: drop the heard noise if it is still the one heard at ?time. Instant. */
const forgetNoise: ActionFactory = (args, ctx) => {
  const heardAt = atomNumber(args[0])
  if (heardAt === undefined) return null
  return instant(() => {
    ctx.blackboard.forgetNoise(heardAt)
    return 'done'
  })
}

/** `(!set_waypoint ?index)`: integer 0..count; count means route completed. Invalid input fails without mutation. */
const setWaypoint: ActionFactory = (args, ctx) => {
  const index = atomNumber(args[0])
  if (index === undefined) return null
  return instant(() => ctx.blackboard.setWaypoint(index) ? 'done' : 'failed')
}

export type ActionRegistry = Readonly<Record<string, ActionFactory>>

export const GUARD_ACTIONS: ActionRegistry = {
  '!move_to': moveTo,
  '!chase': chase,
  '!catch': catchTarget,
  '!look_around': lookAround,
  '!wait': wait,
  '!forget': forget,
  '!set_waypoint': setWaypoint,
  '!turn_to': turnTo,
  '!listen': listen,
  '!forget_noise': forgetNoise
}
