// Linker / IR builder: validated modules -> DomainIR. Follows upstream
// Translator/HTNCompilerDomainLoader.cpp (BuildCompilerDomain: qualified aliases and effective
// declarations) and Translator/HTNCompilerIRBuilder.cpp (constant inlining, axiom resolution,
// deferred targets). Every declaration becomes one MethodIR/AxiomIR; an unqualified call resolves to
// the effective (most derived) declaration of its name/arity, `Domain::name` to that domain's body.
import * as nodePath from 'node:path'
import type { Atom } from '../../src/htn-planner/htn/atom'
import { list as listAtom } from '../../src/htn-planner/htn/atom'
import { HTN_IR_VERSION } from '../../src/htn-planner/htn/ir'
import { literalText } from '../../src/htn-planner/htn/titles'
import type { AxiomIR, BranchIR, CondIR, DomainIR, ExprIR, MethodIR, Slot, SourceLoc, TaskIR, TermIR } from '../../src/htn-planner/htn/ir'
import { signature } from './ast'
import type { Axiom, Cond, Domain, Method, Task, Value } from './ast'
import { rangeOf, reportDiagnostic } from './diagnostics'
import type { Diagnostic, Loc } from './diagnostics'

class Scope {
  readonly vars: string[] = []
  private readonly slots = new Map<string, number>()
  constructor(params: { name: string }[]) {
    for (const p of params) this.slot(p.name)
  }
  slot(name: string): number {
    let s = this.slots.get(name)
    if (s === undefined) {
      s = this.vars.length
      this.vars.push('?' + name)
      this.slots.set(name, s)
    }
    return s
  }
}

