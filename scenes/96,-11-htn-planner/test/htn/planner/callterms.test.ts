// The callterm contract: registry, typed bindings, converters, error policy, call-site validation and the standard
// list callterms. Ports of upstream's HTNMissingCallTermTest.cpp, HTNTypeConversionTest.cpp and the policy / binding
// tests of HTNBooleanCallTermTest.cpp, HTNBooleanCompatibilityTest.cpp, HTNNestedCallExpressionTest.cpp,
// HTNRuntimeListTest.cpp and HTNSharedImplementationTest.cpp (urosidoki/htn_planner aec08fa), plus our own cases.
// Upstream's two invocation paths (HTNCallTermRegistry::Execute and the generated C call) are invokeCallterm()
// and the planner (decompose / PlanRunner).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bool, float, int, list, str, sym, vec3, type Atom } from '../../../src/htn-planner/htn/atom'
import {
  CALLTERM_TYPES,
  callSites,
  callterm,
  invokeCallterm,
  listCallterms,
  memberCallterm,
  validateCallterms,
  withSignature,
  type CallTerm,
  type CallTermErrorInfo,
  type CallTermErrorPolicy,
  type CallTermErrorReason,
  type CallTermRegistry,
  type CallTermType
} from '../../../src/htn-planner/htn/callterms'
import type { DomainIR } from '../../../src/htn-planner/htn/ir'
import { decompose, PlanRunner, type PlannerOptions, type RuntimeDiagnostic } from '../../../src/htn-planner/htn/planner'
import { WorldState } from '../../../src/htn-planner/htn/world-state'
import { CALLTERM_SETS, type HostContext } from '../../../src/examples/upstream/conformance-callterms'
import { compileDomainFile, compileDomainSource } from '../../../tools/htn/compiler'
import { FIXTURES_DIR } from '../conformance/cases'
import { formatStep, warnings } from './util'

const POLICIES: CallTermErrorPolicy[] = ['fail_silently', 'report']

function fixtureDomain(path: string): { ir: DomainIR; text: string } {
  const r = compileDomainFile(join(FIXTURES_DIR, path))
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
  return { ir: r.ir, text: readFileSync(join(FIXTURES_DIR, path), 'utf8') }
}

function inlineDomain(text: string, file = 'Inline.domain'): DomainIR {
  const r = compileDomainSource(file, text)
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
  return r.ir
}

/** Upstream HTNSourceText::GetPosition: 1-based line and column of an offset. */
function positionAt(text: string, offset: number): { line: number; col: number } {
  assert.ok(offset >= 0, 'text not found')
  const before = text.slice(0, offset)
  return { line: before.split('\n').length, col: offset - (before.lastIndexOf('\n') + 1) + 1 }
}

const MISSING = fixtureDomain('upstream/Domains/Test/missing_callterms.domain')
const NESTED = fixtureDomain('upstream/Domains/Test/nested_operator_calls.domain')

/** Upstream's ClientContext test struct: count callterm reports (other diagnostics are not its callback's), keep the last. */
function reports() {
  const all: RuntimeDiagnostic[] = []
  return {
    all,
    sink: (d: RuntimeDiagnostic) => void (d.calltermError !== undefined && all.push(d)),
    get last(): CallTermErrorInfo {
      const info = all[all.length - 1]?.calltermError
      assert.ok(info, 'no callterm report')
      return info
    }
  }
}

// ---- HTNMissingCallTermTest.cpp ---------------------------------------------------------------------------------

test('callterm errors: the policy defaults to unset (ExecutionOptionsDefaultToUnset, HTNMissingCallTermTest.cpp:63)', () => {
  // Upstream asserts in debug builds and fails normally in release (HTNCallTermError.h:82); ours fails normally and
  // warns once, with the error.
  const { result, warned } = warnings(() => invokeCallterm('absent', []))
  assert.equal(result, undefined)
  assert.equal(warned.length, 1)
  assert.match(warned[0], /Configure the callterm error policy explicitly \(PlannerOptions\.calltermErrorPolicy\)/)
  assert.match(warned[0], /Callterm 'absent' is not registered/)
  // Valid callterms execute normally even with Unset (MISSING_CALLTERMS.md:56-58).
  assert.deepEqual(invokeCallterm('ok', [], { callterms: { ok: () => int(1) } }), int(1))
})

test('callterm errors: not_registered, missing_binding, missing_instance under both invocation paths (:73)', () => {
  const registry: CallTermRegistry = {
    empty: undefined, // declared with no callable (upstream BindMember(..., {}, {}))
    member: memberCallterm('agent', [], () => true, 'bool'),
    ordinary_failure: () => undefined
  }
  const domain = inlineDomain(`
(:domain Probe top_level_domain
    (:method (absent) top_level_method (b (and (call absent)) ((!unexpected))))
    (:method (empty) top_level_method (b (and (call empty)) ((!unexpected))))
    (:method (member) top_level_method (b (and (call member)) ((!unexpected))))
    (:method (ordinary_failure) top_level_method (b (and (call ordinary_failure)) ((!unexpected)))))`)
  const cases: [string, CallTermErrorReason, string | undefined][] = [
    ['absent', 'not_registered', undefined],
    // Upstream reports DaemonID "agent" here too: its empty entry still names the daemon; ours is just `undefined`.
    ['empty', 'missing_binding', undefined],
    ['member', 'missing_instance', 'agent']
  ]
  const logged: unknown[] = []
  const log = console.log
  const error = console.error
  console.log = console.error = (...a: unknown[]) => void logged.push(a)
  try {
    for (const policy of POLICIES) {
      for (const [name, reason, daemon] of cases) {
        const r = reports()
        const options = { callterms: registry, calltermErrorPolicy: policy, onDiagnostic: r.sink }
        assert.equal(invokeCallterm(name, [], options), undefined)
        assert.equal(decompose(domain, new WorldState(), name, [], options).status, 'no_plan')
        assert.equal(r.all.length, policy === 'report' ? 2 : 0, `${policy} ${name}`)
        if (policy !== 'report') continue
        for (const d of r.all) {
          assert.equal(d.code, 'missing_callterm')
          assert.deepEqual([d.calltermError?.reason, d.calltermError?.name, d.calltermError?.daemon], [reason, name, daemon])
        }
      }
    }
    const r = reports()
    const options = { callterms: registry, calltermErrorPolicy: 'report' as const, onDiagnostic: r.sink }
    assert.equal(invokeCallterm('ordinary_failure', [], options), undefined)
    assert.equal(decompose(domain, new WorldState(), 'ordinary_failure', [], options).status, 'no_plan')
    assert.equal(r.all.length, 0, 'an ordinary failure is not an invocation error')
  } finally {
    console.log = log
    console.error = error
  }
  assert.deepEqual(logged, [], 'nothing printed')
})

