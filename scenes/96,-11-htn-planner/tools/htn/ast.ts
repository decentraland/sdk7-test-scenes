// Compiler AST: port of upstream Translator/HTNCompilerAST.h. Build-time data only.
import type { Atom } from '../../src/htn-planner/htn/atom'
import type { Loc } from './diagnostics'

export type ArithOp = '+' | '-' | '*' | '/' | '%' | '++' | '--'
export type CmpOp = '==' | '!=' | '<' | '<=' | '>' | '>='

// Names are stored without their '?' / '@' prefixes, as upstream does.
export type Value =
  | { kind: 'lit'; atom: Atom; loc: Loc } // scalar literal or fully literal (static) list
  | { kind: 'var'; name: string; loc: Loc }
  | { kind: 'const'; name: string; loc: Loc }
  | { kind: 'call'; name: string; args: Value[]; loc: Loc }
  | { kind: 'arith'; op: ArithOp; args: Value[]; loc: Loc }
  | { kind: 'list'; items: Value[]; loc: Loc } // runtime list: at least one non-literal element

export type Cond =
  | { kind: 'and' | 'or' | 'alt'; children: Cond[]; loc: Loc }
  | { kind: 'not'; child: Cond; loc: Loc }
  | { kind: 'fact'; name: string; args: Value[]; loc: Loc }
  | { kind: 'axiom'; name: string; args: Value[]; loc: Loc } // name may be 'Domain::name'
  | { kind: 'call'; name: string; args: Value[]; loc: Loc }
  | { kind: 'assign'; dest: Value & { kind: 'var' }; expr: Value; loc: Loc }
  | { kind: 'cmp'; op: CmpOp; a: Value; b: Value; loc: Loc }
  // `args` in source order: front/split_list -> list, element, rest; back -> list, rest, element.
  | { kind: 'split'; from: 'front' | 'back'; args: Value[]; loc: Loc; written?: 'split_list_front' }

export interface Task {
  kind: 'prim' | 'method' | 'defer'
  name: string // may be 'Domain::name' for method/defer
  args: Value[]
  loc: Loc
}

export interface Branch {
  name: string
  cond: Cond | null
  tasks: Task[]
  loc: Loc
}

export interface Method {
  name: string
  params: (Value & { kind: 'var' })[]
  branches: Branch[]
  topLevel: boolean
  isBase: boolean
  overrides: string // '' when not an override
  loc: Loc
}

export interface Axiom {
  name: string
  params: (Value & { kind: 'var' })[]
  body: Cond | null
  isBase: boolean
  overrides: string
  loc: Loc
}

export interface Constant {
  name: string
  value: Value & { kind: 'lit' }
  loc: Loc
}

export interface ConstantGroup {
  name: string
  isBase: boolean
  overrides: string
  constants: Constant[]
  loc: Loc
}

export interface Domain {
  name: string
  isTopLevel: boolean
  isBase: boolean
  groups: ConstantGroup[]
  axioms: Axiom[]
  methods: Method[]
  loc: Loc
  file: number
  /** Names of methods/axioms/constants whose declaration failed to parse (error recovery). */
  failedNames: Set<string>
}

export const signature = (name: string, arity: number) => `${name}/${arity}`
