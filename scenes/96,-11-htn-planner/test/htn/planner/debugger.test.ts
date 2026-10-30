// Golden tests of the debugger capture (htn/trace.ts) against what upstream's generated debugger records
// (urosidoki/htn_planner aec08fa, HTNFramework/src/Translator/HTNGeneratedDebugger.h fed by the events that
// HTNCCodeGenerator.cpp and HTNConditionContinuation.inl emit). Trees are written the way upstream's Verbose view
// lists them (every node, unstarted ones too): ✓ succeeded, ✗ failed, · never started (short-circuit).
// The ports of upstream's own debugger tests cite them; the gallery trees are reasoned from the emitters, cited inline.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAtom, int, str, sym } from '../../../src/htn-planner/htn/atom'
import type { DomainIR } from '../../../src/htn-planner/htn/ir'
import { decompose, PlanRunner } from '../../../src/htn-planner/htn/planner'
import type { CallTerm, PlannerOptions } from '../../../src/htn-planner/htn/planner'
import { DebugNode, PlanRun, PlanTraceRecorder } from '../../../src/htn-planner/htn/trace'
import { ViewMode, viewRows, ViewState } from '../../../src/htn-planner/htn/trace-view'
import { addFacts, WorldFacts, WorldState } from '../../../src/htn-planner/htn/world-state'
import { CALLTERM_SETS, HostContext } from '../../../src/examples/upstream/conformance-callterms'
import { compile } from '../compiler/helpers'
import { formatTask } from '../../../src/htn-planner/htn/atom'
import { LAB_STATIONS } from '../../../src/examples/upstream/lab'
import { GALLERY_STATIONS } from '../../../src/examples/upstream/gallery'
import { galleryCallterms } from '../../../src/examples/upstream/stations'
import { complexScenarioDomain } from '../../../src/examples/upstream/generated/complex_scenario.htn'
import { complexScenarioRecursive100Facts } from '../../../src/examples/upstream/generated/complex_scenario_recursive_100.facts'
import { hierarchicalBacktrackingDomain } from '../../../src/examples/upstream/generated/hierarchical_backtracking.htn'
import { hierarchicalBacktrackingNoCombatFacts } from '../../../src/examples/upstream/generated/hierarchical_backtracking_no_combat.facts'
import { humanDomain } from '../../../src/examples/upstream/generated/human.htn'
import { humanAxiomBacktrackingFacts } from '../../../src/examples/upstream/generated/human_axiom_backtracking.facts'
import { atomListDemoDomain } from '../../../src/examples/upstream/generated/lab/atom_list_demo.htn'
import { atomListDemoFacts } from '../../../src/examples/upstream/generated/lab/atom_list_demo.facts'
import { calltermsFacts } from '../../../src/examples/upstream/generated/lab/callterms.facts'
import { nestedCallsDomain } from '../../../src/examples/upstream/generated/lab/nested_calls.htn'
import { nestedOperatorCallsDomain } from '../../../src/examples/upstream/generated/lab/nested_operator_calls.htn'

function world(...facts: WorldFacts[]): WorldState {
  const w = new WorldState()
  for (const f of facts) addFacts(w, f)
  return w
}

function record(domain: DomainIR, w: WorldState, method: string, options: PlannerOptions = {}, args = []) {
  const rec = new PlanTraceRecorder(domain)
  const result = decompose(domain, w, method, args, { ...options, trace: rec })
  return { rec, result, run: rec.lastPlan! }
}

/** Upstream BindTestCallTerms with a HostContext (HTNGeneratedEquivalenceTest.cpp:286). */
function testCallterms(w: WorldState): PlannerOptions {
  const context: HostContext = { world: w, vars: {}, trace: [], counters: {}, errors: [] }
  return { callterms: CALLTERM_SETS.test, context }
}

const mark = (n: DebugNode) => (!n.started ? '·' : !n.completed ? '…' : n.succeeded ? '✓' : '✗')

/** The run as an indented list, every node (upstream Verbose order). */
function dump(run: PlanRun): string[] {
  const out: string[] = []
  const walk = (n: DebugNode, depth: number) => {
    out.push(`${'  '.repeat(depth)}${mark(n)} ${n.name}`)
    for (const c of n.children) walk(run.nodes[c], depth + 1)
  }
  walk(run.nodes[0], 0)
  return out
}

