// ECS layer on the real headless engine, with the scripted fake planner, and the real one over small compiled domains.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Entity, Material, MeshRenderer, Raycast, Transform } from '@dcl/sdk/ecs'
import { float, formatAtom, sym, vec3 } from '../../src/htn-planner/htn/atom'
import type { GuardEvent } from '../../src/htn-planner/npc/actions'
import type { DomainIR } from '../../src/htn-planner/htn/ir'
import { RUNNING_FACT, type GuardAgent } from '../../src/htn-planner/npc/agent'
import { createCapsuleBody, GuardSquad, MODE_COLORS, playerTargets, plannerFor, possessEntityBody, type GuardSpec, type SquadDecision } from '../../src/htn-planner/npc/guard-scene'
import type { WorldState } from '../../src/htn-planner/htn/world-state'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { RaycastLineOfSight } from '../../src/htn-planner/npc/raycast-los'
import { v3 } from '../../src/htn-planner/npc/vec'
import type { PlanBudgetOptions } from '../../src/htn-planner/npc/plan-budget'
import { agentHistory } from '../../src/htn-planner/npc/history'
import { prim, scripted } from './fake-planner'
import { compileDomainSource } from '../../tools/htn/compiler'

const FLAT = { groundY: () => 0.2 }

function countEntities(): number {
  let n = 0
  for (const _ of engine.getEntitiesWith(Transform)) n++
  return n
}

async function run(seconds: number, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) await engine.update(dt)
}

function albedo(e: Entity) {
  const m = Material.get(e).material
  assert.ok(m && m.$case === 'pbr')
  return m.pbr.albedoColor
}

test('capsule guards spawn, follow their agent, recolor by mode, and despawn cleanly', async () => {
  const before = countEntities()
  const plan = scripted((_call, world) =>
    world.rows('target_visible', 2).length > 0 ? [prim('!wait', float(100))] : [prim('!move_to', vec3(10, 0.2, 14), sym('walk'))]
  )
  let targets: { id: string; position: { x: number; y: number; z: number } }[] = []
  const squad = new GuardSquad({
    planner: plan.factory,
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    terrain: FLAT,
    perception: { detectTime: 0, nearDetectTime: 0 },
    targets: () => targets
  })
  squad.spawn([{ id: 'g1', route: [v3(10, 0, 10)], body: createCapsuleBody }])
  assert.equal(countEntities(), before + 4)
  const h = squad.guards[0]
  assert.deepEqual(Transform.get(h.body.entity).position, { x: 10, y: 0.2, z: 10 })
  assert.equal(MeshRenderer.get(h.body.ownEntities[1]).mesh?.$case, 'cylinder')
  await run(1)
  const p = Transform.get(h.body.entity).position
  assert.ok(p.z > 10.5 && p.z < 14, `moved to z=${p.z}`)
  assert.equal(p.y, 0.2)
  assert.deepEqual(albedo(h.body.ownEntities[1]), { ...MODE_COLORS.patrol, a: 1 })
  targets = [{ id: 'player', position: v3(10, 0, 16) }]
  await run(0.1)
  assert.equal(h.agent.mode, 'chase')
  assert.deepEqual(albedo(h.body.ownEntities[1]), { ...MODE_COLORS.chase, a: 1 })

  squad.despawn()
  assert.equal(squad.active, false)
  assert.equal(countEntities(), before)
  const time = h.agent.time
  await run(0.5)
  assert.equal(h.agent.time, time, 'system removed: the agent no longer ticks')
})

