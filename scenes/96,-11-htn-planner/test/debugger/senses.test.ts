// The sense gizmos' view model and geometry (src/debugger/senses.ts): the cone follows the targets' light and the
// head, the colour what it senses (calm, suspicious, seen, smelled), the last noise drawn for a while.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arcSegments, coneSegments, gizmoSegments, hasSenses, NOISE_SECONDS, noiseKey, poseKey, SENSE_HEX, senseView, shapeKey } from '../../src/debugger/senses'
import { CLEAR_LINE_OF_SIGHT, GeometricLineOfSight, GuardAgent, NoiseBus, TargetSample, v3 } from '../../src/htn-planner'
import { scripted } from '../npc/fake-planner'

function agent(extra: { sightYaw?: () => number; presence?: number } = {}) {
  const s = scripted(() => [])
  return new GuardAgent({
    id: 'g',
    planner: s.factory,
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    hearingLineOfSight: new GeometricLineOfSight([{ min: v3(-5, 0, -3.2), max: v3(5, 4, -3) }]),
    start: { position: v3(0, 0, 0), yaw: 0 },
    perception: { range: 9, fovDeg: 120, nearRadius: 0, detectTime: 0.5, nearDetectTime: 0.5, presenceRadius: extra.presence ?? 0 },
    sightYaw: extra.sightYaw
  })
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

test('cone geometry: two edges and an arc, in its own frame (looking along +z); a full circle has no edges', () => {
  const cone = coneSegments(9, 120)
  assert.equal(cone.length, 2 + 6)
  const [left, right] = cone
  assert.ok(near(left[1].x, -9 * Math.sin(Math.PI / 3)) && near(left[1].z, 9 * Math.cos(Math.PI / 3)), 'left edge at -60 deg')
  assert.ok(near(right[1].x, 9 * Math.sin(Math.PI / 3)))
  for (const [a, b] of cone.slice(2)) assert.ok(near(Math.hypot(a.x, a.z), 9) && near(Math.hypot(b.x, b.z), 9), 'the arc at the range')
  assert.equal(coneSegments(9, 360).length, 6, 'all around: the circle only')
  assert.deepEqual(coneSegments(0, 120), [])
  assert.deepEqual(arcSegments(5, 0), [])
  // Edges reach the farthest arc; extra arcs in their own colour.
  const segs = gizmoSegments({ position: v3(0, 0, 0), yaw: 0, range: 5, fovDeg: 120, presence: 0, state: 'calm', arcs: [{ radius: 12, hex: '#ffe066' }], noise: null })
  assert.equal(segs.length, 2 + 6 + 6)
  assert.ok(near(Math.hypot(segs[0].b.x, segs[0].b.z), 12))
  assert.equal(segs.filter(s => s.hex === '#ffe066').length, 6)
  assert.equal(segs[0].hex, SENSE_HEX.calm)
})

test('view: the range follows the targets\' light (the farthest), the yaw the head; calm, suspicious, seen', () => {
  let head = 0.5
  const a = agent({ sightYaw: () => head })
  a.tick(0.1, [])
  let v = senseView(a)
  assert.equal(v.range, 9, 'no target: the plain range')
  assert.equal(v.state, 'calm')
  assert.equal(v.yaw, 0.5, 'where the head looks')
  const lit: TargetSample[] = [{ id: 't', position: v3(0, 0, 30), visibility: 1 }, { id: 'u', position: v3(0, 0, 30), visibility: 5 / 9 }]
  a.tick(0.1, lit)
  assert.equal(senseView(a).range, 9)
  a.tick(0.1, lit.slice(1))
  assert.ok(near(senseView(a).range, 5), 'only a dark one around: the cone shrinks')
  head = 0
  const front: TargetSample[] = [{ id: 't', position: v3(0, 0, 4), visibility: 1 }]
  a.tick(0.1, front)
  v = senseView(a)
  assert.equal(v.state, 'suspicious', 'in sight, not yet detected')
  for (let i = 0; i < 10; i++) a.tick(0.1, front)
  assert.equal(senseView(a).state, 'seen')
  assert.ok(hasSenses(v))
})

test('view: smelled when presence alone detects it; the presence radius is drawn', () => {
  const a = agent({ presence: 2.5 })
  const behind: TargetSample[] = [{ id: 't', position: v3(0, 0, -2), visibility: 0 }]
  for (let i = 0; i < 10; i++) a.tick(0.1, behind)
  const v = senseView(a)
  assert.equal(v.state, 'smelled')
  assert.equal(v.presence, 2.5)
})

test('view: the last heard noise, with its radius (muffled through a wall), for a few seconds', () => {
  const a = agent()
  const bus = new NoiseBus()
  a.tick(0.1, [], [bus.emit({ kind: 'impact', position: v3(0, 0, 6), loudness: 10, source: 'x' })])
  let v = senseView(a)
  assert.deepEqual(v.noise, { position: v3(0, 0, 6), radius: 10 })
  a.tick(0.1, [], [bus.emit({ kind: 'impact', position: v3(0, 0, -4), loudness: 10, source: 'x' })])
  v = senseView(a)
  assert.equal(v.noise?.radius, 10 * a.hearing.cfg.wallMuffle, 'behind the wall: muffled')
  for (let t = 0; t <= NOISE_SECONDS; t += 0.1) a.tick(0.1, [])
  assert.equal(senseView(a).noise, null, 'gone after a while')
})

test('keys: the shape only on range / angle / radius / arcs, the pose in 0.1 m and 2 degree steps, the noise ring', () => {
  const base = { position: v3(1, 0, 1), yaw: 0, range: 9, fovDeg: 120, presence: 2.5, state: 'calm' as const, arcs: [], noise: null }
  assert.equal(shapeKey(base), shapeKey({ ...base, position: v3(5, 0, 5), yaw: 2, state: 'seen' }))
  assert.notEqual(shapeKey(base), shapeKey({ ...base, range: 5 }))
  assert.notEqual(shapeKey(base), shapeKey({ ...base, arcs: [{ radius: 12, hex: '#ffe066' }] }))
  assert.equal(poseKey(base), poseKey({ ...base, position: v3(1.02, 0, 1.01), yaw: 0.01 }))
  assert.notEqual(poseKey(base), poseKey({ ...base, yaw: 0.05 }))
  assert.equal(noiseKey(base), '-')
  assert.notEqual(noiseKey({ ...base, noise: { position: v3(0, 0, 6), radius: 10 } }), '-')
})

test('view: an agent whose domain reads no sight fact draws no cone (it does not see)', () => {
  const s = scripted(() => [], undefined, { facts: ['carrying/1'], callterms: [] })
  const a = new GuardAgent({ id: 'c', planner: s.factory, lineOfSight: CLEAR_LINE_OF_SIGHT, start: { position: v3(0, 0, 0), yaw: 0 }, perception: { presenceRadius: 2 } })
  a.tick(0.1, [{ id: 't', position: v3(0, 0, 3) }])
  const v = senseView(a, [{ radius: 12, hex: '#ffe066' }])
  assert.equal(hasSenses(v), false)
  assert.deepEqual(v.arcs, [])
  assert.equal(v.noise, null)
})
