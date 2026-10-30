// Include handling and module loading. Port of upstream Domain/Source/HTNDomainFileSyntax.cpp
// (HTNSplitDomainFile) and Translator/HTNCompilerDomainLoader.cpp (CompilerLoaderContext::Visit).
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import type { Domain } from './ast'
import { positionOf, rangeBetween, rangeOf, reportDiagnostic } from './diagnostics'
import type { Diagnostic, DiagnosticRecovery, Pos } from './diagnostics'
import { parseDomain } from './parser'

export interface DomainInclude {
  path: string
  begin: Pos // start of the `(:include` directive
  end: Pos // just after its `)`
}

export interface SplitResult {
  includes: DomainInclude[]
  domainText: string // include directives replaced by spaces (newlines kept), so positions are unchanged
  error?: { code: string; message: string; pos: Pos; end: Pos }
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\v' || c === '\f'

function skipTrivia(text: string, i: number): number {
  while (i < text.length) {
    if (isSpace(text[i])) i++
    else if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i)
      i = end < 0 ? text.length : end + 1
    } else break
  }
  return i
}

/** Returns the position after `(:include`, or -1. */
function readIncludePrefix(text: string, i: number): number {
  if (i >= text.length || text[i++] !== '(') return -1
  i = skipTrivia(text, i)
  if (i >= text.length || text[i++] !== ':') return -1
  i = skipTrivia(text, i)
  if (!text.startsWith('include', i)) return -1
  i += 7
  if (i < text.length && /[A-Za-z0-9_]/.test(text[i])) return -1
  return i
}

