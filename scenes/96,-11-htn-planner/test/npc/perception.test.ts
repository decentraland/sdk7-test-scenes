import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLEAR_LINE_OF_SIGHT,
  DEFAULT_PERCEPTION,
  GeometricLineOfSight,
  inViewCone,
  Perception,
  PerceptionConfig,
  segmentHitsBox
} from '../../src/htn-planner/npc/perception'
import { DEG, v3 } from '../../src/htn-planner/npc/vec'

const cfg: PerceptionConfig = { ...DEFAULT_PERCEPTION, range: 10, fovDeg: 90, nearRadius: 1.5, eyeHeight: 1.6, targetHeight: 1.2 }
const origin = v3(0, 0, 0)

test('view cone: range, half-angle and the all-around near radius', () => {
  assert.equal(inViewCone(origin, 0, v3(0, 0, 5), cfg), true) // straight ahead (+Z)
  assert.equal(inViewCone(origin, 0, v3(0, 0, 9.9), cfg), true)
  assert.equal(inViewCone(origin, 0, v3(0, 0, 10.5), cfg), false) // out of range
  assert.equal(inViewCone(origin, 0, v3(4, 0, 5), cfg), true) // ~39 deg off axis, inside 45
  assert.equal(inViewCone(origin, 0, v3(6, 0, 5), cfg), false) // ~50 deg off axis
  assert.equal(inViewCone(origin, 0, v3(0, 0, -5), cfg), false) // behind
  assert.equal(inViewCone(origin, 0, v3(0, 0, -1), cfg), true) // behind but within near radius
  assert.equal(inViewCone(origin, 90 * DEG, v3(5, 0, 0), cfg), true) // facing +X
  assert.equal(inViewCone(origin, Math.PI, v3(0, 0, -5), cfg), true) // facing -Z
})

test('geometric line of sight: segment vs box slab test', () => {
  const wall = { min: v3(-5, 0, 4), max: v3(5, 4, 4.3) }
  assert.equal(segmentHitsBox(v3(0, 1.6, 0), v3(0, 1.2, 8), wall), true)
  assert.equal(segmentHitsBox(v3(0, 1.6, 0), v3(0, 1.2, 3), wall), false) // stops before the wall
  assert.equal(segmentHitsBox(v3(6, 1.6, 0), v3(6, 1.2, 8), wall), false) // passes beside it
  assert.equal(segmentHitsBox(v3(0, 5, 0), v3(0, 5, 8), wall), false) // over it
  const los = new GeometricLineOfSight([wall])
  assert.equal(los.check('g', v3(0, 1.6, 0), v3(0, 1.2, 8)), false)
  los.occluders = []
  assert.equal(los.check('g', v3(0, 1.6, 0), v3(0, 1.2, 8)), true)
})

test('suspicion rises faster up close and detection needs sustained sight', () => {
  const c = { ...cfg, detectTime: 2, nearDetectTime: 0.2 }
  const self = { position: origin, yaw: 0 }
  const far = new Perception(c)
  const near = new Perception(c)
  let farDetectedAt = -1
  let nearDetectedAt = -1
  for (let i = 1; i <= 100; i++) {
    const t = i * 0.05
    if (far.update(0.05, t, 'g', self, [{ id: 'player', position: v3(0, 0, 9) }], CLEAR_LINE_OF_SIGHT).visible.length && farDetectedAt < 0) farDetectedAt = t
    if (near.update(0.05, t, 'g', self, [{ id: 'player', position: v3(0, 0, 2) }], CLEAR_LINE_OF_SIGHT).visible.length && nearDetectedAt < 0) nearDetectedAt = t
  }
  assert.ok(nearDetectedAt > 0 && farDetectedAt > 0)
  assert.ok(nearDetectedAt < farDetectedAt, `near ${nearDetectedAt} should beat far ${farDetectedAt}`)
  assert.ok(farDetectedAt > 1.5 && farDetectedAt <= 2.05, `far detection at ${farDetectedAt}`)
})

