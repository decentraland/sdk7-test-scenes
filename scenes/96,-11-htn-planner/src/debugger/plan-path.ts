// The plan inside a run: the task nodes that made each step of the plan (the committed path), the breadcrumb from
// the plan's root to one step, and the plan strip (done / running / next). Ours: upstream HTNDemo lists the plan
// with `>` on the current step (HTNNPCSimulationPanel.cpp RenderSelectedNPCPlan); the breadcrumb follows HTN Plan
// Player. Pure, no SDK.
import { formatTask } from '../htn-planner/htn/atom'
import type { DebugNode, DomainGraph, PlanRun } from '../htn-planner'

export interface CommittedStep {
  /** The task node of the step (a primitive or an `&` task). */
  node: number
  /** Node ids from the plan node down to it: plan, method, branch, task, method, branch, ..., task. */
  path: number[]
}

/**
 * The steps of a successful run, in plan order, each with its path. Walks the branch each method committed to
 * (the last one that succeeded) and, per task of that branch, the last node tried for it (a re-entry after
 * backtracking is a newer node). Empty when the run did not succeed.
 */
export function committedSteps(run: PlanRun): CommittedStep[] {
  const out: CommittedStep[] = []
  const nodes = run.nodes
  const plan = nodes[0]
  if (!plan || run.status !== 'succeeded') return out
  const walkMethod = (m: DebugNode, path: number[]) => {
    let branch: DebugNode | undefined
    for (const id of m.children) {
      const c = nodes[id]
      if (c.kind === 'branch' && c.completed && c.succeeded) branch = c
    }
    if (!branch) return
    const at = [...path, m.id, branch.id]
    const byRef = new Map<number, DebugNode>()
    for (const id of branch.children) {
      const c = nodes[id]
      if (c.kind === 'task') byRef.set(c.ref, c)
    }
    const tasks = [...byRef.values()].sort((a, b) => a.ref - b.ref)
    for (const t of tasks) {
      const method = lastChild(nodes, t, 'method')
      if (method) walkMethod(method, [...at, t.id])
      else out.push({ node: t.id, path: [...at, t.id] })
    }
  }
  const root = lastChild(nodes, plan, 'method')
  if (root) walkMethod(root, [plan.id])
  return out
}

function lastChild(nodes: readonly DebugNode[], n: DebugNode, kind: DebugNode['kind']): DebugNode | undefined {
  let found: DebugNode | undefined
  for (const id of n.children) if (nodes[id].kind === kind) found = nodes[id]
  return found
}

export interface Crumb {
  node: number
  kind: 'method' | 'branch' | 'task'
  label: string
}

/** The breadcrumb of a path: `behave`, `patrol`, `(go_to ?p)`, ... (the plan node left out). */
export function crumbs(run: PlanRun, graph: DomainGraph, path: readonly number[]): Crumb[] {
  const out: Crumb[] = []
  for (const id of path) {
    const n = run.nodes[id]
    if (n.kind === 'method') out.push({ node: id, kind: 'method', label: graph.methods[n.ref]?.name ?? n.name })
    else if (n.kind === 'branch') out.push({ node: id, kind: 'branch', label: graph.branches[n.ref]?.name ?? n.name })
    else if (n.kind === 'task') out.push({ node: id, kind: 'task', label: graph.tasks[n.ref]?.title ?? n.name })
  }
  return out
}

export type StripState = 'done' | 'current' | 'next'

export interface StripItem {
  text: string
  state: StripState
  /** Index of the step in the run's plan, -1 when the strip does not come from the run. */
  step: number
}

export interface PlanStrip {
  items: StripItem[]
  /** The step of the run that runs now (or is next), -1 when none does (another plan, or this one finished). */
  current: number
  /** The strip is the run's own plan (running, or finished with its steps), not the host's other plan. */
  fromRun: boolean
}

/** The run's plan, formatted as the hosts format their steps. */
export function planTexts(run: PlanRun | null): string[] {
  return run ? run.plan.map(s => formatTask(s.name, s.args)) : []
}

/**
 * Done / current / next. When the host's remaining steps are the tail of the run's plan, the strip is the run's
 * plan with the host's position in it; otherwise (another run, a deferred step expanded since) it is the host's own
 * recent done steps and its remaining steps.
 */
export function planStrip(plan: readonly string[], remaining: readonly string[], running: boolean, done: readonly string[]): PlanStrip {
  const tail = plan.length - remaining.length
  // A finished host matches any plan by its (empty) remaining steps: its last done steps must end this plan.
  const ended = (n: number) => done.slice(-n).every((s, i) => s === plan[plan.length - Math.min(n, done.length) + i])
  const matches =
    plan.length > 0 && tail >= 0 && remaining.every((s, i) => s === plan[tail + i]) && (remaining.length > 0 || ended(plan.length))
  if (matches) {
    const items: StripItem[] = plan.map((text, i) => ({
      text,
      state: i < tail ? 'done' : i === tail && running ? 'current' : 'next',
      step: i
    }))
    return { items, current: tail < plan.length ? tail : -1, fromRun: true }
  }
  const items: StripItem[] = done.map(text => ({ text, state: 'done' as const, step: -1 }))
  remaining.forEach((text, i) => items.push({ text, state: i === 0 && running ? 'current' : 'next', step: -1 }))
  return { items, current: -1, fromRun: false }
}
