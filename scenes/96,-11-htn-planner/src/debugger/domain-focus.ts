// The Domain tab's graph: the library's DomainGraph as an AND/OR graph for the layout (methods → branches with their
// precondition chips → tasks in order), either around one method (focus: the method, its branches and their tasks,
// the methods they call left closed, and the branches that call it) or the whole domain from its top-level
// methods, capped so a view stays drawable. The overlay of a run: the methods and branches it committed to, and the
// branches it tried that failed (the last one apart). Upstream has no domain graph; this is ours (Task
// Decomposition Graph, Bercher et al. 2017). Pure, no SDK.
import type { CondKind, DomainGraph, GraphCond } from '../htn-planner/htn/domain-graph'
import type { DebugNode, PlanRun } from '../htn-planner'
import type { GraphModel, GraphNode } from './model'
import { clip } from './theme'

export const methodNode = (id: number) => `m${id}`
export const branchNode = (id: number) => `b${id}`
export const taskNode = (id: number) => `p${id}`

/** A node id of the model back to its method or branch id. */
export function parseNode(id: string): { kind: 'method' | 'branch' | 'task'; id: number } | null {
  const m = /^([mbp])(\d+)/.exec(id)
  if (!m) return null
  return { kind: m[1] === 'm' ? 'method' : m[1] === 'b' ? 'branch' : 'task', id: Number(m[2]) }
}

export interface DomainModel {
  model: GraphModel
  /** Methods drawn with their branches. */
  expanded: number[]
  /** Methods drawn closed (called, not opened). */
  closed: number[]
  /** Branches calling the focus method left out (focus view), or methods left closed by the cap (full view). */
  hidden: number
}

const MAX_CHIPS = 4

/** Short labels for a branch's precondition: facts by name, `#axiom`, `¬fact`, comparisons as written. */
export function branchChips(graph: DomainGraph, branch: number): string[] {
  const b = graph.branches[branch]
  if (!b || b.cond < 0) return []
  const out: string[] = []
  const chip = (c: GraphCond): string => {
    switch (c.kind as CondKind) {
      case 'fact':
        return (c.fact ?? c.title).replace(/\/\d+$/, '')
      case 'axiom':
        return '#' + (c.title.slice(2).split(/[ )]/)[0] || 'axiom')
      case 'not':
        return '¬' + (c.children.length ? chip(graph.conds[c.children[0]]) : '')
      case 'or':
      case 'alt':
        return c.children.map(k => chip(graph.conds[k])).join('|')
      case 'call':
        return (c.callterms[0] ?? 'call') + '()'
      default:
        return clip(c.title, 16)
    }
  }
  const root = graph.conds[b.cond]
  const leaves = root.kind === 'and' ? root.children.map(k => graph.conds[k]) : [root]
  for (const c of leaves) out.push(clip(chip(c), 18))
  if (out.length > MAX_CHIPS) return [...out.slice(0, MAX_CHIPS), `+${out.length - MAX_CHIPS}`]
  return out
}

/** A task's head: `!move_to`, `go_to`, `&go_to`. */
function taskHead(title: string): string {
  return title.replace(/^\(/, '').split(/[ )]/)[0]
}

class Builder {
  readonly nodes: GraphNode[] = []
  readonly edges: { from: string; to: string }[] = []
  private readonly seen = new Set<string>()
  readonly expanded: number[] = []
  readonly closed = new Set<number>()

  constructor(readonly graph: DomainGraph) {}

  method(id: number): string {
    const key = methodNode(id)
    if (!this.seen.has(key)) {
      this.seen.add(key)
      this.nodes.push({ id: key, kind: 'task', label: this.graph.methods[id]?.name ?? '?' })
      this.closed.add(id)
    }
    return key
  }

  branch(id: number): string {
    const key = branchNode(id)
    if (!this.seen.has(key)) {
      this.seen.add(key)
      const b = this.graph.branches[id]
      this.nodes.push({ id: key, kind: 'branch', label: b.name, chips: branchChips(this.graph, id) })
    }
    return key
  }

  edge(from: string, to: string): void {
    if (!this.edges.some(e => e.from === from && e.to === to)) this.edges.push({ from, to })
  }

