// Test-only helper: turns a single-file upstream `.domain` text into a DomainIR literal, and a
// `.worldstate` text into a WorldState, so planner tests can reuse upstream fixtures verbatim.
// Deliberately minimal and independent of the real compiler in tools/htn (written in parallel):
// no includes or overrides (a `Domain::name` qualifier is simply dropped), no validation. It shares
// one pass with the compiler: markDeterministicFacts, the one-solution fact analysis.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { float, int, list, str, sym, type Atom } from '../../../src/htn-planner/htn/atom'
import type { CondIR, DomainIR, ExprIR, MethodIR, ParamMode, TaskIR, TermIR } from '../../../src/htn-planner/htn/ir'
import { WorldState } from '../../../src/htn-planner/htn/world-state'
import { markDeterministicFacts } from '../../../tools/htn/linker'

type Node = string | { s: string } | Node[]

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()

export function fixture(rel: string): string {
  return readFileSync(join(ROOT, 'test/htn/fixtures/upstream', rel), 'utf8')
}

function read(text: string): Node[] {
  const tokens: Node[] = []
  const stack: Node[][] = [tokens]
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '(') {
      const l: Node[] = []
      stack[stack.length - 1].push(l)
      stack.push(l)
      i++
    } else if (c === ')') {
      stack.pop()
      i++
    } else if (c === '"') {
      const end = text.indexOf('"', i + 1)
      stack[stack.length - 1].push({ s: text.slice(i + 1, end) })
      i = end + 1
    } else if (/\s/.test(c)) {
      i++
    } else {
      let j = i
      while (j < text.length && !/[\s()"]/.test(text[j])) j++
      stack[stack.length - 1].push(text.slice(i, j))
      i = j
    }
  }
  return tokens
}

function scalar(tok: string | { s: string }): Atom {
  if (typeof tok !== 'string') return str(tok.s)
  if (/^-?\d+$/.test(tok)) return int(Number(tok))
  if (/^-?\d+\.\d*$/.test(tok)) return float(Number(tok))
  return sym(tok)
}

function literal(n: Node): Atom {
  return Array.isArray(n) ? list(...n.map(literal)) : scalar(n)
}

const ARITH = new Set(['+', '-', '*', '/', '%', '++', '--'])
const CMP = new Set(['==', '!=', '<', '<=', '>', '>='])

class Scope {
  vars: string[]
  constructor(params: string[]) {
    this.vars = [...params]
  }
  slot(name: string): number {
    let i = this.vars.indexOf(name)
    if (i < 0) i = this.vars.push(name) - 1
    return i
  }
}

interface Sig { name: string; arity: number; id: number }