test('the squad passes the planning options on to its agents', () => {
  // Calls 0, 1: an empty plan (two passes, then it stands); 2: a long wait; then nothing.
  const plan = scripted(call => (call < 2 ? [] : call === 2 ? [prim('!wait', float(100))] : null))
  let now = 0
  const replans: { reason: string; passes: number }[] = []
  let targets: { id: string; position: { x: number; y: number; z: number } }[] = []
  const squad = new GuardSquad({
    planner: plan.factory,
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    terrain: FLAT,
    noise: null,
    perception: { detectTime: 0, nearDetectTime: 0 },
    targets: () => targets,
    maxPlanningPasses: 2,
    replanThrottle: 1,
    onNoPlan: 'cancel',
    clock: () => (now += 3),
    onEvent: e => {
      if (e.type === 'replan') replans.push({ reason: e.reason, passes: e.passes })
    }
  })
  squad.spawn([{ id: 'g1', route: [v3(10, 0, 10), v3(10, 0, 14)], body: createCapsuleBody }])
  const agent = squad.guards[0].agent
  squad.update(0.1)
  assert.deepEqual(replans[0], { reason: 'start', passes: 2 }) // maxPlanningPasses
  squad.update(0.1) // the empty plan completes; the next plan is the wait
  assert.equal(agent.currentAction, '!wait')
  const m = agent.metrics
  assert.deepEqual(
    { lastPlanMs: m.lastPlanMs, totalPlanMs: m.totalPlanMs, maxPlanMs: m.maxPlanMs, plansMade: m.plansMade, tasksCompleted: m.tasksCompleted },
    { lastPlanMs: 3, totalPlanMs: 9, maxPlanMs: 3, plansMade: 3, tasksCompleted: 0 }
  ) // clock
  targets = [{ id: 'player', position: v3(10, 0, 16) }]
  for (let i = 0; i < 9; i++) squad.update(0.1) // t = 1.1: the replan waits for the 1 s throttle (last plan at 0.2)
  assert.equal(agent.currentAction, '!wait')
  squad.update(0.1)
  assert.equal(replans[replans.length - 1].reason, 'perception | -> player|')
  assert.equal(agent.currentAction, '') // onNoPlan 'cancel'
  squad.despawn()
})

test('the squad passes topLevel and activePlan on: a guard whose running step fails the check is cancelled', async () => {
  const r = compileDomainSource(
    'Hold.domain',
    `(:domain Hold top_level_domain
        (:method (act) top_level_method (hold () ((!wait 100.0))))
        (:method (check) top_level_method (hold_valid (and (running wait ?any_s) (post_manned)) ())))`
  )
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
  const events: GuardEvent[] = []
  const squad = new GuardSquad({
    planner: plannerFor(r.ir),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    terrain: FLAT,
    noise: null,
    targets: () => [],
    topLevel: 'act',
    activePlan: 'check',
    onEvent: e => events.push(e)
  })
  squad.spawn([{ id: 'g1', route: [v3(4, 0, 4)], body: createCapsuleBody }])
  const world = squad.guards[0].agent.blackboard.world
  world.add('post_manned')
  await run(0.2)
  assert.deepEqual(world.rows(RUNNING_FACT, 2).map(row => formatAtom(row[1])), ['100.0'])
  world.clear('post_manned', 0)
  await run(0.1)
  assert.deepEqual(
    events.filter(e => e.type === 'check' || e.type === 'step_end').map(e => e.type),
    ['check', 'step_end']
  )
  squad.despawn()
})

test('the squad passes continueTask on: a guard keeps its running step when the domain plans (!continue)', async () => {
  const r = compileDomainSource(
    'Stay.domain',
    `(:domain Stay top_level_domain
        (:method (act) top_level_method
            (keep (and (running wait ?any_s) (stay)) ((!continue)))
            (hold () ((!wait 100.0)))))`
  )
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
  const events: GuardEvent[] = []
  const squad = new GuardSquad({
    planner: plannerFor(r.ir),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    terrain: FLAT,
    noise: null,
    targets: () => [],
    topLevel: 'act',
    continueTask: '!continue',
    onEvent: e => events.push(e)
  })
  squad.spawn([{ id: 'g1', route: [v3(4, 0, 4)], body: createCapsuleBody }])
  const agent = squad.guards[0].agent
  await run(0.2)
  agent.blackboard.world.add('stay')
  agent.requestReplan('poke', true)
  await run(0.1)
  const last = events.filter((e): e is Extract<GuardEvent, { type: 'replan' }> => e.type === 'replan').pop()!
  assert.equal(last.continued, true)
  assert.deepEqual(events.filter(e => e.type === 'step_end'), [], 'the wait was never cut')
  squad.despawn()
})

