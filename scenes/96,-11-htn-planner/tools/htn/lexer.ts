// Lexer for .domain and .worldstate text. Port of upstream HTNCompilerDomainLexer.cpp,
// HTNWorldStateLexer.cpp and Parser/HTNLexerBase.cpp (same sign/number/string rules).
import type { Pos } from './diagnostics'

export type TokenType =
  | 'COLON' | 'LPAREN' | 'RPAREN' | 'BANG' | 'QUESTION' | 'HASH' | 'AMP' | 'AT'
  | 'ASSIGN' | 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE'
  | 'PLUS' | 'MINUS' | 'INC' | 'DEC' | 'MUL' | 'DIV' | 'MOD'
  | 'DOMAIN' | 'TOP_LEVEL_DOMAIN' | 'BASE' | 'OVERRIDES' | 'METHOD' | 'TOP_LEVEL_METHOD' | 'AXIOM' | 'CONSTANTS'
  | 'AND' | 'OR' | 'ALT' | 'NOT' | 'CALL'
  | 'IDENT' | 'NUMBER' | 'STRING' | 'EOF'

export interface Token {
  type: TokenType
  begin: Pos
  end: Pos // exclusive
  /** IDENT/keyword lexeme, STRING contents (no quotes), NUMBER spelling (with sign). */
  text: string
  /** NUMBER only. */
  num?: { isFloat: boolean; value: number }
}

export interface LexError {
  code: 'unrecognized-character' | 'invalid-negative-literal' | 'number-out-of-bounds' | 'unterminated-string'
  message: string
  pos: Pos
  end: Pos // exclusive, as upstream's error ranges (HTNLexerBase.cpp, HTNCompilerDomainLexer.cpp:189-196)
}

export const NEGATIVE_LITERAL_DIAGNOSTIC =
  'Expected a negative literal with an adjacent digit (for example -1 or -0.5); ' +
  'use (- value) for negation, (- left right) for subtraction or (-- value) for decrement'

export const DOMAIN_KEYWORDS: Record<string, TokenType> = {
  domain: 'DOMAIN',
  top_level_domain: 'TOP_LEVEL_DOMAIN',
  base: 'BASE',
  overrides: 'OVERRIDES',
  method: 'METHOD',
  top_level_method: 'TOP_LEVEL_METHOD',
  axiom: 'AXIOM',
  constants: 'CONSTANTS',
  and: 'AND',
  or: 'OR',
  alt: 'ALT',
  not: 'NOT',
  call: 'CALL'
}
const WORLDSTATE_KEYWORDS: Record<string, TokenType> = { call: 'CALL' }

const INT_MIN = -2147483648
const INT_MAX = 2147483647

// HTNLexerHelpers::IsLetter is `a-z || A-Z || c >= '_'` on a signed char: every ASCII code
// from '_' (95) up to 127 counts as a letter; UTF-8 bytes (negative chars) do not.
export function isLetter(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 95 && c <= 127)
}
export function isDigit(c: number): boolean {
  return c >= 48 && c <= 57
}
function isAlnum(c: number): boolean {
  return isLetter(c) || isDigit(c)
}

/** Parse a numeric spelling the way std::from_chars does for int32/float. Null when out of range. */
export function parseNumber(text: string, isFloat: boolean): number | null {
  if (!isFloat) {
    const n = Number(text)
    if (!Number.isFinite(n) || n < INT_MIN || n > INT_MAX) return null
    return n | 0 // also maps -0 to 0
  }
  const n = Number(text)
  const f = Math.fround(n)
  if (!Number.isFinite(f)) return null
  if (f === 0 && n !== 0) return null // underflow: from_chars reports result_out_of_range
  return f
}

