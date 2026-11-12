import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bool, int, str, sym, type Atom } from '../../../src/htn-planner/htn/atom'
import { WorldState } from '../../../src/htn-planner/htn/world-state'
import { fixture, parseDomain, parseWorld } from './domain-text'
import { MODES, run, tracer } from './util'

const demo = parseDomain(fixture('Domains/RuntimeBacktrackingDemo.domain'))
const hierarchical = parseDomain(fixture('Domains/Test/hierarchical_backtracking.domain'))
const human = parseDomain(fixture('Domains/Test/human.domain'))
const nested = parseDomain(fixture('Domains/Test/nested_axiom_choices.domain'))

// RuntimeBacktrackingDemo has the same shape as hierarchical_backtracking; its expected heads
// follow HTNGeneratedEquivalenceTest.cpp:568 SupportsIndependentFactAxiomAndBranchFlags.
for (const { name, mode } of MODES) {
  test(`RuntimeBacktrackingDemo under ${name}`, () => {
    const world = parseWorld(fixture('WorldStates/RuntimeBacktrackingDemo.worldstate'))
    const o = { mode }
    assert.deepEqual(run(demo, world, 'demo_fact_alternatives', [], o).plan,
      mode.factsAndAxioms ? ['!fact_alternative_selected second'] : ['!fact_alternative_not_retried'])
    assert.deepEqual(run(demo, world, 'demo_axiom_alternatives', [], o).plan,
      mode.factsAndAxioms ? ['!axiom_alternative_selected second'] : ['!axiom_alternative_not_retried'])
    const branches = run(demo, world, 'demo_hierarchical_branches', [], o)
    assert.equal(branches.status, mode.branches ? 'succeeded' : 'no_plan')
    assert.deepEqual(branches.plan, mode.branches ? ['!branch_backtracking_selected_safe_path'] : [])
    // A failed branch precondition always falls through (HTNBacktrackingMode.h, BRANCHES comment).
    assert.deepEqual(run(demo, world, 'demo_direct_branch_fallback', [], o).plan, ['!direct_precondition_fallback'])
  })

  test(`hierarchical_backtracking under ${name} (HTNGeneratedEquivalenceTest.cpp:635)`, () => {
    const world = parseWorld(fixture('WorldStates/Test/hierarchical_backtracking_no_combat.worldstate'))
    const o = { mode }
    const child = run(hierarchical, world, 'validate_child_guard', [], o)
    assert.equal(child.status, mode.branches ? 'succeeded' : 'no_plan')
    if (mode.branches) assert.deepEqual(child.plan, ['!search enemy'])
    assert.deepEqual(run(hierarchical, world, 'validate_fact_backtracking', [], o).plan,
      mode.factsAndAxioms ? ['!selected_fact second'] : ['!fact_fallback'])
    assert.deepEqual(run(hierarchical, world, 'validate_axiom_backtracking', [], o).plan,
      mode.factsAndAxioms ? ['!selected_axiom second'] : ['!axiom_fallback'])
    // Parent guard: the branch condition fails, so selection falls through in every mode.
    assert.deepEqual(run(hierarchical, world, 'validate_parent_guard', [], o).plan, ['!search enemy'])
  })
}

test('ParentAndChildGuardProduceSameFallbackPlan (HTNGeneratedEquivalenceTest.cpp:542)', () => {
  const world = new WorldState()
  for (const m of ['do_behavior_parent_guard', 'do_behavior_child_guard'])
    assert.deepEqual(run(hierarchical, world, m, [{ t: 'sym', v: 'enemy' }]).plan, ['!search enemy'])
})

const humanCallterms = {
  binded_function_with_args: (a: readonly Atom[]) => bool(a.length === 1 && a[0].t === 'str')
}

test('human.domain: axiom backtracking through `not` picks the first unspoiled fruit', () => {
  const world = parseWorld(fixture('WorldStates/Test/human.worldstate'))
  const r = run(human, world, 'behave', [], { callterms: humanCallterms })
  assert.deepEqual(r.plan, ['!take "apple"', '!peel "apple"', '!eat "apple"'])
  assert.deepEqual(run(human, world, 'behave_upper_body').plan, ['!talk "This fruit is very tasty!"'])
})

test('human.domain with human_axiom_backtracking.worldstate', () => {
  const world = parseWorld(fixture('WorldStates/Test/human_axiom_backtracking.worldstate'))
  const r = run(human, world, 'behave', [], { callterms: humanCallterms })
  // banana has mold; orange is fine, unwrapped and unpeeled: branch_do_nothing (empty task list).
  assert.deepEqual(r.plan, ['!take "orange"', '!eat "orange"'])
  // Without fact/axiom backtracking the first edible fruit (banana) is spoiled: eat_food's first
  // branch fails its precondition and falls through to an empty branch.
  const none = run(human, world, 'behave', [], { callterms: humanCallterms, mode: { factsAndAxioms: false, branches: false } })
  assert.deepEqual(none.plan, [])
  assert.equal(none.status, 'succeeded')
})

