// Level 12 in the scene, on the headless engine: the stalker is the model (stalker.glb), off-stage until it steps
// out, then its clips follow what it does, its head turns by the gaze poses, its steps sound from its feet.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Animator, AudioSource, engine, Entity, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import { PLAYGROUNDS } from '../../src/playgrounds'
import { despawn, spawn } from '../../src/spawn/spawner'
import { STALKER_ASSETS } from '../../src/examples/stalker/stalker-model'
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
  for (const [e, g] of engine.getEntitiesWith(GltfContainer)) if (g.src === STALKER_ASSETS.model) return e as Entity
  return undefined
}
const worldY = (e: Entity) => {
  let y = 0
  for (let t = Transform.getOrNull(e); t; t = t.parent !== undefined ? Transform.getOrNull(t.parent as Entity) : null) y += t.position.y
  return y
}
const playing = (e: Entity) => Animator.get(e).states.filter(s => s.playing && (s.weight ?? 1) > 0.5 && s.speed !== 0).map(s => s.clip)

test('ambush: the model waits under the floor, steps out, walks with its clip and its steps, peers with its head', async () => {
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
  assert.deepEqual(playing(model), ['PatrolWalk'])
  const heard = [...engine.getEntitiesWith(AudioSource)].map(([, a]) => a.audioClipUrl)
  assert.ok(heard.some(u => STALKER_ASSETS.steps.walk.includes(u)), `its steps: ${heard.join(', ')}`)
  // The head: weights on the gaze poses; at the crossing well off centre.
  await run(30, () => level.peering())
  assert.ok(level.peering())
  await run(1)
  const gaze = Animator.get(model).states.filter(s => s.clip.startsWith('Gaze'))
  assert.equal(gaze.length, 3)
  assert.ok(gaze.every(s => s.playing && s.speed === 0))
  const centre = gaze.find(s => s.clip === 'GazeCenter')!.weight ?? 1
  assert.ok(centre < 0.7, `turned head: GazeCenter weight ${centre}`)
  despawn()
})
