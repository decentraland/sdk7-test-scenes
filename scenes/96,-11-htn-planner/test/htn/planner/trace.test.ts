import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAtom, sym } from '../../../src/htn-planner/htn/atom'
import { decompose, PlanRunner } from '../../../src/htn-planner/htn/planner'
import { branchAttempts, chosenPath, formatBound, formatCond, PlanTraceRecorder, rootMethod, skipRuns } from '../../../src/htn-planner/htn/trace'
import { WorldState } from '../../../src/htn-planner/htn/world-state'
import { fixture, parseDomain, parseWorld } from './domain-text'

const lamp = parseDomain(`
(:domain Lamp
    (:method (behave) top_level_method
        (fix_light (and (lamp off) (switch_at ?where)) ((!move_to ?where) (press ?where)))
        (rest () ((!sit 2.0) (&behave)))
    )
    (:method (press ?inp_where)
        (stuck (and (stuck ?inp_where)) ((!kick)))
        (normal () ((!switch_on)))
    )
)`)

test('the recorder keeps the branch tree: misses, the chosen branch, its bindings and nested methods', () => {
  const world = new WorldState()
  world.add('lamp', sym('off'))
  world.add('switch_at', sym('wall'))
  const rec = new PlanTraceRecorder(lamp)
  const r = decompose(lamp, world, 'behave', [], { trace: rec })
  assert.equal(r.status, 'succeeded')
  const run = rec.lastPlan!
  assert.equal(run.status, 'succeeded')
  assert.equal(run.plan.length, 2)
  const root = rootMethod(run)!
  assert.equal(lamp.methods[root.ref].name, 'behave')
  const attempts = branchAttempts(run, root, rec.graph)
  assert.deepEqual(attempts.map(a => [a.branch, a.outcome]), [[0, 'chosen']])
  assert.equal(formatBound(attempts[0].node.after), '?where=wall')
  const press = attempts[0].children[0]
  assert.deepEqual(branchAttempts(run, press, rec.graph).map(a => a.outcome), ['no_match', 'chosen'])
  assert.deepEqual(chosenPath(run, lamp), ['behave.fix_light', 'press.normal'])
  assert.equal(rec.chosenBranch, 'fix_light')

  world.set('lamp', sym('on'))
  decompose(lamp, world, 'behave', [], { trace: rec })
  const again = rec.lastPlan!
  assert.deepEqual(branchAttempts(again, rootMethod(again)!, rec.graph).map(a => a.outcome), ['no_match', 'chosen'])
  assert.equal(rec.chosenBranch, 'rest')
})

test('deferred expansions are recorded apart from the top-level plan', () => {
  const world = new WorldState()
  world.add('lamp', sym('on'))
  const rec = new PlanTraceRecorder(lamp)
  const runner = new PlanRunner(lamp, world, { trace: rec })
  assert.equal(runner.plan('behave'), 'succeeded')
  const planSeq = rec.lastPlan!.seq
  runner.complete() // !sit
  world.set('lamp', sym('off')) // fix_light still needs switch_at: &behave rests again
  assert.equal(runner.resolve(), 'ready')
  assert.equal(rec.lastPlan!.seq, planSeq)
  assert.equal(rec.lastDeferred!.deferred, true)
  assert.equal(rec.lastDeferred!.status, 'succeeded')
  const deferred = rec.lastDeferred!
  assert.deepEqual(branchAttempts(deferred, rootMethod(deferred)!, rec.graph).map(a => a.outcome), ['no_match', 'chosen'])
})

test('a branch whose tasks fail is marked abandoned before the next one is chosen', () => {
  const demo = parseDomain(fixture('Domains/RuntimeBacktrackingDemo.domain'))
  const world = parseWorld(fixture('WorldStates/RuntimeBacktrackingDemo.worldstate'))
  const rec = new PlanTraceRecorder(demo)
  decompose(demo, world, 'demo_hierarchical_branches', [], { trace: rec })
  const run = rec.lastPlan!
  const attempts = branchAttempts(run, rootMethod(run)!, rec.graph)
  assert.deepEqual(attempts.map(a => a.outcome), ['abandoned', 'chosen'])
  assert.equal(attempts[0].children[0].succeeded, false)
  assert.deepEqual(chosenPath(rec.lastPlan, demo), ['demo_hierarchical_branches.safe_path'])
})

test('formatCond prints conditions in domain syntax', () => {
  const d = parseDomain(`
(:domain Fmt
    (:method (go ?inp_n) top_level_method
        (a (and (box ?id ?any_pos) (> (- ?inp_n 1) 0) (not (done ?id))) ((!x)))
        (b () ((!y)))
    )
)`)
  const [a, b] = d.methods[0].branches
  assert.equal(formatCond(d, a.cond, a.vars), '(box ?id _) and (> (- ?inp_n 1) 0) and (not (done ?id))')
  assert.equal(formatCond(d, b.cond, b.vars), 'always')
  assert.equal(formatAtom(sym('ok')), 'ok')
})

test('skipRuns: the runs of a check method do not reach the recorder; the others do, deferred ones too', () => {
  const checked = parseDomain(`
(:domain Checked
    (:method (behave) top_level_method
        (work () ((!work) (&behave)))
    )
    (:method (active_plan) top_level_method
        (working_valid (running work) ())
    )
)`)
  const rec = new PlanTraceRecorder(checked)
  const world = new WorldState()
  const trace = skipRuns(rec, checked, ['active_plan'])
  const behave = new PlanRunner(checked, world, { trace })
  const check = new PlanRunner(checked, world, { trace })
  assert.equal(behave.plan('behave'), 'succeeded')
  world.add('running', sym('work'))
  for (let i = 0; i < 20; i++) assert.equal(check.plan('active_plan'), 'succeeded')
  world.clear('running', 1)
  assert.equal(check.plan('active_plan'), 'no_plan')
  assert.deepEqual(rec.runs.map(r => checked.methods[r.method].name), ['behave'])
  assert.equal(rec.chosenBranch, 'work')
  behave.complete()
  assert.equal(behave.resolve(), 'ready')
  assert.deepEqual(rec.runs.map(r => `${checked.methods[r.method].name}${r.deferred ? ' deferred' : ''}`), ['behave', 'behave deferred'])
})
