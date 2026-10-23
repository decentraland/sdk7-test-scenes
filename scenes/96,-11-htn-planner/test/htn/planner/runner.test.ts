import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bool, float, int, list, sym, type Atom } from '../../../src/htn-planner/htn/atom'
import { checkFacts, decompose, decomposeDeferred, missingCallterms, PlanRunner, type PlanStep, type RuntimeDiagnostic } from '../../../src/htn-planner/htn/planner'
import { addFacts, WorldState } from '../../../src/htn-planner/htn/world-state'
import { CALLTERM_SETS, type HostContext } from '../../../src/examples/upstream/conformance-callterms'
import { complexScenarioDomain } from '../../../src/examples/upstream/generated/complex_scenario.htn'
import { complexScenarioRecursive100Facts } from '../../../src/examples/upstream/generated/complex_scenario_recursive_100.facts'
import { fixture, parseDomain } from './domain-text'
import { formatStep, run } from './util'
import { compileDomainSource } from '../../../tools/htn/compiler'

/** A domain compiled by tools/htn, with source positions (parseDomain has none). */
function compiled(text: string) {
  const r = compileDomainSource('Calls.domain', text)
  assert.ok(r.ok, r.diagnostics.map(x => x.message).join('\n'))
  return r.ir
}

// Wanderer.domain without its movement include: same `run` shape and the same deferred
// `talk_about_destination` (Domains/Wanderer.domain), driven like HTNDecompositionTest.cpp:170
// RunDeferredWorldStateTest.
const wanderer = parseDomain(`
(:domain Wanderer top_level_domain
  (:method (run) top_level_method
    (branch_walking
      (and (wanderer_state walking) (wanderer_location ?from_location) (wanderer_destination ?to_location))
      ((move_to ?from_location ?to_location) (&talk_about_destination) (!after_destination_comment)))
    (branch_fallback () ((!wanderer_idle))))
  (:method (move_to ?inp_from ?inp_to)
    (walk () ((!walk_segment ?inp_to))))
  (:method (talk_about_destination)
    (branch_both_even (and (wanderer_location ?location) (call both_coordinates_even ?location))
      ((!say "Both coordinates are even!")))
    (branch_both_odd (and (wanderer_location ?location) (call both_coordinates_odd ?location))
      ((!say "Both coordinates are odd!")))
    (branch_mixed (and (wanderer_location ?location))
      ((!say "One coordinate is even and the other is odd!"))))
)`)

const cell = (x: number, y: number) => list(int(x), int(y))
const coords = (a: Atom): [number, number] | undefined =>
  a.t === 'list' && a.v.length === 2 && a.v[0].t === 'int' && a.v[1].t === 'int' ? [a.v[0].v, a.v[1].v] : undefined
const wandererCallterms = {
  both_coordinates_even: (a: readonly Atom[]) => {
    const c = coords(a[0])
    return bool(c !== undefined && c[0] % 2 === 0 && c[1] % 2 === 0)
  },
  both_coordinates_odd: (a: readonly Atom[]) => {
    const c = coords(a[0])
    return bool(c !== undefined && c[0] % 2 !== 0 && c[1] % 2 !== 0)
  }
}

test('PlanRunner: deferred steps observe the world as it is when reached (GeneratedUsesFreshWorldStateAndRecoversAfterResolutionFailure)', () => {
  const world = new WorldState()
  world.add('wanderer_state', sym('walking'))
  world.set('wanderer_location', cell(0, 0))
  world.add('wanderer_destination', cell(15, 0))
  const runner = new PlanRunner(wanderer, world, { callterms: wandererCallterms, defaultTopLevel: 'run' })

  // Deferred targets are not public entry points.
  assert.equal(runner.plan('talk_about_destination'), 'invalid_call')
  assert.equal(runner.steps.length, 0)

  assert.equal(runner.plan(), 'succeeded')
  assert.deepEqual(runner.steps.map(formatStep), ['!walk_segment (15 0)', '&talk_about_destination', '!after_destination_comment'])
  assert.equal(runner.resolve(), 'ready')
  assert.equal(runner.current()?.name, '!walk_segment')

  // With no current location the deferred decomposition fails and clears the plan.
  runner.complete()
  world.clear('wanderer_location', 1)
  assert.equal(runner.resolve(), 'failed')
  assert.equal(runner.steps.length, 0)
  assert.equal(runner.current(), null)

  // The runner is reusable after a failure.
  world.set('wanderer_location', cell(0, 0))
  assert.equal(runner.plan(), 'succeeded')
  assert.equal(runner.resolve(), 'ready')
  runner.complete()
  world.set('wanderer_location', cell(2, 2)) // the host moved the wanderer
  assert.equal(runner.resolve(), 'ready')
  assert.equal(formatStep(runner.current() as PlanStep), '!say "Both coordinates are even!"')
  assert.deepEqual(runner.steps.map(formatStep), ['!say "Both coordinates are even!"', '!after_destination_comment'])
  runner.complete()
  assert.equal(runner.resolve(), 'ready')
  assert.equal(runner.current()?.name, '!after_destination_comment')
  runner.complete()
  assert.equal(runner.resolve(), 'completed')
  assert.equal(runner.current(), null)
  runner.complete() // no-op without a current primitive
  assert.equal(runner.resolve(), 'completed')
})

