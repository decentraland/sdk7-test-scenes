import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gazeWeights, GAZE_LIMIT, StalkerGaze, patrolScanYaw } from '../../src/examples/stalker/stalker-gaze'
import { DEG } from '../../src/htn-planner/npc/vec'


test('gaze: slow two-sided scan has held looks and neutral pauses, independent of frame rate', () => {
  assert.equal(patrolScanYaw(.4), 0)
  assert.equal(patrolScanYaw(2.5), -40)
  assert.equal(patrolScanYaw(7.6), 42)
  assert.equal(patrolScanYaw(10), 0)
  const end = [30, 60, 120].map(fps => {
    const g = new StalkerGaze()
    for (let i = 0; i < fps * 7; i++) g.update(1 / fps, true)
    return g.degrees
  })
  assert.ok(Math.max(...end) - Math.min(...end) < 1e-6)
})

test('gaze: explicit AI direction clamps, eases and releases; reset clears phase and pose', () => {
  const g = new StalkerGaze()
  g.update(.1, false, 200); assert.equal(g.degrees, 10)
  for (let i = 0; i < 10; i++) g.update(.1, false, 200)
  assert.equal(g.degrees, GAZE_LIMIT)
  for (const dt of [NaN, Infinity, -1, 0]) g.update(dt, true)
  assert.equal(g.degrees, GAZE_LIMIT)
  for (let i = 0; i < 10; i++) g.update(.1, false)
  assert.equal(g.degrees, 0)
  g.update(.1, false, -20); g.reset(); assert.equal(g.degrees, 0)
})

test('gaze: normalized quaternion weights produce requested angle, not just proportional weight', () => {
  for (let d = -GAZE_LIMIT; d <= GAZE_LIMIT; d += .5) {
    const w = gazeWeights(d), h = GAZE_LIMIT * DEG / 2
    assert.ok(Math.abs(w.reduce((a,b) => a+b, 0) - 1) < 1e-10)
    const y = (w[2] - w[0]) * Math.sin(h), scalar = w[1] + (w[0] + w[2]) * Math.cos(h)
    assert.ok(Math.abs(2 * Math.atan2(y, scalar) / DEG - d) < 1e-8)
  }
})
