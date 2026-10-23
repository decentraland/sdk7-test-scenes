// Upstream docs/USE_CASES.md:123-126: "Treat conversion failure, a missing callterm, no valid plan and successful
// empty output as distinct situations in diagnostics." Each situation, as a PlanRunner reports it (status, plan,
// diagnostics) and as GuardAgent shows it (lastPlanStatus, replan events). Upstream's policy for callterm errors:
// docs/MISSING_CALLTERMS.md:47-64 (Unset / FailSilently / Report, once per failed invocation) and 66-92 (reasons).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bool, int } from '../../../src/htn-planner/htn/atom'
import type { DomainIR } from '../../../src/htn-planner/htn/ir'
import { callterm } from '../../../src/htn-planner/htn/callterms'
import { PlanRunner, type CallTerm, type PlannerOptions, type RuntimeDiagnostic } from '../../../src/htn-planner/htn/planner'
import { WorldState } from '../../../src/htn-planner/htn/world-state'
import { instant, type ActionRegistry, type GuardEvent } from '../../../src/htn-planner/npc/actions'
import { GuardAgent } from '../../../src/htn-planner/npc/agent'
import { CLEAR_LINE_OF_SIGHT } from '../../../src/htn-planner/npc/perception'
import { v3 } from '../../../src/htn-planner/npc/vec'
import { compileDomainSource } from '../../../tools/htn/compiler'
import { formatStep, warnings } from './util'

const OUTCOMES = `
(:domain Outcomes top_level_domain
    (:method (missing_with_fallback) top_level_method
        (use (and (call not_registered 1)) ((!act)))
        (fallback () ((!idle))))
    (:method (missing) top_level_method
        (use (and (call not_registered 1)) ((!act))))
    (:method (missing_in_argument) top_level_method
        (use () ((!act (call not_registered 1)))))
    (:method (missing_per_row) top_level_method
        (use (and (item ?x) (call not_registered ?x)) ((!act ?x))))
    (:method (no_plan) top_level_method
        (use (and (ready)) ((!act))))
    (:method (callterm_says_no) top_level_method
        (use (and (call says_no)) ((!act))))
    (:method (conversion_failed) top_level_method
        (use (and (= ?v (call cannot_convert 1))) ((!act ?v))))
    (:method (empty) top_level_method
        (nothing_to_do () ()))
    (:method (throws) top_level_method
        (use (and (call throws)) ((!act))))
    (:method (unknown_primitive) top_level_method
        (use () ((!mystery))))
    (:method (unreachable) top_level_method
        (never (and (ready) (call only_here)) ((!act)))
        (fallback () ((!idle)))))
`

function compile(): DomainIR {
  const r = compileDomainSource('Outcomes.domain', OUTCOMES)
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
  return r.ir
}
const DOMAIN = compile()

const CALLTERMS: Record<string, CallTerm> = {
  says_no: () => bool(false),
  // A typed binding that takes a string; the domain passes an int.
  cannot_convert: callterm(['str'], text => text.length, 'int'),
  throws: () => {
    throw new Error('host bug')
  },
  only_here: () => bool(true)
}

// The policy upstream's demo host uses (AIHTNDemoWandererAgent.cpp:136): Report, with a sink.
const REPORT: PlannerOptions = { callterms: CALLTERMS, calltermErrorPolicy: 'report' }

function outcome(method: string, world = new WorldState()) {
  const diagnostics: RuntimeDiagnostic[] = []
  const runner = new PlanRunner(DOMAIN, world, { ...REPORT, onDiagnostic: d => diagnostics.push(d) })
  const created = diagnostics.map(d => d.code)
  diagnostics.length = 0
  const status = runner.plan(method)
  return { status, plan: runner.steps.map(formatStep), codes: diagnostics.map(d => d.code), created, diagnostics }
}

test('outcomes: every PlanRunner reports each call site of a callterm nobody registered, when created', () => {
  const o = outcome('empty')
  // not_registered is called at four places (ValidateGeneratedCallTerms: one report per call site).
  assert.deepEqual(o.created, Array(4).fill('unregistered_callterm'))
})

test('outcomes: a missing callterm with a fallback branch is a successful plan; only the diagnostic tells', () => {
  const o = outcome('missing_with_fallback')
  assert.equal(o.status, 'succeeded')
  assert.deepEqual(o.plan, ['!idle'])
  assert.deepEqual(o.codes, ['missing_callterm'])
  assert.ok(o.diagnostics[0].source && o.diagnostics[0].source.line > 0, 'with its source position')
})

test('outcomes: a missing callterm without one is no_plan plus missing_callterm; plain no_plan has no diagnostic', () => {
  const missing = outcome('missing')
  assert.deepEqual([missing.status, missing.plan, missing.codes], ['no_plan', [], ['missing_callterm']])
  const none = outcome('no_plan')
  assert.equal(none.status, 'no_plan')
  assert.deepEqual(none.codes, [])
})