function nestedWorld(): WorldState {
  const w = new WorldState()
  w.add('candidate', int(1))
  w.add('candidate', int(2))
  w.add('seed', int(2))
  w.add('first_candidate', int(1))
  w.add('pair_candidate', int(1), int(2))
  w.add('pair_candidate', int(2), int(2))
  w.add('state', int(9))
  w.add('state', int(10))
  w.add('seed_state', int(9))
  w.add('text_candidate', str('first candidate with owned string storage'))
  w.add('text_candidate', str('second candidate with owned string storage'))
  return w
}

test('nested_axiom_choices: NestedChoicesPreserveBindingsAndBacktrack (HTNGeneratedEquivalenceTest.cpp:2884)', () => {
  const world = nestedWorld()
  const cases: [string, string | null][] = [
    ['out_backtrack', '!selected 2'],
    ['out_literal', null],
    ['out_arithmetic', null],
    ['out_bound', null],
    ['out_mismatch', '!fallback'],
    ['out_owned_literal', '!selected 2'],
    ['alt_preserves_bound', '!selected 1'],
    ['alias_outputs', '!selected 2'],
    ['nested_and', '!selected 2'],
    ['alt_choice', '!selected 2'],
    ['or_cut', '!fallback'],
    ['not_scope', '!selected 2'],
    ['io_backtrack', '!selected 2'],
    ['deep_backtrack', '!selected 2'],
    ['first_solution', '!selected 1'],
    ['io_bound', '!selected 2'],
    ['io_mismatch', '!fallback'],
    ['exhausted', '!selected 1'],
    ['internal_filter', '!selected 2'],
    ['pair_backtrack', '!pair 2 10'],
    ['pair_bound', '!pair 2 9'],
    ['two_calls', '!pair 2 2'],
    ['string_backtrack', '!selected "second candidate with owned string storage"'],
    ['out_backtrack', '!selected 2']
  ]
  for (const [entry, expected] of cases) {
    const r = run(nested, world, entry)
    if (expected === null) assert.equal(r.status, 'no_plan', entry)
    else assert.deepEqual(r.plan, [expected], entry)
  }
  const branchesOnly = { mode: { factsAndAxioms: false, branches: true } }
  for (const entry of ['out_literal', 'alt_choice', 'nested_and'])
    assert.equal(run(nested, world, entry, [], branchesOnly).status, 'no_plan', entry)
  world.clear('candidate', 1)
  assert.deepEqual(run(nested, world, 'no_candidates').plan, ['!fallback'])
  world.add('candidate', int(2))
  assert.deepEqual(run(nested, world, 'out_backtrack').plan, ['!selected 2'])
})

test('nested_axiom_choices: BacktrackingResumesWithoutReplayingHostEffects (HTNGeneratedEquivalenceTest.cpp:2976)', () => {
  const world = new WorldState()
  world.add('candidate', int(1))
  world.add('candidate', int(2))
  world.add('first_candidate', int(1))
  const trace: number[] = []
  const callterms = {
    axiom_trace: tracer(trace),
    axiom_value: () => {
      trace.push(42)
      return int(42)
    }
  }
  const cases: [string, number[], string][] = [
    ['effects', [0, 42, 1, 2], '!selected 2'],
    ['effects_exhausted', [0, 42, 1, 2], '!fallback'],
    ['effects_nested', [10, 0, 42, 1, 2], '!selected 2'],
    ['qualified_or', [], '!selected 2'],
    ['effects_alt_exhausted', [1, 2, 10], '!fallback'],
    ['effects', [0, 42, 1, 2], '!selected 2']
  ]
  for (const [entry, expectedTrace, expectedPlan] of cases) {
    trace.length = 0
    assert.deepEqual(run(nested, world, entry, [], { callterms }).plan, [expectedPlan], entry)
    assert.deepEqual(trace, expectedTrace, entry)
  }
})

