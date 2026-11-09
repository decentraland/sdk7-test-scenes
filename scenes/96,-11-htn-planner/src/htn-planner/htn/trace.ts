// Debugger capture: PlanTraceRecorder turns the engine's trace (PlannerOptions.trace) into upstream's generated
// debugger node list, one PlanRun per decomposition. Port of urosidoki/htn_planner aec08fa
// HTNFramework/src/Translator/HTNGeneratedDebugger.h:
// - node kinds (:23-40), fields (:51-98): parent/children, started/completed/succeeded, source range, display name,
//   title tokens, variables before/after;
// - Begin/End events (:128-261); every re-entry after backtracking is a new node, so choice points and retries
//   stay in the history;
// - a composite condition pre-creates its whole subtree with started=false, so terms skipped by short-circuit stay
//   visible, and a later Begin reuses the pending node (:221-249, :532-627);
// - compiler temporaries never show (:215-218, is_internal): our IR has none, and a condition upstream lowers into
//   temporaries is one row (GraphCond.lowered);
// - upstream records neither the world, a failure reason nor timing. Ours on top: the rows a failed fact was checked
//   against, run metadata (seq, method, args, status, ms, host time, world revision) and a world snapshot per
//   revision.
// formatCond / formatBindings print a branch condition and its bindings the way they read in the .domain file
// (the 3D board). Pure, no SDK; costs nothing unless a recorder is attached.
import { nowMs } from './time'
import { Atom, formatAtom } from './atom'
import { graphIndex, GraphIndex } from './domain-graph'
import type { DomainGraph } from './domain-graph'
import type { AxiomId, CondIR, DomainIR, ExprIR, MethodId, SourceLoc, TaskIR, TermIR } from './ir'
import type { DecompositionStatus, PlanStep, PlanTracer, TraceScope } from './planner'
import { planTitle, TitleToken } from './titles'
import { FactRow, snapshotWorld, WorldSnapshot, WorldState } from './world-state'

/** Upstream HTNGeneratedDebugger::NodeKind (CallBind -> assign, BuiltinComparison -> cmp, BuiltinListSplit -> split). */
export type NodeKind =
  | 'plan'
  | 'method'
  | 'branch'
  | 'task'
  | 'axiom'
  | 'fact'
  | 'and'
  | 'or'
  | 'alt'
  | 'not'
  | 'call'
  | 'assign'
  | 'cmp'
  | 'split'

/** A bound variable (upstream Node::VariableValue); `name` without its '?', as upstream. */
export interface Binding {
  name: string
  value: Atom
}

/** One event node (upstream HTNGeneratedDebugger::Node). Ids are indices into PlanRun.nodes. */
export interface DebugNode {
  id: number
  /** Parent node id; -1 for the plan node. */
  parent: number
  kind: NodeKind
  /**
   * The IR element (upstream MetadataIndex), into the DomainGraph tables: plan/method -> methods (MethodId),
   * branch -> branches, task -> tasks, a condition (an axiom call site too) -> conds, an axiom scope -> axioms.
   */
  ref: number
  /** An axiom's own scope below its call site (upstream BeginAxiom: an Axiom node without title tokens). */
  impl?: true
  /** Upstream DisplayName. */
  name: string
  /** Coloured title (conditions and tasks; empty for plan, method, branch and axiom scope nodes, as upstream). */
  tokens: readonly TitleToken[]
  source?: SourceLoc
  /** False: pre-created for a composite and never reached (short-circuit). */
  started: boolean
  completed: boolean
  succeeded: boolean
  before: Binding[]
  after: Binding[]
  children: number[]
  /** Ours: a failed fact: the first rows of its name/arity it was checked against (none: the table was empty). */
  rows?: readonly FactRow[]
  /** Ours: how many rows the table had. */
  rowCount?: number
}

/** One decomposition: a top-level plan or a deferred `&` step being expanded. */
export interface PlanRun {
  /** Counter of runs seen by the recorder, so views can tell a fresh run. */
  seq: number
  deferred: boolean
  method: MethodId
  args: readonly Atom[]
  /** null while running. */
  status: DecompositionStatus | null
  plan: readonly PlanStep[]
  /** Duration of the decomposition, ms (recording included). */
  ms: number
  /** Host time when it started (RecorderOptions.time), e.g. the agent's clock in seconds. */
  t?: number
  /** WorldState.revision it planned against; the recorder keeps a snapshot per revision. */
  world: number
  nodes: DebugNode[]
}

