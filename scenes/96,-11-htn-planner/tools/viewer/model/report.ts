// The session viewer as text, for an AI agent (`npm run htn:view -- <session.json> --text`): what the page shows,
// read off the same view model (session index, timeline, plan diff, refinement tree, plan strip, world view), as a
// short, stable, greppable report. A header (domains, agents, time, runs, failures); per agent one line per replan
// (its trigger and reason, the facts that changed with their values, the plan against the one it replaced), per
// failed step and per run no replan made, identical lines collapsed to ×N; then the runs chosen (by default each
// agent's last run and every failed run) as an outline of the refinement tree in the page's notation, the plan at
// the cursor and the world it planned against. No wall-clock times (the measured ms), so the same seed gives the same
// text. `sessionReport` builds the data (`--json` prints it), `reportText` the text. Pure.
import type { DebugSession, SessionRun } from '../../../src/htn-planner/debug/session'
import { sessionGraph } from '../../../src/htn-planner/debug/session'
import { stepLabel, stepText } from './format'
import type { CondLine, FailureCause, FigNode, FigStatus } from './plan-tree'
import { failureCause, figNodes, planTree } from './plan-tree'
import { planStrip } from './plan-strip'
import type { StepState, StripStep } from './plan-strip'
import { indexSession, runAt, runBySeq, runTime } from './session-index'
import type { AgentInfo, SessionIndex } from './session-index'
import { planDiff, timelineModel } from './timeline'
import type { PlanDiffRow, ReplanMarker, Track } from './timeline'
import { worldView } from './world-view'
import type { WorldView } from './world-view'

export interface ReportOptions {
  /** Only these agents (timeline and runs). */
  agents?: readonly string[]
  /** One run: an agent and its run's seq (`--run a:7`). */
  run?: { agent: string; seq: number }
  /** The run each agent was on at this time, the plan strip at it (`--at 12.5`). */
  at?: number
  /** Verbose card lines (every attempt as recorded) and every fold open. */
  verbose?: boolean
  /** Every world row, not only the changed ones and those of the tables the planner read. */
  worldAll?: boolean
  /** The session file's name, for the header. */
  source?: string
}

export interface AgentSummary {
  id: string
  domain: string
  runs: number
  /** Its replan events (a collapsed one counted N times); 0 for a planner without a history (the Domain Runner). */
  replans: number
  failedRuns: number
  failedSteps: number
}

export interface ReportHeader {
  source?: string
  /** Each domain and the agents planning on it, in the agents' order. */
  domains: { name: string; agents: string[] }[]
  agents: AgentSummary[]
  /** The runs carry host times; false: a run's time is its place (0, 1, 2...). */
  timed: boolean
  t0: number
  t1: number
}

export type LineKind = 'replan' | 'kept' | 'fail' | 'step' | 'run' | 'deferred'

/** One line of an agent's timeline; identical consecutive lines are one with `count` and the last one's time. */
export interface TimelineLine {
  t: number
  until: number
  count: number
  kind: LineKind
  /** The run it made (the first of a collapsed line) and the last one's. */
  run?: number
  lastRun?: number
  text: string
}

export interface AgentTimeline {
  agent: string
  lines: TimelineLine[]
}

export type RunPick = 'selected' | 'at' | 'last' | 'failed'

export interface RunReport {
  agent: string
  seq: number
  t: number
  status: string
  deferred: boolean
  /** Why it is in the report: asked for (`--run`, `--at`), the agent's last run, a failed run. */
  picked: RunPick[]
  /** The ◆ that made it: why, in words, the outcome, the facts that changed, the plan diff (absent: no previous plan). */
  why?: { text: string; outcome: string; facts: string[]; diff?: PlanDiffRow[]; upkeep?: string[] }
  /** A failed run: the last branch that failed and its failing term. */
  failure?: FailureCause
  tree: FigNode | null
  /** The plan at the cursor (`events`: false when the agent logged none, so no step has a state). */
  cursor: number
  events: boolean
  plan: StripStep[]
  world: WorldView | null
}

export interface SessionReport {
  header: ReportHeader
  timelines: AgentTimeline[]
  runs: RunReport[]
}

/** Glyphs, as the page draws them. */
export const STATUS_GLYPH: Record<FigStatus, string> = {
  chosen: '✓',
  failed: '×',
  backtracked: '↶',
  untried: '·',
  running: '▶'
}
export const STEP_GLYPH: Record<StepState, string> = { done: '✓', running: '▶', upcoming: '·', failed: '×', cut: '✂' }