test('axiom_assignments: AssignmentsInitializeParameterSlotsAndRestoreOutputs (HTNGeneratedEquivalenceTest.cpp:2829)', () => {
  const domain = parseDomain(fixture('Domains/Test/axiom_assignments.domain'))
  const world = new WorldState()
  world.add('entity', int(1))
  world.add('candidate', int(1))
  world.add('candidate', int(2))
  let calls = 0
  const callterms = {
    get_entity_position: (a: readonly Atom[]) => {
      calls++
      assert.deepEqual(a, [int(1)])
      return int(7)
    }
  }
  const cases: [string, number, number][] = [
    ['regression', 7, 1], ['literal', 7, 0], ['arithmetic', 7, 0],
    ['solutions', 2, 0], ['restore_alternative', 2, 0], ['restore_caller', 7, 0],
    ['bound_output', 7, 0], ['literal_output', 7, 0], ['arithmetic_output', 7, 0],
    ['io_unbound', 7, 1], ['io_bound', 7, 0], ['io_nested_bound', 7, 0],
    ['io_nested_unbound', 7, 1], ['nested_forwarding', 7, 0],
    ['io_restore_caller', 7, 2], ['io_solutions', 2, 0],
    ['io_restore_alternative', 2, 0], ['io_alt_retry', 2, 0],
    ['io_exhausted', 7, 1], ['io_bound_different', 9, 0],
    ['io_nested_bound_different', 9, 0], ['io_literal', 7, 0],
    ['io_literal_bound', 9, 0], ['io_arithmetic_bound', 9, 0]
  ]
  for (let repeat = 0; repeat < 2; repeat++)
    for (const [entry, value, expectedCalls] of cases) {
      calls = 0
      assert.deepEqual(run(domain, world, entry, [], { callterms }).plan, [`!result ${value}`], entry)
      assert.equal(calls, expectedCalls, entry)
    }
})

// Upstream method emission (HTNCCodeGenerator.cpp:3141-3270) selects a branch, commits its
// condition (HTNConditionContinuation.inl:233 EmitLoweredCondition `inCommit(); goto success`) and
// runs its tasks; a task failure goes to the method's next branch (BRANCHES, :3231) or fails the
// method. A completed child method is not reopened when a later sibling task fails. (Upstream's
// last-branch frames also consume ancestors' pending tasks, :3206-3209, which in this exact shape
// would retry `child`'s branch `b` and drop `must_hold` from the plan; see src/htn-planner/htn/engine.ts.)
test('a later sibling failure does not reopen an earlier child method or the condition choice', () => {
  const domain = parseDomain(`
(:domain Siblings top_level_domain
  (:method (root) top_level_method
    (first (and (pick ?x)) ((child ?x) (must_hold ?x)))
    (second () ((!root_fallback))))
  (:method (child ?inp_x)
    (a () ((leaf ?inp_x) (!child_a ?inp_x)))
    (b () ((!child_b ?inp_x))))
  (:method (leaf ?inp_x) (only () ((!leaf ?inp_x))))
  (:method (must_hold ?inp_x) (only (and (good ?inp_x)) ((!holds ?inp_x))))
)`)
  const world = new WorldState()
  world.add('pick', int(1))
  world.add('pick', int(2))
  world.add('good', int(2))
  // `pick 1` is committed when branch `first` is selected; must_hold 1 fails; child's branch `b`
  // is not tried; root moves to its next branch.
  assert.deepEqual(run(domain, world, 'root').plan, ['!root_fallback'])
  assert.equal(run(domain, world, 'root', [], { mode: { factsAndAxioms: true, branches: false } }).status, 'no_plan')
})

test('task subtree failure restores the plan and tries the next branch', () => {
  const domain = parseDomain(`
(:domain Restore top_level_domain
  (:method (root) top_level_method
    (first () ((!a) (mid) (!never)))
    (second () ((!b))))
  (:method (mid)
    (m1 () ((!m1) (fails)))
    (m2 () ((!m2) (fails))))
  (:method (fails) (no (and (missing)) ((!x))))
)`)
  assert.deepEqual(run(domain, new WorldState(), 'root').plan, ['!b'])
  assert.equal(run(domain, new WorldState(), 'root', [], { mode: { factsAndAxioms: true, branches: false } }).status, 'no_plan')
})

test('or commits, alt keeps alternatives, not leaks no bindings', () => {
  const domain = parseDomain(`
(:domain Logic top_level_domain
  (:method (with_or) top_level_method
    (b (and (or (p ?x) (q ?x)) (== ?x 3)) ((!got ?x)))
    (f () ((!none))))
  (:method (with_alt) top_level_method
    (b (and (alt (p ?x) (q ?x)) (== ?x 3)) ((!got ?x)))
    (f () ((!none))))
  (:method (with_not) top_level_method
    (b (and (not (p ?x)) (= ?x 9)) ((!got ?x)))
    (c (and (not (r ?x)) (= ?x 8)) ((!got ?x))))
)`)
  const world = new WorldState()
  world.add('p', int(1))
  world.add('p', int(2))
  world.add('q', int(3))
  assert.deepEqual(run(domain, world, 'with_or').plan, ['!none'])
  assert.deepEqual(run(domain, world, 'with_alt').plan, ['!got 3'])
  assert.deepEqual(run(domain, world, 'with_alt', [], { mode: { factsAndAxioms: false, branches: true } }).plan, ['!none'])
  assert.deepEqual(run(domain, world, 'with_not').plan, ['!got 8'])
})

