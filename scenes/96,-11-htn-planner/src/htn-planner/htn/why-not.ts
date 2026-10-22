// "Why not X?" over a recorded run: given a branch (`method.branch` or `branch`), a method or a primitive (`!name` or
// `name`), say why the planner did not take it, from the trace alone (PlanTraceRecorder runs), the domain and the
// world each run planned against:
// - its condition failed: the failing term per attempted binding (a choice fact that ran out of rows after its
//   candidates were rejected is not the cause; the terms that rejected them are), with the values it saw, and for a
//   fact the row it needed against the rows the world had (`needed (door_open store); 1 row of door_open/1, closest
//   (door_open back): arg 1 is back, not store`), for `not` the row that made it fail;
// - its condition held and a task failed (abandoned): that task, and why its method found no branch (nested);
// - it held and decomposed, but a later failure dropped it (discarded);
// - never reached: an earlier branch of its method succeeded (named), or its method was never decomposed (then why
//   the branches that call that method were not taken, nested);
// - not in the domain (with the names that look alike).
// Upstream's generated debugger shows the same facts per node (HTNGeneratedDebugger.h: started / succeeded, Before /
// After); it has no query by name. Ours. Pure, no SDK.
import type { Atom } from './atom'
import { graphIndex } from './domain-graph'
import type { DomainGraph, GraphCond } from './domain-graph'
import type { CondIR, DomainIR, ExprIR, MethodId, TermIR } from './ir'
import { atomEquals } from './match'
import { literalText } from './titles'
import { Binding, branchAttempts, DebugNode, formatCond, NodeKind, PlanRun } from './trace'
import type { FactRow, WorldSnapshot } from './world-state'

export type WhyVerdict = 'chosen' | 'in_plan' | 'failed' | 'not_reached' | 'not_in_domain' | 'no_run'

/** One condition term that failed, with what it saw. */
export interface WhyTerm {
  /** The term with the values it saw: `(<= ?price=500 ?m=20)`. */
  term: string
  kind: NodeKind
  /** Why it failed, one line: `false`, `no row matches (door_open store); ...`. */
  why: string
  /** fact: the row it needed (`?x`: any value); not: the row that must not exist. */
  needed?: string
  /** fact: the rows of its name/arity in the world, closest first (a few); not: the rows that matched. */
  found?: string[]
  /** fact: how many rows its name/arity had. */
  rows?: number
  /** fact: the same name with another arity in the world (`door_open/2: 3 rows`): a fact written with the wrong arity. */
  otherArity?: string[]
  /** Axioms the term was reached through, outermost first (`#can_see`). */
  via?: string[]
  /** What was bound when it was tried: `name=value ...`. */
  bindings: string
  /** `file:line`. */
  source?: string
}

export type WhyOutcome = 'chosen' | 'discarded' | 'no_match' | 'abandoned' | 'not_reached' | 'not_decomposed'

/** One attempt of a branch (or a method never decomposed), and why it did not end in the plan. */
export interface WhyAttempt {
  /** `method.branch`, or the method name for not_decomposed. */
  name: string
  outcome: WhyOutcome
  /** The call it was tried in, with its arguments: `(combat_tick 1 202 3)`. */
  call: string
  /** The run (PlanRun.seq) and whether it expanded a deferred step. */
  run: number
  deferred: boolean
  /** One line. */
  text: string
  /** no_match: the failing terms, one per attempted binding. */
  terms: WhyTerm[]
  /** not_reached: the earlier branch that succeeded (`method.branch`). */
  shadowedBy?: string
  /** abandoned: the task that failed; discarded: what failed above it. */
  task?: string
  /** abandoned: why the task's method found no branch; not_decomposed: why the branches calling it were not taken. */
  nested: WhyAttempt[]
  /** `file:line` of the branch or method. */
  source?: string
}

export interface WhyNot {
  query: string
  /** What the name matched in the domain: `method.branch`, `method/arity`, `!primitive`. */
  matched: string[]
  verdict: WhyVerdict
  /** The answer in one line. */
  summary: string
  /** in_plan: where it is, `run #1 step 3: !throw_smoke 1`. */
  steps?: string[]
  attempts: WhyAttempt[]
  /** not_in_domain: names of the domain that look alike. */
  suggestions?: string[]
}

export interface WhyNotInput {
  /** `method.branch`, `branch`, `method`, `!primitive` or `primitive`. */
  query: string
  domain: DomainIR
  /** Runs to search: a top-level run, then the deferred steps it expanded (as recorded). */
  runs: readonly PlanRun[]
  /** The world a run planned against, by revision (PlanTraceRecorder.world); without it, a failed fact's own rows. */
  world?: (revision: number) => WorldSnapshot | undefined
  /** Attempts listed per name at most (default 12). */
  limit?: number
  /** How deep nested reasons go (default 3). */
  depth?: number
}

