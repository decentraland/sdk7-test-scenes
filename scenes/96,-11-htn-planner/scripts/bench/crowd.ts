// Many NPCs at once: level 9 (CrowdLevel) headless with N guards, ticked at 30 (or 60) fps for simulated seconds
// while its tester walks in, runs out and rings the bell. Per tick: the whole AI update (perception, hearing,
// planning, actions) and the planning part of it (the agents' own planning metrics); replans per second and the
// worst single plan. With the trace recorder every playground NPC has, and without (a scene's GuardSquad). With a
// shared planning budget per frame (plan-budget.ts) and without: its waits and the longest one, in frames. The game
// metric: how many NPCs one ms of frame runs (size / mean ms per frame), the heap bytes per frame and the GCs.
import type { PlanBudgetOptions } from '../../src/htn-planner'
import { CrowdLevel } from '../../src/playground/levels/crowd'
import { startAllocMeter } from './alloc'
import { npcsPerMs } from './compare'
import { percentile } from './suite'

export interface CrowdOptions {
  size: number
  /** Simulated seconds. */
  seconds: number
  /** Ticks per simulated second (default 30, the scene's level dt). */
  fps?: number
  /** A PlanTraceRecorder per NPC, as the playground levels have. */
  record: boolean
  /** A planning budget per frame shared by the crew; default none. */
  budget?: PlanBudgetOptions | null
}

export interface CrowdResult extends CrowdOptions {
  fps: number
  ticks: number
  /** The first tick, ms: every agent plans for the first time, with the JIT still cold. */
  firstTickMs: number
  /** After the first second (WARM_TICKS); ms per tick of level.update(): every agent's whole tick. */
  tickP50: number
  tickP95: number
  tickMax: number
  tickP99: number
  tickMeanMs: number
  /** NPCs one ms of frame runs: size / tickMeanMs (on average), size / tickP95 (in a busy frame). */
  npcsPerMs: number
  npcsPerMsP95: number
  /** V8 heap bytes per tick after the first second (alloc.ts), and the GCs and their ms meanwhile. */
  bytesPerFrame: number
  gcCount: number
  gcMs: number
  /** ms per tick spent planning (sum over agents of GuardAgent.metrics planning time). */
  planP50: number
  planP95: number
  planMax: number
  planP99: number
  /** Ticks in which at least one agent planned, %. */
  planningTicks: number
  /** Planner calls per simulated second, all agents. */
  replansPerSecond: number
  /** The slowest planning of one agent in one tick, ms (one or a few planner calls). */
  worstPlanMs: number
  /** The most planner calls in one tick (the first tick has one per agent), and after the first second. */
  maxPlansInTick: number
  maxPlansInWarmTick: number
  /** With a budget: replans it made wait (one per agent and frame), the longest wait in frames. */
  budgetWaits: number
  budgetMaxWaitFrames: number
  maxPeakCallFrames: number
  /** The tester's checks that failed (the scenario did not play as intended), expected []. */
  failedChecks: string[]
}

export function runCrowd(o: CrowdOptions): CrowdResult {
  const fps = o.fps ?? 30
  const DT = 1 / fps
  /** Ticks left out of the per-tick statistics: the first second, where everything runs cold. */
  const WARM_TICKS = fps
  const level = new CrowdLevel(o.size, o.budget ?? null)
  level.recordTraces = o.record
  level.init()
  const agents = level.crew.map(m => m.agent)
  const tick: number[] = []
  const plan: number[] = []
  let planningTicks = 0
  let maxPlansInTick = 0
  let maxPlansInWarmTick = 0
  let lastPlans = 0
  let firstTickMs = 0
  let worstPlanMs = 0
  const agentMs = agents.map(() => 0)
  const failed = new Set<string>()
  const ticks = Math.round(o.seconds / DT)
  let meter: ReturnType<typeof startAllocMeter> | null = null
  for (let i = 0; i < ticks; i++) {
    if (i === WARM_TICKS) meter = startAllocMeter()
    const start = performance.now()
    level.update(DT)
    const tickMs = performance.now() - start
    let ms = 0
    let plans = 0
    agents.forEach((a, j) => {
      // Planning: its decisions and, with a reasoning method, its belief upkeep (0 without one).
      const total = a.metrics.totalPlanMs + a.metrics.totalReasoningMs
      const own = total - agentMs[j]
      agentMs[j] = total
      if (i >= WARM_TICKS) worstPlanMs = Math.max(worstPlanMs, own)
      ms += own
      plans += a.metrics.plansMade
    })
    if (i === 0) firstTickMs = tickMs
    if (i >= WARM_TICKS) {
      tick.push(tickMs)
      plan.push(ms)
    }
    if (plans > lastPlans) planningTicks++
    maxPlansInTick = Math.max(maxPlansInTick, plans - lastPlans)
    if (i >= WARM_TICKS) maxPlansInWarmTick = Math.max(maxPlansInWarmTick, plans - lastPlans)
    lastPlans = plans
    for (const c of level.checks) if (c.state === 'fail') failed.add(`round ${c.round}: ${c.label}`)
  }
  const alloc = meter?.stop() ?? { bytes: 0, gcCount: 0, gcMs: 0 }
  const tickMeanMs = tick.length > 0 ? tick.reduce((a, b) => a + b, 0) / tick.length : 0
  tick.sort((a, b) => a - b)
  plan.sort((a, b) => a - b)
  return {
    ...o,
    fps,
    ticks,
    firstTickMs,
    tickP50: percentile(tick, 50),
    tickP95: percentile(tick, 95),
    tickMax: tick[tick.length - 1],
    tickP99: percentile(tick, 99),
    tickMeanMs,
    npcsPerMs: npcsPerMs(o.size, tickMeanMs),
    npcsPerMsP95: npcsPerMs(o.size, percentile(tick, 95)),
    bytesPerFrame: tick.length > 0 ? alloc.bytes / tick.length : 0,
    gcCount: alloc.gcCount,
    gcMs: alloc.gcMs,
    planP50: percentile(plan, 50),
    planP95: percentile(plan, 95),
    planMax: plan[plan.length - 1],
    planP99: percentile(plan, 99),
    planningTicks: (planningTicks * 100) / ticks,
    replansPerSecond: lastPlans / o.seconds,
    worstPlanMs,
    maxPlansInTick,
    maxPlansInWarmTick,
    budgetWaits: level.planBudget?.stats.deferred ?? 0,
    budgetMaxWaitFrames: level.planBudget?.stats.maxWaitFrames ?? 0,
    maxPeakCallFrames: Math.max(...agents.map(a => a.metrics.maxPeakCallFrames)),
    failedChecks: [...failed]
  }
}

