import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bool, float, formatAtom, int, list, str, sym, type Atom } from '../../../src/htn-planner/htn/atom'
import { atomEquals } from '../../../src/htn-planner/htn/match'
import { WorldState } from '../../../src/htn-planner/htn/world-state'
import { fixture, parseDomain, parseWorld } from './domain-text'
import { run } from './util'

const numeric = parseDomain(fixture('Domains/Test/numeric_expressions.domain'))
const numericWorld = () => parseWorld(fixture('WorldStates/Test/numeric_expressions.worldstate'))
const intArg = (a: Atom) => (a.t === 'int' ? a.v : NaN)
const numericCallterms = {
  add: (a: readonly Atom[]) => int(a.length === 2 && a[0].t === 'int' && a[1].t === 'int' ? a[0].v + a[1].v : 0),
  inc: (a: readonly Atom[]) => int(a.length === 1 && a[0].t === 'int' ? a[0].v + 1 : 0)
}

test('atomEquals: BOOL matches INT 1/0 both ways and inside lists; INT never equals FLOAT (HTNAtom.cpp:541)', () => {
  for (const v of [false, true]) {
    assert.ok(atomEquals(bool(v), int(v ? 1 : 0)))
    assert.ok(atomEquals(int(v ? 1 : 0), bool(v)))
    assert.ok(atomEquals(list(bool(v), list(int(v ? 1 : 0))), list(int(v ? 1 : 0), list(bool(v)))))
    for (const other of [int(v ? 0 : 1), int(2), int(-1), float(v ? 1 : 0), str(String(v)), sym(String(v))]) {
      assert.ok(!atomEquals(bool(v), other))
      assert.ok(!atomEquals(other, bool(v)))
    }
  }
  assert.ok(!atomEquals(int(1), float(1)))
  assert.ok(!atomEquals(sym('a'), str('a')))
  assert.ok(atomEquals(float(-0), float(0)))
})

test('numeric_expressions: run, division_by_zero, invalid_operand_type (HTNGeneratedEquivalenceTest.cpp:883)', () => {
  const world = numericWorld()
  assert.deepEqual(run(numeric, world, 'run').plan, ['!numeric_result "success"'])
  const div = run(numeric, world, 'division_by_zero')
  assert.deepEqual(div.plan, ['!numeric_result "controlled_failure"'])
  assert.ok(div.diagnostics.some(d => d.code === 'arithmetic_error'))
  assert.deepEqual(run(numeric, world, 'invalid_operand_type').plan, ['!numeric_result "controlled_failure"'])
})

test('numeric_expressions: arithmetic in task, callterm and axiom arguments (HTNGeneratedEquivalenceTest.cpp:1852)', () => {
  const world = numericWorld()
  assert.deepEqual(run(numeric, world, 'argument_expressions', [], { callterms: numericCallterms }).plan, [
    '!compound_arithmetic_arguments 3 6 6 6 2 7 7',
    '!primitive_arithmetic_arguments 3 6 6 6 2 7 7',
    '!callterm_arithmetic_arguments 9 12 9 8',
    '!recursive_arithmetic_result 2'
  ])
  assert.deepEqual(run(numeric, world, 'axiom_argument_expressions').plan, ['!axiom_arithmetic_arguments "success"'])
  assert.equal(run(numeric, world, 'axiom_output_expression').status, 'no_plan') // ?out_ given an expression
  for (const entry of ['axiom_output_mismatch', 'axiom_io_mismatch', 'axiom_invalid_input_expression', 'axiom_invalid_output_expression'])
    assert.deepEqual(run(numeric, world, entry).plan, [`!${entry} "controlled_failure"`], entry)
})

