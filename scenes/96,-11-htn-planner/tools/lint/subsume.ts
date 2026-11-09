// Does one branch condition hold whenever another does? htn:lint's test for shadowed and order-dependent branches.
// A condition is the list of its top-level `and` children (an `or` / `alt` body is one literal). Condition A
// subsumes condition B when a substitution of A's variables makes every literal of A a literal of B
// (theta-subsumption): then any world where B holds also satisfies A, so A, tried first, always wins.
// Details:
// - method parameters are bound before the branch is tried: they are constants here, the same in both branches;
// - every `?any_` discard is a fresh variable;
// - a condition with a (call ...) is never compared: callterms may have side effects or answer differently per call;
// - a variable of A used only inside a `not` (an existential: "no row at all") may only stand for a variable of B
//   that is also used only inside a `not`, else B's narrower test would not imply A's.
// The original comparison used literal strings with every variable renamed to `?`; that flagged one false pair in the stalker
// (continue_investigation, retarget_investigation: `(focus ?heard_at)` ties focus to the noise). This does not.
import type { Branch, Cond, Value } from '../htn/ast'
import { literalText } from '../../src/htn-planner/htn/titles'

type Term = { v: string } | { c: string } | { f: string; args: Term[] }

export interface CondShape {
  literals: Term[]
  negOnly: Set<string> // variables used only inside a `not`
  impure: boolean // has a (call ...): a callterm may answer differently each time, so no claim is made
}

/** The literals of a branch condition; `params`: the method's parameter names (without '?'). */
export function condShape(branch: Branch, params: ReadonlySet<string>): CondShape {
  let fresh = 0
  let impure = false
  const positive = new Set<string>()
  const negative = new Set<string>()
  const value = (v: Value, neg: boolean): Term => {
    switch (v.kind) {
      case 'lit':
        return { c: literalText(v.atom) }
      case 'const':
        return { c: '@' + v.name }
      case 'var': {
        if (params.has(v.name)) return { c: '?' + v.name }
        const name = v.name.startsWith('any_') ? `${v.name}#${fresh++}` : v.name
        ;(neg ? negative : positive).add(name)
        return { v: name }
      }
      case 'call':
        impure = true
        return { f: 'call ' + v.name, args: v.args.map(a => value(a, neg)) }
      case 'arith':
        return { f: v.op, args: v.args.map(a => value(a, neg)) }
      case 'list':
        return { f: 'list', args: v.items.map(a => value(a, neg)) }
    }
  }
  const cond = (c: Cond, neg: boolean): Term => {
    switch (c.kind) {
      case 'and':
      case 'or':
      case 'alt':
        return { f: c.kind, args: c.children.map(child => cond(child, neg)) }
      case 'not':
        return { f: 'not', args: [cond(c.child, true)] }
      case 'fact':
        return { f: 'fact ' + c.name, args: c.args.map(a => value(a, neg)) }
      case 'axiom':
        return { f: '#' + c.name, args: c.args.map(a => value(a, neg)) }
      case 'call':
        impure = true
        return { f: 'call ' + c.name, args: c.args.map(a => value(a, neg)) }
      case 'assign':
        return { f: '=', args: [value(c.dest, neg), value(c.expr, neg)] }
      case 'cmp':
        return { f: c.op, args: [value(c.a, neg), value(c.b, neg)] }
      case 'split':
        return { f: 'split ' + c.from, args: c.args.map(a => value(a, neg)) }
    }
  }
  const body = branch.cond
  const literals = !body ? [] : body.kind === 'and' ? body.children.map(c => cond(c, false)) : [cond(body, false)]
  const negOnly = new Set([...negative].filter(v => !positive.has(v)))
  return { literals, negOnly, impure }
}

const equal = (a: Term, b: Term): boolean => {
  if ('v' in a) return 'v' in b && a.v === b.v
  if ('c' in a) return 'c' in b && a.c === b.c
  return 'f' in b && a.f === b.f && a.args.length === b.args.length && a.args.every((x, i) => equal(x, b.args[i]))
}

/** Does `a` hold whenever `b` holds? Gives up (false) after `budget` match steps. */
export function subsumes(a: CondShape, b: CondShape, budget = 20000): boolean {
  if (a.impure || b.impure) return false
  let steps = 0
  const match = (p: Term, t: Term, theta: Map<string, Term>, bound: string[]): boolean => {
    if (++steps > budget) return false
    if ('v' in p) {
      const prior = theta.get(p.v)
      if (prior) return equal(prior, t)
      if (a.negOnly.has(p.v) && !('v' in t && b.negOnly.has(t.v))) return false
      theta.set(p.v, t)
      bound.push(p.v)
      return true
    }
    if ('c' in p) return 'c' in t && t.c === p.c
    return 'f' in t && t.f === p.f && t.args.length === p.args.length && p.args.every((x, i) => match(x, t.args[i], theta, bound))
  }
  const search = (i: number, theta: Map<string, Term>): boolean => {
    if (i === a.literals.length) return true
    for (const target of b.literals) {
      const bound: string[] = []
      if (match(a.literals[i], target, theta, bound) && search(i + 1, theta)) return true
      for (const v of bound) theta.delete(v)
      if (steps > budget) return false
    }
    return false
  }
  return search(0, new Map())
}
