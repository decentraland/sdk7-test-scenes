// The session viewer's labels: names and values, never code. A trace title is an s-expression in the domain's own
// syntax (`(health ?inp_npc ?hp)`, htn/titles.ts); a label reads it with the node's bindings substituted, as a
// figure in a paper would: `health(1, 15)`, `15 ≤ 20`, `move_to((-8, 0, -6.6), hurry)`. Pure; never throws: text
// that does not parse is shown as it is.
import type { Atom } from '../../../src/htn-planner/htn/atom'
import type { Binding } from '../../../src/htn-planner/htn/trace'

/** A value as a label shows it: numbers short (two decimals at most), names and strings bare, lists with commas. */
export function valueText(a: Atom): string {
  switch (a.t) {
    case 'int':
      return String(a.v)
    case 'float':
      return String(Math.round(a.v * 100) / 100)
    case 'bool':
      return a.v ? 'true' : 'false'
    case 'sym':
    case 'str':
      return a.v
    case 'list':
      return `(${a.v.map(valueText).join(', ')})`
  }
}

/** `name = value, ...` */
export function bindingsText(bindings: readonly Binding[]): string {
  return bindings.map(b => `${b.name} = ${valueText(b.value)}`).join(', ')
}

type SNode = { atom: string } | { list: SNode[] }

/** Tokens of an s-expression: parentheses, quoted strings, words. */
function tokens(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; ) {
    const c = text[i]
    if (c === ' ' || c === '\t' || c === '\n') {
      i++
    } else if (c === '(' || c === ')') {
      out.push(c)
      i++
    } else if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out.push(text.slice(i, Math.min(j + 1, text.length)))
      i = j + 1
    } else {
      let j = i
      while (j < text.length && !' \t\n()"'.includes(text[j])) j++
      out.push(text.slice(i, j))
      i = j
    }
  }
  return out
}

/** Parse one s-expression; an unclosed list closes at the end; null when it does not start like one. */
function parse(text: string): SNode | null {
  const toks = tokens(text)
  if (toks.length === 0 || toks[0] === ')') return null
  let i = 0
  const node = (): SNode => {
    const t = toks[i++]
    if (t !== '(') return { atom: t }
    const items: SNode[] = []
    while (i < toks.length && toks[i] !== ')') items.push(node())
    i++ // the ')' (or past the end)
    return { list: items }
  }
  return node()
}

const CMP: Record<string, string> = { '<': '<', '<=': '≤', '>': '>', '>=': '≥', '==': '=', '!=': '≠' }
const ARITH = new Set(['+', '-', '*', '/', '%'])

/** A head without its sigil: `!move_to` and `&go` and `#axiom` read `move_to`, `go`, `axiom`. */
export function bareName(head: string): string {
  return head.replace(/^[!&#]/, '')
}

/** The head of a title: `(!move_to ?p)` -> `move_to`; '' when there is none. */
export function headName(title: string): string {
  const n = parse(title)
  if (!n || !('list' in n) || n.list.length === 0) return ''
  const h = n.list[0]
  return 'atom' in h ? bareName(h.atom) : ''
}

export type Lookup = (name: string) => Atom | undefined

class Printer {
  constructor(
    readonly lookup: Lookup,
    readonly constants: ReadonlyMap<string, string>
  ) {}

  atom(a: string): string {
    // `?any_x` is the language's discard (tools/htn/linker.ts): it matches anything and binds nothing.
    if (a === '?any' || a.startsWith('?any_')) return '_'
    if (a.startsWith('?')) {
      const v = this.lookup(a.slice(1))
      return v === undefined ? a : valueText(v)
    }
    if (a.startsWith('@')) return this.constants.get(a) ?? a.slice(1)
    if (a.startsWith('"')) return a.replace(/^"|"$/g, '')
    if (/^-?\d+\.\d+$/.test(a)) return String(Math.round(Number(a) * 100) / 100)
    return a
  }

  /** A nested expression: operators infix (bracketed), calls as functions, other lists as values. */
  expr(n: SNode, nested: boolean): string {
    if ('atom' in n) return this.atom(n.atom)
    const items = n.list
    if (items.length === 0) return '()'
    const head = 'atom' in items[0] ? items[0].atom : ''
    const args = items.slice(1)
    if (head in CMP && args.length === 2) return `${this.expr(args[0], true)} ${CMP[head]} ${this.expr(args[1], true)}`
    if (ARITH.has(head) && args.length === 2) {
      const s = `${this.expr(args[0], true)} ${head} ${this.expr(args[1], true)}`
      return nested ? `(${s})` : s
    }
    if (head === 'call' && args.length > 0 && 'atom' in args[0]) return this.call(args[0].atom, args.slice(1))
    if (/^[+*/%-]+$/.test(head) || head.startsWith('++') || head.startsWith('--')) return this.call(head, args)
    return `(${items.map(i => this.expr(i, true)).join(', ')})`
  }

  call(name: string, args: SNode[]): string {
    return args.length === 0 ? bareName(name) : `${bareName(name)}(${args.map(a => this.expr(a, false)).join(', ')})`
  }

  /** The top level: a predicate or task `name(args)`, a comparison, an assignment `x := expr = value`. */
  top(n: SNode): string {
    if ('atom' in n) return this.atom(n.atom)
    const items = n.list
    if (items.length === 0) return '()'
    if (!('atom' in items[0])) return this.expr(n, false)
    const head = items[0].atom
    const args = items.slice(1)
    if (head === '=' && args.length === 2 && 'atom' in args[0] && args[0].atom.startsWith('?')) {
      const target = args[0].atom.slice(1)
      const v = this.lookup(target)
      const rhs = this.expr(args[1], false)
      return `${target} := ${rhs}${v !== undefined && valueText(v) !== rhs ? ` = ${valueText(v)}` : ''}`
    }
    if (head in CMP || ARITH.has(head) || head === 'call') return this.expr(n, false)
    return this.call(head, args)
  }
}

/**
 * A trace title with values: `lookup` gives a variable's value by name (without '?'), `constants` a constant's
 * (`@name` -> text, TitleToken.value). Text that does not parse comes back as it is.
 */
export function literalLabel(title: string, lookup: Lookup, constants: ReadonlyMap<string, string> = new Map()): string {
  const n = parse(title)
  if (n === null) return title
  return new Printer(lookup, constants).top(n)
}

/** A plan step as the planner evaluated it: `announce_state(combat, 1)`. */
export function stepLabel(name: string, args: readonly Atom[]): string {
  return args.length === 0 ? bareName(name) : `${bareName(name)}(${args.map(valueText).join(', ')})`
}

/** A step as the agents log it (`!move_to (-8.0 0.0 -6.6) hurry`, formatTask) read as a label: `move_to((-8, 0, -6.6), hurry)`. */
export function stepText(formatted: string): string {
  return formatted.trim() === '' ? formatted : literalLabel(`(${formatted})`, () => undefined)
}