test('outcomes: a missing callterm in a task argument fails that task attempt (MISSING_CALLTERMS.md:62-64)', () => {
  const o = outcome('missing_in_argument')
  assert.equal(o.status, 'no_plan')
  assert.deepEqual(o.plan, [])
  assert.deepEqual(o.codes, ['missing_callterm'])
})

test('outcomes: reported once per attempted invocation; backtracking over three rows attempts it three times', () => {
  const world = new WorldState()
  for (const x of [1, 2, 3]) world.add('item', int(x))
  const o = outcome('missing_per_row', world)
  assert.equal(o.status, 'no_plan')
  assert.deepEqual(o.codes, ['missing_callterm', 'missing_callterm', 'missing_callterm'])
})

test('outcomes: a call in an unreachable branch is only reported at creation, never as a failed invocation', () => {
  const diagnostics: RuntimeDiagnostic[] = []
  const callterms = { ...CALLTERMS }
  delete (callterms as Record<string, CallTerm | undefined>).only_here
  const runner = new PlanRunner(DOMAIN, new WorldState(), { ...REPORT, callterms, onDiagnostic: d => diagnostics.push(d) })
  assert.deepEqual(diagnostics.map(d => d.callterm), [...Array(4).fill('not_registered'), 'only_here'])
  diagnostics.length = 0
  assert.equal(runner.plan('unreachable'), 'succeeded')
  assert.deepEqual(diagnostics, [], '(ready) fails first: only_here is never attempted')
})

test('outcomes: a successful empty plan is succeeded with no steps; resolve() then says completed', () => {
  const diagnostics: RuntimeDiagnostic[] = []
  const runner = new PlanRunner(DOMAIN, new WorldState(), { ...REPORT, onDiagnostic: d => diagnostics.push(d) })
  diagnostics.length = 0
  assert.equal(runner.plan('empty'), 'succeeded')
  assert.deepEqual(runner.steps, [])
  assert.equal(runner.resolve(), 'completed')
  assert.deepEqual(diagnostics, [])
})

test('outcomes: a callterm returning false is an ordinary failure; a typed binding that cannot read its argument reports', () => {
  // A false / unbound result is "not an invocation error" (MISSING_CALLTERMS.md:60-61); argument and conversion
  // errors go through the policy (:59, :66-72).
  const no = outcome('callterm_says_no')
  const bad = outcome('conversion_failed')
  assert.deepEqual([no.status, no.codes], ['no_plan', []])
  assert.deepEqual([bad.status, bad.codes], ['no_plan', ['callterm_error']])
  const info = bad.diagnostics[0].calltermError
  assert.deepEqual([info?.reason, info?.argumentIndex, info?.expectedType, info?.actualType], ['argument_type_mismatch', 0, 'str', 'int'])
})

test('outcomes: the default policy is unset, as upstream: valid calls run, a callterm error fails the call and warns once', () => {
  // HTNCallTermError.h:82 asserts "Configure the callterm error policy explicitly" in debug builds; release builds
  // fail the call normally. Ours fails it normally and, standing in for the assert, warns once per runner.
  const diagnostics: RuntimeDiagnostic[] = []
  const runner = new PlanRunner(DOMAIN, new WorldState(), { callterms: CALLTERMS, onDiagnostic: d => diagnostics.push(d) })
  diagnostics.length = 0 // the creation checks
  const { result, warned } = warnings(() => [
    runner.plan('callterm_says_no'),
    runner.plan('missing_with_fallback'),
    runner.plan('missing'),
    runner.plan('conversion_failed'),
    runner.plan('empty')
  ])
  assert.deepEqual(result, ['no_plan', 'succeeded', 'no_plan', 'no_plan', 'succeeded'])
  assert.deepEqual(runner.steps, [])
  assert.equal(warned.length, 1, 'one warning per runner')
  assert.match(warned[0], /Configure the callterm error policy explicitly/)
  assert.match(warned[0], /Callterm 'not_registered' is not registered/)
  assert.deepEqual(diagnostics, [], 'unset reports nothing')
})

test('outcomes: fail_silently reports, logs and warns nothing', () => {
  const logged: unknown[] = []
  const log = console.log
  console.log = (...a: unknown[]) => void logged.push(a)
  try {
    const silent = new PlanRunner(DOMAIN, new WorldState(), { callterms: CALLTERMS, calltermErrorPolicy: 'fail_silently' })
    const { result, warned } = warnings(() => [silent.plan('missing_with_fallback'), silent.plan('missing'), silent.plan('conversion_failed')])
    assert.deepEqual(result, ['succeeded', 'no_plan', 'no_plan'])
    assert.deepEqual(warned, [], 'nothing warned')
  } finally {
    console.log = log
  }
  assert.deepEqual(logged, [], 'nothing logged')
})