const LIMIT = 12
const DEPTH = 3
const FOUND = 4

// ---- small readers (the exported ones are shared with plan-drift.ts) ----------------------------------------

const irCache = new WeakMap<DomainIR, CondIR[]>()

/** The CondIR of each GraphCond id (the graph's cond table read backwards). */
export function condIRs(domain: DomainIR): CondIR[] {
  let out = irCache.get(domain)
  if (out === undefined) {
    out = []
    for (const [c, id] of graphIndex(domain).cond) out[id] = c
    irCache.set(domain, out)
  }
  return out
}

/** The slot names of the scope a condition lives in (a branch's or an axiom's). */
export function scopeVars(domain: DomainIR, graph: DomainGraph, g: GraphCond | undefined): readonly string[] {
  if (!g) return []
  if ('branch' in g.owner) return graph.branches[g.owner.branch]?.vars ?? []
  return domain.axioms[g.owner.axiom]?.vars ?? []
}

const atomText = (a: Atom) => literalText(a)
export const rowText = (name: string, row: readonly Atom[]) => `(${[name, ...row.map(atomText)].join(' ')})`
const bindingsText = (bs: readonly Binding[]) => bs.map(b => `${b.name}=${atomText(b.value)}`).join(' ')
export const sourceText = (s: { file: string; line: number } | undefined) => (s ? `${s.file}:${s.line}` : undefined)

/** The value a node shows for `?name`: what it bound once it succeeded, else what it started with. */
function valueOf(n: DebugNode, name: string): Atom | undefined {
  const pick = (bs: readonly Binding[]) => bs.find(b => b.name === name)?.value
  return (n.completed && n.succeeded ? pick(n.after) : undefined) ?? pick(n.before) ?? pick(n.after)
}

/** `?x` -> `?x=value` where the node knows the value. */
function withValues(text: string, n: DebugNode): string {
  return text.replace(/\?[^\s()]+/g, v => {
    const value = valueOf(n, v.slice(1))
    return value === undefined ? v : `${v}=${atomText(value)}`
  })
}

/** One argument of a fact pattern: a value, or any value (an unbound variable, a discard, an expression). */
export type Cell = { value: Atom } | { any: string }

function evalExpr(e: ExprIR, vars: readonly string[], bs: readonly Binding[]): Atom | undefined {
  switch (e.k) {
    case 'lit':
      return e.v
    case 'var': {
      const name = vars[e.slot]
      return name === undefined ? undefined : bs.find(b => '?' + b.name === name)?.value
    }
    case 'list': {
      const items: Atom[] = []
      for (const i of e.items) {
        const v = evalExpr(i, vars, bs)
        if (v === undefined) return undefined
        items.push(v)
      }
      return { t: 'list', v: items }
    }
    default:
      return undefined
  }
}

export function cells(args: readonly TermIR[], vars: readonly string[], bs: readonly Binding[]): Cell[] {
  return args.map(t => {
    if (t.k === 'discard') return { any: t.name ?? '_' }
    const v = evalExpr(t, vars, bs)
    if (v !== undefined) return { value: v }
    return { any: t.k === 'var' ? vars[t.slot] ?? '?' : '?' }
  })
}

export const patternText = (name: string, cs: readonly Cell[]) => `(${[name, ...cs.map(c => ('value' in c ? atomText(c.value) : c.any))].join(' ')})`

/** Argument positions where `row` does not match the pattern. */
export function mismatches(row: FactRow, cs: readonly Cell[]): number[] {
  const out: number[] = []
  cs.forEach((c, i) => {
    if ('value' in c && (row[i] === undefined || !atomEquals(row[i], c.value))) out.push(i)
  })
  return out
}

/** The rows of `name/arity` a run's world had: the snapshot's, else the rows the failed node recorded. */
function tableOf(world: WorldSnapshot | undefined, n: DebugNode, key: string): { rows: readonly FactRow[]; count: number; snapshot: boolean } {
  if (world) {
    const rows = world.tables[key] ?? []
    return { rows, count: rows.length, snapshot: true }
  }
  return { rows: n.rows ?? [], count: n.rowCount ?? (n.rows ?? []).length, snapshot: false }
}

/** `name/k: N rows` for each table of the same name and another arity. */
function otherArities(world: WorldSnapshot | undefined, name: string, arity: number): string[] {
  if (!world) return []
  const out: string[] = []
  for (const key of Object.keys(world.tables).sort()) {
    const slash = key.lastIndexOf('/')
    if (key.slice(0, slash) !== name || Number(key.slice(slash + 1)) === arity) continue
    const n = world.tables[key].length
    if (n > 0) out.push(`${key}: ${n} row${n === 1 ? '' : 's'}`)
  }
  return out
}

