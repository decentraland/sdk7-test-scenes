// S-expression parser: tokens -> forms -> compiler AST for one domain module.
// Port of upstream Translator/HTNCompilerDomainSyntaxParser.cpp. Error locations follow
// upstream's ErrorRange tracking (the innermost condition/task/branch/declaration form),
// except where noted.
import { list as listAtom, float, int, str, sym } from '../../src/htn-planner/htn/atom'
import type { Atom } from '../../src/htn-planner/htn/atom'
import type { ArithOp, Axiom, Branch, Cond, CmpOp, ConstantGroup, Domain, Method, Task, Value } from './ast'
import { START } from './diagnostics'
import type { Loc, Pos } from './diagnostics'
import { NEGATIVE_LITERAL_DIAGNOSTIC, lex } from './lexer'
import type { Token, TokenType } from './lexer'

export interface SyntaxError {
  code: string
  message: string
  pos: Pos
  end: Pos // exclusive (upstream HTNParserError.Range)
  fatal: boolean // fatal: nothing of the module is usable; otherwise only one declaration was dropped
}

interface Form {
  type: TokenType
  tok?: Token
  isList: boolean
  items: Form[]
  begin: Pos
  end: Pos
}

const EMPTY: Form = { type: 'EOF', isList: false, items: [], begin: START, end: START }

const ARITH: Partial<Record<TokenType, ArithOp>> = {
  PLUS: '+', MINUS: '-', INC: '++', DEC: '--', MUL: '*', DIV: '/', MOD: '%'
}
const CMP: Partial<Record<TokenType, CmpOp>> = { EQ: '==', NE: '!=', LT: '<', LE: '<=', GT: '>', GE: '>=' }

class Bail extends Error {}

export const AXIOM_PREFIX_IN_TASK_DIAGNOSTIC = "'#' is reserved for axiom calls; use '&' for deferred method calls"

interface Range {
  begin: Pos
  end: Pos
}
const rangeOf = (f: { begin: Pos; end: Pos }): Range => ({ begin: f.begin, end: f.end })

class Parser {
  /** Upstream's ErrorRange: the innermost form (or token) being parsed, where an error is reported. */
  errorRange: Range = { begin: START, end: START }
  error: { code: string; message: string; pos: Pos; end: Pos } | null = null

  constructor(readonly file: number) {}

  invalid(code: string, message: string, range: Range = this.errorRange): never {
    if (!this.error) this.error = { code, message, pos: range.begin, end: range.end }
    throw new Bail()
  }

  /** `end`: exclusive end of the range (upstream HTNSourceRange.End), for debugger source ranges. */
  loc(p: Pos, end?: Pos): Loc {
    const loc: Loc = { file: this.file, line: p.line, col: p.col, offset: p.offset }
    if (end) {
      loc.endLine = end.line
      loc.endCol = end.col
    }
    return loc
  }

  at(items: Form[], index: number): Form {
    if (index >= items.length) this.invalid('incomplete-syntax', 'Incomplete compiler syntax')
    return items[index]
  }

  is(form: Form, type: TokenType): boolean {
    return !form.isList && form.type === type
  }

  name(form: Form): string {
    if (!this.is(form, 'IDENT')) this.invalid('expected-identifier', 'Expected compiler identifier')
    return form.tok!.text
  }

  literal(form: Form): Atom {
    if (form.isList) {
      // Upstream reports this at the enclosing form; we point at the `()` itself.
      if (form.items.length === 0) this.invalid('empty-literal-list', 'Empty literal list', rangeOf(form))
      return listAtom(...form.items.map(item => this.literal(item)))
    }
    if (this.is(form, 'IDENT')) return sym(form.tok!.text)
    if (this.is(form, 'STRING')) return str(form.tok!.text)
    if (this.is(form, 'NUMBER')) return form.tok!.num!.isFloat ? float(form.tok!.num!.value) : int(form.tok!.num!.value)
    this.errorRange = rangeOf(form)
    this.invalid(
      'expected-literal',
      this.is(form, 'MINUS') || this.is(form, 'DEC')
        ? NEGATIVE_LITERAL_DIAGNOSTIC
        : 'Expected a value: symbol, string, number, variable or list expression'
    )
  }