const bound = (bs: { name: string; value: { t: string } }[]) => bs.map(b => `${b.name}=${formatAtom(b.value as never)}`).join(' ')

/** Upstream HTNNestedCallExpressionTest.cpp:52 CheckSourceCapture: balanced, titled, one root, consistent links. */
function checkCapture(run: PlanRun): void {
  let roots = 0
  for (const n of run.nodes) {
    assert.ok(n.name.startsWith('(') && n.name.endsWith(')'), n.name)
    if (n.started) assert.ok(n.completed, `${n.name} started without an end`)
    if (n.parent < 0) roots++
    for (const c of n.children) assert.equal(run.nodes[c].parent, n.id)
  }
  assert.equal(roots, 1)
}

// ---- gallery: hierarchical_backtracking (Domains/Test/hierarchical_backtracking.domain) -----------------------

test('a fact choice point: each row tried is a node, the failed check after the first stays in the history', () => {
  // (and (candidate ?candidate) (acceptable ?candidate)) with candidate first/second, acceptable second.
  // `candidate` binds: a choice point (.inl :192-213, one BEGIN/END per row tried); `acceptable` has every
  // variable bound: a direct fact (HTNCCodeGenerator.cpp :966-1047). The failed acceptable makes the choice point
  // retry; its re-BEGIN finds no pending child (the first is started) and creates a new node (:221-249).
  const { run, result } = record(hierarchicalBacktrackingDomain, world(hierarchicalBacktrackingNoCombatFacts), 'validate_fact_backtracking')
  assert.equal(result.status, 'succeeded')
  assert.deepEqual(dump(run), [
    '✓ (validate_fact_backtracking)',
    '  ✓ (:method (validate_fact_backtracking) ...)',
    '    ✓ (branch_selected ...)',
    '      ✓ (and ...)',
    '        ✓ (candidate ?candidate)',
    '        ✗ (acceptable ?candidate)',
    '        ✓ (candidate ?candidate)',
    '        ✓ (acceptable ?candidate)',
    '      ✓ (!selected_fact ?candidate)'
  ])
  checkCapture(run)
  const and = run.nodes[3]
  const [first, check, second, ok] = and.children.map(i => run.nodes[i])
  assert.equal(bound(first.after), 'candidate=first')
  assert.equal(bound(check.before), 'candidate=first')
  // Ours: the rows the failed fact was checked against.
  assert.deepEqual(check.rows, [[sym('second')]])
  assert.equal(check.rowCount, 1)
  // The next try starts from the same bindings as the first (upstream rolls back before BEGIN, .inl :210-212).
  assert.equal(bound(second.before), '')
  assert.equal(bound(second.after), 'candidate=second')
  assert.equal(ok.succeeded, true)
  assert.equal(run.nodes[1].kind, 'method')
  assert.equal(run.nodes[2].kind, 'branch')
})

test('an axiom call site holds the axiom scope; a retried call is a new call site with a new scope', () => {
  // (and (#find_candidate ?candidate) (acceptable ?candidate)). The call site is a composite condition
  // (.inl :58-79) around BEGIN_AXIOM (HTNCCodeGenerator.cpp :2287); on retry the Resume labels begin a new call
  // site, then a new axiom scope (.inl :76, :182), and the body's own composite and choice point resume inside it.
  const { run } = record(hierarchicalBacktrackingDomain, world(hierarchicalBacktrackingNoCombatFacts), 'validate_axiom_backtracking')
  assert.deepEqual(dump(run), [
    '✓ (validate_axiom_backtracking)',
    '  ✓ (:method (validate_axiom_backtracking) ...)',
    '    ✓ (branch_selected ...)',
    '      ✓ (and ...)',
    '        ✓ (#find_candidate ?candidate)',
    '          ✓ (:axiom (find_candidate ?out_candidate) ...)',
    '            ✓ (and ...)',
    '              ✓ (candidate ?out_candidate)',
    '        ✗ (acceptable ?candidate)',
    '        ✓ (#find_candidate ?candidate)',
    '          ✓ (:axiom (find_candidate ?out_candidate) ...)',
    '            ✓ (and ...)',
    '              ✓ (candidate ?out_candidate)',
    '        ✓ (acceptable ?candidate)',
    '      ✓ (!selected_axiom ?candidate)'
  ])
  checkCapture(run)
  const scopes = run.nodes.filter(n => n.impl)
  assert.deepEqual(scopes.map(n => bound(n.after)), ['out_candidate=first', 'out_candidate=second'])
  // The call site's After has the published output; the second scope starts from the first solution (upstream
  // rolls the axiom locals back to it before BEGIN_AXIOM, .inl :178-182).
  const sites = run.nodes.filter(n => n.kind === 'axiom' && !n.impl)
  assert.deepEqual(sites.map(n => bound(n.after)), ['candidate=first', 'candidate=second'])
  assert.equal(bound(scopes[1].before), 'out_candidate=first')
  assert.equal(sites[1].tokens.length > 0 && scopes[1].tokens.length, 0)
})

