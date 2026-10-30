import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Transform } from '@dcl/sdk/ecs'
import { float, sym } from '../../src/htn-planner/htn/atom'
import type { GuardEvent } from '../../src/htn-planner/npc/actions'
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import { GuardSquad, createCapsuleBody } from '../../src/htn-planner/npc/guard-scene'
import { sceneClock } from '../../src/htn-planner/npc/clock-scene'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import { prim, scripted } from './fake-planner'

for (const event of ['replan', 'step', 'catch'] as const) {
  test(`onEvent ${event}: removing the current NPC stops execution before writing its disposed ECS body`, () => {
    let triggered = false
    let starts = 0
    const actions = { '!probe': () => ({ start() { starts++; return 'running' as const }, update() { return 'running' as const }, cancel() {} }) }
    const squad = new GuardSquad({
      planner: scripted(() => event === 'catch' ? [prim('!catch', sym('player')), prim('!probe')] : [prim('!probe')]).factory,
      actions, lineOfSight: CLEAR_LINE_OF_SIGHT, noise: null, targets: () => [], system: false,
      onEvent: e => { if (e.type === event && !triggered) { triggered = true; squad.remove(e.guard) } }
    })
    squad.spawn([{ id: 'g', route: [v3(0, 0, 0)], body: createCapsuleBody }])
    const agent = squad.guards[0].agent
    const entity = squad.guards[0].body.entity
    try {
      assert.doesNotThrow(() => squad.update(0.1))
      assert.equal(triggered, true)
      assert.equal(starts, 0, 'no action starts after callback removed this guard')
      assert.equal(squad.guards.length, 0)
      assert.equal(Transform.has(entity), false)
      const time = agent.time
      agent.tick(0.1, [])
      assert.equal(agent.time, time, 'stopped guard cannot resume from a stale reference')
    } finally { squad.despawn() }
  })
}

test('onEvent can remove another guard and despawn the squad without ticking disposed roster entries', () => {
  let triggered = false
  const squad = new GuardSquad({
    planner: scripted(() => [prim('!wait', float(100))]).factory,
    lineOfSight: CLEAR_LINE_OF_SIGHT, noise: null, targets: () => [], system: false,
    onEvent: e => { if (e.type === 'replan' && e.guard === 'g1' && !triggered) { triggered = true; squad.remove('g2'); squad.despawn() } }
  })
  squad.spawn(['g1', 'g2'].map(id => ({ id, route: [v3(0, 0, 0)], body: createCapsuleBody })))
  const second = squad.guards[1].agent
  try {
    assert.doesNotThrow(() => squad.update(0.1))
    assert.equal(triggered, true)
    assert.equal(second.time, 0, 'old roster must not tick the removed second guard')
    assert.equal(squad.active, false)
  } finally { squad.despawn() }
})

test('remove detaches before cancellation callbacks so a reentrant removal disposes only once', () => {
  let cancels = 0
  let disposals = 0
  let reentered = false
  const squad = new GuardSquad({
    planner: scripted(() => [prim('!probe')]).factory,
    actions: { '!probe': () => ({ start: () => 'running', update: () => 'running', cancel() { cancels++ } }) },
    lineOfSight: CLEAR_LINE_OF_SIGHT, noise: null, targets: () => [], system: false,
    onEvent: e => { if (e.type === 'step_end' && e.status === 'cancelled' && !reentered) { reentered = true; squad.remove(e.guard) } }
  })
  squad.spawn([{ id: 'g', route: [v3(0, 0, 0)], body: () => {
    const body = createCapsuleBody()
    return { ...body, dispose() { disposals++; body.dispose() } }
  } }])
  try {
    squad.update(0.1)
    assert.doesNotThrow(() => squad.remove('g'))
    assert.equal(cancels, 1)
    assert.equal(disposals, 1)
    assert.equal(squad.active, false)
  } finally { squad.despawn() }
})

test('one real ECS frame has one plan budget even at scale 4; manual updates remain independent frames', async () => {
  const clock = sceneClock()
  clock.resume()
  clock.setScale(4)
  const plan = scripted(() => [prim('!wait', float(100))])
  const events: GuardEvent[] = []
  const squad = new GuardSquad({ planner: plan.factory, budget: { maxPlansPerFrame: 1 }, lineOfSight: CLEAR_LINE_OF_SIGHT, noise: null, targets: () => [], onEvent: e => events.push(e) })
  squad.spawn(['g1', 'g2', 'g3', 'g4'].map(id => ({ id, route: [v3(0, 0, 0)], body: createCapsuleBody })))
  try {
    const before = squad.budget!.stats.frame
    await engine.update(0.1)
    assert.equal(squad.budget!.stats.frame - before, 1, 'four substeps must share one budget frame')
    assert.equal(plan.runner().calls, 1, 'only one of four NPCs may plan this engine frame')
    await engine.update(0.1)
    assert.equal(plan.runner().calls, 2, 'the next engine frame grants the next requester')
    const secondPlan = events.find(e => e.type === 'replan' && e.guard === 'g2')
    assert.ok(secondPlan?.type === 'replan')
    assert.equal(secondPlan.budgetFrames, 1, 'reported wait is one real frame, not four substeps')
    clock.pause()
    await engine.update(0.1)
    assert.equal(plan.runner().calls, 2, 'paused simulation does not consume a frame')
    squad.update(0.1)
    assert.equal(plan.runner().calls, 3, 'a direct update is one caller-managed frame')
    squad.update(0.1)
    assert.equal(plan.runner().calls, 4)
  } finally { squad.despawn(); clock.resume(); clock.setScale(1) }
})

