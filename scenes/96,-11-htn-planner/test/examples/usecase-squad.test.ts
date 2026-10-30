// Upstream use case: squad coordination (docs/USE_CASES.md:75-88). One squad planner assigns roles from a shared
// snapshot; each NPC has its own planner and world and chooses how to carry out its order; the next squad decision
// reassigns a role whose NPC became unavailable. Upstream ships no squad demo ("an integration design", :87-88).
// First with the test's own host, built from a PlanRunner (squad) and GuardAgents (members, orders through
// `syncFacts`); then the same on GuardSquad, whose `squad` option is that host (register row H17).
// Domains: src/examples/usecases/squad.domain, squad_member.domain.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatTask, list, sym, vec3 } from '../../src/htn-planner/htn/atom'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import type { GuardEvent } from '../../src/htn-planner/npc/actions'
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import { createCapsuleBody, GuardSquad, type SquadDecision } from '../../src/htn-planner/npc/guard-scene'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { distanceXZ, v3, type Vec3 } from '../../src/htn-planner/npc/vec'
import { squadDomain } from '../../src/examples/usecases/squad.htn'
import { squadMemberDomain } from '../../src/examples/usecases/squad_member.htn'

const ROSTER = ['a', 'b', 'c', 'd']
const LMG = 'a'
const FIRE_POSITION = v3(0, 0, 4)
const FLANK = { left: v3(-6, 0, 8), right: v3(6, 0, 8) }
const vec = (p: Vec3) => vec3(p.x, p.y, p.z)

class SquadHost {
  /** The squad planner's own world: the shared snapshot, rewritten before every decision. */
  readonly world = new WorldState()
  readonly runner = new PlanRunner(squadDomain, this.world, { onDiagnostic: d => assert.fail(d.message) })
  readonly orders = new Map<string, string>()
  readonly agents = new Map<string, GuardAgent>()
  readonly events: GuardEvent[] = []
  private readonly available = new Set(ROSTER)

  constructor(blockedLeft: readonly string[]) {
    ROSTER.forEach((id, i) => {
      const agent = new GuardAgent({
        id,
        // Definitions are shared; each NPC has its own runner and world (USE_CASES.md:81-83).
        planner: world => new PlanRunner(squadMemberDomain, world, { onDiagnostic: d => assert.fail(d.message) }),
        lineOfSight: CLEAR_LINE_OF_SIGHT,
        start: { position: v3(i * 2 - 3, 0, 0), yaw: 0 },
        // The host applies the order as a fact; a changed order replans the NPC (this host lets orders interrupt).
        syncFacts: a => {
          const order = this.orders.get(a.id)
          a.blackboard.world.clear('order', 1)
          if (order !== undefined) a.blackboard.world.add('order', sym(order))
          return order ?? ''
        },
        onEvent: e => this.events.push(e)
      })
      const w = agent.blackboard.world
      w.add('flank_route', sym('left'), vec(FLANK.left))
      w.add('flank_route', sym('right'), vec(FLANK.right))
      if (blockedLeft.includes(id)) w.add('route_blocked', sym('left'))
      w.add('fire_position', vec(FIRE_POSITION))
      w.add('cover', vec(this.cover(id)))
      this.agents.set(id, agent)
    })
  }

  cover(id: string): Vec3 {
    return v3(ROSTER.indexOf(id) * 2 - 3, 0, -3)
  }

  /** Publish the snapshot, plan the squad, run its !order steps. Returns the squad plan. */
  decide(): string[] {
    const w = this.world
    w.clearAll()
    w.add('roster', list(...ROSTER.map(id => sym(id))))
    for (const id of ROSTER) if (this.available.has(id)) w.add('available', sym(id))
    w.add('has_lmg', sym(LMG))
    assert.equal(this.runner.plan('assign_roles'), 'succeeded')
    const plan = this.runner.steps.map(s => formatTask(s.name, s.args))
    this.orders.clear()
    while (this.runner.resolve() === 'ready') {
      const step = this.runner.current()!
      assert.equal(step.name, '!order')
      this.orders.set(String(step.args[0].v), String(step.args[1].v))
      this.runner.complete()
    }
    return plan
  }