test('a failed compound task fails its branch; the method tries its next branch', () => {
  // do_combat_guarded fails in both branches: END_METHOD(0), the task's END_TASK(0), its branch END_BRANCH(0)
  // after restoring the snapshot, then the next branch (HTNCCodeGenerator.cpp :3141, :3232-3247, :2791).
  const { run } = record(hierarchicalBacktrackingDomain, world(hierarchicalBacktrackingNoCombatFacts), 'validate_child_guard')
  assert.deepEqual(dump(run), [
    '✓ (validate_child_guard)',
    '  ✓ (:method (validate_child_guard) ...)',
    '    ✓ (run ...)',
    '      ✓ (do_behavior_child_guard enemy)',
    '        ✓ (:method (do_behavior_child_guard ?inp_threat) ...)',
    '          ✗ (branch_combat ...)',
    '            ✗ (do_combat_guarded ?inp_threat)',
    '              ✗ (:method (do_combat_guarded ?inp_threat) ...)',
    '                ✗ (branch_fire ...)',
    '                  ✗ (and ...)',
    '                    ✗ (in_combat_state)',
    '                ✗ (branch_wait ...)',
    '                  ✗ (and ...)',
    '                    ✗ (in_combat_state)',
    '          ✓ (branch_search ...)',
    '            ✓ (do_search ?inp_threat)',
    '              ✓ (:method (do_search ?inp_threat) ...)',
    '                ✓ (branch_search ...)',
    '                  ✓ (!search ?inp_threat)'
  ])
  checkCapture(run)
  const method = run.nodes.find(n => n.name.startsWith('(:method (do_behavior_child_guard'))!
  assert.equal(bound(method.before), 'inp_threat=enemy')
  const task = run.nodes.find(n => n.name === '(do_combat_guarded ?inp_threat)')!
  assert.equal(task.kind, 'task')
  assert.deepEqual(task.tokens.map(t => [t.kind, t.text, t.space]), [
    ['normal', '(do_combat_guarded', true],
    ['var', '?inp_threat', true],
    ['normal', ')', false]
  ])
  assert.ok(task.source && task.source.endCol > task.source.col)
})

test('short-circuit: an and pre-creates every term, the ones never reached stay not started', () => {
  const { run } = record(nestedOperatorCallsDomain, new WorldState(), 'debugger_skipped', { callterms: { distance: () => int(0) } })
  assert.equal(run.status, 'no_plan')
  assert.deepEqual(dump(run), [
    '✗ (debugger_skipped)',
    '  ✗ (:method (debugger_skipped) ...)',
    '    ✗ (branch ...)',
    '      ✗ (and ...)',
    '        ✗ (absent_fact)',
    '        · (< (call distance) 0.2)'
  ])
  const absent = run.nodes[4]
  assert.deepEqual(absent.rows, [])
  assert.equal(absent.rowCount, 0)
})

test('without fact/axiom backtracking a choice point is not retried: no second row', () => {
  // HTNConditionContinuation.inl :208-209: the Retry label leaves before the next BEGIN when the mode is off.
  const mode = { factsAndAxioms: false, branches: true }
  const { run } = record(hierarchicalBacktrackingDomain, world(hierarchicalBacktrackingNoCombatFacts), 'validate_fact_backtracking', { mode })
  assert.deepEqual(dump(run), [
    '✓ (validate_fact_backtracking)',
    '  ✓ (:method (validate_fact_backtracking) ...)',
    '    ✗ (branch_selected ...)',
    '      ✗ (and ...)',
    '        ✓ (candidate ?candidate)',
    '        ✗ (acceptable ?candidate)',
    '    ✓ (branch_fallback ...)',
    '      ✓ (!fact_fallback)'
  ])
})