test('callterm errors: planner calls report their provenance and keep failure semantics (:121)', () => {
  const variants: [CallTermErrorReason, CallTermRegistry][] = [
    ['not_registered', {}],
    ['missing_binding', { probe: undefined }],
    ['missing_instance', { probe: memberCallterm('agent', [], () => true, 'bool') }]
  ]
  for (const [reason, bindings] of variants) {
    const callterms: CallTermRegistry = { ...bindings, identity: args => args[0] }
    for (const policy of POLICIES) {
      for (const entry of ['condition', 'binding', 'primitive', 'compound', 'nested', 'unused']) {
        const where = `${reason} ${policy} ${entry}`
        const r = reports()
        const result = decompose(MISSING.ir, new WorldState(), entry, [], { callterms, calltermErrorPolicy: policy, onDiagnostic: r.sink })
        const succeeds = entry === 'condition' || entry === 'binding' || entry === 'unused'
        assert.equal(result.status, succeeds ? 'succeeded' : 'no_plan', where)
        assert.equal(r.all.length, policy === 'report' && entry !== 'unused' ? 1 : 0, where)
        if (succeeds) assert.deepEqual(result.plan.map(formatStep), [entry === 'unused' ? '!safe' : '!fallback'], where)
        if (policy !== 'report' || entry === 'unused') continue
        const info = r.last
        assert.equal(info.reason, reason, where)
        assert.equal(info.name, 'probe')
        assert.equal(info.source?.domain, 'MissingCallTerms')
        assert.ok(info.source?.file.endsWith('missing_callterms.domain'), info.source?.file)
        const at = positionAt(MISSING.text, MISSING.text.indexOf('(call probe)', MISSING.text.indexOf(`(:method (${entry})`)))
        assert.deepEqual({ line: info.source?.line, col: info.source?.col }, at, where)
        assert.deepEqual(info.site, { kind: 'method', domain: 'MissingCallTerms', method: entry, branch: 'try' }, where)
      }
    }
  }
})

test('callterm errors: one registry, daemon instances per planner (SharedRegistryKeepsInstancesAndClientContextsIndependent, :184)', () => {
  const registry: CallTermRegistry = { member: memberCallterm<number, [], 'int'>('agent', [], instance => instance, 'int') }
  const first = reports()
  const second = reports()
  const firstOptions = { callterms: registry, daemons: { agent: 7 }, calltermErrorPolicy: 'report' as const, onDiagnostic: first.sink }
  const secondOptions = { callterms: registry, calltermErrorPolicy: 'report' as const, onDiagnostic: second.sink }
  assert.deepEqual(invokeCallterm('member', [], firstOptions), int(7))
  assert.equal(invokeCallterm('member', [], secondOptions), undefined)
  assert.deepEqual([first.all.length, second.all.length, second.last.reason], [0, 1, 'missing_instance'])
  assert.deepEqual(invokeCallterm('member', [], { ...secondOptions, daemons: { agent: 7 } }), int(7))
  assert.equal(second.all.length, 1)
})

test('daemons: a shared member binding uses the daemon of each planner; a missing one fails and can recover (HTNGeneratedEquivalenceTest.cpp:1388, :1459)', () => {
  const registry: CallTermRegistry = {
    read_entity_value: memberCallterm<{ value: number }, [], 'int'>('PerEntityCallTermDaemon', [], d => d.value, 'int')
  }
  const domain = inlineDomain(`
(:domain Daemons top_level_domain
    (:method (read) top_level_method (b (and (= ?v (call read_entity_value))) ((!value ?v)))))`)
  const plan = (options: PlannerOptions) => decompose(domain, new WorldState(), 'read', [], options).plan.map(formatStep)
  const first = { callterms: registry, daemons: { PerEntityCallTermDaemon: { value: 17 } } }
  const second = { callterms: registry, daemons: { PerEntityCallTermDaemon: { value: 42 } } }
  assert.deepEqual([plan(first), plan(second)], [['!value 17'], ['!value 42']])
  const runner = new PlanRunner(domain, new WorldState(), { callterms: registry, calltermErrorPolicy: 'fail_silently' })
  assert.equal(runner.plan('read'), 'no_plan')
  ;(runner.options as PlannerOptions).daemons = { PerEntityCallTermDaemon: { value: 73 } }
  assert.equal(runner.plan('read'), 'succeeded')
  assert.deepEqual(runner.steps.map(formatStep), ['!value 73'])
})

test('callterm errors: unset fails the call and warns once, by both paths (UnsetAssertsOnMissingInvocation, :214)', () => {
  const registry: CallTermRegistry = {
    typed: withSignature(['int'], () => bool(true)),
    empty: undefined,
    member: memberCallterm('agent', [], () => true, 'bool')
  }
  const domain = inlineDomain(`
(:domain Unset top_level_domain
    (:method (run ?inp_name) top_level_method
        (absent (and (== ?inp_name absent) (call absent)) ((!x)))
        (empty (and (== ?inp_name empty) (call empty)) ((!x)))
        (member (and (== ?inp_name member) (call member)) ((!x)))
        (typed (and (== ?inp_name typed) (call typed)) ((!x)))))`)
  const unset = /^\[htn\] Configure the callterm error policy explicitly/
  for (const name of ['absent', 'empty', 'member', 'typed']) {
    const direct = warnings(() => invokeCallterm(name, [], { callterms: registry }))
    assert.equal(direct.result, undefined, name)
    assert.equal(direct.warned.length, 1, name)
    assert.match(direct.warned[0], unset, name)
    assert.match(direct.warned[0], new RegExp(`Callterm '${name}'`), name)
    const planned = warnings(() => decompose(domain, new WorldState(), 'run', [sym(name)], { callterms: registry }))
    assert.equal(planned.result.status, 'no_plan', name)
    assert.equal(planned.warned.length, 1, name)
    assert.match(planned.warned[0], unset, name)
  }
  // One warning per runner: every later error of that runner fails quietly.
  const runner = new PlanRunner(domain, new WorldState(), { callterms: registry })
  const repeated = warnings(() => ['absent', 'empty', 'absent'].map(name => runner.plan('run', [sym(name)])))
  assert.deepEqual(repeated.result, ['no_plan', 'no_plan', 'no_plan'])
  assert.equal(repeated.warned.length, 1)
  assert.match(repeated.warned[0], /Callterm 'absent' is not registered/)
})