export function linkModules(modules: Domain[], files: string[], diagnostics: Diagnostic[]): DomainIR | null {
  let ok = true
  const error = (loc: Loc, code: string, message: string) => {
    reportDiagnostic(diagnostics, { severity: 'error', recovery: 'recoverable', code, message, file: files[loc.file] ?? '', ...rangeOf(loc) })
    ok = false
  }
  const rootDir = nodePath.dirname(files[files.length - 1])
  const relFiles = files.map(f => nodePath.relative(rootDir, f).replace(/\\/g, '/'))
  const source = (loc: Loc): SourceLoc => ({
    file: relFiles[loc.file],
    line: loc.line,
    col: loc.col,
    endLine: loc.endLine ?? loc.line,
    endCol: loc.endCol ?? loc.col
  })

  // Declarations, in post-order (includes first), each module in source order.
  const methodDecls: { module: Domain; decl: Method }[] = []
  const axiomDecls: { module: Domain; decl: Axiom }[] = []
  const effectiveMethods = new Map<string, number>()
  const qualifiedMethods = new Map<string, number>()
  const effectiveAxioms = new Map<string, number>()
  const qualifiedAxioms = new Map<string, number>()
  const constants = new Map<string, Atom>()
  for (const module of modules) {
    for (const group of module.groups) for (const c of group.constants) constants.set(c.name, c.value.atom)
    for (const decl of module.axioms) {
      const sig = signature(decl.name, decl.params.length)
      qualifiedAxioms.set(`${module.name}::${sig}`, axiomDecls.length)
      effectiveAxioms.set(sig, axiomDecls.length)
      axiomDecls.push({ module, decl })
    }
    for (const decl of module.methods) {
      const sig = signature(decl.name, decl.params.length)
      qualifiedMethods.set(`${module.name}::${sig}`, methodDecls.length)
      effectiveMethods.set(sig, methodDecls.length)
      methodDecls.push({ module, decl })
    }
  }
  const resolve = (name: string, arity: number, qualified: Map<string, number>, effective: Map<string, number>) =>
    (name.includes('::') ? qualified : effective).get(signature(name, arity))

  const facts = new Set<string>()
  const callterms = new Set<string>()

  const expr = (value: Value, scope: Scope): ExprIR => {
    switch (value.kind) {
      case 'lit':
        return { k: 'lit', v: value.atom }
      case 'const': {
        const atom = constants.get(value.name)
        if (!atom) {
          error(value.loc, 'unknown-constant', `Unknown constant '@${value.name}'`)
          return { k: 'lit', v: { t: 'sym', v: value.name } }
        }
        return { k: 'lit', v: atom, c: value.name }
      }
      case 'var':
        if (value.name.startsWith('any_'))
          // Upstream compiles this to an always-unbound read; we reject it instead.
          error(
            value.loc,
            'discard-consumed',
            `Singleton variable '?${value.name}' is never bound and cannot be read inside a value expression.`
          )
        return { k: 'var', slot: scope.slot(value.name) }
      case 'call':
        callterms.add(value.name)
        return { k: 'call', name: value.name, args: value.args.map(a => expr(a, scope)), source: source(value.loc) }
      case 'arith':
        return { k: 'arith', op: value.op, args: value.args.map(a => expr(a, scope)) }
      case 'list': {
        const items = value.items.map(i => expr(i, scope))
        // Constants make a list "runtime" in upstream; once inlined, a fully literal list is static.
        if (items.every(i => i.k === 'lit')) return { k: 'lit', v: listAtom(...items.map(i => (i as { v: Atom }).v)) }
        return { k: 'list', items }
      }
    }
  }

  const term = (value: Value, scope: Scope): TermIR =>
    value.kind === 'var' && value.name.startsWith('any_') ? { k: 'discard', name: '?' + value.name } : expr(value, scope)

  // Upstream matches fact and split_list arguments against an atom reference (BuildGeneratedStaticFactMatch,
  // HTNCCodeGenerator.cpp:838-855, :1270-1272); an arithmetic value there fails translation (:643-657, :671-674),
  // unless a call or runtime list inside it got it lowered into a hidden assignment (HTNCompilerIRBuilder.cpp
  // HasNestedAssignmentCall :504-515, AddCondition :574-604).
  const matched = (value: Value, what: string): void => {
    if (value.kind !== 'arith' || lowered(value)) return
    const text = valueText(value)
    error(
      value.loc,
      'arithmetic-argument',
      `Arithmetic expression '${text}' cannot be used as ${what}; assign it first: (= ?value ${text})`
    )
  }

  const cond = (c: Cond, scope: Scope): CondIR => {
    switch (c.kind) {
      case 'and':
      case 'or':
      case 'alt':
        return { k: c.kind, items: c.children.map(child => cond(child, scope)), source: source(c.loc) }
      case 'not':
        return { k: 'not', item: cond(c.child, scope), source: source(c.loc) }
      case 'fact':
        facts.add(signature(c.name, c.args.length))
        c.args.forEach(a => matched(a, 'a fact argument'))
        return { k: 'fact', name: c.name, args: c.args.map(a => term(a, scope)), source: source(c.loc) }
      case 'axiom': {
        const id = resolve(c.name, c.args.length, qualifiedAxioms, effectiveAxioms)
        if (id === undefined) error(c.loc, 'unknown-axiom', `Axiom call '${c.name}' cannot be resolved`)
        else {
          // Upstream's code generator: an ?out_ / ?io_ output needs a caller variable slot, which a discard has not
          // ("Generated axiom variable output has no caller/parameter slot", HTNCCodeGenerator.cpp:2334-2340).
          const params = axiomDecls[id].decl.params
          c.args.forEach((a, i) => {
            const p = params[i]
            if (a.kind !== 'var' || !a.name.startsWith('any_') || p === undefined || p.name.startsWith('inp_')) return
            error(
              a.loc,
              'discard-consumed',
              `Singleton variable '?${a.name}' cannot receive output '?${p.name}' of axiom '${c.name}'; ` +
                `name the variable (e.g. '?${a.name.slice(4) || 'value'}') even if nothing reads it.`
            )
          })
        }
        const ir: CondIR = { k: 'axiom', axiom: id ?? -1, args: c.args.map(a => term(a, scope)), source: source(c.loc) }
        if (c.name.includes('::')) ir.name = c.name
        return ir
      }
      case 'call':
        callterms.add(c.name)
        return { k: 'call', name: c.name, args: c.args.map(a => expr(a, scope)), source: source(c.loc) }
      case 'assign': {
        const slot = scope.slot(c.dest.name)
        return { k: 'assign', slot, expr: expr(c.expr, scope), source: source(c.loc) }
      }
      case 'cmp':
        return { k: 'cmp', op: c.op, a: expr(c.a, scope), b: expr(c.b, scope), source: source(c.loc) }
      case 'split':
        c.args.forEach(a => matched(a, 'a split_list argument'))
        return {
          k: 'split',
          from: c.from,
          list: expr(c.args[0], scope),
          a: term(c.args[1], scope),
          b: term(c.args[2], scope),
          source: source(c.loc),
          ...(c.written === 'split_list_front' ? { name: 'split_list_front' as const } : {})
        }
    }
  }

  const task = (t: Task, scope: Scope): TaskIR => {
    const args = t.args.map(a => expr(a, scope))
    const src = source(t.loc)
    if (t.kind === 'prim') return { k: 'prim', name: '!' + t.name, args, source: src }
    const id = resolve(t.name, t.args.length, qualifiedMethods, effectiveMethods)
    if (id === undefined) error(t.loc, 'unknown-method', `Method call '${t.name}' cannot be resolved`)
    if (t.kind === 'defer') return { k: 'defer', method: id ?? -1, args, name: '&' + t.name, source: src }
    return t.name.includes('::')
      ? { k: 'method', method: id ?? -1, args, source: src, name: t.name }
      : { k: 'method', method: id ?? -1, args, source: src }
  }

  const axioms: AxiomIR[] = axiomDecls.map(({ module, decl }, id) => {
    const scope = new Scope(decl.params)
    const body = decl.body ? cond(decl.body, scope) : null
    return {
      id,
      name: decl.name,
      domain: module.name,
      arity: decl.params.length,
      params: decl.params.map(p => ({
        name: '?' + p.name,
        mode: p.name.startsWith('out_') ? ('out' as const) : p.name.startsWith('io_') ? ('io' as const) : ('inp' as const)
      })),
      vars: scope.vars,
      cond: body,
      source: source(decl.loc)
    }
  })

  const root = modules[modules.length - 1]
  const methods: MethodIR[] = methodDecls.map(({ module, decl }, id) => {
    const branches: BranchIR[] = decl.branches.map(b => {
      const scope = new Scope(decl.params)
      const c = b.cond ? cond(b.cond, scope) : null
      const tasks = b.tasks.map(t => task(t, scope))
      return { name: b.name, vars: scope.vars, cond: c, tasks, source: source(b.loc) }
    })
    return {
      id,
      name: decl.name,
      domain: module.name,
      arity: decl.params.length,
      params: decl.params.map(p => '?' + p.name),
      topLevel: module === root && decl.topLevel,
      branches,
      source: source(decl.loc)
    }
  })

  const topLevel: DomainIR['topLevel'] = {}
  for (const m of methods)
    if (m.topLevel) {
      const byArity = topLevel[m.name] ?? (topLevel[m.name] = {})
      byArity[m.arity] = effectiveMethods.get(signature(m.name, m.arity)) ?? m.id
    }

  if (!ok) return null
  markDeterministicFacts(methods, axioms)
  // A domain declares no default top-level method: upstream HTNPlanningUnit takes it from the host
  // (HTNIntegration/src/Hook/HTNPlanningUnit.cpp:27), as PlanRunnerOptions.defaultTopLevel.
  return {
    version: HTN_IR_VERSION,
    name: root.name,
    methods,
    axioms,
    topLevel,
    facts: [...facts],
    callterms: [...callterms]
  }
}

