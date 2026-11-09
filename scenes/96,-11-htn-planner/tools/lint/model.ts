// The shape of one root domain as htn:lint reads it: the compiler's parsed modules (tools/htn/ast.ts, includes
// first, root last) with every declaration numbered, calls resolved as the linker resolves them (an unqualified call
// to the effective, most derived declaration of its name/arity; `Domain::name` to that domain's own), and the call
// graph (direct method calls and deferred `&` calls apart). Read-only over the AST; no planner code.
import { signature } from '../htn/ast'
import type { Axiom, Branch, Cond, Domain, Method, Task, Value } from '../htn/ast'

export interface Decl<T> {
  id: number
  module: Domain
  decl: T
  sig: string // name/arity
}

export interface DomainModel {
  modules: Domain[]
  files: string[] // per module (Loc.file), as the loader got them
  root: Domain
  methods: Decl<Method>[]
  axioms: Decl<Axiom>[]
  /** Per method id: callees of its direct (method) tasks, and of its deferred (`&`) tasks; unresolved left out. */
  direct: number[][]
  deferred: number[][]
  /** Top-level methods (marked top_level_method). */
  top: number[]
  resolveTask(task: Task): number | undefined
  resolveAxiom(name: string, arity: number): number | undefined
}

export function buildModel(modules: Domain[], files: string[]): DomainModel {
  const methods: Decl<Method>[] = []
  const axioms: Decl<Axiom>[] = []
  const effM = new Map<string, number>()
  const qualM = new Map<string, number>()
  const effA = new Map<string, number>()
  const qualA = new Map<string, number>()
  for (const module of modules) {
    for (const decl of module.axioms) {
      const sig = signature(decl.name, decl.params.length)
      qualA.set(`${module.name}::${sig}`, axioms.length)
      effA.set(sig, axioms.length)
      axioms.push({ id: axioms.length, module, decl, sig })
    }
    for (const decl of module.methods) {
      const sig = signature(decl.name, decl.params.length)
      qualM.set(`${module.name}::${sig}`, methods.length)
      effM.set(sig, methods.length)
      methods.push({ id: methods.length, module, decl, sig })
    }
  }
  const resolve = (name: string, arity: number, qual: Map<string, number>, eff: Map<string, number>) =>
    (name.includes('::') ? qual : eff).get(signature(name, arity))
  const resolveTask = (task: Task) => (task.kind === 'prim' ? undefined : resolve(task.name, task.args.length, qualM, effM))
  const resolveAxiom = (name: string, arity: number) => resolve(name, arity, qualA, effA)
  const direct = methods.map(m => uniq(m.decl.branches.flatMap(b => b.tasks.filter(t => t.kind === 'method').map(resolveTask))))
  const deferred = methods.map(m => uniq(m.decl.branches.flatMap(b => b.tasks.filter(t => t.kind === 'defer').map(resolveTask))))
  const top = methods.filter(m => m.decl.topLevel).map(m => m.id)
  return { modules, files, root: modules[modules.length - 1], methods, axioms, direct, deferred, top, resolveTask, resolveAxiom }
}

function uniq(ids: (number | undefined)[]): number[] {
  return [...new Set(ids.filter((i): i is number => i !== undefined))]
}

/** Methods reachable from the top-level methods through direct and deferred calls. */
export function reachableMethods(model: DomainModel): Set<number> {
  const seen = new Set<number>(model.top)
  const queue = [...model.top]
  while (queue.length) {
    const id = queue.pop() as number
    for (const next of [...model.direct[id], ...model.deferred[id]])
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
  }
  return seen
}

/** Strongly connected components of the direct-call graph (Tarjan); per method id, its component index. */
export function directComponents(model: DomainModel): { of: number[]; members: number[][]; recursive: boolean[] } {
  const n = model.methods.length
  const index = new Array<number>(n).fill(-1)
  const low = new Array<number>(n).fill(0)
  const onStack = new Array<boolean>(n).fill(false)
  const stack: number[] = []
  const of = new Array<number>(n).fill(-1)
  const members: number[][] = []
  let counter = 0
  const visit = (v: number) => {
    index[v] = low[v] = counter++
    stack.push(v)
    onStack[v] = true
    for (const w of model.direct[v]) {
      if (index[w] < 0) {
        visit(w)
        low[v] = Math.min(low[v], low[w])
      } else if (onStack[w]) low[v] = Math.min(low[v], index[w])
    }
    if (low[v] === index[v]) {
      const group: number[] = []
      for (;;) {
        const w = stack.pop() as number
        onStack[w] = false
        of[w] = members.length
        group.push(w)
        if (w === v) break
      }
      members.push(group.sort((a, b) => a - b))
    }
  }
  for (let v = 0; v < n; v++) if (index[v] < 0) visit(v)
  const recursive = members.map(g => g.length > 1 || model.direct[g[0]].includes(g[0]))
  return { of, members, recursive }
}

/** Every condition node, depth first. */
export function walkCond(c: Cond | null, visit: (c: Cond, negated: boolean) => void, negated = false): void {
  if (!c) return
  visit(c, negated)
  if (c.kind === 'and' || c.kind === 'or' || c.kind === 'alt') for (const child of c.children) walkCond(child, visit, negated)
  else if (c.kind === 'not') walkCond(c.child, visit, !negated)
}

/** Every value inside a value (itself included). */
export function walkValue(v: Value, visit: (v: Value) => void): void {
  visit(v)
  if (v.kind === 'call' || v.kind === 'arith') for (const a of v.args) walkValue(a, visit)
  else if (v.kind === 'list') for (const a of v.items) walkValue(a, visit)
}

/** Every value of a condition node itself (not of its children). */
export function condValues(c: Cond): Value[] {
  switch (c.kind) {
    case 'fact':
    case 'axiom':
    case 'call':
    case 'split':
      return c.args
    case 'assign':
      return [c.dest, c.expr]
    case 'cmp':
      return [c.a, c.b]
    default:
      return []
  }
}

/** True for `()` and `(and)`: the branch always holds. */
export const unconditional = (b: Branch) => b.cond === null || (b.cond.kind === 'and' && b.cond.children.length === 0)

/** A task's head as the frozen-fixture baseline compares them: `!prim`, `method`, `&deferred` (arguments ignored). */
export const taskHead = (t: Task) => (t.kind === 'prim' ? '!' : t.kind === 'defer' ? '&' : '') + t.name