  /** Reads one value starting at items[cursor.i]; advances the cursor (two items for ?x / @x). */
  argument(items: Form[], cursor: { i: number }): Value {
    const head = this.at(items, cursor.i++)
    const loc = this.loc(head.begin, head.end)
    if (this.is(head, 'QUESTION') || this.is(head, 'AT')) {
      const id = this.at(items, cursor.i++)
      const name = this.name(id)
      const span = this.loc(head.begin, id.end)
      return this.is(head, 'QUESTION') ? { kind: 'var', name, loc: span } : { kind: 'const', name, loc: span }
    }
    if (head.isList && head.items.length > 0) {
      const first = head.items[0]
      const op = first.isList ? undefined : ARITH[first.type]
      if (op) {
        const args: Value[] = []
        for (const c = { i: 1 }; c.i < head.items.length; ) args.push(this.argument(head.items, c))
        const n = args.length
        const valid = op === '++' || op === '--' ? n === 1 : op === '-' ? n >= 1 : op === '%' ? n === 2 : n >= 2
        if (!valid) this.invalid('invalid-arithmetic-arity', 'Invalid arithmetic expression arity')
        return { kind: 'arith', op, args, loc }
      }
      if (this.is(first, 'CALL')) {
        const name = this.name(this.at(head.items, 1))
        const args: Value[] = []
        for (const c = { i: 2 }; c.i < head.items.length; ) args.push(this.argument(head.items, c))
        return { kind: 'call', name, args, loc }
      }
      const items: Value[] = []
      for (const c = { i: 0 }; c.i < head.items.length; ) items.push(this.argument(head.items, c))
      if (items.every(v => v.kind === 'lit'))
        return { kind: 'lit', atom: listAtom(...items.map(v => (v as { atom: Atom }).atom)), loc }
      return { kind: 'list', items, loc }
    }
    return { kind: 'lit', atom: this.literal(head), loc }
  }

  qualifiedIdentifier(items: Form[], start: number): { name: string; next: number } {
    let name = this.name(this.at(items, start))
    let next = start + 1
    if (next + 2 < items.length && this.is(items[next], 'COLON') && this.is(items[next + 1], 'COLON')) {
      name += '::' + this.name(items[next + 2])
      next += 3
    }
    return { name, next }
  }

  args(items: Form[], from: number): Value[] {
    const out: Value[] = []
    for (const c = { i: from }; c.i < items.length; ) out.push(this.argument(items, c))
    return out
  }

