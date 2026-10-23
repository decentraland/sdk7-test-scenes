import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compile, describe, locate } from './helpers'
import { compileWithModules, emitDomainModule } from '../../../tools/htn/compiler'
import { callSites, validateCallterms } from '../../../src/htn-planner/htn/callterms'
import { int } from '../../../src/htn-planner/htn/atom'
import { decomposeDeferred, PlanRunner } from '../../../src/htn-planner/htn/planner'
import { linkModules } from '../../../tools/htn/linker'
import { loadModules } from '../../../tools/htn/loader'
import { pruneUnreachable } from '../../../tools/htn/reachability'
import { WorldState } from '../../../src/htn-planner/htn/world-state'
import { MODES, run } from '../planner/util'

const ROOT = `(:domain Root top_level_domain
  (:constants (kept 7) (unused 99))
  (:axiom (dead) (and (#dead_again)))
  (:axiom (dead_again) (and (obsolete)))
  (:axiom (ready) (and (#nested)))
  (:axiom (nested) (and (available @kept)))
  (:method (dead_a) (b () ((dead_b))))
  (:method (dead_b) (b (and (#dead)) ((dead_a))))
  (:method (run) top_level_method (b (and (#ready)) ((walk 2))))
  (:method (run ?inp_value) top_level_method (b () ((!argument ?inp_value))))
  (:method (reasoning) top_level_method (b () ((!update))))
  (:method (active_plan) top_level_method (b (and (valid)) ()))
  (:method (check_custom) top_level_method (b (and (valid)) ()))
  (:method (walk ?inp_n)
    (next (and (> ?inp_n 0)) ((!visit ?inp_n) (walk (-- ?inp_n))))
    (end () ((!done @kept)))))`

function ir(source: string, files: Record<string, string> = {}) {
  const r = compile(source, files)
  assert.ok(r.ok, describe(r))
  return r.ir
}

const signatures = (d: ReturnType<typeof ir>) => d.methods.map(m => `${m.domain}::${m.name}/${m.arity}`)

test('pruning removes dead cycles and axioms but retains every host entry and recursive dependency', () => {
  const d = ir(ROOT)
  assert.deepEqual(signatures(d), ['Root::run/0', 'Root::run/1', 'Root::reasoning/0', 'Root::active_plan/0', 'Root::check_custom/0', 'Root::walk/1'])
  assert.deepEqual(d.axioms.map(a => a.name), ['ready', 'nested'])
  assert.deepEqual(d.facts, ['obsolete/0', 'available/1', 'valid/0'])
  assert.deepEqual(d.methods.map(m => m.id), [0, 1, 2, 3, 4, 5])
  assert.deepEqual(d.axioms.map(a => a.id), [0, 1])
  assert.deepEqual(d.topLevel, { run: { 0: 0, 1: 1 }, reasoning: { 0: 2 }, active_plan: { 0: 3 }, check_custom: { 0: 4 } })
  assert.deepEqual(d.methods[0].source, { file: 'Root.domain', ...locate(ROOT, '(:method (run)'), endLine: 9, endCol: ROOT.split('\n')[8].length + 1 })
  const world = new WorldState()
  world.add('available', int(7))
  world.add('valid')
  for (const { mode } of MODES) {
    assert.deepEqual(run(d, world, 'run', [], { mode }).plan, ['!visit 2', '!visit 1', '!done 7'])
    assert.deepEqual(run(d, world, 'run', [int(8)], { mode }).plan, ['!argument 8'])
    assert.deepEqual(run(d, world, 'reasoning', [], { mode }).plan, ['!update'])
    for (const method of ['active_plan', 'check_custom']) assert.equal(run(d, world, method, [], { mode }).status, 'succeeded')
  }
  const emitted = emitDomainModule(d, 'root')
  assert.ok(!emitted.includes('dead_a') && !emitted.includes('dead_again'))
})

const BASE = `(:domain Base base
  (:axiom (ready) base (and (base_ready)))
  (:axiom (unused) ())
  (:method (act) base (b (and (#Base::ready)) ((!base_action))))
  (:method (act ?inp_v) (b () ((!base_arg ?inp_v))))
  (:method (entry) (b () ((act) (Base::act) (act 3)))))`
const DERIVED = `(:include "Base.domain")
(:domain Root top_level_domain
  (:axiom (ready) overrides Base (and (derived_ready)))
  (:method (act) overrides Base (b (and (#ready)) ((!derived))))
  (:method (dead_source) (b () ((&held_only 4) (&Base::act))))
  (:method (later ?inp_v) (b () ((leaf ?inp_v))))
  (:method (leaf ?inp_v) (b () ((!later ?inp_v))))
  (:method (held_only ?inp_v) (b () ((held_leaf ?inp_v))))
  (:method (held_leaf ?inp_v) (b () ((!held ?inp_v))))
  (:method (dead) (b () ((!never))))
  (:method (run) top_level_method (b () ((entry) (&later 5)))))`

