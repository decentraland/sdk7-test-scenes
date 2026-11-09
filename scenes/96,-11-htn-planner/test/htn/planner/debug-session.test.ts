// Our additions around upstream's capture: the domain graph, world snapshots and diffs, the agent event ring and the
// DebugSession bundle a debugger view reads.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { int, sym } from '../../../src/htn-planner/htn/atom'
import { domainGraph } from '../../../src/htn-planner/htn/domain-graph'
import { PlanTraceRecorder } from '../../../src/htn-planner/htn/trace'
import { snapshotWorld, worldDiff, WorldState } from '../../../src/htn-planner/htn/world-state'
import { GuardAgent } from '../../../src/htn-planner/npc/agent'
import { agentHistory, entryCount, EventRing } from '../../../src/htn-planner/npc/history'
import { CLEAR_LINE_OF_SIGHT } from '../../../src/htn-planner/npc/perception'
import { v3 } from '../../../src/htn-planner/npc/vec'
import { plannerFor } from '../../../src/htn-planner/npc/guard-scene'
import { buildSession, parseSession, sessionGraph } from '../../../src/htn-planner/debug/session'
import { guardDomain } from '../../../src/examples/guard/guard.htn'
import { hierarchicalBacktrackingDomain } from '../../../src/examples/upstream/generated/hierarchical_backtracking.htn'

test('domain graph: methods -> branches -> tasks, conditions, axioms, facts and callterms with sources', () => {
  const g = domainGraph(hierarchicalBacktrackingDomain)
  assert.equal(g, domainGraph(hierarchicalBacktrackingDomain), 'cached per DomainIR')
  const m = g.methods.find(x => x.name === 'validate_axiom_backtracking')!
  assert.equal(m.topLevel, true)
  assert.equal(m.title, '(:method (validate_axiom_backtracking) ...)')
  const [selected, fallback] = m.branches.map(id => g.branches[id])
  assert.deepEqual([selected.name, fallback.name, fallback.cond], ['branch_selected', 'branch_fallback', -1])
  const and = g.conds[selected.cond]
  assert.equal(and.kind, 'and')
  assert.deepEqual(and.children.map(id => g.conds[id].title), ['(#find_candidate ?candidate)', '(acceptable ?candidate)'])
  const call = g.conds[and.children[0]]
  assert.equal(g.axioms[call.axiom!].name, 'find_candidate')
  assert.deepEqual(call.owner, { branch: selected.id })
  assert.equal(g.tasks[selected.tasks[0]].title, '(!selected_axiom ?candidate)')
  const body = g.conds[g.axioms[call.axiom!].cond]
  assert.deepEqual(body.owner, { axiom: call.axiom })
  const facts = Object.fromEntries(g.facts.map(f => [f.key, f.conds.length]))
  assert.equal(facts['candidate/1'], 2)
  assert.ok(selected.source && selected.source.endLine > selected.source.line)
  // The task edge to a method: a recursion would be a back-edge.
  const guard = g.methods.find(x => x.name === 'validate_child_guard')!
  const task = g.tasks[g.branches[guard.branches[0]].tasks[0]]
  assert.equal(g.methods[task.method!].name, 'do_behavior_child_guard')
  assert.ok(JSON.parse(JSON.stringify(g)))
})

test('world snapshots per revision and their diff', () => {
  const w = new WorldState()
  w.add('pos', sym('a'), int(1))
  w.add('door', sym('open'))
  const r0 = w.revision
  const a = snapshotWorld(w)
  w.set('pos', sym('a'), int(2))
  w.clear('door', 1)
  w.add('seen', sym('p'))
  w.clear('missing', 3)
  assert.equal(w.revision, r0 + 3, 'only changes count')
  const b = snapshotWorld(w)
  assert.deepEqual(a.tables['pos/2'], [[sym('a'), int(1)]], 'a snapshot does not follow the world')
  const d = worldDiff(a, b)
  assert.deepEqual([d.from, d.to], [a.revision, b.revision])
  assert.deepEqual(d.added, { 'pos/2': [[sym('a'), int(2)]], 'seen/1': [[sym('p')]] })
  assert.deepEqual(d.removed, { 'pos/2': [[sym('a'), int(1)]], 'door/1': [[sym('open')]] })
})