test('or commits to its first solution: a later failure ends it as a new, failed node', () => {
  // OR: child success -> commit, Success(Failure) (.inl :94-98); the suffix fails -> Resume: BEGIN a new node, which
  // goes straight to Failure (:75-77, :221-224). The second child was never reached.
  const r = compile(`(:domain Or top_level_domain
  (:method (go) top_level_method
    (b (and (or (p ?x) (q ?x)) (r ?x)) ((!ok ?x)))
    (c () ((!fallback)))))`)
  assert.ok(r.ok)
  const w = new WorldState()
  w.add('p', int(1))
  w.add('p', int(2))
  w.add('q', int(3))
  w.add('r', int(2))
  const { run } = record(r.ir, w, 'go')
  assert.deepEqual(dump(run), [
    '✓ (go)',
    '  ✓ (:method (go) ...)',
    '    ✗ (b ...)',
    '      ✗ (and ...)',
    '        ✓ (or ...)',
    '          ✓ (p ?x)',
    '          · (q ?x)',
    '        ✗ (r ?x)',
    '        ✗ (or ...)',
    '          · (p ?x)',
    '          · (q ?x)',
    '    ✓ (c ...)',
    '      ✓ (!fallback)'
  ])
  const failedR = run.nodes.find(n => n.name === '(r ?x)')!
  assert.deepEqual(failedR.rows, [[int(2)]])
  assert.equal(bound(failedR.before), 'x=1')
})

// ---- ports of upstream's debugger tests ----------------------------------------------------------------------

test('HTNNestedCallExpressionTest DebuggerKeepsRetriesSkippedExpressionsAndNestedAssignments (:335)', () => {
  const w = new WorldState()
  w.add('candidate', int(3))
  w.add('candidate', int(1))
  let calls = 0
  const callterms: Record<string, CallTerm> = {
    identity: a => (calls++, a[0]),
    distance: () => (calls++, { t: 'float', v: Math.fround(0.1) })
  }
  const cases = [
    { entry: 'debugger_backtracking', expression: '(< (call identity ?entity) 2)', calls: 2, attempts: 2, successes: 1 },
    { entry: 'debugger_skipped', expression: '(< (call distance) 0.2)', calls: 0, attempts: 0, successes: 0 },
    { entry: 'debugger_assignment', expression: '(= ?value (call identity (+ 1 (call identity 2))))', calls: 2, attempts: 1, successes: 1 }
  ]
  for (const c of cases) {
    calls = 0
    const { run, result } = record(nestedOperatorCallsDomain, w, c.entry, { callterms })
    assert.equal(result.status, c.successes ? 'succeeded' : 'no_plan', c.entry)
    assert.equal(calls, c.calls, c.entry)
    checkCapture(run)
    const rows = run.nodes.filter(n => n.name === c.expression)
    assert.ok(rows.length > 0, c.entry)
    assert.equal(rows.filter(n => n.started).length, c.attempts, c.entry)
    assert.equal(rows.filter(n => n.succeeded).length, c.successes, c.entry)
    for (const n of rows) {
      assert.deepEqual(n.children, [])
      assert.equal(run.nodes[n.parent].kind, 'and')
      if (c.entry === 'debugger_assignment') assert.equal(bound(n.after), 'value=3')
    }
  }
})

test('HTNNestedCallExpressionTest ContinueMoveDebuggerPreservesSourceAndExecution (:256)', () => {
  const w = new WorldState()
  w.add('active_plan', int(1), sym('moving_to_seen_entity'), int(42), int(10))
  const text = (s: string) => s
  const assignment = text('(= ?new_entity_position (call get_entity_position ?entity_id))')
  const comparison = text('(< (call get_distance_from_to ?old_entity_position ?new_entity_position) 0.2)')
  for (const shouldContinue of [true, false, true]) {
    const callterms: Record<string, CallTerm> = {
      get_entity_position: () => int(20),
      get_distance_from_to: () => ({ t: 'float', v: Math.fround(shouldContinue ? 0.1 : 0.3) })
    }
    const { run, result } = record(nestedOperatorCallsDomain, w, 'continue_move', { callterms })
    assert.equal(result.status, shouldContinue ? 'succeeded' : 'no_plan')
    checkCapture(run)
    const started = run.nodes.filter(n => n.started && (n.name === assignment || n.name === comparison))
    assert.equal(started.length, 2)
    for (const n of started) {
      const isComparison = n.name === comparison
      assert.equal(n.succeeded, !isComparison || shouldContinue)
      assert.equal(n.kind, isComparison ? 'cmp' : 'assign')
      assert.deepEqual(n.children, [])
      // Comparison ranges begin at the operator, assignment ranges at the '(' (upstream's two source contracts).
      assert.equal(n.source?.file, 'nested_operator_calls.domain')
      assert.equal(n.source?.line, isComparison ? 69 : 67)
      assert.equal(n.source?.col, isComparison ? 18 : 17)
    }
  }
})