export interface RecorderOptions {
  /** Runs kept in `runs` (lastPlan / lastDeferred are kept anyway). Default 16. */
  keep?: number
  /** Rows kept on a failed fact. Default 8. */
  rows?: number
  /** Snapshot the world once per revision (default true). */
  worlds?: boolean
  /** ms clock for PlanRun.ms; default performance.now() where there is one, else Date.now(). */
  clock?: () => number
  /** Host time stamped on each run (PlanRun.t). */
  time?: () => number
}

const NO_BINDINGS: Binding[] = []
const NO_TOKENS: readonly TitleToken[] = []
const NO_SCOPE: TraceScope = { v: [], names: [] }

function capture(scope: TraceScope): Binding[] {
  const v = scope.v
  const names = scope.names
  let out: Binding[] | undefined
  for (let i = 0; i < names.length; i++) {
    const value = v[i]
    if (value === undefined) continue
    const name = names[i]
    ;(out ??= []).push({ name: name.charCodeAt(0) === 63 ? name.slice(1) : name, value })
  }
  return out ?? NO_BINDINGS
}

const isCondKind = (k: NodeKind) => k !== 'plan' && k !== 'method' && k !== 'branch' && k !== 'task'

/**
 * Records every decomposition of one planner. Pass it as PlannerOptions.trace (decompose, PlanRunner, plannerFor).
 * Keeps the last top-level run, the last deferred run and the last `keep` runs, with a world snapshot per revision
 * they planned against.
 */
export class PlanTraceRecorder implements PlanTracer {
  lastPlan: PlanRun | null = null
  lastDeferred: PlanRun | null = null
  /** The last runs, oldest first. */
  readonly runs: PlanRun[] = []
  readonly graph: DomainGraph
  private readonly index: GraphIndex
  private readonly keep: number
  private readonly maxRows: number
  private readonly clock: () => number
  private run: PlanRun | null = null
  private nodes: DebugNode[] = []
  private open: number[] = []
  private seq = 0
  private startedAt = 0
  private readonly worldSnapshots = new Map<number, WorldSnapshot>()

  constructor(
    readonly domain: DomainIR,
    readonly options: RecorderOptions = {}
  ) {
    this.index = graphIndex(domain)
    this.graph = this.index.graph
    this.keep = Math.max(1, options.keep ?? 16)
    this.maxRows = Math.max(0, options.rows ?? 8)
    this.clock = options.clock ?? nowMs
  }

  /** Name of the branch the last top-level plan chose in its root method, or ''. */
  get chosenBranch(): string {
    return chosenBranchName(this.lastPlan, this.domain)
  }

  /** The world a run planned against, if kept. */
  world(revision: number): WorldSnapshot | undefined {
    return this.worldSnapshots.get(revision)
  }

  /** Every kept world snapshot, oldest first. */
  get worlds(): WorldSnapshot[] {
    return [...this.worldSnapshots.values()].sort((a, b) => a.revision - b.revision)
  }

  // ---- PlanTracer ------------------------------------------------------------------------------

  beginPlan(method: MethodId, args: readonly Atom[], deferred: boolean, world: WorldState): void {
    this.nodes = []
    this.open = []
    const m = this.domain.methods[method]
    this.run = {
      seq: ++this.seq,
      deferred,
      method,
      args: args.slice(),
      status: null,
      plan: [],
      ms: 0,
      world: world.revision,
      nodes: this.nodes
    }
    if (this.options.time) this.run.t = this.options.time()
    if (this.options.worlds !== false && !this.worldSnapshots.has(world.revision))
      this.worldSnapshots.set(world.revision, snapshotWorld(world))
    // Upstream BEGIN_PLAN comes before the entry arguments are bound (HTNCCodeGenerator.cpp :3363-3380): no Before.
    const node = this.add('plan', method, m ? planTitle(m) : '(?)', NO_TOKENS, m?.source, -1)
    this.open.push(node.id)
    this.startedAt = this.clock()
  }