test('the event ring keeps the newest items, oldest first', () => {
  const ring = new EventRing<number>(3)
  for (let i = 1; i <= 5; i++) ring.push(i)
  assert.deepEqual(ring.toArray(), [3, 4, 5])
  assert.equal(ring.length, 3)
  assert.equal(ring.total, 5)
  ring.clear()
  assert.deepEqual(ring.toArray(), [])
})

test('an agent logs replans with reasons, steps, step ends and senses; a session bundles it all as JSON', () => {
  const history = agentHistory(64)
  let agent: GuardAgent | undefined
  const rec = new PlanTraceRecorder(guardDomain, { time: () => agent?.time ?? 0 })
  agent = new GuardAgent({
    id: 'g',
    planner: plannerFor(guardDomain, { trace: rec, onDiagnostic: () => {} }),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    route: [v3(0, 0, 0), v3(0, 0, 4)],
    perception: { detectTime: 0, nearDetectTime: 0, loseGrace: 0 },
    history
  })
  for (let i = 0; i < 10; i++) agent.tick(0.1, [])
  for (let i = 0; i < 10; i++) agent.tick(0.1, [{ id: 'player', position: v3(0, 0, 6) }])
  const log = history.toArray()
  const types = new Set<string>(log.map(e => e.event.type))
  for (const t of ['replan', 'step', 'sense']) assert.ok(types.has(t), t)
  const first = log.find(e => e.event.type === 'replan')!
  assert.equal(first.event.type === 'replan' && first.event.reason, 'start')
  const sense = log.find(e => e.event.type === 'sense')!
  assert.ok(sense.t > 0.9 && sense.t < 1.2)
  assert.deepEqual(sense.event.type === 'sense' && [sense.event.what, sense.event.to], ['perception', 'player|'])
  const replanAfter = log.find(e => e.event.type === 'replan' && e.t >= sense.t)!
  assert.ok(replanAfter.event.type === 'replan' && replanAfter.event.reason.startsWith('perception'))
  assert.ok(log.every((e, i) => i === 0 || e.t >= log[i - 1].t))

  const session = buildSession({ domain: guardDomain, agents: [{ id: 'g', recorder: rec, metrics: agent.metrics }], histories: [history] })
  assert.equal(session.version, 1)
  assert.ok(session.runs.length >= 2)
  assert.ok(session.runs.every(r => r.agent === 'g' && r.nodes[0].kind === 'plan' && r.t !== undefined))
  assert.ok(session.runs.every((r, i) => i === 0 || r.t! >= session.runs[i - 1].t!))
  for (const r of session.runs) assert.ok(session.worlds.some(w => w.agent === 'g' && w.revision === r.world))
  assert.equal(session.diffs.length, session.worlds.length - 1)
  assert.equal(session.timeline.length, log.length)
  assert.equal(session.metrics.g.plansMade, agent.metrics.plansMade)
  const back = JSON.parse(JSON.stringify(session))
  assert.equal(back.runs[0].nodes.length, session.runs[0].nodes.length)
  assert.equal(back.domain.methods.length, guardDomain.methods.length)
})

test('a session timeline carries a collapsed run: count and last time survive JSON; an entry without count is one event', () => {
  const history = agentHistory(8)
  const retry = { type: 'replan', guard: 'g', reason: 'retry after no_plan', status: 'no_plan', plan: [], kept: false, passes: 1 } as const
  for (let i = 0; i < 5; i++) history.push({ t: 1 + i, event: { ...retry, plan: [] } })
  history.push({ t: 9, event: { type: 'signal', guard: 'g', name: 'x' } })
  const session = buildSession({ domain: guardDomain, agents: [], histories: [history] })
  const back = JSON.parse(JSON.stringify(session)) as typeof session
  assert.deepEqual(
    back.timeline.map(e => [e.t, e.until, e.count]),
    [
      [1, 5, 5],
      [9, undefined, undefined]
    ]
  )
  assert.deepEqual(back.timeline.map(entryCount), [5, 1], 'a version 1 file written before collapsing reads as one event per entry')
})