test('HTNGeneratedEventDebuggerTest PreservesConstantNamesInConditionTitles (HTNGeneratedEquivalenceTest.cpp:2381)', () => {
  const w = world(atomListDemoFacts)
  const { run, result } = record(atomListDemoDomain, w, 'split_list_basic', testCallterms(w))
  assert.equal(result.status, 'succeeded')
  const split = run.nodes.find(n => n.kind === 'split')!
  assert.equal(split.name, '(split_list @split_list_input ?head ?tail)')
  const constant = split.tokens.find(t => t.text === '@split_list_input')!
  assert.equal(constant.kind, 'const')
  assert.equal(constant.value, '(one two three)')
})

test('HTNGeneratedEventDebuggerTest ExplicitSplitListOperationsPreserveTheirNames (:2439)', () => {
  const w = world(atomListDemoFacts)
  for (const [method, title] of [
    ['split_list_front_basic', '(split_list_front @split_list_input ?element ?remainder)'],
    ['split_list_back_basic', '(split_list_back @split_list_input ?remainder ?element)']
  ]) {
    const { run } = record(atomListDemoDomain, w, method, testCallterms(w))
    assert.equal(run.nodes.find(n => n.kind === 'split')?.name, title)
  }
})

test('HTNGeneratedEventDebuggerTest SplitListConditionTreePreservesSourceOrderAndCompositeStructure (:2482)', () => {
  const branch = (method: string, name: string) => {
    const w = world(atomListDemoFacts)
    const { run, result } = record(atomListDemoDomain, w, method, testCallterms(w))
    assert.equal(result.status, 'succeeded')
    const b = run.nodes.find(n => n.kind === 'branch' && n.name === `(${name} ...)` && n.started)!
    return { run, b, kids: b.children.map(i => run.nodes[i]) }
  }
  {
    const { run, kids } = branch('split_list_empty_fails', 'unexpected')
    assert.equal(kids.length, 1)
    assert.equal(kids[0].kind, 'and')
    const [clear, split] = kids[0].children.map(i => run.nodes[i])
    assert.equal(kids[0].children.length, 2)
    assert.equal(clear.kind, 'assign') // upstream CallBind
    assert.equal(split.kind, 'split')
    assert.ok(clear.started && split.started)
  }
  {
    const { run, kids } = branch('split_list_bound_outputs', 'compatible')
    assert.deepEqual(kids.map(k => k.kind), ['and', 'task'])
    assert.equal(kids[1].name, '(!bound_outputs_match)')
    assert.equal(kids[0].children.length, 1)
    const split = run.nodes[kids[0].children[0]]
    assert.equal(split.kind, 'split')
    assert.ok(split.started)
  }
  {
    const { run, kids } = branch('split_list_rollback', 'fails_after_binding')
    assert.equal(kids.length, 1)
    const [split, cmp] = kids[0].children.map(i => run.nodes[i])
    assert.equal(split.kind, 'split')
    assert.equal(cmp.kind, 'cmp')
    assert.ok(split.started && cmp.started)
  }
})

