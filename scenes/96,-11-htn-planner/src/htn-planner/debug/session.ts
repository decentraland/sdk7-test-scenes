// DebugSession: one plain-JSON bundle of everything a debugger view reads, so the in-scene UI and a later web view
// (docs/htn-guidance.md, Debugging, section 5) share one data model:
// - the domain graph (htn/domain-graph.ts);
// - the worlds the runs planned against (one snapshot per WorldState revision) and the diffs between them;
// - plan runs with upstream's node lists (htn/trace.ts), per agent;
// - the execution timeline (npc/history.ts; replans carry their trigger, the fact changes and whether the plan
//   changed) and the planner metrics per agent;
// - per agent given its world: facts now vs what its plan expects (htn/plan-drift.ts);
// - agents planning on another domain than the session's (a squad planner beside its guards): those graphs too.
// Pure: built from recorders and histories the host already keeps.
import { domainGraph } from '../htn/domain-graph'
import type { DomainGraph } from '../htn/domain-graph'
import type { DomainIR } from '../htn/ir'
import { planDrift, PlanDrift } from '../htn/plan-drift'
import type { PlanRun, PlanTraceRecorder } from '../htn/trace'
import { WorldDiff, worldDiff, WorldSnapshot, WorldState } from '../htn/world-state'
import type { PlanningMetrics } from '../npc/agent'
import type { AgentHistory, AgentLogEntry } from '../npc/history'

export const DEBUG_SESSION_VERSION = 1

/** A plan run and the agent that made it. */
export interface SessionRun extends PlanRun {
  agent: string
}

/** A world snapshot of one agent (each agent plans against its own WorldState; revisions are per world). */
export interface SessionWorld extends WorldSnapshot {
  agent: string
}

export interface SessionDiff extends WorldDiff {
  agent: string
}

export interface DebugSession {
  version: typeof DEBUG_SESSION_VERSION
  domain: DomainGraph
  /** Per agent, oldest first: every revision a kept run planned against (SessionRun.world). */
  worlds: SessionWorld[]
  /** Between consecutive worlds of an agent: what a view marks + / - / ~. */
  diffs: SessionDiff[]
  /** Every kept run, by host time (PlanRun.t) when stamped, else per agent in order. */
  runs: SessionRun[]
  /**
   * Agent events, oldest first by their first time. A run of identical events is one entry with `count` and `until`
   * (npc/history.ts); an entry without them is one event (entryCount), so version 1 files read the same.
   */
  timeline: AgentLogEntry[]
  metrics: Record<string, PlanningMetrics>
  /**
   * Per agent that gave its world: the newest succeeded top-level run's chosen path re-checked against that world as
   * it is when the session is built (`run`: that run's seq). Absent when no agent gave one (version 1 unchanged).
   */
  drift?: Record<string, PlanDrift & { run: number }>
  /**
   * The graphs of the agents whose recorder plans on another domain than `domain` (a squad planner beside its
   * guards), and which agent plans on which (`agentDomains`: agent id -> graph name). Absent when every agent plans
   * on `domain` (version 1 unchanged). Read an agent's graph with sessionGraph.
   */
  domains?: DomainGraph[]
  agentDomains?: Record<string, string>
}

/** The domain graph an agent of the session plans on: its own (DebugSession.domains) or the session's. */
export function sessionGraph(session: DebugSession, agent: string): DomainGraph {
  const name = session.agentDomains?.[agent]
  if (name === undefined) return session.domain
  return session.domains?.find(d => d.name === name) ?? session.domain
}

export interface SessionAgent {
  id: string
  recorder: PlanTraceRecorder
  metrics?: PlanningMetrics
  /** Its world now, for `drift`. */
  world?: WorldState
}

/** The newest succeeded top-level run a recorder kept: the plan the agent is most likely running. */
export function latestPlan(recorder: PlanTraceRecorder): PlanRun | undefined {
  const runs = [...recorder.runs]
  if (recorder.lastPlan && !runs.includes(recorder.lastPlan)) runs.push(recorder.lastPlan)
  let best: PlanRun | undefined
  for (const r of runs) if (!r.deferred && r.status === 'succeeded' && (!best || r.seq > best.seq)) best = r
  return best
}