test('possessing an existing figure moves it with its attachments and restores everything on despawn', async () => {
  // Mirrors the composite priest: cylinder body, collar in front (-Z), head above.
  const body = engine.addEntity()
  Transform.create(body, { position: v3(64, 1, 12), scale: v3(0.8, 1.6, 0.7) })
  const collar = engine.addEntity()
  Transform.create(collar, { position: v3(64, 1.7, 11.7), scale: v3(0.14, 0.05, 0.02) })
  const head = engine.addEntity()
  Transform.create(head, { position: v3(64, 2.02, 12), scale: v3(0.36, 0.42, 0.36) })
  const snapshot = () => [body, collar, head].map(e => JSON.parse(JSON.stringify(Transform.get(e))))
  const original = snapshot()
  const before = countEntities()

  const plan = scripted(call => (call === 0 ? [prim('!move_to', vec3(70, 0.2, 12), sym('walk'))] : [prim('!wait', float(100))]))
  const squad = new GuardSquad({ planner: plan.factory, lineOfSight: CLEAR_LINE_OF_SIGHT, terrain: FLAT, targets: () => [] })
  squad.spawn([
    {
      id: 'priest',
      route: [v3(70, 0, 12)],
      body: () => possessEntityBody(body, { groundY: 0.2, facingYaw: Math.PI, attachments: [collar, head] })
    }
  ])
  const agent = squad.guards[0].agent
  assert.ok(Math.abs(Math.abs(agent.kinematic.yaw) - Math.PI) < 1e-9, 'starts facing -Z like the figure')
  assert.equal(countEntities(), before + 1) // mode indicator only
  await run(8)
  const b = Transform.get(body).position
  assert.ok(Math.abs(b.x - 70) < 0.35 && Math.abs(b.z - 12) < 0.01, `body at ${JSON.stringify(b)}`)
  assert.ok(Math.abs(b.y - 1) < 1e-6, 'feet offset kept')
  // Facing +X now: the collar (0.3 m in front) must be at +X of the body, at the same height.
  const c = Transform.get(collar).position
  assert.ok(Math.abs(c.x - (b.x + 0.3)) < 0.02 && Math.abs(c.z - b.z) < 0.02, `collar at ${JSON.stringify(c)}`)
  assert.ok(Math.abs(c.y - 1.7) < 1e-6)
  const hd = Transform.get(head).position
  assert.ok(Math.abs(hd.x - b.x) < 1e-6 && Math.abs(hd.z - b.z) < 1e-6)
  assert.deepEqual(Transform.get(body).scale, v3(0.8, 1.6, 0.7))

  squad.despawn()
  assert.deepEqual(snapshot(), original)
  assert.equal(countEntities(), before)
})

test('playerTargets reads the player Transform', () => {
  Transform.createOrReplace(engine.PlayerEntity, { position: v3(3, 0.2, 4) })
  assert.deepEqual(playerTargets(), [{ id: 'player', position: v3(3, 0.2, 4) }])
})

test('raycast line of sight: one global-target ray per observer, blocked until an answer arrives', async () => {
  const los = new RaycastLineOfSight()
  const before = countEntities()
  assert.equal(los.check('g', v3(0, 1.6, 0), v3(0, 1.2, 10), 0), false)
  assert.equal(countEntities(), before + 1)
  await engine.update(1 / 30) // raycastSystem registers the ray on the next tick
  const rays = [...engine.getEntitiesWith(Raycast)]
  assert.equal(rays.length, 1)
  const [, ray] = rays[0]
  assert.equal(ray.direction?.$case, 'globalTarget')
  if (ray.direction?.$case === 'globalTarget') assert.deepEqual(ray.direction.globalTarget, v3(0, 1.2, 10))
  assert.equal(ray.continuous, false)
  assert.ok(Math.abs(ray.maxDistance - (Math.hypot(0.4, 10) - 0.6)) < 1e-6)
  // Still in flight: no second ray.
  assert.equal(los.check('g', v3(0, 1.6, 0), v3(0, 1.2, 10), 0.1), false)
  los.release('g')
  assert.equal(countEntities(), before)
})

