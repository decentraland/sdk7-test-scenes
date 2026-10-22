// tools/vscode-htn: the TextMate grammar covers the dialect of tools/htn/lexer.ts, the language configuration uses
// its comment syntax, and the `$htn-check` problem matcher reads the compiler's diagnostics.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { DOMAIN_KEYWORDS } from '../../tools/htn/lexer'
import { formatDiagnostic } from '../../tools/htn/compiler'
import { compile } from '../htn/compiler/helpers'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
const DIR = nodePath.join(ROOT, 'tools', 'vscode-htn')
const json = (file: string) => JSON.parse(fs.readFileSync(nodePath.join(DIR, file), 'utf8'))

interface Rule {
  include?: string
  name?: string
  match?: string
  begin?: string
  end?: string
  captures?: Record<string, { name: string }>
  patterns?: Rule[]
}
const grammar = json('syntaxes/htn.tmLanguage.json') as { scopeName: string; patterns: Rule[]; repository: Record<string, Rule> }

/** The grammar's top-level rules, includes resolved, in order. */
function rules(list: Rule[] = grammar.patterns): Rule[] {
  return list.flatMap(r => (r.include ? rules(grammar.repository[r.include.slice(1)].patterns ?? []) : r.patterns ? rules(r.patterns) : [r]))
}

/**
 * A single-line TextMate scan (enough for this flat grammar): at each position the earliest match wins, the first
 * rule on a tie. Returns [text, scope] for every scoped piece (captures split a match).
 */
function tokenize(line: string): [string, string][] {
  const out: [string, string][] = []
  const all = rules()
  for (let at = 0; at < line.length; ) {
    let best: { index: number; m: RegExpExecArray; rule: Rule } | undefined
    for (const rule of all) {
      const re = new RegExp(rule.match ?? rule.begin!, 'g')
      re.lastIndex = at
      const m = re.exec(line)
      if (m && m[0].length > 0 && (!best || m.index < best.index)) best = { index: m.index, m, rule }
    }
    if (!best) break
    const { m, rule } = best
    let end = m.index + m[0].length
    if (rule.begin) {
      const close = new RegExp(rule.end!, 'g')
      close.lastIndex = end
      const e = close.exec(line)
      end = e ? e.index + e[0].length : line.length
      out.push([line.slice(m.index, end), rule.name!])
    } else if (rule.captures) {
      for (const [group, { name }] of Object.entries(rule.captures)) if (m[Number(group)]) out.push([m[Number(group)], name])
    } else out.push([m[0], rule.name!])
    at = end
  }
  return out
}
const scopeOf = (line: string, text: string) => tokenize(line).find(([t]) => t === text)?.[1]

test('every lexer keyword is highlighted as a keyword or modifier', () => {
  const declarations = new Set(['domain', 'method', 'axiom', 'constants'])
  for (const keyword of Object.keys(DOMAIN_KEYWORDS)) {
    const text = declarations.has(keyword) ? `:${keyword}` : keyword
    const scope = scopeOf(`(${text} x)`, text)
    assert.match(scope ?? 'none', /^(keyword|storage\.modifier)\./, `${text}: ${scope}`)
  }
  assert.equal(scopeOf('(:include "a.domain")', ':include'), 'keyword.other.declaration.htn')
})

test('a domain line: names, variables, discards, constants, task prefixes, numbers, strings, comments', () => {
  const line = '(:method (run ?inp_e) top_level_method (go (and (pos ?inp_e ?any_cell) (!= ?p -1.5) (#near ?p) ' +
    '(call wide ?p)) ((!move ?p @speed "fast") (&later) (Root::step 2)))) // done'
  const scopes = new Map(tokenize(line))
  const expect: [string, string][] = [
    [':method', 'keyword.other.declaration.htn'],
    ['run', 'entity.name.function.htn'],
    ['?inp_e', 'variable.other.htn'],
    ['top_level_method', 'storage.modifier.htn'],
    ['and', 'keyword.control.htn'],
    ['?any_cell', 'variable.language.discard.htn'],
    ['!=', 'keyword.operator.htn'],
    ['-1.5', 'constant.numeric.htn'],
    ['#near', 'entity.name.function.axiom.htn'],
    ['call', 'keyword.control.htn'],
    ['wide', 'support.function.callterm.htn'],
    ['!move', 'entity.name.function.primitive.htn'],
    ['@speed', 'constant.other.htn'],
    ['"fast"', 'string.quoted.double.htn'],
    ['&later', 'entity.name.function.deferred.htn'],
    ['Root', 'entity.name.namespace.htn'],
    ['::', 'punctuation.separator.namespace.htn'],
    ['2', 'constant.numeric.htn'],
    ['// done', 'comment.line.double-slash.htn']
  ]
  for (const [text, scope] of expect) assert.equal(scopes.get(text), scope, `${text} in ${JSON.stringify(tokenize(line))}`)
  assert.equal(scopeOf('(:domain Guard top_level_domain', 'Guard'), 'entity.name.type.domain.htn')
  assert.equal(scopeOf('(:axiom (near ?inp_p)', 'near'), 'entity.name.function.htn')
  assert.equal(scopeOf('"a // b" x', '"a // b"'), 'string.quoted.double.htn', 'no comment inside a string')
})

test('manifest: language, grammar and configuration files exist; // is the line comment', () => {
  const pkg = json('package.json')
  const [language] = pkg.contributes.languages
  assert.deepEqual(language.extensions, ['.domain'])
  assert.equal(pkg.contributes.grammars[0].scopeName, grammar.scopeName)
  assert.ok(fs.existsSync(nodePath.join(DIR, pkg.contributes.grammars[0].path)))
  assert.equal(json(language.configuration).comments.lineComment, '//')
  assert.ok(fs.existsSync(nodePath.join(DIR, 'LICENSE')), 'upstream MIT license next to the adapted grammar')
})

test('the $htn-check problem matcher reads a compiler diagnostic with its range', () => {
  const source = '(:domain Root top_level_domain\n  (:method (run) top_level_method (ready () ((!act ?missing))))))'
  const r = compile(source)
  assert.equal(r.ok, false)
  const d = r.diagnostics[0]
  const { pattern } = json('package.json').contributes.problemMatchers[0]
  for (const file of ['Root.domain', 'C:/scenes/96,-11-x/src/npc/Root.domain']) {
    const m = new RegExp(pattern.regexp).exec(formatDiagnostic({ ...d, file }))
    assert.ok(m, formatDiagnostic(d))
    assert.deepEqual(
      [m[pattern.file], m[pattern.line], m[pattern.column], m[pattern.endLine], m[pattern.endColumn], m[pattern.severity], m[pattern.code], m[pattern.message]],
      [file, String(d.line), String(d.col), String(d.endLine), String(d.endCol), d.severity, d.code, d.message]
    )
  }
})
