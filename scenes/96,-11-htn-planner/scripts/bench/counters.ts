// The structural-counter gate: what the planner does, counted, never timed. For every bench scenario (suite.ts) a
// few plans with PlannerOptions.stats: the counters summed, the status, the plan and the peak call frames. For the
// seeded level runs (the crowd of level 9 with and without a plans-per-frame budget, and every playground level) the
// counters summed over all agents and plans. No wall clock decides anything here (planBudgetMs crowds are left out), so
// the same code gives the same file on every machine: test/htn/planner/perf-gate.test.ts fails on any difference with
// benchmarks/counters.baseline.json, and `npm run htn:bench -- --update-counters` rewrites it on purpose.
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { formatTask, newPlanStats, PlanRunner, type PlanBudgetOptions, type PlanStats } from '../../src/htn-planner'
import { LEVELS } from '../../src/playgrounds'
import { CrowdLevel } from '../../src/playground/levels/crowd'
import { LEVEL_DT, type LevelSim } from '../../src/playground/sim'
import type { CountersFile, Json } from './compare'
import { benchCases } from './suite'

export const COUNTERS_BASELINE = 'benchmarks/counters.baseline.json'

/** Plans per bench scenario: more than one, so a runner that carries state from plan to plan shows. */
export const PLANS_PER_SCENARIO = 3
/** Simulated seconds of each crowd run (the bench's), and of each playground level (its first minute). */
export const CROWD_SECONDS = 120
export const LEVEL_SECONDS = 60

const ABOUT =
  'Structural counters of the HTN planner (PlannerOptions.stats), deterministic: test/htn/planner/perf-gate.test.ts ' +
  'fails on any difference. Rewrite on purpose with npm run htn:bench -- --update-counters (scripts/bench/counters.ts).'

const statsJson = (s: PlanStats): { [key: string]: Json } => ({ ...s })

function addStats(into: PlanStats, s: Readonly<PlanStats>): void {
  for (const k of Object.keys(into) as (keyof PlanStats)[]) into[k] += s[k]
}

/** One bench scenario: PLANS_PER_SCENARIO plans on one counting runner. */
function scenarioCounters(c: ReturnType<typeof benchCases>[number]): { [key: string]: Json } {
  const world = c.world()
  const stats = newPlanStats()
  const runner = new PlanRunner(c.domain, world, { ...(c.options?.(world) ?? {}), stats })
  const total = newPlanStats()
  const statuses: string[] = []
  let peak = 0
  for (let i = 0; i < PLANS_PER_SCENARIO; i++) {
    statuses.push(runner.plan(c.method, c.args ?? []))
    addStats(total, stats)
    peak = Math.max(peak, runner.executionInfo.peakCallFrames)
  }
  return {
    plans: PLANS_PER_SCENARIO,
    status: [...new Set(statuses)].join(' / '),
    plan: runner.steps.map(s => formatTask(s.name, s.args)),
    peakCallFrames: peak,
    stats: statsJson(total)
  }
}

/**
 * A seeded level run: `seconds` at LEVEL_DT, every agent counting; its agents' plans, steps and counters summed.
 * `record`: the levels' trace recorders (as in the scene; they never change what is planned), off for the crowds.
 */
export function levelCounters(level: LevelSim, seconds: number, record = true): { [key: string]: Json } {
  level.recordTraces = record
  level.countStats = true
  level.init()
  level.advanceTime(seconds)
  const total = newPlanStats()
  let plansMade = 0
  let tasksCompleted = 0
  let checksMade = 0
  let reasoningMade = 0
  let budgetDeferred = 0
  let peak = 0
  for (const m of level.crew) {
    const metrics = m.agent.metrics
    plansMade += metrics.plansMade
    tasksCompleted += metrics.tasksCompleted
    checksMade += metrics.checksMade
    reasoningMade += metrics.reasoningMade
    budgetDeferred += metrics.budgetDeferred
    peak = Math.max(peak, metrics.maxPeakCallFrames)
    if (metrics.totalStats) addStats(total, metrics.totalStats)
  }
  const out: { [key: string]: Json } = {
    seconds,
    dt: Number(LEVEL_DT.toFixed(6)),
    npcs: level.crew.length,
    plansMade,
    tasksCompleted,
    checksMade,
    budgetDeferred,
    peakCallFrames: peak,
    checksPassed: level.checkLog.filter(c => c.state === 'pass').length,
    checksFailed: level.checkLog.filter(c => c.state === 'fail').length,
    stats: statsJson(total)
  }
  // Belief upkeep planner calls (GuardAgentOptions.reasoning): only where an agent has it, so the other rows stay as
  // they were. Their structural counters are the bench scenarios' (suite.ts, '... upkeep').
  if (reasoningMade > 0) out.reasoningMade = reasoningMade
  return out
}

/** The crowd runs the bench times whose counters do not depend on the clock: sizes 10 / 25 / 50, no budget and 3/f. */
const CROWDS: { size: number; budget: PlanBudgetOptions | null }[] = [10, 25, 50].flatMap(size => [
  { size, budget: null },
  { size, budget: { maxPlansPerFrame: 3 } }
])

export function collectCounters(): CountersFile {
  const scenarios: CountersFile['scenarios'] = {}
  for (const c of benchCases()) scenarios[c.name] = scenarioCounters(c)
  const runs: CountersFile['runs'] = {}
  for (const { size, budget } of CROWDS) {
    runs[`crowd ${size} npcs${budget ? ` ${budget.maxPlansPerFrame}/f` : ''}`] = levelCounters(new CrowdLevel(size, budget), CROWD_SECONDS, false)
  }
  for (const p of LEVELS) {
    const level = p.make()
    runs[`level ${level.info.number} ${level.info.id}`] = levelCounters(level, LEVEL_SECONDS)
  }
  return { about: ABOUT, version: 1, scenarios, runs }
}

export function readCounters(root: string): CountersFile | null {
  const path = nodePath.join(root, COUNTERS_BASELINE)
  return fs.existsSync(path) ? (JSON.parse(fs.readFileSync(path, 'utf8')) as CountersFile) : null
}

export function writeCounters(root: string, file: CountersFile): string {
  const path = nodePath.join(root, COUNTERS_BASELINE)
  fs.mkdirSync(nodePath.dirname(path), { recursive: true })
  fs.writeFileSync(path, JSON.stringify(file, null, 2) + '\n')
  return path
}