  condition(form: Form): Cond {
    this.errorRange = rangeOf(form)
    if (!form.isList || form.items.length === 0) this.invalid('expected-condition', 'Expected compiler condition')
    const items = form.items
    const first = items[0]
    if (this.is(first, 'AND') || this.is(first, 'OR') || this.is(first, 'ALT')) {
      const kind = this.is(first, 'AND') ? 'and' : this.is(first, 'OR') ? 'or' : 'alt'
      const children: Cond[] = []
      for (let i = 1; i < items.length; i++) children.push(this.condition(items[i]))
      // Upstream (HTNCompilerDomainSyntaxParser.cpp:277-279): from the keyword to the end of the last item.
      return { kind, children, loc: this.loc(first.begin, items[items.length - 1].end) }
    }
    // Every other condition ends with its last item, before its own ')' (:296, :310, :385).
    const last = items[items.length - 1].end
    if (this.is(first, 'NOT')) {
      if (items.length !== 2) this.invalid('invalid-not-condition', 'Invalid not condition')
      const loc = this.loc(form.begin, last)
      return { kind: 'not', child: this.condition(items[1]), loc }
    }
    const cmp = first.isList ? undefined : CMP[first.type]
    if (cmp) {
      const args = this.args(items, 1)
      if (args.length !== 2) this.invalid('invalid-comparison-arity', 'Comparison requires two arguments')
      return { kind: 'cmp', op: cmp, a: args[0], b: args[1], loc: this.loc(first.begin, last) } // starts at the operator
    }
    const loc = this.loc(form.begin, last)
    if (this.is(first, 'QUESTION'))
      this.invalid(
        'implicit-assignment',
        'Implicit call-result binding is no longer supported; use an explicit assignment condition'
      )
    if (this.is(first, 'ASSIGN')) {
      const message = 'Assignment requires a variable destination and exactly one value expression'
      const c = { i: 1 }
      if (c.i >= items.length || !this.is(items[c.i], 'QUESTION')) this.invalid('invalid-assignment', message)
      const dest = this.argument(items, c) as Value & { kind: 'var' }
      if (c.i >= items.length) this.invalid('invalid-assignment', message)
      const expr = this.argument(items, c)
      if (c.i !== items.length) this.invalid('invalid-assignment', message)
      return { kind: 'assign', dest, expr, loc }
    }
    if (this.is(first, 'CALL')) {
      const name = this.name(this.at(items, 1))
      return { kind: 'call', name, args: this.args(items, 2), loc }
    }
    const isAxiom = this.is(first, 'HASH')
    const { name, next } = this.qualifiedIdentifier(items, isAxiom ? 1 : 0)
    if (!isAxiom && name.includes('::')) this.invalid('qualified-fact', 'Fact condition cannot be qualified')
    const args = this.args(items, next)
    if (!isAxiom && (name === 'split_list' || name === 'split_list_front' || name === 'split_list_back')) {
      if (args.length !== 3) this.invalid('invalid-split-arity', 'split_list requires three arguments')
      const written = name === 'split_list_front' ? { written: 'split_list_front' as const } : {}
      return { kind: 'split', from: name === 'split_list_back' ? 'back' : 'front', args, loc, ...written }
    }
    return isAxiom ? { kind: 'axiom', name, args, loc } : { kind: 'fact', name, args, loc }
  }

  body(form: Form): Cond | null {
    this.errorRange = rangeOf(form)
    if (!form.isList) this.invalid('expected-condition-body', 'Expected compiler condition body')
    if (form.items.length === 0) return null
    const first = form.items[0]
    if (this.is(first, 'AND') || this.is(first, 'OR') || this.is(first, 'ALT')) return this.condition(form)
    this.invalid('expected-condition-body', 'Expected and, or or alt condition body')
  }

  task(form: Form): Task {
    this.errorRange = rangeOf(form)
    if (!form.isList || form.items.length === 0) this.invalid('expected-task', 'Expected compiler task')
    const items = form.items
    let index = 0
    let kind: Task['kind'] = 'method'
    if (this.is(items[0], 'BANG')) {
      kind = 'prim'
      index++
    } else if (this.is(items[0], 'AMP')) {
      kind = 'defer'
      index++
    } else if (this.is(items[0], 'HASH')) {
      this.invalid('axiom-prefix-in-task-list', AXIOM_PREFIX_IN_TASK_DIAGNOSTIC)
    }
    const { name, next } = this.qualifiedIdentifier(items, index)
    if (kind === 'prim' && name.includes('::'))
      this.invalid('qualified-primitive-task', 'Primitive task cannot be qualified')
    return { kind, name, args: this.args(items, next), loc: this.loc(form.begin, form.end) }
  }

  branch(form: Form): Branch {
    this.errorRange = rangeOf(form)
    if (!form.isList || form.items.length !== 3 || !form.items[1].isList || !form.items[2].isList)
      this.invalid('expected-branch', 'Expected compiler branch')
    const name = this.name(form.items[0])
    const cond = this.body(form.items[1])
    const tasks = form.items[2].items.map(child => this.task(child))
    return { name, cond, tasks, loc: this.loc(form.begin, form.end) }
  }