test('callterm errors: each execution reports to its own sink with shared bindings (ReportsUseExecutionContextWithSharedBindings, :250)', () => {
  const callterms = CALLTERM_SETS['missing-callterms']
  const first = reports()
  const second = reports()
  const world = new WorldState()
  const a = new PlanRunner(MISSING.ir, world, { callterms, calltermErrorPolicy: 'report', onDiagnostic: first.sink, defaultTopLevel: 'condition' })
  const b = new PlanRunner(MISSING.ir, world, { callterms, calltermErrorPolicy: 'fail_silently', onDiagnostic: second.sink, defaultTopLevel: 'condition' })
  first.all.length = 0 // the creation checks
  second.all.length = 0
  assert.equal(a.plan(), 'succeeded')
  assert.equal(b.plan(), 'succeeded')
  assert.deepEqual([first.all.length, second.all.length], [1, 0])
})

test('callterm errors: report without a sink and an unknown policy fail the call and warn once (InvalidRuntimePolicyAndMissingReportCallbackAssert, :273)', () => {
  for (const [policy, message] of [
    ['report', /^\[htn\] Report policy requires a callterm error callback \(onDiagnostic\)/],
    ['bogus', /^\[htn\] Invalid callterm error policy 'bogus'/]
  ] as const) {
    const options = { calltermErrorPolicy: policy as CallTermErrorPolicy }
    const direct = warnings(() => invokeCallterm('absent', [], options))
    assert.equal(direct.result, undefined, policy)
    assert.equal(direct.warned.length, 1, policy)
    assert.match(direct.warned[0], message)
    const planned = warnings(() => decompose(MISSING.ir, new WorldState(), 'condition', [], options))
    assert.deepEqual(planned.result.plan.map(formatStep), ['!fallback'], 'the failed call fails its branch, as any failure')
    assert.equal(planned.warned.length, 1, policy)
    assert.match(planned.warned[0], message)
    assert.match(planned.warned[0], /Callterm 'probe' is not registered at .*missing_callterms\.domain:\d+:\d+/)
    const runner = new PlanRunner(MISSING.ir, new WorldState(), { ...options, defaultTopLevel: 'condition' })
    const repeated = warnings(() => [runner.plan(), runner.plan(), runner.plan()])
    assert.deepEqual(repeated.result, ['succeeded', 'succeeded', 'succeeded'])
    assert.equal(repeated.warned.length, 1, `${policy}: once per runner`)
  }
})

test('call-site validation shares the runtime checks and runs nothing (InitializationValidationSharesRuntimeChecksWithoutInvoking, :305)', () => {
  let executions = 0
  const identity: CallTerm = () => (executions++, bool(true))
  let infos = validateCallterms(MISSING.ir, { identity })
  assert.equal(infos.length, 6, 'probe at six call sites')
  assert.ok(infos.every(i => i.reason === 'not_registered' && i.name === 'probe'))
  const last = infos[infos.length - 1]
  assert.equal(last.source?.domain, 'MissingCallTerms')
  assert.ok(last.source && last.source.file !== '' && last.source.line > 0 && last.source.col > 0)

  infos = validateCallterms(MISSING.ir, { identity, probe: undefined })
  assert.deepEqual(infos.map(i => i.reason), Array(6).fill('missing_binding'))

  const probe = memberCallterm('agent', [], () => (executions++, true), 'bool')
  infos = validateCallterms(MISSING.ir, { identity, probe })
  assert.deepEqual(infos.map(i => [i.reason, i.daemon]), Array(6).fill(['missing_instance', 'agent']))
  assert.deepEqual(validateCallterms(MISSING.ir, { identity, probe }, { agent: {} }), [])
  assert.equal(executions, 0)
  assert.equal(validateCallterms(MISSING.ir, { identity, probe }, { agent: null }).length, 6, 'a null instance is missing')
})

test('call sites: every (call ...) once, with its exact source (InitializationMetadataIncludesEveryCallSiteWithExactSource, :345)', () => {
  const sites = callSites(MISSING.ir)
  assert.equal(sites.length, 7)
  let count = 0
  for (let at = MISSING.text.indexOf('(call '); at >= 0; at = MISSING.text.indexOf('(call ', at + 1)) {
    const p = positionAt(MISSING.text, at)
    const matches = sites.filter(s => s.source?.line === p.line && s.source.col === p.col)
    assert.equal(matches.length, 1, `call at ${p.line}:${p.col}`)
    assert.equal(MISSING.text.slice(at + 6, at + 6 + matches[0].name.length), matches[0].name)
    assert.ok(matches[0].source?.file.endsWith('missing_callterms.domain'))
    count++
  }
  assert.equal(count, sites.length)
})

/** Upstream ErrorConversionValue: an INT representation whose converters always fail. */
const ERROR_VALUE: CallTermType<object> = { name: 'ErrorConversionValue', atom: 'int', fromAtom: () => undefined, toAtom: () => undefined }

