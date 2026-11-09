// Diagnostics carry a begin and end range and a recovery kind, as upstream HTNDiagnostic
// (HTNFramework/src/Domain/Diagnostics/HTNDiagnostic.h:16-30); exact duplicates are dropped as in
// HTNDiagnosticSink::Report (HTNDiagnosticSink.cpp:12-35). Ranges: lexer errors as HTNLexerBase.cpp and
// HTNCompilerDomainLexer.cpp set them, parser errors the innermost form or token (HTNCompilerDomainSyntaxParser.cpp
// ErrorRange), include errors the directive (HTNDomainFileSyntax.cpp:49-99, HTNCompilerDomainLoader.cpp:59-122),
// semantic errors the AST node (HTNCompilerDomainValidator.cpp:33).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { compileDomainFile, formatDiagnostic } from '../../../tools/htn/compiler'
import type { Diagnostic } from '../../../tools/htn/compiler'
import { reportDiagnostic } from '../../../tools/htn/diagnostics'
import { FIXTURES, VALID_DOMAIN, compile, describe as show, locate } from './helpers'

type Range = Pick<Diagnostic, 'line' | 'col' | 'endLine' | 'endCol'>

/** The single-line range of `needle` in `text` (end exclusive), or an empty range at its start. */
function span(text: string, needle: string, empty = false): Range {
  const at = locate(text, needle)
  return { line: at.line, col: at.col, endLine: at.line, endCol: at.col + (empty ? 0 : needle.length) }
}
const range = (d: Diagnostic): Range => ({ line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol })

function first(source: string, files: Record<string, string> = {}): Diagnostic {
  const r = compile(source, files)
  assert.equal(r.ok, false, `compiled fine:\n${source}`)
  return r.diagnostics[0]
}

const valueDomain = (value: string) =>
  '(:domain Negative top_level_domain\n    (:method (run) top_level_method\n        (branch () ((!value ' + value + ')))))'

test('lexer errors: the whole bad literal, one bad character, an empty range at an unclosed string; fatal', () => {
  for (const value of ['-abc', '--1', '2147483648']) {
    const source = valueDomain(value)
    const d = first(source)
    assert.deepEqual(range(d), span(source, value), value)
    assert.equal(d.recovery, 'fatal')
  }
  const dollar = valueDomain('$')
  assert.deepEqual(range(first(dollar)), span(dollar, '$'))
  const unclosed = '(:domain Root top_level_domain "abc'
  const d = first(unclosed)
  assert.equal(d.code, 'unterminated-string')
  assert.deepEqual(range(d), { line: 1, col: unclosed.length + 1, endLine: 1, endCol: unclosed.length + 1 })
})

test('parser errors: a dropped declaration is recoverable at its innermost form; a broken file is fatal', () => {
  const constant = '(:domain Root top_level_domain\n  (:constants (speed))\n  (:method (run) top_level_method (ready () ((!act)))))'
  const d = first(constant)
  assert.equal(d.code, 'expected-constant')
  assert.equal(d.recovery, 'recoverable')
  assert.deepEqual(range(d), span(constant, '(speed)'))

  const unknown = '(:domain Root top_level_domain\n  (:unknown x)\n  (:method (run) top_level_method (ready () ((!act)))))'
  assert.deepEqual(range(first(unknown)), span(unknown, '(:unknown x)'))

  const multi = '(:domain Root top_level_domain\n  (:method (run) top_level_method\n    (ready ()\n      ((!act)) extra)))'
  const branch = first(multi)
  assert.equal(branch.code, 'expected-branch', show(compile(multi)))
  assert.deepEqual(range(branch), { line: 3, col: 5, endLine: 4, endCol: 22 })

  const open = '(:domain Root top_level_domain'
  const fatal = first(open)
  assert.equal(fatal.code, 'unclosed-list')
  assert.equal(fatal.recovery, 'fatal')
  assert.deepEqual(range(fatal), span(open, 'top_level_domain'))
})

test('include errors: the whole directive, reported in the including file; fatal', () => {
  const source = '(:include "Nope.domain")\n' + VALID_DOMAIN
  const d = first(source)
  assert.equal(d.code, 'include-not-found')
  assert.equal(d.file, 'Root.domain')
  assert.equal(d.recovery, 'fatal')
  assert.deepEqual(range(d), span(source, '(:include "Nope.domain")'))

  const bad = '(:include Nope.domain)\n' + VALID_DOMAIN
  const path = first(bad)
  assert.equal(path.code, 'expected-include-path')
  assert.deepEqual(range(path), span(bad, 'N'))
})

test('semantic errors: the variable, the task form; a duplicate domain id is dependent', () => {
  const file = nodePath.join(FIXTURES, 'HTNDiagnosticTests', 'DiagnosticSemanticErrors.domain')
  const text = fs.readFileSync(file, 'utf8')
  const r = compileDomainFile(file)
  assert.equal(r.ok, false)
  assert.deepEqual(r.diagnostics.map(range), [
    span(text, '?missing_target'),
    span(text, '?missing_destination'),
    span(text, '(method_that_does_not_exist ?inp_target)')
  ])
  assert.ok(r.diagnostics.every(d => d.recovery === 'recoverable'))

  const dup = compile('(:include "Same.domain")\n(:domain Same top_level_domain (:method (run) top_level_method (ready () ((!act)))))', {
    'Same.domain': '(:domain Same)'
  })
  const d = dup.diagnostics.find(x => x.code === 'duplicate-domain')
  assert.ok(d, show(dup))
  assert.equal(d.recovery, 'dependent')
})

test('formatDiagnostic: file:line:col-endLine:endCol: severity code: message', () => {
  const source = valueDomain('-abc')
  const at = span(source, '-abc')
  assert.match(
    formatDiagnostic(first(source)),
    new RegExp(`^Root\\.domain:${at.line}:${at.col}-${at.endLine}:${at.endCol}: error invalid-negative-literal: Invalid negative literal`)
  )
})

test('exact duplicates are reported once; a different range or message is kept', () => {
  const list: Diagnostic[] = []
  const d: Diagnostic = {
    severity: 'error', recovery: 'recoverable', code: 'x', message: 'm', file: 'f', line: 1, col: 2, endLine: 1, endCol: 5
  }
  reportDiagnostic(list, d)
  reportDiagnostic(list, { ...d })
  reportDiagnostic(list, { ...d, endCol: 6 })
  reportDiagnostic(list, { ...d, message: 'other' })
  assert.equal(list.length, 3)
})

test('every range ends at or after its start, inside the text', () => {
  const sources = [
    '', '// no domain', '(:domain Root top_level_domain', VALID_DOMAIN + '\n(extra)',
    '(:domain Root top_level_domain (:method (run) top_level_method (broken)))', '(:domain Root top_level_domain (:unknown))',
    valueDomain('-'), valueDomain('- 1'), valueDomain('()'), '(:domain Root (:method (run) top_level_method (ready () ((!act)))))'
  ]
  for (const source of sources) {
    const r = compile(source)
    assert.ok(r.diagnostics.length > 0, source)
    const lines = source.split('\n')
    for (const d of r.diagnostics) {
      const where = `${JSON.stringify(source)}: ${formatDiagnostic(d)}`
      assert.ok(d.endLine > d.line || (d.endLine === d.line && d.endCol >= d.col), where)
      assert.ok(d.endLine <= Math.max(1, lines.length), where)
      assert.ok(d.endCol <= (lines[d.endLine - 1] ?? '').length + 1, where)
    }
  }
})