  /** Parses one declaration into `domain`. On failure records the declared name(s) in `failedNames`. */
  declaration(form: Form, domain: Domain): void {
    this.errorRange = rangeOf(form)
    if (!form.isList || form.items.length < 2 || !this.is(form.items[0], 'COLON'))
      this.invalid('expected-declaration', 'Expected compiler declaration')
    const items = form.items
    if (this.is(items[1], 'CONSTANTS')) {
      for (const entry of items.slice(2))
        if (entry.isList && entry.items.length > 0 && this.is(entry.items[0], 'IDENT'))
          domain.failedNames.add('@' + entry.items[0].tok!.text) // dropped if the group fails below
      const group: ConstantGroup = { name: 'unnamed', isBase: false, overrides: '', constants: [], loc: this.loc(form.begin, form.end) }
      let index = 2
      if (index < items.length && this.is(items[index], 'IDENT')) group.name = this.name(items[index++])
      if (index < items.length && this.is(items[index], 'BASE')) {
        group.isBase = true
        index++
      } else if (index < items.length && this.is(items[index], 'OVERRIDES')) {
        group.overrides = this.name(this.at(items, index + 1))
        index += 2
      }
      for (; index < items.length; index++) {
        const entry = items[index]
        // Upstream reports at the whole (:constants ...) form; we point at the offending entry.
        if (!entry.isList || entry.items.length !== 2) this.invalid('expected-constant', 'Expected compiler constant', rangeOf(entry))
        const name = this.name(this.at(entry.items, 0))
        const c = { i: 1 }
        const value = this.argument(entry.items, c)
        if (value.kind !== 'lit' || c.i !== entry.items.length)
          this.invalid('expected-constant-literal', 'Expected constant literal', rangeOf(entry))
        group.constants.push({ name, value, loc: this.loc(entry.begin, entry.end) })
      }
      for (const constant of group.constants) domain.failedNames.delete('@' + constant.name)
      domain.groups.push(group)
      return
    }
    if (this.is(items[1], 'AXIOM') || this.is(items[1], 'METHOD')) {
      const isAxiom = this.is(items[1], 'AXIOM')
      const sig = items.length > 2 ? items[2] : EMPTY
      if (sig.isList && sig.items.length > 0 && this.is(sig.items[0], 'IDENT'))
        domain.failedNames.add((isAxiom ? '#' : '') + sig.items[0].tok!.text)
      const signatureForm = this.at(items, 2)
      const name = this.name(this.at(signatureForm.items, 0))
      const params: (Value & { kind: 'var' })[] = []
      for (const c = { i: 1 }; c.i < signatureForm.items.length; ) {
        const param = this.argument(signatureForm.items, c)
        if (param.kind !== 'var') this.invalid('expected-parameter-variable', 'Expected parameter variable')
        params.push(param)
      }
      let index = 3
      let topLevel = false
      let isBase = false
      let overrides = ''
      if (index < items.length && this.is(items[index], 'TOP_LEVEL_METHOD')) {
        topLevel = true
        index++
      } else if (index < items.length && this.is(items[index], 'BASE')) {
        isBase = true
        index++
      } else if (index < items.length && this.is(items[index], 'OVERRIDES')) {
        overrides = this.name(this.at(items, index + 1))
        index += 2
      }
      const loc = this.loc(form.begin, form.end)
      if (isAxiom) {
        if (topLevel) this.invalid('invalid-axiom-visibility', 'Axiom cannot be a top_level_method')
        const body = this.body(this.at(items, index))
        if (index + 1 !== items.length) this.invalid('unexpected-axiom-syntax', 'Unexpected axiom syntax')
        const axiom: Axiom = { name, params, body, isBase, overrides, loc }
        domain.axioms.push(axiom)
        domain.failedNames.delete('#' + name)
      } else {
        const branches: Branch[] = []
        for (; index < items.length; index++) branches.push(this.branch(items[index]))
        const method: Method = { name, params, branches, topLevel, isBase, overrides, loc }
        domain.methods.push(method)
        domain.failedNames.delete(name)
      }
      return
    }
    this.invalid('unknown-declaration', 'Unknown compiler declaration')
  }
}