test('outcomes: a callterm must not throw; if it does, the exception propagates unchanged under every policy', () => {
  // Upstream: "Do not ... throw across the runtime boundary" (MISSING_CALLTERMS.md:108); no catch, no reason for it.
  for (const policy of ['unset', 'fail_silently', 'report'] as const) {
    const diagnostics: RuntimeDiagnostic[] = []
    const runner = new PlanRunner(DOMAIN, new WorldState(), { callterms: CALLTERMS, calltermErrorPolicy: policy, onDiagnostic: d => diagnostics.push(d) })
    diagnostics.length = 0
    const { warned } = warnings(() => assert.throws(() => runner.plan('throws'), (e: unknown) => e instanceof Error && e.message === 'host bug', policy))
    assert.deepEqual([diagnostics, warned], [[], []], policy)
    assert.equal(runner.plan('empty'), 'succeeded', `${policy}: the runner still works afterwards`)
  }
})

// ---- the same situations on GuardAgent -------------------------------------------------------------------------

function agentFor(topLevel: string, ticks: number, dt = 0.1, actions: ActionRegistry = {}) {
  const events: GuardEvent[] = []
  const diagnostics: RuntimeDiagnostic[] = []
  const agent = new GuardAgent({
    id: 'npc',
    planner: world => new PlanRunner(DOMAIN, world, { ...REPORT, onDiagnostic: d => diagnostics.push(d) }),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    topLevel,
    actions: { '!act': () => instant(() => 'done'), '!idle': () => instant(() => 'done'), ...actions },
    onEvent: e => events.push(e)
  })
  for (let i = 0; i < ticks; i++) agent.tick(dt, [])
  const replans = events.filter((e): e is Extract<GuardEvent, { type: 'replan' }> => e.type === 'replan')
  return { agent, events, replans, diagnostics: diagnostics.map(d => d.code) }
}

test('outcomes on GuardAgent: the three situations by lastPlanStatus, replan events and the factory diagnostics', () => {
  const missing = agentFor('missing_with_fallback', 1)
  assert.equal(missing.agent.lastPlanStatus, 'succeeded')
  assert.deepEqual(missing.replans[0].plan, ['!idle'])
  assert.deepEqual(missing.diagnostics.slice(3, 5), ['unregistered_callterm', 'missing_callterm'], 'only the runner sink knows')

  const none = agentFor('no_plan', 7)
  assert.equal(none.agent.lastPlanStatus, 'no_plan')
  assert.deepEqual(none.replans.map(r => r.reason), ['start', ...Array(6).fill('retry after no_plan')], 'retried on every tick (H7)')

  const empty = agentFor('empty', 1)
  assert.equal(empty.agent.lastPlanStatus, 'succeeded')
  assert.deepEqual(empty.replans[0].plan, [])
  assert.equal(empty.replans[0].passes, 4, 'planned again at once, up to maxPlanningPasses')
  assert.deepEqual(empty.diagnostics, Array(4).fill('unregistered_callterm'))
})

test('outcomes on GuardAgent (H11): a primitive with no executor runs as a 0.05 s no-op, with one diagnostic', () => {
  // Upstream's demo host runs an unknown primitive as a 0.05 s no-op (AIHTNDemoWandererAgent.cpp:415-416); ours also
  // says so, once per primitive per agent.
  const o = agentFor('unknown_primitive', 30, 1 / 60)
  const steps = o.events.filter(e => e.type === 'step')
  const done = o.events.filter(e => e.type === 'step_end' && e.status === 'done')
  assert.ok(steps.length >= 9 && steps.length <= 10, `0.5 s of 0.05 s no-ops: ${steps.length}`)
  assert.ok(done.length >= steps.length - 1, 'each one completes')
  assert.ok(o.replans.slice(1).every(r => r.reason === 'plan completed'), 'no failure, no replan storm')
  assert.equal(o.agent.metrics.plansMade, o.replans.length)
  assert.equal(o.agent.lastPlanStatus, 'succeeded')
  const said = o.events.filter(e => e.type === 'diagnostic')
  assert.deepEqual(said, [
    { type: 'diagnostic', guard: 'npc', code: 'no_executor', message: 'no executor for !mystery: runs as a 0.05 s no-op' }
  ], 'said once, not per step')
  assert.deepEqual(o.diagnostics, Array(4).fill('unregistered_callterm'), 'the runner sink sees nothing new')
})

test('outcomes on GuardAgent (H11): an executor that rejects its arguments is a no-op too, reported once per primitive', () => {
  const o = agentFor('unknown_primitive', 30, 1 / 60, { '!mystery': () => null })
  const said = o.events.filter(e => e.type === 'diagnostic')
  assert.deepEqual(said.map(e => e.type === 'diagnostic' && e.message), ['the !mystery executor rejected !mystery: runs as a 0.05 s no-op'])
  assert.ok(o.events.filter(e => e.type === 'step_end' && e.status === 'done').length >= 8)
})
