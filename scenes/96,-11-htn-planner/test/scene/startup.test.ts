// Real scene entry, spawner and model on the headless SDK engine; no Explorer rendering claim.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import { main } from '../../src/index'
import { debugRegistry } from '../../src/debugger/registry'
import { STALKER_ASSETS } from '../../src/examples/stalker/stalker-model'
import { PLAYGROUNDS } from '../../src/playgrounds'
import { AmbushLevel } from '../../src/playground/levels/ambush'
import { Station } from '../../src/playground/station'
import { placeInFront, toScene } from '../../src/spawn/frame'
import { despawn, spawn, spawned, spawnWhenReady } from '../../src/spawn/spawner'

const DT = 1 / 30
const models = () => [...engine.getEntitiesWith(GltfContainer)].filter(([, gltf]) => gltf.src === STALKER_ASSETS.model)

test('scene entry waits for the player, starts the real Krampus pad, and menu switching cleans it up', async () => {
  Transform.deleteFrom(engine.PlayerEntity)
  main()
  await engine.update(DT)
  assert.equal(spawned(), null, 'do not place the initial pad at a guessed player position')
  const at = { x: 48, y: 0, z: 40 }
  Transform.createOrReplace(engine.PlayerEntity, { position: at, rotation: Quaternion.Identity() })
  await engine.update(DT)
  try {
    const first = spawned()
    assert.equal(first?.playground.id, 'ambush', 'Level 12 starts without a menu click')
    assert.ok(first)
    assert.deepEqual(first.frame, placeInFront(at, 0, first.playground.half))
    assert.ok(first.built instanceof Station)
    assert.ok(first.built.level instanceof AmbushLevel)
    assert.equal(models().length, 1, 'the actual stalkerView creates the GLTF body')
    const [model] = models()[0]
    const modelRoot = Transform.get(model).parent
    assert.ok(modelRoot !== undefined)
    assert.equal(Transform.get(modelRoot).position.y, -40, 'the existing ambush starts offstage')
    assert.equal(first.built.level.out, false, 'startup preserves the proximity trigger')
    assert.equal(debugRegistry.hosts().length, 1)
    first.built.level.testerPaused = true
    Transform.getMutable(engine.PlayerEntity).position = toScene(first.frame, { x: 0, y: 0, z: -8 })
    await engine.update(DT)
    assert.equal(first.built.level.out, true, 'approaching the crossing triggers the existing encounter')
    assert.equal(Transform.get(modelRoot).position.y, 0, 'the real model is brought onstage by the encounter')

    const other = spawn(PLAYGROUNDS.find(p => p.id === 'hello')!)
    await engine.update(DT)
    assert.equal(spawned(), other)
    assert.equal(models().length, 0, 'switch removes the old model and its descendants')
    assert.equal(Transform.has(first.root), false)
    assert.equal(debugRegistry.hosts().length, 1, 'switch releases the old debugger registration')

    const restart = spawn(PLAYGROUNDS.find(p => p.id === 'ambush')!)
    await engine.update(DT)
    assert.equal(models().length, 1)
    assert.ok(restart.built instanceof Station)
    assert.ok(Math.abs(restart.built.level.time - DT) < 1e-9, 'one simulation update, not duplicate playground systems')
    despawn()
    await engine.update(DT)
    assert.equal(spawned(), null, 'Remove stays removed; startup does not respawn it')
    assert.equal(models().length, 0)
    assert.equal(debugRegistry.hosts().length, 0)
  } finally {
    despawn()
  }
})


test('a menu selection before the player arrives cancels the queued default', async () => {
  Transform.deleteFrom(engine.PlayerEntity)
  spawnWhenReady(PLAYGROUNDS.find(p => p.id === 'ambush')!)
  const chosen = spawn(PLAYGROUNDS.find(p => p.id === 'hello')!)
  Transform.createOrReplace(engine.PlayerEntity, { position: { x: 48, y: 0, z: 40 } })
  await engine.update(DT)
  assert.equal(spawned(), chosen, 'startup must not override the visitor choice')
  assert.equal(models().length, 0)
  despawn()
  await engine.update(DT)
})

test('Remove cancels a queued startup; an already available player starts immediately', async () => {
  Transform.deleteFrom(engine.PlayerEntity)
  spawnWhenReady(PLAYGROUNDS.find(p => p.id === 'ambush')!)
  despawn()
  Transform.createOrReplace(engine.PlayerEntity, { position: { x: 48, y: 0, z: 40 } })
  await engine.update(DT)
  assert.equal(spawned(), null, 'a cancelled startup stays removed')
  spawnWhenReady(PLAYGROUNDS.find(p => p.id === 'ambush')!)
  assert.equal(spawned()?.playground.id, 'ambush')
  assert.equal(models().length, 1)
  despawn()
  await engine.update(DT)
  assert.equal(models().length, 0)
  assert.equal(debugRegistry.hosts().length, 0)
})