test('deferred arguments are captured when the step is created; the body runs on expansion (HTNRuntimeListTest.cpp:189)', () => {
  const d = parseDomain(fixture('Domains/Test/runtime_lists.domain'))
  let time = 10
  let calls = 0
  const options = { callterms: { get_time: () => (calls++, int(time)) } }
  const world = new WorldState()
  const r = decompose(d, world, 'deferred', [int(7)], options)
  assert.equal(r.status, 'succeeded')
  assert.equal(calls, 1)
  const step = r.plan[0]
  assert.equal(step.kind, 'deferred')
  if (step.kind !== 'deferred') return
  assert.equal(step.name, '&later')
  assert.equal(d.methods[step.method].name, 'later')
  time = 20
  const later = decomposeDeferred(d, world, step, options)
  assert.deepEqual(later.plan.map(formatStep), ['!result (captured (snapshot 7 10) 20)'])
  assert.equal(calls, 2)
  // Not restricted to top-level methods, but the arity must match.
  assert.equal(decomposeDeferred(d, world, { ...step, args: [] }, options).status, 'invalid_call')
  assert.equal(decomposeDeferred(d, world, { ...step, method: 999 }, options).status, 'invalid_call')
})

test('deferred standalone call reports at execution, not when planned (DeferredCallsReportAtExecutionWithTheirOwnSource)', () => {
  const d = parseDomain(fixture('Domains/Test/boolean_callterms.domain'))
  let calls = 0
  let value: Atom = int(1)
  const diagnostics: string[] = []
  const runner = new PlanRunner(d, new WorldState(), {
    callterms: { ppr_finalize_best: () => (calls++, value) },
    calltermErrorPolicy: 'report',
    onDiagnostic: x => diagnostics.push(x.code)
  })
  diagnostics.length = 0 // the creation check lists the domain's other callterms
  assert.equal(runner.plan('deferred'), 'succeeded')
  assert.equal(calls, 0)
  assert.equal(runner.resolve(), 'failed')
  assert.equal(calls, 1)
  assert.deepEqual(diagnostics, ['non_boolean_condition_result'])
  value = bool(true)
  assert.equal(runner.plan('deferred'), 'succeeded')
  assert.equal(runner.resolve(), 'ready')
  assert.equal(runner.current()?.name, '!result')
})

test('PlanRunner expands nested and empty deferred steps in place', () => {
  const d = parseDomain(`
(:domain Nest top_level_domain
  (:method (root) top_level_method (b () ((!a) (&outer 1) (!z))))
  (:method (outer ?inp_n) (b () ((&empty) (!b ?inp_n) (&inner (++ ?inp_n)))))
  (:method (inner ?inp_n) (b () ((!c ?inp_n))))
  (:method (empty) (b () ()))
)`)
  const runner = new PlanRunner(d, new WorldState())
  assert.equal(runner.plan('root'), 'succeeded')
  const seen: string[] = []
  while (runner.resolve() === 'ready') {
    seen.push(formatStep(runner.current() as PlanStep))
    runner.complete()
  }
  assert.deepEqual(seen, ['!a', '!b 1', '!c 2', '!z'])
  assert.equal(runner.resolve(), 'completed')
  // A failed plan() clears any active plan.
  assert.equal(runner.plan('root'), 'succeeded')
  assert.equal(runner.plan('nope'), 'invalid_call')
  assert.equal(runner.steps.length, 0)
  runner.plan('root')
  runner.clear()
  assert.equal(runner.resolve(), 'completed')
})

