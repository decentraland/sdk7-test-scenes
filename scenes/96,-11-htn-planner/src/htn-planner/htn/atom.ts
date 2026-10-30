// Runtime values of the HTN planner (TS port of urosidoki/htn_planner HTNAtom).
// Ships in the scene bundle: plain ES2020, no Node APIs, no eval.

export type Atom =
  | { readonly t: 'int'; readonly v: number } // signed 32-bit, always an integer
  | { readonly t: 'float'; readonly v: number } // single precision (Math.fround)
  | { readonly t: 'bool'; readonly v: boolean } // only from host facts/callterms; no literal syntax
  | { readonly t: 'sym'; readonly v: string } // interned identifier; `true`/`false` are symbols
  | { readonly t: 'str'; readonly v: string } // quoted text
  | { readonly t: 'list'; readonly v: readonly Atom[] } // ordered, heterogeneous, nestable

// Atoms are immutable values, so the constructors share the common ones: bool() and int() of a small value allocate
// nothing (the planner's arithmetic uses int() too). Built once when the module loads; never changed.
const TRUE: Atom = { t: 'bool', v: true }
const FALSE: Atom = { t: 'bool', v: false }
const SMALL_INT_MIN = -128
const SMALL_INT_MAX = 1023
const SMALL_INTS: readonly Atom[] = (() => {
  const out: Atom[] = []
  for (let v = SMALL_INT_MIN; v <= SMALL_INT_MAX; v++) out.push({ t: 'int', v })
  return out
})()

export const int = (v: number): Atom => {
  const i = v | 0
  return i >= SMALL_INT_MIN && i <= SMALL_INT_MAX ? SMALL_INTS[i - SMALL_INT_MIN] : { t: 'int', v: i }
}
export const float = (v: number): Atom => ({ t: 'float', v: Math.fround(v) })
export const bool = (v: boolean): Atom => (v ? TRUE : FALSE)
export const sym = (v: string): Atom => ({ t: 'sym', v })
export const str = (v: string): Atom => ({ t: 'str', v })
export const list = (...v: Atom[]): Atom => ({ t: 'list', v })

/** Host convenience: an (x, y, z) position as a list of floats, the upstream convention. */
export const vec3 = (x: number, y: number, z: number): Atom => list(float(x), float(y), float(z))

/**
 * Mirrors upstream HTNAtomToString(atom, quoteStrings=true), used by its FormatPlan:
 * int as decimal, float with exactly one decimal (std::fixed, precision 1),
 * bool as 1/0, symbol bare, string double-quoted, list as "(a b c)", empty list "()".
 */
export function formatAtom(atom: Atom): string {
  switch (atom.t) {
    case 'int': return String(atom.v)
    case 'float': return formatFixed1(atom.v)
    case 'bool': return atom.v ? '1' : '0'
    case 'sym': return atom.v
    case 'str': return `"${atom.v}"`
    case 'list': return `(${atom.v.map(formatAtom).join(' ')})`
  }
}

/** One plan step as upstream FormatPlanStep prints it: `!head arg1 arg2`. */
export function formatTask(name: string, args: readonly Atom[]): string {
  return args.length === 0 ? name : `${name} ${args.map(formatAtom).join(' ')}`
}

// printf("%.1f") rounds the exact binary value half-to-even; toFixed rounds half-up.
// Exact ties only occur for values like 0.25, so correct those explicitly.
function formatFixed1(v: number): string {
  const scaled = v * 10
  const floor = Math.floor(scaled)
  if (scaled - floor === 0.5) return ((floor % 2 === 0 ? floor : floor + 1) / 10).toFixed(1)
  return v.toFixed(1)
}
