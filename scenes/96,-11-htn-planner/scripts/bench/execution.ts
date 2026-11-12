// Opt-in Node CPU measurements; kept outside runtime and the portable consumer install.
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import { GuardBlackboard } from '../../src/htn-planner/npc/blackboard'
import { DEFAULT_TUNING, GUARD_ACTIONS, type ActionContext } from '../../src/htn-planner/npc/actions'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { float, sym, vec3 } from '../../src/htn-planner/htn/atom'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import { guardDomain } from '../../src/examples/guard/guard.htn'
import { compileDomainSource } from '../../tools/htn/compiler'
import { benchCases, percentile } from './suite'

export const WORKLOADS = ['plan-idle', 'plan-heavy100', 'dispatch-1', 'dispatch-deferred32', 'action-wait', 'action-move', 'tick-1', 'tick-32', 'tick-32-replan'] as const
export type WorkloadName = typeof WORKLOADS[number]
export interface PerfConfig { warmup: number; samples: number; batch: number }
export const PERF_DEFAULTS: PerfConfig = { warmup: 30, samples: 200, batch: 8 }
export interface CpuDistribution { p50: number; p95: number; p99: number; max: number; mean: number }
export function distribution(samples: readonly number[]): CpuDistribution {
  if (!samples.length || samples.some(x => !Number.isFinite(x) || x < 0)) throw new Error('invalid CPU samples')
  const sorted = [...samples].sort((a, b) => a - b)
  return { p50: percentile(sorted, 50), p95: percentile(sorted, 95), p99: percentile(sorted, 99), max: sorted[sorted.length - 1], mean: sorted.reduce((a, b) => a + b, 0) / sorted.length }
}
interface Workload {
  description: string
  dimensions: Record<string, number | string | boolean>
  prepare(): void
  run(): void
  accounting(): Record<string, number>
}
const DT = 1 / 30
const flat = { groundY: () => 0 }
function compile(text: string) {
  const result = compileDomainSource('cpu-measurement.domain', text)
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.ir
}
function factRows(world: WorldState): number {
  return world.tableKeys().reduce((sum, key) => {
    const at = key.lastIndexOf('/')
    return sum + world.rows(key.slice(0, at), Number(key.slice(at + 1))).length
  }, 0)
}

function planning(heavy: boolean): Workload {
  const c = benchCases().find(c => c.name === (heavy ? 'FactHeavy100' : 'Idle'))!
  const world = c.world()
  const runner = new PlanRunner(c.domain, world, c.options?.(world))
  let plans = 0
  let steps = -1
  return {
    description: 'PlanRunner.plan only; prebuilt DomainIR, world, bindings and runner; no compilation or action effects',
    dimensions: { domain: c.domain.name, method: c.method, factRows: factRows(world), factTables: world.tableKeys().length, methods: c.domain.methods.length, trace: false, stats: false },
    prepare() {},
    run() {
      if (runner.plan(c.method, c.args ?? []) !== 'succeeded') throw new Error('planning failed')
      plans++
    },
    accounting() {
      const current = runner.steps.length
      if (steps >= 0 && current !== steps) throw new Error('plan step drift')
      steps = current
      return { plans, primitiveSteps: runner.steps.filter(s => s.kind === 'primitive').length, deferredSteps: runner.steps.filter(s => s.kind === 'deferred').length }
    }
  }
}

function dispatch(count: number, batch: number): Workload {
  const tasks = Array.from({ length: count }, () => '(!host)').join(' ')
  const ir = compile(`(:domain Dispatch top_level_domain (:method (behave) top_level_method (go () (${count > 1 ? '(&later)' : tasks}))) (:method (later) (go () (${tasks}))))`)
  const runners = Array.from({ length: batch }, () => new PlanRunner(ir, new WorldState()))
  let index = 0, completed = 0, runs = 0
  return {
    description: 'Preplanned resolve/current/name dispatch/complete; synthetic host counter only; deferred32 also includes deferred decomposition, not top-level planning',
    dimensions: { primitiveSteps: count, deferredSteps: count > 1 ? 1 : 0, factRows: 0, trace: false, stats: false },
    prepare() {
      index = 0
      for (const runner of runners) if (runner.plan('behave') !== 'succeeded') throw new Error('dispatch setup failed')
    },
    run() {
      const runner = runners[index++]
      let steps = 0
      while (runner.resolve() === 'ready') {
        if (runner.current()?.name !== '!host') throw new Error('unexpected dispatch')
        // The deliberately tiny host effect; no movement/wait/SDK claim.
        completed++
        steps++
        runner.complete()
      }
      if (steps !== count) throw new Error('dispatch step count differs')
      runs++
    },
    accounting: () => ({ runs, starts: completed, completions: completed })
  }
}

