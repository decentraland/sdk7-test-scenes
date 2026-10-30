// .worldstate reader. Port of upstream WorldState/Parser/HTNWorldStateLexer.cpp and
// HTNWorldStateParser.cpp: one fact per line, `name arg...`; args are numbers, "strings",
// bare identifiers (symbols) and non-empty parenthesized lists (which may span lines).
import { float, int, list, str, sym } from '../../src/htn-planner/htn/atom'
import type { Atom } from '../../src/htn-planner/htn/atom'
import type { WorldState } from '../../src/htn-planner/htn/world-state'
import { lex } from './lexer'
import type { Token } from './lexer'

export class WorldStateParseError extends Error {
  constructor(message: string, readonly line: number, readonly col: number) {
    super(`${line}:${col}: ${message}`)
  }
}

export function parseWorldStateText(source: string, into: WorldState): void {
  const { tokens, error } = lex(source, 'worldstate')
  if (error) throw new WorldStateParseError(error.message, error.pos.line, error.pos.col)
  let position = 0

  const argument = (): Atom | null => {
    const start = position
    const token: Token = tokens[position]
    if (token.type === 'LPAREN') {
      position++
      const items: Atom[] = []
      for (let item = argument(); item; item = argument()) items.push(item)
      if (items.length === 0 || tokens[position].type !== 'RPAREN') {
        position = start
        return null
      }
      position++
      return list(...items)
    }
    if (token.type === 'NUMBER') {
      position++
      return token.num!.isFloat ? float(token.num!.value) : int(token.num!.value)
    }
    if (token.type === 'STRING') {
      position++
      return str(token.text)
    }
    if (token.type === 'IDENT') {
      position++
      return sym(token.text)
    }
    return null
  }

  while (tokens[position].type !== 'EOF') {
    const head = tokens[position]
    if (head.type !== 'IDENT')
      throw new WorldStateParseError(`Expected a fact name, found '${head.text || head.type}'`, head.begin.line, head.begin.col)
    position++
    const args: Atom[] = []
    // Facts are line-delimited: an argument must start on the fact's line.
    while (tokens[position].type !== 'EOF' && tokens[position].begin.line === head.begin.line) {
      const arg = argument()
      if (!arg) break
      args.push(arg)
    }
    into.add(head.text, ...args)
  }
}
