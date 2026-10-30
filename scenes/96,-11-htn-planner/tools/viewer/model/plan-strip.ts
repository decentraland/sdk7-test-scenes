// The plan strip of the session viewer: a run's plan as steps, and on replay where the agent was in it at the cursor
// (done ✓ / running ▶ / upcoming ·, failed ×, cut short when a replan replaced it): its `step` and `step_end` events
// after the run, matched to the plan's steps in order, until a replan that did not keep it. Upstream HTNDemo marks
// the current step with `>` (HTNNPCSimulationPanel.cpp); HTN Plan Player colours done / running / upcoming. Pure.
import { formatTask } from '../../../src/htn-planner/htn/atom'
import type { PlanRun } from '../../../src/htn-planner/htn/trace'
import type { AgentLogEntry } from '../../../src/htn-planner/npc/history'
import { committedSteps } from '../../../src/debugger/plan-path'
import { stepLabel } from './format'

export type StepState = 'done' | 'running' | 'upcoming' | 'failed' | 'cut'

export interface StripStep {
  label: string
  /** As the agent logs it (formatTask), for matching. */
  text: string
  state: StepState
  /** When it started / ended, if it did by the cursor. */
  start?: number
  end?: number
  deferred: boolean
}

const EPS = 1e-6

/**
 * The run's steps at time `cursor` from the agent's events. Without events (one Domain Runner plan), every step is
 * upcoming. A step the agent started that is not the plan's next one ends the matching (another plan runs).
 */
export function planStrip(run: PlanRun, events: readonly AgentLogEntry[], cursor: number): StripStep[] {
  const steps: StripStep[] = run.plan.map(s => ({
    label: stepLabel(s.name, s.args),
    text: formatTask(s.name, s.args),
    state: 'upcoming',
    deferred: s.kind === 'deferred'
  }))
  const t0 = run.t
  if (t0 === undefined || steps.length === 0) return steps
  let next = 0
  let current: StripStep | null = null
  let ownReplan = false
  for (const e of events) {
    const ev = e.event
    if (!ev || e.t < t0 - EPS) continue
    if (e.t > cursor + EPS) break
    if (ev.type === 'replan') {
      if (!ownReplan && Math.abs(e.t - t0) <= EPS) {
        ownReplan = true
        continue
      }
      if (ev.kept) continue
      // Another plan replaced this one: what was running is cut, the rest never ran.
      if (current) {
        current.state = 'cut'
        current.end = e.t
      }
      return steps
    }
    if (ev.type === 'step') {
      const step = steps[next]
      if (!step || step.text !== formatTask(ev.name, ev.args ?? [])) {
        if (e.t > t0 + EPS || next > 0) return steps
        continue // a step of the plan before, on the same tick
      }
      step.state = 'running'
      step.start = e.t
      current = step
      next++
    } else if (ev.type === 'step_end' && current) {
      current.end = e.until ?? e.t
      current.state = ev.status === 'done' ? 'done' : ev.status === 'cancelled' ? 'cut' : 'failed'
      const failed = current.state !== 'done'
      current = null
      if (failed) return steps
    }
  }
  return steps
}

/** The strip's states by the run's task node that made each step (to colour the steps of the tree on replay). */
export function stepStatesByNode(run: PlanRun, strip: readonly StripStep[]): Map<number, StepState> {
  const out = new Map<number, StepState>()
  try {
    committedSteps(run).forEach((s, i) => {
      if (strip[i]) out.set(s.node, strip[i].state)
    })
  } catch {
    // a malformed run: no states
  }
  return out
}
