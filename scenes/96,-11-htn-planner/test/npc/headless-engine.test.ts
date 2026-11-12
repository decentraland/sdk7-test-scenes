import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

test('scene ECS runs headless: systems tick on engine.update', async () => {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(0, 0, 0) })
  engine.addSystem(dt => { Transform.getMutable(e).position.x += dt })
  await engine.update(0.25)
  await engine.update(0.25)
  assert.equal(Transform.get(e).position.x, 0.5)
})
