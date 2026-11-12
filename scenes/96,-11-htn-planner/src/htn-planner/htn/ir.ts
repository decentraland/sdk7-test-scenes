// Linked domain IR: the contract between the compiler (tools/htn, Node only) and the
// runtime planner (src/htn, ships in the scene). The compiler resolves everything that
// upstream resolves at translation time; the runtime does no name lookup beyond facts
// and callterms. Plain JSON-compatible data, so a generated module is just a literal.
import type { Atom } from './atom'
import type { CallSite } from './callterms'

// 2: source ranges (endLine/endCol), sources on tasks and and/or/alt/not, constant names on literals, discard
//    names, split_list_front spelling: what the debugger shows (htn/trace.ts), no change to planning.
export const HTN_IR_VERSION = 2

export type MethodId = number // index into DomainIR.methods
export type AxiomId = number // index into DomainIR.axioms
export type Slot = number // index into the owning scope's `vars`

/**
 * A source range, as upstream HTNSourceRange (end exclusive). Like upstream's parser: declarations, branches and tasks
 * span their whole form; a condition starts at its `(` (and/or/alt and comparisons at the keyword or operator) and
 * ends after its last item, before its own `)`.
 */
export interface SourceLoc {
  file: string // path relative to the root .domain file's directory, '/' separators
  line: number // 1-based
  col: number // 1-based
  endLine: number
  endCol: number // exclusive
}

export interface DomainIR {
  version: typeof HTN_IR_VERSION
  name: string // root domain name, e.g. 'Wanderer'
  methods: MethodIR[]
  axioms: AxiomIR[]
  /**
   * Public entry points: methods marked `top_level_method`, keyed by name, then arity.
   * Values are effective method ids (overrides applied). Only these can be planned directly.
   */
  topLevel: Record<string, Record<number, MethodId>>
  /** Source-wide fact requirements, `name/arity` (including pruned bodies). Used for host replan filtering and validation. */
  facts: string[]
  /** Source-wide callterm requirements (including pruned bodies). The host must provide all of them. */
  callterms: string[]
  /** Removed-body callsites, in their original callSites() positions, for full-domain validation (optional in v2). */
  prunedCallSites?: { index: number; call: CallSite }[]
}

export interface MethodIR {
  id: MethodId
  name: string // unqualified, e.g. 'move_to'
  domain: string // declaring domain, e.g. 'BaseMovement'
  arity: number
  params: string[] // '?inp_...' names; params occupy slots 0..arity-1 of every branch
  topLevel: boolean
  branches: BranchIR[] // source order = priority
  source?: SourceLoc
}

export interface BranchIR {
  name: string
  vars: string[] // slot names; first `arity` are the method params, then locals in first-use order
  cond: CondIR | null // null = `()` unconditional
  tasks: TaskIR[] // may be empty: an empty plan is a success
  source?: SourceLoc
}

export type ParamMode = 'inp' | 'out' | 'io'

export interface AxiomIR {
  id: AxiomId
  name: string
  domain: string
  arity: number
  params: { name: string; mode: ParamMode }[]
  vars: string[] // params occupy slots 0..arity-1, then locals
  cond: CondIR | null
  source?: SourceLoc
}

export type CondIR =
  | { k: 'and'; items: CondIR[]; source?: SourceLoc }
  | { k: 'or'; items: CondIR[]; source?: SourceLoc } // commit to the first child that succeeds
  | { k: 'alt'; items: CondIR[]; source?: SourceLoc } // keep alternatives across children
  | { k: 'not'; item: CondIR; source?: SourceLoc }
  // once: no argument is a variable that may be unbound here (compile-time analysis), so only the first
  // matching row is a solution (upstream EmitDirectDeterministicFact); otherwise every matching row is one.
  | { k: 'fact'; name: string; args: TermIR[]; once?: true; source?: SourceLoc }
  // name: the call as written when qualified, e.g. 'Base::visible' (debugger titles)
  | { k: 'axiom'; axiom: AxiomId; args: TermIR[]; source?: SourceLoc; name?: string }
  | { k: 'call'; name: string; args: ExprIR[]; source?: SourceLoc } // standalone: needs a BOOL result
  | { k: 'assign'; slot: Slot; expr: ExprIR; source?: SourceLoc } // `(= ?x expr)`
  | { k: 'cmp'; op: '==' | '!=' | '<' | '<=' | '>' | '>='; a: ExprIR; b: ExprIR; source?: SourceLoc }
  // a, b in source order: front (split_list / split_list_front) -> a = element, b = rest;
  // back (split_list_back) -> a = rest, b = element.
  // `name`: only when written `split_list_front` (debugger titles; the same operation as `split_list`).
  | { k: 'split'; from: 'front' | 'back'; list: ExprIR; a: TermIR; b: TermIR; source?: SourceLoc; name?: 'split_list_front' }

/** Argument of a fact/axiom/split: binds when its var is unbound at runtime, matches otherwise. */
export type TermIR = ExprIR | { k: 'discard'; name?: string } // `?any_...`; name as written, e.g. '?any_pos'

export type ExprIR =
  | { k: 'lit'; v: Atom; c?: string } // literals and inlined `@constants` (c: the constant's name, without '@')
  | { k: 'var'; slot: Slot }
  | { k: 'list'; items: ExprIR[] } // runtime-built list; every var must be bound
  | { k: 'arith'; op: '+' | '-' | '*' | '/' | '%' | '++' | '--'; args: ExprIR[] }
  | { k: 'call'; name: string; args: ExprIR[]; source?: SourceLoc } // callterm used as a value

export type TaskIR =
  | { k: 'prim'; name: string; args: ExprIR[]; source?: SourceLoc } // name keeps its '!' prefix, as in upstream plans
  // decompose now; overload/override resolved. `name`: the call as written when qualified, e.g. 'Base::move_to'.
  | { k: 'method'; method: MethodId; args: ExprIR[]; source?: SourceLoc; name?: string }
  // `&task`: args captured now, body decomposed later. `name` is the call as written, e.g.
  // '&advance_patrol' or '&Base::shared'; it becomes PlanStep.name (default '&' + method name).
  | { k: 'defer'; method: MethodId; args: ExprIR[]; name?: string; source?: SourceLoc }
