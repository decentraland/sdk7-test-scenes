// Level 11 (orders): a squad planner on a real GuardSquad (GuardSquadOptions.squad, register row H17, upstream
// docs/USE_CASES.md section 4). First the two domains on their own: the roles the squad hands out for a snapshot, and
// how a guard carries out each role; then the level: orders change when the intruder is seen and when a guard goes
// on a break, the squad planner is a debugger host, and the level (not an ECS system) ticks the squad.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine } from '@dcl/sdk/ecs'
import { float, formatTask, int, list, sym, vec3 } from '../../src/htn-planner/htn/atom'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import { yardGuardDomain } from '../../src/examples/squad/yard_guard.htn'
import { yardSquadDomain } from '../../src/examples/squad/yard_squad.htn'
import { OrdersLevel } from '../../src/playground/levels/orders'
import { plannerText } from '../../src/playground/board'
import { v3 } from '../../src/htn-planner/npc/vec'

const DT = 1 / 30

function squadPlan(available: string[], spotter?: string): string[] {
  const w = new WorldState()
  w.add('roster', list(sym('a'), sym('b'), sym('c')))
  for (const id of available) w.add('available', sym(id))
  if (spotter) w.add('spotter', sym(spotter))
  const runner = new PlanRunner(yardSquadDomain, w, { onDiagnostic: d => assert.fail(d.message) })
  assert.equal(runner.plan('assign_roles'), 'succeeded')
  const out: string[] = []
  while (runner.resolve() === 'ready') {
    const s = runner.current()!
    out.push(formatTask(s.name, s.args))
    runner.complete()
  }
  return out
}

test('yard squad: calm, an intruder, a guard on a break', () => {
  assert.deepEqual(squadPlan(['a', 'b', 'c']), ['!order a hold', '!order b patrol', '!order c patrol'])
  assert.deepEqual(squadPlan(['a', 'b', 'c'], 'b'), ['!order b chase', '!order a hold', '!order c flank'])
  assert.deepEqual(squadPlan(['a', 'b', 'c'], 'a'), ['!order a chase', '!order b hold', '!order c flank'])
  assert.deepEqual(squadPlan(['b', 'c']), ['!order b hold', '!order c patrol'])
  assert.deepEqual(squadPlan(['b', 'c'], 'c'), ['!order c chase', '!order b hold'])
  assert.deepEqual(squadPlan(['b', 'c'], 'a'), ['!order b hold', '!order c patrol'], 'a spotter on a break chases nobody')
  assert.deepEqual(squadPlan([]), [], 'nobody left: a successful empty plan, no orders')
})

function guardBranch(facts: (w: WorldState) => void): string {
  const w = new WorldState()
  const at = vec3(1, 0, 1)
  w.add('gate_post', at, vec3(1, 0, -4))
  w.add('flank_post', at)
  w.add('bench', at)
  w.add('waypoint', int(0), at)
  w.add('waypoint_count', int(1))
  w.add('current_waypoint', int(0))
  facts(w)
  const runner = new PlanRunner(yardGuardDomain, w, { onDiagnostic: d => assert.fail(d.message) })
  assert.equal(runner.plan('behave'), 'succeeded')
  return runner.steps.map(s => formatTask(s.name, s.args)).join(', ')
}

test('yard guard: each order, carried out from the guard\'s own facts', () => {
  const order = (role: string) => (w: WorldState) => w.add('order', sym(role))
  assert.equal(guardBranch(w => (order('chase')(w), w.add('target_visible', sym('you'), vec3(2, 0, 2)))), '!chase you, !catch you, !wait 1.5')
  assert.equal(
    guardBranch(w => (order('chase')(w), w.add('last_seen', sym('you'), vec3(2, 0, 2), float(3)))),
    '!move_to (2.0 0.0 2.0) hurry, !look_around 3.0, !forget you'
  )
  assert.equal(guardBranch(order('hold')), '!move_to (1.0 0.0 1.0) hurry, !turn_to (1.0 0.0 -4.0), !wait 2.0')
  assert.equal(guardBranch(order('flank')), '!move_to (1.0 0.0 1.0) run, !look_around 2.0')
  assert.equal(guardBranch(order('patrol')), '!move_to (1.0 0.0 1.0) walk, !wait 1.0, &advance_patrol')
  // No chase on its own: a guard without the chase order that sees you keeps its role.
  assert.equal(guardBranch(w => (order('patrol')(w), w.add('target_visible', sym('you'), vec3(2, 0, 2)))), '!move_to (1.0 0.0 1.0) walk, !wait 1.0, &advance_patrol')
  assert.equal(guardBranch(() => {}), '!move_to (1.0 0.0 1.0) walk, !wait 2.0', 'no order: off duty')
})