export function splitDomainFile(text: string): SplitResult {
  const includes: DomainInclude[] = []
  const chars = text.split('')
  // Ranges as upstream HTNSplitDomainFile (HTNDomainFileSyntax.cpp:49-99).
  const fail = (code: string, message: string, offset: number, endOffset: number): SplitResult => ({
    includes: [],
    domainText: text,
    error: { code, message, pos: positionOf(text, offset), end: positionOf(text, endOffset) }
  })
  const oneChar = (offset: number) => Math.min(offset + 1, text.length)
  let cursor = 0
  for (;;) {
    cursor = skipTrivia(text, cursor)
    let position = readIncludePrefix(text, cursor)
    if (position < 0) break
    position = skipTrivia(text, position)
    if (position >= text.length || text[position] !== '"')
      return fail('expected-include-path', 'Expected quoted path after :include', position, oneChar(position))
    const quote = position++
    const end = text.indexOf('"', position)
    if (end < 0) return fail('unterminated-include-path', 'Unterminated :include path', quote, text.length)
    const path = text.slice(position, end)
    if (path.length === 0) return fail('expected-include-path', 'Expected non-empty :include path', quote, end + 1)
    position = skipTrivia(text, end + 1)
    if (position >= text.length || text[position] !== ')')
      return fail('expected-include-end', "Expected ')' after :include path", position, oneChar(position))
    position++
    includes.push({ path, begin: positionOf(text, cursor), end: positionOf(text, position) })
    for (let i = cursor; i < position; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' '
    cursor = position
  }
  if (cursor === text.length) return fail('expected-domain', 'Missing :domain form', cursor, cursor)

  // Ignore quoted text and comments when checking for misplaced directives.
  while (cursor < text.length) {
    cursor = skipTrivia(text, cursor)
    if (cursor === text.length) break
    if (text[cursor] === '"') {
      const end = text.indexOf('"', cursor + 1)
      if (end < 0) break // the lexer diagnoses an unclosed string
      cursor = end + 1
      continue
    }
    const prefixEnd = readIncludePrefix(text, cursor)
    if (prefixEnd >= 0) return fail('misplaced-include', ':include directives are only allowed before :domain', cursor, prefixEnd)
    cursor++
  }
  return { includes, domainText: chars.join('') }
}

export interface LoadedModules {
  /** Post-order: includes before includers, root last. Index = Loc.file. */
  modules: Domain[]
  files: string[] // display path per module, '/' separators
  diagnostics: Diagnostic[]
  ok: boolean // false after a fatal error: nothing to validate
}

const slashes = (p: string) => p.replace(/\\/g, '/')

function canonicalKey(path: string): string {
  let resolved = nodePath.resolve(path)
  try {
    resolved = fs.realpathSync.native(resolved)
  } catch {
    // Missing or in-memory file: fall back to the normalized absolute path.
  }
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function loadModules(rootPath: string, rootSource: string, readFile: (path: string) => string): LoadedModules {
  const result: LoadedModules = { modules: [], files: [], diagnostics: [], ok: true }
  const visited = new Set<string>()
  const stack: string[] = []
  const displayStack: string[] = []
  // Recovery as upstream HTNCompilerDomainLoader.cpp: include, file and syntax errors are fatal (:71-106), a dropped
  // declaration recoverable (HTNCompilerDomainSyntaxParser.cpp:695), an included top_level_domain recoverable (:112).
  type Range = ReturnType<typeof rangeOf>
  const error = (file: string, code: string, message: string, recovery: DiagnosticRecovery, range: Range) =>
    reportDiagnostic(result.diagnostics, { severity: 'error', recovery, code, message, file, ...range })

  const visit = (path: string, isRoot: boolean, includingFile?: string, include?: DomainInclude): boolean => {
    const at = include ? rangeBetween(include.begin, include.end) : rangeBetween(positionOf('', 0))
    const key = canonicalKey(path)
    const display = slashes(path)
    if (visited.has(key)) return true
    const cycleStart = stack.indexOf(key)
    if (cycleStart >= 0) {
      const chain = [...displayStack.slice(cycleStart), display].join(' -> ')
      error(includingFile ?? display, 'include-cycle', `Circular domain dependency: ${chain}`, 'fatal', at)
      return false
    }
    let text: string
    if (isRoot) text = rootSource
    else {
      try {
        text = readFile(path)
      } catch {
        error(includingFile ?? display, 'include-not-found', `Could not read included domain '${display}'`, 'fatal', at)
        return false
      }
    }
    const split = splitDomainFile(text)
    if (split.error) {
      error(display, split.error.code, split.error.message, 'fatal', rangeBetween(split.error.pos, split.error.end))
      return false
    }
    // The file index is assigned when the module is appended (post-order); parse with a placeholder.
    const parsed = parseDomain(split.domainText, -1)
    let fatal = false
    for (const e of parsed.errors) {
      error(display, e.code, e.message, e.fatal ? 'fatal' : 'recoverable', rangeBetween(e.pos, e.end))
      fatal = fatal || e.fatal
    }
    if (fatal || !parsed.domain) return false
    const domain = parsed.domain
    if (!isRoot && domain.isTopLevel) {
      error(display, 'included-top-level-domain', `Included domain '${display}' cannot be top_level_domain`, 'recoverable', rangeOf(domain.loc))
      return false
    }
    stack.push(key)
    displayStack.push(display)
    for (const include of split.includes) {
      const child = nodePath.isAbsolute(include.path) ? include.path : nodePath.join(nodePath.dirname(path), include.path)
      if (!visit(child, false, display, include)) return false
    }
    stack.pop()
    displayStack.pop()
    const index = result.modules.length
    setFileIndex(domain, index)
    result.modules.push(domain)
    result.files.push(display)
    visited.add(key)
    return true
  }

  result.ok = visit(rootPath, true)
  return result
}

// Every Loc in the module's AST shares one file index; patch it in place.
function setFileIndex(domain: Domain, file: number): void {
  domain.file = file
  const seen = new Set<object>()
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const record = node as Record<string, unknown>
    if (typeof record.file === 'number' && typeof record.line === 'number') record.file = file
    for (const key of Object.keys(record)) if (key !== 'atom' && key !== 'failedNames') walk(record[key])
  }
  walk(domain)
}