  /** The method with its branches and their tasks; returns the methods its tasks call. */
  expand(id: number): number[] {
    const m = this.method(id)
    if (!this.closed.has(id)) return []
    this.closed.delete(id)
    this.expanded.push(id)
    const calls: number[] = []
    for (const bid of this.graph.methods[id].branches) {
      const b = this.branch(bid)
      this.edge(m, b)
      for (const tid of this.graph.branches[bid].tasks) {
        const t = this.graph.tasks[tid]
        if (t.method === undefined) {
          const key = taskNode(tid)
          this.nodes.push({ id: key, kind: 'primitive', label: taskHead(t.title) })
          this.edge(b, key)
        } else {
          this.edge(b, this.method(t.method))
          calls.push(t.method)
        }
      }
    }
    return calls
  }

  model(root: string): GraphModel {
    return { root, nodes: this.nodes, edges: this.edges }
  }
}

/** Branches (ids) with a task that decomposes `method`. */
export function callers(graph: DomainGraph, method: number): number[] {
  const out: number[] = []
  for (const b of graph.branches) if (b.tasks.some(t => graph.tasks[t].method === method)) out.push(b.id)
  return out
}

/** One method and its neighbours: its branches and tasks, the methods they call (closed), the branches calling it. */
export function focusModel(graph: DomainGraph, method: number, maxCallers = 8): DomainModel {
  const g = new Builder(graph)
  const centre = methodNode(method)
  const all = callers(graph, method).filter(b => graph.branches[b].method !== method)
  const shown = all.slice(0, maxCallers)
  let root = centre
  for (const bid of shown) {
    const b = graph.branches[bid]
    const m = g.method(b.method)
    if (root === centre) root = m
    g.edge(m, g.branch(bid))
  }
  g.expand(method)
  for (const bid of shown) g.edge(branchNode(bid), centre)
  return { model: g.model(root), expanded: g.expanded, closed: [...g.closed], hidden: all.length - shown.length }
}

/** The whole domain from its top-level methods, breadth first, until about `maxNodes` nodes; the rest stays closed. */
export function fullModel(graph: DomainGraph, maxNodes = 200): DomainModel {
  const g = new Builder(graph)
  const queue = graph.topLevel.length > 0 ? graph.topLevel.slice() : graph.methods.map(m => m.id)
  const done = new Set<number>()
  let hidden = 0
  while (queue.length > 0) {
    const id = queue.shift() as number
    if (done.has(id)) continue
    done.add(id)
    const m = graph.methods[id]
    const cost = 1 + m.branches.reduce((a, b) => a + 1 + graph.branches[b].tasks.length, 0)
    if (g.nodes.length + cost > maxNodes && g.expanded.length > 0) {
      g.method(id)
      hidden++
      continue
    }
    queue.push(...g.expand(id))
  }
  const root = methodNode(graph.topLevel[0] ?? 0)
  return { model: g.model(root), expanded: g.expanded, closed: [...g.closed], hidden }
}

export interface Overlay {
  /** Methods and branches the run committed to (model node ids). */
  chosen: Set<string>
  /** Branches it tried that failed. */
  failed: Set<string>
  /** The last branch that failed. */
  last: string | null
}

/** The run's committed methods and branches, and the branches that failed on the way. */
export function runOverlay(run: PlanRun | null): Overlay {
  const out: Overlay = { chosen: new Set(), failed: new Set(), last: null }
  if (!run || run.nodes.length === 0) return out
  const nodes = run.nodes
  for (const n of nodes) {
    if (n.kind !== 'branch' || !n.completed || n.succeeded) continue
    out.failed.add(branchNode(n.ref))
    out.last = branchNode(n.ref)
  }
  const walk = (m: DebugNode) => {
    out.chosen.add(methodNode(m.ref))
    let branch: DebugNode | undefined
    for (const id of m.children) if (nodes[id].kind === 'branch' && nodes[id].succeeded) branch = nodes[id]
    if (!branch) return
    out.chosen.add(branchNode(branch.ref))
    out.failed.delete(branchNode(branch.ref))
    for (const id of branch.children) {
      const t = nodes[id]
      if (t.kind !== 'task') continue
      for (const c of t.children) if (nodes[c].kind === 'method') walk(nodes[c])
    }
  }
  const plan = nodes[0]
  const root = plan.children.map(id => nodes[id]).find(n => n.kind === 'method')
  if (root) walk(root)
  if (out.last !== null && out.chosen.has(out.last)) out.last = null
  return out
}
