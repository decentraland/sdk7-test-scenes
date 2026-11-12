// Why the shown run was planned and whether it still fits (src/debugger/replan-rows.ts): the replan that made a run,
// its line (trigger, wait, the facts that changed, the outcome), the drift of the run against the world now.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decompose, PlanTraceRecorder, sym, WorldState } from '../../src/htn-planner'
import type { AgentLogEntry, PlanRun, ReplanEvent } from '../../src/htn-planner'
import { compileDomainSource } from '../../tools/htn/compiler'
import { driftText, replanFor, replanText, runDrift } from '../../src/debugger/replan-rows'

const run = (seq: number, t: number, deferred = false): PlanRun => ({ seq, t, deferred, method: 0, args: [], status: 'succeeded', plan: [], ms: 0, world: 0, nodes: [] })
const replan = (reason: string, extra: Partial<ReplanEvent> = {}): ReplanEvent => ({ type: 'replan', guard: 'g', reason, status: 'succeeded', plan: ['!a'], kept: false, passes: 1, ...extra })

test('replanFor: the replan whose run it is (a collapsed entry by its last time); none for a deferred run', () => {
  const runs = [run(1, 1), run(2, 2), run(3, 2.5, true), run(4, 5)]
  const entries: AgentLogEntry[] = [
    { t: 1, event: replan('start') },
    { t: 2, event: { type: 'step', guard: 'g', name: '!a', args: [] } },
    { t: 3, until: 5, count: 3, event: replan('retry after no_plan') }
  ]
  assert.equal(replanFor(entries, runs, runs[0])?.reason, 'start')
  assert.equal(replanFor(entries, runs, runs[3])?.reason, 'retry after no_plan')
  assert.equal(replanFor(entries, runs, runs[1]), undefined, 'made by no replan in the ring')
  assert.equal(replanFor(entries, runs, runs[2]), undefined)
  assert.equal(replanFor(entries, runs, null), undefined)
})

test('replanText: trigger and reason, the wait, the facts that changed, the outcome', () => {
  assert.equal(
    replanText(
      replan('perception |tester -> tester|', {
        trigger: 'perception',
        also: ['facts'],
        waited: 0.25,
        budgetFrames: 2,
        changed: true,
        changes: ['- (last_seen tester (0.0 0.0 1.0) 2.0)', '+ (target_visible tester (0.0 0.0 1.0))']
      })
    ),
    'perception: remembers tester → sees tester (also facts) · waited 0.25 s (budget: 2 frames) · changed: - (last_seen tester (0.0 0.0 1.0) 2.0), + (target_visible tester (0.0 0.0 1.0)) · new plan'
  )
  assert.equal(replanText(replan('poke', { trigger: 'request', kept: true, changed: false, changes: [] })), 'request: poke · no fact the domain reads changed · running plan kept')
  assert.equal(
    replanText(replan('poke', { trigger: 'request', changed: true, changes: [], volatile: ['now', 'self_position'] })),
    'request: poke · only now, self_position changed · new plan',
    'nothing else changed: the clock is what moved'
  )
  assert.equal(replanText(replan('poke', { trigger: 'request', changes: ['+ (a)'], volatile: ['now'] })), 'request: poke · changed: + (a) · new plan', 'the volatile ones only when nothing else')
  assert.equal(replanText(replan('start', { changes: ['+ (a)', '+ (b)', '+ (c)', '+ (d)'] }), 2), 'start · changed: + (a), + (b) … +2 · new plan')
  assert.equal(replanText(replan('debug', { trigger: 'debug', changes: [] })), 'debug · no fact the domain reads changed · new plan', 'the trigger said once')
  assert.equal(replanText(replan('reload', { trigger: 'reload' })), 'reload · new plan')
  assert.equal(replanText(replan('retry after no_plan', { status: 'no_plan', plan: [] })), 'retry after no_plan · no_plan')
})

test('runDrift / driftText: all hold, then a fact gone; a failed run has none', () => {
  const r = compileDomainSource(
    'd.domain',
    '(:domain d top_level_domain (:method (behave) top_level_method (go (and (door_open ?d)) ((!walk ?d))) (idle () ((!idle)))))'
  )
  assert.ok(r.ok && r.ir, JSON.stringify(r.diagnostics))
  const world = new WorldState()
  world.add('door_open', sym('store'))
  const rec = new PlanTraceRecorder(r.ir!)
  decompose(r.ir!, world, 'behave', [], { trace: rec })
  const d = runDrift(r.ir!, rec.lastPlan, world)!
  assert.equal(driftText(d), 'all 1 facts it rests on still hold')
  world.clear('door_open', 1)
  world.add('door_open', sym('back'))
  assert.equal(driftText(runDrift(r.ir!, rec.lastPlan, world)!), '1 of 1 no longer hold: behave.go gone: no (door_open store) now; door_open/1 has (door_open back)')
  assert.equal(runDrift(r.ir!, { ...rec.lastPlan!, status: 'no_plan' }, world), undefined)
  assert.equal(driftText({ checked: 0, items: [] }), 'it rests on no fact (nothing to re-check)')
})
