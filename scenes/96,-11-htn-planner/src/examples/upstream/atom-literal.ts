// Minimal parser for atom literals in conformance fixtures and the language lab (`facts`, `args`, `vars`).
// Domain value syntax: symbols, "strings", ints, floats (with a '.'), signed numbers, nested lists.
// Fixture-only extension: `#true` / `#false` for BOOL atoms, which have no domain literal syntax
// (upstream tests create them from C++). Independent of the compiler on purpose.
import { bool, float, int, list, str, sym } from '../../htn-planner/htn/atom'
import type { Atom } from '../../htn-planner/htn/atom'

const INT_RE = /^[+-]?\d+$/
const FLOAT_RE = /^[+-]?(\d+\.\d*|\.\d+)$/
const DELIMITERS = new Set(['(', ')', '"'])

/** Parse one atom literal. Throws on malformed input or trailing text. */
export function parseAtom(text: string): Atom {
  const parser = new Parser(text)
  const atom = parser.atom()
  parser.skipSpace()
  if (!parser.done()) throw parser.error('unexpected trailing text')
  return atom
}

/** Parse every literal of a list (e.g. fixture `args`). */
export function parseAtoms(texts: readonly string[]): Atom[] {
  return texts.map(parseAtom)
}

class Parser {
  private pos = 0
  constructor(private readonly text: string) {}

  done(): boolean {
    return this.pos >= this.text.length
  }

  error(message: string): Error {
    return new Error(`atom literal ${JSON.stringify(this.text)}: ${message} at ${this.pos}`)
  }

  skipSpace(): void {
    while (!this.done() && /\s/.test(this.text[this.pos])) this.pos++
  }

  atom(): Atom {
    this.skipSpace()
    if (this.done()) throw this.error('expected an atom')
    const c = this.text[this.pos]
    if (c === '(') return this.list()
    if (c === ')') throw this.error("unexpected ')'")
    if (c === '"') return this.string()
    return this.word()
  }

  private list(): Atom {
    this.pos++ // (
    const items: Atom[] = []
    for (;;) {
      this.skipSpace()
      if (this.done()) throw this.error("unclosed '('")
      if (this.text[this.pos] === ')') {
        this.pos++
        return list(...items)
      }
      items.push(this.atom())
    }
  }

  private string(): Atom {
    this.pos++ // opening quote
    let out = ''
    while (!this.done()) {
      const c = this.text[this.pos++]
      if (c === '"') return str(out)
      if (c === '\\') {
        if (this.done()) break
        const e = this.text[this.pos++]
        out += e === 'n' ? '\n' : e === 't' ? '\t' : e
      } else out += c
    }
    throw this.error('unterminated string')
  }

  private word(): Atom {
    const start = this.pos
    while (!this.done() && !/\s/.test(this.text[this.pos]) && !DELIMITERS.has(this.text[this.pos])) this.pos++
    const w = this.text.slice(start, this.pos)
    if (w === '#true') return bool(true)
    if (w === '#false') return bool(false)
    if (INT_RE.test(w)) {
      const v = Number(w)
      if (v < -2147483648 || v > 2147483647) throw this.error(`int out of 32-bit range: ${w}`)
      return int(v)
    }
    if (FLOAT_RE.test(w)) {
      const v = Number(w)
      if (!isFinite(Math.fround(v))) throw this.error(`float out of range: ${w}`)
      return float(v)
    }
    if (/^[+\-.\d]/.test(w) || w.startsWith('#') ||w.startsWith('?') || w.startsWith('@'))
      throw this.error(`not a literal: ${w}`)
    return sym(w)
  }
}
