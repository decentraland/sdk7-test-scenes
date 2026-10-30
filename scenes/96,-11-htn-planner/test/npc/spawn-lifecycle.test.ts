import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Transform } from '@dcl/sdk/ecs'
import { float } from '../../src/htn-planner/htn/atom'
import { createCapsuleBody, GuardSquad, type GuardBody, type GuardSpec } from '../../src/htn-planner/npc/guard-scene'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { agentHistory } from '../../src/htn-planner/npc/history'
import { v3 } from '../../src/htn-planner/npc/vec'
import { prim, scripted } from './fake-planner'

const entities = () => [...engine.getEntitiesWith(Transform)].length
const wait = () => scripted(() => [prim('!wait', float(100))]).factory
function fixture() {
  const bodies: GuardBody[] = [], disposed: number[] = []
  function spec(id: string, routeStart = 0, explicitStart = false): GuardSpec {
    return {
      id, route: [v3(1, 0, 1), v3(2, 0, 2)], routeStart,
      ...(explicitStart ? { start: { position: v3(1, 0, 1), yaw: 0 } } : {}),
      body() {
        const body = createCapsuleBody(), index = bodies.length
        bodies.push(body)
        disposed.push(0)
        return { ...body, dispose() { disposed[index]++; body.dispose() } }
      }
    }
  }
  return { bodies, disposed, spec }
}
const options = () => ({ planner: wait(), lineOfSight: CLEAR_LINE_OF_SIGHT, targets: () => [], noise: null })

for (const running of [false, true]) for (const explicitStart of [false, true]) {
  test('spawn validates the whole batch before acquiring bodies: ' + JSON.stringify({ running, explicitStart }), async () => {
    const before = entities(), f = fixture(), squad = new GuardSquad(options())
    try {
      if (running) squad.spawn([f.spec('existing')])
      const previous = [...squad.guards], acquired = f.bodies.length
      for (const index of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => squad.spawn([f.spec('a'), f.spec('bad', index, explicitStart)]), RangeError)
        assert.equal(f.bodies.length, acquired)
        assert.deepEqual(squad.guards.map(h => h.spec.id), previous.map(h => h.spec.id))
      }
      squad.spawn([f.spec('valid', 5)])
      await engine.update(.1)
      assert.ok(squad.guards.every(h => h.agent.time > 0))
      assert.equal(squad.guards[squad.guards.length - 1].agent.blackboard.currentWaypoint, 1)
    } finally { squad.despawn() }
    assert.ok(f.disposed.every(n => n === 1))
    assert.equal(entities(), before)
  })
}

for (const running of [false, true]) for (const failure of ['planner', 'history', 'write', 'mode', 'factory'] as const) {
  test('spawn rolls back a failed staged batch: ' + JSON.stringify({ running, failure }), async () => {
    const before = entities(), f = fixture(), original = new Error('original ' + failure)
    const squad = new GuardSquad({
      ...options(),
      planner: (world, spec) => {
        if (failure === 'planner' && spec.id === 'bad') throw original
        return wait()(world)
      },
      history: spec => {
        if (failure === 'history' && spec.id === 'bad') throw original
        return agentHistory()
      }
    })
    try {
      if (running) { squad.spawn([f.spec('existing')]); await engine.update(.1) }
      const previous = [...squad.guards], priorEntities = entities(), priorBodies = f.bodies.length
      const bad = f.spec('bad'), factory = bad.body
      bad.body = () => {
        if (failure === 'factory') throw original
        const body = factory()
        return {
          ...body,
          write(k) { if (failure === 'write') throw original; body.write(k) },
          setMode(mode) { if (failure === 'mode') throw original; body.setMode(mode) }
        }
      }
      assert.throws(() => squad.spawn([f.spec('a'), bad]), error => error === original)
      assert.deepEqual(squad.guards.map(h => h.spec.id), previous.map(h => h.spec.id))
      assert.equal(entities(), priorEntities)
      assert.ok(f.disposed.slice(priorBodies).every(n => n === 1))
      const oldTime = previous[0]?.agent.time
      squad.spawn([f.spec('retry')])
      await engine.update(.1)
      assert.ok(squad.guards.every(h => h.agent.time > 0))
      if (oldTime !== undefined) assert.ok(previous[0].agent.time > oldTime)
    } finally { squad.despawn() }
    assert.ok(f.disposed.every(n => n === 1))
    assert.equal(entities(), before)
  })
}

test('rollback continues after cleanup throws and keeps the initiating exception', () => {
  const before = entities(), f = fixture(), squad = new GuardSquad(options())
  const original = new Error('write failed'), cleanup = new Error('cleanup failed')
  const a = f.spec('a'), firstFactory = a.body
  a.body = () => {
    const body = firstFactory()
    return { ...body, dispose() { body.dispose(); throw cleanup } }
  }
  const bad = f.spec('bad'), badFactory = bad.body
  bad.body = () => {
    const body = badFactory()
    return { ...body, write() { throw original }, dispose() { body.dispose(); throw cleanup } }
  }
  assert.throws(() => squad.spawn([a, bad]), error => error === original)
  assert.equal(squad.guards.length, 0)
  assert.deepEqual(f.disposed, [1, 1])
  squad.despawn()
  assert.equal(entities(), before)
})

test('despawn inside a body hook cancels pending publication without disposing it twice', () => {
  const before = entities(), f = fixture(), squad = new GuardSquad(options())
  const a = f.spec('a'), factory = a.body
  a.body = () => {
    const body = factory()
    return { ...body, write(k) { body.write(k); squad.despawn() } }
  }
  assert.throws(() => squad.spawn([a, f.spec('b')]), /cancelled/)
  assert.equal(squad.active, false)
  assert.deepEqual(f.disposed, [1])
  squad.spawn([f.spec('retry')])
  squad.despawn()
  assert.ok(f.disposed.every(n => n === 1))
  assert.equal(entities(), before)
})

test('duplicate ids and malformed static poses fail before any body factory', () => {
  const before = entities(), f = fixture(), squad = new GuardSquad(options())
  squad.spawn([f.spec('existing')])
  try {
    const acquired = f.bodies.length
    assert.throws(() => squad.spawn([f.spec('a'), f.spec('a')]), /unique/)
    assert.throws(() => squad.spawn([f.spec('existing')]), /unique/)
    assert.throws(() => squad.spawn([f.spec('')]), /unique/)
    assert.throws(() => squad.spawn([{ ...f.spec('bad'), route: [v3(NaN, 0, 0)] }]), /finite route/)
    assert.throws(() => squad.spawn([{ ...f.spec('bad'), start: { position: v3(0, 0, 0), yaw: Infinity } }]), /finite start/)
    assert.equal(f.bodies.length, acquired)
    assert.deepEqual(squad.guards.map(h => h.spec.id), ['existing'])
  } finally { squad.despawn() }
  assert.equal(entities(), before)
})

test('nested spawn is rejected and rollback releases its outer returned body once', () => {
  const before = entities(), f = fixture(), squad = new GuardSquad(options())
  const a = f.spec('a'), factory = a.body
  a.body = () => {
    const body = factory()
    return { ...body, write() { squad.spawn([f.spec('nested')]) } }
  }
  assert.throws(() => squad.spawn([a]), /recursively/)
  assert.deepEqual(f.disposed, [1])
  assert.equal(squad.active, false)
  squad.despawn()
  assert.equal(entities(), before)
})