test('callterm errors: argument and conversion errors share the policy for both paths (ArgumentAndConversionErrorsSharePolicy..., :434)', () => {
  let calls = 0
  const instance = { member: (_: number) => (calls++, 1) }
  const registry: CallTermRegistry = {
    integer: callterm(['int'], () => (calls++, 1), 'int'),
    converted: callterm([ERROR_VALUE], () => (calls++, 1), 'int'),
    second: callterm(['int', ERROR_VALUE], () => (calls++, 1), 'int'),
    result: callterm([], () => (calls++, {}), ERROR_VALUE),
    member: memberCallterm<typeof instance, ['int'], 'int'>('ErrorFunctions', ['int'], (d, v) => d.member(v), 'int'),
    converted_member: memberCallterm('ErrorFunctions', [ERROR_VALUE], () => (calls++, 1), 'int')
  }
  const cases: { name: string; args: string[]; reason: CallTermErrorReason; index?: number; expected: number }[] = [
    { name: 'integer', args: [], reason: 'argument_count_mismatch', expected: 1 },
    { name: 'integer', args: ['1', '2'], reason: 'argument_count_mismatch', expected: 1 },
    { name: 'integer', args: ['1.0'], reason: 'argument_type_mismatch', index: 0, expected: 1 },
    { name: 'member', args: ['1.0'], reason: 'argument_type_mismatch', index: 0, expected: 1 },
    { name: 'member', args: [], reason: 'argument_count_mismatch', expected: 1 },
    { name: 'converted', args: ['1'], reason: 'argument_conversion_failed', index: 0, expected: 1 },
    { name: 'converted_member', args: ['1'], reason: 'argument_conversion_failed', index: 0, expected: 1 },
    { name: 'second', args: ['1', '2'], reason: 'argument_conversion_failed', index: 1, expected: 2 },
    { name: 'result', args: [], reason: 'return_conversion_failed', expected: 0 }
  ]
  const text = `(:domain Errors top_level_domain\n${cases
    .map((c, i) => `    (:method (case${i}) top_level_method (b (and (= ?r (call ${[c.name, ...c.args].join(' ')}))) ((!x ?r))))`)
    .join('\n')})\n`
  const domain = inlineDomain(text, 'Errors.domain')
  const atomOf = (s: string) => (s.includes('.') ? float(Number(s)) : int(Number(s)))
  for (const policy of ['report', 'fail_silently'] as const) {
    for (const planner of [false, true]) {
      cases.forEach((c, i) => {
        const where = `${policy} ${planner ? 'planner' : 'invokeCallterm'} ${c.name}(${c.args.join(' ')})`
        calls = 0
        const r = reports()
        const options = { callterms: registry, daemons: { ErrorFunctions: instance }, calltermErrorPolicy: policy, onDiagnostic: r.sink }
        if (planner) assert.equal(decompose(domain, new WorldState(), `case${i}`, [], options).status, 'no_plan', where)
        else assert.equal(invokeCallterm(c.name, c.args.map(atomOf), { ...options, source: { domain: 'Domain', file: 'test.domain', line: 12, col: 9 } }), undefined, where)
        assert.equal(calls, c.reason === 'return_conversion_failed' ? 1 : 0, `${where}: the function runs only when its arguments convert`)
        assert.equal(r.all.length, policy === 'report' ? 1 : 0, where)
        if (r.all.length === 0) return
        const info = r.last
        assert.equal(r.all[0].code, 'callterm_error')
        assert.deepEqual([info.reason, info.argumentIndex, info.name], [c.reason, c.index, c.name], where)
        assert.deepEqual([info.actualArgumentCount, info.expectedArgumentCount], [c.args.length, c.expected], where)
        const source = planner
          ? { domain: 'Errors', file: 'Errors.domain', ...positionAt(text, text.indexOf(`(call ${c.name}`, text.indexOf(`(case${i})`))) }
          : { domain: 'Domain', file: 'test.domain', line: 12, col: 9 }
        assert.deepEqual(info.source, source, where)
        if (c.index !== undefined) assert.deepEqual([info.expectedType, info.actualType], ['int', atomOf(c.args[c.index]).t], where)
        if (c.reason === 'argument_conversion_failed') assert.equal(info.expectedTypeName, 'ErrorConversionValue')
        if (c.reason === 'return_conversion_failed') assert.equal(info.expectedTypeName, 'ErrorConversionValue')
      })
    }
  }
})

test('callterm errors: a nested typed call with no argument reports argument_count_mismatch once (:515)', () => {
  let calls = 0
  let outer = 0
  const callterms: CallTermRegistry = {
    probe: callterm(['int'], () => (calls++, 1), 'int'),
    identity: () => (outer++, int(1))
  }
  for (const method of ['nested', 'primitive', 'compound']) {
    const r = reports()
    assert.equal(decompose(MISSING.ir, new WorldState(), method, [], { callterms, calltermErrorPolicy: 'report', onDiagnostic: r.sink }).status, 'no_plan')
    assert.equal(r.all.length, 1, method)
    assert.deepEqual([r.last.reason, r.last.name, r.last.source?.domain], ['argument_count_mismatch', 'probe', 'MissingCallTerms'])
    assert.ok(r.last.source && r.last.source.line > 0 && r.last.source.col > 0)
    assert.deepEqual([calls, outer], [0, 0])
  }
})

// ---- HTNNestedCallExpressionTest.cpp ----------------------------------------------------------------------------

test('callterm errors: nested calls report reason, count and their own source under each policy (MissingPoliciesReasonsCountAndExpressionSource, HTNNestedCallExpressionTest.cpp:168)', () => {
  const variants: [CallTermErrorReason, CallTermRegistry][] = [
    ['not_registered', {}],
    ['missing_binding', { missing_distance_callterm: undefined }],
    ['missing_instance', { missing_distance_callterm: memberCallterm('agent', [], () => float(0.1)) }]
  ]
  for (const [reason, bindings] of variants) {
    let outerCalls = 0
    const callterms: CallTermRegistry = { ...bindings, identity: args => (outerCalls++, args[0]) }
    for (const policy of POLICIES) {
      for (const entry of ['behave', 'missing_right', 'missing_arithmetic', 'missing_deep', 'bound_first', 'two_attempts', 'short_circuit', 'missing_task_arithmetic']) {
        const runner = new PlanRunner(NESTED.ir, new WorldState(), { callterms, calltermErrorPolicy: policy, defaultTopLevel: entry })
        for (let attempt = 0; attempt < 2; attempt++) {
          const where = `${reason} ${policy} ${entry} #${attempt}`
          const r = reports()
          ;(runner.options as PlannerOptions).onDiagnostic = r.sink // re-read on every plan, like upstream's execution fields
          assert.equal(runner.plan(), entry === 'short_circuit' ? 'succeeded' : 'no_plan', where)
          const expected = policy === 'fail_silently' || entry === 'short_circuit' ? 0 : entry === 'two_attempts' ? 2 : 1
          assert.equal(r.all.length, expected, where)
          assert.equal(outerCalls, 0, where)
          if (expected === 0) continue
          assert.deepEqual([r.last.reason, r.last.name, r.last.source?.domain], [reason, 'missing_distance_callterm', 'NestedOperatorCalls'], where)
          assert.ok(r.last.source?.file.endsWith('nested_operator_calls.domain'))
          let call = NESTED.text.indexOf('(call missing_distance_callterm', NESTED.text.indexOf(`(:method (${entry})`))
          if (entry === 'two_attempts') call = NESTED.text.indexOf('(call missing_distance_callterm', call + 1)
          assert.deepEqual({ line: r.last.source?.line, col: r.last.source?.col }, positionAt(NESTED.text, call), where)
        }
      }
    }
  }
})