/** Facts listed on a timeline line before `+N more`; plan steps likewise. */
export const MAX_FACTS = 6
export const MAX_STEPS = 4

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function listCapped(items: readonly string[], max: number, sep: string): string {
  if (items.length <= max) return items.join(sep)
  return `${items.slice(0, max).join(sep)}${sep}+${items.length - max} more`
}

/** A failure in one phrase: `patrol(1) × walk_route: has_route(1) — no rows`. */
export function causeText(c: FailureCause): string {
  const line = c.line ? `: ${c.line.text}${c.line.note ? ` — ${c.line.note}` : ''}` : ': a subtask failed'
  return `${c.task} × ${c.branch}${line}`
}

/** The plan a ◆ made against the rest of the one it replaced. */
function planPhrase(m: ReplanMarker, failure: FailureCause | null): string {
  if (m.kind === 'fail') return `plan: none (${m.outcome})${failure ? `: ${causeText(failure)}` : ''}`
  if (m.kept) return `plan: ${m.outcome}`
  const steps = m.plan.map(stepText)
  const list = steps.length ? `: ${listCapped(steps, MAX_STEPS, ', ')}` : ''
  if (m.outcome === 'same plan') return `plan: same (${plural(steps.length, 'step')})`
  if (!m.previous) return `plan: new ${steps.length}${list}`
  const d = planDiff(m.previous, m.plan)
  const n = (k: PlanDiffRow['kind']) => d.filter(r => r.kind === k).length
  return `plan: kept ${n('kept')} / dropped ${n('dropped')} / new ${n('new')}${list}`
}

function treeOf(run: SessionRun, agent: AgentInfo, verbose: boolean): FigNode | null {
  try {
    const root = planTree(run, agent.graph, { mode: verbose ? 'verbose' : 'normal' })
    if (root && verbose) for (const n of figNodes(root)) n.open = true
    return root
  } catch {
    return null
  }
}

function causeOf(run: SessionRun, agent: AgentInfo): FailureCause | null {
  if (run.status === 'succeeded') return null
  const root = treeOf(run, agent, false)
  return root ? failureCause(root) : null
}

function trackLines(track: Track, agent: AgentInfo): TimelineLine[] {
  const lines: TimelineLine[] = []
  for (const m of track.markers) {
    const run = m.run !== undefined ? runBySeq(agent, m.run) : undefined
    const failure = m.kind === 'fail' && run ? causeOf(run, agent) : null
    const glyph = m.kind === 'fail' ? '×' : m.kept ? '◇' : '◆'
    const facts = m.facts.length ? `  Δ ${listCapped(m.facts, MAX_FACTS, ' ')}` : ''
    const upkeep = m.upkeep ? `  upkeep: ${m.upkeep.map(stepText).join(', ')}` : ''
    const line: TimelineLine = {
      t: m.t,
      until: m.until,
      count: m.count,
      kind: m.kind === 'fail' ? 'fail' : m.kept ? 'kept' : 'replan',
      text: `${glyph} ${m.why}${facts}${upkeep}  ${planPhrase(m, failure)}`
    }
    if (m.run !== undefined) line.run = m.run
    lines.push(line)
  }
  for (const s of track.steps) if (s.status === 'failed') lines.push({ t: s.t1, until: s.t1, count: 1, kind: 'step', text: `× step ${stepText(s.label)} failed` })
  for (const r of track.runs) {
    const run = runBySeq(agent, r.seq)
    if (!run) continue
    const title = treeOf(run, agent, false)?.title ?? '?'
    const failure = r.ok ? null : causeOf(run, agent)
    const steps = run.plan.length
    const plan = r.ok ? `plan: ${plural(steps, 'step')}${steps ? `: ${listCapped(run.plan.map(p => stepLabel(p.name, p.args)), MAX_STEPS, ', ')}` : ''}` : `plan: none (${run.status})${failure ? `: ${causeText(failure)}` : ''}`
    lines.push({
      t: r.t,
      until: r.t,
      count: 1,
      kind: r.deferred ? 'deferred' : 'run',
      run: r.seq,
      text: `${r.ok ? (r.deferred ? '&' : '✓') : '×'} ${r.deferred ? `${title} expanded` : title}  ${plan}`
    })
  }
  // In time order; on one time, a failed step first (it causes the replan), then the runs in the order planned.
  lines.sort((a, b) => a.t - b.t || (a.run ?? -1) - (b.run ?? -1))
  // Identical consecutive lines (a loop: the same replan, the same expansion) are one, ×N.
  const out: TimelineLine[] = []
  for (const l of lines) {
    const prev = out[out.length - 1]
    if (prev && prev.kind === l.kind && prev.text === l.text) {
      prev.count += l.count
      prev.until = l.until
      if (l.run !== undefined) prev.lastRun = l.run
    } else out.push({ ...l })
  }
  return out
}