test('invalid_call: unknown, non-top-level, wrong arity, no default (HTNMethodOverloadTest / GeneratedRejectsInvalidTopLevelCall)', () => {
  const d = parseDomain(`
(:domain Calls top_level_domain
  (:method (run) top_level_method (b () ((!zero))))
  (:method (run ?inp_x) top_level_method (b () ((!one ?inp_x))))
  (:method (hidden) (b () ((!hidden))))
  (:method (toString) (b () ((!proto))))
)`)
  const w = new WorldState()
  assert.deepEqual(run(d, w, 'run').plan, ['!zero'])
  assert.deepEqual(run(d, w, 'run', [int(42)]).plan, ['!one 42'])
  assert.equal(run(d, w, 'run', [int(1), int(2)]).status, 'invalid_call')
  assert.equal(run(d, w, 'hidden').status, 'invalid_call')
  assert.equal(run(d, w, 'missing').status, 'invalid_call')
  assert.equal(run(d, w, 'toString').status, 'invalid_call')
  assert.equal(run(d, w, 'constructor').status, 'invalid_call')
  assert.equal(new PlanRunner(d, w).plan(), 'invalid_call') // no defaultTopLevel
})

// HTNPlanningUnit takes its default top-level method from the host (HTNPlanningUnit.h:46, constructor argument);
// DecomposeTopLevelMethod() with no name decomposes it with no arguments (HTNPlanningUnit.cpp:255).
test('PlanRunner: the default top-level method comes from the host, like the HTNPlanningUnit constructor', () => {
  const d = parseDomain(`
(:domain Calls top_level_domain
  (:method (run) top_level_method (b () ((!zero))))
  (:method (run ?inp_x) top_level_method (b () ((!one ?inp_x))))
  (:method (hidden) (b () ((!hidden))))
)`)
  const w = new WorldState()
  const runner = new PlanRunner(d, w, { defaultTopLevel: 'run' })
  assert.equal(runner.plan(), 'succeeded')
  assert.deepEqual(runner.steps.map(formatStep), ['!zero'])
  assert.equal(runner.plan(undefined, [int(5)]), 'succeeded')
  assert.deepEqual(runner.steps.map(formatStep), ['!one 5'])
  assert.equal(new PlanRunner(d, w, { defaultTopLevel: 'hidden' }).plan(), 'invalid_call')
})

// HTNCallTermRegistry::ValidateGeneratedCallTerms (HTNCallTermRegistry.cpp:86) checks every callterm the domain
// requires before planning, without invoking any (HTNMissingCallTermTest.cpp:305). A PlanRunner does it once when
// created, one diagnostic per missing name at its first call site.
test('PlanRunner reports every unbound call site when created (ValidateGeneratedCallTerms)', () => {
  const d = compiled(`
(:domain Calls top_level_domain
  (:method (run) top_level_method
    (b (and (call ready) (= ?x (call pick 1))) ((!use ?x (call fmt ?x))))
    (f () ((!idle (call pick 2)))))
)`)
  const seen: RuntimeDiagnostic[] = []
  let calls = 0
  const runner = new PlanRunner(d, new WorldState(), {
    callterms: { ready: () => (calls++, bool(true)) },
    calltermErrorPolicy: 'report',
    onDiagnostic: x => seen.push(x)
  })
  // One report per call site, in source order: pick is called at two places (MISSING_CALLTERMS.md:188-190).
  assert.deepEqual(seen.map(x => [x.code, x.callterm, x.calltermError?.reason, x.source?.line, x.source?.col]), [
    ['unregistered_callterm', 'pick', 'not_registered', 4, 32],
    ['unregistered_callterm', 'fmt', 'not_registered', 4, 58],
    ['unregistered_callterm', 'pick', 'not_registered', 5, 19]
  ])
  assert.match(seen[0].message, /^Callterm 'pick' is not registered at .*:4:32 \(domain 'Calls' calls it\)$/)
  assert.deepEqual(seen[2].calltermError?.site, { kind: 'method', domain: 'Calls', method: 'run', branch: 'f' })
  assert.equal(calls, 0)
  assert.deepEqual(missingCallterms(d, { ready: () => bool(true) }), ['pick', 'fmt'])
  assert.deepEqual(missingCallterms(d, { ready: () => bool(true), pick: () => int(1), fmt: () => int(1) }), [])
  seen.length = 0
  assert.equal(runner.plan('run'), 'no_plan')
  // The calls themselves still report, each at its own site.
  assert.deepEqual(seen.map(x => [x.code, x.callterm, x.source?.line]), [['missing_callterm', 'pick', 4], ['missing_callterm', 'pick', 5]])
})

