// The planning view of the session viewer: a run as a refinement tree (Nau, Acting, Planning and Learning ch. 5:
// task -> method instance -> subtasks), drawn like the decomposition figures of a paper:
// - a task node per decomposed task, its call with values (`attack(2)`);
// - a card per branch the planner tried, in order: chosen ✓, failed × (its precondition did not hold), backtracked ↶
//   (it held, a subtask failed later); the card's lines are its precondition with the values bound, the failing
//   literal with what it found (`no rows`, `1 row, none match`);
// - one grey "not tried" leaf per method for the branches it never reached;
// - plan steps as leaves, as the planner evaluated them.
// Card lines, Normal: one line per term of the precondition, in the domain's order, read at its last success (else
// its last attempt), with ↺N when it was tried N times: the reading of a figure, where a choice point that ran out
// of rows is not the cause and a backtracked candidate does not hide the one that held. (Upstream's Normal view,
// htn/trace-view.ts, groups the same attempts as choice rows in the order the nodes were created; the in-scene
// debugger shows it as is.) Verbose: every node in the order recorded, terms never reached in grey, as upstream's
// Verbose. A branch whose children hold several condition-then-subtasks attempts (a re-entry after a subtask failed)
// gets one `attempt` node per attempt. Folding: a failed or backtracked node with children starts closed ("× N
// attempts" in the figure) unless the run failed and the node is on the path to its last failed branch.
// Pure; never throws on a malformed run (it draws what it can).
import type { Atom } from '../../../src/htn-planner/htn/atom'
import type { DomainGraph } from '../../../src/htn-planner/htn/domain-graph'
import type { Binding, DebugNode, PlanRun } from '../../../src/htn-planner/htn/trace'
import type { ViewMode } from '../../../src/htn-planner/htn/trace-view'
import { committedSteps } from '../../../src/debugger/plan-path'
import { literalLabel, stepLabel } from './format'

export type FigStatus = 'chosen' | 'failed' | 'backtracked' | 'untried' | 'running'
export type FigKind = 'task' | 'branch' | 'attempt' | 'step' | 'untried' | 'failures'

/** One line of a branch card: a condition term with its values. */
export interface CondLine {
  node: number
  /** Indent inside the card (0: a conjunct of the precondition). */
  depth: number
  text: string
  /** chosen: it held; failed; untried: never reached (Verbose); running: no result. */
  status: FigStatus
  /** Normal: how many times it was tried, when more than once. */
  retries?: number
  /** A failed fact: `no rows`, `3 rows, none match`. */
  note?: string
}

export interface FigNode {
  /** Stable per run: `n<node id>` (a node of the run), `u<method node id>` (its untried branches). */
  key: string
  kind: FigKind
  status: FigStatus
  title: string
  /** A second line: the untried branch names, `deferred`. */
  sub?: string
  lines: CondLine[]
  /** The run's node it stands for (a task: its task node, the root: the plan node), -1 for none. */
  node: number
  children: FigNode[]
  open: boolean
  /** Failed and backtracked branches and attempts below it: what a closed node hides ("× N attempts"). */
  hiddenFailures: number
}

export interface PlanTreeOptions {
  /** Normal (default): one line per term; Verbose: every attempt as recorded. */
  mode?: ViewMode
  /** The user's folds by FigNode key; anything missing takes the default. */
  open?: ReadonlyMap<string, boolean>
}

const isCond = (n: DebugNode) => n.kind !== 'plan' && n.kind !== 'method' && n.kind !== 'branch' && n.kind !== 'task'
const isGroup = (n: DebugNode) => n.kind === 'and' || n.kind === 'or' || n.kind === 'alt'
const isFailure = (n: FigNode) => (n.kind === 'branch' || n.kind === 'attempt') && (n.status === 'failed' || n.status === 'backtracked')

/** What a node shows for a variable: what it bound once it succeeded, else what it started with. */
function lookupOf(n: DebugNode): (name: string) => Atom | undefined {
  const pick = (bs: readonly Binding[], name: string) => bs.find(b => b.name === name)?.value
  return name => (n.completed && n.succeeded ? pick(n.after, name) : undefined) ?? pick(n.before, name) ?? pick(n.after, name)
}

function constantsOf(n: DebugNode): Map<string, string> {
  const out = new Map<string, string>()
  for (const t of n.tokens) if (t.kind === 'const' && t.value !== undefined) out.set(t.text, t.value)
  return out
}

const WILDCARD: Atom = { t: 'sym', v: '_' }

