import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Transform, type Entity } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { createCapsuleBody, possessEntityBody } from '../../src/htn-planner/npc/guard-scene'

const point = (x = 0, y = 0, z = 0) => ({ x, y, z })
const pose = { position: point(3, 0, 5), yaw: 0 }
function fields(entity: Entity) {
  const t = Transform.get(entity)
  return [t.position, t.rotation, t.scale]
}
function sameFields(entity: Entity, before: ReturnType<typeof fields>) {
  const after = fields(entity)
  for (let i = 0; i < before.length; i++) assert.equal(after[i], before[i], 'body writes reuse mutable SDK pose storage')
}

test('capsule movement reuses its SDK position and rotation storage after creation', () => {
  const body = createCapsuleBody(), before = fields(body.entity)
  try {
    for (let i = 0; i < 100; i++) { pose.position.x = i; pose.yaw = i / 100; body.write(pose) }
    sameFields(body.entity, before)
  } finally { body.dispose() }
})

test('possessed movement reuses pose storage for figure, attachment and indicator', () => {
  const parent = engine.addEntity(), entity = engine.addEntity(), attachment = engine.addEntity()
  Transform.create(parent, { rotation: Quaternion.fromEulerDegrees(0, 90, 0), scale: point(2, 2, 2) })
  Transform.create(entity, { parent, position: point(1, 1, 2) })
  Transform.create(attachment, { position: point(4, 2, 6) })
  const body = possessEntityBody(entity, { groundY: 0, attachments: [attachment] })
  const records = body.ownEntities.map(e => ({ entity: e, fields: fields(e) }))
  const initialPose = structuredClone(body.initialPose)
  try {
    for (let i = 0; i < 100; i++) { pose.position.x = i; pose.yaw = i / 100; body.write(pose) }
    for (const record of records) sameFields(record.entity, record.fields)
    assert.deepEqual(body.initialPose, initialPose, 'initial pose is an independent saved value')
  } finally {
    body.dispose()
    for (const e of [attachment, entity, parent]) engine.removeEntity(e)
  }
})

test('body writes publish changed position and rotation through real SDK CRDT serialization', () => {
  const body = createCapsuleBody(), mirror = engine.addEntity()
  try {
    // Flush creation, then demand a real post-creation dirty update.
    Array.from(Transform.getCrdtUpdates())
    body.write({ position: point(12, 3, 7), yaw: Math.PI / 2 })
    const update = Array.from(Transform.getCrdtUpdates()).find(u => u.entityId === body.entity && 'data' in u)
    assert.ok(update && 'data' in update)
    Transform.updateFromCrdt({ ...update, entityId: mirror })
    const t = Transform.get(mirror)
    assert.deepEqual(t.position, point(12, 3, 7))
    assert.ok(Math.abs(t.rotation.y - Math.SQRT1_2) < 1e-6)
    assert.ok(Math.abs(t.rotation.w - Math.SQRT1_2) < 1e-6)
    assert.equal(Array.from(Transform.getCrdtUpdates()).filter(u => u.entityId === body.entity).length, 0)
  } finally { body.dispose(); engine.removeEntity(mirror) }
})

test('reused parent scratch follows reparenting and validates every attachment before writes', () => {
  const p1 = engine.addEntity(), p2 = engine.addEntity(), entity = engine.addEntity(), attachment = engine.addEntity()
  Transform.create(p1, { position: point(10, 0, 0), scale: point(2, 2, 2) })
  Transform.create(p2, { position: point(100, 0, 100), rotation: Quaternion.fromEulerDegrees(0, 90, 0), scale: point(4, 4, 4) })
  Transform.create(entity, { parent: p1, position: point(1, 1, 2) })
  Transform.create(attachment, { parent: p1, position: point(2, 1, 2) })
  const original = [entity, attachment].map(e => structuredClone(Transform.get(e)))
  const body = possessEntityBody(entity, { groundY: 0, attachments: [attachment] })
  try {
    body.write({ position: point(20, 0, 30), yaw: 0 })
    Transform.getMutable(entity).parent = p2
    body.write({ position: point(40, 0, 50), yaw: 0 })
    const local = Transform.get(entity).position
    assert.ok(Math.abs(local.x - 12.5) < 1e-6)
    assert.ok(Math.abs(local.y - 0.5) < 1e-6)
    assert.ok(Math.abs(local.z + 15) < 1e-6)
    Transform.getMutable(p2).position.x++
    body.write({ position: point(40, 0, 50), yaw: 0 })
    assert.ok(Math.abs(Transform.get(entity).position.z + 15.25) < 1e-6)
    const prior = structuredClone(Transform.get(entity))
    Transform.getMutable(p1).scale = point(2, 1, 1)
    assert.throws(() => body.write({ position: point(60, 0, 50), yaw: 0 }), /uniform positive scale/)
    assert.deepEqual(Transform.get(entity), prior, 'invalid later attachment prevents any partial figure write')
    Transform.getMutable(p1).scale = point(2, 2, 2)
    Transform.getMutable(p1).parent = p2
    Transform.getMutable(p2).parent = p1
    assert.throws(() => body.write({ position: point(60, 0, 50), yaw: 0 }), /cyclic/)
  } finally {
    body.dispose()
    assert.deepEqual([entity, attachment].map(e => Transform.get(e)), original)
    for (const e of [attachment, entity, p2, p1]) engine.removeEntity(e)
  }
})