export interface SessionInput {
  domain: DomainIR
  agents: readonly SessionAgent[]
  /** Shared or per-agent histories (an AgentHistory, or anything that lists entries); merged by time. */
  histories?: readonly Pick<AgentHistory, 'toArray'>[]
}

/** Gather a session from the recorders and histories the host keeps. Snapshots and nodes are shared, not copied. */
export function buildSession(input: SessionInput): DebugSession {
  const worlds: SessionWorld[] = []
  const diffs: SessionDiff[] = []
  const runs: SessionRun[] = []
  const metrics: Record<string, PlanningMetrics> = {}
  let drift: DebugSession['drift']
  const domains: DomainGraph[] = []
  const agentDomains: Record<string, string> = {}
  for (const a of input.agents) {
    const own = a.recorder.domain
    if (own !== input.domain) {
      const graph = domainGraph(own)
      if (!domains.includes(graph)) domains.push(graph)
      agentDomains[a.id] = graph.name
    }
    if (a.world) {
      const run = latestPlan(a.recorder)
      if (run) (drift ??= {})[a.id] = { run: run.seq, ...planDrift(a.recorder.domain, run, a.world) }
    }
    const snapshots = a.recorder.worlds
    snapshots.forEach((w, i) => {
      worlds.push({ ...w, agent: a.id })
      if (i > 0) diffs.push({ ...worldDiff(snapshots[i - 1], w), agent: a.id })
    })
    const seen = new Set<PlanRun>()
    for (const run of [...a.recorder.runs, a.recorder.lastPlan, a.recorder.lastDeferred]) {
      if (run === null || seen.has(run)) continue
      seen.add(run)
      runs.push({ ...run, agent: a.id })
    }
    if (a.metrics) metrics[a.id] = { ...a.metrics }
  }
  runs.sort((x, y) => (x.t !== undefined && y.t !== undefined && x.t !== y.t ? x.t - y.t : 0) || (x.agent === y.agent ? x.seq - y.seq : 0))
  const timeline = (input.histories ?? []).flatMap(h => h.toArray()).sort((x, y) => x.t - y.t)
  const session: DebugSession = {
    version: DEBUG_SESSION_VERSION,
    domain: domainGraph(input.domain),
    worlds,
    diffs,
    runs,
    timeline,
    metrics
  }
  if (drift) session.drift = drift
  if (domains.length > 0) {
    session.domains = domains
    session.agentDomains = agentDomains
  }
  return session
}

/**
 * Load a DebugSession written as JSON (`npm run htn:run -- ... --session out.json`, or JSON.stringify of
 * buildSession): checks the version and the shape a view reads, so a wrong file fails here with a clear message
 * rather than in a view. Throws an Error naming what is wrong.
 */
export function parseSession(input: string | unknown): DebugSession {
  let data: unknown = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch (e) {
      throw new Error(`not a DebugSession: invalid JSON (${(e as Error).message})`)
    }
  }
  const fail = (what: string): never => {
    throw new Error(`not a DebugSession: ${what}`)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return fail('not a JSON object')
  const o = data as Record<string, unknown>
  if (o.version !== DEBUG_SESSION_VERSION) return fail(`version ${JSON.stringify(o.version)}, expected ${DEBUG_SESSION_VERSION}`)
  const domain = o.domain as Record<string, unknown> | undefined
  if (typeof domain !== 'object' || domain === null || typeof domain.name !== 'string' || !Array.isArray(domain.methods)) return fail('no domain graph')
  for (const key of ['worlds', 'diffs', 'runs', 'timeline'] as const) if (!Array.isArray(o[key])) fail(`'${key}' is not a list`)
  if (typeof o.metrics !== 'object' || o.metrics === null) fail(`'metrics' is not an object`)
  if (o.domains !== undefined && !Array.isArray(o.domains)) fail(`'domains' is not a list`)
  ;(o.runs as unknown[]).forEach((r, i) => {
    const run = r as Record<string, unknown>
    if (typeof run !== 'object' || run === null || typeof run.agent !== 'string' || !Array.isArray(run.nodes) || !Array.isArray(run.plan))
      fail(`run ${i} has no agent, nodes or plan`)
  })
  return data as DebugSession
}
