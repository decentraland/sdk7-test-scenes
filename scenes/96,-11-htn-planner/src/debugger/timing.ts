// Planning times on the scene's clock. In the Explorer performance.now() is Date.now(): it moves in 1 ms steps and a
// plan takes well under 1 ms, so one reading is 0 (or 1 when a tick fell inside it). Such a reading says "<1 ms";
// the mean over many plans (total / plans) is unbiased on a stepped clock, so it is the figure to read. Pure.
import type { PlanningMetrics } from '../htn-planner'

/** The smallest step `clock` moves by (sampled between two of its changes); Infinity if it never moves. */
export function clockStep(clock: () => number, samples = 3, maxSpins = 1_000_000): number {
  let best = Infinity
  for (let s = 0; s < samples; s++) {
    const a = clock()
    let b = a
    for (let i = 0; i < maxSpins && b === a; i++) b = clock()
    if (b === a) return Infinity
    let c = b
    for (let i = 0; i < maxSpins && c === b; i++) c = clock()
    if (c === b) return Infinity
    best = Math.min(best, c - b)
  }
  return Math.round(best * 1e6) / 1e6
}

const coarse = (step: number) => step >= 0.5

/** One reading of `step`'s clock: "<1 ms" below a coarse step, whole ms on it; two decimals on a fine clock. */
export function formatMs(ms: number, step: number): string {
  if (coarse(step)) return ms < step ? `<${step} ms` : `${Math.round(ms)} ms`
  return ms < 10 ? `${ms.toFixed(2)} ms` : `${Math.round(ms)} ms`
}

/** The header's times: the mean over every plan, then the last and the longest reading. */
export function planTimes(
  m: Pick<PlanningMetrics, 'lastPlanMs' | 'totalPlanMs' | 'maxPlanMs' | 'plansMade'>,
  step: number
): string {
  if (m.plansMade === 0) return 'no plan yet'
  const mean = m.totalPlanMs / m.plansMade
  const clock = coarse(step) ? ` (${step} ms clock)` : ''
  return `mean ${mean.toFixed(mean < 0.1 ? 3 : 2)} ms · last ${formatMs(m.lastPlanMs, step)} · max ${formatMs(m.maxPlanMs, step)}${clock}`
}

/** The header's budget part: replans a shared plan budget made wait (GuardAgentOptions.planBudget); '' if none. */
export function budgetWaits(m: Partial<Pick<PlanningMetrics, 'budgetDeferred' | 'budgetMaxWaitFrames'>>): string {
  const n = m.budgetDeferred ?? 0
  return n === 0 ? '' : `budget: waited ${n}× · max ${m.budgetMaxWaitFrames ?? 0} fr`
}

/** `performance` is not in the scene's type libraries; Node has it, the Explorer a Date.now() shim. */
declare const performance: { now(): number } | undefined

/** The clock the planner hosts time plans with (GuardAgent's default). */
export const sceneClock = (): number => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now())

let measured: number | null = null

/** The scene clock's step, measured once (a few ms of spinning on a 1 ms clock). */
export function sceneClockStep(): number {
  if (measured === null) measured = clockStep(sceneClock)
  return measured
}