test('GuardSquad.reload: every guard drops its plan and replans from the new factory; later spawns use it too', async () => {
  const started: string[] = []
  const a = scripted(() => [prim('!wait', float(100))])
  const b = scripted(() => [prim('!wait', float(50))])
  const squad = new GuardSquad({
    planner: a.factory,
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    terrain: FLAT,
    noise: null,
    targets: () => [],
    onEvent: e => {
      if (e.type === 'step') started.push(`${e.guard} ${formatAtom(e.args[0])}`)
    }
  })
  squad.spawn([
    { id: 'g1', route: [v3(4, 0, 4)], body: createCapsuleBody },
    { id: 'g2', route: [v3(6, 0, 4)], body: createCapsuleBody }
  ])
  await run(0.2)
  assert.deepEqual(started, ['g1 100.0', 'g2 100.0'])
  squad.reload(b.factory)
  await run(0.2)
  squad.spawn([{ id: 'g3', route: [v3(8, 0, 4)], body: createCapsuleBody }])
  await run(0.2)
  assert.deepEqual(started, ['g1 100.0', 'g2 100.0', 'g1 50.0', 'g2 50.0', 'g3 50.0'])
  squad.despawn()
})

test('GuardSquad planner: the factory gets the guard it builds for, on spawn and on reload', () => {
  const built: string[] = []
  const factory = (tag: string) => (world: WorldState, guard: GuardSpec) => {
    built.push(`${tag} ${guard.id}`)
    return scripted(() => [prim('!wait', float(100))]).factory(world)
  }
  const squad = new GuardSquad({ planner: factory('v1'), lineOfSight: CLEAR_LINE_OF_SIGHT, terrain: FLAT, noise: null, targets: () => [] })
  squad.spawn([
    { id: 'g1', route: [v3(4, 0, 4)], body: createCapsuleBody },
    { id: 'g2', route: [v3(6, 0, 4)], body: createCapsuleBody }
  ])
  squad.update(0.1)
  assert.deepEqual([...new Set(built)], ['v1 g1', 'v1 g2'])
  built.length = 0
  squad.reload(factory('v2'))
  squad.update(0.1)
  assert.deepEqual([...new Set(built)], ['v2 g1', 'v2 g2'])
  squad.despawn()
})

test('GuardSquad history: each guard records into its own ring (undefined: none)', () => {
  const rings = new Map([['g1', agentHistory(16)], ['g2', agentHistory(16)]])
  const squad = new GuardSquad({
    planner: scripted(() => [prim('!wait', float(100))]).factory,
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    terrain: FLAT,
    noise: null,
    targets: () => [],
    history: guard => rings.get(guard.id)
  })
  squad.spawn([
    { id: 'g1', route: [v3(4, 0, 4)], body: createCapsuleBody },
    { id: 'g2', route: [v3(6, 0, 4)], body: createCapsuleBody },
    { id: 'g3', route: [v3(8, 0, 4)], body: createCapsuleBody }
  ])
  squad.update(0.1)
  for (const id of ['g1', 'g2']) {
    const events = rings.get(id)!.toArray()
    assert.ok(events.length > 0, id)
    assert.ok(events.every(e => e.event.guard === id), `${id} has only its own events`)
  }
  squad.despawn()
})

