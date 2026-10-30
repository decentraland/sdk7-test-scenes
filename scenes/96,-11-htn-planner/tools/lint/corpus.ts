// Duplication ACROSS the root domains of one lint run (rule duplicated-across-domains): (a) methods that are the same
// once variable names and constants are abstracted, (b) the same >= minLength closing steps in branches of different
// root domains. A declaration is identified by its file and position, so a method or branch two roots get from one
// shared `:include` is one declaration, not a duplicate. Read-only over the models; linear in the declarations.
import type { Branch, Cond, Method, Task, Value } from '../htn/ast'
import { taskHead } from './model'
import type { Decl, DomainModel } from './model'

export interface CorpusDomain {
  model: DomainModel
  /** Absolute path of the module file of a Loc.file index. */
  absOf(fileIndex: number): string
}

export interface DupPlace {
  domain: number // index into the CorpusDomain list: the first root that has this declaration
  method: Decl<Method>
  branch?: Branch
}

export interface DupGroup {
  kind: 'method' | 'tail'
  heads: string[] // tail: the shared closing steps (names); method: []
  places: DupPlace[] // in run order; the first is where the finding goes
  domains: number[] // every root (CorpusDomain index) that has one of the places
}

const PREFIX = /^(inp|out|io)_/

/** A value with variable names and constants abstracted: params by position, branch variables by first use. */
function valueKey(v: Value, vars: Map<string, string>): string {
  switch (v.kind) {
    case 'var': {
      if (v.name.startsWith('any_')) return '_'
      let k = vars.get(v.name)
      if (!k) {
        k = `v${vars.size}${PREFIX.exec(v.name)?.[1] ?? ''}`
        vars.set(v.name, k)
      }
      return k
    }
    case 'const':
      return 'K'
    case 'lit':
      return v.atom.t === 'sym' ? `'${v.atom.v}` : 'K' // symbols are structure (walk, hurry); numbers, text, data are tuning
    case 'call':
      return `call ${v.name}(${v.args.map(a => valueKey(a, vars)).join(' ')})`
    case 'arith':
      return `${v.op}(${v.args.map(a => valueKey(a, vars)).join(' ')})`
    case 'list':
      return `[${v.items.map(a => valueKey(a, vars)).join(' ')}]`
  }
}

function condKey(c: Cond | null, vars: Map<string, string>): string {
  if (!c) return '()'
  switch (c.kind) {
    case 'and':
    case 'or':
    case 'alt':
      return `(${c.kind} ${c.children.map(x => condKey(x, vars)).join(' ')})`
    case 'not':
      return `(not ${condKey(c.child, vars)})`
    case 'fact':
    case 'axiom':
    case 'call':
      return `(${c.kind} ${c.name} ${c.args.map(a => valueKey(a, vars)).join(' ')})`
    case 'split':
      return `(split ${c.from} ${c.args.map(a => valueKey(a, vars)).join(' ')})`
    case 'assign':
      return `(= ${valueKey(c.dest, vars)} ${valueKey(c.expr, vars)})`
    case 'cmp':
      return `(${c.op} ${valueKey(c.a, vars)} ${valueKey(c.b, vars)})`
  }
}

const taskKey = (t: Task, vars: Map<string, string>) => `(${taskHead(t)} ${t.args.map(a => valueKey(a, vars)).join(' ')})`

/** Condition literals plus tasks: how much a copy of the method carries. */
function methodSize(m: Method): number {
  let n = 0
  const count = (c: Cond | null) => {
    if (!c) return
    if (c.kind === 'and' || c.kind === 'or' || c.kind === 'alt') c.children.forEach(count)
    else if (c.kind === 'not') count(c.child)
    else n++
  }
  for (const b of m.branches) {
    count(b.cond)
    n += b.tasks.length
  }
  return n
}

