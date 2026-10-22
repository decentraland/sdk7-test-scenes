// Atom equality and numeric helpers shared by the planner (TS port of upstream HTNAtom_Equals).
// Ships in the scene bundle: ES2020, no allocation.
import type { Atom } from './atom'

/**
 * Upstream HTNAtom_Equals (HTNFramework/src/Core/HTNAtom.cpp:541): same type and value, except that
 * BOOL true/false matches INT 1/0 in either direction. INT and FLOAT never match each other here
 * (only `==`/`!=` compare numbers numerically). Lists compare element-wise with the same rule.
 * Used for fact arguments, axiom output checks, split outputs and non-numeric `==`.
 */
export function atomEquals(a: Atom, b: Atom): boolean {
  if (a === b) return true
  if (a.t !== b.t) {
    if (a.t === 'bool' && b.t === 'int') return b.v === (a.v ? 1 : 0)
    if (a.t === 'int' && b.t === 'bool') return a.v === (b.v ? 1 : 0)
    return false
  }
  if (a.t === 'list') {
    const x = a.v
    const y = (b as typeof a).v
    if (x.length !== y.length) return false
    for (let i = 0; i < x.length; i++) if (!atomEquals(x[i], y[i])) return false
    return true
  }
  return a.v === b.v
}

export function isNumeric(a: Atom): a is Extract<Atom, { t: 'int' | 'float' }> {
  return a.t === 'int' || a.t === 'float'
}