/** A node's title with its values: `health(1, 15)`; a variable a node that held left unbound is a wildcard, `_`. */
export function nodeLabel(n: DebugNode): string {
  const lookup = lookupOf(n)
  const held = n.completed && n.succeeded
  return literalLabel(n.name, held ? name => lookup(name) ?? WILDCARD : lookup, constantsOf(n))
}

function nodeStatus(n: DebugNode): FigStatus {
  if (!n.started) return 'untried'
  if (!n.completed) return 'running'
  return n.succeeded ? 'chosen' : 'failed'
}

function factNote(n: DebugNode): string | undefined {
  if (n.kind !== 'fact' || !n.completed || n.succeeded || n.rowCount === undefined) return undefined
  return n.rowCount === 0 ? 'no rows' : `${n.rowCount} row${n.rowCount === 1 ? '' : 's'}, none match`
}

class Builder {
  /** Plan steps by the task node that made them (the committed path), for their evaluated arguments. */
  private readonly steps = new Map<number, string>()

  constructor(
    readonly run: PlanRun,
    readonly graph: DomainGraph,
    readonly mode: ViewMode
  ) {
    try {
      committedSteps(run).forEach((s, i) => {
        const step = run.plan[i]
        if (step) this.steps.set(s.node, stepLabel(step.name, step.args))
      })
    } catch {
      // a malformed run: titles fall back to the trace's own
    }
  }

  private kids(n: DebugNode): DebugNode[] {
    const out: DebugNode[] = []
    for (const id of n.children) {
      const c = this.run.nodes[id]
      if (c) out.push(c)
    }
    return out
  }

  /** Condition children shown in this mode (Normal: those that started). */
  private condKids(n: DebugNode): DebugNode[] {
    return this.kids(n).filter(c => isCond(c) && (this.mode === 'verbose' || c.started))
  }

  // ---- card lines ----------------------------------------------------------------------------

  /** Lines for sibling condition nodes: Verbose every node, Normal one per term (its last success, else last). */
  lines(nodes: readonly DebugNode[], depth: number, out: CondLine[]): CondLine[] {
    if (this.mode === 'verbose') {
      for (const n of nodes) this.line(n, depth, out, 1)
      return out
    }
    const groups = new Map<string, DebugNode[]>()
    for (const n of nodes) {
      const key = `${n.kind}:${n.ref}:${n.impl ? 1 : 0}`
      const g = groups.get(key)
      if (g) g.push(n)
      else groups.set(key, [n])
    }
    for (const g of groups.values()) {
      const started = g.filter(n => n.started)
      if (started.length === 0) continue
      let pick = started[started.length - 1]
      for (const n of started) if (n.completed && n.succeeded) pick = n
      this.line(pick, depth, out, started.length)
    }
    return out
  }

  private line(n: DebugNode, depth: number, out: CondLine[], tries: number): void {
    const status = nodeStatus(n)
    const push = (text: string): CondLine => {
      const l: CondLine = { node: n.id, depth, text, status }
      if (tries > 1) l.retries = tries
      out.push(l)
      return l
    }
    if (n.impl) {
      // An axiom's scope: its body reads as the call site's (upstream FlattenAxiomImplementationChildren).
      this.lines(this.condKids(n), depth, out)
      return
    }
    if (n.kind === 'and' && depth === 0) {
      // The precondition's own conjunction: its terms are the card's lines.
      this.lines(this.condKids(n), depth, out)
      return
    }
    if (n.kind === 'not') {
      const inner = this.condKids(n)
      const only = inner.length === 1 ? inner[0] : undefined
      if (only && !isGroup(only)) {
        push(`¬ ${nodeLabel(only)}`)
        this.lines(this.condKids(only), depth + 1, out)
        return
      }
      push(only ? `¬ ${only.kind === 'and' ? 'all of' : 'any of'}` : '¬')
      this.lines(only ? this.condKids(only) : inner, depth + 1, out)
      return
    }
    if (isGroup(n)) {
      push(n.kind === 'and' ? 'all of' : n.kind === 'or' ? 'any of' : 'first of')
      this.lines(this.condKids(n), depth + 1, out)
      return
    }
    const l = push(nodeLabel(n))
    const note = factNote(n)
    if (note) l.note = note
    this.lines(this.condKids(n), depth + 1, out)
  }

  // ---- figure nodes --------------------------------------------------------------------------