function level(): OrdersLevel {
  const l = new OrdersLevel().init()
  l.testerPaused = true
  return l
}

function runUntil(l: OrdersLevel, done: () => boolean, seconds: number): boolean {
  for (let t = 0; t < seconds; t += DT) {
    l.update(DT)
    if (done()) return true
  }
  return false
}

const roles = (l: OrdersLevel) => l.crew.map(m => `${m.id} ${l.roleOf(m.id)}`).join(', ')
const member = (l: OrdersLevel, id: string) => l.crew.find(m => m.id === id)!

test('orders level: the squad decides once while calm; the guards carry their orders out', () => {
  const l = level()
  assert.ok(runUntil(l, () => l.doingOf(member(l, 'a'), 'hold') && l.doingOf(member(l, 'b'), 'patrol') && l.doingOf(member(l, 'c'), 'patrol'), 3))
  assert.equal(roles(l), 'a hold, b patrol, c patrol')
  runUntil(l, () => false, 10)
  assert.deepEqual(
    l.decisions.map(d => d.reason),
    ['start'],
    'walking guards do not change the snapshot key'
  )
  assert.match(plannerText(l), /SQUAD \(assign_roles\)  a: <b>hold<\/b>   b: <b>patrol<\/b>   c: <b>patrol<\/b>/)
})

test('orders level: an intruder seen by a patrolling guard: it chases, a holds the gate, c flanks; the order interrupts its patrol', () => {
  const l = level()
  runUntil(l, () => false, 2)
  const b = member(l, 'b')
  const k = b.agent.kinematic
  l.teleportTester(v3(k.position.x + Math.sin(k.yaw) * 4, 0, k.position.z + Math.cos(k.yaw) * 4))
  assert.ok(runUntil(l, () => l.roleOf('b') === 'chase', 3), roles(l))
  assert.equal(roles(l), 'a hold, b chase, c flank')
  assert.match(l.decisions[l.decisions.length - 1].reason, /^snapshot a,b,c\|- -> a,b,c\|b$/)
  assert.ok(runUntil(l, () => l.doingOf(b, 'chase') && l.doingOf(member(l, 'c'), 'flank'), 1))
  const replan = b.history.toArray().flatMap(e => (e.event.type === 'replan' ? [e.event] : [])).pop()!
  assert.equal(replan.reason, 'facts patrol -> chase')
  assert.equal(replan.kept, false)

  // Out of the yard: b searches where it saw the tester, forgets, and the squad is calm again.
  l.teleportTester(v3(-12.5, 0, -10.5))
  assert.ok(runUntil(l, () => l.doingOf(b, 'search'), 3))
  assert.equal(l.roleOf('b'), 'chase', 'b keeps the chase while it remembers')
  assert.ok(runUntil(l, () => roles(l) === 'a hold, b patrol, c patrol', 30), roles(l))
})

test('orders level: a guard on a break gets no order; the next one takes the gate', () => {
  const l = level()
  runUntil(l, () => false, 1)
  l.onBreak.add('a')
  assert.ok(runUntil(l, () => l.roleOf('a') === 'none', 0.2))
  assert.equal(roles(l), 'a none, b hold, c patrol')
  assert.ok(runUntil(l, () => l.doingOf(member(l, 'a'), 'off_duty') && l.doingOf(member(l, 'b'), 'hold'), 1))
  assert.equal(member(l, 'a').agent.blackboard.world.rows('order', 1).length, 0, 'its order fact is gone')
  l.onBreak.delete('a')
  assert.ok(runUntil(l, () => roles(l) === 'a hold, b patrol, c patrol', 0.2))
})

test('orders level: the squad planner is a debugger host with its own world and trace', () => {
  const l = level()
  runUntil(l, () => false, 0.5)
  const [p] = l.planners()
  assert.equal(p.domain, yardSquadDomain)
  assert.equal(p.world.rows('roster', 1).length, 1)
  assert.equal(p.recorder?.chosenBranch, 'calm')
  assert.deepEqual(p.status().steps, ['!order a hold', '!order b patrol', '!order c patrol'])
  assert.equal(p.status().reason, 'start')
})

test('orders level: the level ticks the squad, no ECS system does (one path in the scene and headless)', async () => {
  const l = level()
  const a = member(l, 'a').agent
  await engine.update(0.1)
  assert.equal(a.time, 0, 'the squad adds no ECS system')
  l.update(0.1)
  assert.ok(Math.abs(a.time - 0.1) < 1e-9, `the level did: ${a.time}`)
  await engine.update(0.1)
  assert.ok(Math.abs(a.time - 0.1) < 1e-9, 'still only the level')
  l.dispose()
  assert.equal(l.squad, null)
})
