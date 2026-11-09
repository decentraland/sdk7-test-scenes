// The engine's buffers are reused run after run (engine.ts header: no allocation per decomposition once warm). These
// tests hold the reuse to "nothing changes": a runner that planned many times plans exactly as a fresh engine does
// (plan, status, counters, trace), whatever it planned before and wherever the last run stopped; and the plan steps it
// hands out again are values nobody sees change.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bool, int, list, sym, type Atom } from '../../../src/htn-planner/htn/atom'
import { decompose, newPlanStats, PlanRunner, type PlannerOptions, type PlanStep } from '../../../src/htn-planner/htn/planner'
import { PlanTraceRecorder } from '../../../src/htn-planner/htn/trace'
import { addFacts, WorldState } from '../../../src/htn-planner/htn/world-state'
import { CALLTERM_SETS } from '../../../src/examples/upstream/conformance-callterms'
import { complexScenarioDomain } from '../../../src/examples/upstream/generated/complex_scenario.htn'
import { complexScenarioCombatFacts } from '../../../src/examples/upstream/generated/complex_scenario_combat.facts'
import { complexScenarioEmergencyFacts } from '../../../src/examples/upstream/generated/complex_scenario_emergency.facts'
import { complexScenarioIdleFacts } from '../../../src/examples/upstream/generated/complex_scenario_idle.facts'
import { complexScenarioMobilityFacts } from '../../../src/examples/upstream/generated/complex_scenario_mobility.facts'
import { complexScenarioRecoveryFacts } from '../../../src/examples/upstream/generated/complex_scenario_recovery.facts'
import { complexScenarioRecursive100Facts } from '../../../src/examples/upstream/generated/complex_scenario_recursive_100.facts'
import { benchCases } from '../../../scripts/bench/suite'
import { parseDomain } from './domain-text'
import { formatStep, MODES } from './util'

const NO_ARGS: readonly Atom[] = []

/** What a decomposition produced: status, plan, counters and peak frames. */
function outcome(status: string, plan: readonly PlanStep[], options: PlannerOptions, peak: number) {
  return { status, plan: plan.map(formatStep), stats: { ...options.stats }, peak }
}

function fresh(c: { domain: Parameters<typeof decompose>[0]; method: string; args?: readonly Atom[] }, world: WorldState, options: PlannerOptions) {
  const stats = newPlanStats()
  const r = decompose(c.domain, world, c.method, c.args ?? NO_ARGS, { ...options, stats })
  // decompose() has no execution info: a fresh runner's first plan gives the peak.
  const runner = new PlanRunner(c.domain, world, { ...options })
  runner.plan(c.method, c.args ?? NO_ARGS)
  return outcome(r.status, r.plan, { stats }, runner.executionInfo.peakCallFrames)
}

test('pools: one runner per scenario, planned again and again in every backtracking mode, plans as a fresh engine does', () => {
  for (const c of benchCases()) {
    const world = c.world()
    const options: PlannerOptions = { ...(c.options?.(world) ?? {}), stats: newPlanStats() }
    const runner = new PlanRunner(c.domain, world, options)
    for (let round = 0; round < 3; round++) {
      for (const { name, mode } of MODES) {
        options.mode = mode
        const status = runner.plan(c.method, c.args ?? NO_ARGS)
        const got = outcome(status, runner.steps, options, runner.executionInfo.peakCallFrames)
        assert.deepEqual(got, fresh(c, world, { ...options, stats: undefined }), `${c.name}, ${name}, round ${round}`)
      }
    }
  }
})