test('a glimpse decays; detectTime 0 detects at once', () => {
  const self = { position: origin, yaw: 0 }
  const p = new Perception({ ...cfg, detectTime: 2, nearDetectTime: 2, decayPerSecond: 1 })
  p.update(0.5, 0.5, 'g', self, [{ id: 'player', position: v3(0, 0, 5) }], CLEAR_LINE_OF_SIGHT)
  assert.ok(Math.abs(p.suspicionOf('player') - 0.25) < 1e-9)
  p.update(0.2, 0.7, 'g', self, [{ id: 'player', position: v3(0, 0, -8) }], CLEAR_LINE_OF_SIGHT) // behind
  assert.ok(Math.abs(p.suspicionOf('player') - 0.05) < 1e-9)
  const instant = new Perception({ ...cfg, detectTime: 0, nearDetectTime: 0 })
  const r = instant.update(0.016, 0, 'g', self, [{ id: 'player', position: v3(0, 0, 9) }], CLEAR_LINE_OF_SIGHT)
  assert.deepEqual(r.visible.map(v => v.id), ['player'])
})

test('occluded targets are not detected', () => {
  const self = { position: origin, yaw: 0 }
  const los = new GeometricLineOfSight([{ min: v3(-5, 0, 4), max: v3(5, 4, 4.3) }])
  const p = new Perception({ ...cfg, detectTime: 0, nearDetectTime: 0 })
  for (let i = 0; i < 30; i++) {
    const r = p.update(0.1, i * 0.1, 'g', self, [{ id: 'player', position: v3(0, 0, 8) }], los)
    assert.equal(r.visible.length, 0)
  }
  assert.equal(p.suspicionOf('player'), 0)
})

test('losing a detected target reports where it was last seen, after the grace period', () => {
  const self = { position: origin, yaw: 0 }
  const p = new Perception({ ...cfg, detectTime: 0, nearDetectTime: 0, loseGrace: 0.3 })
  p.update(0.1, 0.1, 'g', self, [{ id: 'player', position: v3(1, 0, 6) }], CLEAR_LINE_OF_SIGHT)
  let r = p.update(0.1, 0.2, 'g', self, [{ id: 'player', position: v3(1, 0, 7) }], CLEAR_LINE_OF_SIGHT)
  assert.equal(r.visible.length, 1)
  // Steps out of range: still "visible" during the grace period, then lost at the last seen spot.
  r = p.update(0.2, 0.4, 'g', self, [{ id: 'player', position: v3(1, 0, 30) }], CLEAR_LINE_OF_SIGHT)
  assert.equal(r.visible.length, 1)
  assert.equal(r.lost.length, 0)
  r = p.update(0.2, 0.6, 'g', self, [{ id: 'player', position: v3(1, 0, 31) }], CLEAR_LINE_OF_SIGHT)
  assert.equal(r.visible.length, 0)
  assert.deepEqual(r.lost, [{ id: 'player', position: v3(1, 0, 7), time: 0.2 }])
  r = p.update(0.2, 0.8, 'g', self, [{ id: 'player', position: v3(1, 0, 31) }], CLEAR_LINE_OF_SIGHT)
  assert.equal(r.lost.length, 0) // reported once
})

test('a detected target that disappears from the samples counts as lost', () => {
  const self = { position: origin, yaw: 0 }
  const p = new Perception({ ...cfg, detectTime: 0, nearDetectTime: 0 })
  p.update(0.1, 1, 'g', self, [{ id: 'player', position: v3(0, 0, 5) }], CLEAR_LINE_OF_SIGHT)
  const r = p.update(0.1, 1.1, 'g', self, [], CLEAR_LINE_OF_SIGHT)
  assert.deepEqual(r.lost, [{ id: 'player', position: v3(0, 0, 5), time: 1 }])
})

test('visible targets are sorted closest first', () => {
  const self = { position: origin, yaw: 0 }
  const p = new Perception({ ...cfg, detectTime: 0, nearDetectTime: 0 })
  const r = p.update(0.1, 0, 'g', self, [
    { id: 'far', position: v3(0, 0, 8) },
    { id: 'near', position: v3(0, 0, 3) }
  ], CLEAR_LINE_OF_SIGHT)
  assert.deepEqual(r.visible.map(v => v.id), ['near', 'far'])
})