test('GuardSquad system false: no ECS system, the host ticks the guards with update(dt)', async () => {
  const squad = new GuardSquad({
    planner: scripted(() => [prim('!wait', float(100))]).factory,
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    terrain: FLAT,
    noise: null,
    targets: () => [],
    system: false
  })
  squad.spawn([{ id: 'g1', route: [v3(4, 0, 4)], body: createCapsuleBody }])
  const agent = squad.guards[0].agent
  await engine.update(0.1)
  assert.equal(agent.time, 0, 'no system: the engine does not tick the guards')
  squad.update(0.05)
  assert.ok(Math.abs(agent.time - 0.05) < 1e-9, `the host did: ${agent.time}`)
  await engine.update(0.1)
  assert.ok(Math.abs(agent.time - 0.05) < 1e-9, 'still only the host')
  squad.despawn()
})

// ---- the squad planner option (register row H17) ----------------------------------------------------------------

function compiled(name: string, source: string): DomainIR {
  const r = compileDomainSource(`${name}.domain`, source)
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
  return r.ir
}

/** Orders: hold while there is an alarm, else patrol; a step for a member that is not there and a non-order step. */
const COMMAND = (patrolWord: string) =>
  compiled(
    'Command',
    `(:domain Command top_level_domain
        (:method (decide) top_level_method
            (hold (and (alarm)) ((!order g1 hold) (!order g2 hold 2)))
            (patrol () ((!order g1 ${patrolWord}) (!order ghost ${patrolWord}) (!shout)))))`
  )
const ALARM_ONLY = compiled('Command', `(:domain Command top_level_domain (:method (decide) top_level_method (hold (and (alarm)) ((!order g1 hold)))))`)
const MEMBER = compiled('Member', `(:domain Member top_level_domain (:method (behave) top_level_method (go () ((!wait 100.0)))))`)

function commandSquad(command: DomainIR, extra?: { syncFacts?: (a: GuardAgent) => string; minInterval?: number; budget?: PlanBudgetOptions }) {
  let alarm = false
  const decisions: SquadDecision[] = []
  const replans: string[] = []
  const squad = new GuardSquad({
    planner: plannerFor(MEMBER),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    terrain: FLAT,
    noise: null,
    targets: () => [],
    syncFacts: extra?.syncFacts,
    budget: extra?.budget,
    squad: {
      planner: plannerFor(command),
      topLevel: 'decide',
      minInterval: extra?.minInterval,
      snapshot: w => {
        if (alarm) w.add('alarm')
        return alarm ? 'alarm' : ''
      },
      onDecision: d => decisions.push(d)
    },
    onEvent: e => {
      if (e.type === 'replan') replans.push(`${e.guard} ${e.reason}`)
    }
  })
  squad.spawn([
    { id: 'g1', route: [v3(4, 0, 4)], body: createCapsuleBody },
    { id: 'g2', route: [v3(6, 0, 4)], body: createCapsuleBody }
  ])
  const facts = (id: string) => {
    const w = squad.guards.find(g => g.spec.id === id)!.agent.blackboard.world
    return [1, 2].flatMap(n => w.rows('order', n).map(r => r.map(formatAtom).join(' ')))
  }
  return { squad, decisions, replans, facts, alarm: (on: boolean) => (alarm = on) }
}

test('squad option: orders become facts in each guard world; steps it cannot apply are listed; a new snapshot decides again', async () => {
  const s = commandSquad(COMMAND('patrol'))
  await run(0.2)
  assert.equal(s.decisions.length, 1)
  const [d] = s.decisions
  assert.deepEqual({ reason: d.reason, status: d.status, plan: d.plan }, { reason: 'start', status: 'succeeded', plan: ['!order g1 patrol', '!order ghost patrol', '!shout'] })
  assert.deepEqual(d.ignored, ['!order ghost patrol: no guard ghost', '!shout: not an order'])
  assert.deepEqual(s.facts('g1'), ['patrol'])
  assert.deepEqual(s.facts('g2'), [], 'no order, no fact')

  s.alarm(true)
  await run(0.1)
  assert.equal(s.decisions[1].reason, 'snapshot  -> alarm')
  assert.deepEqual(s.facts('g1'), ['hold'])
  assert.deepEqual(s.facts('g2'), ['hold 2'], 'any arguments after the member')
  assert.ok(s.replans.includes('g1 facts patrol -> hold') && s.replans.includes('g2 facts  -> hold 2'), s.replans.join('\n'))

  s.alarm(false)
  await run(0.1)
  assert.deepEqual(s.facts('g1'), ['patrol'])
  assert.deepEqual(s.facts('g2'), [], 'the old order is gone')
  s.squad.despawn()
})