test('pools: one runner over a world whose facts change between plans (the six upstream world states in turn) plans as a fresh engine does', () => {
  const worlds = [
    complexScenarioIdleFacts,
    complexScenarioRecursive100Facts,
    complexScenarioCombatFacts,
    complexScenarioEmergencyFacts,
    complexScenarioMobilityFacts,
    complexScenarioRecoveryFacts
  ]
  const world = new WorldState()
  const context = { world, vars: {}, trace: [], counters: {}, errors: [] }
  const options: PlannerOptions = { callterms: CALLTERM_SETS.test, context, stats: newPlanStats() }
  const runner = new PlanRunner(complexScenarioDomain, world, options)
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < worlds.length; i++) {
      world.clearAll()
      addFacts(world, worlds[i])
      const status = runner.plan('run_scenario')
      const got = outcome(status, runner.steps, options, runner.executionInfo.peakCallFrames)
      const c = { domain: complexScenarioDomain, method: 'run_scenario' }
      assert.deepEqual(got, fresh(c, world, { callterms: CALLTERM_SETS.test, context }), `world ${i}, round ${round}`)
    }
  }
})

test('pools: a traced runner records the same decomposition on its tenth plan as a fresh engine on its first', () => {
  for (const c of benchCases().filter(c => !c.heavy)) {
    const world = c.world()
    const base = c.options?.(world) ?? {}
    const first = new PlanTraceRecorder(c.domain, { clock: () => 0 })
    decompose(c.domain, world, c.method, c.args ?? NO_ARGS, { ...base, trace: first })
    const again = new PlanTraceRecorder(c.domain, { clock: () => 0 })
    const runner = new PlanRunner(c.domain, world, { ...base, trace: again })
    for (let i = 0; i < 10; i++) runner.plan(c.method, c.args ?? NO_ARGS)
    const nodes = (r: PlanTraceRecorder) => JSON.stringify(r.lastPlan?.nodes)
    assert.equal(nodes(again), nodes(first), c.name)
    assert.deepEqual(again.lastPlan?.plan.map(formatStep), first.lastPlan?.plan.map(formatStep), c.name)
  }
})

// Every kind of condition, axioms calling axioms, arithmetic, lists, a callterm in the middle of all of it.
const NESTED = parseDomain(`
(:domain Nested top_level_domain
  (:method (behave) top_level_method
    (deep (and (#pick ?x) (or (call boom ?x) (== ?x 0)) (= ?y (+ ?x 1)) (route ?r) (split_list ?r ?h ?t))
      ((sub ?y) (!done ?h ?t)))
    (fallback (alt (item ?x) (item2 ?x)) ((!fallback ?x))))
  (:method (sub ?inp_y)
    (loop (and (> ?inp_y 1) (call boom ?inp_y) (item ?z) (not (blocked ?z))) ((!step ?inp_y ?z) (sub (- ?inp_y 1))))
    (stop () ((!stop))))
  (:axiom (pick ?out_x) (and (item ?a) (#twice ?a ?out_x)))
  (:axiom (twice ?inp_a ?out_b) (= ?out_b (* ?inp_a 2))))`)

test('pools: a callterm that throws in the middle of a decomposition leaves nothing behind; the next plans are a fresh engine\'s', () => {
  const world = new WorldState()
  for (const v of [1, 2, 3]) world.add('item', int(v))
  world.add('blocked', int(2))
  world.add('route', list(int(7), int(8)))
  let armed = 0
  const callterms = {
    boom: (args: readonly Atom[]) => {
      if (armed > 0 && --armed === 0) throw new Error('host bug')
      return bool(args[0].v !== 2)
    }
  }
  const options: PlannerOptions = { callterms, stats: newPlanStats() }
  const runner = new PlanRunner(NESTED, world, options)
  const expected = fresh({ domain: NESTED, method: 'behave' }, world, { callterms })
  assert.equal(expected.status, 'succeeded')
  assert.deepEqual(expected.plan, ['!step 5 1', '!step 4 1', '!step 3 1', '!stop', '!done 7 (8)'])
  for (const at of [1, 2, 4, 6]) {
    armed = at // throw on the at-th call: deep in the axioms, the `or` and the continuations
    assert.throws(() => runner.plan('behave'), /host bug/)
    armed = 0
    const status = runner.plan('behave')
    assert.deepEqual(outcome(status, runner.steps, options, runner.executionInfo.peakCallFrames), expected, `after a throw at call ${at}`)
  }
})