test('builtin forget_noise matches its float32 fact timestamp in a long-running simulation and preserves a newer noise', () => {
  const plan = scripted((_call, world) => {
    const row = world.rows('heard_noise', 4)[0]
    return row ? [prim('!forget_noise', row[2]), prim('!wait', float(100))] : [prim('!wait', float(100))]
  })
  const agent = new GuardAgent({ id: 'g', planner: plan.factory, lineOfSight: CLEAR_LINE_OF_SIGHT, start: { position: v3(0, 0, 0), yaw: 0 } })
  const heardNoise = () => agent.blackboard.heardNoise
  const oldTime = 32768.002
  agent.blackboard.hear({ kind: 'bell', position: v3(0, 0, 2), time: oldTime, loudness: 1 })
  const oldFactTime = agent.blackboard.world.rows('heard_noise', 4)[0][2]
  assert.equal(oldFactTime.t, 'float')
  agent.tick(0.1, [])
  assert.equal(heardNoise(), null, 'the actual action must forget the same noise read by the planner')
  assert.deepEqual(agent.blackboard.world.rows('heard_noise', 4), [])
  agent.blackboard.hear({ kind: 'impact', position: v3(0, 0, 3), time: oldTime + 0.1, loudness: 1 })
  assert.equal(agent.blackboard.forgetNoise(oldFactTime.t === 'float' ? oldFactTime.v : NaN), false)
  assert.equal(heardNoise()?.kind, 'impact')
  agent.stop()
})


test('stopping from a completed action event neither cancels it twice nor starts the next action', () => {
  let starts = 0
  let cancels = 0
  const squad = new GuardSquad({
    planner: scripted(() => [prim('!probe'), prim('!probe')]).factory,
    actions: { '!probe': () => ({ start() { starts++; return 'done' }, update: () => 'done', cancel() { cancels++ } }) },
    lineOfSight: CLEAR_LINE_OF_SIGHT, noise: null, targets: () => [], system: false,
    onEvent: e => { if (e.type === 'step_end' && e.status === 'done') squad.remove(e.guard) }
  })
  squad.spawn([{ id: 'g', route: [v3(0, 0, 0)], body: createCapsuleBody }])
  try {
    assert.doesNotThrow(() => squad.update(0.1))
    assert.equal(starts, 1)
    assert.equal(cancels, 0, 'already completed action is detached before callback')
    assert.equal(squad.guards.length, 0)
  } finally { squad.despawn() }
})

test('stop is idempotent and terminal for stale tick, reload and replan calls', () => {
  let cancels = 0
  const plan = scripted(() => [prim('!probe')])
  const agent = new GuardAgent({
    id: 'g', planner: plan.factory, lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    actions: { '!probe': () => ({ start: () => 'running', update: () => 'running', cancel() { cancels++; agent.stop() } }) }
  })
  agent.tick(0.1, [])
  const time = agent.time
  const calls = plan.runner().calls
  agent.stop()
  agent.stop()
  agent.requestReplan('stale request', true)
  agent.reload(() => { throw new Error('stopped agent must not create a new runner') })
  agent.tick(0.1, [])
  assert.equal(cancels, 1)
  assert.equal(agent.time, time)
  assert.equal(plan.runner().calls, calls)
  assert.equal(agent.currentAction, '')
})


test('stop from a reasoning action callback prevents later upkeep actions and normal execution', () => {
  let starts = 0
  const plan = scripted(() => [prim('!catch', sym('player')), prim('!probe')])
  const agent = new GuardAgent({
    id: 'g', planner: plan.factory, reasoning: 'upkeep', lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    actions: { '!probe': () => ({ start() { starts++; return 'done' }, update: () => 'done', cancel() {} }) },
    onEvent: e => { if (e.type === 'catch') agent.stop() }
  })
  agent.tick(0.1, [])
  assert.equal(starts, 0)
  assert.equal(agent.currentAction, '')
})