test('HTNGeneratedEventDebuggerTest AxiomChoiceBacktrackingRestoresBindingsAndCompletesLifecycle (:2585)', () => {
  const w = world(humanAxiomBacktrackingFacts)
  const { run, result } = record(humanDomain, w, 'behave', testCallterms(w))
  assert.equal(result.status, 'succeeded')
  checkCapture(run)
  const plans = run.nodes.filter(n => n.kind === 'plan')
  assert.equal(plans.length, 1)
  assert.ok(plans[0].completed && plans[0].succeeded && plans[0].parent === -1)
  assert.ok(run.nodes.filter(n => n.kind === 'method' && n.started).length > 1)
  const foods = run.nodes.flatMap(n => n.after.filter(b => b.name === 'food').map(b => formatAtom(b.value)))
  assert.ok(foods.includes('"banana"'), 'the first candidate is in the history')
  assert.ok(foods.includes('"orange"'), 'the candidate after backtracking is too')
  const takes = result.plan.filter(s => s.name === '!take').map(s => formatAtom(s.args[0]))
  assert.ok(takes.includes('"orange"'))
  assert.ok(!takes.includes('"banana"'))
})

test('HTNGeneratedDebuggerTest BacktrackedConditionsKeepGeneratedMetadataPaths (:2698)', () => {
  const w = world(complexScenarioRecursive100Facts)
  const { run, result } = record(complexScenarioDomain, w, 'run_scenario', testCallterms(w))
  assert.equal(result.status, 'succeeded')
  const branch = run.nodes.filter(n => n.kind === 'branch' && n.name === '(branch_iterate_all_entities ...)').pop()!
  const and = branch.children.map(i => run.nodes[i]).find(n => n.kind === 'and')!
  assert.ok(and.children.length >= 2)
  const count = run.nodes[and.children[1]]
  assert.equal(count.kind, 'fact')
  assert.ok(count.started && count.completed)
})

test('HTNGeneratedEventDebuggerTest NestedTaskCallsPreserveDomainExpressionsInTaskTitles (:2321)', () => {
  const w = world(calltermsFacts)
  const { run, result } = record(nestedCallsDomain, w, 'test_nested_calls', testCallterms(w))
  assert.equal(result.status, 'succeeded')
  const tasks = run.nodes.filter(n => n.kind === 'task')
  const capture = tasks.find(n => n.name.includes('!capture (call add (call inc 1)'))!
  const consume = tasks.find(n => n.name.includes('consume_nested (call add (call inc 4)'))!
  assert.equal(capture.tokens[1].kind, 'call')
  assert.equal(consume.tokens[1].kind, 'call')
})

// ---- ours ----------------------------------------------------------------------------------------------------

test('runs: metadata, a world snapshot per revision, deferred expansions apart', () => {
  const w = world(hierarchicalBacktrackingNoCombatFacts)
  let now = 100
  const rec = new PlanTraceRecorder(hierarchicalBacktrackingDomain, { time: () => now, keep: 2 })
  const runner = new PlanRunner(hierarchicalBacktrackingDomain, w, { trace: rec })
  assert.equal(runner.plan('validate_fact_backtracking'), 'succeeded')
  const first = rec.lastPlan!
  assert.equal(first.seq, 1)
  assert.equal(first.deferred, false)
  assert.equal(hierarchicalBacktrackingDomain.methods[first.method].name, 'validate_fact_backtracking')
  assert.equal(first.status, 'succeeded')
  assert.deepEqual(first.plan.map(s => s.name), ['!selected_fact'])
  assert.equal(first.t, 100)
  assert.ok(first.ms >= 0)
  assert.equal(first.world, w.revision)
  assert.deepEqual(rec.world(first.world)?.tables['candidate/1'], [[sym('first')], [sym('second')]])

  now = 101
  w.clear('acceptable', 1)
  w.add('acceptable', str('nobody'))
  assert.equal(runner.plan('validate_fact_backtracking'), 'succeeded')
  const second = rec.lastPlan!
  assert.equal(second.seq, 2)
  assert.notEqual(second.world, first.world)
  assert.deepEqual(second.plan.map(s => s.name), ['!fact_fallback'])
  runner.plan('validate_fact_backtracking')
  assert.deepEqual(rec.runs.map(r => r.seq), [2, 3])
  assert.ok(rec.world(second.world))
})

// ---- the Normal / Verbose projection (htn/trace-view.ts, HTNGeneratedDebuggerView.h) ---------------------------