function readForms(tokens: Token[], p: Parser): Form {
  let position = 0
  const read = (): Form => {
    if (position >= tokens.length) p.invalid('token-out-of-bounds', 'Unexpected end of compiler syntax')
    const token = tokens[position++]
    p.errorRange = rangeOf(token)
    if (token.type === 'RPAREN' || token.type === 'EOF') p.invalid('unexpected-token', 'Unexpected compiler syntax token')
    if (token.type !== 'LPAREN') return { type: token.type, tok: token, isList: false, items: [], begin: token.begin, end: token.end }
    const form: Form = { type: 'LPAREN', tok: token, isList: true, items: [], begin: token.begin, end: token.end }
    while (position < tokens.length && tokens[position].type !== 'RPAREN') {
      if (tokens[position].type === 'EOF') p.invalid('unclosed-list', 'Unclosed compiler syntax list')
      form.items.push(read())
    }
    if (position >= tokens.length) p.invalid('unclosed-list', 'Unclosed compiler syntax list')
    form.end = tokens[position++].end
    return form
  }
  const root = read()
  if (position >= tokens.length || tokens[position].type !== 'EOF') {
    if (position < tokens.length) p.errorRange = rangeOf(tokens[position])
    p.invalid('trailing-source', 'Unexpected source after compiler domain')
  }
  return root
}

/**
 * Parse the domain form of one module (include directives already blanked out).
 * Declaration-level errors are recoverable: the declaration is dropped and parsing continues.
 */
export function parseDomain(text: string, file: number): { domain: Domain | null; errors: SyntaxError[] } {
  const lexed = lex(text)
  if (lexed.error) return { domain: null, errors: [{ ...lexed.error, fatal: true }] }
  const p = new Parser(file)
  const fatal = (): { domain: null; errors: SyntaxError[] } => ({ domain: null, errors: [{ ...p.error!, fatal: true }] })
  let root: Form
  try {
    root = readForms(lexed.tokens, p)
  } catch (e) {
    if (e instanceof Bail) return fatal()
    throw e
  }
  const domain: Domain = {
    name: '',
    isTopLevel: false,
    isBase: false,
    groups: [],
    axioms: [],
    methods: [],
    loc: p.loc(root.begin, root.end),
    file,
    failedNames: new Set()
  }
  try {
    if (!root.isList || root.items.length < 3 || !p.is(root.items[0], 'COLON') || !p.is(root.items[1], 'DOMAIN'))
      p.invalid('expected-domain', 'Expected compiler domain', rangeOf(root))
    domain.name = p.name(root.items[2])
  } catch (e) {
    if (e instanceof Bail) return fatal()
    throw e
  }
  let index = 3
  if (index < root.items.length && p.is(root.items[index], 'TOP_LEVEL_DOMAIN')) {
    domain.isTopLevel = true
    index++
  } else if (index < root.items.length && p.is(root.items[index], 'BASE')) {
    domain.isBase = true
    index++
  }
  const errors: SyntaxError[] = []
  for (; index < root.items.length; index++) {
    const declaration = root.items[index]
    p.errorRange = rangeOf(declaration)
    p.error = null
    try {
      if (!declaration.isList || declaration.items.length < 2)
        p.invalid('expected-declaration', 'Expected compiler declaration')
      p.declaration(declaration, domain)
    } catch (e) {
      if (!(e instanceof Bail)) throw e
      errors.push({ ...p.error!, fatal: false })
    }
  }
  return { domain, errors }
}