const lpad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s)

export function budgetLabel(b: PlanBudgetOptions | null | undefined): string {
  if (!b) return 'none'
  const parts: string[] = []
  if (b.maxPlansPerFrame !== undefined) parts.push(`${b.maxPlansPerFrame}/f`)
  if (b.planBudgetMs !== undefined) parts.push(`${b.planBudgetMs}ms`)
  return parts.join(',') || 'none'
}

export function formatCrowd(results: readonly CrowdResult[]): string {
  const out = [
    'Many NPCs: level 9 (guard.domain), fps ticks/s. ms per tick of the whole AI update (tick) and of its planning (plan),',
    'after the first second; "first": the first tick (all plan, JIT cold); "worst plan": one agent in one tick, warm;',
    '"budget": plans per frame (/f) or ms per frame shared by the crew; "plan" includes the belief upkeep; "waits": replans it deferred; "max wait": frames'
  ]
  const head = ['npcs', 'fps', 'recorder', 'seconds', 'budget', 'first', 'tick p50', 'tick p95', 'tick max', 'plan p50', 'plan p95', 'plan max', 'plan %ticks', 'replans/s', 'max/tick', 'max/tick w', 'worst plan', 'waits', 'max wait', 'frames']
  out.push(head.map((h, i) => lpad(h, i < 5 ? 9 : 12)).join(''))
  for (const r of results) {
    const cells = [
      String(r.size),
      String(r.fps),
      r.record ? 'on' : 'off',
      String(r.seconds),
      budgetLabel(r.budget),
      r.firstTickMs.toFixed(3),
      r.tickP50.toFixed(3),
      r.tickP95.toFixed(3),
      r.tickMax.toFixed(3),
      r.planP50.toFixed(3),
      r.planP95.toFixed(3),
      r.planMax.toFixed(3),
      r.planningTicks.toFixed(1),
      r.replansPerSecond.toFixed(1),
      String(r.maxPlansInTick),
      String(r.maxPlansInWarmTick),
      r.worstPlanMs.toFixed(3),
      String(r.budgetWaits),
      String(r.budgetMaxWaitFrames),
      String(r.maxPeakCallFrames)
    ]
    out.push(cells.map((c, i) => lpad(c, i < 5 ? 9 : 12)).join(''))
  }
  const failed = results.filter(r => r.failedChecks.length > 0)
  for (const r of failed) out.push(`  ${r.size} npcs at ${r.fps} fps, recorder ${r.record ? 'on' : 'off'}, budget ${budgetLabel(r.budget)}: failed checks ${r.failedChecks.join('; ')}`)
  return out.join('\n')
}

/** A crowd run's name in reports and --compare: '50 npcs 30fps', '50 npcs 30fps 3/f', '10 npcs 30fps recorder'. */
export function crowdName(r: CrowdOptions): string {
  const budget = budgetLabel(r.budget)
  return `${r.size} npcs ${r.fps ?? 30}fps${budget === 'none' ? '' : ` ${budget}`}${r.record ? ' recorder' : ''}`
}

/**
 * The game metric: how many NPCs fit in one ms of frame, planning and every agent's tick (perception, hearing,
 * actions) together, at 30 and 60 fps; the planning p99 per frame; the heap bytes per frame and the GCs they cost.
 */
export function formatGame(results: readonly CrowdResult[]): string {
  const out = [
    'Game metric: NPCs per 1 ms of frame (level 9 crowd; the whole AI update per frame, planning included, after the',
    'first second). "mean": size / mean ms per frame; "p95 frame": size / p95 ms per frame (a busy frame); bytes: V8 heap',
    'allocated per frame (alloc.ts); GCs over the run. At 30 fps a frame is 33.3 ms, at 60 fps 16.7 ms: the AI share is yours to pick'
  ]
  const head = ['run', 'ms/frame', 'us/NPC/frame', 'NPCs/ms mean', 'NPCs/ms p95', 'plan p99 ms', 'bytes/frame', 'bytes/NPC/f', 'GCs', 'GC ms']
  out.push(head.map((h, i) => (i === 0 ? h.padEnd(26) : lpad(h, 13))).join(''))
  for (const r of results) {
    const cells = [
      r.tickMeanMs.toFixed(4),
      ((r.tickMeanMs * 1000) / r.size).toFixed(2),
      r.npcsPerMs.toFixed(0),
      r.npcsPerMsP95.toFixed(0),
      r.planP99.toFixed(3),
      r.bytesPerFrame.toFixed(0),
      (r.bytesPerFrame / r.size).toFixed(0),
      String(r.gcCount),
      r.gcMs.toFixed(2)
    ]
    out.push(crowdName(r).padEnd(26) + cells.map(c => lpad(c, 13)).join(''))
  }
  return out.join('\n')
}