// ---- failed conditions ------------------------------------------------------------------------------

interface Ctx {
  domain: DomainIR
  graph: DomainGraph
  irs: CondIR[]
  world: (run: PlanRun) => WorldSnapshot | undefined
}

function makeCtx(domain: DomainIR, world?: (revision: number) => WorldSnapshot | undefined): Ctx {
  return { domain, graph: graphIndex(domain).graph, irs: condIRs(domain), world: run => world?.(run.world) }
}

const failed = (n: DebugNode) => n.started && n.completed && !n.succeeded

/**
 * A choice fact that ran out of rows: an earlier visit of the same fact under the same parent succeeded, so this
 * visit only says that every candidate was rejected later; the terms that rejected them are the cause.
 */
function exhausted(run: PlanRun, n: DebugNode): boolean {
  if (n.kind !== 'fact' || n.parent < 0) return false
  for (const id of run.nodes[n.parent].children) {
    if (id === n.id) return false
    const s = run.nodes[id]
    if (s.kind === n.kind && s.ref === n.ref && s.succeeded) return true
  }
  return false
}

/** The term text of a node with its values; a composite as written in the domain (`(not (closed ?x))`). */
function termText(ctx: Ctx, n: DebugNode): string {
  const g = ctx.graph.conds[n.ref]
  if (n.kind === 'and' || n.kind === 'or' || n.kind === 'alt' || n.kind === 'not') {
    const ir = ctx.irs[n.ref]
    if (ir) return withValues(formatCond(ctx.domain, ir, scopeVars(ctx.domain, ctx.graph, g)), n)
  }
  if (n.kind === 'axiom' && n.impl) return `#${ctx.graph.axioms[n.ref]?.name ?? n.name}`
  return withValues(g ? g.title : n.name, n)
}

function factTerm(ctx: Ctx, run: PlanRun, n: DebugNode, base: WhyTerm): WhyTerm {
  const ir = ctx.irs[n.ref]
  if (!ir || ir.k !== 'fact') return { ...base, why: 'no row matches' }
  const vars = scopeVars(ctx.domain, ctx.graph, ctx.graph.conds[n.ref])
  const cs = cells(ir.args, vars, n.before)
  const needed = patternText(ir.name, cs)
  const key = `${ir.name}/${ir.args.length}`
  const world = ctx.world(run)
  const table = tableOf(world, n, key)
  const other = otherArities(world, ir.name, ir.args.length)
  const t: WhyTerm = { ...base, needed, rows: table.count }
  if (other.length > 0) t.otherArity = other
  if (table.count === 0) {
    t.why = `world has no ${key} rows` + (other.length ? ` (it has ${other.join(', ')}: another arity)` : '')
    return t
  }
  const ranked = table.rows.map(row => ({ row, miss: mismatches(row, cs) })).sort((a, b) => a.miss.length - b.miss.length)
  t.found = ranked.slice(0, FOUND).map(r => rowText(ir.name, r.row))
  const best = ranked[0]
  const diffs = best.miss.map(i => `arg ${i + 1} is ${best.row[i] === undefined ? 'missing' : atomText(best.row[i])}, not ${atomText((cs[i] as { value: Atom }).value)}`)
  const count = `${table.count} row${table.count === 1 ? '' : 's'} of ${key}${table.snapshot ? '' : ' (first ones)'}`
  t.why = `no row matches ${needed}; ${count}, closest ${rowText(ir.name, best.row)}${diffs.length ? ': ' + diffs.join(', ') : ''}`
  return t
}

function notTerm(ctx: Ctx, run: PlanRun, n: DebugNode, base: WhyTerm): WhyTerm {
  const inner = n.children.map(id => run.nodes[id]).find(c => c.started)
  const ir = ctx.irs[n.ref]
  const item = ir && ir.k === 'not' ? ir.item : undefined
  if (item && item.k === 'fact' && inner && inner.kind === 'fact') {
    const vars = scopeVars(ctx.domain, ctx.graph, ctx.graph.conds[n.ref])
    const cs = cells(item.args, vars, n.before)
    const world = ctx.world(run)
    const rows = world ? world.tables[`${item.name}/${item.args.length}`] ?? [] : []
    const matched = rows.filter(r => mismatches(r, cs).length === 0).slice(0, FOUND).map(r => rowText(item.name, r))
    // Without the world: the row the inner fact bound (its After) is the one that matched.
    if (matched.length === 0 && inner.succeeded) {
      const bound = cells(item.args, vars, inner.after)
      matched.push(patternText(item.name, bound))
    }
    return { ...base, needed: `no ${patternText(item.name, cs)}`, found: matched, why: `world has ${matched[0] ?? 'a matching row'}${matched.length > 1 ? ` (+${matched.length - 1})` : ''}` }
  }
  return { ...base, why: inner ? `its inner condition held: ${termText(ctx, inner)}` : 'its inner condition held' }
}