// Upstream 2.4.0: WriteFact rejects a fact whose name the domain does not reference (HTNWorldState.h:308, the
// registry holds fact names, HTNFactRegistry.h) and, in instrumented builds, keeps the row for
// GetUnregisteredFacts (RELEASE_2_4_0.md). Hosts here write such facts on purpose, so nothing is rejected:
// checkFacts lists them, and a PlanRunner warns once about a name the domain reads with another arity.
test('fact schema check: unregistered facts are listed, a wrong arity is reported once per table', () => {
  const d = parseDomain(`
(:domain Facts top_level_domain
  (:method (run) top_level_method
    (b (and (target ?t) (range ?t ?r)) ((!aim ?t ?r)))
    (f () ((!idle))))
)`)
  const w = new WorldState()
  w.add('target', sym('a'))
  w.add('range', sym('a'), int(3))
  w.add('bookkeeping', int(1)) // the host's own fact: stored, read back by host code
  w.add('target', sym('a'), int(2)) // typo: two arguments
  w.add('range', sym('a'))
  w.removeWhere('range', 1, () => true) // an emptied table lists nothing
  assert.deepEqual(checkFacts(d, w), { unregistered: ['bookkeeping/1'], wrongArity: ['target/2'] })
  assert.equal(w.rows('bookkeeping', 1).length, 1)
  const seen: RuntimeDiagnostic[] = []
  const runner = new PlanRunner(d, w, { onDiagnostic: x => seen.push(x) })
  assert.equal(runner.plan('run'), 'succeeded')
  assert.deepEqual(seen.map(x => [x.code, x.message]), [
    ['fact_arity_mismatch', "Fact 'target/2' is in the world state, but domain 'Facts' reads 'target' only as target/1"]
  ])
  runner.plan('run')
  assert.equal(seen.length, 1)
  w.add('range', sym('a'), int(3), int(4))
  runner.plan('run')
  assert.deepEqual(seen.map(x => x.message.slice(0, 19)), ["Fact 'target/2' is ", "Fact 'range/3' is i"])
})

const recursion = parseDomain(fixture('Domains/Test/recursion_dispatch.domain'))

function depthWorld(n: number): WorldState {
  const w = new WorldState()
  w.add('depth', int(n))
  return w
}

test('recursion_dispatch: non-tail and mutual recursion (NonTailAndMutualRecursionPreservePendingArguments)', () => {
  for (const n of [2, 100, 1000]) {
    for (const entry of ['non_tail', 'mutual']) {
      const r = run(recursion, depthWorld(n), entry, []) // default call-frame capacity
      const expected: string[] = []
      if (entry === 'non_tail') for (let i = n; i > 0; i--) expected.push(`!before ${i}`)
      expected.push('!leaf')
      for (let i = 1; i <= n; i++) expected.push(entry === 'non_tail' ? `!after ${i}` : `${i % 2 ? '!odd' : '!even'} ${i}`)
      assert.deepEqual(r.plan, expected, `${entry} ${n}`)
    }
  }
})

/** The smallest maxDepth that plans: upstream's peak_call_frames for that decomposition. */
function peakFrames(attempt: (maxDepth: number) => string): number {
  let lo = 1
  let hi = 1 << 16
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (attempt(mid) === 'succeeded') hi = mid
    else lo = mid + 1
  }
  return lo
}

// Upstream default capacity 8192 (GENERATED_RECURSION.md:88). CapacityFailureLeavesStorageReusable
// (HTNGeneratedEquivalenceTest.cpp:3165): depth 5000 exceeds it, the same unit plans depth 2 afterwards.
test('depth limit: exceeding maxDepth returns depth_exceeded with an empty plan, then recovers', () => {
  const world = depthWorld(5000)
  const runner = new PlanRunner(recursion, world)
  assert.equal(runner.plan('non_tail'), 'depth_exceeded')
  assert.equal(runner.steps.length, 0)
  world.set('depth', int(2))
  assert.equal(runner.plan('non_tail'), 'succeeded')
  assert.deepEqual(runner.steps.map(formatStep), ['!before 2', '!before 1', '!leaf', '!after 1', '!after 2'])
  // CoreReportsCapacityAndResetsDiagnosticsOnReuse (:3243): depth 2 peaks below 16 frames.
  assert.ok(peakFrames(maxDepth => run(recursion, depthWorld(2), 'non_tail', [], { maxDepth }).status) < 16)
  // depth_exceeded is not a branch failure: no fallback branch is tried.
  assert.equal(run(recursion, depthWorld(5000), 'deep_failure', [], { callterms: { visit: () => bool(true) } }).status, 'depth_exceeded')
})

