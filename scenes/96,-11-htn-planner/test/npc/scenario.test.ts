// Headless scenarios on the real ECS engine with the REAL HTN planner and the guard domain (with its belief upkeep,
// GuardAgentOptions.reasoning). The domain tests plan a decision as the agent does: the upkeep to its fixpoint, then
// behave (./decide.ts); what the frozen flat domain did as a whole bookkeeping plan is upkeep here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Transform } from '@dcl/sdk/ecs'
import { formatTask } from '../../src/htn-planner/htn/atom'
import { decompose, decomposeDeferred, PlanStep } from '../../src/htn-planner/htn/planner'
import type { GuardEvent } from '../../src/htn-planner/npc/actions'
import { GuardBlackboard } from '../../src/htn-planner/npc/blackboard'
import { guardDomain } from '../../src/examples/guard/guard.htn'
import { decide } from './decide'
import { createCapsuleBody, GuardSquad, GuardSquadOptions, plannerFor, possessEntityBody } from '../../src/htn-planner/npc/guard-scene'
import { GeometricLineOfSight } from '../../src/htn-planner/npc/perception'
import { atomName, atomVec3 } from '../../src/htn-planner/npc/actions'
import { emitNoise } from '../../src/htn-planner/npc/noise-scene'
import { angleDiff, distanceXZ, v3, Vec3, yawTo } from '../../src/htn-planner/npc/vec'

const fmt = (plan: readonly PlanStep[]) => plan.map(s => formatTask(s.name, s.args))

// ---- the domain on its own -------------------------------------------------------------------

function board(setup: (b: GuardBlackboard) => void): GuardBlackboard {
  const b = new GuardBlackboard()
  b.setTime(10)
  b.setSelfPosition(v3(0, 0, 0))
  b.setVisible([])
  setup(b)
  return b
}

test('domain: patrol walks to the current waypoint, pauses, then defers advancing', () => {
  const b = board(b => b.setRoute([v3(1, 0, 2), v3(3, 0, 4)], 0))
  assert.deepEqual(decide(guardDomain, b).upkeep, [])
  const r = decompose(guardDomain, b.world, 'behave', [])
  assert.equal(r.status, 'succeeded')
  assert.deepEqual(fmt(r.plan), ['!move_to (1.0 0.0 2.0) walk', '!wait 1.0', '&advance_patrol'])
  // The deferred step reads the waypoint as it is when reached, and wraps around.
  b.setWaypoint(1)
  const deferred = r.plan[2]
  assert.equal(deferred.kind, 'deferred')
  if (deferred.kind !== 'deferred') return
  const next = decomposeDeferred(guardDomain, b.world, deferred)
  assert.equal(next.status, 'succeeded')
  assert.deepEqual(fmt(next.plan), ['!set_waypoint 0'])
})

test('domain: a visible target is chased first', () => {
  const b = board(b => {
    b.setRoute([v3(1, 0, 2)])
    b.remember({ id: 'ghost', position: v3(5, 0, 6), time: 9 })
    b.setVisible([{ id: 'player', position: v3(4, 0, 4), distance: 5 }])
  })
  assert.deepEqual(decide(guardDomain, b).plan, ['!chase player', '!catch player', '!wait 1.5'])
})

test('domain: a fresh memory is investigated, a stale one forgotten (upkeep) and the patrol goes on', () => {
  const fresh = board(b => {
    b.setRoute([v3(1, 0, 2)])
    b.remember({ id: 'player', position: v3(5, 0, 6), time: 9 })
  })
  assert.deepEqual(decide(guardDomain, fresh).plan, [
    '!move_to (5.0 0.0 6.0) hurry',
    '!look_around 3.0',
    '!forget player'
  ])
  const stale = board(b => {
    b.setRoute([v3(1, 0, 2)])
    b.remember({ id: 'player', position: v3(5, 0, 6), time: 9 })
    b.setTime(29.5)
  })
  assert.deepEqual(decide(guardDomain, stale), { upkeep: ['!forget player'], plan: ['!move_to (1.0 0.0 2.0) walk', '!wait 1.0', '&advance_patrol'] })
})

