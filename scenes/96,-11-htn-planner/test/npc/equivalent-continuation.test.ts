// Equal deferred replacements retain their continuation marker while candidate validation remains independent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bool, formatAtom } from '../../src/htn-planner/htn/atom'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { PlanTraceRecorder } from '../../src/htn-planner/htn/trace'
import { ACTIVE_PLAN_FACT, GuardAgent } from '../../src/htn-planner/npc/agent'
import type { ActionFactory, ReplanEvent } from '../../src/htn-planner/npc/actions'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import { compileDomainSource } from '../../tools/htn/compiler'

function compile(source: string) {
  const r = compileDomainSource('EquivalentContinuation.domain', source)
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
  return r.ir
}

type Choice = 'same-deferred' | 'continue' | 'failed-replacement' | 'same-unavailable' | 'changed' | 'empty' | 'stop'
function markerProbe(choice: Choice, onNoPlan: 'keep' | 'cancel' = 'keep') {
  const replacement = {
    'same-deferred': '(&b) (!end_plan)',
    continue: '(!continue)',
    'failed-replacement': '(&blocked)',
    'same-unavailable': '(&b) (!end_plan)',
    changed: '(!begin_plan other) (&c) (!end_plan)',
    empty: '(&empty)',
    stop: '(&b) (!end_plan)'
  }[choice]
  const domain = compile(`(:domain Marker top_level_domain
    (:method (behave) top_level_method
      (boundary (and (boundary)) (${replacement}))
      (continue_trip (and (active_plan trip)) ((!continue)))
      (initial (and (not (started))) ((!begin_plan trip) (!hold) (&b) (!end_plan)))
      (lost () ((!abort))))
    (:method (b) (tail (and (active_plan trip) (tail_available) (call visit_tail)) ((!future))))
    (:method (c) (other (and (active_plan other) (call visit_tail)) ((!other_future))))
    (:method (empty) (complete () ()))
    (:method (blocked) (blocked (and (never)) ((!wrong))))
    (:method (active_plan) top_level_method
      (hold_valid (and (running hold) (active_plan trip)) ())
      (future_valid (and (running future) (active_plan trip)) ())
      (other_valid (and (running other_future) (active_plan other)) ())
      (abort_valid (and (running abort)) ())))`)
  const traces: PlanTraceRecorder[] = []
  const views: { event: ReplanEvent; marker: string[]; activeHead?: string; tailCalls: number }[] = []
  let available = true
  let started = false, boundary = false, futureStarts = 0, futureUpdates = 0, abortStarts = 0, tailCalls = 0
  const future: ActionFactory = () => ({
    start: () => { futureStarts++; return 'running' },
    update: () => { futureUpdates++; return 'running' },
    cancel() {}
  })
  const agent = new GuardAgent({
    id: choice,
    planner: world => {
      const trace = new PlanTraceRecorder(domain)
      traces.push(trace)
      return new PlanRunner(domain, world, { trace, callterms: {
        visit_tail: () => {
          tailCalls++
          if (choice === 'stop') agent.stop()
          return bool(true)
        }
      } })
    },
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    activePlan: 'active_plan',
    continueTask: '!continue',
    onNoPlan,
    syncFacts: a => {
      const w = a.blackboard.world
      w.clear('tail_available', 0)
      if (available) w.add('tail_available')
      w.clear('started', 0)
      if (started) w.add('started')
      w.clear('boundary', 0)
      if (boundary) w.add('boundary')
      return 'same-key'
    },
    actions: {
      '!hold': (_args, ctx) => ({
        start: () => { started = true; ctx.blackboard.world.add('started'); return 'running' },
        update: () => {
          boundary = true
          if (choice === 'same-unavailable') { available = false; ctx.blackboard.world.clear('tail_available', 0) }
          ctx.blackboard.world.add('boundary')
          agent.requestReplan('boundary', true)
          return 'done'
        },
        cancel() {}
      }),
      '!future': future,
      '!other_future': future,
      '!abort': () => ({ start: () => { abortStarts++; return 'running' }, update: () => 'running', cancel() {} })
    },
    onEvent: event => {
      if (event.type === 'replan') {
        const marker = agent.blackboard.world.rows(ACTIVE_PLAN_FACT, 1).map(row => row.map(formatAtom).join(' '))
        views.push({ event, marker, activeHead: agent.runner.steps[0]?.name, tailCalls })
        if (event.reason === 'boundary') {
          boundary = false
          agent.blackboard.world.clear('boundary', 0)
        }
      }
    }
  })
  for (let i = 0; i < 3; i++) agent.tick(0.1, [])
  const snapshot = {
    futureStarts, futureUpdates, abortStarts, tailCalls, views,
    traces: traces.map(t => t.runs.map(r => domain.methods[r.method].name))
  }
  return { ...snapshot, agent, counts: () => ({ futureStarts, futureUpdates, abortStarts, tailCalls }) }
}

