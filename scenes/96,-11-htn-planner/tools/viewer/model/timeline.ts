// The session viewer's timeline: one track per agent (Gantt-like, as pddl-gantt and HTN Plan Player draw a plan in
// time): the spans its plans ran, the steps inside them, a ◆ per replan with its reason in words (the trigger said
// once, the facts that changed), a × where planning or a step failed. Clicking a ◆ opens its run and the plan diff
// against the plan it replaced (kept / dropped / new). A session without events (one Domain Runner plan) draws its
// runs as the replans. Pure, never throws.
import type { AgentLogEntry } from '../../../src/htn-planner/npc/history'
import type { ReplanEvent } from '../../../src/htn-planner/npc/actions'
import { changeSummary, readableReason, replanOutcome, withTrigger } from '../../../src/debugger/history-rows'
import { formatTask } from '../../../src/htn-planner/htn/atom'
import { literalLabel } from './format'
import type { AgentInfo, SessionIndex } from './session-index'
import { runTime } from './session-index'

export interface ReplanMarker {
  t: number
  /** A collapsed run of identical replans: the last one's time and how many. */
  until: number
  count: number
  /** replan: a plan was made (or kept); fail: planning found none. */
  kind: 'replan' | 'fail'
  /** Why, in words: `perception: nothing → sees tester`. */
  why: string
  /** What came of it: `new plan`, `same plan`, `running plan kept`, `running plan continued` (the domain planned `!continue`), `no_plan`. */
  outcome: string
  /** `+target_visible −last_seen`. */
  changes: string
  /** The same changes with their values, as labels: `+target_visible(tester, (-4.08, 0, -1.1))`, `−order(hold)`. */
  facts: string[]
  /** The plan it made, and the rest of the plan it replaced (absent: unknown). */
  plan: string[]
  previous?: string[]
  /** The belief upkeep's steps run before this plan (ReplanEvent.upkeep; GuardAgentOptions.reasoning), if any. */
  upkeep?: string[]
  kept: boolean
  /** The seq of the run it made (that agent's newest top-level run at its time), if the session has it. */
  run?: number
}

export interface StepSpan {
  t0: number
  t1: number
  label: string
  /** running: still on it when the session ends. */
  status: 'done' | 'failed' | 'cancelled' | 'running'
}

export interface PlanSpan {
  t0: number
  t1: number
  run?: number
  /** The plan's first step, `+N` more. */
  label: string
  steps: number
}

export interface Track {
  agent: string
  plans: PlanSpan[]
  steps: StepSpan[]
  markers: ReplanMarker[]
  /** Runs with no replan event of their own (deferred expansions, a planner without a history). */
  runs: { t: number; seq: number; ok: boolean; deferred: boolean }[]
}

export interface TimelineModel {
  t0: number
  t1: number
  tracks: Track[]
}

const EPS = 1e-6

/** The agent's newest top-level run at time t (the one a replan at t made). */
function runOf(agent: AgentInfo, t: number): number | undefined {
  let best: number | undefined
  for (const r of agent.runs) {
    if (runTime(r) > t + EPS) break
    if (!r.deferred && Math.abs(runTime(r) - t) <= EPS) best = r.seq
  }
  return best
}

/** A replan's fact changes (`+ (order chase)`, `- (order hold)`) as labels with their sign: `+order(chase)`, `−order(hold)`. */
export function factLabels(changes: readonly string[] | undefined): string[] {
  const out: string[] = []
  for (const c of changes ?? []) {
    const m = /^([+-]) (.*)$/s.exec(c.trim())
    if (m) out.push(`${m[1] === '+' ? '+' : '−'}${literalLabel(m[2], () => undefined)}`)
  }
  return out
}

function marker(agent: AgentInfo, e: AgentLogEntry & { event: ReplanEvent }): ReplanMarker {
  const r = e.event
  const m: ReplanMarker = {
    t: e.t,
    until: e.until ?? e.t,
    count: e.count ?? 1,
    kind: r.status === 'succeeded' ? 'replan' : 'fail',
    why: withTrigger(r.trigger, readableReason(r.reason ?? '')),
    outcome: replanOutcome(r),
    changes: changeSummary(r.changes),
    facts: factLabels(r.changes),
    plan: Array.isArray(r.plan) ? r.plan.slice() : [],
    kept: r.kept === true
  }
  if (Array.isArray(r.previous)) m.previous = r.previous.slice()
  if (Array.isArray(r.upkeep) && r.upkeep.length > 0) m.upkeep = r.upkeep.slice()
  const run = runOf(agent, m.until)
  if (run !== undefined) m.run = run
  return m
}

