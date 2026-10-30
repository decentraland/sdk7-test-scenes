// Level 12 on the headless SDK engine: the primitive body waits off-stage, walks and turns its head.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AudioSource, engine, Entity, GltfContainer, MeshRenderer, Name, Transform } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import { PLAYGROUNDS } from '../../src/playgrounds'
import { despawn, spawn } from '../../src/spawn/spawner'
import { STALKER_BODY_NAME } from '../../src/examples/stalker/stalker-model'
import type { Station } from '../../src/playground/station'
import type { AmbushLevel } from '../../src/playground/levels/ambush'

const DT = 1 / 30
async function run(seconds: number, stop: () => boolean = () => false) {
  for (let t = 0; t < seconds; t += DT) {
    await engine.update(DT)
    if (stop()) return
  }
}

function modelEntity(): Entity | undefined {
  for (const [e, name] of engine.getEntitiesWith(Name)) if (name.value === STALKER_BODY_NAME) return e
  return undefined
}
const worldY = (e: Entity) => {
  let y = 0
  for (let t = Transform.getOrNull(e); t; t = t.parent !== undefined ? Transform.getOrNull(t.parent as Entity) : null) y += t.position.y
  return y
}

test('ambush: the primitive body waits under the floor, steps out, walks with moving limbs and peers with its head', async () => {
  Transform.createOrReplace(engine.PlayerEntity, { position: { x: 48, y: 0, z: 20 }, rotation: Quaternion.Identity() })
  const spawned = spawn(PLAYGROUNDS.find(p => p.id === 'ambush')!)
  const level = (spawned.built as Station).level as AmbushLevel
  await run(0.2)
  const model = modelEntity()
  assert.ok(model !== undefined, 'the model is in the scene')
  assert.ok(worldY(model) < -10, 'off-stage while armed')
  await run(10, () => level.out)
  assert.ok(level.out, 'the tester neared the crossing')
  await run(3)
  assert.ok(Math.abs(worldY(model)) < 0.5, 'on the ground now')
  assert.equal([...engine.getEntitiesWith(GltfContainer)].length, 0, 'no external model needed')
  assert.ok([...engine.getEntitiesWith(AudioSource)].some(([, a]) => a.audioClipUrl.endsWith('.ogg')), 'the moving primitive uses its restored audio')
  assert.ok([...engine.getEntitiesWith(MeshRenderer)].some(([e]) => Transform.get(e).parent === model || Transform.getOrNull(Transform.get(e).parent!)?.parent === model))
  const leg = [...engine.getEntitiesWith(Transform)].find(([, t]) => t.parent === model && Math.abs(t.position.x - 0.27) < 0.01 && Math.abs(t.position.y - 1.25) < 0.01)?.[0]
  assert.ok(leg !== undefined)
  const before = { ...Transform.get(leg).rotation }
  await run(0.15)
  assert.notDeepEqual(Transform.get(leg).rotation, before, 'walking changes an actual limb Transform')
  await run(30, () => level.peering())
  assert.ok(level.peering())
  await run(1)
  const head = [...engine.getEntitiesWith(Transform)].find(([, t]) => t.parent === model && t.position.y > 2.6)?.[0]
  assert.ok(head !== undefined)
  const eye = [...engine.getEntitiesWith(Transform)].find(([, t]) => t.parent === head && Math.abs(t.scale.x - 0.16) < 0.01)?.[0]
  assert.ok(eye !== undefined)
  const eyeHeight = Transform.get(model).position.y + (Transform.get(head).position.y + Transform.get(eye).position.y) * Transform.get(model).scale.y
  assert.ok(Math.abs(eyeHeight - level.agent.perception.cfg.eyeHeight) < 0.03, 'visible eyes stay near the perception origin while breathing')
  assert.ok(Math.abs(Transform.get(head).rotation.y) > 0.3, 'visible head turns with the perception rig')
  despawn()
})