test('squad option: no plan keeps the orders; requestDecision decides again', async () => {
  const s = commandSquad(ALARM_ONLY)
  s.alarm(true)
  await run(0.1)
  assert.deepEqual(s.facts('g1'), ['hold'])
  s.alarm(false)
  await run(0.1)
  assert.equal(s.decisions[1].status, 'no_plan')
  assert.deepEqual(s.facts('g1'), ['hold'], 'kept')
  s.squad.requestDecision('asked')
  await run(0.1)
  assert.equal(s.decisions[2].reason, 'asked')
  s.squad.despawn()
})

test('squad option: the host syncFacts runs too, its key joins the order key', async () => {
  const s = commandSquad(COMMAND('patrol'), {
    syncFacts: a => {
      a.blackboard.world.set('me', sym(a.id))
      return 'x'
    }
  })
  await run(0.1)
  assert.equal(s.squad.guards[0].agent.blackboard.world.rows('me', 1).length, 1)
  assert.ok(s.replans.includes('g1 start'))
  s.alarm(true)
  await run(0.3) // a changed key replans after the 0.25 s throttle
  assert.ok(s.replans.includes('g1 facts patrol|x -> hold|x'), s.replans.join('\n'))
  s.squad.despawn()
})

test('GuardSquad.reload with a squad planner: the guards reload and the squad decides again from the new domain', async () => {
  const s = commandSquad(COMMAND('patrol'))
  await run(0.1)
  assert.deepEqual(s.facts('g1'), ['patrol'])
  s.squad.reload(plannerFor(MEMBER), plannerFor(COMMAND('sweep')))
  assert.deepEqual(s.facts('g1'), ['patrol'], 'orders stay until the new decision')
  await run(0.1)
  assert.equal(s.decisions[1].reason, 'reload')
  assert.deepEqual(s.facts('g1'), ['sweep'])
  assert.ok(s.replans.filter(r => r.startsWith('g2 ')).includes('g2 reload'))
  // Without a squad planner the squad keeps its squad domain.
  s.squad.reload(plannerFor(MEMBER))
  await run(0.1)
  assert.equal(s.decisions.length, 2)
  s.squad.despawn()
})

test('GuardSquad.remove: the guard stops, its body goes, the squad decides again', async () => {
  const s = commandSquad(COMMAND('patrol'))
  await run(0.1)
  const before = countEntities()
  s.squad.remove('g2')
  assert.equal(countEntities(), before - 4)
  assert.deepEqual(s.squad.guards.map(g => g.spec.id), ['g1'])
  await run(0.1)
  assert.equal(s.decisions[1].reason, 'roster')
  s.squad.remove('nobody')
  s.squad.despawn()
})

test('squad option minInterval: a key change inside the interval waits for it, then decides once', async () => {
  const s = commandSquad(COMMAND('patrol'), { minInterval: 1 })
  await run(0.1)
  assert.deepEqual(s.decisions.map(d => d.reason), ['start'])
  s.alarm(true)
  await run(0.5)
  assert.equal(s.decisions.length, 1, 'inside the interval: remembered, not decided')
  assert.deepEqual(s.facts('g1'), ['patrol'])
  s.alarm(false)
  await run(0.1)
  s.alarm(true)
  await run(0.4) // about 1.1 s since the first decision
  assert.deepEqual(s.decisions.map(d => d.reason), ['start', 'snapshot  -> alarm'], 'the first change is the reason, decided once')
  assert.deepEqual(s.facts('g1'), ['hold'], 'decided from the snapshot as it is when the interval elapses')
  s.alarm(false)
  await run(0.5)
  assert.equal(s.decisions.length, 2)
  await run(0.6)
  assert.equal(s.decisions.length, 3)
  assert.deepEqual(s.facts('g1'), ['patrol'])
  s.squad.despawn()
})