function leafTerm(ctx: Ctx, run: PlanRun, n: DebugNode, via: readonly string[], why?: string): WhyTerm {
  const base: WhyTerm = { term: termText(ctx, n), kind: n.kind, why: why ?? '', bindings: bindingsText(n.before) }
  const src = sourceText(n.source)
  if (src) base.source = src
  if (via.length) base.via = via.slice()
  if (why !== undefined) return base
  const g = ctx.graph.conds[n.ref]
  switch (n.kind) {
    case 'fact':
      return g?.lowered ? { ...base, why: 'no row matches (its arguments are computed)' } : factTerm(ctx, run, n, base)
    case 'not':
      return notTerm(ctx, run, n, base)
    case 'cmp':
      return { ...base, why: 'false' }
    case 'call':
      return { ...base, why: 'the callterm returned false or failed (a missing callterm or an error: see diagnostics)' }
    case 'assign':
      return { ...base, why: 'the expression failed, or the variable holds another value' }
    case 'split':
      return { ...base, why: 'not a non-empty list, or its parts do not match' }
    case 'axiom':
      return { ...base, why: 'an ?out_ argument is already bound' }
    default:
      return { ...base, why: 'failed' }
  }
}

/** The terms that made a failed condition node fail, one per attempted binding (deduplicated). */
function failuresOf(ctx: Ctx, run: PlanRun, n: DebugNode, via: readonly string[]): WhyTerm[] {
  const kids = () => n.children.map(id => run.nodes[id]).filter(failed)
  switch (n.kind) {
    case 'and': {
      const fs = kids()
      const real = fs.filter(k => !exhausted(run, k))
      if (real.length > 0) return real.flatMap(k => failuresOf(ctx, run, k, via))
      if (fs.length > 0) return failuresOf(ctx, run, fs[fs.length - 1], via)
      return [leafTerm(ctx, run, n, via, 'failed')]
    }
    case 'or':
    case 'alt': {
      const fs = kids()
      return fs.length > 0 ? fs.flatMap(k => failuresOf(ctx, run, k, via)) : [leafTerm(ctx, run, n, via, 'failed')]
    }
    case 'axiom': {
      if (n.impl) {
        const fs = kids()
        const real = fs.filter(k => !exhausted(run, k))
        if (real.length > 0) return real.flatMap(k => failuresOf(ctx, run, k, via))
        if (fs.length > 0) return failuresOf(ctx, run, fs[fs.length - 1], via)
        return [leafTerm(ctx, run, n, via, 'its body held, but its outputs did not match the call')]
      }
      const scopes = n.children.map(id => run.nodes[id]).filter(c => c.impl && c.started)
      if (scopes.length === 0) return [leafTerm(ctx, run, n, via)]
      const inner = [...via, termText(ctx, n)]
      return scopes.flatMap(s => (s.succeeded ? [] : failuresOf(ctx, run, s, inner)))
    }
    case 'fact':
      if (ctx.graph.conds[n.ref]?.lowered) {
        const fs = kids()
        if (fs.length > 0) return fs.flatMap(k => failuresOf(ctx, run, k, via))
      }
      return [leafTerm(ctx, run, n, via)]
    default:
      return [leafTerm(ctx, run, n, via)]
  }
}