test('domain: no route means idle', () => {
  const b = board(() => {})
  assert.deepEqual(decide(guardDomain, b).plan, ['!wait 1.0'])
})

// ---- hearing in the domain ------------------------------------------------------------------

function heard(b: GuardBlackboard, level: 'wary' | 'alarmed', loudness: number, time = 9) {
  b.hear({ kind: 'run', position: v3(5, 0, -6), time, loudness })
  b.setAlert(level)
}

test('domain: a faint noise makes the guard turn toward it and listen, then forget it', () => {
  const b = board(b => {
    b.setRoute([v3(1, 0, 2)])
    heard(b, 'wary', 0.2)
  })
  assert.deepEqual(decide(guardDomain, b).plan, [
    '!turn_to (5.0 0.0 -6.0)',
    '!listen 2.0',
    '!forget_noise 9.0'
  ])
})

test('domain: an alarming noise makes the guard flinch, hurry there, search and forget; very loud means run', () => {
  const alarming = board(b => {
    b.setRoute([v3(1, 0, 2)])
    heard(b, 'alarmed', 0.6)
  })
  assert.deepEqual(decide(guardDomain, alarming).plan, [
    '!turn_to (5.0 0.0 -6.0)',
    '!listen 0.6',
    '!move_to (5.0 0.0 -6.0) hurry',
    '!look_around 3.0',
    '!forget_noise 9.0'
  ])
  const veryLoud = board(b => {
    b.setRoute([v3(1, 0, 2)])
    heard(b, 'alarmed', 0.8)
  })
  assert.equal(decide(guardDomain, veryLoud).plan[2], '!move_to (5.0 0.0 -6.0) run')
})

test('domain: seeing beats hearing; an alarming noise beats a last-seen memory, a faint one does not', () => {
  const seen = board(b => {
    b.setRoute([v3(1, 0, 2)])
    heard(b, 'alarmed', 0.9)
    b.setVisible([{ id: 'player', position: v3(4, 0, 4), distance: 5 }])
  })
  assert.equal(decide(guardDomain, seen).plan[0], '!chase player')
  const alarmedVsMemory = board(b => {
    b.setRoute([v3(1, 0, 2)])
    b.remember({ id: 'player', position: v3(8, 0, 8), time: 9 })
    heard(b, 'alarmed', 0.6)
  })
  assert.equal(decide(guardDomain, alarmedVsMemory).plan[0], '!turn_to (5.0 0.0 -6.0)')
  const faintVsMemory = board(b => {
    b.setRoute([v3(1, 0, 2)])
    b.remember({ id: 'player', position: v3(8, 0, 8), time: 9 })
    heard(b, 'wary', 0.2)
  })
  assert.equal(decide(guardDomain, faintVsMemory).plan[0], '!move_to (8.0 0.0 8.0) hurry')
})

test('domain: a stale noise is forgotten (upkeep); forget_noise keeps a newer noise', () => {
  const stale = board(b => {
    b.setRoute([v3(1, 0, 2)])
    heard(b, 'alarmed', 0.9, 9)
    b.setTime(21.5)
  })
  assert.deepEqual(decide(guardDomain, stale), { upkeep: ['!forget_noise 9.0'], plan: ['!move_to (1.0 0.0 2.0) walk', '!wait 1.0', '&advance_patrol'] })
  const b = board(b => heard(b, 'wary', 0.2, 9))
  b.hear({ kind: 'steps', position: v3(6, 0, -6), time: 9.5, loudness: 0.3 })
  assert.equal(b.forgetNoise(9), false, 'superseded by the noise heard at 9.5')
  assert.equal(b.world.rows('heard_noise', 4).length, 1)
  assert.equal(b.forgetNoise(9.5), true)
  assert.equal(b.world.rows('heard_noise', 4).length, 0)
})

// ---- scenarios on the ECS engine ------------------------------------------------------------

const DT = 1 / 30
const FAR = v3(120, 0.2, 120)

function setPlayer(p: Vec3) {
  Transform.createOrReplace(engine.PlayerEntity, { position: p })
}