const planLabel = (plan: readonly string[]) => (plan.length === 0 ? 'empty plan' : plan.length === 1 ? plan[0] : `${plan[0]}  +${plan.length - 1}`)

function track(agent: AgentInfo, t1: number): Track {
  const markers: ReplanMarker[] = []
  const steps: StepSpan[] = []
  let open: StepSpan | null = null
  for (const e of agent.events) {
    const ev = e.event
    if (!ev) continue
    if (ev.type === 'replan') markers.push(marker(agent, e as AgentLogEntry & { event: ReplanEvent }))
    else if (ev.type === 'step') {
      if (open) open.t1 = e.t
      open = { t0: e.t, t1: t1, label: formatTask(ev.name, ev.args ?? []), status: 'running' }
      steps.push(open)
    } else if (ev.type === 'step_end' && open) {
      open.t1 = e.until ?? e.t
      open.status = ev.status === 'done' ? 'done' : ev.status === 'cancelled' ? 'cancelled' : 'failed'
      open = null
    }
  }
  const plans: PlanSpan[] = []
  const adopted = markers.filter(m => !m.kept)
  if (adopted.length > 0) {
    adopted.forEach((m, i) => {
      if (m.kind !== 'replan') return
      const end = i + 1 < adopted.length ? adopted[i + 1].t : t1
      const span: PlanSpan = { t0: m.t, t1: Math.max(m.t, end), label: planLabel(m.plan), steps: m.plan.length }
      if (m.run !== undefined) span.run = m.run
      plans.push(span)
    })
  }
  const withMarker = new Set(markers.map(m => m.run).filter((s): s is number => s !== undefined))
  const runs = agent.runs.filter(r => !withMarker.has(r.seq)).map(r => ({ t: runTime(r), seq: r.seq, ok: r.status === 'succeeded', deferred: r.deferred }))
  if (markers.length === 0) {
    // No events (a Domain Runner plan, a planner without a history): its top-level runs are the replans.
    const top = agent.runs.filter(r => !r.deferred)
    top.forEach((r, i) => {
      const end = i + 1 < top.length ? runTime(top[i + 1]) : t1
      if (r.status === 'succeeded') {
        const plan = r.plan.map(s => formatTask(s.name, s.args))
        plans.push({ t0: runTime(r), t1: Math.max(runTime(r), end), run: r.seq, label: planLabel(plan), steps: plan.length })
      }
    })
  }
  return { agent: agent.id, plans, steps, markers, runs }
}

export function timelineModel(index: SessionIndex): TimelineModel {
  return { t0: index.t0, t1: index.t1, tracks: index.agents.map(a => track(a, index.t1)) }
}

export interface PlanDiffRow {
  step: string
  /** kept: in both, in order; dropped: only in the plan it replaced; new: only in the new plan. */
  kind: 'kept' | 'dropped' | 'new'
}

/** The new plan against the rest of the old one, step by step (longest common subsequence), in reading order. */
export function planDiff(previous: readonly string[], next: readonly string[]): PlanDiffRow[] {
  const n = previous.length
  const m = next.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = previous[i] === next[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out: PlanDiffRow[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && previous[i] === next[j]) {
      out.push({ step: next[j], kind: 'kept' })
      i++
      j++
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      out.push({ step: next[j++], kind: 'new' })
    } else {
      out.push({ step: previous[i++], kind: 'dropped' })
    }
  }
  return out
}

/** Markers of all tracks by time, for stepping from one ◆ to the next. */
export function markerTimes(model: TimelineModel, agent?: string): number[] {
  const out: number[] = []
  for (const tr of model.tracks) if (agent === undefined || tr.agent === agent) for (const m of tr.markers) out.push(m.t)
  return [...new Set(out)].sort((a, b) => a - b)
}