test('possessed in-place writes publish independent SDK data and keep saved restore values', () => {
  const entity = engine.addEntity(), mirror = engine.addEntity()
  Transform.create(entity, { position: point(1, 2, 3), scale: point(2, 3, 4) })
  const original = structuredClone(Transform.get(entity)), body = possessEntityBody(entity, { groundY: 0 })
  try {
    Array.from(Transform.getCrdtUpdates())
    body.write({ position: point(14, 0, 9), yaw: Math.PI })
    const update = Array.from(Transform.getCrdtUpdates()).find(u => u.entityId === entity && 'data' in u)
    assert.ok(update && 'data' in update)
    Transform.updateFromCrdt({ ...update, entityId: mirror })
    const snapshot = structuredClone(Transform.get(mirror))
    assert.deepEqual(snapshot.position, point(14, 2, 9))
    assert.ok(Math.abs(snapshot.rotation.y - 1) < 1e-6)
    body.write({ position: point(24, 0, 19), yaw: 0 })
    assert.deepEqual(Transform.get(mirror), snapshot, 'later borrowed scratch must not change already serialized data')
  } finally {
    body.dispose()
    assert.deepEqual(Transform.get(entity), original)
    engine.removeEntity(entity); engine.removeEntity(mirror)
  }
})

// The exported snapshot helper must not expose a body writer's borrowed scratch.
test('parentFrame snapshots stay independent across subsequent hierarchy reads', async () => {
  const { parentFrame } = await import('../../src/htn-planner/npc/body-frame')
  const parent = engine.addEntity(), entity = engine.addEntity()
  Transform.create(parent, { position: point(10, 0, 20) })
  Transform.create(entity, { parent })
  try {
    const first = parentFrame(entity, new Set([entity])), saved = structuredClone(first)
    Transform.getMutable(parent).position.x = 30
    const second = parentFrame(entity, new Set([entity]))
    assert.deepEqual(first, saved)
    assert.notEqual(first.position, second.position)
    assert.equal(second.position.x, 30)
  } finally { engine.removeEntity(entity); engine.removeEntity(parent) }
})

// Future SDK implementations need not support output aliasing an input vector.
test('body writes use distinct SDK vector inputs and outputs', () => {
  const parent = engine.addEntity(), entity = engine.addEntity(), attachment = engine.addEntity()
  Transform.create(parent, { rotation: Quaternion.fromEulerDegrees(13, 31, 19), scale: point(2, 2, 2) })
  Transform.create(entity, { parent, position: point(1, 1, 2) })
  Transform.create(attachment, { parent, position: point(2, 3, 4) })
  const body = possessEntityBody(entity, { groundY: 0, attachments: [attachment] })
  const rotate = Vector3.rotateToRef, scale = Vector3.scaleToRef
  let calls = 0
  Vector3.rotateToRef = (input, rotation, output) => {
    assert.notEqual(input, output, 'rotateToRef does not require alias-safe SDK behavior')
    calls++
    return rotate(input, rotation, output)
  }
  Vector3.scaleToRef = (input, factor, output) => {
    assert.notEqual(input, output, 'scaleToRef does not require alias-safe SDK behavior')
    calls++
    return scale(input, factor, output)
  }
  try {
    for (let i = 0; i < 3; i++) body.write({ position: point(i, 0, 5), yaw: i / 10 })
    assert.ok(calls > 0)
  } finally {
    Vector3.rotateToRef = rotate
    Vector3.scaleToRef = scale
    body.dispose()
    for (const e of [attachment, entity, parent]) engine.removeEntity(e)
  }
})