/** Rows as text: indent, mark, name, [choice i/n], retry xN, (closed). */
function rows(run: PlanRun, mode: ViewMode = 'normal', state: ViewState = {}): string[] {
  return viewRows(run, mode, state).map(r => {
    const n = run.nodes[r.node]
    const ok = r.ok === null ? (n.started ? '…' : '·') : r.ok ? '✓' : '✗'
    const choice = r.choice >= 0 ? ` [${r.choice + 1}/${r.choices}]` : ''
    const retry = r.retries > 1 ? ` retry x${r.retries}` : ''
    const closed = r.collapsible && !r.open ? ' (closed)' : ''
    return `${'  '.repeat(r.depth)}${ok} ${n.name}${choice}${retry}${closed}`
  })
}

test('Normal: a fact matched twice becomes choice rows; the committed one is expanded, the others hidden', () => {
  const { run } = record(hierarchicalBacktrackingDomain, world(hierarchicalBacktrackingNoCombatFacts), 'validate_fact_backtracking')
  // HTNGeneratedDebuggerView.h :318-381 (choice rows), :776-804 (only the expanded candidate is listed).
  assert.deepEqual(rows(run), [
    '✓ (validate_fact_backtracking)',
    '  ✓ (:method (validate_fact_backtracking) ...)',
    '    ✓ (branch_selected ...)',
    '      ✓ (and ...)',
    '        ✓ (candidate ?candidate) [2/2]',
    '          ✓ (acceptable ?candidate)',
    '      ✓ (!selected_fact ?candidate)'
  ])
  // Collapsing the committed candidate (no choice expanded) lists every candidate; the rolled-back one is a failure.
  const and = run.nodes[3].id
  assert.deepEqual(rows(run, 'normal', { choice: new Map([[and, -1]]) }).slice(4, 8), [
    '        ✗ (candidate ?candidate) [1/2] (closed)',
    '        ✓ (candidate ?candidate) [2/2]',
    '          ✓ (acceptable ?candidate)',
    '      ✓ (!selected_fact ?candidate)'
  ])
  const first = run.nodes[3].children[0]
  assert.deepEqual(rows(run, 'normal', { choice: new Map([[and, -1]]), open: new Map([[first, true]]) }).slice(4, 6), [
    '        ✗ (candidate ?candidate) [1/2]',
    '          ✗ (acceptable ?candidate)'
  ])
  // Verbose: the raw event tree.
  assert.deepEqual(rows(run, 'verbose').slice(3), [
    '      ✓ (and ...)',
    '        ✓ (candidate ?candidate)',
    '        ✗ (acceptable ?candidate)',
    '        ✓ (candidate ?candidate)',
    '        ✓ (acceptable ?candidate)',
    '      ✓ (!selected_fact ?candidate)'
  ])
})

test('Normal: retried conditions keep their latest attempt with retry xN; an axiom call site shows its body', () => {
  const { run } = record(hierarchicalBacktrackingDomain, world(hierarchicalBacktrackingNoCombatFacts), 'validate_axiom_backtracking')
  // :383-404 (latest visit, attempt count), :446-488 (no choice below a single path: the attempt count), :658-661
  // (an axiom is closed by default in Normal), :409-444 (the axiom scope is flattened away).
  assert.deepEqual(rows(run).slice(3), [
    '      ✓ (and ...)',
    '        ✓ (#find_candidate ?candidate) retry x2 (closed)',
    '        ✓ (acceptable ?candidate) retry x2',
    '      ✓ (!selected_axiom ?candidate)'
  ])
  const site = run.nodes.filter(n => n.kind === 'axiom' && !n.impl)[1].id
  assert.deepEqual(rows(run, 'normal', { open: new Map([[site, true]]) }).slice(4, 7), [
    '        ✓ (#find_candidate ?candidate) retry x2',
    '          ✓ (and ...)',
    '            ✓ (candidate ?out_candidate)'
  ])
  // Verbose keeps every node but still flattens the axiom scope (:315); it opens what leads to a success.
  assert.deepEqual(rows(run, 'verbose').slice(4, 8), [
    '        ✓ (#find_candidate ?candidate)',
    '          ✓ (and ...)',
    '            ✓ (candidate ?out_candidate)',
    '        ✗ (acceptable ?candidate)'
  ])
})

