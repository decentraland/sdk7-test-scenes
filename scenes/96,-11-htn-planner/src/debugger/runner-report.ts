// A Domain Runner result as plain text and JSON, for a terminal and for AI agents (`npm run htn:run`,
// tools/htn/run.ts): the tree rows of the debugger's Normal / Verbose view (viewRows, rowRich painted PLAIN), the
// branches that failed and where, the deferred steps expanded, and what planning wrote to the world (callterms may
// write facts; the planner never does). Compact, deterministic but for the times, greppable. Pure, no SDK.
import { branchAttempts, domainGraph, formatWhyNot, snapshotWorld, viewRows, whyNot, worldDiff } from '../htn-planner'
import type { Binding, DebugNode, DomainGraph, FactRow, PlanRun, ViewMode, WhyNot, WorldDiff } from '../htn-planner'
import type { RunnerResult } from './runner'
import { atomText, checkedRich, PLAIN, rowRich, rowStatus, titleRich } from './tree-rows'
import type { Status } from './theme'

export const RUN_REPORT_VERSION = 1

export interface ReportRow {
  node: number
  depth: number
  kind: string
  status: Status
  /** Choice index among a fact's matches (Normal view), -1 when not a choice row. */
  choice: number
  retries: number
  /** The row as the debugger shows it: glyph, title with ?var=value, retry ×N, the rows a failed fact checked. */
  text: string
}

/** A branch a method tried that did not hold its plan, and where it failed. */
export interface BranchFailure {
  /** `method.branch`. */
  branch: string
  /** no_match: its condition failed; abandoned: the condition held, a task failed. */
  outcome: 'no_match' | 'abandoned'
  /** The failing condition (deepest failed term) or task, with the values it saw. */
  at: string
  /** `file:line` of `at`. */
  source?: string
  /** The bindings `at` started with: `name=value ...`. */
  bindings: string
}

export interface ReportExpansion {
  step: string
  status: string
  plan: string[]
  rows: ReportRow[]
  failures: BranchFailure[]
}

export interface RunReport {
  version: typeof RUN_REPORT_VERSION
  status: string
  /** Planner alone, mean of the untraced repeats. */
  ms: number
  tracedMs: number
  repeats: number
  domain: string
  method: string
  args: string[]
  world: { id: string; label: string; tables: number; rows: number }
  mode: string
  view: ViewMode
  plan: string[]
  /** The plan with its deferred steps expanded (maxPasses > 1). */
  expanded?: string[]
  passes: number
  /** The scenario's expectation for this method, args and mode. */
  expected?: { status: string; plan: string[] | null; same: boolean }
  rows: ReportRow[]
  failures: BranchFailure[]
  deferred: ReportExpansion[]
  /** What the run wrote to the world (callterms; planning itself writes nothing), or null when nothing. */
  worldDiff: { added: string[]; removed: string[] } | null
  diagnostics: string[]
  /** One answer per `--why <name>` (htn/why-not.ts): why the plan did not take that branch, method or primitive. */
  why?: WhyNot[]
}

/** The rows of a run: Normal as the debugger opens it after a run, Verbose with every node open (every attempt). */
export function reportRows(run: PlanRun, graph: DomainGraph, view: ViewMode): ReportRow[] {
  const state = view === 'verbose' ? { open: new Map(run.nodes.map(n => [n.id, true] as [number, boolean])) } : {}
  return viewRows(run, view, state).map(row => {
    const status = rowStatus(run, row)
    let text = rowRich(run, graph, row, { values: true, paint: PLAIN, inlineRows: 8 })
    if (status === 'abandoned') text += '   (condition held, a task failed)'
    return { node: row.node, depth: row.depth, kind: run.nodes[row.node].kind, status, choice: row.choice, retries: row.retries, text }
  })
}

const bindingsText = (bs: readonly Binding[]) => bs.map(b => `${b.name}=${atomText(b.value)}`).join(' ')

/**
 * The deepest failed node below `n`: the last completed, failed child at each level. A choice fact that ran out of
 * rows after its candidates were rejected (an earlier visit under the same parent succeeded) is not the cause: the
 * term that rejected the last candidate is (why-not.ts lists every such term).
 */