test('callterm errors: unset fails a nested invocation too, and warns once (UnsetKeepsSdkContractForNestedInvocation, :235)', () => {
  const runner = new PlanRunner(NESTED.ir, new WorldState(), { defaultTopLevel: 'behave' })
  const { result, warned } = warnings(() => [runner.plan(), runner.plan()])
  assert.deepEqual(result, ['no_plan', 'no_plan'])
  assert.equal(warned.length, 1)
  assert.match(warned[0], /Configure the callterm error policy explicitly/)
  assert.match(warned[0], /Callterm 'missing_distance_callterm' is not registered/)
})

// ---- HTNBooleanCallTermTest.cpp, HTNBooleanCompatibilityTest.cpp ------------------------------------------------

const BOOLEAN = fixtureDomain('upstream/Domains/Test/boolean_callterms.domain')

test('boolean callterms: fail_silently neither reports nor logs a non-boolean result (FailSilentlyDoesNotReportOrLog, HTNBooleanCallTermTest.cpp:173)', () => {
  let calls = 0
  const logged: unknown[] = []
  const error = console.error
  const log = console.log
  console.log = console.error = (...a: unknown[]) => void logged.push(a)
  try {
    const status = decompose(BOOLEAN.ir, new WorldState(), 'condition', [], {
      callterms: { ppr_finalize_best: () => (calls++, int(0)) },
      calltermErrorPolicy: 'fail_silently',
      onDiagnostic: d => logged.push(d)
    }).status
    assert.equal(status, 'no_plan')
  } finally {
    console.log = log
    console.error = error
  }
  assert.deepEqual([calls, logged], [1, []])
})

test('boolean callterms: unbound results and invocation errors are not reported twice (:229)', () => {
  const r = reports()
  const options = (fn: CallTerm): PlannerOptions => ({ callterms: { ppr_finalize_best: fn }, calltermErrorPolicy: 'report', onDiagnostic: r.sink })
  assert.equal(decompose(BOOLEAN.ir, new WorldState(), 'condition', [], options(() => undefined)).status, 'no_plan')
  assert.equal(r.all.length, 0, 'an unbound result is an ordinary failure')
  assert.equal(decompose(BOOLEAN.ir, new WorldState(), 'condition', [], options(withSignature(['int'], () => bool(true)))).status, 'no_plan')
  assert.deepEqual(r.all.map(d => d.calltermError?.reason), ['argument_count_mismatch'])
  const raw: CallTerm = (_args, _context, call) => {
    call?.setError('return_conversion_failed')
    return list(int(4))
  }
  assert.equal(decompose(BOOLEAN.ir, new WorldState(), 'condition', [], options(raw)).status, 'no_plan')
  assert.deepEqual(r.all.map(d => d.calltermError?.reason), ['argument_count_mismatch', 'return_conversion_failed'], 'not also non_boolean')
})

test('boolean callterms: the report names the result type and the fix, as upstream demo prints (DemoDiagnosticExplainsTheResultTypeAndCorrection, :248)', () => {
  const r = reports()
  decompose(BOOLEAN.ir, new WorldState(), 'condition', [], {
    callterms: { ppr_finalize_best: () => vec3(1, 2, 3) },
    calltermErrorPolicy: 'report',
    onDiagnostic: r.sink
  })
  const d = r.all[0]
  assert.equal(d.code, 'non_boolean_condition_result')
  assert.deepEqual([d.calltermError?.expectedType, d.calltermError?.expectedTypeName, d.calltermError?.actualType], ['bool', 'bool', 'list'])
  assert.equal(d.calltermError?.argumentIndex, undefined)
  for (const part of ['ppr_finalize_best', 'returned list, expected bool', 'standalone callterm is a condition', 'bind or compare', '(= ?result (call ppr_finalize_best']) {
    assert.ok(d.message.includes(part), `${part} in ${d.message}`)
  }
  assert.ok(d.message.includes(`boolean_callterms.domain:${d.source?.line}:${d.source?.col}`))
})

test('boolean compatibility: typed bool parameters take INT 0 / 1 and reject the rest (TypedMemberBindingsAcceptBinaryIntegers..., HTNBooleanCompatibilityTest.cpp:89)', () => {
  const flags = { calls: 0 }
  const callterms = { identity: memberCallterm<typeof flags, ['bool'], 'bool'>('Flags', ['bool'], (d, v) => (d.calls++, v), 'bool') }
  const r = reports()
  const options = { callterms, daemons: { Flags: flags }, calltermErrorPolicy: 'report' as const, onDiagnostic: r.sink }
  for (const v of [0, 1]) assert.deepEqual(invokeCallterm('identity', [int(v)], options), bool(v === 1))
  assert.deepEqual([flags.calls, r.all.length], [2, 0])
  for (const value of [int(2), int(-1), float(1), str('true'), sym('true'), sym('false')]) {
    const before = r.all.length
    assert.equal(invokeCallterm('identity', [value], options), undefined)
    assert.equal(r.all.length, before + 1)
    assert.deepEqual([r.last.reason, r.last.argumentIndex, r.last.actualType, r.last.expectedType], ['argument_type_mismatch', 0, value.t, 'bool'])
  }
  assert.equal(flags.calls, 2)
})

// ---- HTNRuntimeListTest.cpp, HTNSharedImplementationTest.cpp ----------------------------------------------------

test('runtime lists: a missing binding / instance inside a list keeps its reason, reported once (:320, :328)', () => {
  const { ir } = fixtureDomain('upstream/Domains/Test/runtime_lists.domain')
  for (const [reason, binding] of [
    ['missing_binding', undefined],
    ['missing_instance', memberCallterm('agent', [], () => 1, 'int')]
  ] as const) {
    const world = new WorldState()
    const r = reports()
    const host: HostContext = { world, vars: {}, trace: [], counters: {}, errors: [] }
    const status = decompose(ir, world, 'missing', [], {
      callterms: { ...CALLTERM_SETS['runtime-lists'], missing_runtime_list: binding },
      context: host,
      calltermErrorPolicy: 'report',
      onDiagnostic: r.sink
    }).status
    assert.equal(status, 'no_plan')
    assert.deepEqual(r.all.map(d => d.calltermError?.reason), [reason])
    assert.deepEqual([host.counters.AfterCalls ?? 0, host.counters.OuterCalls ?? 0], [0, 0])
  }
})