  endPlan(status: DecompositionStatus, plan: readonly PlanStep[]): void {
    const run = this.run
    if (run === null) return
    // An aborted decomposition (depth_exceeded) unwinds with failure, as upstream's capacity exit does.
    while (this.open.length > 1) this.end(false, NO_SCOPE)
    const root = this.nodes[0]
    if (root && this.open.length === 1) {
      this.open.pop()
      root.completed = true
      root.succeeded = status === 'succeeded'
      const method = this.nodes[root.children[0]]
      root.after = method ? method.after : NO_BINDINGS
    }
    run.status = status
    run.plan = plan.slice()
    run.ms = this.clock() - this.startedAt
    if (run.deferred) this.lastDeferred = run
    else this.lastPlan = run
    this.runs.push(run)
    if (this.runs.length > this.keep) this.runs.shift()
    this.pruneWorlds()
    this.run = null
  }

  beginMethod(method: MethodId, scope: TraceScope): void {
    const g = this.graph.methods[method]
    this.push(this.add('method', method, g.title, NO_TOKENS, g.source, this.top()), scope)
  }

  beginBranch(method: MethodId, branch: number, scope: TraceScope): void {
    const id = this.index.branch[method][branch]
    const g = this.graph.branches[id]
    this.push(this.add('branch', id, g.title, NO_TOKENS, g.source, this.top()), scope)
  }

  beginTask(task: TaskIR, scope: TraceScope): void {
    const id = this.index.task.get(task) ?? -1
    const g = this.graph.tasks[id]
    this.push(this.add('task', id, g ? g.title : '(?)', g ? g.tokens : NO_TOKENS, g?.source, this.top()), scope)
  }

  beginCond(cond: CondIR, scope: TraceScope, again?: number): number {
    const ref = this.index.cond.get(cond) ?? -1
    const parent = this.top()
    let node = this.pending(parent, ref)
    if (node === undefined) node = this.createCond(ref, parent, true)
    else node.started = true
    this.open.push(node.id)
    const first = again === undefined ? undefined : this.nodes[again]
    node.before = first ? first.before : capture(scope)
    return node.id
  }

  beginAxiom(axiom: AxiomId, scope: TraceScope): void {
    const g = this.graph.axioms[axiom]
    const node = this.add('axiom', axiom, g.title, NO_TOKENS, g.source, this.top())
    node.impl = true
    this.push(node, scope)
  }

  end(ok: boolean, scope: TraceScope): void {
    if (this.open.length <= 1) return // the plan node closes in endPlan
    const node = this.nodes[this.open.pop() as number]
    node.completed = true
    node.succeeded = ok
    node.after = capture(scope)
  }

  factRows(rows: readonly FactRow[]): void {
    const node = this.nodes[this.top()]
    if (node === undefined) return
    node.rows = rows.slice(0, this.maxRows)
    node.rowCount = rows.length
  }

  // ---- internals -------------------------------------------------------------------------------

  private top(): number {
    return this.open.length > 0 ? this.open[this.open.length - 1] : -1
  }

  private add(kind: NodeKind, ref: number, name: string, tokens: readonly TitleToken[], source: SourceLoc | undefined, parent: number): DebugNode {
    const node: DebugNode = {
      id: this.nodes.length,
      parent,
      kind,
      ref,
      name,
      tokens,
      started: true,
      completed: false,
      succeeded: false,
      before: NO_BINDINGS,
      after: NO_BINDINGS,
      children: []
    }
    if (source) node.source = source
    this.nodes.push(node)
    if (parent >= 0) this.nodes[parent].children.push(node.id)
    return node
  }

  private push(node: DebugNode, scope: TraceScope): void {
    node.before = capture(scope)
    this.open.push(node.id)
  }

  /** Upstream FindPendingConditionChild: a pre-created, not yet started child for this condition. */
  private pending(parent: number, ref: number): DebugNode | undefined {
    if (parent < 0) return undefined
    for (const id of this.nodes[parent].children) {
      const child = this.nodes[id]
      if (!child.started && child.ref === ref && !child.impl && isCondKind(child.kind)) return child
    }
    return undefined
  }

  /** A condition node; a composite pre-creates its subtree, not started (CreateConditionMetadataChildren). */
  private createCond(ref: number, parent: number, started: boolean): DebugNode {
    const g = this.graph.conds[ref]
    const node = this.add(g ? g.kind : 'call', ref, g ? g.title : '(?)', g ? g.tokens : NO_TOKENS, g?.source, parent)
    node.started = started
    if (g && !g.lowered) for (const child of g.children) this.createCond(child, node.id, false)
    return node
  }

