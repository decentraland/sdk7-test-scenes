// The runs a recorder kept, and which one the debugger shows: the newest (follow) or one the user stepped to with
// Prev / Next (Decima's Previous / Next Log; upstream HTNDemo captures one decomposition and flags "NPC has
// replanned"). Pure, no SDK.
import type { PlanRun, PlanTraceRecorder } from '../htn-planner'
import { formatMs } from './timing'

/** Every run the recorder kept (its ring, its last top-level and last deferred run), oldest first. */
export function hostRuns(recorder: PlanTraceRecorder | null): PlanRun[] {
  if (!recorder) return []
  const out = recorder.runs.slice()
  for (const r of [recorder.lastPlan, recorder.lastDeferred]) if (r && !out.includes(r)) out.push(r)
  return out.sort((a, b) => a.seq - b.seq)
}

export interface RunPick {
  run: PlanRun | null
  /** Its position in `runs`, -1 without one. */
  index: number
  count: number
  /** Runs newer than the shown one: the host has planned since ("new plan"). */
  newer: number
  /** The shown run is the newest. */
  latest: boolean
}

/** The run to show: `pinned` is a run seq, null to follow the newest. A pinned run that fell out of the ring shows
 *  the oldest one kept. */
export function pickRun(runs: readonly PlanRun[], pinned: number | null): RunPick {
  const count = runs.length
  if (count === 0) return { run: null, index: -1, count, newer: 0, latest: true }
  let index = count - 1
  if (pinned !== null) {
    const at = runs.findIndex(r => r.seq === pinned)
    index = at >= 0 ? at : runs[0].seq > pinned ? 0 : count - 1
  }
  return { run: runs[index], index, count, newer: count - 1 - index, latest: index === count - 1 }
}

/** The seq to pin after stepping `delta` runs from the shown one; null when that is the newest (follow again). */
export function stepRun(runs: readonly PlanRun[], pinned: number | null, delta: number): number | null {
  const { index, count } = pickRun(runs, pinned)
  if (count === 0) return null
  const next = Math.max(0, Math.min(count - 1, index + delta))
  return next === count - 1 ? null : runs[next].seq
}

/**
 * One line about a run: `#12 behave · succeeded · 3 steps · 0.40 ms`, `&go_to` for a deferred expansion; its time
 * read against the clock's step (`<1 ms` on the Explorer's 1 ms clock, see timing.ts).
 */
export function runTitle(run: PlanRun, methodName: string, clockStep = 0): string {
  const what = run.deferred ? `&${methodName}` : methodName
  const steps = run.status === 'succeeded' ? ` · ${run.plan.length} step${run.plan.length === 1 ? '' : 's'}` : ''
  return `#${run.seq} ${what} · ${run.status ?? 'running'}${steps} · ${formatMs(run.ms, clockStep)}`
}
