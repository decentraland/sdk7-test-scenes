// The domain on its own, as a debugger draws it: methods -> branches (condition trees) -> tasks in order, axioms
// and callterms as side nodes, with sources and upstream-style titles. Derived from the DomainIR; plain JSON, so a
// DebugSession can carry it. Upstream has no domain graph (its debugger only records execution); this is ours.
// The flat tables double as the metadata tables of the trace (upstream's MetadataIndex): a DebugNode's `ref` points
// into them. Pure, no SDK; built once per DomainIR and cached.
import { loweredCond } from './engine'
import type { AxiomId, CondIR, DomainIR, MethodId, ParamMode, SourceLoc, TaskIR } from './ir'
import { axiomTitle, branchTitle, conditionTitle, methodTitle, taskTitle, TitleToken } from './titles'

export type CondKind = CondIR['k']

export interface GraphMethod {
  id: MethodId
  name: string
  domain: string
  params: string[]
  topLevel: boolean
  /** GraphBranch ids, in priority order. */
  branches: number[]
  title: string
  source?: SourceLoc
}

export interface GraphBranch {
  id: number
  method: MethodId
  /** Position in its method (BranchIR index). */
  index: number
  name: string
  /** Root GraphCond id, or -1 for `()`. */
  cond: number
  /** GraphTask ids, in order. */
  tasks: number[]
  vars: string[]
  title: string
  source?: SourceLoc
}

export interface GraphTask {
  id: number
  branch: number
  index: number
  kind: TaskIR['k']
  /** The method it decomposes (compound and `&` tasks): a call edge, a back-edge when recursive. */
  method?: MethodId
  title: string
  tokens: TitleToken[]
  /** Callterms its arguments call. */
  callterms: string[]
  source?: SourceLoc
}

export interface GraphAxiom {
  id: AxiomId
  name: string
  domain: string
  params: { name: string; mode: ParamMode }[]
  /** Root GraphCond id, or -1 for an empty body. */
  cond: number
  title: string
  source?: SourceLoc
}

export interface GraphCond {
  id: number
  kind: CondKind
  /** Where the condition lives: a branch precondition or an axiom body. */
  owner: { branch: number } | { axiom: AxiomId }
  /** Parent GraphCond id, -1 at the root. */
  parent: number
  children: number[]
  title: string
  tokens: TitleToken[]
  /**
   * Upstream lowers a condition with a nested call or runtime list into a hidden sequence of temporaries
   * (HTNCompilerIRBuilder.cpp AddCondition :574-627, DebugInternal): one visible row, retried like a composite.
   */
  lowered: boolean
  /** fact: `name/arity`. */
  fact?: string
  /** axiom call: the AxiomId it calls. */
  axiom?: AxiomId
  /** Callterms it calls (standalone or inside its arguments). */
  callterms: string[]
  source?: SourceLoc
}

export interface DomainGraph {
  name: string
  methods: GraphMethod[]
  branches: GraphBranch[]
  tasks: GraphTask[]
  axioms: GraphAxiom[]
  conds: GraphCond[]
  /** Top-level method ids. */
  topLevel: MethodId[]
  /** `name/arity` facts the domain reads, with the conditions that read them. */
  facts: { key: string; conds: number[] }[]
  /** Callterms with the conditions and tasks that call them. */
  callterms: { name: string; conds: number[]; tasks: number[] }[]
}

/** Graph ids of IR objects, for a recorder. */
export interface GraphIndex {
  graph: DomainGraph
  cond: Map<CondIR, number>
  task: Map<TaskIR, number>
  /** branch[method][index] = GraphBranch id. */
  branch: number[][]
}

const cache = new WeakMap<DomainIR, GraphIndex>()

/** The domain graph of `ir` (cached per DomainIR object). */
export function domainGraph(ir: DomainIR): DomainGraph {
  return graphIndex(ir).graph
}

export function graphIndex(ir: DomainIR): GraphIndex {
  let index = cache.get(ir)
  if (index === undefined) {
    index = build(ir)
    cache.set(ir, index)
  }
  return index
}

function callsIn(node: unknown, out: Set<string>): void {
  if (node === null || typeof node !== 'object') return
  const n = node as { k?: string; name?: string; args?: unknown[] }
  if (n.k === 'call' && typeof n.name === 'string') out.add(n.name)
  for (const [key, v] of Object.entries(node)) {
    if (key === 'source' || key === 'v') continue
    if (key === 'items' || key === 'item') continue // child conditions report their own calls
    callsIn(v, out)
  }
}