  /** A task of a branch: a step leaf, or a decomposed task with the branches its method tried. */
  task(n: DebugNode): FigNode {
    const methods = this.kids(n).filter(c => c.kind === 'method')
    const method = methods[methods.length - 1]
    const status = nodeStatus(n)
    if (!method) {
      const node: FigNode = { key: `n${n.id}`, kind: 'step', status, title: this.steps.get(n.id) ?? nodeLabel(n), lines: [], node: n.id, children: [], open: true, hiddenFailures: 0 }
      if (this.graph.tasks[n.ref]?.kind === 'defer') node.sub = 'deferred: planned when reached'
      return node
    }
    return { key: `n${n.id}`, kind: 'task', status, title: nodeLabel(n), lines: [], node: n.id, children: this.method(method), open: true, hiddenFailures: 0 }
  }

  /** A method node's branches, in the order tried, and one leaf for those it never tried. */
  method(m: DebugNode): FigNode[] {
    const out: FigNode[] = []
    const tried = new Set<number>()
    for (const c of this.kids(m)) {
      if (c.kind !== 'branch') continue
      tried.add(c.ref)
      out.push(this.branch(c))
    }
    groupFailures(out, m.id)
    const gm = this.graph.methods[m.ref]
    const untried = (gm?.branches ?? []).filter(b => !tried.has(b)).map(b => this.graph.branches[b]?.name ?? '?')
    if (untried.length > 0)
      out.push({ key: `u${m.id}`, kind: 'untried', status: 'untried', title: 'not tried', sub: untried.join(', '), lines: [], node: -1, children: [], open: true, hiddenFailures: 0 })
    return out
  }

  /** A branch card; several attempts (condition, then subtasks) become one `attempt` node each. */
  branch(b: DebugNode): FigNode {
    const title = this.graph.branches[b.ref]?.name ?? b.name
    const attempts: { conds: DebugNode[]; tasks: DebugNode[] }[] = []
    let cur: { conds: DebugNode[]; tasks: DebugNode[] } = { conds: [], tasks: [] }
    for (const c of this.kids(b)) {
      if (c.kind === 'task') cur.tasks.push(c)
      else if (isCond(c)) {
        if (cur.tasks.length > 0) {
          attempts.push(cur)
          cur = { conds: [], tasks: [] }
        }
        if (this.mode === 'verbose' || c.started) cur.conds.push(c)
      }
    }
    if (cur.conds.length > 0 || cur.tasks.length > 0 || attempts.length === 0) attempts.push(cur)
    const withTasks = (s: FigStatus, tasks: readonly unknown[]): FigStatus => (s === 'failed' && tasks.length > 0 ? 'backtracked' : s)
    if (attempts.length === 1) {
      const a = attempts[0]
      return {
        key: `n${b.id}`,
        kind: 'branch',
        status: withTasks(nodeStatus(b), a.tasks),
        title,
        lines: this.lines(a.conds, 0, []),
        node: b.id,
        children: a.tasks.map(t => this.task(t)),
        open: true,
        hiddenFailures: 0
      }
    }
    const children = attempts.map((a, i): FigNode => {
      const condFailed = a.conds.some(c => c.completed && !c.succeeded)
      const tasksOk = a.tasks.length > 0 && a.tasks.every(t => t.completed && t.succeeded)
      const own: FigStatus = i === attempts.length - 1 ? nodeStatus(b) : !condFailed && tasksOk ? 'chosen' : 'failed'
      const first = a.conds[0] ?? a.tasks[0]
      return {
        key: `n${first.id}`,
        kind: 'attempt',
        status: withTasks(own, condFailed ? [] : a.tasks),
        title: `attempt ${i + 1} of ${attempts.length}`,
        lines: this.lines(a.conds, 0, []),
        node: first.id,
        children: a.tasks.map(t => this.task(t)),
        open: true,
        hiddenFailures: 0
      }
    })
    return { key: `n${b.id}`, kind: 'branch', status: withTasks(nodeStatus(b), children), title, lines: [], node: b.id, children, open: true, hiddenFailures: 0 }
  }
}

/** Consecutive branches whose precondition failed, from this many on, read as one card (a line each). */
export const GROUP_FAILURES = 3

/** The failing term of a branch card: its last failed line at the top level, else its last failed line. */
export function failingLine(n: FigNode): CondLine | undefined {
  let top: CondLine | undefined
  let any: CondLine | undefined
  for (const l of n.lines) {
    if (l.status !== 'failed') continue
    any = l
    if (l.depth === 0) top = l
  }
  return top ?? any
}

/**
 * Runs of GROUP_FAILURES or more branches that failed at their precondition (no subtasks) become one `failures`
 * card: a line per branch with the term that did not hold; opening it shows their own cards.
 */