test('qualified base calls, effective overrides and inherited arities survive; all deferred dispatch targets are roots', () => {
  const d = ir(DERIVED, { 'Base.domain': BASE })
  assert.deepEqual(signatures(d), ['Base::act/0', 'Base::act/1', 'Base::entry/0', 'Root::act/0', 'Root::later/1', 'Root::leaf/1', 'Root::held_only/1', 'Root::held_leaf/1', 'Root::run/0'])
  assert.deepEqual(d.axioms.map(a => `${a.domain}::${a.name}`), ['Base::ready', 'Root::ready'])
  const world = new WorldState()
  world.add('base_ready')
  world.add('derived_ready')
  for (const { mode } of MODES) {
    assert.deepEqual(run(d, world, 'run', [], { mode }).plan, ['!derived', '!base_action', '!base_arg 3', '&later 5'])
    const later = d.methods.find(m => m.name === 'held_only')!
    const expanded = decomposeDeferred(d, world, { kind: 'deferred', name: '&held_only', method: later.id, args: [int(4)] }, { mode })
    assert.equal(expanded.status, 'succeeded')
    assert.deepEqual(expanded.plan.map(s => s.name), ['!held'])
    assert.deepEqual(expanded.plan[0].args, [int(4)])
  }
})

const CALLS = `(:domain Root top_level_domain
  (:method (dead) (b (and (call unused_condition (call nested))) ((!dead (call unused_argument)))))
  (:method (run) top_level_method (b (and (call live)) ((!done)))))`

test('pruned bodies retain callsite order, arguments, source ranges and validation reports after serialization', () => {
  const d = ir(CALLS)
  assert.deepEqual(d.methods.map(m => m.name), ['run'])
  const summarize = (domain: typeof d) => callSites(domain).map(c => ({ name: c.name, site: c.site, source: c.source, range: c.node.source, args: c.node.args }))
  const calls = summarize(d)
  assert.deepEqual(calls.map(c => c.name), ['unused_condition', 'nested', 'unused_argument', 'live'])
  assert.deepEqual(calls[0].site, { kind: 'method', domain: 'Root', method: 'dead', branch: 'b' })
  assert.deepEqual(calls[0].source, { domain: 'Root', file: 'Root.domain', ...locate(CALLS, '(call unused_condition') })
  assert.deepEqual(calls[0].args, [{ k: 'call', name: 'nested', args: [], source: { file: 'Root.domain', ...locate(CALLS, '(call nested)'), endLine: 2, endCol: locate(CALLS, '(call nested)').col + '(call nested)'.length } }])
  assert.deepEqual(summarize(JSON.parse(JSON.stringify(d))), calls)
  assert.deepEqual(validateCallterms(d, {}).map(e => [e.name, e.reason, e.site, e.source]), calls.map(c => [c.name, 'not_registered', c.site, c.source]))
  assert.deepEqual(d.callterms, ['unused_condition', 'nested', 'unused_argument', 'live'])
})

test('dead code still produces linker diagnostics before pruning', () => {
  const source = `(:domain Root top_level_domain
  (:method (dead) (b () ((!use @missing))))
  (:method (run) top_level_method (b () ((!done)))))`
  const r = compile(source)
  assert.equal(r.ok, false)
  assert.deepEqual(r.diagnostics.map(d => ({ code: d.code, file: d.file, line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol })), [
    { code: 'unknown-constant', file: 'Root.domain', line: 2, col: 32, endLine: 2, endCol: 40 }
  ])
})

// The public compiler rejects a root without a top-level method; the linker is also usable by source tools.
test('no roots removes even mutually recursive bodies; unresolved calls conservatively keep the IR', () => {
  const loaded = loadModules('Root.domain', '(:domain Root (:method (a) (b () ((b)))) (:method (b) (b () ((a)))))', () => { throw new Error('no includes') })
  assert.ok(loaded.ok)
  const linked = linkModules(loaded.modules, loaded.files, loaded.diagnostics)
  assert.ok(linked)
  pruneUnreachable(linked)
  assert.deepEqual(linked.methods, [])
  assert.deepEqual(linked.axioms, [])
  const unresolved = ir('(:domain Root top_level_domain (:method (run) top_level_method (b () ((!done)))))')
  unresolved.methods[0].branches[0].tasks.push({ k: 'method', method: 42, args: [] })
  assert.equal(pruneUnreachable(unresolved), unresolved)
  assert.equal(unresolved.methods.length, 1)
})

test('pruning preserves source-wide initialization diagnostics and retained call-node identity', () => {
  const compiled = compileWithModules('Root.domain', CALLS)
  assert.ok(compiled.result.ok, describe(compiled.result))
  const pruned = compiled.result.ir
  const original = linkModules(compiled.modules, compiled.files, [])!
  assert.deepEqual(callSites(pruned), callSites(original))
  const diagnostics = (domain: typeof pruned) => {
    const reports: unknown[] = []
    new PlanRunner(domain, new WorldState(), { onDiagnostic: d => reports.push(d) })
    return reports
  }
  assert.deepEqual(diagnostics(pruned), diagnostics(original))
  const live = pruned.methods[0].branches[0].cond
  assert.ok(live?.k === 'and' && live.items[0].k === 'call')
  assert.equal(callSites(pruned)[3].node, live.items[0])
  // Legacy v2 literals carry no removed-callsite field and still validate normally.
  const legacy = ir('(:domain Root top_level_domain (:method (run) top_level_method (b (and (call old)) ())))')
  assert.equal(legacy.version, 2)
  assert.equal(legacy.prunedCallSites, undefined)
  assert.deepEqual(validateCallterms(JSON.parse(JSON.stringify(legacy)), {}).map(e => e.name), ['old'])
})