test('same deferred continuation retains its plan marker and stays valid under activePlan', () => {
  const s = markerProbe('same-deferred')
  assert.equal(s.abortStarts, 0, 'equivalent continuation must not fall into lost-marker abort behavior')
  assert.equal(s.futureUpdates, 1, 'future keeps its progress on the next tick')
  assert.deepEqual(s.views[1].marker, ['trip'])
  assert.equal(s.views[1].event.kept, true)
  assert.equal(s.views[1].event.changed, false)
  assert.equal(s.views[1].activeHead, '&b', 'comparison leaves the original cursor lazy')
  assert.equal(s.views[1].tailCalls, 1, 'the replacement was validated, not blindly kept')
  assert.deepEqual(s.traces[0], ['behave', 'b'], 'the original continuation expands during execution')
  s.agent.requestReplan('continue again', true)
  s.agent.tick(0.1, [])
  assert.equal(s.counts().futureStarts, 1)
  assert.equal(s.counts().futureUpdates, 2)
  assert.equal(s.agent.lastReplan?.continued, true)
})

test('continue control preserves marker, continuation and progress', () => {
  const s = markerProbe('continue')
  assert.equal(s.abortStarts, 0)
  assert.equal(s.futureStarts, 1)
  assert.equal(s.futureUpdates, 1)
  assert.deepEqual(s.views[1].marker, ['trip'])
  assert.equal(s.views[1].event.kept, true)
  assert.equal(s.views[1].event.continued, true)
  s.agent.requestReplan('continue again', true)
  s.agent.tick(0.1, [])
  assert.equal(s.agent.currentAction, '!future')
  assert.equal(s.agent.lastReplan?.continued, true)
})

test('failed different candidate does not probe or clear the active deferred continuation', () => {
  const s = markerProbe('failed-replacement')
  assert.equal(s.abortStarts, 0)
  assert.equal(s.futureUpdates, 1)
  assert.equal(s.views[1].event.status, 'deferred_failed')
  assert.equal(s.views[1].event.kept, true)
  assert.deepEqual(s.views[1].marker, ['trip'])
  assert.equal(s.views[1].activeHead, '&b')
  assert.equal(s.views[1].tailCalls, 0, 'candidate comparison cannot expand the active runner')
  assert.equal(s.tailCalls, 1)
  assert.deepEqual(s.traces[0], ['behave', 'b'])
})

test('identical deferred syntax must still validate when its branch became unavailable', () => {
  const s = markerProbe('same-unavailable')
  assert.equal(s.views[1].event.status, 'deferred_failed')
  assert.equal(s.views[1].event.kept, true)
  assert.deepEqual(s.views[1].marker, ['trip'])
  assert.equal(s.views[1].activeHead, '&b')
  assert.equal(s.views[1].tailCalls, 0)
  assert.equal(s.futureStarts, 0)
})

test('invalid equal deferred replacement applies cancel without preserving a stale marker', () => {
  const s = markerProbe('same-unavailable', 'cancel')
  assert.equal(s.views[1].event.status, 'deferred_failed')
  assert.equal(s.views[1].event.kept, false)
  assert.deepEqual(s.views[1].marker, [])
  assert.deepEqual(s.views[1].event.plan, [])
  assert.equal(s.futureStarts, 0)
})

test('a changed candidate installs its own marker rather than inheriting the previous continuation', () => {
  const s = markerProbe('changed')
  assert.equal(s.views[1].event.status, 'succeeded')
  assert.equal(s.views[1].event.kept, false)
  assert.equal(s.views[1].event.changed, true)
  assert.deepEqual(s.views[1].marker, [], 'adoption drops the previous marker before new steps execute')
  assert.deepEqual(s.agent.blackboard.world.rows(ACTIVE_PLAN_FACT, 1).map(row => row.map(formatAtom).join(' ')),
    ['other'])
  assert.equal(s.agent.currentAction, '!other_future')
  assert.equal(s.futureUpdates, 1)
})

test('successful empty replacement deliberately ends the old marked continuation', () => {
  const s = markerProbe('empty')
  assert.equal(s.views[1].event.status, 'succeeded')
  assert.equal(s.views[1].event.kept, false)
  assert.deepEqual(s.views[1].event.plan, [])
  assert.deepEqual(s.views[1].marker, [])
  assert.equal(s.futureStarts, 0)
})

test('stop during validation of an equal continuation cannot publish or execute the replacement', () => {
  const s = markerProbe('stop')
  assert.equal(s.views.length, 1, 'only the initial plan event was published')
  assert.equal(s.futureStarts, 0)
  assert.equal(s.abortStarts, 0)
  assert.deepEqual(s.agent.blackboard.world.rows(ACTIVE_PLAN_FACT, 1), [])
  const time = s.agent.time
  s.agent.requestReplan('after stop', true)
  s.agent.tick(0.1, [])
  assert.equal(s.agent.time, time)
})
