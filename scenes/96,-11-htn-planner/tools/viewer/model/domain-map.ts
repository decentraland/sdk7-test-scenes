// The session viewer's domain map: the domain as an AND/OR task decomposition graph (Bercher et al., IJCAI 2017).
// A compound task is an OR node (the planner picks one branch), a branch an AND node with its precondition chips (all
// its subtasks, in order), a primitive a leaf (one per use, so the order of each branch reads off its leaves); a call
// back into a task the graph is already inside is a back-edge (recursion), axioms and callterms are side nodes on
// dashed `uses` edges. Two scopes:
// - focus: one task with its branches and subtasks, the tasks they call left closed (click one to focus it), the
//   branches that call it above it (its callers), the axioms and callterms its branches use;
// - whole: every task open, depth first from the top-level tasks, until about `maxNodes` (the rest stay closed).
// The overlay of a run: the tasks, branches and steps it committed to, the branches it tried that failed, the last
// of them (htn debugger's runOverlay). The layout is the page's (ELK layered); this is the graph. Pure, never throws.
import type { DomainGraph, GraphCond } from '../../../src/htn-planner/htn/domain-graph'
import type { PlanRun } from '../../../src/htn-planner/htn/trace'
import { runOverlay } from '../../../src/debugger/domain-focus'
import { headName, literalLabel } from './format'

export type MapNodeKind = 'or' | 'and' | 'prim' | 'axiom' | 'callterm'
export type MapEdgeKind = 'branch' | 'subtask' | 'back' | 'uses'

export interface MapNode {
  /** `m<method>`, `b<branch>`, `p<task>`, `a<axiom>`, `c<callterm>`. */
  id: string
  kind: MapNodeKind
  label: string
  /** An AND node's precondition, in short. */
  chips: string[]
  /** An OR node drawn without its branches (click: focus it). */
  closed?: boolean
  /** The task the map is centred on. */
  focus?: boolean
  topLevel?: boolean
  /** The method, branch, task or axiom id; -1 for a callterm. */
  ref: number
}

export interface MapEdge {
  id: string
  from: string
  to: string
  kind: MapEdgeKind
  /** A branch's priority in its task, a subtask's place in its branch. */
  order: number
  /** An `&` subtask: decomposed when the plan reaches it. */
  deferred?: boolean
}

export interface DomainMap {
  nodes: MapNode[]
  edges: MapEdge[]
  /** The focused method, null for the whole domain. */
  focus: number | null
  /** Callers left out (focus) or tasks left closed by the cap (whole). */
  hidden: number
}

export interface DomainMapOptions {
  /** A method id to centre on, or null: the whole domain. An unknown id gives the whole domain. */
  focus: number | null
  /** Whole domain: open tasks until about this many nodes (default 400). */
  maxNodes?: number
  /** Focus: callers shown at most (default 6). */
  maxCallers?: number
}

const MAX_CHIPS = 4
const CHIP_CHARS = 24

const clip = (s: string) => (s.length <= CHIP_CHARS ? s : s.slice(0, CHIP_CHARS - 1) + '…')

/**
 * A condition term in short, as a chip: a fact by its name and the values it is written with (`order(chase)`,
 * `target_visible`), `¬` for a `not`, `#` for an axiom, a comparison as written (`n > 0`), `ƒ` for a callterm.
 */
export function condChip(graph: DomainGraph, id: number): string {
  const c = graph.conds[id]
  if (!c) return '?'
  const kids = c.children.map(k => condChip(graph, k))
  switch (c.kind) {
    case 'not':
      return '¬' + (kids[0] ?? '')
    case 'and':
      return kids.join(' ∧ ')
    case 'or':
    case 'alt':
      return kids.join(' | ')
    case 'fact': {
      const name = headName(c.title)
      const literals = c.tokens.filter(t => t.kind !== 'var' && t.kind !== 'result' && t.text !== '(' && t.text !== ')').map(t => t.value ?? t.text.replace(/^"|"$/g, ''))
      return literals.length ? `${name}(${literals.join(', ')})` : name
    }
    case 'axiom':
      return '#' + headName(c.title)
    case 'call':
      return 'ƒ ' + (c.callterms[0] ?? headName(c.title))
    default:
      return literalLabel(c.title, () => undefined).replace(/\?(inp_|out_)?/g, '')
  }
}