  /** The NPC drops out (down, busy elsewhere): it stops and is no longer in the snapshot. */
  drop(id: string): void {
    this.available.delete(id)
    this.agents.get(id)!.stop()
  }

  run(seconds: number, dt = 0.1): void {
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      for (const [id, agent] of this.agents) if (this.available.has(id)) agent.tick(dt, [])
    }
  }

  at(id: string, spot: Vec3): boolean {
    return distanceXZ(this.agents.get(id)!.kinematic.position, spot) <= 0.5
  }

  replans(id: string) {
    return this.events.filter((e): e is Extract<GuardEvent, { type: 'replan' }> => e.type === 'replan' && e.guard === id)
  }
}

test('squad: roles are assigned, each NPC plans its own route, a dropped flanker is replaced', () => {
  // c cannot take the left flank route; that is c's own knowledge, the squad planner never sees it.
  const host = new SquadHost(['c'])
  assert.deepEqual(host.decide(), ['!order a suppress', '!order b flank', '!order c defend', '!order d defend'])
  host.run(6)
  assert.ok(host.at('a', FIRE_POSITION), 'a suppresses from the fire position')
  assert.ok(host.at('b', FLANK.left), 'b flanks by the left route')
  assert.ok(host.at('c', host.cover('c')) && host.at('d', host.cover('d')), 'c and d defend at their covers')

  // The flanker drops out; the next squad decision gives the flank to c.
  host.drop('b')
  assert.deepEqual(host.decide(), ['!order a suppress', '!order c flank', '!order d defend'])
  const before = host.replans('c').length
  host.run(6)
  const reorder = host.replans('c')[before]
  assert.equal(reorder.reason, 'facts defend -> flank', 'the new order replans c')
  assert.equal(reorder.kept, false, 'and interrupts its defend plan')
  assert.ok(host.at('c', FLANK.right), 'c flanks by the right route: its left one is blocked')
  assert.ok(host.at('a', FIRE_POSITION) && host.at('d', host.cover('d')), 'a and d keep their roles')

  // The only machine gunner drops out: no suppression, c keeps the flank (no new order, no interruption).
  host.drop('a')
  const cBefore = host.replans('c').filter(r => r.reason.startsWith('facts')).length
  assert.deepEqual(host.decide(), ['!order c flank', '!order d defend'])
  host.run(2)
  assert.equal(host.replans('c').filter(r => r.reason.startsWith('facts')).length, cBefore)
  assert.ok(host.at('c', FLANK.right))

  // Everyone gone: a successful empty plan, no orders.
  host.drop('c')
  host.drop('d')
  assert.deepEqual(host.decide(), [])
  assert.equal(host.orders.size, 0)
})

// ---- the same on GuardSquad ------------------------------------------------------------------------------------