const STEPS = parseDomain(`
(:domain Steps top_level_domain
  (:method (behave) top_level_method
    (go (and (target ?t) (flag ?f)) ((look ?t) (!walk ?t ?f) (!walk ?t 2) (&recheck ?t))))
  (:method (look ?inp_t) (any () ((!face ?inp_t))))
  (:method (recheck ?inp_t) (any () ((look ?inp_t)))))`)

function stepsWorld(): WorldState {
  const world = new WorldState()
  world.add('target', sym('a'))
  world.add('flag', bool(true))
  return world
}

test('plan steps: a steady replan hands out the same step objects; a step whose arguments changed is a new one, the rest stay', () => {
  const world = stepsWorld()
  const runner = new PlanRunner(STEPS, world)
  assert.equal(runner.plan('behave'), 'succeeded')
  const first = runner.steps
  assert.deepEqual(first.map(formatStep), ['!face a', '!walk a 1', '!walk a 2', '&recheck a'])
  runner.plan('behave')
  const second = runner.steps
  assert.notEqual(second, first, 'steps is a copy')
  second.forEach((s, i) => assert.equal(s, first[i], `step ${i} is the same object`))

  // INT 1 equals BOOL true for atomEquals, not for reuse: the new step keeps the new type.
  world.set('flag', int(1))
  runner.plan('behave')
  const third = runner.steps
  assert.deepEqual(third.map(formatStep), ['!face a', '!walk a 1', '!walk a 2', '&recheck a'])
  assert.equal(third[0], first[0])
  assert.notEqual(third[1], first[1], 'the changed step is new')
  assert.equal(third[1].args[1].t, 'int')
  assert.equal(third[2], first[2])
  assert.equal(third[3], first[3])
  // And the step a host kept is untouched.
  assert.equal(first[1].args[1].t, 'bool')
  assert.deepEqual(first.map(formatStep), ['!face a', '!walk a 1', '!walk a 2', '&recheck a'])
})

test('plan steps: a failed plan does not disturb the steps of the plan before it, nor the next equal plan', () => {
  const world = stepsWorld()
  const runner = new PlanRunner(STEPS, world)
  runner.plan('behave')
  const kept = runner.steps
  world.clear('target', 1)
  assert.equal(runner.plan('behave'), 'no_plan')
  assert.deepEqual(runner.steps, [])
  assert.deepEqual(kept.map(formatStep), ['!face a', '!walk a 1', '!walk a 2', '&recheck a'])
  world.add('target', sym('a'))
  runner.plan('behave')
  runner.steps.forEach((s, i) => assert.equal(s, kept[i]))
})

test('plan steps: a deferred expansion makes new steps, never one already in the plan', () => {
  const runner = new PlanRunner(STEPS, stepsWorld())
  runner.plan('behave')
  const face = runner.current()
  assert.ok(face)
  for (let i = 0; i < 3; i++) {
    assert.equal(runner.resolve(), 'ready')
    runner.complete()
  }
  assert.equal(runner.resolve(), 'ready') // &recheck a -> look a -> !face a: the same task as the first step
  const again = runner.current()
  assert.ok(again)
  assert.equal(formatStep(again), '!face a')
  assert.notEqual(again, face, 'a new step object')
  runner.complete()
  assert.equal(runner.resolve(), 'completed')
})

test('plan steps: resolve() expands in place, at the cursor, into zero, one or several steps', () => {
  const domain = parseDomain(`
(:domain Expand top_level_domain
  (:method (behave) top_level_method
    (go () ((!a) (&none) (!b) (&one) (!c) (&many) (!d))))
  (:method (none) (x () ()))
  (:method (one) (x () ((!one))))
  (:method (many) (x () ((!m1) (&none) (!m2) (!m3)))))`)
  const runner = new PlanRunner(domain, new WorldState())
  runner.plan('behave')
  const seen: string[] = []
  for (let i = 0; i < 20 && runner.resolve() === 'ready'; i++) {
    seen.push(formatStep(runner.current() as PlanStep))
    runner.complete()
  }
  assert.deepEqual(seen, ['!a', '!b', '!one', '!c', '!m1', '!m2', '!m3', '!d'])
  assert.equal(runner.resolve(), 'completed')
})
