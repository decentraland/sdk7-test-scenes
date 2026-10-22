// Shape metrics of one root domain (includes merged), with the definitions of
// docs/htn-lint.md ("Method"), so the numbers match that report:
// - methods: every (:method ...) declaration, overloads apart; top: marked top_level_method;
// - depth: method levels on the longest direct call chain from a top-level method, recursion cut (a top method with
//   only primitives = 1); deferred `&` calls do not count;
// - 1-step: branches with exactly one task;
// - primitive-only top branches: top-level branches whose tasks are all primitives (an empty task list is not);
// - bookkeeping: primitive occurrences that are bookkeeping (declared in the config, else by name: bookkeepingMatcher);
// - duplicated tails: maximal groups of >= 3 identical task heads (names only) ending two or more branches.
import type { Branch } from '../htn/ast'
import { directComponents, taskHead } from './model'
import type { Decl, DomainModel } from './model'
import type { Method } from '../htn/ast'

export interface DomainMetrics {
  methods: number
  topMethods: number
  branches: number
  branchesPerMethod: { avg: number; max: number }
  topBranches: number
  depth: number
  oneStepBranches: number
  oneStepShare: number // 0..1, rounded to 0.01
  oneStepTopBranches: number
  primitiveOnlyTopBranches: number
  primitiveOnlyTopShare: number
  bookkeepingTopBranches: number // top-level branches whose tasks are all bookkeeping primitives
  primitiveOccurrences: number
  bookkeepingOccurrences: number
  bookkeepingShare: number
  duplicatedTails: number
  longestDuplicatedTail: number
  axioms: number
  constants: number
  includes: number
}

export interface BranchRef {
  method: Decl<Method>
  branch: Branch
  index: number
}

export interface TailGroup {
  heads: string[] // the shared tail, in task order
  branches: BranchRef[]
}

const round = (x: number) => Math.round(x * 100) / 100

export function allBranches(model: DomainModel): BranchRef[] {
  return model.methods.flatMap(method => method.decl.branches.map((branch, index) => ({ method, branch, index })))
}

/** Maximal duplicated tails: a group is kept when no longer tail is shared by the same branches. */
export function duplicatedTails(model: DomainModel, minLength = 3): TailGroup[] {
  interface Node {
    children: Map<string, Node>
    refs: BranchRef[]
    heads: string[]
  }
  const root: Node = { children: new Map(), refs: [], heads: [] }
  for (const ref of allBranches(model)) {
    let node = root
    for (let i = ref.branch.tasks.length - 1; i >= 0; i--) {
      const head = taskHead(ref.branch.tasks[i])
      let next = node.children.get(head)
      if (!next) {
        next = { children: new Map(), refs: [], heads: [head, ...node.heads] }
        node.children.set(head, next)
      }
      next.refs.push(ref)
      node = next
    }
  }
  const out: TailGroup[] = []
  const visit = (node: Node) => {
    if (node.heads.length >= minLength && node.refs.length >= 2 && ![...node.children.values()].some(c => c.refs.length === node.refs.length))
      out.push({ heads: node.heads, branches: node.refs })
    for (const child of node.children.values()) if (child.refs.length >= 2) visit(child)
  }
  visit(root)
  return out
}

/** Method levels on the longest direct call chain from `id`, recursion cut. */
function depthFrom(model: DomainModel, id: number, path: Set<number>, memo: Map<number, number>, inCycle: boolean[]): number {
  const known = memo.get(id)
  if (known !== undefined) return known
  path.add(id)
  let best = 0
  for (const next of model.direct[id]) if (!path.has(next)) best = Math.max(best, depthFrom(model, next, path, memo, inCycle))
  path.delete(id)
  const depth = best + 1
  if (!inCycle[id]) memo.set(id, depth)
  return depth
}

export function domainDepth(model: DomainModel): number {
  const scc = directComponents(model)
  const inCycle = model.methods.map(m => scc.recursive[scc.of[m.id]])
  const memo = new Map<number, number>()
  return model.top.reduce((d, id) => Math.max(d, depthFrom(model, id, new Set(), memo, inCycle)), 0)
}

export const isPrimitiveOnly = (b: Branch) => b.tasks.length > 0 && b.tasks.every(t => t.kind === 'prim')
export const isBookkeepingOnly = (b: Branch, bookkeeping: (head: string) => boolean) =>
  b.tasks.length > 0 && b.tasks.every(t => t.kind === 'prim' && bookkeeping(taskHead(t)))

export function domainMetrics(model: DomainModel, bookkeeping: (head: string) => boolean, tails: TailGroup[]): DomainMetrics {
  const branches = allBranches(model)
  const top = branches.filter(r => r.method.decl.topLevel)
  const perMethod = model.methods.map(m => m.decl.branches.length)
  const prims = branches.flatMap(r => r.branch.tasks.filter(t => t.kind === 'prim'))
  const bookkept = prims.filter(t => bookkeeping(taskHead(t))).length
  const oneStep = branches.filter(r => r.branch.tasks.length === 1).length
  const primOnlyTop = top.filter(r => isPrimitiveOnly(r.branch)).length
  return {
    methods: model.methods.length,
    topMethods: model.top.length,
    branches: branches.length,
    branchesPerMethod: {
      avg: perMethod.length ? round(perMethod.reduce((a, b) => a + b, 0) / perMethod.length) : 0,
      max: perMethod.reduce((a, b) => Math.max(a, b), 0)
    },
    topBranches: top.length,
    depth: domainDepth(model),
    oneStepBranches: oneStep,
    oneStepShare: branches.length ? round(oneStep / branches.length) : 0,
    oneStepTopBranches: top.filter(r => r.branch.tasks.length === 1).length,
    primitiveOnlyTopBranches: primOnlyTop,
    primitiveOnlyTopShare: top.length ? round(primOnlyTop / top.length) : 0,
    bookkeepingTopBranches: top.filter(r => isBookkeepingOnly(r.branch, bookkeeping)).length,
    primitiveOccurrences: prims.length,
    bookkeepingOccurrences: bookkept,
    bookkeepingShare: prims.length ? round(bookkept / prims.length) : 0,
    duplicatedTails: tails.length,
    longestDuplicatedTail: tails.reduce((n, g) => Math.max(n, g.heads.length), 0),
    axioms: model.axioms.length,
    constants: model.modules.reduce((n, m) => n + m.groups.reduce((k, g) => k + g.constants.length, 0), 0),
    includes: model.modules.length - 1
  }
}