test('shared implementations: validation lists unused callterms once per call site (PruningPreservesValidationOfUnusedCallterms, :241)', () => {
  const { ir } = fixtureDomain('upstream/Domains/Test/shared_implementations.domain')
  let executions = 0
  const count: CallTerm = () => (executions++, bool(true))
  const infos = validateCallterms(ir, { echo: count, missing_shared_callterm: count })
  // Two reports, as upstream (its order follows its code generator; ours methods, then axioms).
  assert.deepEqual(infos.map(i => [i.name, i.reason]).sort(), [['unused_argument', 'not_registered'], ['unused_condition', 'not_registered']])
  const argument = infos.find(i => i.name === 'unused_argument')
  assert.ok(argument?.source?.file.endsWith('shared_implementation_base.domain'))
  assert.ok((argument?.source?.col ?? 0) > 0)
  assert.deepEqual(validateCallterms(ir, { echo: count, missing_shared_callterm: count, unused_condition: count, unused_argument: count }), [])
  assert.equal(executions, 0)
})

// ---- HTNTypeConversionTest.cpp ----------------------------------------------------------------------------------

test('type conversion: built-in converters both ways, strict like upstream (ConvertsNativeAtomTypesBothWays, :66)', () => {
  const T = CALLTERM_TYPES
  assert.equal(T.int.fromAtom(int(7), null), 7)
  assert.equal(T.int.fromAtom(float(7), null), undefined, 'an int32 never reads a FLOAT')
  assert.equal(T.float.fromAtom(int(7), null), undefined, 'a float never reads an INT')
  assert.deepEqual([T.bool.fromAtom(bool(true), null), T.bool.fromAtom(int(0), null), T.bool.fromAtom(int(2), null)], [true, false, undefined])
  assert.deepEqual([T.str.fromAtom(str('a'), null), T.str.fromAtom(sym('a'), null), T.sym.fromAtom(sym('a'), null)], ['a', undefined, 'a'])
  assert.deepEqual(T.list.fromAtom(list(int(1)), null), [int(1)])
  assert.deepEqual(T.vec3.fromAtom(list(int(1), float(2), int(3)), null), { x: 1, y: 2, z: 3 })
  assert.equal(T.vec3.fromAtom(list(int(1), int(2)), null), undefined)
  assert.deepEqual([T.int.toAtom(3, null), T.int.toAtom(3.5, null), T.int.toAtom(2 ** 31, null)], [int(3), undefined, undefined])
  assert.deepEqual([T.float.toAtom(0.5, null), T.float.toAtom(1e39, null)], [float(0.5), undefined])
  assert.deepEqual([T.bool.toAtom(false, null), T.str.toAtom('a', null), T.sym.toAtom('a', null)], [bool(false), str('a'), sym('a')])
  assert.deepEqual(T.vec3.toAtom({ x: 1, y: 2, z: 3 }, null), vec3(1, 2, 3))
  assert.deepEqual(T.any.toAtom(sym('x'), null), sym('x'))
})

test('type conversion: representation metadata (ExposesRepresentationMetadata, :79)', () => {
  const T = CALLTERM_TYPES
  assert.deepEqual(
    [T.int, T.float, T.bool, T.str, T.sym, T.list, T.vec3, T.any].map(t => [t.name, t.atom]),
    [['int32', 'int'], ['float', 'float'], ['bool', 'bool'], ['string', 'str'], ['HtnSymbol', 'sym'], ['HTNAtomList', 'list'], ['vec3', 'list'], ['HTNAtom', undefined]]
  )
  assert.deepEqual(callterm(['int', 'any', 'bool'], () => undefined).signature, ['int', undefined, 'bool'])
  assert.equal(memberCallterm('agent', [], () => undefined).daemon, 'agent')
})

/** Upstream TestCell (HTNTypeConversionTest.cpp:20-64): a composite converter built on the native ones, forwarding the context. */
const TEST_CELL: CallTermType<{ x: number; y: number }> = {
  name: 'TestCell',
  atom: 'list',
  fromAtom: (atom, context) => {
    const items = CALLTERM_TYPES.list.fromAtom(atom, context)
    if (items === undefined || items.length !== 2) return undefined
    const x = CALLTERM_TYPES.int.fromAtom(items[0], context)
    const y = CALLTERM_TYPES.int.fromAtom(items[1], context)
    return x === undefined || y === undefined ? undefined : { x, y }
  },
  toAtom: (cell, context) => {
    const x = CALLTERM_TYPES.int.toAtom(cell.x, context)
    const y = CALLTERM_TYPES.int.toAtom(cell.y, context)
    return x === undefined || y === undefined ? undefined : list(x, y)
  }
}

test('type conversion: a composite converter, both ways, rejecting malformed atoms (:91, :105)', () => {
  const atom = list(int(3), int(6))
  const cell = TEST_CELL.fromAtom(atom, undefined)
  assert.deepEqual(cell, { x: 3, y: 6 })
  assert.deepEqual(cell && TEST_CELL.toAtom(cell, undefined), atom)
  for (const bad of [int(3), list(int(3)), list(int(3), str('six'))]) assert.equal(TEST_CELL.fromAtom(bad, undefined), undefined)
  assert.deepEqual(callterm([TEST_CELL], c => c, TEST_CELL).signature, ['list'])
})

/** Upstream TestEntityManager / TestEntityRef: an INT id resolved through the client context. */
interface EntityManager {
  entity: { id: number }
  alive: boolean
  reads: number
  writes: number
}
const manager = (id = 7): EntityManager => ({ entity: { id }, alive: true, reads: 0, writes: 0 })
const ENTITY: CallTermType<{ id: number }> = {
  name: 'TestEntityRef',
  atom: 'int',
  fromAtom: (atom, context) => {
    const m = context as EntityManager | undefined
    if (!m || atom.t !== 'int') return undefined
    m.reads++
    return m.alive && m.entity.id === atom.v ? m.entity : undefined
  },
  toAtom: (value, context) => {
    const m = context as EntityManager | undefined
    if (!m) return undefined
    m.writes++
    return m.alive && value === m.entity ? int(value.id) : undefined
  }
}

test('type conversion: client-context converters reject missing, stale and foreign entities (ManagerConversionRejects..., :181)', () => {
  const m = manager()
  const other = manager()
  assert.equal(ENTITY.fromAtom(int(7), undefined), undefined)
  assert.equal(ENTITY.toAtom(m.entity, undefined), undefined)
  assert.equal(ENTITY.fromAtom(int(99), m), undefined)
  assert.equal(ENTITY.toAtom(other.entity, m), undefined)
  const value = ENTITY.fromAtom(int(7), m)
  assert.equal(value, m.entity)
  assert.deepEqual(ENTITY.toAtom(m.entity, m), int(7))
  m.alive = false
  assert.equal(ENTITY.fromAtom(int(7), m), undefined)
  assert.equal(ENTITY.toAtom(m.entity, m), undefined)
})