export function parseDomain(text: string): DomainIR {
  const forms = read(text)
  const domain = forms.find(f => Array.isArray(f) && f[0] === ':domain') as Node[] | undefined
  if (!domain) throw new Error('no (:domain ...) form')
  if (forms.some(f => Array.isArray(f) && f[0] === ':include')) throw new Error('includes are not supported here')
  const domainName = domain[1] as string
  const constants = new Map<string, Atom>()
  const methodForms: Node[][] = []
  const axiomForms: Node[][] = []
  for (const item of domain.slice(2)) {
    if (!Array.isArray(item)) continue
    if (item[0] === ':constants') {
      for (const c of item.slice(1)) if (Array.isArray(c)) constants.set(c[0] as string, literal(c[1]))
    } else if (item[0] === ':method') methodForms.push(item)
    else if (item[0] === ':axiom') axiomForms.push(item)
  }
  const methodSigs: Sig[] = methodForms.map((f, id) => ({ name: (f[1] as Node[])[0] as string, arity: (f[1] as Node[]).length - 1, id }))
  const axiomSigs: Sig[] = axiomForms.map((f, id) => ({ name: (f[1] as Node[])[0] as string, arity: (f[1] as Node[]).length - 1, id }))
  const facts = new Set<string>()
  const callterms = new Set<string>()

  const unqualify = (name: string) => (name.includes('::') ? name.slice(name.indexOf('::') + 2) : name)
  const resolve = (sigs: Sig[], name: string, arity: number, what: string) => {
    const s = sigs.find(x => x.name === unqualify(name) && x.arity === arity)
    if (!s) throw new Error(`unknown ${what} ${name}/${arity}`)
    return s.id
  }

  const expr = (n: Node, sc: Scope): ExprIR => {
    if (typeof n === 'string') {
      if (n.startsWith('?')) return { k: 'var', slot: sc.slot(n) }
      if (n.startsWith('@')) {
        const v = constants.get(n.slice(1))
        if (!v) throw new Error(`unknown constant ${n}`)
        return { k: 'lit', v }
      }
      return { k: 'lit', v: scalar(n) }
    }
    if (!Array.isArray(n)) return { k: 'lit', v: scalar(n) }
    const head = n[0]
    if (typeof head === 'string' && ARITH.has(head))
      return { k: 'arith', op: head as never, args: n.slice(1).map(a => expr(a, sc)) }
    if (head === 'call') {
      callterms.add(n[1] as string)
      return { k: 'call', name: n[1] as string, args: n.slice(2).map(a => expr(a, sc)) }
    }
    const items = n.map(a => expr(a, sc))
    if (items.every(x => x.k === 'lit')) return { k: 'lit', v: list(...items.map(x => (x as { v: Atom }).v)) }
    return { k: 'list', items }
  }

  const term = (n: Node, sc: Scope): TermIR =>
    typeof n === 'string' && n.startsWith('?any_') ? { k: 'discard' } : expr(n, sc)

  const cond = (n: Node, sc: Scope): CondIR => {
    if (!Array.isArray(n) || n.length === 0) throw new Error(`bad condition ${JSON.stringify(n)}`)
    const head = n[0] as string
    const rest = n.slice(1)
    if (head === 'and' || head === 'or' || head === 'alt') return { k: head, items: rest.map(c => cond(c, sc)) }
    if (head === 'not') return { k: 'not', item: cond(rest[0], sc) }
    if (head === 'call') {
      callterms.add(rest[0] as string)
      return { k: 'call', name: rest[0] as string, args: rest.slice(1).map(a => expr(a, sc)) }
    }
    if (head === '=') {
      const e = expr(rest[1], sc) // initializer reads first, then the destination is declared
      return { k: 'assign', slot: sc.slot(rest[0] as string), expr: e }
    }
    if (CMP.has(head)) return { k: 'cmp', op: head as never, a: expr(rest[0], sc), b: expr(rest[1], sc) }
    if (head === 'split_list' || head === 'split_list_front' || head === 'split_list_back')
      return { k: 'split', from: head === 'split_list_back' ? 'back' : 'front', list: expr(rest[0], sc), a: term(rest[1], sc), b: term(rest[2], sc) }
    if (head.startsWith('#')) {
      const args = rest.map(a => term(a, sc))
      return { k: 'axiom', axiom: resolve(axiomSigs, head.slice(1), args.length, 'axiom'), args }
    }
    facts.add(`${head}/${rest.length}`)
    return { k: 'fact', name: head, args: rest.map(a => term(a, sc)) }
  }

  const task = (n: Node, sc: Scope): TaskIR => {
    const t = n as Node[]
    const head = t[0] as string
    const args = t.slice(1).map(a => expr(a, sc))
    if (head.startsWith('!')) return { k: 'prim', name: head, args }
    if (head.startsWith('&')) return { k: 'defer', method: resolve(methodSigs, head.slice(1), args.length, 'method'), args }
    return { k: 'method', method: resolve(methodSigs, head, args.length, 'method'), args }
  }

  const methods: MethodIR[] = methodForms.map((f, id) => {
    const sig = f[1] as string[]
    const params = sig.slice(1)
    const topLevel = f.includes('top_level_method')
    const branches = (f.slice(2).filter(Array.isArray) as Node[][]).map(b => {
      const sc = new Scope(params)
      const c = Array.isArray(b[1]) && b[1].length === 0 ? null : cond(b[1], sc)
      const tasks = (b[2] as Node[]).map(t => task(t, sc))
      return { name: b[0] as string, vars: sc.vars, cond: c, tasks }
    })
    return { id, name: sig[0], domain: domainName, arity: params.length, params, topLevel, branches }
  })

  const axioms = axiomForms.map((f, id) => {
    const sig = f[1] as string[]
    const params = sig.slice(1)
    const sc = new Scope(params)
    const body = f.slice(2).find(Array.isArray) as Node[] | undefined
    const c = body === undefined || body.length === 0 ? null : cond(body, sc)
    const mode = (p: string): ParamMode => (p.startsWith('?out_') ? 'out' : p.startsWith('?io_') ? 'io' : 'inp')
    return { id, name: sig[0], domain: domainName, arity: params.length, params: params.map(p => ({ name: p, mode: mode(p) })), vars: sc.vars, cond: c }
  })

  markDeterministicFacts(methods, axioms)
  const topLevel: Record<string, Record<number, number>> = {}
  for (const m of methods) if (m.topLevel) (topLevel[m.name] ??= {})[m.arity] = m.id

  return {
    version: 2,
    name: domainName,
    methods,
    axioms,
    topLevel,
    facts: [...facts].sort(),
    callterms: [...callterms].sort()
  }
}

/** `.worldstate` text: one fact per line, `name arg...`; lists in parentheses. */
export function parseWorld(text: string, world = new WorldState()): WorldState {
  for (const line of text.split(/\r?\n/)) {
    const nodes = read(line)
    if (nodes.length === 0) continue
    world.add(nodes[0] as string, ...nodes.slice(1).map(literal))
  }
  return world
}