function makeSquad(extra: Partial<GuardSquadOptions> = {}) {
  const events: GuardEvent[] = []
  const los = new GeometricLineOfSight()
  const squad = new GuardSquad({ planner: plannerFor(guardDomain), reasoning: 'reasoning', lineOfSight: los, onEvent: e => events.push(e), ...extra })
  return { squad, los, events }
}

/** Run until `stop` returns true or `seconds` elapse; returns elapsed time. */
async function runUntil(seconds: number, stop: () => boolean = () => false): Promise<number> {
  let t = 0
  while (t < seconds) {
    await engine.update(DT)
    t += DT
    if (stop()) break
  }
  return t
}

const steps = (events: GuardEvent[]) => events.filter((e): e is Extract<GuardEvent, { type: 'step' }> => e.type === 'step')

test('scenario: a guard patrols and visits its waypoints in order', async () => {
  setPlayer(FAR)
  const route = [v3(20, 0, 20), v3(20, 0, 30), v3(30, 0, 30)]
  const { squad, events } = makeSquad()
  try {
    squad.spawn([{ id: 'g', route, body: createCapsuleBody }])
    const g = squad.guards[0]
    const visits: number[] = []
    events.length = 0
    await runUntil(50, () => {
      const waits = steps(events).filter(e => e.name === '!wait')
      while (visits.length < waits.length) {
        const pos = g.agent.kinematic.position
        let best = 0
        route.forEach((p, i) => (distanceXZ(pos, p) < distanceXZ(pos, route[best]) ? (best = i) : 0))
        assert.ok(distanceXZ(pos, route[best]) <= 0.35, `pause away from a waypoint at ${JSON.stringify(pos)}`)
        visits.push(best)
      }
      assert.equal(g.agent.mode, 'patrol')
      return visits.length >= 5
    })
    assert.deepEqual(visits.slice(0, 5), [0, 1, 2, 0, 1])
    assert.ok(Math.abs(Transform.get(g.body.entity).position.y) < 1e-6, 'on the ground (FLAT_GROUND)')
  } finally {
    squad.despawn()
  }
})

test('scenario: a target entering the view cone within range is chased and caught', async () => {
  setPlayer(v3(20, 0.2, 28))
  const { squad, events } = makeSquad()
  try {
    squad.spawn([{ id: 'g', route: [v3(20, 0, 20)], start: { position: v3(20, 0, 20), yaw: 0 }, body: createCapsuleBody }])
    const g = squad.guards[0]
    const t = await runUntil(8, () => events.some(e => e.type === 'catch'))
    assert.ok(events.some(e => e.type === 'catch' && e.target === 'player'), 'caught')
    assert.ok(t < 6, `caught after ${t.toFixed(1)} s`)
    assert.ok(events.some(e => e.type === 'replan' && e.plan[0] === '!chase player'))
    assert.ok(distanceXZ(g.agent.kinematic.position, v3(20, 0, 28)) <= g.agent.tuning.catchRadius + 0.05)
    assert.equal(g.agent.mode, 'chase')
  } finally {
    squad.despawn()
  }
})

test('scenario: a target behind an occluder is not detected', async () => {
  setPlayer(v3(20, 0.2, 28))
  const { squad, los, events } = makeSquad()
  los.occluders = [{ min: v3(15, 0, 23), max: v3(25, 4, 23.5) }]
  try {
    squad.spawn([{ id: 'g', route: [v3(20, 0, 20)], start: { position: v3(20, 0, 20), yaw: 0 }, body: createCapsuleBody }])
    const g = squad.guards[0]
    await runUntil(5, () => {
      assert.equal(g.agent.lastPerception.visible.length, 0)
      assert.equal(g.agent.mode, 'patrol')
      return false
    })
    assert.equal(g.agent.perception.suspicionOf('player'), 0)
    assert.ok(!events.some(e => e.type === 'catch'))
    assert.ok(distanceXZ(g.agent.kinematic.position, v3(20, 0, 20)) < 0.35, 'stayed on its post')
    // Control: without the wall the same setup detects the target.
    los.occluders = []
    await runUntil(3, () => g.agent.mode === 'chase')
    assert.equal(g.agent.mode, 'chase')
  } finally {
    squad.despawn()
  }
})