/** A branch's precondition as chips: its conjuncts, at most MAX_CHIPS and `+N`. */
export function branchChips(graph: DomainGraph, branch: number): string[] {
  const b = graph.branches[branch]
  if (!b || b.cond < 0) return []
  const root = graph.conds[b.cond]
  if (!root) return []
  const terms = root.kind === 'and' ? root.children : [root.id]
  const out = terms.map(t => clip(condChip(graph, t)))
  return out.length > MAX_CHIPS ? [...out.slice(0, MAX_CHIPS), `+${out.length - MAX_CHIPS}`] : out
}

/** `?inp_target` -> `target`. */
const paramName = (p: string) => p.replace(/^\?/, '').replace(/^inp_/, '').replace(/^out_/, '')

class Builder {
  readonly nodes: MapNode[] = []
  readonly edges: MapEdge[] = []
  private readonly byId = new Map<string, MapNode>()
  readonly expanded = new Set<number>()
  hidden = 0

  constructor(readonly graph: DomainGraph) {}

  private add(node: MapNode): MapNode {
    const old = this.byId.get(node.id)
    if (old) return old
    this.byId.set(node.id, node)
    this.nodes.push(node)
    return node
  }

  edge(from: string, to: string, kind: MapEdgeKind, order: number, deferred = false): void {
    const id = `${from}>${to}#${order}${kind === 'uses' ? 'u' : ''}`
    if (this.edges.some(e => e.id === id)) return
    const e: MapEdge = { id, from, to, kind, order }
    if (deferred) e.deferred = true
    this.edges.push(e)
  }

  method(id: number): MapNode {
    const m = this.graph.methods[id]
    const label = m ? (m.params.length ? `${m.name}(${m.params.map(paramName).join(', ')})` : m.name) : '?'
    const node = this.add({ id: `m${id}`, kind: 'or', label, chips: [], closed: true, ref: id })
    if (m?.topLevel) node.topLevel = true
    return node
  }

  branch(id: number): MapNode {
    const b = this.graph.branches[id]
    let chips: string[] = []
    try {
      chips = branchChips(this.graph, id)
    } catch {
      chips = []
    }
    return this.add({ id: `b${id}`, kind: 'and', label: b?.name ?? '?', chips, ref: id })
  }

  /** The axioms and callterms a condition tree uses, as side nodes of `from`. */
  private uses(from: string, cond: number, seen: Set<number>): void {
    const walk = (cid: number) => {
      const c: GraphCond | undefined = this.graph.conds[cid]
      if (!c) return
      if (c.kind === 'axiom' && c.axiom !== undefined) {
        const a = this.axiom(c.axiom, seen)
        this.edge(from, a.id, 'uses', 0)
      }
      for (const name of c.callterms) this.edge(from, this.callterm(name).id, 'uses', 0)
      c.children.forEach(walk)
    }
    if (cond >= 0) walk(cond)
  }

  axiom(id: number, seen: Set<number> = new Set()): MapNode {
    const a = this.graph.axioms[id]
    const label = a ? (a.params.length ? `${a.name}(${a.params.map(p => paramName(p.name)).join(', ')})` : a.name) : '?'
    const node = this.add({ id: `a${id}`, kind: 'axiom', label, chips: [], ref: id })
    if (a && !seen.has(id)) {
      seen.add(id)
      this.uses(node.id, a.cond, seen)
    }
    return node
  }

  callterm(name: string): MapNode {
    return this.add({ id: `c${name}`, kind: 'callterm', label: name, chips: [], ref: -1 })
  }

  /**
   * Open a method: its branches, their subtasks in order. `inside`: the methods the graph is inside (a call to one
   * is a back-edge). Returns the compound subtasks' methods that are not back-edges, in order.
   */
  open(id: number, inside: ReadonlySet<number>): number[] {
    const m = this.graph.methods[id]
    const node = this.method(id)
    if (!m || this.expanded.has(id)) return []
    this.expanded.add(id)
    node.closed = false
    const calls: number[] = []
    // Nodes in reading order, one layer at a time (a layout keeps this order): the branches, their subtasks, then
    // what their conditions use.
    const branches = m.branches.map(bid => this.graph.branches[bid]).filter(b => b !== undefined)
    branches.forEach((b, bi) => this.edge(node.id, this.branch(b.id).id, 'branch', bi))
    branches.forEach(b => {
      const bn = this.branch(b.id)
      b.tasks.forEach((tid, ti) => {
        const t = this.graph.tasks[tid]
        if (!t) return
        if (t.method === undefined) {
          const leaf = this.add({ id: `p${tid}`, kind: 'prim', label: headName(t.title) || t.title, chips: [], ref: tid })
          this.edge(bn.id, leaf.id, 'subtask', ti)
          return
        }
        const target = this.method(t.method)
        const back = inside.has(t.method)
        this.edge(bn.id, target.id, back ? 'back' : 'subtask', ti, t.kind === 'defer')
        if (!back) calls.push(t.method)
      })
    })
    for (const b of branches) {
      const bn = `b${b.id}`
      this.uses(bn, b.cond, new Set())
      for (const tid of b.tasks) for (const name of this.graph.tasks[tid]?.callterms ?? []) this.edge(bn, this.callterm(name).id, 'uses', 0)
    }
    return calls
  }
}