/** Upstream HasNestedAssignmentCall below a condition argument: a call or a runtime list anywhere inside. */
function lowered(value: Value): boolean {
  if (value.kind === 'call' || value.kind === 'list') return true
  return value.kind === 'arith' && value.args.some(lowered)
}

/** A value as written (upstream FormatDomainValueExpression, HTNCompilerIRBuilder.cpp:48-140). */
function valueText(value: Value): string {
  switch (value.kind) {
    case 'lit':
      return literalText(value.atom)
    case 'var':
      return '?' + value.name
    case 'const':
      return '@' + value.name
    case 'call':
      return `(call ${value.name}${value.args.map(a => ' ' + valueText(a)).join('')})`
    case 'arith':
      return `(${value.op}${value.args.map(a => ' ' + valueText(a)).join('')})`
    case 'list':
      return `(${value.items.map(valueText).join(' ')})`
  }
}

/**
 * Mark facts that have at most one solution (fact `once`), as upstream's generator decides at translation time:
 * AnalyzeCondition (HTNCCodeGenerator.cpp:222) flags MayProduceMultipleSolutions when a variable argument is
 * outside the statically bound set, and only then emits a fact choice point (HTNConditionContinuation.inl:192);
 * otherwise EmitDirectDeterministicFact (HTNCCodeGenerator.cpp:966) stops at the first matching row.
 * Bound on entry: every method parameter (:3079 MethodBoundVariables), an axiom's ?inp_ parameters (.inl:136;
 * not ?io_). `and` threads the set, `or`/`alt` keep what every child binds, `not` binds nothing.
 */