function dedupe(terms: WhyTerm[]): WhyTerm[] {
  const seen = new Set<string>()
  return terms.filter(t => {
    const key = `${t.term}|${t.why}|${(t.via ?? []).join(' ')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Why a condition node failed, or why a branch's condition failed: its failing terms. */
export function conditionFailures(domain: DomainIR, run: PlanRun, node: number, world?: (revision: number) => WorldSnapshot | undefined): WhyTerm[] {
  return condFailures(makeCtx(domain, world), run, run.nodes[node])
}

function condFailures(ctx: Ctx, run: PlanRun, n: DebugNode | undefined): WhyTerm[] {
  if (!n) return []
  if (n.kind === 'branch') {
    const roots = n.children.map(id => run.nodes[id]).filter(c => c.kind !== 'task' && failed(c))
    return dedupe(roots.flatMap(r => failuresOf(ctx, run, r, [])))
  }
  return failed(n) ? dedupe(failuresOf(ctx, run, n, [])) : []
}

// ---- branches and methods ---------------------------------------------------------------------------

/** The method call a method node made, with its argument values: `(combat_tick 1 202 3)`. */
function callText(ctx: Ctx, m: DebugNode): string {
  const g = ctx.graph.methods[m.ref]
  if (!g) return '(?)'
  return `(${[g.name, ...g.params.map(p => {
    const v = valueOf(m, p.slice(1))
    return v === undefined ? p : atomText(v)
  })].join(' ')})`
}

/** The nearest ancestor that failed (the plan's root counts), or undefined when the node's whole path held. */
function failedAncestor(run: PlanRun, n: DebugNode): DebugNode | undefined {
  for (let p = n.parent; p >= 0; p = run.nodes[p].parent) {
    const a = run.nodes[p]
    if (a.completed && !a.succeeded) return a
  }
  return undefined
}

function nodeLabel(ctx: Ctx, run: PlanRun, n: DebugNode): string {
  switch (n.kind) {
    case 'plan':
      return 'the plan'
    case 'method':
      return callText(ctx, n)
    case 'branch': {
      const b = ctx.graph.branches[n.ref]
      return `${ctx.graph.methods[b?.method ?? -1]?.name ?? '?'}.${b?.name ?? n.name}`
    }
    case 'task':
      return withValues(ctx.graph.tasks[n.ref]?.title ?? n.name, n)
    default:
      return termText(ctx, n)
  }
}

interface Walk {
  depth: number
  /** Methods already explained on this path (recursion). */
  seen: Set<MethodId>
}

/** Why one attempt of a branch (a branch node) ended as it did. */
function attemptWhy(ctx: Ctx, run: PlanRun, m: DebugNode, node: DebugNode, outcome: 'chosen' | 'no_match' | 'abandoned', later: boolean, walk: Walk): WhyAttempt {
  const b = ctx.graph.branches[node.ref]
  const method = ctx.graph.methods[b.method]
  const call = callText(ctx, m)
  const base = { name: `${method.name}.${b.name}`, call, run: run.seq, deferred: run.deferred, terms: [] as WhyTerm[], nested: [] as WhyAttempt[] }
  const src = sourceText(b.source)
  const out: WhyAttempt = { ...base, outcome, text: '' }
  if (src) out.source = src
  if (outcome === 'chosen') {
    const above = later ? m : failedAncestor(run, node)
    if (above === undefined) {
      const bound = bindingsText(node.after.filter(x => !method.params.includes('?' + x.name)))
      out.text = `chosen in ${call}${bound ? ` with ${bound}` : ''}`
      return out
    }
    out.outcome = 'discarded'
    out.task = nodeLabel(ctx, run, above)
    out.text = later
      ? `held and decomposed in ${call}, then dropped: a later task failed and the planner backtracked into ${method.name}`
      : `held and decomposed in ${call}, then dropped: ${out.task} failed above it`
    return out
  }
  if (outcome === 'no_match') {
    out.terms = condFailures(ctx, run, node)
    const first = out.terms[0]
    const more = out.terms.length > 1 ? ` (+${out.terms.length - 1} more)` : ''
    out.text = first ? `condition failed in ${call}: ${first.term} ${first.why}${more}` : `condition failed in ${call}`
    return out
  }
  // abandoned: the condition held, a task failed.
  const tasks = node.children.map(id => run.nodes[id]).filter(c => c.kind === 'task' && failed(c))
  const task = tasks[tasks.length - 1]
  if (!task) {
    out.text = `condition held in ${call}, but its tasks failed for every solution`
    return out
  }
  out.task = nodeLabel(ctx, run, task)
  out.text = `condition held in ${call}, task ${out.task} failed${tasks.length > 1 ? ` (and ${tasks.length - 1} more attempts)` : ''}`
  if (walk.depth > 0) {
    for (const t of tasks) {
      for (const id of t.children) {
        const child = run.nodes[id]
        if (child.kind === 'method') out.nested.push(...methodNodeWhy(ctx, run, child, { depth: walk.depth - 1, seen: walk.seen }))
      }
    }
  }
  return out
}

/** Every branch of one method node: tried ones with their reason, the rest after a chosen one as not reached. */
function methodNodeWhy(ctx: Ctx, run: PlanRun, m: DebugNode, walk: Walk): WhyAttempt[] {
  const method = ctx.graph.methods[m.ref]
  if (!method) return []
  const attempts = branchAttempts(run, m, ctx.graph)
  const out: WhyAttempt[] = []
  const lastChosen = lastChosenIndex(attempts)
  attempts.forEach((a, i) => out.push(attemptWhy(ctx, run, m, a.node, a.outcome, a.outcome === 'chosen' && i !== lastChosen, walk)))
  const chosen = lastChosen >= 0 ? attempts[lastChosen] : undefined
  if (chosen && m.succeeded) {
    const tried = new Set(attempts.map(a => a.branch))
    for (const id of method.branches) {
      const b = ctx.graph.branches[id]
      if (tried.has(b.index) || b.index < chosen.branch) continue
      out.push(notReached(ctx, run, m, id, chosen.branch))
    }
  }
  return out
}

function lastChosenIndex(attempts: readonly { outcome: string }[]): number {
  for (let i = attempts.length - 1; i >= 0; i--) if (attempts[i].outcome === 'chosen') return i
  return -1
}

function notReached(ctx: Ctx, run: PlanRun, m: DebugNode, branch: number, earlier: number | undefined): WhyAttempt {
  const b = ctx.graph.branches[branch]
  const method = ctx.graph.methods[b.method]
  const call = callText(ctx, m)
  const out: WhyAttempt = { name: `${method.name}.${b.name}`, outcome: 'not_reached', call, run: run.seq, deferred: run.deferred, text: '', terms: [], nested: [] }
  const src = sourceText(b.source)
  if (src) out.source = src
  if (earlier !== undefined) {
    const e = ctx.graph.branches[method.branches[earlier]]
    out.shadowedBy = `${method.name}.${e?.name ?? '?'}`
    out.text = `never reached in ${call}: an earlier branch succeeded (${out.shadowedBy})`
  } else out.text = `never reached in ${call}: the decomposition stopped before it (${run.status ?? 'running'})`
  return out
}

/** Why method `id` has no node in any run: nothing called it, or the branches that call it were not taken. */
function notDecomposed(ctx: Ctx, runs: readonly PlanRun[], id: MethodId, walk: Walk, limit: number): WhyAttempt {
  const g = ctx.graph.methods[id]
  const run = runs[0]
  const out: WhyAttempt = { name: g.name, outcome: 'not_decomposed', call: `(${[g.name, ...g.params].join(' ')})`, run: run?.seq ?? 0, deferred: false, text: '', terms: [], nested: [] }
  const src = sourceText(g.source)
  if (src) out.source = src
  const callers = [...new Set(ctx.graph.tasks.filter(t => t.method === id).map(t => t.branch))]
  const root = run ? ctx.graph.methods[run.method]?.name : undefined
  if (callers.length === 0) {
    out.text = g.topLevel
      ? `${g.name} was never decomposed: it is a top-level method and this run planned (${root ?? '?'})`
      : `${g.name} was never decomposed: no task in the domain calls it`
    return out
  }
  const names = callers.map(b => `${ctx.graph.methods[ctx.graph.branches[b].method].name}.${ctx.graph.branches[b].name}`)
  out.text = `${g.name} was never decomposed: no branch that calls it was taken (${names.slice(0, 4).join(', ')}${names.length > 4 ? ', …' : ''})`
  if (walk.depth > 0 && !walk.seen.has(id)) {
    const seen = new Set(walk.seen).add(id)
    for (const b of callers) out.nested.push(...branchWhy(ctx, runs, b, { depth: walk.depth - 1, seen }, limit))
  }
  return out
}

/** Every attempt of branch `id` in the runs, or why it was never tried. */
function branchWhy(ctx: Ctx, runs: readonly PlanRun[], id: number, walk: Walk, limit: number): WhyAttempt[] {
  const b = ctx.graph.branches[id]
  const out: WhyAttempt[] = []
  let decomposed = false
  for (const run of runs) {
    for (const m of run.nodes) {
      if (m.kind !== 'method' || m.ref !== b.method) continue
      decomposed = true
      if (out.length >= limit) continue
      const attempts = branchAttempts(run, m, ctx.graph)
      const lastChosen = lastChosenIndex(attempts)
      const mine = attempts.map((a, i) => ({ a, i })).filter(x => x.a.branch === b.index)
      if (mine.length === 0) {
        const chosen = lastChosen >= 0 && attempts[lastChosen].branch < b.index ? attempts[lastChosen].branch : undefined
        out.push(notReached(ctx, run, m, id, chosen))
        continue
      }
      for (const { a, i } of mine) out.push(attemptWhy(ctx, run, m, a.node, a.outcome, a.outcome === 'chosen' && i !== lastChosen, walk))
    }
  }
  if (!decomposed) return [notDecomposed(ctx, runs, b.method, walk, limit)]
  return out.slice(0, limit)
}

// ---- the query ---------------------------------------------------------------------------------------

/** Edit distance, small strings only (names). */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
    }
  }
  return row[b.length]
}

function suggestions(graph: DomainGraph, query: string): string[] {
  const q = query.replace(/^!/, '').toLowerCase()
  const names = new Set<string>()
  for (const m of graph.methods) {
    names.add(m.name)
    for (const id of m.branches) names.add(`${m.name}.${graph.branches[id].name}`)
  }
  for (const t of graph.tasks) if (t.kind === 'prim') names.add(t.title.slice(1).split(' ')[0].replace(/\)$/, ''))
  return [...names]
    .map(n => {
      const short = n.includes('.') ? n.slice(n.lastIndexOf('.') + 1) : n.replace(/^!/, '')
      const d = Math.min(distance(q, n.toLowerCase()), distance(q, short.toLowerCase()))
      return { n, d: short.toLowerCase().includes(q) || q.includes(short.toLowerCase()) ? Math.min(d, 1) : d }
    })
    .filter(x => x.d <= Math.max(2, Math.floor(q.length / 3)))
    .sort((a, b) => a.d - b.d || a.n.localeCompare(b.n))
    .slice(0, 5)
    .map(x => x.n)
}

/** A primitive task's name, `!name`. */
const primName = (title: string) => title.slice(1).split(' ')[0].replace(/\)$/, '')

/**
 * Why the planner did not take `query` in these runs: a branch (`method.branch` or a branch name), a method, or a
 * primitive (`!name`, the `!` optional). Pure over the recorded runs, the domain and the worlds they planned against.
 */
export function whyNot(input: WhyNotInput): WhyNot {
  const ctx = makeCtx(input.domain, input.world)
  const graph = ctx.graph
  const limit = Math.max(1, input.limit ?? LIMIT)
  const walk: Walk = { depth: Math.max(0, input.depth ?? DEPTH), seen: new Set() }
  const query = input.query.trim()
  const runs = input.runs.filter(r => r.nodes.length > 0)

  // What the name means in the domain.
  const branches: number[] = []
  const methods: MethodId[] = []
  const prims = new Set<string>()
  const dot = query.lastIndexOf('.')
  if (dot > 0 && !query.startsWith('!')) {
    const mName = query.slice(0, dot)
    const bName = query.slice(dot + 1)
    for (const b of graph.branches) if (b.name === bName && graph.methods[b.method]?.name === mName) branches.push(b.id)
  } else {
    for (const b of graph.branches) if (b.name === query) branches.push(b.id)
    for (const m of graph.methods) if (m.name === query) methods.push(m.id)
    const bare = query.replace(/^!/, '')
    for (const t of graph.tasks) if (t.kind === 'prim' && primName(t.title) === '!' + bare) prims.add(primName(t.title))
  }
  const matched = [
    ...branches.map(id => `${graph.methods[graph.branches[id].method].name}.${graph.branches[id].name}`),
    ...methods.map(id => `${graph.methods[id].name}/${graph.methods[id].params.length}`),
    ...prims
  ]
  if (matched.length === 0) {
    const s = suggestions(graph, query)
    const out: WhyNot = {
      query,
      matched,
      verdict: 'not_in_domain',
      summary: `'${query}' is not in domain ${graph.name}: no method, branch or primitive of that name${s.length ? `; did you mean ${s.join(', ')}?` : ''}`,
      attempts: []
    }
    if (s.length) out.suggestions = s
    return out
  }
  if (runs.length === 0) return { query, matched, verdict: 'no_run', summary: `no recorded run to explain (${matched.join(', ')})`, attempts: [] }

  // A primitive in a plan is no "why not".
  const steps: string[] = []
  for (const run of runs)
    run.plan.forEach((s, i) => {
      if (prims.has(s.name)) steps.push(`run #${run.seq}${run.deferred ? ' (deferred)' : ''} step ${i + 1}: ${[s.name, ...s.args.map(atomText)].join(' ')}`)
    })
  if (steps.length > 0 && branches.length === 0 && methods.length === 0) {
    return { query, matched, verdict: 'in_plan', summary: `${[...prims].join(', ')} is in the plan: ${steps[0]}${steps.length > 1 ? ` (+${steps.length - 1})` : ''}`, steps, attempts: [] }
  }

  const attempts: WhyAttempt[] = []
  const owners = new Set<number>(branches)
  for (const name of prims) for (const t of graph.tasks) if (t.kind === 'prim' && primName(t.title) === name) owners.add(t.branch)
  for (const id of owners) attempts.push(...branchWhy(ctx, runs, id, walk, limit))
  for (const id of methods) {
    const nodes = runs.flatMap(run => run.nodes.filter(n => n.kind === 'method' && n.ref === id).map(n => ({ run, n })))
    if (nodes.length === 0) attempts.push(notDecomposed(ctx, runs, id, walk, limit))
    else for (const { run, n } of nodes.slice(0, limit)) attempts.push(...methodNodeWhy(ctx, run, n, walk))
  }

  let verdict: WhyVerdict
  let lead: WhyAttempt | undefined
  if ((lead = attempts.find(a => a.outcome === 'chosen'))) verdict = 'chosen'
  else if ((lead = attempts.find(a => a.outcome === 'no_match' || a.outcome === 'abandoned' || a.outcome === 'discarded'))) verdict = 'failed'
  else {
    verdict = 'not_reached'
    lead = attempts[0]
  }
  const what = methods.length && !branches.length && !prims.size ? matched.join(', ') : lead?.name ?? matched[0]
  let summary = lead ? `${what}: ${lead.text}` : `${matched.join(', ')}: nothing recorded`
  if (verdict === 'chosen' && prims.size > 0 && steps.length === 0) summary = `${[...prims].join(', ')} is in no plan, though ${lead?.name} was chosen: ${lead?.text}`
  const out: WhyNot = { query, matched, verdict, summary, attempts }
  if (steps.length > 0) out.steps = steps
  return out
}

