// The adapter changes actual primitive poses; rig logic stays independent of the renderer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AudioSource, engine, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { StalkerModel } from '../../src/examples/stalker/stalker-model'
import { StalkerRig } from '../../src/examples/stalker/stalker-rig'
import { v3 } from '../../src/htn-planner'

const freshRig = () => new StalkerRig({ gaitClips: { walk: { clip: 'PatrolWalk', speed: 1 }, hurry: { clip: 'AggroRun', speed: 0.7 }, run: { clip: 'AggroRun', speed: 2.5 } }, patrol: true, target: () => undefined })
const pose = { position: v3(3, 0, 4), yaw: 0.5 }
const entities = () => [...engine.getEntitiesWith(Transform)].length

test('primitive adapter shows distinct idle, walk and run poses without resetting loop phase', () => {
  const before = entities()
  const model = new StalkerModel({ scale: 0.8, sound: false })
  const rig = freshRig()
  try {
    model.update(0.1, rig, pose, true)
    assert.equal(model.animation, 'idle')
    const idleY = Transform.get(model.model).position.y
    model.update(0.1, rig, pose, true)
    assert.notEqual(Transform.get(model.model).position.y, idleY, 'idle breathing is animated')
    rig.play('PatrolWalk')
    model.update(0.25, rig, pose, true)
    assert.equal(model.animation, 'walk')
    const walk = { ...Transform.get(model.legs[0]).rotation }
    assert.ok(Math.abs(walk.x) > 0.05, 'walk swings the hip pivot')
    rig.play('PatrolWalk')
    model.update(0.25, rig, pose, true)
    assert.notDeepEqual(Transform.get(model.legs[0]).rotation, walk, 'a repeated loop selection keeps advancing')
    const continuing = { ...Transform.get(model.legs[0]).rotation }
    rig.play('PatrolWalk', 2)
    model.update(0, rig, pose, true)
    assert.deepEqual(Transform.get(model.legs[0]).rotation, continuing, 'speed changes do not reset phase')
    rig.play('AggroRun', 2.5)
    model.update(0.1, rig, pose, true)
    assert.equal(model.animation, 'run')
    assert.ok(Math.abs(Transform.get(model.arms[0]).rotation.x) > 0.1)
    assert.equal([...engine.getEntitiesWith(GltfContainer)].length, 0)
    assert.equal([...engine.getEntitiesWith(AudioSource)].length, 0)
  } finally { model.dispose() }
  assert.equal(entities(), before)
})

test('head follows rig gaze; repeated one-shots and respawn reset, hiding cannot accumulate motion', () => {
  const before = entities()
  const model = new StalkerModel({ scale: 0.8, sound: false })
  const rig = freshRig()
  try {
    rig.gaze.degrees = 60
    model.update(0, rig, pose, true)
    assert.ok(Math.abs(Transform.get(model.head).rotation.y - 0.5) < 1e-5)
    const neutralEyeHeight = Transform.get(model.model).position.y + (Transform.get(model.head).position.y + Transform.get(model.eyes[0]).position.y) * Transform.get(model.model).scale.y
    assert.ok(Math.abs(neutralEyeHeight - 2.2) < 1e-5, 'neutral eye world height matches the unchanged Ambush perception height')
    rig.play('HeadTurnLeft')
    model.update(0.5, rig, pose, true)
    assert.equal(model.animation, 'look')
    assert.ok(Math.abs(Transform.get(model.head).rotation.y) > 0.2)
    rig.play('HeadTurnLeft')
    model.update(0, rig, pose, true)
    assert.ok(Math.abs(Transform.get(model.head).rotation.y) < 1e-6, 'same-name one-shot explicitly restarts')
    rig.play('PatrolWalk')
    model.update(0.5, rig, pose, true)
    const leg = { ...Transform.get(model.legs[0]).rotation }
    model.update(10, rig, pose, false)
    assert.equal(Transform.get(model.root).position.y, -40)
    assert.deepEqual(Transform.get(model.legs[0]).rotation, leg, 'hidden adapter does not advance')
    model.update(0, freshRig(), pose, true)
    assert.equal(model.animation, 'idle')
    assert.equal(Transform.get(model.model).position.y, 0)
    assert.equal(Transform.get(model.legs[0]).rotation.x, 0)
    assert.equal(Transform.get(model.root).position.y, pose.position.y)
  } finally { model.dispose() }
  assert.equal(entities(), before)
})
