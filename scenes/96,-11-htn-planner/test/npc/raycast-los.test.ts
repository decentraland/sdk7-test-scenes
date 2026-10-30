import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Raycast, RaycastResult, Transform } from '@dcl/sdk/ecs'
import { DEFAULT_PERCEPTION, Perception } from '../../src/htn-planner/npc/perception'
import { RaycastLineOfSight } from '../../src/htn-planner/npc/raycast-los'
import { v3 } from '../../src/htn-planner/npc/vec'

const self = { position: v3(0, 0, 0), yaw: 0 }
const targets = [
  { id: 'clear', position: v3(-2, 0, 8) },
  { id: 'blocked', position: v3(2, 0, 8) }
]
const perception = () => new Perception({ ...DEFAULT_PERCEPTION, detectTime: 0, nearDetectTime: 0, loseGrace: 0 })
const entities = () => [...engine.getEntitiesWith(Transform)].length
const rays = () => [...engine.getEntitiesWith(Raycast)]
const targetX = (ray: ReturnType<typeof Raycast.get>) => ray.direction?.$case === 'globalTarget' ? ray.direction.globalTarget.x : NaN

// Deliver renderer answers through the real SDK result component and callback system.
function answer(entity: Parameters<typeof RaycastResult.createOrReplace>[0], blocked: boolean) {
  RaycastResult.createOrReplace(entity, {
    globalOrigin: v3(0, 1, 0), direction: v3(0, 0, 1), tickNumber: 0,
    hits: blocked ? [{ length: 1, globalOrigin: v3(0, 1, 0), direction: v3(0, 0, 1), position: v3(0, 1, 1), normalHit: v3(0, 0, -1) }] : []
  })
}

test('perception casts and consumes independent asynchronous LOS answers for two targets', async () => {
  const los = new RaycastLineOfSight()
  const p = perception()
  const before = entities()
  try {
    assert.deepEqual(p.update(0.1, 0, 'guard', self, targets, los).visible, [])
    await engine.update(1 / 30)
    const initial = rays()
    assert.equal(initial.length, 2, 'each observer-target pair needs a ray, not only the first target')
    for (const [entity, ray] of initial) answer(entity, targetX(ray) > 0)
    await engine.update(1 / 30)
    assert.deepEqual(p.update(0.1, 0.1, 'guard', self, targets, los).visible.map(t => t.id), ['clear'])

    // Reverse the answers on the next round: neither order nor cached visibility leaks across targets.
    await engine.update(1 / 30)
    for (const [entity, ray] of rays()) answer(entity, targetX(ray) < 0)
    await engine.update(1 / 30)
    assert.deepEqual(p.update(0.1, 0.2, 'guard', self, [...targets].reverse(), los).visible.map(t => t.id), ['blocked'])
  } finally {
    los.release('guard')
    await engine.update(1 / 30)
  }
  assert.equal(entities(), before, 'observer release owns every target ray')
  assert.equal(rays().length, 0, 'queued SDK registrations cannot resurrect released rays')
})

test('a vanished target releases its ray while the other target keeps its pending request', async () => {
  const los = new RaycastLineOfSight()
  const p = perception()
  const before = entities()
  try {
    p.update(0.1, 0, 'guard', self, targets, los)
    await engine.update(1 / 30)
    const pending = rays()
    assert.equal(pending.length, 2)
    const survivor = pending.find(([, ray]) => targetX(ray) < 0)![0]
    p.update(0.1, 0.1, 'guard', self, targets.slice(0, 1), los)
    assert.equal(entities(), before + 1)
    assert.equal(Raycast.has(survivor), true, 'dropping another target does not cancel this ray')
    answer(survivor, false)
    await engine.update(1 / 30)
    assert.deepEqual(p.update(0.1, 0.2, 'guard', self, targets.slice(0, 1), los).visible.map(t => t.id), ['clear'])
  } finally {
    los.releaseAll()
    await engine.update(1 / 30)
  }
  assert.equal(entities(), before)
})
test('timeout uses a fresh entity and a late answer cannot satisfy its replacement', async () => {
  const los = new RaycastLineOfSight({ timeout: 0.1 })
  const p = perception()
  const before = entities()
  let expired: Parameters<typeof RaycastResult.deleteFrom>[0] | undefined
  try {
    p.update(0.01, 0, 'guard', self, targets.slice(0, 1), los)
    await engine.update(1 / 30)
    expired = rays()[0][0]
    assert.deepEqual(p.update(0.01, 0.2, 'guard', self, targets.slice(0, 1), los).visible, [])
    await engine.update(1 / 30)
    const replacement = rays()[0][0]
    assert.notEqual(replacement, expired, 'a late renderer response must address a different entity')
    assert.equal(rays().length, 1)
    answer(expired, false) // A delayed clear result from the timed-out request.
    await engine.update(1 / 30)
    assert.deepEqual(p.update(0.01, 0.21, 'guard', self, targets.slice(0, 1), los).visible, [])
    answer(replacement, true)
    await engine.update(1 / 30)
    assert.deepEqual(p.update(0.01, 0.22, 'guard', self, targets.slice(0, 1), los).visible, [])
  } finally {
    if (expired !== undefined) RaycastResult.deleteFrom(expired)
    los.releaseAll()
    await engine.update(1 / 30)
  }
  assert.equal(entities(), before)
  assert.equal(rays().length, 0)
})