function failingLeaf(run: PlanRun, n: DebugNode): DebugNode {
  let at = n
  for (;;) {
    let next: DebugNode | undefined
    let exhausted: DebugNode | undefined
    const matched = new Set<number>()
    for (const c of at.children) {
      const child = run.nodes[c]
      if (child.kind === 'task' || child.kind === 'method') continue
      if (child.kind === 'fact' && child.succeeded) matched.add(child.ref)
      if (!child.started || !child.completed || child.succeeded) continue
      if (child.kind === 'fact' && matched.has(child.ref)) exhausted = child
      else next = child
    }
    next ??= exhausted
    if (!next) return at
    at = next
  }
}

/** Every branch attempt of the run that did not hold, in the order tried, with where it failed. */
export function branchFailures(run: PlanRun, graph: DomainGraph): BranchFailure[] {
  const out: BranchFailure[] = []
  for (const m of run.nodes) {
    if (m.kind !== 'method') continue
    const method = graph.methods[m.ref]
    for (const a of branchAttempts(run, m, graph)) {
      if (a.outcome === 'chosen' || !a.node.completed) continue
      let at: DebugNode = a.node
      if (a.outcome === 'no_match') at = failingLeaf(run, a.node)
      else {
        const task = [...a.node.children].reverse().map(c => run.nodes[c]).find(c => c.kind === 'task' && c.completed && !c.succeeded)
        if (task) at = task
      }
      let text = at === a.node ? 'no condition term failed (empty or not reached)' : titleRich(run, graph, at.id, true, PLAIN)
      const checked = checkedRich(at, 8, PLAIN)
      if (checked) text += '   ' + checked
      const f: BranchFailure = {
        branch: `${method?.name ?? '?'}.${graph.branches[a.node.ref]?.name ?? a.node.name}`,
        outcome: a.outcome,
        at: text,
        bindings: bindingsText(at.before)
      }
      if (at.source) f.source = `${at.source.file}:${at.source.line}`
      out.push(f)
    }
  }
  return out
}

const factLine = (key: string, row: FactRow) => `(${[key.slice(0, key.lastIndexOf('/')), ...row.map(atomText)].join(' ')})`

function diffLines(d: WorldDiff): { added: string[]; removed: string[] } | null {
  const lines = (tables: Record<string, FactRow[]>) =>
    Object.keys(tables)
      .sort()
      .flatMap(k => tables[k].map(r => factLine(k, r)))
  const added = lines(d.added)
  const removed = lines(d.removed)
  return added.length || removed.length ? { added, removed } : null
}

export interface ReportInput {
  result: RunnerResult
  method: string
  world: { id: string; label: string }
  mode: string
  view: ViewMode
  /** Names to explain ("why not"): branches (`method.branch` or `branch`), methods, primitives. */
  why?: readonly string[]
}

export function runReport({ result: r, method, world, mode, view, why }: ReportInput): RunReport {
  const graph = domainGraph(r.recorder.domain)
  const after = snapshotWorld(r.world)
  const before = r.recorder.world(r.run.world)
  const tables = Object.keys(after.tables).filter(k => after.tables[k].length > 0)
  const report: RunReport = {
    version: RUN_REPORT_VERSION,
    status: r.status,
    ms: round(r.ms),
    tracedMs: round(r.tracedMs),
    repeats: r.repeats,
    domain: r.recorder.domain.name,
    method,
    args: r.run.args.map(atomText),
    world: { id: world.id, label: world.label, tables: tables.length, rows: tables.reduce((n, k) => n + after.tables[k].length, 0) },
    mode,
    view,
    plan: r.plan,
    passes: r.passes,
    rows: reportRows(r.run, graph, view),
    failures: branchFailures(r.run, graph),
    deferred: r.expansions.map(e => ({ step: e.step, status: e.status, plan: e.plan, rows: reportRows(e.run, graph, view), failures: branchFailures(e.run, graph) })),
    worldDiff: before && before.revision !== after.revision ? diffLines(worldDiff(before, after)) : null,
    diagnostics: r.diagnostics
  }
  if (r.expanded) report.expanded = r.expanded
  if (why && why.length > 0) {
    const runs = [r.run, ...r.expansions.map(e => e.run)]
    report.why = why.map(query => whyNot({ query, domain: r.recorder.domain, runs, world: rev => r.recorder.world(rev) }))
  }
  if (r.expected) report.expected = { status: r.expected.status, plan: r.expected.plan ? [...r.expected.plan] : null, same: r.expected.same }
  return report
}