test('numeric_expressions: assignments evaluate in order and roll back (HTNGeneratedEquivalenceTest.cpp:1817)', () => {
  const world = new WorldState()
  world.add('assignment_candidate', int(1))
  world.add('assignment_candidate', int(2))
  let calls = 0
  const callterms = {
    assignment_probe: (a: readonly Atom[]) => {
      calls++
      return int(intArg(a[0]) + 1)
    }
  }
  const cases: [string, string, number][] = [
    ['assignment_values', '!assignment_values main_threat 5 6 0', 1],
    ['assignment_backtracking', '!assignment_result 3', 2],
    ['assignment_nested_calls', '!assignment_result 5', 2],
    ['assignment_failure', '!assignment_result 9', 0],
    ['assignment_ordered_failure', '!assignment_result 9', 0], // a failed operand stops later calls
    ['assignment_axiom', '!assignment_result 2', 0]
  ]
  for (const [entry, expected, expectedCalls] of cases) {
    calls = 0
    assert.deepEqual(run(numeric, world, entry, [], { callterms }).plan, [expected], entry)
    assert.equal(calls, expectedCalls, entry)
  }
})

function evalExpr(expr: string): string | undefined {
  // Evaluate through a one-branch method: (= ?r expr) then emit ?r.
  const d = parseDomain(`(:domain E top_level_domain (:method (m) top_level_method (b (and (= ?r ${expr})) ((!r ?r)))))`)
  const r = run(d, new WorldState(), 'm')
  return r.status === 'succeeded' ? decompile(r.plan[0]) : undefined
}
const decompile = (step: string) => step.slice(3)

test('arithmetic typing, truncation, overflow and division rules (_EVALUATE_ARITHMETIC, HTNCCodeGenerator.cpp)', () => {
  const cases: [string, string | undefined][] = [
    ['(+ 1 2 3)', '6'], ['(- 10 3 2)', '5'], ['(- 5)', '-5'], ['(* 2 3 4)', '24'], ['(/ 20 2 2)', '5'],
    ['(/ 7 2)', '3'], ['(/ -7 2)', '-3'], ['(% 17 5)', '2'], ['(% -7 2)', '-1'], ['(% 7 -2)', '1'],
    ['(+ 1 2.5)', '3.5'], ['(/ 1 2.0)', '0.5'], ['(/ 7 2.0)', '3.5'], ['(++ 41)', '42'], ['(-- 41)', '40'], ['(++ 2.5)', '3.5'],
    ['(- 2.5)', '-2.5'], ['(* 0.5 4)', '2.0'],
    ['(+ 2147483647 1)', undefined], ['(- -2147483648 1)', undefined], ['(* 65536 65536)', undefined],
    ['(++ 2147483647)', undefined], ['(-- -2147483648)', undefined], ['(/ -2147483648 -1)', undefined],
    ['(- -2147483648)', '-2147483648'], // unary int negation is not range-checked upstream (wraps)
    ['(+ 2147483647 1 0.5)', '2147483648.0'], // any float makes the whole expression float
    ['(/ 1 0)', undefined], ['(% 1 0)', undefined], ['(/ 1.0 0)', undefined], ['(/ 1 0.0)', undefined],
    ['(% 7.0 2)', undefined], ['(% 7 2 1)', undefined],
    ['(* 3.0e 1)', undefined], // `3.0e` is a symbol here: not numeric
    ['(+ invalid 1)', undefined], ['(* 340000000000000000000000000000000000000.0 10)', undefined]
  ]
  for (const [expr, expected] of cases) assert.equal(evalExpr(expr), expected, expr)
})

test('arithmetic stops at the first bad operand: later calls are not invoked (nested_operator_calls short_circuit)', () => {
  const d = parseDomain(fixture('Domains/Test/nested_operator_calls.domain'))
  let calls = 0
  const r = run(d, new WorldState(), 'short_circuit', [], { callterms: { missing_distance_callterm: () => (calls++, float(0.1)) } })
  assert.deepEqual(r.plan, ['!result'])
  assert.equal(calls, 0)
})

