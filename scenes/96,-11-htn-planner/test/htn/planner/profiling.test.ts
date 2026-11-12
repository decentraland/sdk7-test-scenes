// Structural counters (upstream HTNGeneratedProfiling.h:65-82, --generated-execution-profiling) and execution info
// (upstream get_execution_info, HTNGeneratedPlanner.h:98-109, GENERATED_RECURSION.md:100-103).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bool, int, sym } from '../../../src/htn-planner/htn/atom'
import { decompose, newPlanStats, PlanRunner, type PlanStats, type RuntimeDiagnostic } from '../../../src/htn-planner/htn/planner'
import { DEFAULT_MAX_DEPTH } from '../../../src/htn-planner/htn/engine'
import { PlanTraceRecorder } from '../../../src/htn-planner/htn/trace'
import { addFacts, WorldState } from '../../../src/htn-planner/htn/world-state'
import { CALLTERM_SETS } from '../../../src/examples/upstream/conformance-callterms'
import { aaaCombatDomain } from '../../../src/examples/upstream/generated/AAACombatNPC.htn'
import { aaaCombatNPCHighOrderFacts } from '../../../src/examples/upstream/generated/AAACombatNPC_high_order.facts'
import { complexScenarioDomain } from '../../../src/examples/upstream/generated/complex_scenario.htn'
import { complexScenarioCombatFacts } from '../../../src/examples/upstream/generated/complex_scenario_combat.facts'
import { complexScenarioRecursive100Facts } from '../../../src/examples/upstream/generated/complex_scenario_recursive_100.facts'
import { fixture, parseDomain } from './domain-text'
import { MODES } from './util'

const scan = parseDomain(`
(:domain Scan top_level_domain
  (:method (m) top_level_method
    (first (and (enemy ?e) (armed ?e)) ((!attack ?e)))
    (fallback () ((!idle)))))`)

function scanWorld(): WorldState {
  const w = new WorldState()
  for (const e of [1, 2, 3]) w.add('enemy', int(e))
  w.add('armed', int(3))
  return w
}

const ZERO: PlanStats = newPlanStats()

test('counters are off by default: no stats object, the runner reports none', () => {
  const runner = new PlanRunner(scan, scanWorld())
  assert.equal(runner.plan('m'), 'succeeded')
  assert.equal(runner.stats, null)
  for (const v of Object.values(ZERO)) assert.equal(v, 0)
})

test('fact counters: queries, rows tested / matched, choice points and retries, as upstream names them', () => {
  const stats = newPlanStats()
  const r = decompose(scan, scanWorld(), 'm', [], { stats })
  assert.deepEqual(r.plan.map(s => s.args[0].v), [3])
  // (enemy ?e) is a choice point: one query, then a retry per rejected row (upstream calls its choice helper once per
  // solution index, HTNCCodeGenerator.cpp:888-889). (armed ?e) has ?e bound: a deterministic fact, a query each time.
  assert.deepEqual(
    { q: stats.factQueries, cp: stats.factChoicePoints, retry: stats.factChoiceRetries, tested: stats.factRowsTested, matched: stats.factRowsMatched },
    { q: 6, cp: 1, retry: 2, tested: 6, matched: 4 }
  )
  assert.deepEqual(
    { methods: stats.methods, branches: stats.branches, tasks: stats.tasks, conditions: stats.conditions, bindings: stats.bindings, unbinds: stats.unbinds },
    { methods: 1, branches: 1, tasks: 1, conditions: 5, bindings: 3, unbinds: 2 }
  )
})

test('method, branch, task, axiom and callterm counters', () => {
  const d = parseDomain(`
(:domain Calls top_level_domain
  (:method (m) top_level_method
    (never (and (missing_fact)) ((!no)))
    (fails_later () ((sub) (!unreachable)))
    (works (and (#good ?x) (call ok ?x)) ((sub2 ?x))))
  (:method (sub) (only (and (call no)) ((!x))))
  (:method (sub2 ?inp_x) (only () ((!y ?inp_x) (!z))))
  (:axiom (good ?out_x) (and (thing ?out_x))))`)
  const w = new WorldState()
  w.add('thing', int(7))
  const stats = newPlanStats()
  const r = decompose(d, w, 'm', [], { stats, callterms: { ok: () => bool(true), no: () => bool(false) } })
  assert.equal(r.status, 'succeeded')
  assert.deepEqual(r.plan.map(s => s.name), ['!y', '!z'])
  assert.equal(stats.methods, 3) // m, sub (fails), sub2
  assert.equal(stats.branches, 5) // never, fails_later, works, sub/only, sub2/only
  assert.equal(stats.branchRetries, 2) // branch conditions that failed: never, sub/only (upstream BRANCH_RETRY)
  assert.equal(stats.branchBacktracks, 1) // fails_later's task failed: the method tried its next branch
  assert.equal(stats.tasks, 4) // (sub), (sub2 ?x), !y, !z
  assert.equal(stats.compoundTasks, 2)
  assert.equal(stats.axioms, 1)
  assert.equal(stats.callterms, 2)
})