// ---- light-dependent sight and presence (level 12, the ambush) -------------------------------------------------

test('visibility: a target\'s own factor scales the sight range (lit far, shielded nearer, dark only close)', () => {
  const self = { position: origin, yaw: 0 }
  const c = { ...cfg, range: 9, detectTime: 0, nearDetectTime: 0, nearRadius: 0 }
  const seenAt = (z: number, visibility?: number) => {
    const p = new Perception(c)
    return p.update(0.1, 0, 'g', self, [{ id: 'player', position: v3(0, 0, z), visibility }], CLEAR_LINE_OF_SIGHT).visible.length === 1
  }
  assert.equal(seenAt(7), true, 'no factor: the plain range')
  assert.equal(seenAt(7, 1), true)
  assert.equal(seenAt(7, 7 / 9), false, 'shielded: 7 m is past its reach (eye 1.6, aim 1.2)')
  assert.equal(seenAt(6, 7 / 9), true)
  assert.equal(seenAt(6, 5 / 9), false, 'dark: only close')
  assert.equal(seenAt(4, 5 / 9), true)
  assert.equal(seenAt(1, 0), false, 'visibility 0: never by sight')
  // Garbage in: NaN or a negative factor never throws; NaN counts as 1, a negative one as 0.
  assert.equal(seenAt(7, NaN), true)
  assert.equal(seenAt(1, -2), false)
  assert.equal(inViewCone(origin, 0, v3(0, 0, 7), c, 9 * (5 / 9)), false, 'inViewCone takes the range to use')
  assert.equal(inViewCone(origin, 0, v3(0, 0, 4), c, 5), true)
})

test('presence: within presenceRadius a target is sensed all around, through walls, whatever its light', () => {
  const wall = new GeometricLineOfSight([{ min: v3(-3, 0, -1.2), max: v3(3, 4, -1) }])
  const c = { ...cfg, range: 9, fovDeg: 90, nearRadius: 0, detectTime: 0, nearDetectTime: 0, presenceRadius: 2.5 }
  const self = { position: origin, yaw: 0 }
  const behind = [{ id: 'player', position: v3(0, 0, -2), visibility: 0 }] // behind it, dark, behind a wall
  const p = new Perception(c)
  assert.deepEqual(p.update(0.1, 0, 'g', self, behind, wall).visible.map(t => t.id), ['player'])
  assert.deepEqual(p.senses().map(s => [s.id, s.by, s.detected]), [['player', 'presence', true]])
  // Out of the radius: neither sight (behind, dark, walled) nor presence.
  const q = new Perception(c)
  assert.equal(q.update(0.1, 0, 'g', self, [{ id: 'player', position: v3(0, 0, -3), visibility: 0 }], wall).visible.length, 0)
  assert.deepEqual(q.senses().map(s => [s.id, s.by]), [['player', null]])
  // Default 0: off, as before.
  assert.equal(DEFAULT_PERCEPTION.presenceRadius, 0)
  const r = new Perception({ ...c, presenceRadius: 0 })
  assert.equal(r.update(0.1, 0, 'g', self, behind, wall).visible.length, 0)
})

test('senses(): each tracked target\'s sight range now (its light), how it was sensed, suspicion; sight wins over presence', () => {
  const c = { ...cfg, range: 10, fovDeg: 90, nearRadius: 0, detectTime: 2, nearDetectTime: 2, presenceRadius: 3 }
  const p = new Perception(c)
  p.update(0.1, 0, 'g', { position: origin, yaw: 0 }, [
    { id: 'lit', position: v3(0, 0, 2), visibility: 1 },
    { id: 'dark', position: v3(0, 0, 8), visibility: 0.5 }
  ], CLEAR_LINE_OF_SIGHT)
  const s = p.senses()
  assert.deepEqual(s.map(x => [x.id, x.range, x.by, x.detected]), [['lit', 10, 'sight', false], ['dark', 5, null, false]])
  assert.ok(s[0].suspicion > 0 && s[1].suspicion === 0)
  p.reset()
  assert.deepEqual(p.senses(), [])
})
