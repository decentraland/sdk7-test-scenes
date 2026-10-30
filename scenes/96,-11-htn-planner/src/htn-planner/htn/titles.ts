// Debugger titles: an IR element printed the way upstream's generated debugger shows it, as text and as coloured
// tokens. Port of upstream urosidoki/htn_planner aec08fa:
// - expressions: HTNCompilerIRBuilder.cpp FormatDomainValueExpression / FormatDomainCondition (:48-140), with
//   composites shortened to "(and ...)" (:635-638);
// - condition tokens: HTNGeneratedDebugger.h BuildConditionTitleTokens (:475-530), which splits that text;
// - task tokens: BuildTaskTitleTokens (:432-473), one token per argument (AddValueTitleToken :391-430);
// - declarations: BuildDeclarationTitle (:264-273), branches "(name ...)" (:159), plans "(name)" (:133).
// Pure, no SDK; only called while a trace recorder is attached.
import { Atom, formatAtom } from './atom'
import type { AxiomIR, CondIR, DomainIR, ExprIR, MethodIR, TaskIR, TermIR } from './ir'

/** Upstream HTNGeneratedDebugger::Node::TitleTokenKind. */
export type TitleTokenKind = 'normal' | 'result' | 'var' | 'const' | 'string' | 'call'

export interface TitleToken {
  kind: TitleTokenKind
  text: string
  /** Upstream SpaceBefore: a space separates this token from the previous one. */
  space: boolean
  /** `const` tokens: the constant's value (upstream Node::Constants). */
  value?: string
}

export interface Title {
  text: string
  tokens: TitleToken[]
}

/** Literal as written: numbers in their shortest form (upstream keeps the source text, LiteralText). */
export function literalText(a: Atom): string {
  switch (a.t) {
    case 'float': {
      const s = String(Number(a.v.toPrecision(7)))
      return /[.eEn]/.test(s) ? s : s + '.0'
    }
    case 'list':
      return `(${a.v.map(literalText).join(' ')})`
    default:
      return formatAtom(a)
  }
}

/** A constant's value as upstream lists it (resolved_text: strings unquoted, HTNGeneratedEquivalenceTest.cpp:2436). */
export function constantText(a: Atom): string {
  if (a.t === 'str') return a.v
  if (a.t === 'list') return `(${a.v.map(constantText).join(' ')})`
  return literalText(a)
}

class Printer {
  readonly constants = new Map<string, string>()
  constructor(readonly vars: readonly string[]) {}

  expr(e: ExprIR): string {
    switch (e.k) {
      case 'lit':
        if (e.c === undefined) return literalText(e.v)
        this.constants.set('@' + e.c, constantText(e.v))
        return '@' + e.c
      case 'var':
        return this.vars[e.slot] ?? '?'
      case 'list':
        return `(${e.items.map(i => this.expr(i)).join(' ')})`
      case 'arith':
        return `(${e.op}${e.args.map(a => ' ' + this.expr(a)).join('')})`
      case 'call':
        return `(call ${e.name}${e.args.map(a => ' ' + this.expr(a)).join('')})`
    }
  }

  term(t: TermIR): string {
    return t.k === 'discard' ? t.name ?? '?any' : this.expr(t)
  }

  args(ts: readonly TermIR[]): string {
    return ts.map(t => ' ' + this.term(t)).join('')
  }
}

/** Upstream condition DebugExpression. `vars`: the owning BranchIR.vars / AxiomIR.vars. */
export function condText(domain: DomainIR, c: CondIR, vars: readonly string[]): { text: string; constants: Map<string, string> } {
  const p = new Printer(vars)
  let text: string
  switch (c.k) {
    case 'and':
    case 'or':
    case 'alt':
    case 'not':
      text = `(${c.k} ...)`
      break
    case 'fact':
      text = `(${c.name}${p.args(c.args)})`
      break
    case 'axiom':
      text = `(#${c.name ?? domain.axioms[c.axiom]?.name ?? '?'}${p.args(c.args)})`
      break
    case 'call':
      text = `(call ${c.name}${p.args(c.args)})`
      break
    case 'assign':
      text = `(= ${vars[c.slot] ?? '?'} ${p.expr(c.expr)})`
      break
    case 'cmp':
      text = `(${c.op} ${p.expr(c.a)} ${p.expr(c.b)})`
      break
    case 'split': {
      const name = c.name ?? (c.from === 'back' ? 'split_list_back' : 'split_list')
      text = `(${name} ${p.expr(c.list)} ${p.term(c.a)} ${p.term(c.b)})`
      break
    }
  }
  return { text, constants: p.constants }
}