// A fact with no statically unbound variable has one solution: upstream takes the fact choice path
// only when AnalyzeCondition (HTNCCodeGenerator.cpp:236-243) finds a variable argument outside the
// statically bound set (HTNConditionContinuation.inl:192); otherwise EmitDirectDeterministicFact
// (HTNCCodeGenerator.cpp:966) stops at the first matching row, so a later failure in the same
// condition does not rerun the tail once per duplicate row.
test('a fact with no unbound variable gives one solution: duplicate rows do not rerun the tail', () => {
  const domain = parseDomain(`
(:domain Once top_level_domain
  (:method (param ?inp_x) top_level_method
    (b (and (seen ?inp_x) (call probe 1) (missing)) ((!never)))
    (f () ((!fallback))))
  (:method (literal_and_discard) top_level_method
    (b (and (pair on ?any_1) (call probe 2) (missing)) ((!never)))
    (f () ((!fallback))))
  (:method (bound_earlier) top_level_method
    (b (and (item ?i) (owned ?i) (call probe 3) (missing)) ((!never)))
    (f () ((!fallback))))
  (:method (bound_by_every_or_child) top_level_method
    (b (and (or (p ?x) (q ?x)) (owned ?x) (call probe 4) (missing)) ((!never)))
    (f () ((!fallback))))
  (:method (unbound) top_level_method
    (b (and (owned ?i) (call probe 5) (missing)) ((!never)))
    (f () ((!fallback))))
  (:method (bound_by_one_or_child) top_level_method
    (b (and (or (p ?x) (q ?y)) (owned ?x) (call probe 6) (missing)) ((!never)))
    (f () ((!fallback))))
  (:method (axiom_inp) top_level_method
    (b (and (#inp a)) ((!never)))
    (f () ((!fallback))))
  (:method (axiom_io) top_level_method
    (b (and (#io a)) ((!never)))
    (f () ((!fallback))))
  (:axiom (inp ?inp_x) (and (owned ?inp_x) (call probe 7) (missing)))
  (:axiom (io ?io_x) (and (owned ?io_x) (call probe 8) (missing)))
)`)
  const world = new WorldState()
  for (let i = 0; i < 3; i++) {
    world.add('seen', int(1))
    world.add('pair', sym('on'), int(i))
    world.add('owned', sym('a'))
  }
  world.add('item', sym('a'))
  world.add('item', sym('b'))
  world.add('p', sym('a'))
  const calls: number[] = []
  const o = { callterms: { probe: tracer(calls) } }
  const count = (method: string, args: Atom[] = []) => {
    calls.length = 0
    assert.deepEqual(run(domain, world, method, args, o).plan, ['!fallback'], method)
    return calls.length
  }
  assert.equal(count('param', [int(1)]), 1)
  assert.equal(count('literal_and_discard'), 1)
  assert.equal(count('bound_earlier'), 1)
  assert.equal(count('bound_by_every_or_child'), 1)
  // A variable unbound at that point: every duplicate row is a separate solution.
  assert.equal(count('unbound'), 3)
  // The rule is static: ?x is bound at run time here, but not by every `or` child.
  assert.equal(count('bound_by_one_or_child'), 3)
  // In an axiom body only ?inp_ parameters count as bound (HTNConditionContinuation.inl:136).
  assert.equal(count('axiom_inp'), 1)
  assert.equal(count('axiom_io'), 3)
  for (const { mode } of MODES) {
    calls.length = 0
    run(domain, world, 'param', [int(1)], { ...o, mode })
    assert.equal(calls.length, 1)
  }
})

// Upstream compares a statically bound variable that is unbound at run time (an ?inp_ parameter fed a
// failed expression, passed as NULL) with HTNAtom_Equals, which fails for NULL: the row does not match.
test('a one-solution fact does not bind an input parameter left unbound by a failed expression', () => {
  const domain = parseDomain(`
(:domain Null top_level_domain
  (:method (m) top_level_method
    (b (and (#has (call nothing))) ((!bound)))
    (f () ((!fallback))))
  (:axiom (has ?inp_x) (and (owned ?inp_x)))
)`)
  const world = new WorldState()
  world.add('owned', sym('a'))
  assert.deepEqual(run(domain, world, 'm', [], { callterms: { nothing: () => undefined } }).plan, ['!fallback'])
})