/** Branches (ids) whose subtasks call `method`, with the subtask's place. */
function callersOf(graph: DomainGraph, method: number): { branch: number; order: number }[] {
  const out: { branch: number; order: number }[] = []
  for (const b of graph.branches)
    b.tasks.forEach((t, i) => {
      if (graph.tasks[t]?.method === method && graph.branches[b.id]?.method !== method) out.push({ branch: b.id, order: i })
    })
  return out
}

/** The map around one task, or of the whole domain. */
export function domainMap(graph: DomainGraph, opts: DomainMapOptions): DomainMap {
  const g = new Builder(graph)
  const focus = opts.focus !== null && graph.methods[opts.focus] ? opts.focus : null
  if (focus !== null) {
    const all = callersOf(graph, focus)
    const shown = all.slice(0, Math.max(0, opts.maxCallers ?? 6))
    g.hidden = all.length - shown.length
    const above = new Set<number>([focus])
    for (const c of shown) {
      const b = graph.branches[c.branch]
      const caller = g.method(b.method)
      above.add(b.method)
      const bn = g.branch(b.id)
      g.edge(caller.id, bn.id, 'branch', b.index)
    }
    const centre = g.method(focus)
    centre.focus = true
    g.open(focus, above)
    for (const c of shown) g.edge(`b${c.branch}`, centre.id, 'subtask', c.order)
    return { nodes: g.nodes, edges: g.edges, focus, hidden: g.hidden }
  }
  const max = opts.maxNodes ?? 400
  const roots = [...graph.topLevel, ...graph.methods.map(m => m.id)]
  const capped = new Set<number>()
  const visit = (id: number, inside: Set<number>) => {
    if (g.expanded.has(id) || capped.has(id)) return
    const m = graph.methods[id]
    const cost = m ? 1 + m.branches.reduce((a, b) => a + 1 + (graph.branches[b]?.tasks.length ?? 0), 0) : 1
    if (g.nodes.length + cost > max && g.expanded.size > 0) {
      g.method(id)
      capped.add(id)
      g.hidden++
      return
    }
    const here = new Set(inside).add(id)
    for (const next of g.open(id, here)) visit(next, here)
  }
  for (const id of roots) visit(id, new Set())
  return { nodes: g.nodes, edges: g.edges, focus: null, hidden: g.hidden }
}

export interface MapOverlay {
  /** Node ids the run committed to: tasks, branches and the steps of those branches. */
  chosen: Set<string>
  /** Branches it tried that failed. */
  failed: Set<string>
  /** The last branch that failed (not one it chose in the end), or null. */
  last: string | null
  /** Edges between chosen nodes. */
  chosenEdges: Set<string>
}

/** A run drawn over a map. */
export function mapOverlay(map: DomainMap, run: PlanRun | null): MapOverlay {
  const out: MapOverlay = { chosen: new Set(), failed: new Set(), last: null, chosenEdges: new Set() }
  if (!run) return out
  let o: ReturnType<typeof runOverlay>
  try {
    o = runOverlay(run)
  } catch {
    return out
  }
  const present = new Set(map.nodes.map(n => n.id))
  for (const id of o.chosen) if (present.has(id)) out.chosen.add(id)
  for (const id of o.failed) if (present.has(id)) out.failed.add(id)
  out.last = o.last !== null && present.has(o.last) ? o.last : null
  const kind = new Map(map.nodes.map(n => [n.id, n.kind]))
  for (const e of map.edges) {
    if (e.kind === 'uses' || !out.chosen.has(e.from)) continue
    if (kind.get(e.to) === 'prim') out.chosen.add(e.to)
  }
  for (const e of map.edges) if (e.kind !== 'uses' && out.chosen.has(e.from) && out.chosen.has(e.to)) out.chosenEdges.add(e.id)
  return out
}