/** Upstream BuildConditionTitleTokens: split the expression for colouring. */
export function conditionTokens(expression: string, constants: ReadonlyMap<string, string>): TitleToken[] {
  const out: TitleToken[] = []
  let head = false
  let callName = false
  const s = expression
  for (let i = 0; i < s.length; ) {
    if (s[i] === ' ') {
      i++
      continue
    }
    const begin = i
    const first = s[i++]
    if (first === '"') {
      while (i < s.length) {
        const ch = s[i++]
        if (ch === '\\' && i < s.length) i++
        else if (ch === '"') break
      }
    } else if (first !== '(' && first !== ')') {
      while (i < s.length && s[i] !== ' ' && s[i] !== '(' && s[i] !== ')') i++
    }
    const text = s.slice(begin, i)
    let kind: TitleTokenKind = 'normal'
    if (first === '?') kind = 'var'
    else if (first === '@') kind = 'const'
    else if (first === '"') kind = 'string'
    else if (text === 'call' || callName) kind = 'call'
    else if (head && first !== ')') kind = 'result'
    const token: TitleToken = { kind, text, space: begin === 0 || s[begin - 1] === ' ' }
    if (kind === 'const') token.value = constants.get(text) ?? '<unresolved>'
    out.push(token)
    head = first === '('
    callName = text === 'call'
  }
  return out
}

export function conditionTitle(domain: DomainIR, c: CondIR, vars: readonly string[]): Title {
  const { text, constants } = condText(domain, c, vars)
  return { text, tokens: conditionTokens(text, constants) }
}

/** Upstream BuildTaskTitleTokens: "(head" then one token per argument as written, then ")". */
export function taskTitle(domain: DomainIR, t: TaskIR, vars: readonly string[]): Title {
  const head = t.k === 'prim' ? t.name : t.k === 'defer' ? t.name ?? '&' + methodName(domain, t.method) : t.name ?? methodName(domain, t.method)
  const tokens: TitleToken[] = [{ kind: 'normal', text: '(' + head, space: true }]
  for (const a of t.args) {
    const p = new Printer(vars)
    const text = p.expr(a)
    let kind: TitleTokenKind = 'normal'
    if (a.k === 'var') kind = 'var'
    else if (a.k === 'lit' && a.c !== undefined) kind = 'const'
    else if (a.k === 'lit' && a.v.t === 'str') kind = 'string'
    else if (a.k === 'call') kind = 'call'
    const token: TitleToken = { kind, text, space: true }
    if (kind === 'const') token.value = p.constants.get(text)
    tokens.push(token)
  }
  tokens.push({ kind: 'normal', text: ')', space: false })
  return { text: joinTokens(tokens), tokens }
}

/** Display text of tokens, honouring SpaceBefore (upstream BuildTaskTitleTokens :466-472). */
export function joinTokens(tokens: readonly TitleToken[]): string {
  let out = ''
  for (const t of tokens) out += (out !== '' && t.space ? ' ' : '') + t.text
  return out
}

const methodName = (domain: DomainIR, id: number) => domain.methods[id]?.name ?? '?'

/** "(:method (name ?p ...) ...)" (BuildDeclarationTitle). */
export function methodTitle(m: MethodIR): string {
  return `(:method (${[m.name, ...m.params].join(' ')}) ...)`
}

export function axiomTitle(a: AxiomIR): string {
  return `(:axiom (${[a.name, ...a.params.map(p => p.name)].join(' ')}) ...)`
}

export function branchTitle(name: string): string {
  return `(${name} ...)`
}

export function planTitle(m: MethodIR): string {
  return `(${m.name})`
}