/**
 * Why one node of a run ended as it did, for a debugger's watch: a method node lists its branches (tried, and the
 * ones after the chosen branch as not reached), a branch node its attempt, a failed condition its failing terms, a
 * failed task its method's branches.
 */
export function whyNode(
  domain: DomainIR,
  run: PlanRun,
  node: number,
  world?: (revision: number) => WorldSnapshot | undefined,
  depth = 1
): { attempts: WhyAttempt[]; terms: WhyTerm[] } {
  const ctx = makeCtx(domain, world)
  const n = run.nodes[node]
  const walk: Walk = { depth, seen: new Set() }
  if (!n) return { attempts: [], terms: [] }
  if (n.kind === 'method') return { attempts: methodNodeWhy(ctx, run, n, walk), terms: [] }
  if (n.kind === 'branch') {
    const m = run.nodes[n.parent]
    const attempts = branchAttempts(run, m, ctx.graph)
    const lastChosen = lastChosenIndex(attempts)
    const i = attempts.findIndex(a => a.node === n)
    if (i < 0) return { attempts: [], terms: [] }
    const a = attempts[i]
    return { attempts: [attemptWhy(ctx, run, m, n, a.outcome, a.outcome === 'chosen' && i !== lastChosen, walk)], terms: [] }
  }
  if (n.kind === 'task') {
    if (!failed(n)) return { attempts: [], terms: [] }
    const out: WhyAttempt[] = []
    for (const id of n.children) if (run.nodes[id].kind === 'method') out.push(...methodNodeWhy(ctx, run, run.nodes[id], walk))
    return { attempts: out, terms: [] }
  }
  if (n.kind === 'plan') return { attempts: [], terms: [] }
  return { attempts: [], terms: condFailures(ctx, run, n) }
}