test('pair identity does not collide on string separators and observer release stays scoped', async () => {
  const los = new RaycastLineOfSight()
  const before = entities()
  try {
    los.check('guard::a', v3(0, 1, 0), v3(-2, 1, 8), 0, 'b')
    los.check('guard', v3(0, 1, 0), v3(2, 1, 8), 0, 'a::b')
    await engine.update(1 / 30)
    assert.equal(rays().length, 2)
    los.release('guard::a')
    const remaining = rays()
    assert.equal(remaining.length, 1)
    answer(remaining[0][0], false)
    await engine.update(1 / 30)
    assert.equal(los.check('guard', v3(0, 1, 0), v3(2, 1, 8), 0.1, 'a::b'), true)
  } finally {
    los.releaseAll()
    await engine.update(1 / 30)
  }
  assert.equal(entities(), before)
})

test('legacy four-argument callers and custom LOS implementations remain usable', async () => {
  const los = new RaycastLineOfSight()
  const before = entities()
  try {
    assert.equal(los.check('legacy', v3(0, 1, 0), v3(0, 1, 8), 0), false)
    await engine.update(1 / 30)
    assert.equal(rays().length, 1)
    answer(rays()[0][0], false)
    await engine.update(1 / 30)
    assert.equal(los.check('legacy', v3(0, 1, 0), v3(0, 1, 8), 0.1), true)
    const custom = { check: (_observer: string, _eye: ReturnType<typeof v3>, _target: ReturnType<typeof v3>, _now: number) => true }
    assert.deepEqual(perception().update(0.1, 0, 'g', self, targets, custom).visible.map(t => t.id), ['clear', 'blocked'])
  } finally {
    los.releaseAll()
    await engine.update(1 / 30)
  }
  assert.equal(entities(), before)
})

test('release and releaseAll cancel queued SDK registrations and remove their one-shot cleanup system', async () => {
  const before = entities()
  const added = new Set<Parameters<typeof engine.addSystem>[0]>()
  const addSystem = engine.addSystem
  const removeSystem = engine.removeSystem
  engine.addSystem = (system, priority, name) => {
    added.add(system)
    addSystem(system, priority, name)
  }
  engine.removeSystem = selector => {
    const removed = removeSystem(selector)
    if (removed && typeof selector === 'function') added.delete(selector)
    return removed
  }
  try {
    for (const all of [false, true]) {
      const los = new RaycastLineOfSight()
      los.check('guard', v3(0, 1, 0), targets[0].position, 0, targets[0].id)
      los.check('guard', v3(0, 1, 0), targets[1].position, 0, targets[1].id)
      if (all) los.releaseAll()
      else los.release('guard')
      await engine.update(1 / 30)
      assert.equal(rays().length, 0, 'cleanup runs after the SDK queued-registration system')
      assert.equal(entities(), before)
      assert.equal(added.size, 0, 'no cleanup system keeps running after resources have been released')
    }
  } finally {
    engine.addSystem = addSystem
    engine.removeSystem = removeSystem
    for (const system of added) removeSystem(system)
  }
})