test('type conversion: static and member bindings convert with each invocation\'s context (StaticAndMemberBindingsUseEachInvocationContext, :205)', () => {
  const daemon = { calls: 0 }
  const callterms: CallTermRegistry = {
    static: callterm([ENTITY], e => e, ENTITY),
    member: memberCallterm<typeof daemon, [typeof ENTITY], typeof ENTITY>('EntityDaemon', [ENTITY], (d, e) => (d.calls++, e), ENTITY)
  }
  const first = manager()
  const second = manager()
  const domain = inlineDomain(`
(:domain Entities top_level_domain
    (:method (run ?inp_name) top_level_method
        (static (and (== ?inp_name static) (= ?r (call static 7))) ((!x ?r)))
        (member (and (== ?inp_name member) (= ?r (call member 7))) ((!x ?r)))))`)
  for (const name of ['static', 'member']) {
    for (const m of [first, second]) {
      const options = { callterms, daemons: { EntityDaemon: daemon }, context: m, calltermErrorPolicy: 'report' as const, onDiagnostic: () => assert.fail('no error') }
      const reads = m.reads
      const writes = m.writes
      assert.deepEqual(invokeCallterm(name, [int(7)], options), int(7))
      assert.deepEqual(decompose(domain, new WorldState(), 'run', [sym(name)], options).plan.map(formatStep), ['!x 7'])
      assert.deepEqual([m.reads, m.writes], [reads + 2, writes + 2])
    }
  }
  assert.deepEqual([first.reads, second.reads], [4, 4])
  const calls = daemon.calls
  second.alive = false
  assert.equal(invokeCallterm('member', [int(7)], { callterms, daemons: { EntityDaemon: daemon }, context: second, calltermErrorPolicy: 'fail_silently' }), undefined)
  assert.equal(daemon.calls, calls, 'a failed argument conversion does not run the function')
})

test('type conversion: planners sharing a registry each convert with their own context and daemon (GeneratedNestedCallsPropagateClientContext..., :251)', () => {
  const callterms: CallTermRegistry = {
    identity: callterm([ENTITY], e => e, ENTITY),
    probe: memberCallterm<{ value: { id: number } }, [], typeof ENTITY>('EntityDaemon', [], d => d.value, ENTITY)
  }
  const first = manager(7)
  const second = manager(23)
  const world = new WorldState()
  const a = new PlanRunner(MISSING.ir, world, { callterms, daemons: { EntityDaemon: { value: first.entity } }, context: first, calltermErrorPolicy: 'fail_silently' })
  // Upstream leaves the second unit's policy Unset: no error happens.
  const b = new PlanRunner(MISSING.ir, world, { callterms, daemons: { EntityDaemon: { value: second.entity } }, context: second })
  for (let i = 0; i < 2; i++) {
    assert.equal(a.plan('nested'), 'succeeded')
    assert.equal(b.plan('nested'), 'succeeded')
    assert.deepEqual([a.steps.map(formatStep), b.steps.map(formatStep)], [['!use 7'], ['!use 23']])
  }
  assert.deepEqual([first.reads, first.writes, second.reads, second.writes], [2, 4, 2, 4])
  assert.equal(a.plan('deferred'), 'succeeded')
  assert.equal(a.resolve(), 'ready', 'a deferred step converts with the same context')
  first.alive = false
  assert.equal(a.plan('nested'), 'no_plan')
  assert.equal(b.plan('nested'), 'succeeded')
})

// ---- Typed bindings (ours) --------------------------------------------------------------------------------------

test('typed bindings: values in, value out; undefined is an ordinary failure; a bad result is return_conversion_failed', () => {
  const r = reports()
  const options = {
    callterms: {
      lt: callterm(['int', 'int'], (a, b) => a < b, 'bool'),
      half: callterm(['int'], n => n / 2, 'int'),
      nothing: callterm(['any'], () => undefined),
      length: callterm(['vec3'], v => Math.hypot(v.x, v.y, v.z), 'float'),
      tag: callterm(['sym', 'str'], (s, t) => `${s}:${t}`, 'str')
    },
    calltermErrorPolicy: 'report' as const,
    onDiagnostic: r.sink
  }
  assert.deepEqual(invokeCallterm('lt', [int(1), int(2)], options), bool(true))
  assert.deepEqual(invokeCallterm('half', [int(4)], options), int(2))
  assert.deepEqual(invokeCallterm('length', [vec3(3, 4, 0)], options), float(5))
  assert.deepEqual(invokeCallterm('tag', [sym('a'), str('b')], options), str('a:b'))
  assert.equal(invokeCallterm('nothing', [int(1)], options), undefined)
  assert.equal(r.all.length, 0)
  assert.equal(invokeCallterm('half', [int(3)], options), undefined, '1.5 is not an int32')
  assert.deepEqual([r.last.reason, r.last.expectedTypeName], ['return_conversion_failed', 'int32'])
  assert.equal(invokeCallterm('length', [list(int(1))], options), undefined)
  assert.deepEqual([r.last.reason, r.last.expectedTypeName, r.last.argumentIndex], ['argument_conversion_failed', 'vec3', 0])
})

test('typed bindings: a host may call one directly; errors then just fail it', () => {
  const lt = callterm(['int', 'int'], (a, b) => a < b, 'bool')
  assert.deepEqual(lt([int(1), int(2)], undefined), bool(true))
  assert.equal(lt([int(1)], undefined), undefined)
  const raw = withSignature(['bool'], args => args[0])
  assert.deepEqual(raw([int(1)], undefined), int(1), 'a raw binding gets the original atom (TYPE_CONVERSION.md:341-343)')
  assert.equal(raw([int(2)], undefined), undefined)
})

test('callterm errors: a runtime report names the method and branch, or the axiom, holding the call', () => {
  const domain = inlineDomain(`
(:domain Sites top_level_domain
    (:method (run) top_level_method
        (via_axiom (and (#check)) ((!x)))
        (direct (and (call missing 1)) ((!y))))
    (:axiom (check) (and (call missing 2))))`)
  const r = reports()
  decompose(domain, new WorldState(), 'run', [], { calltermErrorPolicy: 'report', onDiagnostic: r.sink })
  assert.deepEqual(r.all.map(d => d.calltermError?.site), [
    { kind: 'axiom', domain: 'Sites', axiom: 'check' },
    { kind: 'method', domain: 'Sites', method: 'run', branch: 'direct' }
  ])
})