/** GuardSquad with the `squad` option: the snapshot is the guards it has (a dropped NPC is removed from it). */
function guardSquad(blockedLeft: readonly string[]) {
  const events: GuardEvent[] = []
  const decisions: SquadDecision[] = []
  const squad = new GuardSquad({
    planner: world => new PlanRunner(squadMemberDomain, world, { onDiagnostic: d => assert.fail(d.message) }),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    noise: null,
    targets: () => [],
    squad: {
      planner: world => new PlanRunner(squadDomain, world, { onDiagnostic: d => assert.fail(d.message) }),
      topLevel: 'assign_roles',
      snapshot: (w, guards) => {
        w.add('roster', list(...guards.map(g => sym(g.spec.id))))
        for (const g of guards) w.add('available', sym(g.spec.id))
        if (guards.some(g => g.spec.id === LMG)) w.add('has_lmg', sym(LMG))
        return guards.map(g => g.spec.id).join(',')
      },
      onDecision: d => decisions.push(d)
    },
    onEvent: e => events.push(e)
  })
  squad.spawn(ROSTER.map((id, i) => ({ id, route: [], start: { position: v3(i * 2 - 3, 0, 0), yaw: 0 }, body: createCapsuleBody })))
  const cover = (id: string) => v3(ROSTER.indexOf(id) * 2 - 3, 0, -3)
  for (const g of squad.guards) {
    const w = g.agent.blackboard.world
    w.add('flank_route', sym('left'), vec(FLANK.left))
    w.add('flank_route', sym('right'), vec(FLANK.right))
    if (blockedLeft.includes(g.spec.id)) w.add('route_blocked', sym('left'))
    w.add('fire_position', vec(FIRE_POSITION))
    w.add('cover', vec(cover(g.spec.id)))
  }
  const agent = (id: string) => squad.guards.find(g => g.spec.id === id)!.agent
  return {
    squad,
    decisions,
    cover,
    run: (seconds: number) => {
      for (let t = 0; t < seconds - 1e-9; t += 0.1) squad.update(0.1)
    },
    at: (id: string, spot: Vec3) => distanceXZ(agent(id).kinematic.position, spot) <= 0.5,
    replans: (id: string) => events.filter((e): e is Extract<GuardEvent, { type: 'replan' }> => e.type === 'replan' && e.guard === id),
    plan: () => decisions[decisions.length - 1].plan
  }
}

test('squad on GuardSquad: the squad option assigns roles, orders reach the guards as facts, a removed flanker is replaced', () => {
  const s = guardSquad(['c'])
  s.run(6)
  assert.equal(s.decisions.length, 1, 'one decision while the snapshot stays the same')
  assert.equal(s.decisions[0].reason, 'start')
  assert.deepEqual(s.plan(), ['!order a suppress', '!order b flank', '!order c defend', '!order d defend'])
  assert.deepEqual([...s.squad.orders].map(([id, rows]) => `${id} ${rows.map(r => formatTask('', r).trim()).join(';')}`), ['a suppress', 'b flank', 'c defend', 'd defend'])
  assert.ok(s.at('a', FIRE_POSITION), 'a suppresses from the fire position')
  assert.ok(s.at('b', FLANK.left), 'b flanks by the left route')
  assert.ok(s.at('c', s.cover('c')) && s.at('d', s.cover('d')), 'c and d defend at their covers')

  // The flanker drops out; the snapshot changes, the next squad decision gives the flank to c.
  s.squad.remove('b')
  const before = s.replans('c').length
  s.run(6)
  assert.equal(s.decisions[1].reason, 'roster')
  assert.deepEqual(s.plan(), ['!order a suppress', '!order c flank', '!order d defend'])
  const reorder = s.replans('c')[before]
  assert.equal(reorder.reason, 'facts defend -> flank', 'the new order replans c')
  assert.equal(reorder.kept, false, 'and interrupts its defend plan')
  assert.ok(s.at('c', FLANK.right), 'c flanks by the right route: its left one is blocked')
  assert.ok(s.at('a', FIRE_POSITION) && s.at('d', s.cover('d')), 'a and d keep their roles')

  // The only machine gunner drops out: no suppression, c keeps the flank (no new order, no interruption).
  s.squad.remove('a')
  const cBefore = s.replans('c').filter(r => r.reason.startsWith('facts')).length
  s.run(2)
  assert.deepEqual(s.plan(), ['!order c flank', '!order d defend'])
  assert.equal(s.replans('c').filter(r => r.reason.startsWith('facts')).length, cBefore)
  assert.ok(s.at('c', FLANK.right))

  // Everyone gone: a successful empty plan, no orders.
  s.squad.remove('c')
  s.squad.remove('d')
  s.run(0.1)
  assert.deepEqual(s.plan(), [])
  assert.equal(s.decisions[s.decisions.length - 1].status, 'succeeded')
  assert.equal(s.squad.orders.size, 0)
  s.squad.despawn()
})