function groupFailures(out: FigNode[], method: number): void {
  for (let i = 0; i < out.length; i++) {
    let j = i
    while (j < out.length && out[j].kind === 'branch' && out[j].status === 'failed' && out[j].children.length === 0) j++
    if (j - i < GROUP_FAILURES) continue
    const run = out.slice(i, j)
    const lines: CondLine[] = run.map(b => {
      const f = failingLine(b)
      const l: CondLine = { node: b.node, depth: 0, text: f ? `${b.title}: ${f.text}` : b.title, status: 'failed' }
      if (f?.note) l.note = f.note
      return l
    })
    const group: FigNode = {
      key: `g${method}-${run[0].node}`,
      kind: 'failures',
      status: 'failed',
      title: `${run.length} branches failed`,
      sub: 'their preconditions did not hold',
      lines,
      node: -1,
      children: run,
      open: false,
      hiddenFailures: 0
    }
    out.splice(i, j - i, group)
  }
}

/** Every node of a figure, pre-order (closed nodes' children too). */
export function figNodes(root: FigNode): FigNode[] {
  const out: FigNode[] = []
  const walk = (n: FigNode) => {
    out.push(n)
    n.children.forEach(walk)
  }
  walk(root)
  return out
}

/** The path from the root to the branch (or attempt) that failed last, in the order the planner tried them; [] for none. */
export function failurePath(root: FigNode): FigNode[] {
  let last: FigNode[] = []
  let lastId = -1
  const walk = (n: FigNode, path: FigNode[]) => {
    const here = [...path, n]
    if (isFailure(n) && n.node > lastId) {
      lastId = n.node
      last = here
    }
    n.children.forEach(c => walk(c, here))
  }
  walk(root, [])
  return last
}

export interface FailureCause {
  /** The task whose branch failed last: `patrol(1)`. */
  task: string
  /** That branch; an attempt of it reads `walk_route, attempt 2 of 3`. */
  branch: string
  /** The term that did not hold, with what it found; absent when the branch's own terms held (a subtask failed). */
  line?: CondLine
}

/** Why a failed run failed, read off its figure: the last branch tried that failed and its failing term. */
export function failureCause(root: FigNode): FailureCause | null {
  const path = failurePath(root)
  const at = path[path.length - 1]
  if (!at) return null
  let task = root.title
  let branch = at.title
  for (let i = path.length - 2; i >= 0; i--) {
    const p = path[i]
    if (p.kind === 'task') {
      task = p.title
      break
    }
    if (p.kind === 'branch' && at.kind === 'attempt') branch = `${p.title}, ${at.title}`
  }
  const cause: FailureCause = { task, branch }
  const line = failingLine(at)
  if (line) cause.line = line
  return cause
}

/** Folds: failures hidden below each node, and the default open state where the user set none. */
function fold(root: FigNode, run: PlanRun, opts: PlanTreeOptions): void {
  // The last branch that failed, in the order the planner tried them: the path to it stays open.
  const onPath = new Set<string>(run.status !== 'succeeded' ? failurePath(root).map(n => n.key) : [])
  const visit = (n: FigNode): number => {
    let hidden = 0
    for (const c of n.children) hidden += visit(c) + (isFailure(c) ? 1 : 0)
    n.hiddenFailures = hidden
    const failed = n.status === 'failed' || n.status === 'backtracked'
    const byDefault = n.kind === 'failures' ? false : !failed || onPath.has(n.key) || n === root
    n.open = n.children.length === 0 ? true : (opts.open?.get(n.key) ?? byDefault)
    return hidden
  }
  visit(root)
}

/**
 * The refinement tree of a run: its entry task at the root (the plan node: `name(args)`), the branches each
 * decomposed task tried, the subtasks of each. Null for a run without nodes.
 */
export function planTree(run: PlanRun, graph: DomainGraph, opts: PlanTreeOptions = {}): FigNode | null {
  const plan = run.nodes[0]
  if (!plan || plan.kind !== 'plan') return null
  const b = new Builder(run, graph, opts.mode ?? 'normal')
  const method = plan.children.map(id => run.nodes[id]).find(c => c?.kind === 'method')
  const name = graph.methods[run.method]?.name ?? plan.name.replace(/^\(|\)$/g, '')
  const root: FigNode = {
    key: `n${plan.id}`,
    kind: 'task',
    status: nodeStatus(plan),
    title: stepLabel(name, run.args),
    lines: [],
    node: plan.id,
    children: method ? b.method(method) : [],
    open: true,
    hiddenFailures: 0
  }
  fold(root, run, opts)
  return root
}
