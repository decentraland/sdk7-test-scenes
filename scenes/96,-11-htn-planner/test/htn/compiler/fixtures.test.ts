// Upstream fixtures: every root domain compiles, every world state parses, and the
// HTNDiagnosticTests domains report their errors at the right places.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { compileDomainFile, parseWorldState } from '../../../tools/htn/compiler'
import { WorldState } from '../../../src/htn-planner/htn/world-state'
import { float, int, list, str, sym } from '../../../src/htn-planner/htn/atom'
import { FIXTURES, describe as show, errors } from './helpers'

const domainsDir = nodePath.join(FIXTURES, 'Domains')
const listDomains = (dir: string) =>
  fs.readdirSync(dir).filter(f => f.endsWith('.domain')).map(f => nodePath.join(dir, f))

// Upstream premake5.lua:197-204 translates every Domains/**.domain except Domains/Includes/
// ("link-time modules, not independently executable planners"). All of them are roots.
const roots = [...listDomains(domainsDir), ...listDomains(nodePath.join(domainsDir, 'Test'))]

test('upstream fixture set is present', () => {
  assert.equal(roots.length, 29)
})

for (const path of roots) {
  const name = nodePath.relative(domainsDir, path).replace(/\\/g, '/')
  test(`upstream root domain compiles: ${name}`, () => {
    const result = compileDomainFile(path)
    assert.ok(result.ok, show(result))
    assert.equal(errors(result).length, 0)
    const ir = result.ir
    assert.ok(Object.keys(ir.topLevel).length > 0, 'has top-level entries')
    // Every resolved reference points at a real declaration.
    const checkTasks = ir.methods.flatMap(m => m.branches.flatMap(b => b.tasks))
    for (const t of checkTasks) if (t.k !== 'prim') assert.ok(ir.methods[t.method], `task target ${t.method}`)
    ir.methods.forEach((m, i) => assert.equal(m.id, i))
    ir.axioms.forEach((a, i) => assert.equal(a.id, i))
  })
}

test('Domains/Includes modules are not roots (base or plain domains, no top_level_domain)', () => {
  for (const path of listDomains(nodePath.join(domainsDir, 'Includes'))) {
    const result = compileDomainFile(path)
    assert.equal(result.ok, false, path)
    assert.ok(errors(result).some(d => d.code === 'root-not-top-level'), show(result))
  }
})

const worldStates = [
  ...fs.readdirSync(nodePath.join(FIXTURES, 'WorldStates')).filter(f => f.endsWith('.worldstate')),
  ...fs.readdirSync(nodePath.join(FIXTURES, 'WorldStates/Test')).map(f => 'Test/' + f)
]

test('every upstream .worldstate parses', () => {
  assert.equal(worldStates.length, 29)
  for (const file of worldStates) {
    const ws = new WorldState()
    assert.doesNotThrow(() => parseWorldState(fs.readFileSync(nodePath.join(FIXTURES, 'WorldStates', file), 'utf8'), ws), file)
  }
})

test('world state rows keep types, lists and line-delimited facts', () => {
  const ws = new WorldState()
  parseWorldState(
    '// comment\r\nflags true false 1 0 "true"\nsigned_fact -1 -0.5\nnested (a (1 2.5) "s")\n  multi (1\n 2)\nempty\n',
    ws
  )
  assert.deepEqual(ws.rows('flags', 5), [[sym('true'), sym('false'), int(1), int(0), str('true')]])
  assert.deepEqual(ws.rows('signed_fact', 2), [[int(-1), float(-0.5)]])
  assert.deepEqual(ws.rows('nested', 1), [[list(sym('a'), list(int(1), float(2.5)), str('s'))]])
  assert.deepEqual(ws.rows('multi', 1), [[list(int(1), int(2))]]) // a list may span lines
  assert.deepEqual(ws.rows('empty', 0), [[]])
})

test('world state file: concrete upstream rows', () => {
  const ws = new WorldState()
  parseWorldState(fs.readFileSync(nodePath.join(FIXTURES, 'WorldStates/AAACombatNPC_idle.worldstate'), 'utf8'), ws)
  assert.deepEqual(ws.rows('patrol_route', 2), [[int(1), str('north_loop')]])
  assert.deepEqual(ws.rows('health', 2), [[int(1), int(100)]])
  const wanderer = new WorldState()
  parseWorldState(fs.readFileSync(nodePath.join(FIXTURES, 'WorldStates/Wanderer.worldstate'), 'utf8'), wanderer)
  assert.deepEqual(wanderer.rows('wanderer_location', 1), [[list(int(0), int(0))]])
})

test('world state errors: an argument on a new line, empty list, `call`, stray characters', () => {
  for (const bad of ['fact\n1', 'fact ()', 'fact call', 'fact $', 'fact / 1', 'fact\t1']) {
    assert.throws(() => parseWorldState(bad, new WorldState()), /\d+:\d+/, JSON.stringify(bad))
  }
})

// HTNDiagnosticTests/README.txt describes the expected reports.
const diagnosticsDir = nodePath.join(FIXTURES, 'HTNDiagnosticTests')
const codes = (path: string) => {
  const result = compileDomainFile(path)
  assert.equal(result.ok, false)
  return result.diagnostics.map(d => `${nodePath.basename(d.file)}:${d.line}:${d.col} ${d.code}`)
}

test('DiagnosticSemanticErrors: multiple semantic errors at their real source positions', () => {
  assert.deepEqual(codes(nodePath.join(diagnosticsDir, 'DiagnosticSemanticErrors.domain')), [
    'DiagnosticSemanticErrors.domain:6:26 unknown-variable',
    'DiagnosticSemanticErrors.domain:7:24 unknown-variable',
    'DiagnosticSemanticErrors.domain:8:17 unknown-method'
  ])
})

test('DiagnosticParserRecovery: the parser error (line 4) plus the later semantic errors', () => {
  assert.deepEqual(codes(nodePath.join(diagnosticsDir, 'DiagnosticParserRecovery.domain')), [
    'DiagnosticParserRecovery.domain:4:9 expected-constant',
    'DiagnosticParserRecovery.domain:12:26 unknown-variable',
    'DiagnosticParserRecovery.domain:13:24 unknown-variable',
    'DiagnosticParserRecovery.domain:14:17 unknown-method'
  ])
})

test('DiagnosticRootWithInclude: errors point into the included file', () => {
  const result = compileDomainFile(nodePath.join(diagnosticsDir, 'DiagnosticRootWithInclude.domain'))
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.diagnostics.map(d => `${d.file.slice(d.file.indexOf('Includes/'))}:${d.line}:${d.col} ${d.code}`),
    [
      'Includes/DiagnosticBrokenInclude.domain:6:26 unknown-variable',
      'Includes/DiagnosticBrokenInclude.domain:7:24 unknown-variable'
    ]
  )
})