test('scenario: a lost target is investigated at its last seen spot, then the patrol resumes', async () => {
  const seenAt = v3(20, 0.2, 28)
  setPlayer(seenAt)
  const { squad, events } = makeSquad()
  try {
    squad.spawn([{ id: 'g', route: [v3(20, 0, 20)], start: { position: v3(20, 0, 20), yaw: 0 }, body: createCapsuleBody }])
    const g = squad.guards[0]
    await runUntil(3, () => g.agent.mode === 'chase')
    assert.equal(g.agent.mode, 'chase')
    setPlayer(v3(20, 0.2, 110)) // vanishes out of range
    events.length = 0
    let lookAroundFrom: Vec3 | null = null
    await runUntil(25, () => {
      const s = steps(events)
      const last = s[s.length - 1]
      if (last && last.name === '!look_around' && !lookAroundFrom) lookAroundFrom = { ...g.agent.kinematic.position }
      return s.some((e, i) => e.name === '!wait' && s.slice(0, i).some(p => p.name === '!forget'))
    })
    // Step names with their symbol arguments (gait, target), e.g. '!move_to hurry'.
    const names = steps(events).map(e => [e.name, ...e.args.map(atomName).filter(Boolean)].join(' '))
    const order = ['!move_to hurry', '!look_around', '!forget player', '!move_to walk', '!wait']
    let at = 0
    for (const n of names) if (at < order.length && n === order[at]) at++
    assert.equal(at, order.length, `steps: ${names.join(' | ')}`)
    const hurry = steps(events).find(e => e.name === '!move_to' && atomName(e.args[1]) === 'hurry')
    const target = hurry && atomVec3(hurry.args[0])
    assert.ok(target && distanceXZ(target, seenAt) < 0.01, 'investigates the last seen position')
    assert.ok(lookAroundFrom && distanceXZ(lookAroundFrom, seenAt) <= 0.35, 'looks around at the last seen spot')
    assert.equal(g.agent.mode, 'patrol')
    assert.equal(g.agent.blackboard.world.rows('last_seen', 3).length, 0)
    await runUntil(10)
    assert.ok(distanceXZ(g.agent.kinematic.position, v3(20, 0, 20)) <= 0.35, 'back on its post')
  } finally {
    squad.despawn()
  }
})

test('scenario: despawn removes capsules and systems, and restores a possessed figure', async () => {
  setPlayer(v3(64, 0.2, 5))
  const count = () => [...engine.getEntitiesWith(Transform)].length
  const figure = engine.addEntity()
  Transform.create(figure, { position: v3(64, 1, 12), scale: v3(0.8, 1.6, 0.7) })
  const original = JSON.parse(JSON.stringify(Transform.get(figure)))
  const before = count()
  const capsules = makeSquad()
  const possessed = makeSquad()
  capsules.squad.spawn([
    { id: 'a', route: [v3(55, 0, 20), v3(55, 0, 32)], body: createCapsuleBody },
    { id: 'b', route: [v3(73, 0, 20), v3(73, 0, 32)], body: createCapsuleBody }
  ])
  possessed.squad.spawn([
    { id: 'priest', route: [v3(60, 0, 11), v3(68, 0, 11)], body: () => possessEntityBody(figure, { groundY: 0.2, facingYaw: Math.PI }) }
  ])
  assert.equal(count(), before + 9)
  await runUntil(3)
  assert.notDeepEqual(JSON.parse(JSON.stringify(Transform.get(figure))), original, 'the figure moved')
  const agents = [...capsules.squad.guards, ...possessed.squad.guards].map(h => h.agent)
  capsules.squad.despawn()
  possessed.squad.despawn()
  assert.equal(count(), before)
  assert.deepEqual(JSON.parse(JSON.stringify(Transform.get(figure))), original)
  const times = agents.map(a => a.time)
  await runUntil(1)
  assert.deepEqual(agents.map(a => a.time), times, 'no guard system left running')
})

// ---- hearing scenarios ------------------------------------------------------------------------

const label = (e: Extract<GuardEvent, { type: 'step' }>) => [e.name, ...e.args.map(atomName).filter(Boolean)].join(' ')