test('comparisons: mixed int/float, BOOL~INT, symbols true/false, unbound and ordering (boolean_compatibility.domain)', () => {
  const d = parseDomain(fixture('Domains/Test/boolean_compatibility.domain'))
  const world = new WorldState()
  world.add('flags', bool(true), bool(false))
  world.add('numeric_flags', int(1), int(0))
  world.add('mixed_flags', list(sym('true'), bool(true), sym('false'), bool(false)))
  world.add('candidate', int(1), bool(true))
  world.add('candidate', int(2), bool(true))
  world.add('selected', int(2))
  let calls = 0
  let alive: Atom | undefined = bool(false)
  const isFlag = (a: Atom) => a.t === 'bool' || (a.t === 'int' && (a.v === 0 || a.v === 1))
  const callterms = {
    // typed C++ bool binding: accepts BOOL or INT 0/1, rejects symbols (ArgumentTypeMismatch)
    accept_flags: (a: readonly Atom[]) => (a.length === 2 && a.every(isFlag) ? bool(true) : undefined),
    is_entity_alive: () => (calls++, alive),
    alive_for_candidate: (a: readonly Atom[]) => (calls++, bool(intArg(a[0]) === 1))
  }
  // FactsComparisonsBindingsAndPlanKeepOriginalTypes (HTNBooleanCompatibilityTest.cpp)
  const main = run(d, world, 'run', [], { callterms })
  assert.deepEqual(main.plan, ['!values 1 0 1 0 true false 1 0 2'])
  // BacktrackingFindsSecondCompatibleRow
  calls = 0
  assert.deepEqual(run(d, world, 'backtrack', [], { callterms }).plan, ['!chosen 2 1 0'])
  assert.equal(calls, 2)
  // FalseCallResultFailsConditionButBindsAndContinuesAssignment
  calls = 0
  assert.equal(run(d, world, 'condition', [], { callterms }).status, 'no_plan')
  assert.deepEqual(run(d, world, 'assignment', [], { callterms }).plan, ['!assigned 0'])
  assert.equal(calls, 2)
  alive = bool(true)
  assert.equal(run(d, world, 'condition', [], { callterms }).status, 'succeeded')
  alive = undefined
  assert.equal(run(d, world, 'assignment', [], { callterms }).status, 'no_plan')
  // BareBooleanNamesAreSymbolsNotNumericAliases
  for (const entry of ['symbol_equals_zero', 'symbol_equals_one', 'invalid_bool_argument'])
    assert.equal(run(d, world, entry, [], { callterms }).status, 'no_plan', entry)
  assert.deepEqual(run(d, world, 'symbol_assignment').plan, ['!symbol false'])

  const cmp = parseDomain(`(:domain C top_level_domain
    (:method (mixed) top_level_method (b (and (== 1 1.0) (< 1 1.5) (>= 2.0 2) (!= 1 1.5)) ((!ok))))
    (:method (unbound_eq) top_level_method (b (and (or (v ?x) (== 1 1)) (== ?x 1)) ((!bad))) (f () ((!ok))))
    (:method (unbound_ne) top_level_method (b (and (or (v ?x) (== 1 1)) (!= ?x 1)) ((!bad))) (f () ((!ok))))
    (:method (ordering) top_level_method (b (and (< a b)) ((!bad))) (f () ((!ok))))
    (:method (strings) top_level_method (b (and (== "a" a)) ((!bad))) (f (and (== "a" "a") (== (1 (2)) (1 (2)))) ((!ok)))))`)
  for (const m of ['mixed', 'unbound_eq', 'unbound_ne', 'ordering', 'strings'])
    assert.deepEqual(run(cmp, new WorldState(), m).plan, ['!ok'], m)
  assert.ok(run(cmp, new WorldState(), 'ordering').diagnostics.some(x => x.code === 'type_error'))
  assert.ok(run(cmp, new WorldState(), 'unbound_eq').diagnostics.some(x => x.code === 'unbound_read'))
})