/** The method's structure: arity, parameter kinds, per branch its condition and tasks (branch names ignored). */
function methodKey(m: Method): string {
  const params = new Map<string, string>()
  m.params.forEach((p, i) => params.set(p.name, `p${i}${PREFIX.exec(p.name)?.[1] ?? ''}`))
  const branches = m.branches.map(b => {
    const vars = new Map(params)
    return `${condKey(b.cond, vars)} => ${b.tasks.map(t => taskKey(t, vars)).join(' ')}`
  })
  return `${m.params.length}|${[...params.values()].join(' ')}|${branches.join(' ; ')}`
}

/** A closing step as tails compare them: its head and the kind of each argument (any variable alike). */
const stepKey = (t: Task) => `(${taskHead(t)} ${t.args.map(a => (a.kind === 'var' ? 'V' : valueKey(a, new Map()))).join(' ')})`

export function crossDomainDuplicates(domains: CorpusDomain[], opts: { minLength: number; minSize: number }): DupGroup[] {
  // Every method declaration once, with the roots that have it.
  interface Entry {
    place: DupPlace
    roots: Set<number>
  }
  const decls = new Map<string, Entry>()
  domains.forEach((d, i) => {
    for (const m of d.model.methods) {
      const key = `${d.absOf(m.decl.loc.file)}:${m.decl.loc.line}:${m.decl.loc.col}`
      const e = decls.get(key)
      if (e) e.roots.add(i)
      else decls.set(key, { place: { domain: i, method: m }, roots: new Set([i]) })
    }
  })
  const entries = [...decls.values()]
  const crosses = (group: Entry[]) => {
    // No single root has every place: they come from different roots, not one root's own copies.
    const [first, ...rest] = group
    return ![...first.roots].some(r => rest.every(e => e.roots.has(r)))
  }
  const rootsOf = (group: Entry[]) => [...new Set(group.flatMap(e => [...e.roots]))].sort((a, b) => a - b)
  const out: DupGroup[] = []

  // (a) identical methods.
  const byKey = new Map<string, Entry[]>()
  for (const e of entries) {
    if (methodSize(e.place.method.decl) < opts.minSize) continue
    const key = methodKey(e.place.method.decl)
    byKey.set(key, [...(byKey.get(key) ?? []), e])
  }
  const inSameMethod = new Set<Entry>()
  for (const group of byKey.values()) {
    if (group.length < 2 || !crosses(group)) continue
    group.forEach(e => inSameMethod.add(e))
    out.push({ kind: 'method', heads: [], places: group.map(e => e.place), domains: rootsOf(group) })
  }

  // (b) shared closing steps: a trie over the branches' steps, last first (as metrics.duplicatedTails).
  interface Ref {
    entry: Entry
    branch: Branch
  }
  interface Node {
    children: Map<string, Node>
    refs: Ref[]
    heads: string[]
  }
  const root: Node = { children: new Map(), refs: [], heads: [] }
  for (const entry of entries)
    for (const branch of entry.place.method.decl.branches) {
      let node = root
      for (let i = branch.tasks.length - 1; i >= 0; i--) {
        const key = stepKey(branch.tasks[i])
        let next = node.children.get(key)
        if (!next) {
          next = { children: new Map(), refs: [], heads: [taskHead(branch.tasks[i]), ...node.heads] }
          node.children.set(key, next)
        }
        next.refs.push({ entry, branch })
        node = next
      }
    }
  const visit = (node: Node) => {
    const group = node.refs.map(r => r.entry)
    if (
      node.heads.length >= opts.minLength &&
      node.refs.length >= 2 &&
      ![...node.children.values()].some(c => c.refs.length === node.refs.length) &&
      !group.every(e => inSameMethod.has(e)) &&
      crosses(group)
    )
      out.push({ kind: 'tail', heads: node.heads, places: node.refs.map(r => ({ ...r.entry.place, branch: r.branch })), domains: rootsOf(group) })
    for (const child of node.children.values()) if (child.refs.length >= 2) visit(child)
  }
  visit(root)
  return out
}