test('squad option minInterval: requestDecision waits unless urgent; a spawn, a remove and a reload do not wait', async () => {
  const s = commandSquad(COMMAND('patrol'), { minInterval: 10 })
  await run(0.1)
  s.squad.requestDecision('asked')
  await run(0.2)
  assert.equal(s.decisions.length, 1, 'a plain request waits for the interval')
  s.squad.requestDecision('now', true)
  await run(0.1)
  assert.deepEqual(s.decisions.map(d => d.reason), ['start', 'asked'], 'urgent: decided at once, under the first reason')
  s.squad.remove('g2')
  await run(0.1)
  assert.equal(s.decisions[2]?.reason, 'roster')
  s.squad.spawn([{ id: 'g3', route: [v3(8, 0, 4)], body: createCapsuleBody }])
  await run(0.1)
  assert.equal(s.decisions[3]?.reason, 'roster')
  s.squad.reload(plannerFor(MEMBER), plannerFor(COMMAND('sweep')))
  await run(0.1)
  assert.equal(s.decisions[4]?.reason, 'reload')
  assert.deepEqual(s.facts('g1'), ['sweep'])
  s.alarm(true)
  await run(0.5)
  assert.equal(s.decisions.length, 5, 'a key change still waits for the interval after an urgent decision')
  s.squad.despawn()
})

test('GuardSquad budget: one budget for the squad decision and the guards replans, spread over frames, fairly', async () => {
  const s = commandSquad(COMMAND('patrol'), { budget: { maxPlansPerFrame: 1 } })
  const budget = s.squad.budget!
  const plans = () => s.squad.guards.map(g => g.agent.metrics.plansMade)
  const frame = () => engine.update(1 / 30)
  await frame()
  assert.deepEqual(s.decisions.map(d => d.reason), ['start'], 'the squad decides first')
  assert.deepEqual(plans(), [0, 0], 'the guards wait')
  s.alarm(true) // the squad wants to decide again, but the guards waited longer
  await frame()
  assert.deepEqual(plans(), [1, 0])
  assert.equal(s.decisions.length, 1)
  await frame()
  assert.deepEqual(plans(), [1, 1])
  assert.equal(s.decisions.length, 1)
  await frame()
  assert.deepEqual(s.decisions.map(d => [d.reason, d.waitedFrames]), [['start', 0], ['snapshot  -> alarm', 2]])
  assert.deepEqual(s.facts('g1'), ['hold'])
  assert.equal(budget.stats.maxRunsInFrame, 1)
  assert.equal(budget.stats.maxWaitFrames, 2)
  assert.deepEqual(s.squad.guards.map(g => g.agent.metrics.budgetMaxWaitFrames), [1, 2])
  // The new orders replan both guards after their throttle: one a frame.
  await run(0.4)
  assert.ok(s.replans.includes('g1 facts patrol -> hold') && s.replans.includes('g2 facts  -> hold 2'), s.replans.join('\n'))
  assert.equal(budget.stats.maxRunsInFrame, 1)
  s.squad.remove('g2')
  assert.equal(budget.waiting, 0)
  s.squad.despawn()
})

test('GuardSquad without budget has none: every replan runs when due, as before', async () => {
  const s = commandSquad(COMMAND('patrol'))
  assert.equal(s.squad.budget, null)
  await engine.update(1 / 30)
  assert.deepEqual(s.squad.guards.map(g => g.agent.metrics.plansMade), [1, 1])
  assert.equal(s.decisions[0].waitedFrames, 0)
  s.squad.despawn()
})
