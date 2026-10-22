// The session-wide views of the viewer: the agents and the time range of a session, the timeline (plan spans, step
// spans, ◆ replans with their reasons, × failures), the plan diff of a replan, the plan strip at a time, the world
// against the one before with what the plan read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { int, sym } from '../../src/htn-planner/htn/atom'
import { buildSession } from '../../src/htn-planner/debug/session'
import type { DebugSession } from '../../src/htn-planner/debug/session'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import { decompose } from '../../src/htn-planner/htn/planner'
import { PlanTraceRecorder } from '../../src/htn-planner/htn/trace'
import type { AgentLogEntry } from '../../src/htn-planner/npc/history'
import type { GuardEvent, ReplanEvent } from '../../src/htn-planner/npc/actions'
import { compile } from '../htn/compiler/helpers'
import { indexSession, runAt } from '../../tools/viewer/model/session-index'
import { factLabels, markerTimes, planDiff, timelineModel } from '../../tools/viewer/model/timeline'
import { planStrip, stepStatesByNode } from '../../tools/viewer/model/plan-strip'
import { worldView } from '../../tools/viewer/model/world-view'
import { levelSession, runLevel } from '../../src/playground/headless'
import { OrdersLevel } from '../../src/playground/levels/orders'

const DOMAIN = `(:domain Door top_level_domain
  (:method (go) top_level_method
    (open_door (and (door ?d open) (at ?d ?p)) ((!walk ?p) (!enter ?d)))
    (knock (and (door ?d closed)) ((!knock ?d) (!wait 2)))))`

/** An agent `g` that planned twice: the door closed at t=1, open at t=5 (a replan on a fact change). */
function twoRuns(): DebugSession {
  const r = compile(DOMAIN)
  assert.ok(r.ok)
  let now = 0
  const rec = new PlanTraceRecorder(r.ir, { time: () => now })
  const w = new WorldState()
  w.add('door', sym('front'), sym('closed'))
  w.add('at', sym('front'), int(4))
  w.add('noise', int(1))
  now = 1
  decompose(r.ir, w, 'go', [], { trace: rec })
  w.set('door', sym('front'), sym('open'))
  w.clear('noise', 1)
  w.add('guest', sym('ann'))
  now = 5
  decompose(r.ir, w, 'go', [], { trace: rec })
  const replan = (t: number, reason: string, plan: string[], previous?: string[]): AgentLogEntry => {
    const e: ReplanEvent = { type: 'replan', guard: 'g', reason, status: 'succeeded', plan, kept: false, passes: 1, trigger: 'facts', changes: ['- (door front closed)', '+ (door front open)'] }
    if (previous) e.previous = previous
    return { t, event: e }
  }
  const ev = (t: number, event: GuardEvent): AgentLogEntry => ({ t, event })
  const history = {
    toArray: () => [
      replan(1, 'start', ['!knock front', '!wait 2']),
      ev(1, { type: 'step', guard: 'g', name: '!knock', args: [sym('front')] }),
      ev(3, { type: 'step_end', guard: 'g', name: '!knock', status: 'done' }),
      ev(3, { type: 'step', guard: 'g', name: '!wait', args: [int(2)] }),
      ev(5, { type: 'step_end', guard: 'g', name: '!wait', status: 'cancelled' }),
      replan(5, 'facts closed -> open', ['!walk 4', '!enter front'], ['!wait 2']),
      ev(5, { type: 'step', guard: 'g', name: '!walk', args: [int(4)] }),
      ev(7, { type: 'step_end', guard: 'g', name: '!walk', status: 'failed' })
    ]
  }
  return JSON.parse(JSON.stringify(buildSession({ domain: r.ir, agents: [{ id: 'g', recorder: rec }], histories: [history as never] })))
}

test('the index: agents with their runs and events, the time range, the run at a time', () => {
  const ix = indexSession(twoRuns())
  assert.deepEqual(
    ix.agents.map(a => [a.id, a.runs.length, a.events.length]),
    [['g', 2, 8]]
  )
  assert.deepEqual([ix.t0, ix.t1, ix.timed], [1, 7, true])
  const g = ix.agents[0]
  assert.equal(runAt(g, 0)!.t, 1, 'before the first run: the first')
  assert.equal(runAt(g, 4.9)!.t, 1)
  assert.equal(runAt(g, 5)!.t, 5)
  const untimed = indexSession({ ...twoRuns(), runs: twoRuns().runs.map(({ t: _t, ...r }) => r), timeline: [] })
  assert.equal(untimed.timed, false)
  assert.deepEqual(untimed.agents[0].runs.map(r => r.t), [0, 1], 'their order as their time')
})

test('the timeline: a plan span per adopted plan, step spans with how they ended, a ◆ per replan with why and its run', () => {
  const ix = indexSession(twoRuns())
  const tl = timelineModel(ix)
  const tr = tl.tracks[0]
  assert.deepEqual(
    tr.plans.map(p => [p.t0, p.t1, p.label, p.run]),
    [
      [1, 5, '!knock front  +1', ix.agents[0].runs[0].seq],
      [5, 7, '!walk 4  +1', ix.agents[0].runs[1].seq]
    ]
  )
  assert.deepEqual(
    tr.steps.map(s => [s.t0, s.t1, s.label, s.status]),
    [
      [1, 3, '!knock front', 'done'],
      [3, 5, '!wait 2', 'cancelled'],
      [5, 7, '!walk 4', 'failed']
    ]
  )
  assert.deepEqual(
    tr.markers.map(m => [m.t, m.kind, m.why, m.changes, m.run]),
    [
      [1, 'replan', 'facts: start', '−door +door', ix.agents[0].runs[0].seq],
      [5, 'replan', 'facts closed -> open', '−door +door', ix.agents[0].runs[1].seq]
    ]
  )
  assert.deepEqual(markerTimes(tl), [1, 5])
  assert.deepEqual(tr.markers[1].facts, ['−door(front, closed)', '+door(front, open)'], 'the changes with their values')
})