test('replans in the timeline say why (trigger, the facts that changed); a session with the agent world says what no longer holds', () => {
  const history = agentHistory(64)
  let agent: GuardAgent | undefined
  const rec = new PlanTraceRecorder(guardDomain, { time: () => agent?.time ?? 0 })
  agent = new GuardAgent({
    id: 'g',
    planner: plannerFor(guardDomain, { trace: rec, onDiagnostic: () => {} }),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    route: [v3(0, 0, 0), v3(0, 0, 4)],
    perception: { detectTime: 0, nearDetectTime: 0, loseGrace: 0 },
    history
  })
  for (let i = 0; i < 5; i++) agent.tick(0.1, [])
  for (let i = 0; i < 3; i++) agent.tick(0.1, [{ id: 'player', position: v3(0, 0, 6) }])
  const replans = history.toArray().flatMap(e => (e.event.type === 'replan' ? [e.event] : []))
  const seen = replans.find(r => r.trigger === 'perception')!
  assert.ok(seen, JSON.stringify(replans.map(r => r.trigger)))
  assert.ok(seen.changes!.some(c => c.startsWith('+ (target_visible player ')), JSON.stringify(seen.changes))
  for (const c of seen.changes!) assert.ok(guardDomain.facts.some(f => c.slice(3).startsWith(f.slice(0, f.lastIndexOf('/')) + ' ')), `only facts the domain reads: ${c}`)
  assert.equal(seen.changed, true)

  const session = buildSession({ domain: guardDomain, agents: [{ id: 'g', recorder: rec, world: agent.blackboard.world }], histories: [history] })
  const drift = session.drift!.g
  assert.equal(drift.run, rec.lastPlan!.seq)
  assert.ok(drift.checked > 0)
  assert.deepEqual(drift.items, [])
  const back = JSON.parse(JSON.stringify(session))
  assert.equal(back.timeline.find((e: { event: { trigger?: string } }) => e.event.trigger === 'perception').event.changed, true)
  // The player is gone from the world (no tick ran yet to replan): the chase rests on a fact that is no longer there.
  agent.blackboard.world.clear('target_visible', 2)
  const later = buildSession({ domain: guardDomain, agents: [{ id: 'g', recorder: rec, world: agent.blackboard.world }] })
  assert.ok(later.drift!.g.items.some(i => i.drift === 'gone' && i.fact.startsWith('(target_visible player ')), JSON.stringify(later.drift))
  assert.equal(buildSession({ domain: guardDomain, agents: [{ id: 'g', recorder: rec }] }).drift, undefined, 'no world, no drift')
})

test('a session with agents on different domains carries each graph; sessionGraph gives an agent its own', () => {
  const guards = new PlanTraceRecorder(guardDomain)
  const other = new PlanTraceRecorder(hierarchicalBacktrackingDomain)
  const session = buildSession({ domain: guardDomain, agents: [{ id: 'g', recorder: guards }, { id: 'boss', recorder: other }] })
  assert.equal(session.domain.name, guardDomain.name)
  assert.deepEqual(
    session.domains?.map(d => d.name),
    [hierarchicalBacktrackingDomain.name]
  )
  assert.deepEqual(session.agentDomains, { boss: hierarchicalBacktrackingDomain.name })
  assert.equal(sessionGraph(session, 'boss').name, hierarchicalBacktrackingDomain.name)
  assert.equal(sessionGraph(session, 'g').name, guardDomain.name)
  assert.equal(sessionGraph(session, 'nobody').name, guardDomain.name, 'an unknown agent reads the session domain')
  const back = parseSession(JSON.stringify(session))
  assert.equal(sessionGraph(back, 'boss').methods.length, hierarchicalBacktrackingDomain.methods.length)
  const one = buildSession({ domain: guardDomain, agents: [{ id: 'g', recorder: guards }] })
  assert.equal(one.domains, undefined, 'one domain: version 1 unchanged')
  assert.equal(one.agentDomains, undefined)
})