  private pruneWorlds(): void {
    if (this.worldSnapshots.size <= this.keep + 2) return
    const used = new Set(this.runs.map(r => r.world))
    if (this.lastPlan) used.add(this.lastPlan.world)
    if (this.lastDeferred) used.add(this.lastDeferred.world)
    for (const revision of [...this.worldSnapshots.keys()]) if (!used.has(revision)) this.worldSnapshots.delete(revision)
  }
}

// ---- reading a run -------------------------------------------------------------------------------

/** The run's entry method node (the plan node's child), or undefined. */
export function rootMethod(run: PlanRun | null): DebugNode | undefined {
  const plan = run?.nodes[0]
  return run && plan && plan.children.length > 0 ? run.nodes[plan.children[0]] : undefined
}

/** One branch a method node tried: its condition failed, it was chosen, or chosen and then its tasks failed. */
export interface BranchAttempt {
  /** Index of the branch in its method (BranchIR). */
  branch: number
  outcome: 'no_match' | 'chosen' | 'abandoned'
  node: DebugNode
  /** Method nodes its tasks decomposed. */
  children: DebugNode[]
}

/** The branch nodes of a method node, in the order tried. */
export function branchAttempts(run: PlanRun, method: DebugNode, graph: DomainGraph): BranchAttempt[] {
  const out: BranchAttempt[] = []
  for (const id of method.children) {
    const node = run.nodes[id]
    if (node.kind !== 'branch') continue
    const children: DebugNode[] = []
    let condOk = graph.branches[node.ref].cond < 0
    let tasks = false
    for (const c of node.children) {
      const child = run.nodes[c]
      if (child.kind === 'task') {
        tasks = true
        for (const m of child.children) if (run.nodes[m].kind === 'method') children.push(run.nodes[m])
      } else if (child.completed) condOk = child.succeeded // the root condition's last attempt
    }
    const outcome = node.succeeded ? 'chosen' : condOk || tasks ? 'abandoned' : 'no_match'
    out.push({ branch: graph.branches[node.ref].index, outcome, node, children })
  }
  return out
}

/** The chosen root branch of a run, or '' (no run, no plan). */
export function chosenBranchName(run: PlanRun | null, domain: DomainIR | null): string {
  const root = rootMethod(run)
  if (!root || !domain || !run) return ''
  const chosen = branchAttempts(run, root, graphIndex(domain).graph).find(a => a.outcome === 'chosen')
  return chosen ? domain.methods[root.ref].branches[chosen.branch].name : ''
}

/** Bindings of the chosen root branch (its After), or []. */
export function chosenBindings(run: PlanRun | null, domain: DomainIR): Binding[] {
  const root = rootMethod(run)
  if (!root || !run) return []
  const chosen = branchAttempts(run, root, graphIndex(domain).graph).find(a => a.outcome === 'chosen')
  return chosen ? chosen.node.after : []
}

/** Every branch name the run chose, root first (depth-first over chosen branches): 'method.branch'. */
export function chosenPath(run: PlanRun | null, domain: DomainIR): string[] {
  const out: string[] = []
  const graph = graphIndex(domain).graph
  const root = rootMethod(run)
  if (!run || !root) return out
  const walk = (m: DebugNode) => {
    for (const at of branchAttempts(run, m, graph)) {
      if (at.outcome !== 'chosen') continue
      out.push(`${domain.methods[m.ref].name}.${domain.methods[m.ref].branches[at.branch].name}`)
      at.children.forEach(walk)
    }
  }
  walk(root)
  return out
}

// ---- conditions as text (the 3D board) -----------------------------------------------------------

/** A branch condition in .domain syntax: `(lamp off) and (> ?n 0)`. `vars`: BranchIR.vars (or AxiomIR.vars). */
export function formatCond(domain: DomainIR, cond: CondIR | null, vars: readonly string[]): string {
  if (cond === null) return 'always'
  if (cond.k === 'and' && cond.items.length === 0) return 'always'
  if (cond.k === 'and') return cond.items.map(c => formatCondItem(domain, c, vars)).join(' and ')
  return formatCondItem(domain, cond, vars)
}