// Upstream frames (HTNCCodeGenerator.cpp:2744 _RUN): the entry method is one frame; every task, primitive or
// compound, runs in a frame of its own (:3213 `return 2`), and a compound task pushes its method's frame on top
// (:3056). A method in its last branch keeps popping pending tasks down to 0 (:3206-3209), so it stays below its
// ancestors' later tasks until the decomposition ends; a method with a next branch pops when its own tasks are done.
test('depth counts upstream call frames: two per method level, one per running task, last branches stay', () => {
  // non_tail n: non_tail + (task + method) per descend level, n + 1 levels, then a task frame: 2n + 4.
  assert.equal(peakFrames(maxDepth => run(recursion, depthWorld(10), 'non_tail', [], { maxDepth }).status), 24)
  const d = parseDomain(`
(:domain Frames top_level_domain
  (:method (stays) top_level_method (b () ((one) (one) (one))))
  (:method (pops) top_level_method (b () ((two) (two) (two))))
  (:method (one) (only () ((!a))))
  (:method (two) (first () ((!b))) (second () ((!c))))
  (:method (axioms) top_level_method (b (and (#a1 ?x)) ((!got ?x))))
  (:axiom (a1 ?out_x) (and (#a2 ?out_x)))
  (:axiom (a2 ?out_x) (and (#a3 ?out_x)))
  (:axiom (a3 ?out_x) (and (= ?out_x 3)))
)`)
  const w = new WorldState()
  const peak = (method: string) => peakFrames(maxDepth => run(d, w, method, [], { maxDepth }).status)
  // `one` has a single branch: each call stays and the next one runs on top of it (1 + 2 + 2 + 2 + 1).
  assert.equal(peak('stays'), 8)
  // `two` can retry its next branch: it pops after its task (1 + 2 + 1).
  assert.equal(peak('pops'), 4)
  // Conditions run inside the method frame: axiom nesting does not count.
  assert.equal(peak('axioms'), 2)
})

// GENERATED_RECURSION.md "Measured fixed-array results": 243 peak frames for complex_scenario_recursive_100,
// 3843 with 900 idle entities added (HTNGeneratedEquivalenceTest.cpp:3027 CheckGeneratedRecursiveEntityCount).
test('complex_scenario recursion over 100 and 1000 entities peaks at upstream frame counts and plans with defaults', () => {
  const world = new WorldState()
  addFacts(world, complexScenarioRecursive100Facts)
  const host: HostContext = { world, vars: {}, trace: [], counters: {}, errors: [] }
  const o = { callterms: CALLTERM_SETS['test-counting-inc'], context: host }
  const attempt = (maxDepth?: number) => decompose(complexScenarioDomain, world, 'run_scenario', [], { ...o, maxDepth })
  assert.equal(attempt().status, 'succeeded')
  assert.equal(peakFrames(maxDepth => attempt(maxDepth).status), 243)
  world.clear('entity_count', 1)
  world.add('entity_count', int(1000))
  for (let i = 100; i < 1000; i++) {
    world.add('entity', int(i), int(100000 + i))
    world.add('health_value', int(100000 + i), int(50))
    world.add('speed_value', int(100000 + i), float(1))
  }
  host.counters = {}
  assert.equal(attempt().status, 'succeeded')
  assert.equal(host.counters.Increments, 1000)
  assert.equal(peakFrames(maxDepth => attempt(maxDepth).status), 3843)
})

test('deep recursion uses explicit frames, not the JS stack', () => {
  const r = run(recursion, depthWorld(20000), 'non_tail', [], { maxDepth: 100000 })
  assert.equal(r.status, 'succeeded')
  assert.equal(r.plan.length, 40001)
})

test('deep failure restores the plan without replaying callterms (DeepFailureRestoresPlanWithoutReplayingCallTerms)', () => {
  let visits = 0
  const r = run(recursion, depthWorld(1000), 'deep_failure', [], { callterms: { visit: () => (visits++, bool(true)) } })
  assert.deepEqual(r.plan, ['!fallback "retained string"'])
  assert.equal(visits, 1001)
})

test('independent runners do not share state', () => {
  const a = new PlanRunner(wanderer, new WorldState(), { callterms: wandererCallterms, defaultTopLevel: 'run' })
  const wb = new WorldState()
  wb.add('wanderer_state', sym('walking'))
  wb.add('wanderer_location', cell(1, 1))
  wb.add('wanderer_destination', cell(3, 3))
  const b = new PlanRunner(wanderer, wb, { callterms: wandererCallterms, defaultTopLevel: 'run' })
  assert.equal(a.plan(), 'succeeded')
  assert.equal(b.plan(), 'succeeded')
  b.resolve()
  b.complete()
  assert.equal(a.resolve(), 'ready')
  assert.equal(a.current()?.name, '!wanderer_idle')
  assert.equal(b.resolve(), 'ready')
  assert.equal(formatStep(b.current() as PlanStep), '!say "Both coordinates are odd!"')
})