function agentSummary(session: DebugSession, a: AgentInfo, track: Track): AgentSummary {
  return {
    id: a.id,
    domain: sessionGraph(session, a.id).name,
    runs: a.runs.length,
    replans: track.markers.reduce((n, m) => n + m.count, 0),
    failedRuns: a.runs.filter(r => r.status !== 'succeeded').length,
    failedSteps: track.steps.filter(s => s.status === 'failed').length
  }
}

function runReport(index: SessionIndex, a: AgentInfo, track: Track, run: SessionRun, picked: RunPick[], cursor: number, opts: ReportOptions): RunReport {
  const r: RunReport = {
    agent: a.id,
    seq: run.seq,
    t: runTime(run),
    status: run.status ?? 'running',
    deferred: run.deferred,
    picked,
    tree: treeOf(run, a, opts.verbose === true),
    cursor,
    events: a.events.length > 0,
    plan: planStrip(run, a.events, cursor),
    world: null
  }
  let m: ReplanMarker | undefined
  for (const k of track.markers) if (k.run === run.seq) m = k
  if (m) {
    r.why = { text: m.why, outcome: m.outcome, facts: m.facts.slice() }
    if (m.upkeep) r.why.upkeep = m.upkeep.map(stepText)
    if (m.previous && !m.kept && m.kind === 'replan') r.why.diff = planDiff(m.previous, m.plan)
  }
  const failure = causeOf(run, a)
  if (failure) r.failure = failure
  try {
    r.world = worldView(index.session, a.id, run.world, run, a.graph)
  } catch {
    r.world = null
  }
  return r
}

/** What `--agent`, `--run` or `--at` name that the session does not have, in words; null when all is there. */
export function reportOptionError(session: DebugSession, opts: ReportOptions): string | null {
  const index = indexSession(session)
  const ids = index.agents.map(a => a.id)
  const known = `agents: ${ids.map(id => (/[\s:]/.test(id) ? JSON.stringify(id) : id)).join(', ')}`
  for (const id of [...(opts.agents ?? []), ...(opts.run ? [opts.run.agent] : [])]) if (!ids.includes(id)) return `no agent '${id}' in this session (${known})`
  if (opts.run) {
    const a = index.agents.find(x => x.id === opts.run!.agent)!
    if (!runBySeq(a, opts.run.seq)) return `${a.id} has no run ${opts.run.seq} (its runs: ${a.runs.length ? `${a.runs[0].seq}..${a.runs[a.runs.length - 1].seq}` : 'none'})`
  }
  return null
}

/** The report's data. Options naming what the session lacks select nothing (reportOptionError says what). */
export function sessionReport(session: DebugSession, opts: ReportOptions = {}): SessionReport {
  const index = indexSession(session)
  const timeline = timelineModel(index)
  const tracks = new Map(timeline.tracks.map(t => [t.agent, t]))
  const want = (id: string) => !opts.agents || opts.agents.length === 0 || opts.agents.includes(id) || opts.run?.agent === id
  const agents = index.agents.filter(a => want(a.id) && (!opts.run || opts.run.agent === a.id))
  const domains: ReportHeader['domains'] = []
  const summaries = index.agents.map(a => agentSummary(session, a, tracks.get(a.id)!))
  for (const s of summaries) {
    const d = domains.find(x => x.name === s.domain)
    if (d) d.agents.push(s.id)
    else domains.push({ name: s.domain, agents: [s.id] })
  }
  const header: ReportHeader = {
    domains,
    agents: summaries.filter(s => want(s.id)),
    timed: index.timed,
    t0: index.t0,
    t1: index.t1
  }
  if (opts.source !== undefined) header.source = opts.source
  const timelines = agents.map(a => ({ agent: a.id, lines: trackLines(tracks.get(a.id)!, a) }))
  const runs: RunReport[] = []
  for (const a of agents) {
    const track = tracks.get(a.id)!
    const picks = new Map<SessionRun, RunPick[]>()
    const pick = (r: SessionRun | undefined, why: RunPick) => {
      if (!r) return
      const p = picks.get(r)
      if (p) {
        if (!p.includes(why)) p.push(why)
      } else picks.set(r, [why])
    }
    if (opts.run) pick(runBySeq(a, opts.run.seq), 'selected')
    else if (opts.at !== undefined) pick(runAt(a, opts.at), 'at')
    else {
      for (const r of a.runs) if (r.status !== 'succeeded') pick(r, 'failed')
      const top = a.runs.filter(r => !r.deferred)
      pick(top[top.length - 1] ?? a.runs[a.runs.length - 1], 'last')
    }
    const cursor = opts.at ?? index.t1
    const chosen = [...picks.entries()].sort(([x], [y]) => runTime(x) - runTime(y) || x.seq - y.seq)
    for (const [r, why] of chosen) runs.push(runReport(index, a, track, r, why, cursor, opts))
  }
  return { header, timelines, runs }
}

