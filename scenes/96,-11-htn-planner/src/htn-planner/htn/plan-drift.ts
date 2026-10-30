// Facts now vs what the plan expects: the conditions the chosen path of a run rested on, re-checked against the world
// as it is now. A plan is made from facts that held when it was planned; while it runs the world moves on, and a
// fact the plan chose a branch for may be gone (the door it walks to was shut) or a `not` fact may have appeared.
// Only facts are re-checked (comparisons of bound values do not change; callterms are not called again: no side
// effects, no cost): each fact the chosen path matched, with the values it bound, must still have a row; each
// `not (fact)` it passed must still have none. Cheap (one table scan per fact) but not free: call it on demand (a
// debugger that is open, a host deciding whether to replan), not every tick. Ours; upstream's agents re-plan or run
// an `active_plan` check method instead (docs/USE_CASES.md pattern 1). Pure, no SDK.
import type { Atom } from './atom'
import type { DomainIR } from './ir'
import { branchAttempts, DebugNode, PlanRun } from './trace'
import { graphIndex } from './domain-graph'
import { cells, condIRs, mismatches, patternText, rowText, scopeVars, sourceText } from './why-not'
import type { FactRow, WorldSnapshot } from './world-state'

/** What a check reads: a WorldState, or a snapshot through `snapshotRows`. */
export interface FactSource {
  rows(name: string, arity: number): readonly FactRow[]
}

/** A snapshot as a FactSource. */
export function snapshotRows(s: WorldSnapshot): FactSource {
  return { rows: (name, arity) => s.tables[`${name}/${arity}`] ?? [] }
}

/** One condition of the chosen path that no longer holds. */
export interface DriftItem {
  /** The branch whose condition it is: `method.branch` (an axiom's facts: the branch that called it). */
  branch: string
  /** The fact as the plan matched it: `(door_open store)`; for a `not`, the fact that must stay absent. */
  fact: string
  /** gone: the plan matched a row that is no longer there; present: a `not` passed and the fact now has a row. */
  drift: 'gone' | 'present'
  /** One line: `gone: no (door_open store) now; door_open/1 has (door_open back)`, `present: (closed front)`. */
  text: string
  source?: string
}

export interface PlanDrift {
  /** Facts and `not` facts of the chosen path checked. */
  checked: number
  items: DriftItem[]
}

interface Check {
  branch: string
  node: DebugNode
  negated: boolean
}

/** The last succeeded node per IR element among `ids` (a choice fact's committed candidate is its last success). */
function committed(run: PlanRun, ids: readonly number[]): DebugNode[] {
  const last = new Map<string, DebugNode>()
  for (const id of ids) {
    const n = run.nodes[id]
    if (n.started && n.completed && n.succeeded) last.set(`${n.kind}|${n.ref}|${n.impl ? 1 : 0}`, n)
  }
  // In the order they are written (graph ids are pre-order): a node id is not the order of the visits, since a
  // composite pre-creates its children and a later visit reuses them.
  return [...last.values()].sort((a, b) => a.ref - b.ref || a.id - b.id)
}

/** The facts and `not` facts the chosen path of `run` rested on. */
function chosenChecks(domain: DomainIR, run: PlanRun): Check[] {
  const graph = graphIndex(domain).graph
  const out: Check[] = []
  const cond = (n: DebugNode, branch: string) => {
    switch (n.kind) {
      case 'fact':
        out.push({ branch, node: n, negated: false })
        return
      case 'not':
        out.push({ branch, node: n, negated: true })
        return
      case 'and':
      case 'or':
      case 'alt':
      case 'axiom':
        for (const c of committed(run, n.children)) cond(c, branch)
        return
      default:
        return // comparisons of bound values, assignments, splits, callterms: not re-checked
    }
  }
  const method = (m: DebugNode) => {
    const attempts = branchAttempts(run, m, graph)
    let chosen: DebugNode | undefined
    for (const a of attempts) if (a.outcome === 'chosen') chosen = a.node
    if (!chosen) return
    const b = graph.branches[chosen.ref]
    const name = `${graph.methods[b.method]?.name ?? '?'}.${b.name}`
    const kids = chosen.children.map(id => run.nodes[id])
    // The condition solution the tasks ran under is the last one that succeeded; the tasks after it are the plan's.
    let at = -1
    kids.forEach((k, i) => {
      if (k.kind !== 'task' && k.succeeded) at = i
    })
    if (at >= 0) cond(kids[at], name)
    for (const t of kids.slice(at + 1)) {
      if (t.kind !== 'task' || !t.succeeded) continue
      for (const sub of committed(run, t.children)) if (sub.kind === 'method') method(sub)
    }
  }
  const plan = run.nodes[0]
  if (plan && plan.succeeded) for (const m of committed(run, plan.children)) if (m.kind === 'method') method(m)
  return out
}

/**
 * The conditions of `run`'s chosen path that no longer hold in `world`: facts it matched that are gone, `not` facts
 * it passed that now have a row. An unfinished or failed run has no chosen path: nothing to check.
 */
export function planDrift(domain: DomainIR, run: PlanRun | null | undefined, world: FactSource): PlanDrift {
  if (!run || run.status !== 'succeeded') return { checked: 0, items: [] }
  const graph = graphIndex(domain).graph
  const irs = condIRs(domain)
  const items: DriftItem[] = []
  let checked = 0
  for (const c of chosenChecks(domain, run)) {
    const ir = irs[c.node.ref]
    const fact = c.negated ? (ir && ir.k === 'not' && ir.item.k === 'fact' ? ir.item : undefined) : ir && ir.k === 'fact' ? ir : undefined
    if (!fact) continue
    checked++
    const vars = scopeVars(domain, graph, graph.conds[c.node.ref])
    // A matched fact is checked with what it bound (After); a `not` binds nothing (its Before).
    const cs = cells(fact.args, vars, c.negated ? c.node.before : c.node.after)
    const rows = world.rows(fact.name, fact.args.length)
    const matching = rows.filter(r => mismatches(r, cs).length === 0)
    const pattern = patternText(fact.name, cs)
    let item: DriftItem | undefined
    if (!c.negated && matching.length === 0) {
      const key = `${fact.name}/${fact.args.length}`
      const now = rows.length === 0 ? `${key} has no rows` : `${key} has ${rows.slice(0, 2).map(r => rowText(fact.name, r as readonly Atom[])).join(' ')}${rows.length > 2 ? ' …' : ''}`
      item = { branch: c.branch, fact: pattern, drift: 'gone', text: `gone: no ${pattern} now; ${now}` }
    } else if (c.negated && matching.length > 0) {
      item = { branch: c.branch, fact: pattern, drift: 'present', text: `present: ${rowText(fact.name, matching[0] as readonly Atom[])} (the plan passed (not ${pattern}))` }
    }
    if (item) {
      const src = sourceText(c.node.source)
      if (src) item.source = src
      items.push(item)
    }
  }
  return { checked, items }
}

/** The drift as lines: `facts now: N checked, all hold` or `facts now: K of N no longer hold`, then one per item. */
export function formatDrift(d: PlanDrift): string[] {
  if (d.checked === 0) return ['facts now: no fact of the chosen path to check']
  if (d.items.length === 0) return [`facts now: ${d.checked} checked, all hold`]
  return [`facts now: ${d.items.length} of ${d.checked} no longer hold`, ...d.items.map(i => `  × ${i.branch}  ${i.text}${i.source ? '  ' + i.source : ''}`)]
}