function inOrder(names: string[], order: string[]): boolean {
  let at = 0
  for (const n of names) if (at < order.length && n === order[at]) at++
  return at === order.length
}

test('scenario: a player running behind a guard is heard; it turns, hurries there, searches and resumes patrol', async () => {
  const post = v3(20, 0, 20)
  let player = v3(14, 0.2, 16) // 4-6 m behind the guard, out of its view cone
  setPlayer(player)
  const { squad, events } = makeSquad()
  try {
    squad.spawn([{ id: 'g', route: [post], start: { position: post, yaw: 0 }, body: createCapsuleBody }])
    const g = squad.guards[0]
    await runUntil(0.5) // settle on the post
    events.length = 0
    // Run along +X at 10 m/s until the guard starts turning toward the noise, then hide (vanish far away).
    await runUntil(3, () => {
      if (steps(events).some(e => e.name === '!turn_to')) return true
      player = v3(player.x + 10 * DT, 0.2, player.z)
      setPlayer(player)
      return false
    })
    assert.ok(steps(events).some(e => e.name === '!turn_to'), 'heard and turned')
    const heardRun = events.find(e => e.type === 'heard')
    assert.ok(heardRun && heardRun.type === 'heard' && heardRun.kind === 'run' && heardRun.level === 'alarmed', JSON.stringify(heardRun))
    const noiseAt = g.agent.blackboard.heardNoise?.position
    assert.ok(noiseAt && distanceXZ(noiseAt, post) < 7)
    setPlayer(FAR)
    let yawWhileListening: number | null = null
    let sawAlert = false
    await runUntil(25, () => {
      const s = steps(events)
      if (yawWhileListening === null && s.length > 0 && s[s.length - 1].name === '!listen') yawWhileListening = g.agent.kinematic.yaw
      sawAlert = sawAlert || g.agent.mode === 'alert'
      assert.notEqual(g.agent.mode, 'chase')
      return s.some((e, i) => e.name === '!wait' && s.slice(0, i).some(p => p.name === '!forget_noise'))
    })
    const names = steps(events).map(label)
    assert.ok(inOrder(names, ['!turn_to', '!listen', '!move_to hurry', '!look_around', '!forget_noise', '!move_to walk', '!wait']), names.join(' | '))
    assert.ok(sawAlert, 'shown as alert')
    assert.ok(yawWhileListening !== null && Math.abs(angleDiff(yawWhileListening, yawTo(post, noiseAt!))) < 0.05, 'faces the noise before moving')
    const hurry = steps(events).find(e => e.name === '!move_to' && atomName(e.args[1]) === 'hurry')
    const target = hurry && atomVec3(hurry.args[0])
    assert.ok(target && distanceXZ(target, noiseAt!) < 0.01, 'goes to where it heard the noise')
    assert.equal(g.agent.blackboard.heardNoise, null)
    assert.equal(g.agent.mode, 'patrol')
    await runUntil(10)
    assert.ok(distanceXZ(g.agent.kinematic.position, post) <= 0.35, 'back on its post')
  } finally {
    squad.despawn()
  }
})

test('scenario: a player walking behind a guard is not heard', async () => {
  const post = v3(20, 0, 20)
  let player = v3(16, 0.2, 17)
  setPlayer(player)
  const { squad, events } = makeSquad()
  try {
    squad.spawn([{ id: 'g', route: [post], start: { position: post, yaw: 0 }, body: createCapsuleBody }])
    const g = squad.guards[0]
    await runUntil(0.5)
    await runUntil(5, () => {
      player = v3(player.x + 1.5 * DT, 0.2, player.z)
      setPlayer(player)
      assert.equal(g.agent.mode, 'patrol')
      return false
    })
    assert.ok(player.x > 23)
    assert.ok(!events.some(e => e.type === 'heard'), 'nothing heard')
    assert.ok(!steps(events).some(e => e.name === '!turn_to'))
    assert.ok(Math.abs(angleDiff(g.agent.kinematic.yaw, 0)) < 1e-6, 'never turned')
    assert.ok(distanceXZ(g.agent.kinematic.position, post) < 0.35)
  } finally {
    squad.despawn()
  }
})