// ---- text ------------------------------------------------------------------------------------------------------

/** Two decimals, as the page prints a time. */
const time = (t: number) => t.toFixed(2)

export const NOTATION =
  'notation: ◆ replan (◇ the running plan kept) · × failed · ✓ chosen / done · ↶ backtracked (held, a subtask failed) · · not tried / upcoming · ▶ running · ✂ cut by a replan · | a precondition term · ↺N tried N times · Δ facts changed · ● the plan rests on this row · ○ the planner looked'

function headerLines(h: ReportHeader): string[] {
  const out: string[] = []
  out.push(`HTN session${h.source ? ` ${h.source}` : ''}`)
  out.push(h.domains.map(d => `domain ${d.name}: ${d.agents.join(', ')}`).join(' · '))
  const runs = h.agents.reduce((n, a) => n + a.runs, 0)
  const failedRuns = h.agents.reduce((n, a) => n + a.failedRuns, 0)
  const failedSteps = h.agents.reduce((n, a) => n + a.failedSteps, 0)
  const span = h.timed ? `time ${time(h.t0)}–${time(h.t1)} s` : 'untimed (runs in order)'
  out.push(`${plural(h.agents.length, 'agent')} · ${span} · ${plural(runs, 'run')} · failures: ${failedRuns} planning, ${failedSteps} steps`)
  for (const a of h.agents)
    out.push(`  ${a.id}: ${plural(a.runs, 'run')}${a.replans ? `, ${plural(a.replans, 'replan')}` : ''}${a.failedRuns ? `, ${a.failedRuns} failed` : ''}${a.failedSteps ? `, ${plural(a.failedSteps, 'failed step')}` : ''}`)
  out.push(NOTATION)
  return out
}

function timelineLine(l: TimelineLine, timed: boolean): string {
  const at = timed ? `t=${time(l.t)}${l.count > 1 ? `–${time(l.until)}` : ''} ` : ''
  const run = l.run === undefined ? '' : l.lastRun !== undefined && l.lastRun !== l.run ? `runs ${l.run}–${l.lastRun} ` : `run ${l.run} `
  const times = l.count > 1 ? `×${l.count} ` : ''
  return `${at}${run}${times}${l.text}`
}

function condLine(l: CondLine, pad: string): string {
  return `${pad}| ${'  '.repeat(l.depth)}${STATUS_GLYPH[l.status]} ${l.text}${l.retries ? ` ↺${l.retries}` : ''}${l.note ? ` — ${l.note}` : ''}`
}

/** The refinement tree as an outline: `glyph title`, its card lines under it with `|`, children indented. */
export function treeOutline(root: FigNode, indent = ''): string[] {
  const out: string[] = []
  const walk = (n: FigNode, pad: string) => {
    const closed = n.children.length > 0 && !n.open
    const fold = closed ? (n.hiddenFailures > 0 ? `  [folded: × ${plural(n.hiddenFailures, 'attempt')}]` : '  [folded]') : ''
    const sub = n.sub ? (n.kind === 'untried' ? `: ${n.sub}` : ` (${n.sub})`) : ''
    out.push(`${pad}${STATUS_GLYPH[n.status]} ${n.title}${sub}${fold}`)
    for (const l of n.lines) out.push(condLine(l, `${pad}  `))
    if (!closed) for (const c of n.children) walk(c, `${pad}  `)
  }
  walk(root, indent)
  return out
}

const DIFF_MARK: Record<PlanDiffRow['kind'], string> = { kept: '=', dropped: '−', new: '+' }

