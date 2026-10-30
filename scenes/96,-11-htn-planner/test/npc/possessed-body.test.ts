import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { GuardSquad, possessEntityBody, plannerFor } from '../../src/htn-planner/npc/guard-scene'
import { compileDomainSource } from '../../tools/htn/compiler'

const compiled = compileDomainSource('Body.domain', `(:domain Body top_level_domain
 (:method (behave) top_level_method
  (seen (and (target_visible ?id ?position)) ((!wait 100)))
  (idle () ((!wait 100)))))`)
assert.ok(compiled.ok)
const domain = compiled.ir
const point = (x: number, y: number, z: number) => ({ x, y, z })
function near(actual: { x: number; y: number; z: number }, expected: { x: number; y: number; z: number }) {
  assert.ok(Vector3.distance(actual, expected) < 1e-5, `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)
}
// Independent SDK vector/quaternion composition of the known single parent in these fixtures.
function scenePosition(entity: ReturnType<typeof engine.addEntity>) {
  const t = Transform.get(entity)
  if (!t.parent) return t.position
  const p = Transform.get(t.parent)
  return Vector3.add(p.position, Vector3.rotate(Vector3.multiply(t.position, p.scale), p.rotation))
}
function sceneForward(entity: ReturnType<typeof engine.addEntity>) {
  const t = Transform.get(entity)
  const q = t.parent ? Quaternion.multiply(Transform.get(t.parent).rotation, t.rotation) : t.rotation
  return Vector3.rotate(point(0, 0, 1), q)
}
for (const yaw of [0, 90]) test(`possessed parent yaw ${yaw}: scene pose, sensing, movement and restore`, () => {
  const parent = engine.addEntity(), entity = engine.addEntity()
  Transform.create(parent, { position: point(100, 0, 50), rotation: Quaternion.fromEulerDegrees(0, yaw, 0), scale: point(2, 2, 2) })
  Transform.create(entity, { parent, position: point(2, 1, 3), scale: point(.5, 1, .25) })
  const original = JSON.parse(JSON.stringify(Transform.get(entity)))
  const expected = yaw === 0 ? point(104, 0, 56) : point(106, 0, 46)
  const rays: { x: number; y: number; z: number }[] = []
  const squad = new GuardSquad({
    planner: plannerFor(domain), system: false, noise: null,
    targets: () => [{ id: 'player', position: Vector3.add(expected, point(1, 0, 1)) }],
    perception: { range: 10, fovDeg: 360, detectTime: 0, nearDetectTime: 0 },
    lineOfSight: {
      check(_id, eye) {
        rays.push({ ...eye })
        return true
      }
    }
  })
  squad.spawn([{ id: 'g', route: [], body: () => possessEntityBody(entity, { groundY: 0 }) }])
  try {
    const h = squad.guards[0]
    near(h.agent.kinematic.position, expected)
    assert.ok(Math.abs(h.agent.kinematic.yaw - yaw * Math.PI / 180) < 1e-5)
    squad.update(.1)
    near(rays[0], Vector3.add(expected, point(0, 1.6, 0)))
    h.agent.kinematic.position = point(110, 0, 60)
    h.agent.kinematic.yaw = Math.PI / 2
    h.body.write(h.agent.kinematic)
    near(scenePosition(entity), point(110, 2, 60))
    near(sceneForward(entity), point(1, 0, 0))
    // Moving/rotating/scaling the parent does not change the agent's scene-space pose or visible size.
    Transform.getMutable(parent).position = point(200, 0, 10)
    Transform.getMutable(parent).rotation = Quaternion.fromEulerDegrees(0, -90, 0)
    Transform.getMutable(parent).scale = point(4, 4, 4)
    h.body.write(h.agent.kinematic)
    near(scenePosition(entity), point(110, 2, 60))
    near(sceneForward(entity), point(1, 0, 0))
    near(Vector3.scale(Transform.get(entity).scale, 4), point(1, 2, .5))
  } finally {
    squad.despawn()
    assert.deepEqual(Transform.get(entity), original)
    engine.removeEntity(entity)
    engine.removeEntity(parent)
  }
})
test('attachments under different parents follow the figure rigidly and restore local transforms', () => {
  const p1 = engine.addEntity(), p2 = engine.addEntity(), entity = engine.addEntity(), attachment = engine.addEntity()
  Transform.create(p1, { position: point(10, 0, 0), rotation: Quaternion.fromEulerDegrees(0, 90, 0) })
  Transform.create(p2, { position: point(0, 0, 10), rotation: Quaternion.fromEulerDegrees(0, -90, 0), scale: point(2, 2, 2) })
  Transform.create(entity, { parent: p1, position: point(0, 1, 0) }) // world(10,1,0), facing+X
  Transform.create(attachment, { parent: p2, position: point(-5, 1, -5.5) }) // world(11,2,0), in front of body
  const original = [entity, attachment].map(e => JSON.parse(JSON.stringify(Transform.get(e))))
  const body = possessEntityBody(entity, { groundY: 0, attachments: [attachment] })
  try {
    body.write({ position: point(20, 0, 30), yaw: Math.PI })
    near(scenePosition(entity), point(20, 1, 30))
    near(scenePosition(attachment), point(20, 2, 29))
  } finally {
    body.dispose()
    assert.deepEqual([entity, attachment].map(e => Transform.get(e)), original)
    for (const e of [entity, attachment, p1, p2]) engine.removeEntity(e)
  }
})
test('unsupported parent scale and overlapping attachments reject before changing the scene', () => {
  const parent = engine.addEntity(), entity = engine.addEntity(), child = engine.addEntity()
  Transform.create(parent, { scale: point(2, 1, 1) })
  Transform.create(entity, { parent, position: point(1, 0, 0) })
  Transform.create(child, { parent: entity })
  const before = [...engine.getEntitiesWith(Transform)].length
  for (const scale of [point(2, 1, 1), point(0, 0, 0), point(-1, -1, -1)]) {
    Transform.getMutable(parent).scale = scale
    assert.throws(() => possessEntityBody(entity, { groundY: 0 }), /uniform positive scale/)
  }
  Transform.getMutable(parent).scale = point(1, 1, 1)
  assert.throws(() => possessEntityBody(entity, { groundY: 0, attachments: [child] }), /descendant/)
  Transform.getMutable(parent).parent = entity
  assert.throws(() => possessEntityBody(entity, { groundY: 0 }), /cyclic/)
  Transform.getMutable(parent).parent = engine.RootEntity
  assert.equal([...engine.getEntitiesWith(Transform)].length, before)
  for (const e of [child, entity, parent]) engine.removeEntity(e)
})

test('nested parents compose translation, rotation and uniform scale for reads and inverse writes', () => {
  const outer = engine.addEntity(), inner = engine.addEntity(), entity = engine.addEntity()
  Transform.create(outer, {
    position: point(10, 0, 20), rotation: Quaternion.fromEulerDegrees(0, 90, 0), scale: point(2, 2, 2)
  })
  Transform.create(inner, {
    parent: outer, position: point(3, 0, 1), rotation: Quaternion.fromEulerDegrees(0, -90, 0), scale: point(3, 3, 3)
  })
  Transform.create(entity, { parent: inner, position: point(1, 1, 2) })
  const original = JSON.parse(JSON.stringify(Transform.get(entity)))
  // The two rotations cancel: inner scene origin=(12,0,14), total scale=6.
  const body = possessEntityBody(entity, { groundY: 0 })
  try {
    near(body.initialPose!.position, point(18, 0, 26))
    assert.ok(Math.abs(body.initialPose!.yaw) < 1e-5)
    body.write({ position: point(30, 0, 40), yaw: Math.PI / 2 })
    near(Transform.get(entity).position, point(3, 1, 13 / 3))
    near(Vector3.rotate(point(0, 0, 1), Transform.get(entity).rotation), point(1, 0, 0))
    near(Transform.get(entity).scale, point(1, 1, 1))
  } finally {
    body.dispose()
    assert.deepEqual(Transform.get(entity), original)
    for (const e of [entity, inner, outer]) engine.removeEntity(e)
  }
})

test('noncommuting X/Y parents and Z visual rotation preserve scene pose and inverse writes', () => {
  const outer = engine.addEntity(), inner = engine.addEntity(), entity = engine.addEntity()
  Transform.create(outer, {
    position: point(10, 20, 30), rotation: Quaternion.fromEulerDegrees(90, 0, 0), scale: point(2, 2, 2)
  })
  Transform.create(inner, {
    parent: outer, position: point(1, 2, 3), rotation: Quaternion.fromEulerDegrees(0, 90, 0), scale: point(3, 3, 3)
  })
  Transform.create(entity, {
    parent: inner, position: point(1, 2, 3), rotation: Quaternion.fromEulerDegrees(0, 0, 90)
  })
  const original = JSON.parse(JSON.stringify(Transform.get(entity)))
  // Independent quarter-turn arithmetic: Ry maps (x,y,z) -> (z,y,-x), then Rx -> (z,x,y).
  // The parent origin is (12,14,34), scale=6; the visual's scene origin is (30,20,46).
  const body = possessEntityBody(entity, { groundY: 0 })
  try {
    near(body.initialPose!.position, point(30, 0, 46))
    assert.ok(Math.abs(body.initialPose!.yaw - Math.PI / 2) < 1e-5)
    body.write({ position: point(42, 0, 58), yaw: Math.PI })
    const local = Transform.get(entity)
    // Inverse parent permutation (x,y,z) -> (y,z,x) applied to (scene-origin)/6.
    near(local.position, point(1, 4, 5))
    // A scene Y quarter-turn changes the saved visual basis before inverse-parent conversion.
    // Check all axes against explicit values, without composing quaternions in the oracle.
    near(Vector3.rotate(point(1, 0, 0), local.rotation), point(0, 0, 1))
    near(Vector3.rotate(point(0, 1, 0), local.rotation), point(-1, 0, 0))
    near(Vector3.rotate(point(0, 0, 1), local.rotation), point(0, -1, 0))
    near(local.scale, point(1, 1, 1))
  } finally {
    body.dispose()
    assert.deepEqual(Transform.get(entity), original)
    for (const e of [entity, inner, outer]) engine.removeEntity(e)
  }
})