export function markDeterministicFacts(methods: readonly MethodIR[], axioms: readonly AxiomIR[]): void {
  for (const m of methods) {
    const params = new Set<Slot>()
    for (let i = 0; i < m.arity; i++) params.add(i)
    for (const b of m.branches) if (b.cond) boundAfter(b.cond, params, axioms)
  }
  for (const a of axioms) {
    const inputs = new Set<Slot>()
    a.params.forEach((p, i) => p.mode === 'inp' && inputs.add(i))
    if (a.cond) boundAfter(a.cond, inputs, axioms)
  }
}

/** Slots statically bound after `c` succeeds, given `bound` before it (AnalyzeCondition BoundAfter); marks facts. */
function boundAfter(c: CondIR, bound: ReadonlySet<Slot>, axioms: readonly AxiomIR[]): ReadonlySet<Slot> {
  const plus = (terms: readonly TermIR[]) => {
    const out = new Set(bound)
    for (const t of terms) if (t.k === 'var') out.add(t.slot)
    return out
  }
  switch (c.k) {
    case 'and': {
      let after = bound
      for (const item of c.items) after = boundAfter(item, after, axioms)
      return after
    }
    case 'or':
    case 'alt': {
      let common: Set<Slot> | undefined
      for (const item of c.items) {
        const after = boundAfter(item, bound, axioms)
        if (common === undefined) common = new Set(after)
        else for (const s of common) if (!after.has(s)) common.delete(s)
      }
      return common ?? bound
    }
    case 'not':
      boundAfter(c.item, bound, axioms)
      return bound
    case 'fact':
      if (c.args.every(t => t.k !== 'var' || bound.has(t.slot))) c.once = true
      else delete c.once
      return plus(c.args)
    case 'axiom': {
      // Only ?out_/?io_ arguments are bound by the call.
      const params = axioms[c.axiom]?.params ?? []
      return plus(c.args.filter((_, i) => params[i] !== undefined && params[i].mode !== 'inp'))
    }
    case 'assign':
      return plus([{ k: 'var', slot: c.slot }])
    case 'split':
      return plus([c.a, c.b])
    default:
      return bound
  }
}