test('counters restart with every decomposition and never change the plan (gallery domains, every mode, with a recorder)', () => {
  const cases = [
    { domain: complexScenarioDomain, facts: complexScenarioRecursive100Facts, method: 'run_scenario' },
    { domain: complexScenarioDomain, facts: complexScenarioCombatFacts, method: 'run_scenario' },
    { domain: aaaCombatDomain, facts: aaaCombatNPCHighOrderFacts, method: 'run' }
  ]
  for (const c of cases) {
    const w = new WorldState()
    addFacts(w, c.facts)
    for (const { mode } of MODES) {
      const o = { mode, callterms: CALLTERM_SETS.test, context: { world: w, vars: {}, trace: [], counters: {}, errors: [] } }
      const plain = decompose(c.domain, w, c.method, [], o)
      const stats = newPlanStats()
      const counted = decompose(c.domain, w, c.method, [], { ...o, stats })
      assert.deepEqual(counted, plain)
      const first = { ...stats }
      assert.ok(first.methods > 0 && first.tasks > 0 && first.factQueries > 0)
      decompose(c.domain, w, c.method, [], { ...o, stats })
      assert.deepEqual({ ...stats }, first, 'the same plan counts the same')
      const rec = new PlanTraceRecorder(c.domain, { worlds: false })
      assert.deepEqual(decompose(c.domain, w, c.method, [], { ...o, stats, trace: rec }), plain)
      assert.deepEqual({ ...stats }, first, 'a recorder does not change the counts')
    }
  }
})

test('PlanRunner.stats: the counters of its last decomposition (deferred expansions included)', () => {
  const d = parseDomain(`
(:domain Def top_level_domain
  (:method (m) top_level_method (b () ((!a) (&later))))
  (:method (later) (b (and (thing ?x)) ((!b ?x)))))`)
  const w = new WorldState()
  w.add('thing', int(1))
  const stats = newPlanStats()
  const runner = new PlanRunner(d, w, { stats })
  runner.plan('m')
  assert.equal(runner.stats, stats)
  assert.equal(stats.methods, 1)
  assert.equal(stats.factQueries, 0)
  runner.complete()
  assert.equal(runner.resolve(), 'ready')
  assert.equal(stats.methods, 1)
  assert.equal(stats.factQueries, 1)
})

// ---- execution info -------------------------------------------------------------------------------------------

const recursion = parseDomain(fixture('Domains/Test/recursion_dispatch.domain'))
const depthWorld = (n: number) => {
  const w = new WorldState()
  w.add('depth', int(n))
  return w
}

/** The smallest maxDepth that plans: the call frames the decomposition needs (runner.test.ts). */
function framesNeeded(world: WorldState, method: string): number {
  let lo = 1
  let hi = 1 << 16
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (decompose(recursion, world, method, [], { maxDepth: mid, callterms: { visit: () => bool(true) } }).status === 'succeeded') hi = mid
    else lo = mid + 1
  }
  return lo
}

test('execution info: capacity, peak call frames (exactly the frames the plan needs), no error; always on', () => {
  for (const [method, depth] of [['non_tail', 10], ['non_tail', 100], ['mutual', 50], ['deep_failure', 20]] as const) {
    const world = depthWorld(depth)
    const runner = new PlanRunner(recursion, world, { callterms: { visit: () => bool(true) } })
    assert.equal(runner.executionInfo.peakCallFrames, 0, 'nothing planned yet')
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal(runner.plan(method), 'succeeded')
      const info = runner.executionInfo
      assert.equal(info.callFrameCapacity, DEFAULT_MAX_DEPTH)
      assert.equal(info.peakCallFrames, framesNeeded(world, method), `${method} ${depth}`)
      assert.equal(info.lastError, null)
    }
  }
})

test('execution info: a capacity failure peaks at the limit with a descriptive error; reuse resets both', () => {
  // HTNGeneratedEquivalenceTest.cpp:3165 CapacityFailureLeavesStorageReusable, GENERATED_RECURSION.md:146-148.
  const world = depthWorld(5000)
  const seen: RuntimeDiagnostic[] = []
  const runner = new PlanRunner(recursion, world, { callterms: { visit: () => bool(true) }, onDiagnostic: d => seen.push(d) })
  assert.equal(runner.plan('non_tail'), 'depth_exceeded')
  const info = runner.executionInfo
  assert.equal(info.peakCallFrames, DEFAULT_MAX_DEPTH)
  assert.equal(info.lastError?.code, 'depth_exceeded')
  assert.match(info.lastError?.message ?? '', /Domain 'recursion_dispatch' exceeded its call-frame capacity \(8192\)/)
  assert.deepEqual(seen.map(d => d.code), ['depth_exceeded'])
  world.set('depth', int(2))
  assert.equal(runner.plan('non_tail'), 'succeeded')
  assert.equal(runner.executionInfo.lastError, null)
  assert.ok(runner.executionInfo.peakCallFrames > 0 && runner.executionInfo.peakCallFrames < 16)
  const small = new PlanRunner(recursion, depthWorld(10), { maxDepth: 12 })
  assert.equal(small.plan('non_tail'), 'depth_exceeded')
  assert.deepEqual({ ...small.executionInfo, lastError: small.executionInfo.lastError?.code }, { callFrameCapacity: 12, peakCallFrames: 12, lastError: 'depth_exceeded' })
})

test('execution info: the last runtime error of the decomposition, even without onDiagnostic; invalid calls reset it', () => {
  const d = parseDomain(`
(:domain Err top_level_domain
  (:method (m) top_level_method (b (and (== (/ 1 0) 0)) ((!a))) (c () ((!b)))))`)
  const runner = new PlanRunner(d, new WorldState())
  assert.equal(runner.plan('m'), 'succeeded')
  assert.equal(runner.executionInfo.lastError?.code, 'arithmetic_error')
  assert.equal(runner.executionInfo.peakCallFrames, 2)
  assert.equal(runner.plan('nope'), 'invalid_call')
  assert.deepEqual(runner.executionInfo, { callFrameCapacity: DEFAULT_MAX_DEPTH, peakCallFrames: 0, lastError: null })
  assert.equal(runner.plan('m', [sym('x')]), 'invalid_call')
})
