// Structural validation of every conformance case file. Needs neither the compiler nor the planner.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAtom } from '../../../src/htn-planner/htn/atom'
import { parseAtom } from '../../../src/examples/upstream/atom-literal'
import { CALLTERM_SETS } from '../../../src/examples/upstream/conformance-callterms'
import { loadCases, validateCase } from './cases'

const cases = loadCases()

test('conformance cases exist', () => {
  assert.ok(cases.length > 0)
})

test('case names are unique', () => {
  const seen = new Map<string, string>()
  for (const c of cases) {
    assert.ok(!seen.has(c.name), `duplicate case name ${JSON.stringify(c.name)} in ${c.file} and ${seen.get(c.name)}`)
    seen.set(c.name, c.file ?? '?')
  }
})

for (const c of cases) {
  test(`schema: ${c.file} / ${c.name}`, () => {
    assert.deepEqual(validateCase(c), [])
  })
}

test('callterm sets are functions', () => {
  for (const [name, set] of Object.entries(CALLTERM_SETS))
    for (const [term, fn] of Object.entries(set)) assert.equal(typeof fn, 'function', `${name}.${term}`)
})

test('atom literal parser round-trips domain syntax', () => {
  const roundTrip: [string, string][] = [
    ['7', '7'],
    ['-2147483648', '-2147483648'],
    ['1.5', '1.5'],
    ['-0.5', '-0.5'],
    ['enemy_7', 'enemy_7'],
    ['true', 'true'],
    ['"text with (parens)"', '"text with (parens)"'],
    ['()', '()'],
    ['(patrol 3 (10.0 20.0 30.0) "x")', '(patrol 3 (10.0 20.0 30.0) "x")'],
    ['#true', '1']
  ]
  for (const [text, formatted] of roundTrip) assert.equal(formatAtom(parseAtom(text)), formatted, text)
  assert.equal(parseAtom('true').t, 'sym')
  assert.equal(parseAtom('#false').t, 'bool')
  assert.equal(parseAtom('1').t, 'int')
  assert.equal(parseAtom('1.0').t, 'float')
  assert.ok(Object.is((parseAtom('-0.0') as { v: number }).v, -0))
  for (const bad of ['', '(', ')', '"open', '2147483648', '1 2', '?var', '@const', '-abc'])
    assert.throws(() => parseAtom(bad), Error, bad)
})