test('callterm errors: an unbound variable argument is passed unbound, as upstream NULL; the binding decides (D4)', () => {
  // Upstream passes HTNGeneratedVariables_Get(...) == NULL (HTNCCodeGenerator.cpp:1361-1371, :2840-2844, :676-686):
  // CheckEntry first (not_registered...), then a typed binding's ValidateArguments sees HTN_ATOM_TYPE_UNBOUND
  // (HTNCallTermRegistry.cpp:152-178), an HTNAtom parameter fails its conversion (HTNTypeConversion.h:95-104).
  // A runtime list needs bound elements: there the call is not invoked (:1145-1166).
  const domain = inlineDomain(`
(:domain U top_level_domain
    (:method (cond) top_level_method (b (and (or (v ?x) (== 1 1)) (call f ?x)) ((!bad))) (other () ((!ok))))
    (:method (assign) top_level_method (b (and (or (v ?x) (== 1 1)) (= ?y (call f ?x))) ((!bad ?y))) (other () ((!ok))))
    (:method (nested) top_level_method (b (and (or (v ?x) (== 1 1)) (call g (call f ?x))) ((!bad))) (other () ((!ok))))
    (:method (task) top_level_method (b (and (or (v ?x) (== 1 1))) ((!t (call f ?x)))) (other () ((!ok))))
    (:method (in_list) top_level_method (b (and (or (v ?x) (== 1 1)) (= ?y ((call f ?x)))) ((!bad ?y))) (other () ((!ok)))))`)
  let ran = 0
  const cases: { name: string; f: CallTerm | undefined; reason: CallTermErrorReason; detail?: Partial<CallTermErrorInfo> }[] = [
    { name: 'unregistered', f: undefined, reason: 'not_registered' },
    {
      name: 'typed int',
      f: callterm(['int'], () => (ran++, true), 'bool'),
      reason: 'argument_type_mismatch',
      detail: { argumentIndex: 0, expectedType: 'int', actualType: 'unbound' }
    },
    {
      name: 'typed any',
      f: callterm(['any'], () => (ran++, true), 'bool'),
      reason: 'argument_conversion_failed',
      detail: { argumentIndex: 0, expectedTypeName: 'HTNAtom', actualType: 'unbound' }
    },
    {
      name: 'raw with an any slot',
      f: withSignature([undefined], () => (ran++, bool(true))),
      reason: 'argument_type_mismatch',
      detail: { argumentIndex: 0, actualType: 'unbound' }
    },
    { name: 'raw', f: () => (ran++, bool(true)), reason: 'argument_type_mismatch', detail: { argumentIndex: 0, actualType: 'unbound' } }
  ]
  for (const c of cases) {
    const callterms: CallTermRegistry = c.f === undefined ? { g: () => bool(true) } : { f: c.f, g: () => bool(true) }
    for (const entry of ['cond', 'assign', 'nested', 'task']) {
      const r = reports()
      const diagnostics: RuntimeDiagnostic[] = []
      const result = decompose(domain, new WorldState(), entry, [], {
        callterms,
        calltermErrorPolicy: 'report',
        onDiagnostic: d => (diagnostics.push(d), r.sink(d))
      })
      const what = `${c.name} / ${entry}`
      assert.deepEqual(result.plan.map(formatStep), ['!ok'], what)
      assert.equal(r.all.length, 1, what)
      assert.equal(r.last.name, 'f', what)
      assert.equal(r.last.reason, c.reason, what)
      for (const [k, v] of Object.entries(c.detail ?? {})) assert.deepEqual(r.last[k as keyof CallTermErrorInfo], v, `${what}: ${k}`)
      assert.ok(!diagnostics.some(d => d.code === 'unbound_read'), `${what}: no unbound_read`)
    }
  }
  assert.equal(ran, 0, 'no function runs with an unbound argument')
  // A runtime list element must be bound: f is not invoked, the read is reported (upstream last_error).
  const calls: string[] = []
  const r = reports()
  const diagnostics: RuntimeDiagnostic[] = []
  const result = decompose(domain, new WorldState(), 'in_list', [], {
    callterms: { f: () => (calls.push('f'), bool(true)) },
    calltermErrorPolicy: 'report',
    onDiagnostic: d => (diagnostics.push(d), r.sink(d))
  })
  assert.deepEqual(result.plan.map(formatStep), ['!ok'])
  assert.deepEqual(calls, [])
  assert.equal(r.all.length, 0)
  assert.ok(diagnostics.some(d => d.code === 'unbound_read'))
  // Bound, the same calls run normally.
  const w = new WorldState()
  w.add('v', int(3))
  assert.deepEqual(
    decompose(domain, w, 'task', [], { callterms: { f: callterm(['int'], n => n + 1, 'int') }, calltermErrorPolicy: 'report' }).plan.map(formatStep),
    ['!t 4']
  )
})

// ---- AIHtnListDaemon --------------------------------------------------------------------------------------------

test('list callterms: upstream AIHtnListDaemon semantics (AIHtnListDaemon.cpp:17-53)', () => {
  const r = reports()
  const options = { callterms: listCallterms, calltermErrorPolicy: 'report' as const, onDiagnostic: r.sink }
  const abc = list(sym('a'), sym('b'), sym('c'))
  const call = (name: string, ...args: Atom[]) => invokeCallterm(name, args, options)
  assert.deepEqual(call('list_add', abc, int(1)), list(sym('a'), sym('b'), sym('c'), int(1)))
  assert.deepEqual(call('list_add', list(), list()), list(list()))
  assert.deepEqual(call('list_remove_at', abc, int(1)), list(sym('a'), sym('c')))
  assert.equal(call('list_remove_at', abc, int(3)), undefined)
  assert.equal(call('list_remove_at', abc, int(-1)), undefined)
  assert.deepEqual(call('list_get', abc, int(2)), sym('c'))
  assert.equal(call('list_get', abc, int(3)), undefined)
  assert.equal(call('list_get', abc, int(-1)), undefined)
  assert.deepEqual(call('list_size', abc), int(3))
  assert.deepEqual(call('list_clear', abc), list())
  assert.deepEqual(abc, list(sym('a'), sym('b'), sym('c')), 'the input list is not changed')
  assert.equal(r.all.length, 0, 'out of range is an ordinary failure')
  assert.equal(call('list_get', abc, float(1)), undefined)
  assert.equal(call('list_size', sym('a')), undefined)
  assert.equal(call('list_add', abc), undefined)
  assert.deepEqual(r.all.map(d => d.calltermError?.reason), ['argument_type_mismatch', 'argument_type_mismatch', 'argument_count_mismatch'])
  assert.deepEqual(listCallterms.list_add.signature, ['list', undefined])
})