function build(ir: DomainIR): GraphIndex {
  const graph: DomainGraph = {
    name: ir.name,
    methods: [],
    branches: [],
    tasks: [],
    axioms: [],
    conds: [],
    topLevel: [],
    facts: [],
    callterms: []
  }
  const index: GraphIndex = { graph, cond: new Map(), task: new Map(), branch: [] }
  const facts = new Map<string, number[]>()
  const callterms = new Map<string, { name: string; conds: number[]; tasks: number[] }>()
  const callterm = (name: string) => {
    let entry = callterms.get(name)
    if (entry === undefined) callterms.set(name, (entry = { name, conds: [], tasks: [] }))
    return entry
  }

  const addCond = (c: CondIR, vars: readonly string[], owner: GraphCond['owner'], parent: number): number => {
    const id = graph.conds.length
    const title = conditionTitle(ir, c, vars)
    const calls = new Set<string>()
    if (c.k === 'call') calls.add(c.name)
    callsIn(c, calls)
    const node: GraphCond = {
      id,
      kind: c.k,
      owner,
      parent,
      children: [],
      title: title.text,
      tokens: title.tokens,
      lowered: loweredCond(c),
      callterms: [...calls]
    }
    if (c.source) node.source = c.source
    if (c.k === 'fact') {
      node.fact = `${c.name}/${c.args.length}`
      const list = facts.get(node.fact) ?? []
      list.push(id)
      facts.set(node.fact, list)
    }
    if (c.k === 'axiom') node.axiom = c.axiom
    for (const name of calls) callterm(name).conds.push(id)
    graph.conds.push(node)
    index.cond.set(c, id)
    const kids = c.k === 'and' || c.k === 'or' || c.k === 'alt' ? c.items : c.k === 'not' ? [c.item] : []
    for (const child of kids) node.children.push(addCond(child, vars, owner, id))
    return id
  }

  for (const m of ir.methods) {
    const ids: number[] = []
    index.branch.push(ids)
    const gm: GraphMethod = {
      id: m.id,
      name: m.name,
      domain: m.domain,
      params: m.params.slice(),
      topLevel: m.topLevel,
      branches: ids,
      title: methodTitle(m)
    }
    if (m.source) gm.source = m.source
    graph.methods.push(gm)
    if (m.topLevel) graph.topLevel.push(m.id)
    m.branches.forEach((b, bi) => {
      const id = graph.branches.length
      ids.push(id)
      const gb: GraphBranch = { id, method: m.id, index: bi, name: b.name, cond: -1, tasks: [], vars: b.vars.slice(), title: branchTitle(b.name) }
      if (b.source) gb.source = b.source
      graph.branches.push(gb)
      if (b.cond) gb.cond = addCond(b.cond, b.vars, { branch: id }, -1)
      b.tasks.forEach((t, ti) => {
        const tid = graph.tasks.length
        const title = taskTitle(ir, t, b.vars)
        const calls = new Set<string>()
        callsIn(t.args, calls)
        const gt: GraphTask = { id: tid, branch: id, index: ti, kind: t.k, title: title.text, tokens: title.tokens, callterms: [...calls] }
        if (t.k !== 'prim') gt.method = t.method
        if (t.source) gt.source = t.source
        for (const name of calls) callterm(name).tasks.push(tid)
        graph.tasks.push(gt)
        index.task.set(t, tid)
        gb.tasks.push(tid)
      })
    })
  }
  for (const a of ir.axioms) {
    const ga: GraphAxiom = { id: a.id, name: a.name, domain: a.domain, params: a.params.map(p => ({ ...p })), cond: -1, title: axiomTitle(a) }
    if (a.source) ga.source = a.source
    graph.axioms.push(ga)
    if (a.cond) ga.cond = addCond(a.cond, a.vars, { axiom: a.id }, -1)
  }
  for (const key of ir.facts) if (!facts.has(key)) facts.set(key, [])
  graph.facts = [...facts].map(([key, conds]) => ({ key, conds }))
  for (const name of ir.callterms) callterm(name)
  graph.callterms = [...callterms.values()]
  return index
}