function actions(move: boolean, batch: number): Workload {
  const contexts: ActionContext[] = Array.from({ length: batch }, (_, i) => ({
    id: String(i), kinematic: { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, tuning: DEFAULT_TUNING,
    terrain: flat, blackboard: new GuardBlackboard(), targetPosition: () => undefined, emit() {}
  }))
  const name = move ? '!move_to' : '!wait'
  const args = move ? [vec3(3, 0, 4), sym('walk')] : [float(0.5)]
  let index = 0, starts = 0, updates = 0, completions = 0, simulatedSeconds = 0
  return {
    description: `Built-in ${name} factory/start/update-to-done lifecycle, flat terrain, dt=1/30; context and pose reset outside timing; no rendering/physics/pathfinding`,
    dimensions: { action: name, distanceMetres: move ? 5 : 0, configuredWaitSeconds: move ? 0 : 0.5, dt: DT, trace: false, stats: false },
    prepare() {
      index = 0
      for (const ctx of contexts) { ctx.kinematic.position = { x: 0, y: 0, z: 0 }; ctx.kinematic.yaw = 0 }
    },
    run() {
      const ctx = contexts[index++]
      const executor = GUARD_ACTIONS[name](args, ctx)
      if (!executor) throw new Error('executor rejected arguments')
      starts++
      let status = executor.start(), ticks = 0
      while (status === 'running' && ticks < 256) { status = executor.update(DT); ticks++; updates++ }
      if (status !== 'done') throw new Error('executor did not finish')
      if (move && Math.hypot(3 - ctx.kinematic.position.x, 4 - ctx.kinematic.position.z) > DEFAULT_TUNING.arrivalRadius + 1e-6) throw new Error('move failed to arrive')
      simulatedSeconds += ticks * DT
      completions++
    },
    accounting: () => ({ starts, updates, completions, simulatedSeconds })
  }
}

function ticks(size: number, replan: boolean): Workload {
  const agents = Array.from({ length: size }, (_, i) => new GuardAgent({
    id: String(i), planner: w => new PlanRunner(guardDomain, w), reasoning: 'reasoning',
    lineOfSight: CLEAR_LINE_OF_SIGHT, terrain: flat,
    start: { position: { x: i % 8, y: 0, z: Math.floor(i / 8) }, yaw: 0 },
    route: [{ x: i % 8, y: 0, z: 16 }, { x: 16, y: 0, z: Math.floor(i / 8) }]
  }))
  // Stable far targets exercise perception scans without triggering chase/catch into stationary targets.
  const targets = Array.from({ length: size }, (_, i) => ({ id: 'target' + i, position: { x: 100 + i, y: 0, z: 100 } }))
  let frames = 0
  return {
    description: `Whole real GuardAgent.tick: senses, blackboard, ${replan ? 'requested candidate replan each tick, ' : 'normal completion replans, '}reasoning and real guard actions; ${size} NPCs with ${size} far targets each; no ECS/render/network`,
    dimensions: { npcs: size, targetsPerNpc: size, routeWaypoints: 2, dt: DT, requestedReplanEveryTick: replan, budget: 'none', throttle: 0, trace: false, stats: false, history: false },
    prepare() {},
    run() {
      for (const a of agents) { if (replan) a.requestReplan('benchmark burst'); a.tick(DT, targets) }
      frames++
    },
    accounting: () => ({ frames, npcTicks: frames * size, simulatedSeconds: frames * DT,
      plans: agents.reduce((n, a) => n + a.metrics.plansMade, 0), reasoning: agents.reduce((n, a) => n + a.metrics.reasoningMade, 0),
      checks: agents.reduce((n, a) => n + a.metrics.checksMade, 0), tasksCompleted: agents.reduce((n, a) => n + a.metrics.tasksCompleted, 0),
      factRows: agents.reduce((n, a) => n + factRows(a.blackboard.world), 0), moving: agents.filter(a => a.currentAction === '!move_to').length })
  }
}

export interface PerfRow {
  name: WorkloadName
  description: string
  dimensions: Workload['dimensions']
  unit: 'microseconds per operation'
  coldUs: number
  warm: CpuDistribution
  /** Batch elapsed/batch; percentiles describe batch means, not individual-operation tails. */
  samplesUs: number[]
  config: PerfConfig
  accounting: Record<string, number>
}
export function measureWorkload(name: WorkloadName, config: PerfConfig, now = () => performance.now()): PerfRow {
  for (const [key, value] of Object.entries(config)) if (!Number.isInteger(value) || value < 1 || value > 10000) throw new Error('invalid ' + key)
  const workload = name === 'plan-idle' ? planning(false) : name === 'plan-heavy100' ? planning(true)
    : name === 'dispatch-1' ? dispatch(1, config.batch) : name === 'dispatch-deferred32' ? dispatch(32, config.batch)
    : name === 'action-wait' ? actions(false, config.batch) : name === 'action-move' ? actions(true, config.batch)
    : name === 'tick-1' ? ticks(1, false) : name === 'tick-32' ? ticks(32, false) : name === 'tick-32-replan' ? ticks(32, true) : undefined
  if (!workload) throw new Error('unknown workload: ' + name)
  workload.prepare()
  let start = now()
  workload.run()
  const coldUs = (now() - start) * 1000
  // Full setup batches keep planning/context reset out of dispatch/action timings.
  for (let i = 0; i < config.warmup; i++) { workload.prepare(); for (let j = 0; j < config.batch; j++) workload.run() }
  const samplesUs: number[] = []
  for (let i = 0; i < config.samples; i++) {
    workload.prepare()
    start = now()
    for (let j = 0; j < config.batch; j++) workload.run()
    samplesUs.push((now() - start) * 1000 / config.batch)
  }
  return { name, description: workload.description, dimensions: workload.dimensions, unit: 'microseconds per operation', coldUs,
    warm: distribution(samplesUs), samplesUs, config: { ...config }, accounting: workload.accounting() }
}