test('Normal: a failed branch is closed, the branch on the execution path open; skipped terms only in Verbose', () => {
  const { run } = record(hierarchicalBacktrackingDomain, world(hierarchicalBacktrackingNoCombatFacts), 'validate_child_guard')
  assert.deepEqual(rows(run).slice(4), [
    '        ✓ (:method (do_behavior_child_guard ?inp_threat) ...)',
    '          ✗ (branch_combat ...) (closed)',
    '          ✓ (branch_search ...)',
    '            ✓ (do_search ?inp_threat)',
    '              ✓ (:method (do_search ?inp_threat) ...)',
    '                ✓ (branch_search ...)',
    '                  ✓ (!search ?inp_threat)'
  ])
  const skipped = record(nestedOperatorCallsDomain, new WorldState(), 'debugger_skipped', { callterms: { distance: () => int(0) } }).run
  assert.deepEqual(rows(skipped).slice(2), ['    ✗ (branch ...) (closed)'])
  const open = { open: new Map([[2, true]]) }
  assert.deepEqual(rows(skipped, 'normal', open).slice(3), ['      ✗ (and ...)', '        ✗ (absent_fact)'])
  assert.deepEqual(rows(skipped, 'verbose', open).slice(3), ['      ✗ (and ...)', '        ✗ (absent_fact)', '        · (< (call distance) 0.2)'])
})

// ---- the debugger never changes planning (GENERATED_DEBUGGER.md "Runtime boundary") ------------------------------

test('every gallery and lab scenario plans the same with a recorder; every capture is balanced and projects', () => {
  let runs = 0
  for (const station of [...GALLERY_STATIONS, ...LAB_STATIONS]) {
    for (const s of station.scenarios) {
      const plan = (traced: boolean) => {
        const w = new WorldState()
        s.setup(w)
        const host = s.context?.(w) ?? station.host?.(w) ?? { world: w }
        const rec = traced ? new PlanTraceRecorder(s.domain ?? station.domain) : undefined
        const r = decompose(s.domain ?? station.domain, w, s.method, s.args ?? [], {
          callterms: s.callterms ?? galleryCallterms,
          calltermErrorPolicy: 'fail_silently',
          context: host,
          mode: s.mode,
          maxDepth: s.maxDepth,
          trace: rec
        })
        return { status: r.status, plan: r.plan.map(p => formatTask(p.name, p.args)), run: rec?.lastPlan ?? null }
      }
      const plain = plan(false)
      const traced = plan(true)
      const label = `${station.id}: ${s.name}`
      assert.equal(traced.status, plain.status, label)
      assert.deepEqual(traced.plan, plain.plan, label)
      if (plain.status === 'invalid_call') continue
      const run = traced.run!
      checkCapture(run)
      assert.equal(run.nodes[0].succeeded, plain.status === 'succeeded', label)
      const rows = viewRows(run)
      assert.ok(rows.length > 0 && rows.length <= run.nodes.length, label)
      assert.ok(viewRows(run, 'verbose').length >= rows.length, label)
      runs++
    }
  }
  assert.ok(runs > 200, `${runs} scenarios`)
})

test('a fact retried after another call of its axiom starts from its own first Before', () => {
  // The next try of a choice point repeats the Before of its own first try (.inl :210-212 roll back, then BEGIN),
  // not of the latest node of that condition, which may belong to a later call of the same axiom.
  const r = compile(`(:domain Twice top_level_domain
  (:axiom (pick ?inp_k ?out_x) (and (item ?out_x) (ok ?inp_k ?out_x)))
  (:method (go) top_level_method
    (b (and (#pick 1 ?x) (#pick 2 ?y) (pair ?x ?y)) ((!ok ?x ?y)))))`)
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('; '))
  const w = new WorldState()
  for (const item of ['a', 'b']) {
    w.add('item', sym(item))
    w.add('ok', int(1), sym(item))
    w.add('ok', int(2), sym(item))
  }
  w.add('pair', sym('b'), sym('a'))
  const { run, result } = record(r.ir, w, 'go')
  assert.deepEqual(result.plan.map(s => formatTask(s.name, s.args)), ['!ok b a'])
  checkCapture(run)
  const scopeOf = (n: DebugNode): DebugNode => (run.nodes[n.parent].impl ? run.nodes[n.parent] : scopeOf(run.nodes[n.parent]))
  const tries = run.nodes.filter(n => n.started && n.name === '(item ?out_x)')
  assert.ok(tries.length >= 4)
  for (const n of tries) assert.equal(bound(n.before), bound(scopeOf(n).before).split(' ')[0], `node ${n.id}`)
})
