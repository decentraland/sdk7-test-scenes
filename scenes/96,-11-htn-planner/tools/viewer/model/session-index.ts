// A DebugSession read for the viewer: its agents (each with its own domain graph, runs and events, oldest first),
// the time range, and the run an agent was on at a time. A session without times (one Domain Runner plan) gets its
// runs' order as their time, so one cursor drives every session alike. Pure, never throws.
import type { DomainGraph } from '../../../src/htn-planner/htn/domain-graph'
import type { DebugSession, SessionRun } from '../../../src/htn-planner/debug/session'
import { sessionGraph } from '../../../src/htn-planner/debug/session'
import type { AgentLogEntry } from '../../../src/htn-planner/npc/history'

export interface AgentInfo {
  id: string
  graph: DomainGraph
  /** Its runs by time (then seq). */
  runs: SessionRun[]
  /** Its events, oldest first. */
  events: AgentLogEntry[]
}

export interface SessionIndex {
  session: DebugSession
  agents: AgentInfo[]
  /** Earliest and latest time of any run or event (equal for a single moment). */
  t0: number
  t1: number
  /** The runs carry host times; false: times are the runs' order (0, 1, 2...). */
  timed: boolean
}

/** A run's time in the index: its host time, or its place for an untimed session (set by indexSession). */
export function runTime(run: SessionRun): number {
  return run.t ?? 0
}

export function indexSession(session: DebugSession): SessionIndex {
  const timed = session.runs.length === 0 || session.runs.every(r => typeof r.t === 'number')
  const runs: SessionRun[] = timed ? session.runs.slice() : session.runs.map((r, i) => ({ ...r, t: i }))
  const order: string[] = []
  const add = (id: string) => {
    if (!order.includes(id)) order.push(id)
  }
  for (const r of runs) add(r.agent)
  for (const e of session.timeline) if (e.event && typeof e.event.guard === 'string') add(e.event.guard)
  const agents: AgentInfo[] = order.map(id => ({
    id,
    graph: sessionGraph(session, id),
    runs: runs.filter(r => r.agent === id).sort((a, b) => runTime(a) - runTime(b) || a.seq - b.seq),
    events: session.timeline.filter(e => e.event && e.event.guard === id)
  }))
  let t0 = Infinity
  let t1 = -Infinity
  const see = (t: number | undefined) => {
    if (typeof t !== 'number' || !Number.isFinite(t)) return
    t0 = Math.min(t0, t)
    t1 = Math.max(t1, t)
  }
  for (const r of runs) see(r.t)
  for (const e of session.timeline) {
    see(e.t)
    see(e.until)
  }
  if (t0 === Infinity) t0 = t1 = 0
  return { session, agents, t0, t1, timed }
}

/** The top-level run an agent planned last at time `t` (a deferred run only when it has nothing else), or its first. */
export function runAt(agent: AgentInfo, t: number): SessionRun | undefined {
  let best: SessionRun | undefined
  let deferred: SessionRun | undefined
  for (const r of agent.runs) {
    if (runTime(r) > t + 1e-9) break
    if (r.deferred) deferred = r
    else best = r
  }
  return best ?? deferred ?? agent.runs[0]
}

/** The run with this seq, if the agent has it. */
export function runBySeq(agent: AgentInfo, seq: number): SessionRun | undefined {
  return agent.runs.find(r => r.seq === seq)
}