// ---- as text -------------------------------------------------------------------------------------------

const OUTCOME_GLYPH: Record<WhyOutcome, string> = { chosen: '✓', discarded: '~', no_match: '×', abandoned: '×', not_reached: '·', not_decomposed: '·' }

/** A failing term as one line: `× (<= ?price=500 ?m=20)  false  {m=20 ...}  file:line`. */
export function termLine(t: WhyTerm): string {
  let s = `× ${t.via?.length ? t.via.join(' › ') + ' › ' : ''}${t.term}  ${t.why}`
  if (t.bindings) s += `  {${t.bindings}}`
  if (t.source) s += `  ${t.source}`
  return s
}

/** An attempt as lines (two spaces per nesting level): its line, its terms, its nested attempts. */
export function attemptLines(a: WhyAttempt, indent = ''): string[] {
  const out = [`${indent}${OUTCOME_GLYPH[a.outcome]} ${a.name}  ${a.outcome}  ${a.text}${a.deferred ? '  (deferred run)' : ''}${a.source ? '  ' + a.source : ''}`]
  for (const t of a.terms) out.push(`${indent}    ${termLine(t)}`)
  for (const n of a.nested) out.push(...attemptLines(n, indent + '    '))
  return out
}

/** The answer as terminal lines: `why not <query>: <verdict>`, the summary, then each attempt indented. */
export function formatWhyNot(w: WhyNot): string[] {
  const out = [`why not ${w.query}: ${w.verdict}`, `  ${w.summary}`]
  if (w.matched.length) out.push(`  matched: ${w.matched.join(', ')}`)
  for (const s of w.steps ?? []) out.push(`  in plan: ${s}`)
  for (const a of w.attempts) out.push(...attemptLines(a, '  '))
  return out
}