test('fact unification: literals and bound vars constrain, repeated vars must agree, ?any_ discards, BOOL~INT', () => {
  const d = parseDomain(`(:domain F top_level_domain
    (:method (pairs) top_level_method (b (and (pair ?x ?x)) ((!same ?x))))
    (:method (discard) top_level_method (b (and (triple ?a ?any_b ?any_c) (triple ?a 2 ?d)) ((!got ?a ?d))))
    (:method (flag) top_level_method (b (and (flag 1 ?who)) ((!flag ?who))))
    (:method (arity) top_level_method (b (and (pair ?x)) ((!bad))) (f () ((!ok))))
    (:method (expr ?inp_x) top_level_method (b (and (= ?v (+ ?inp_x 1)) (pair ?v ?y)) ((!got ?y)))))`)
  const w = new WorldState()
  w.add('pair', int(1), int(2))
  w.add('pair', int(3), int(3))
  w.add('pair', float(3), int(9))
  w.add('triple', sym('a'), int(1), int(1))
  w.add('triple', sym('b'), int(2), int(5))
  w.add('triple', sym('b'), int(9), int(9))
  w.add('flag', bool(true), sym('alice'))
  assert.deepEqual(run(d, w, 'pairs').plan, ['!same 3'])
  assert.deepEqual(run(d, w, 'discard').plan, ['!got b 5'])
  assert.deepEqual(run(d, w, 'flag').plan, ['!flag alice'])
  assert.deepEqual(run(d, w, 'arity').plan, ['!ok'])
  // An expression is assigned first: the compiler rejects arithmetic as a fact argument (D5), as upstream.
  assert.deepEqual(run(d, w, 'expr', [int(2)]).plan, ['!got 3']) // int 3 matches only the int row
})

test('callterms can add facts that the same decomposition sees (CallTermCreatesFactVisibleImmediately)', () => {
  const d = parseDomain(`(:domain W top_level_domain
    (:method (m) top_level_method (b (and (call spawn "enemy0") (target ?t)) ((!target_available_visible ?t))))
    (:method (retry) top_level_method (b (and (seen ?x) (call spawn ?x) (target ?x)) ((!got ?x)))))`)
  const w = new WorldState()
  const callterms = { spawn: (a: readonly Atom[]) => (w.add('target', a[0]), bool(true)) }
  assert.deepEqual(run(d, w, 'm', [], { callterms }).plan, ['!target_available_visible "enemy0"'])
  w.clearAll()
  w.add('seen', int(1))
  w.add('seen', int(2))
  assert.deepEqual(run(d, w, 'retry', [], { callterms }).plan, ['!got 1'])
})

test('standalone call needs a BOOL result: non-bool reports non_boolean_condition_result (HTNBooleanCallTermTest.cpp)', () => {
  const d = parseDomain(fixture('Domains/Test/boolean_callterms.domain'))
  let calls = 0
  let value: Atom | undefined = int(1)
  const callterms = {
    ppr_finalize_best: () => (calls++, value),
    expected_value: () => value,
    accept_value: () => bool(true)
  }
  for (const v of [int(1), int(0), float(1), sym('true'), str('true'), list(float(1), float(2), float(3))]) {
    value = v
    calls = 0
    const r = run(d, new WorldState(), 'condition', [], { callterms })
    assert.equal(r.status, 'no_plan', formatAtom(v))
    assert.equal(calls, 1)
    assert.equal(r.diagnostics.filter(x => x.code === 'non_boolean_condition_result').length, 1)
    // ValuesRemainValidInAssignmentsComparisonsAndNestedArguments
    for (const entry of ['assignment', 'axiom_assignment', 'comparison', 'nested_condition']) {
      const ok = run(d, new WorldState(), entry, [], { callterms })
      assert.equal(ok.status, 'succeeded', entry)
      assert.equal(ok.diagnostics.length, 0, entry)
    }
  }
  for (const v of [true, false]) {
    value = bool(v)
    const r = run(d, new WorldState(), 'condition', [], { callterms })
    assert.equal(r.status, v ? 'succeeded' : 'no_plan')
    assert.equal(r.diagnostics.length, 0)
  }
  value = undefined // unbound result: an ordinary failure, not reported
  assert.equal(run(d, new WorldState(), 'condition', [], { callterms }).diagnostics.length, 0)
  // BacktrackingReportsEachAttemptAndAllowsFallback
  const w = new WorldState()
  w.add('candidate', int(1))
  w.add('candidate', int(2))
  value = int(1)
  calls = 0
  const b = run(d, w, 'alternatives', [], { callterms })
  assert.deepEqual(b.plan, ['!fallback'])
  assert.equal(calls, 2)
  assert.equal(b.diagnostics.length, 2)
})