function runLines(r: RunReport, h: ReportHeader, opts: TextOptions): string[] {
  const out: string[] = []
  const at = h.timed ? ` · t=${time(r.t)}` : ''
  const why = r.picked.map(p => (p === 'last' ? `last run of ${r.agent}` : p === 'failed' ? 'failed' : p === 'at' ? `the run at t=${time(r.cursor)}` : 'selected')).join(', ')
  out.push(`== run ${r.agent}:${r.seq}${at} · ${r.status === 'succeeded' ? `succeeded, ${plural(r.plan.length, 'step')}` : r.status}${r.deferred ? ' · a deferred step expanded' : ''} · ${why} ==`)
  if (r.why) {
    out.push(`why: ${r.why.text} → ${r.why.outcome}`)
    if (r.why.facts.length) out.push(`facts changed: ${r.why.facts.join(' ')}`)
    if (r.why.upkeep) out.push(`upkeep first (reasoning): ${r.why.upkeep.join(', ')}`)
    if (r.why.diff && r.why.diff.length) out.push(`plan diff (= kept − dropped + new): ${r.why.diff.map(d => `${DIFF_MARK[d.kind]} ${stepText(d.step)}`).join('  ')}`)
  }
  if (r.failure) out.push(`failed: ${causeText(r.failure)}`)
  if (r.tree) {
    out.push(`tree (${opts.verbose ? 'verbose, every attempt as recorded' : 'normal; --verbose for every attempt'}):`)
    out.push(...treeOutline(r.tree, '  '))
  } else out.push('tree: none (the run has no nodes)')
  if (r.plan.length === 0) out.push(`plan: ${r.status === 'succeeded' ? 'empty' : 'none'}`)
  else {
    out.push(r.events && h.timed ? `plan at t=${time(r.cursor)}:` : 'plan:')
    r.plan.forEach((s, i) => {
      const state = r.events ? `${STEP_GLYPH[s.state]} ` : ''
      const span = r.events && h.timed && s.start !== undefined ? `  ${time(s.start)}–${s.end !== undefined ? time(s.end) : ''}` : ''
      out.push(`  ${i + 1}. ${state}${s.label}${s.deferred ? '  (deferred)' : ''}${span}`)
    })
  }
  if (r.world) out.push(...worldLines(r.world, opts.worldAll === true))
  return out
}

/** The world a run planned against: the changed rows and the rows of every table the planner read; the rest named. */
export function worldLines(w: WorldView, all: boolean): string[] {
  const out: string[] = [`world rev ${w.revision}${w.previous === null ? ' (the first)' : ` vs rev ${w.previous}`}:`]
  const rest: string[] = []
  for (const t of w.tables) {
    const read = t.read !== ''
    if (!all && !read && !t.changed) {
      rest.push(`${t.name} (${t.rows.length})`)
      continue
    }
    if (t.rows.length === 0) {
      out.push(`   ${t.read === 'plan' ? '●' : t.read === 'queried' ? '○' : ' '} ${t.name}: no rows`)
      continue
    }
    for (const row of t.rows) {
      if (!all && !read && row.mark === '') continue
      const mark = row.mark === '-' ? '−' : row.mark || ' '
      const dot = row.read === 'plan' ? '●' : read ? '○' : ' '
      out.push(`  ${mark}${dot} ${t.name}(${row.args.join(', ')})${row.was ? `  was ${t.name}(${row.was.join(', ')})` : ''}`)
    }
    if (!all && !read) {
      const same = t.rows.filter(r => r.mark === '').length
      if (same) rest.push(`${t.name} (${same} more)`)
    }
  }
  if (rest.length) out.push(`  not read, unchanged: ${rest.join(', ')}`)
  return out
}

export interface TextOptions {
  /** Lines at most (0: no limit); the last says how many were left out. */
  maxLines?: number
  verbose?: boolean
  worldAll?: boolean
}

export const DEFAULT_MAX_LINES = 200

/** The report as text, one line per item, cut at `maxLines` with a line saying how many were left out. */
export function reportText(report: SessionReport, opts: TextOptions = {}): string {
  const h = report.header
  const lines = headerLines(h)
  for (const tl of report.timelines) {
    lines.push('')
    lines.push(`== timeline ${tl.agent} ==`)
    if (tl.lines.length === 0) lines.push('  (no runs or replans)')
    for (const l of tl.lines) lines.push(timelineLine(l, h.timed))
  }
  for (const r of report.runs) {
    lines.push('')
    lines.push(...runLines(r, h, opts))
  }
  const max = opts.maxLines ?? DEFAULT_MAX_LINES
  if (max > 0 && lines.length > max) {
    const left = lines.length - (max - 1)
    lines.splice(max - 1, lines.length, `… ${left} more lines (use --run <agent>:<n>, --at <t> or --agent <id> to narrow, --max-lines N to raise)`)
  }
  return lines.join('\n') + '\n'
}