function formatCondItem(domain: DomainIR, c: CondIR, vars: readonly string[]): string {
  const ex = (e: ExprIR) => formatExpr(e, vars)
  const term = (t: TermIR) => (t.k === 'discard' ? '_' : ex(t))
  switch (c.k) {
    case 'and':
      return `(and ${c.items.map(i => formatCondItem(domain, i, vars)).join(' ')})`
    case 'or':
    case 'alt':
      return `(or ${c.items.map(i => formatCondItem(domain, i, vars)).join(' ')})`
    case 'not':
      return `(not ${formatCondItem(domain, c.item, vars)})`
    case 'fact':
      return `(${[c.name, ...c.args.map(term)].join(' ')})`
    case 'axiom':
      return `(#${[domain.axioms[c.axiom].name, ...c.args.map(term)].join(' ')})`
    case 'call':
      return `(${[c.name, ...c.args.map(ex)].join(' ')})`
    case 'assign':
      return `(= ${vars[c.slot] ?? '?'} ${ex(c.expr)})`
    case 'cmp':
      return `(${c.op} ${ex(c.a)} ${ex(c.b)})`
    case 'split':
      return `(split_list${c.from === 'back' ? '_back' : ''} ${ex(c.list)} ${term(c.a)} ${term(c.b)})`
  }
}

function formatExpr(e: ExprIR, vars: readonly string[]): string {
  switch (e.k) {
    case 'lit':
      return formatAtom(e.v)
    case 'var':
      return vars[e.slot] ?? '?'
    case 'list':
      return `(${e.items.map(i => formatExpr(i, vars)).join(' ')})`
    case 'arith':
    case 'call':
      return `(${[e.k === 'arith' ? e.op : e.name, ...e.args.map(a => formatExpr(a, vars))].join(' ')})`
  }
}

/** `?name=value` for the bound variables of an attempt, skipping the method's own parameters. */
export function formatBindings(vars: readonly string[], values: readonly (Atom | undefined)[] | undefined, skip = 0): string {
  if (!values) return ''
  const out: string[] = []
  for (let i = skip; i < vars.length; i++) if (values[i] !== undefined) out.push(`${vars[i]}=${formatAtom(values[i] as Atom)}`)
  return out.join(' ')
}

/** `?name=value` per binding, skipping the names in `skip` (written with '?', e.g. a method's params). */
export function formatBound(bindings: readonly Binding[], skip: readonly string[] = []): string {
  return bindings
    .filter(b => !skip.includes('?' + b.name))
    .map(b => `?${b.name}=${formatAtom(b.value)}`)
    .join(' ')
}

/**
 * `tracer` without the runs of some top-level methods, e.g. the running-plan check (GuardAgentOptions.activePlan),
 * which the agent plans on every tick a step runs with the same planner factory as `behave`: recorded, its runs
 * would fill the recorder's `runs` and replace its `lastPlan`. Pass this as PlannerOptions.trace and read the
 * recorder as usual. Deferred runs are kept whatever their method (they expand a recorded plan).
 */
export function skipRuns(tracer: PlanTracer, domain: DomainIR, methods: readonly string[]): PlanTracer {
  let skipping = false
  return {
    beginPlan(method, args, deferred, world) {
      skipping = !deferred && methods.includes(domain.methods[method]?.name ?? '')
      if (!skipping) tracer.beginPlan(method, args, deferred, world)
    },
    endPlan(status, plan) {
      if (skipping) skipping = false
      else tracer.endPlan(status, plan)
    },
    beginMethod(method, scope) {
      if (!skipping) tracer.beginMethod(method, scope)
    },
    beginBranch(method, branch, scope) {
      if (!skipping) tracer.beginBranch(method, branch, scope)
    },
    beginTask(task, scope) {
      if (!skipping) tracer.beginTask(task, scope)
    },
    beginCond(cond, scope, again) {
      return skipping ? -1 : tracer.beginCond(cond, scope, again)
    },
    beginAxiom(axiom, scope) {
      if (!skipping) tracer.beginAxiom(axiom, scope)
    },
    end(ok, scope) {
      if (!skipping) tracer.end(ok, scope)
    },
    factRows(rows) {
      if (!skipping) tracer.factRows(rows)
    }
  }
}