test('missing callterms report each attempted invocation; enclosing calls are not invoked (HTNNestedCallExpressionTest.cpp:168)', () => {
  const d = parseDomain(fixture('Domains/Test/nested_operator_calls.domain'))
  let outer = 0
  const callterms = { identity: (a: readonly Atom[]) => (outer++, a[0]) }
  for (const entry of ['behave', 'missing_right', 'missing_arithmetic', 'missing_deep', 'bound_first', 'two_attempts', 'short_circuit', 'missing_task_arithmetic']) {
    const r = run(d, new WorldState(), entry, [], { callterms })
    assert.equal(r.status, entry === 'short_circuit' ? 'succeeded' : 'no_plan', entry)
    const missing = r.diagnostics.filter(x => x.code === 'missing_callterm')
    assert.equal(missing.length, entry === 'short_circuit' ? 0 : entry === 'two_attempts' ? 2 : 1, entry)
    assert.ok(missing.every(x => x.message.includes('missing_distance_callterm')))
    assert.equal(outer, 0)
  }
})

test('nested calls evaluate depth-first left to right (ValuesParticipateInBothOperandsAndEveryOperator)', () => {
  const d = parseDomain(fixture('Domains/Test/nested_operator_calls.domain'))
  let calls = 0
  const callterms = {
    distance: () => (calls++, float(0.1)),
    missing_distance_callterm: (a: readonly Atom[]) => {
      calls++
      assert.equal(a.length, 2)
      assert.equal(formatAtom(a[0]), '(1.0 0.0 0.0)')
      assert.equal(formatAtom(a[1]), '(2.0 0.0 0.0)')
      return float(0.1)
    },
    identity: (a: readonly Atom[]) => (calls++, a[0])
  }
  const cases: [string, number][] = [['valid_left', 1], ['valid_right', 1], ['valid_both', 2], ['valid_bound', 1], ['operators', 15], ['behave', 1], ['task_arithmetic', 2]]
  for (const [entry, expected] of cases) {
    calls = 0
    const r = run(d, new WorldState(), entry, [], { callterms })
    assert.equal(r.status, 'succeeded', entry)
    assert.equal(r.plan.length, 1)
    assert.equal(calls, expected, entry)
  }
  calls = 0
  assert.deepEqual(run(d, new WorldState(), 'debugger_assignment', [], { callterms }).plan, ['!result 3'])
  assert.equal(calls, 2)
})

test('split_list builtins (atom_list_demo.domain, HTNGeneratedEquivalenceTest.cpp:844)', () => {
  const d = parseDomain(fixture('Domains/Test/atom_list_demo.domain'))
  const w = new WorldState()
  const callterms = { list_clear: () => list() }
  const cases: [string, string][] = [
    ['split_list_basic', '!split_result "one" ("two" "three")'],
    ['split_list_single_element', '!split_single_result "only" ()'],
    ['split_list_empty_fails', '!empty_list_rejected'],
    ['split_list_bound_outputs', '!bound_outputs_match'],
    ['split_list_rollback', '!rollback_result "only" ()'],
    ['split_list_front_basic', '!split_front_result "one" ("two" "three")'],
    ['split_list_back_basic', '!split_back_result "three" ("one" "two")'],
    ['split_list_back_bound_outputs', '!split_back_bound_outputs_match']
  ]
  for (const [entry, expected] of cases) assert.deepEqual(run(d, w, entry, [], { callterms }).plan, [expected], entry)
  const nonList = parseDomain(`(:domain S top_level_domain (:method (m) top_level_method (b (and (split_list 5 ?a ?b)) ((!bad))) (f () ((!ok)))))`)
  const r = run(nonList, w, 'm')
  assert.deepEqual(r.plan, ['!ok'])
  assert.ok(r.diagnostics.some(x => x.code === 'type_error'))
})