test('fact changes as labels: the sign, the values short, a malformed one left out', () => {
  assert.deepEqual(factLabels(['+ (target_visible tester (-4.07642 0.0 -1.095525))', '- (order hold)', 'junk']), ['+target_visible(tester, (-4.08, 0, -1.1))', '−order(hold)'])
  assert.deepEqual(factLabels(undefined), [])
})

test('a session without events: its runs are the replans', () => {
  const s = twoRuns()
  const tl = timelineModel(indexSession({ ...s, timeline: [] }))
  assert.equal(tl.tracks[0].plans.length, 2)
  assert.equal(tl.tracks[0].markers.length, 0)
})

test('plan diff: kept in order, dropped, new', () => {
  assert.deepEqual(
    planDiff(['a', 'b', 'c'], ['a', 'x', 'c', 'd']).map(r => `${r.kind} ${r.step}`),
    ['kept a', 'new x', 'dropped b', 'kept c', 'new d']
  )
  assert.deepEqual(planDiff([], ['a']), [{ step: 'a', kind: 'new' }])
  assert.deepEqual(planDiff(['a'], []), [{ step: 'a', kind: 'dropped' }])
})

test('the plan strip at a time: done, running, upcoming; cut by a replan; failed', () => {
  const ix = indexSession(twoRuns())
  const g = ix.agents[0]
  const [first, second] = g.runs
  const at = (run: typeof first, t: number) => planStrip(run, g.events, t).map(s => `${s.state} ${s.label}`)
  assert.deepEqual(at(first, 0.5), ['upcoming knock(front)', 'upcoming wait(2)'])
  assert.deepEqual(at(first, 2), ['running knock(front)', 'upcoming wait(2)'])
  assert.deepEqual(at(first, 4), ['done knock(front)', 'running wait(2)'])
  assert.deepEqual(at(first, 6), ['done knock(front)', 'cut wait(2)'])
  assert.deepEqual(at(second, 6), ['running walk(4)', 'upcoming enter(front)'])
  assert.deepEqual(at(second, 7), ['failed walk(4)', 'upcoming enter(front)'])
  assert.deepEqual(
    planStrip(second, [], 7).map(s => s.state),
    ['upcoming', 'upcoming'],
    'no events: all upcoming'
  )
})

test('the world: + / − / ~ against the world before, the rows the chosen path read, the tables it queried', () => {
  const s = twoRuns()
  const ix = indexSession(s)
  const g = ix.agents[0]
  const second = g.runs[1]
  const w = worldView(s, 'g', second.world, second, g.graph)!
  assert.equal(w.previous, g.runs[0].world)
  const table = (key: string) => w.tables.find(t => t.key === key)!
  assert.deepEqual(
    table('door/2').rows.map(r => [r.mark, r.args.join(' '), r.was?.join(' ') ?? '', r.read]),
    [['~', 'front open', 'front closed', 'plan']]
  )
  assert.deepEqual(table('noise/1').rows.map(r => r.mark), ['-'])
  assert.deepEqual(table('guest/1').rows.map(r => [r.mark, r.read]), [['+', '']])
  assert.equal(table('at/2').read, 'plan')
  assert.equal(table('at/2').rows[0].read, 'plan')
  assert.equal(table('guest/1').read, '')
  const first = worldView(s, 'g', g.runs[0].world, g.runs[0], g.graph)!
  assert.equal(first.previous, null)
  assert.ok(first.tables.every(t => t.rows.every(r => r.mark === '')))
  assert.equal(worldView(s, 'g', 9999, null, g.graph), null)
})

test('a recorded level: every agent has a track, every ◆ of a guard finds its run', () => {
  const level = new OrdersLevel()
  runLevel(level, { seconds: 20, record: true })
  const ix = indexSession(JSON.parse(JSON.stringify(levelSession(level))))
  const tl = timelineModel(ix)
  assert.deepEqual(
    tl.tracks.map(t => t.agent),
    ['a', 'b', 'c', 'squad']
  )
  for (const tr of tl.tracks.filter(t => t.agent !== 'squad')) {
    assert.ok(tr.markers.length > 0)
    assert.ok(tr.markers.every(m => m.run !== undefined), `${tr.agent}: every replan has its run`)
    assert.ok(tr.steps.length > 0)
  }
  const squad = tl.tracks[3]
  assert.ok(squad.markers.length >= 2 && squad.markers.every(m => m.run !== undefined))
})

test('the strip by the tree node of each step, to colour the tree on replay', () => {
  const ix = indexSession(twoRuns())
  const g = ix.agents[0]
  const first = g.runs[0]
  const states = stepStatesByNode(first, planStrip(first, g.events, 4))
  assert.deepEqual(
    [...states.entries()].map(([node, state]) => `${first.nodes[node].name} ${state}`),
    ['(!knock ?d) done', '(!wait 2) running']
  )
})
