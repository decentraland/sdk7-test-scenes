import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Kinematic, stepToward, turnToward } from '../../src/htn-planner/npc/movement'
import { angleDiff, DEG, distanceXZ, v3, yawTo } from '../../src/htn-planner/npc/vec'

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`)

test('yaw convention: 0 faces +Z, +90 deg faces +X; angleDiff wraps', () => {
  close(yawTo(v3(0, 0, 0), v3(0, 0, 1)), 0)
  close(yawTo(v3(0, 0, 0), v3(1, 0, 0)), 90 * DEG)
  close(angleDiff(170 * DEG, -170 * DEG), 20 * DEG)
  close(angleDiff(-170 * DEG, 170 * DEG), -20 * DEG)
})

test('turnToward is rate limited and snaps when within one step', () => {
  const k: Kinematic = { position: v3(0, 0, 0), yaw: 0 }
  assert.equal(turnToward(k, 90 * DEG, 0.5, 90 * DEG), false)
  close(k.yaw, 45 * DEG)
  assert.equal(turnToward(k, 90 * DEG, 0.5, 90 * DEG), true)
  close(k.yaw, 90 * DEG)
  turnToward(k, -170 * DEG, 0.1, 100 * DEG) // shortest way is through 180
  close(k.yaw, 100 * DEG)
})

test('stepToward moves at speed when facing, never overshoots, arrives within radius', () => {
  const k: Kinematic = { position: v3(0, 0, 0), yaw: 0 }
  const p = { speed: 2, turnRate: Math.PI, arrivalRadius: 0.3 }
  assert.equal(stepToward(k, v3(0, 0, 10), 1, p), false)
  close(k.position.z, 2)
  let ticks = 0
  while (!stepToward(k, v3(0, 0, 10), 0.1, p)) ticks++
  assert.ok(ticks < 45)
  const d = distanceXZ(k.position, v3(0, 0, 10))
  assert.ok(d <= 0.3 && d >= 0, `ended ${d} from target`)
  assert.ok(k.position.z <= 10)
  // Big step: clamped at the target, not past it.
  const k2: Kinematic = { position: v3(0, 0, 0), yaw: 0 }
  stepToward(k2, v3(0, 0, 1), 10, { speed: 5, turnRate: Math.PI, arrivalRadius: 0 })
  close(k2.position.z, 1)
})

test('stepToward pivots in place for a target behind, then walks', () => {
  const k: Kinematic = { position: v3(0, 0, 0), yaw: 0 }
  const p = { speed: 1, turnRate: 90 * DEG, arrivalRadius: 0.2 }
  stepToward(k, v3(0, 0, -5), 0.5, p) // needs 180 deg; after 45 deg still facing away
  close(k.position.z, 0)
  close(k.position.x, 0)
  for (let i = 0; i < 4; i++) stepToward(k, v3(0, 0, -5), 0.5, p)
  close(Math.abs(angleDiff(k.yaw, Math.PI)), 0)
  assert.ok(k.position.z < 0)
})

test('stepToward keeps feet on the ground and inside bounds', () => {
  const terrain = { groundY: (x: number) => 0.2 + x * 0.1, bounds: { minX: 0, maxX: 3, minZ: 0, maxZ: 10 } }
  const k: Kinematic = { position: v3(1, 5, 1), yaw: 90 * DEG }
  stepToward(k, v3(10, 0, 1), 1, { speed: 1, turnRate: Math.PI, arrivalRadius: 0.1 }, terrain)
  close(k.position.x, 2)
  close(k.position.y, 0.4)
  for (let i = 0; i < 10; i++) stepToward(k, v3(10, 0, 1), 1, { speed: 1, turnRate: Math.PI, arrivalRadius: 0.1 }, terrain)
  close(k.position.x, 3)
})