test('runtime lists (runtime_lists.domain, HTNRuntimeListTest.cpp)', () => {
  const d = parseDomain(fixture('Domains/Test/runtime_lists.domain'))
  let calls = 0
  let after = 0
  let outer = 0
  let time = 10
  let seen: Atom | undefined
  const w = new WorldState()
  const callterms = {
    ppr_start: (a: readonly Atom[]) => (outer++, (seen = a[0]), bool(true)),
    get_entity_position: (a: readonly Atom[]) => (calls++, list(int(intArg(a[0])), int(0), int(3))),
    get_time: () => (calls++, int(time)),
    count_after: () => (after++, int(1)),
    failing_runtime_list: () => (calls++, undefined),
    identity: (a: readonly Atom[]) => a[0],
    add_fact: (a: readonly Atom[]) => (w.add('added', a[0]), a[0])
  }
  const o = { callterms }
  const first = (entry: string, args: Atom[] = []) => {
    const r = run(d, w, entry, args, o)
    assert.equal(r.status, 'succeeded', entry)
    return r.plan[0]
  }
  assert.equal(first('run', [int(7)]), '!result 7')
  assert.equal(formatAtom(seen as Atom), '(find_closest_location_to_entity 7)')
  assert.equal(first('static'), '!result (query_extent_y (1.0 1.0 1.0))')
  assert.equal(first('variables', [int(7), list(int(1), int(2), int(3))]), '!result (action 7 (1 2 3))')
  assert.equal(first('arithmetic', [int(6)]), '!result (math 8 4 12 3 0 7 5)')
  assert.equal(first('arithmetic_call', [int(6)]), '!result (sum 8)')
  for (const entry of ['calls', 'assignment', 'nested_call']) {
    calls = 0
    assert.equal(first(entry, [int(7)]), '!result (target 7 (7 0 3))', entry)
    assert.equal(calls, 1)
  }
  calls = 0
  assert.equal(first('nested', [int(7)]), '!result (action (target 7) (movement (1.0 2.0 3.0) (7 0 3)) (metadata current_time 10) (query 7))')
  assert.equal(calls, 2)
  w.add('list_fact', list(sym('key'), int(7)))
  assert.equal(first('fact', [int(7)]), '!result key (7)')
  assert.equal(run(d, w, 'fact', [int(8)], o).status, 'no_plan')
  assert.equal(first('axiom_list', [int(7)]), '!result (wrapped (key 7))')
  assert.equal(first('compound', [int(7)]), '!result (key 7)')
  assert.equal(first('plan_markers', [int(7)]), '!begin_plan (key 7)')
  // Deferred arguments are captured when the step is created; the body runs later.
  calls = 0
  const deferred = run(d, w, 'deferred', [int(7)], o)
  assert.deepEqual(deferred.plan, ['&later (snapshot 7 10)'])
  assert.equal(calls, 1)
  // Backtracking rebuilds lists from current bindings.
  w.add('entity', int(1))
  w.add('entity', int(2))
  w.add('selected', list(sym('target'), int(2), list(int(2), int(0), int(3))))
  calls = 0
  assert.equal(first('backtracking'), '!result (target 2 (2 0 3))')
  assert.equal(calls, 2)
  w.add('list_fact', list(sym('key'), int(2)))
  assert.equal(first('axiom_backtracking'), '!result (key 2)')
  // Unbound/failed elements stop construction; later and enclosing calls are not invoked.
  after = 0
  outer = 0
  for (const entry of ['unbound', 'failed', 'failed_task', 'failed_arithmetic']) {
    const r = run(d, w, entry, [], o)
    assert.equal(r.status, 'no_plan', entry)
    if (entry === 'unbound') assert.ok(r.diagnostics.some(x => x.code === 'unbound_read' && x.message.includes("'?io_value' is unbound")))
  }
  assert.equal(after, 0)
  assert.equal(outer, 0)
  const missing = run(d, w, 'missing', [], o)
  assert.equal(missing.status, 'no_plan')
  assert.equal(missing.diagnostics.filter(x => x.code === 'missing_callterm').length, 1)
  assert.equal(after, 0)
  assert.equal(first('mutation', [int(7)]), '!result (target 7)')
  assert.equal(first('fallback'), '!result fallback')
  assert.equal(run(d, w, 'bad_numeric_operand', [], o).status, 'no_plan')
  assert.equal(run(d, w, 'bad_list_operand', [int(6)], o).status, 'no_plan')
  assert.equal(after, 0)
  assert.equal(run(d, w, 'bound_io', [], o).status, 'no_plan') // bound ?io_ rejects before evaluating
  assert.equal(after, 0)
})