const round = (ms: number) => Math.round(ms * 1e4) / 1e4
const msText = (ms: number) => (ms < 10 ? ms.toFixed(3) : ms.toFixed(1))
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`
/** Failures listed in Normal view when there is no plan; Verbose lists them all. */
const NORMAL_FAILURES = 12

function treeLines(rows: readonly ReportRow[]): string[] {
  return rows.map(r => '  ' + '  '.repeat(r.depth) + r.text)
}

function failureLines(failures: readonly BranchFailure[], limit: number): string[] {
  const out = failures.slice(0, limit).map(f => {
    let s = `  ${f.branch}  ${f.outcome}  at ${f.at}`
    if (f.bindings) s += `  {${f.bindings}}`
    if (f.source) s += `  ${f.source}`
    return s
  })
  if (failures.length > limit) out.push(`  … ${failures.length - limit} more (--verbose)`)
  return out
}

/**
 * The report as terminal lines: one `key: value` header line each (status, ms, domain, method, world, mode,
 * expected), then sections `plan:`, `tree (<view>):`, `failed branches:`, `deferred:`, `world diff:`,
 * `diagnostics:`, `why not <name>: <verdict>` (one per --why), items indented by two spaces.
 */
export function formatRunReport(r: RunReport): string[] {
  const out: string[] = []
  out.push(`status: ${r.status}`)
  out.push(r.repeats > 0 ? `ms: ${msText(r.ms)} (mean of ${r.repeats} untraced runs; traced ${msText(r.tracedMs)})` : `ms: ${msText(r.tracedMs)} (traced)`)
  out.push(`domain: ${r.domain}`)
  out.push(`method: (${[r.method, ...r.args].join(' ')})`)
  out.push(`world: ${r.world.id} (${r.world.label}; ${plural(r.world.tables, 'fact table')}, ${plural(r.world.rows, 'row')})`)
  out.push(`mode: ${r.mode}`)
  if (r.expected) {
    const want = `${r.expected.status}${r.expected.plan ? ' [' + r.expected.plan.join(', ') + ']' : ''}`
    out.push(`expected: ${r.expected.same ? 'same' : 'DIFFERS'} (scenario expects ${want})`)
  }
  out.push(`plan: ${plural(r.plan.length, 'step')}`)
  r.plan.forEach((s, i) => out.push(`  ${i + 1}. ${s}`))
  if (r.expanded) {
    out.push(`expanded plan: ${plural(r.expanded.length, 'step')} (${plural(r.passes, 'planner pass', 'planner passes')})`)
    r.expanded.forEach((s, i) => out.push(`  ${i + 1}. ${s}`))
  }
  out.push(`tree (${r.view}): ${plural(r.rows.length, 'row')}`)
  out.push(...treeLines(r.rows))
  const listFailures = r.view === 'verbose' || r.status !== 'succeeded'
  if (listFailures && r.failures.length > 0) {
    out.push(`failed branches: ${r.failures.length}`)
    out.push(...failureLines(r.failures, r.view === 'verbose' ? Infinity : NORMAL_FAILURES))
  }
  for (const d of r.deferred) {
    out.push(`deferred: ${d.step} -> ${d.status}${d.plan.length ? ' [' + d.plan.join(', ') + ']' : ''}`)
    out.push(...treeLines(d.rows))
    if ((r.view === 'verbose' || d.status !== 'succeeded') && d.failures.length > 0) {
      out.push(`  failed branches: ${d.failures.length}`)
      out.push(...failureLines(d.failures, r.view === 'verbose' ? Infinity : NORMAL_FAILURES).map(l => '  ' + l))
    }
  }
  if (r.worldDiff) {
    out.push(`world diff: +${r.worldDiff.added.length} -${r.worldDiff.removed.length} (written while planning)`)
    for (const l of r.worldDiff.removed) out.push(`  - ${l}`)
    for (const l of r.worldDiff.added) out.push(`  + ${l}`)
  }
  out.push(`diagnostics: ${r.diagnostics.length}`)
  for (const d of r.diagnostics) out.push(`  ${d}`)
  for (const w of r.why ?? []) out.push(...formatWhyNot(w))
  return out
}