test('scenario: emitNoise from a game system; a faint noise is listened to, a loud one checked', async () => {
  setPlayer(FAR)
  const noiseAt = v3(40, 0.2, 40)
  const farPost = v3(40, 0, 48) // 8 m away from the noise: faint
  const nearPost = v3(43, 0, 40) // 3 m away: loud
  const { squad, events } = makeSquad()
  let elapsed = 0
  let fired = false
  const bellSystem = (dt: number) => {
    // Stand-in for a game system (a bell, a dropped object) raising a noise.
    elapsed += dt
    if (!fired && elapsed >= 0.5) {
      fired = true
      emitNoise({ kind: 'impact', position: noiseAt, loudness: 10, source: 'test-system' })
    }
  }
  try {
    squad.spawn([
      { id: 'far', route: [farPost], start: { position: farPost, yaw: 0 }, body: createCapsuleBody },
      { id: 'near', route: [nearPost], start: { position: nearPost, yaw: Math.PI / 2 }, body: createCapsuleBody }
    ])
    engine.addSystem(bellSystem)
    const [far, near] = squad.guards
    await runUntil(15, () => fired && far.agent.mode === 'patrol' && near.agent.mode === 'patrol' && elapsed > 2)
    const of = (id: string) => steps(events).filter(e => e.guard === id).map(label)
    const heardBy = (id: string) => events.find(e => e.type === 'heard' && e.guard === id)
    assert.ok(heardBy('far') && heardBy('near'))
    // Faint: turn and listen in place, no move.
    assert.ok(inOrder(of('far'), ['!turn_to', '!listen', '!forget_noise']), of('far').join(' | '))
    assert.ok(!of('far').some(n => n === '!move_to hurry' || n === '!move_to run'))
    assert.ok(distanceXZ(far.agent.kinematic.position, farPost) < 0.35)
    // Loud: turn, flinch, go there, search.
    assert.ok(inOrder(of('near'), ['!turn_to', '!listen', '!move_to hurry', '!look_around', '!forget_noise']), of('near').join(' | '))
    assert.ok(near.agent.blackboard.heardNoise === null)
    assert.ok(far.agent.blackboard.heardNoise === null)
    // It went to the noise before patrolling back.
    const nearMoves = steps(events).filter(e => e.guard === 'near' && e.name === '!move_to' && atomName(e.args[1]) === 'hurry')
    const went = nearMoves.length > 0 ? atomVec3(nearMoves[0].args[0]) : undefined
    assert.ok(went && distanceXZ(went, noiseAt) < 0.01)
  } finally {
    engine.removeSystem(bellSystem)
    squad.despawn()
  }
})

test('scenario: noises while chasing do not break the chase', async () => {
  setPlayer(v3(20, 0.2, 28))
  const { squad, events } = makeSquad()
  let elapsed = 0
  const noisy = (dt: number) => {
    elapsed += dt
    if (Math.floor(elapsed / 0.2) !== Math.floor((elapsed - dt) / 0.2)) {
      emitNoise({ kind: 'impact', position: v3(20, 0.2, 15), loudness: 12, source: 'behind' })
    }
  }
  try {
    squad.spawn([{ id: 'g', route: [v3(20, 0, 20)], start: { position: v3(20, 0, 20), yaw: 0 }, body: createCapsuleBody }])
    const g = squad.guards[0]
    await runUntil(3, () => g.agent.mode === 'chase')
    assert.equal(g.agent.mode, 'chase')
    engine.addSystem(noisy)
    const t = await runUntil(8, () => events.some(e => e.type === 'catch'))
    assert.ok(events.some(e => e.type === 'catch'), 'caught')
    assert.ok(t < 6, `caught after ${t.toFixed(1)} s`)
    assert.ok(events.some(e => e.type === 'heard'), 'the noises were heard')
    assert.ok(!events.some(e => e.type === 'replan' && e.reason.startsWith('noise')), 'no noise replan during the chase')
    assert.ok(!steps(events).some(e => e.name === '!turn_to'))
  } finally {
    engine.removeSystem(noisy)
    squad.despawn()
  }
})