export function lex(text: string, mode: 'domain' | 'worldstate' = 'domain'): { tokens: Token[]; error?: LexError } {
  const tokens: Token[] = []
  let error: LexError | undefined
  let pos = 0
  let line = 1
  let col = 1
  let start: Pos = { line, col, offset: 0 }

  const ch = (ahead = 0): number => {
    const i = pos + ahead
    return i < text.length ? text.charCodeAt(i) : 0
  }
  const here = (): Pos => ({ line, col, offset: pos })
  const nextChar = (): Pos => ({ line, col: col + 1, offset: pos + 1 })
  const advance = (newline = false) => {
    if (pos >= text.length) return
    pos++
    if (newline) {
      line++
      col = 1
    } else col++
  }
  const add = (type: TokenType, tokenText = '', num?: Token['num']) => {
    let end = here()
    if (end.offset <= start.offset) end = { line: start.line, col: start.col + 1, offset: start.offset + 1 }
    if (type === 'EOF') end = start
    tokens.push(num ? { type, begin: start, end, text: tokenText, num } : { type, begin: start, end, text: tokenText })
  }
  // Upstream keeps only the last lexer error; we keep the first, which is the one a user fixes first.
  const fail = (e: LexError) => {
    if (!error) error = e
  }

  const lexNumber = () => {
    const begin = here()
    advance()
    while (isDigit(ch())) advance()
    const isFloat = ch() === 46 && isDigit(ch(1))
    if (isFloat) {
      advance()
      while (isDigit(ch())) advance()
    }
    const lexeme = text.slice(begin.offset, pos)
    const value = parseNumber(lexeme, isFloat)
    if (value === null) {
      fail({ code: 'number-out-of-bounds', message: 'Number out of bounds', pos: begin, end: here() })
      return
    }
    add('NUMBER', lexeme, { isFloat, value })
  }

  const lexMinus = () => {
    const next = ch(1)
    if (isDigit(next)) return lexNumber()
    const isDecrement = next === 45
    const suffix = ch(isDecrement ? 2 : 1)
    if (isAlnum(suffix) || suffix === 46 || suffix === 45) {
      const begin = here()
      for (let c = ch(); isAlnum(c) || c === 46 || c === 45; c = ch()) advance()
      fail({
        code: 'invalid-negative-literal',
        message: `Invalid negative literal '${text.slice(begin.offset, pos)}'. ${NEGATIVE_LITERAL_DIAGNOSTIC}`,
        pos: begin,
        end: here()
      })
      return
    }
    advance()
    if (isDecrement) advance()
    add(isDecrement ? 'DEC' : 'MINUS', isDecrement ? '--' : '-')
  }

  const lexString = () => {
    const begin = pos
    advance()
    for (let c = ch(); c !== 34 && pos < text.length; c = ch()) advance(c === 10)
    if (ch() !== 34) {
      fail({ code: 'unterminated-string', message: `Character '"' could not be found at end of the string`, pos: here(), end: here() })
      return
    }
    const contents = text.slice(begin + 1, pos)
    advance()
    add('STRING', contents)
  }

  const lexComment = () => {
    for (let c = ch(); c !== 10 && pos < text.length; c = ch()) advance()
    if (ch() === 10) advance(true)
  }

  const lexIdentifier = (keywords: Record<string, TokenType>) => {
    const begin = pos
    advance()
    while (isAlnum(ch())) advance()
    const lexeme = text.slice(begin, pos)
    add(Object.prototype.hasOwnProperty.call(keywords, lexeme) ? keywords[lexeme] : 'IDENT', lexeme)
  }

  const unrecognized = (c: number) => {
    const shown = c === 9 ? '\\t' : c === 10 ? '\\n' : String.fromCharCode(c)
    fail({ code: 'unrecognized-character', message: `Character [${shown}] not recognized`, pos: here(), end: nextChar() })
    advance()
  }

  const single = (type: TokenType, t: string) => {
    add(type, t)
    advance()
  }
  const pair = (second: number, two: TokenType, one: TokenType, t: string) => {
    const has = ch(1) === second
    advance()
    if (has) advance()
    add(has ? two : one, has ? t + String.fromCharCode(second) : t)
  }

  // The upstream loop stops at a NUL character as well as at the end of the text.
  for (let c = ch(); c !== 0; c = ch()) {
    start = here()
    if (mode === 'worldstate') {
      switch (c) {
        case 40: single('LPAREN', '('); continue
        case 41: single('RPAREN', ')'); continue
        case 47:
          if (ch(1) === 47) lexComment()
          else {
            fail({ code: 'unrecognized-character', message: `Expected '/' after [/] for a comment`, pos: here(), end: nextChar() })
            advance()
          }
          continue
        case 34: lexString(); continue
        case 45: lexMinus(); continue
        case 13:
        case 32: advance(); continue
        case 10: advance(true); continue
      }
      if (isDigit(c)) lexNumber()
      else if (isLetter(c)) lexIdentifier(WORLDSTATE_KEYWORDS)
      else unrecognized(c)
      continue
    }
    switch (c) {
      case 58: single('COLON', ':'); continue
      case 40: single('LPAREN', '('); continue
      case 41: single('RPAREN', ')'); continue
      case 33: pair(61, 'NE', 'BANG', '!'); continue
      case 61: pair(61, 'EQ', 'ASSIGN', '='); continue
      case 60: pair(61, 'LE', 'LT', '<'); continue
      case 62: pair(61, 'GE', 'GT', '>'); continue
      case 43: pair(43, 'INC', 'PLUS', '+'); continue
      case 45: lexMinus(); continue
      case 42: single('MUL', '*'); continue
      case 37: single('MOD', '%'); continue
      case 63: single('QUESTION', '?'); continue
      case 35: single('HASH', '#'); continue
      case 38: single('AMP', '&'); continue
      case 64: single('AT', '@'); continue
      case 47:
        if (ch(1) === 47) lexComment()
        else single('DIV', '/')
        continue
      case 34: lexString(); continue
      case 13:
      case 32:
      case 9: advance(); continue
      case 10: advance(true); continue
    }
    if (isDigit(c)) lexNumber()
    else if (isLetter(c)) lexIdentifier(DOMAIN_KEYWORDS)
    else unrecognized(c)
  }
  start = here()
  add('EOF')
  return error ? { tokens, error } : { tokens }
}
