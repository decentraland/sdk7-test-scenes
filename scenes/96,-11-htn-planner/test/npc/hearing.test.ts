// Guard hearing (pure): radius, attenuation, wall muffling, kinds, self-noise, alert escalation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_HEARING, Hearing, perceivedLevel } from '../../src/htn-planner/npc/hearing'
import { NoiseBus, NoiseEvent, NoiseInput } from '../../src/htn-planner/npc/noise'
import { CLEAR_LINE_OF_SIGHT, GeometricLineOfSight } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'

const FEET = v3(0, 0, 0)

function noise(input: NoiseInput): NoiseEvent {
  return new NoiseBus().emit(input)
}

test('perceived level falls linearly with distance and is 0 out of earshot', () => {
  assert.equal(perceivedLevel(0, 10), 1)
  assert.ok(Math.abs(perceivedLevel(5, 10) - 0.5) < 1e-9)
  assert.ok(perceivedLevel(10, 10) > 0) // the very edge still counts, barely
  assert.equal(perceivedLevel(10.01, 10), 0)
  assert.equal(perceivedLevel(1, 0), 0)
})

test('heard within the loudness radius only, attenuated by distance', () => {
  const h = new Hearing()
  const near = h.hear('g', FEET, noise({ kind: 'run', position: v3(0, 0, -3), loudness: 12 }), CLEAR_LINE_OF_SIGHT, 0)
  const far = h.hear('g', FEET, noise({ kind: 'run', position: v3(0, 0, -10), loudness: 12 }), CLEAR_LINE_OF_SIGHT, 0)
  assert.ok(near && far && near.perceived > far.perceived)
  assert.ok(near && Math.abs(near.perceived - 0.75) < 1e-9)
  assert.equal(h.hear('g', FEET, noise({ kind: 'run', position: v3(0, 0, -13), loudness: 12 }), CLEAR_LINE_OF_SIGHT, 0), null)
  // Walking (1 m) is not heard at 2 m.
  assert.equal(h.hear('g', FEET, noise({ kind: 'steps', position: v3(2, 0, 0), loudness: 1 }), CLEAR_LINE_OF_SIGHT, 0), null)
})

test('a guard ignores its own noises', () => {
  const h = new Hearing()
  const own = noise({ kind: 'steps', position: v3(0, 0, 1), loudness: 7, source: 'g' })
  assert.equal(h.hear('g', FEET, own, CLEAR_LINE_OF_SIGHT, 0), null)
  assert.ok(h.hear('other', FEET, own, CLEAR_LINE_OF_SIGHT, 0))
  const r = h.update(0.1, 0, 'g', FEET, [own], CLEAR_LINE_OF_SIGHT)
  assert.equal(r.heard.length, 0)
  assert.equal(r.level, 'calm')
})

test('a wall muffles: the audible radius shrinks by wallMuffle', () => {
  const wall = new GeometricLineOfSight([{ min: v3(-5, 0, -2.2), max: v3(5, 4, -2) }])
  const h = new Hearing()
  const at4 = noise({ kind: 'run', position: v3(0, 0, -4), loudness: 10 })
  const clear = h.hear('g', FEET, at4, CLEAR_LINE_OF_SIGHT, 0)
  const muffled = h.hear('g', FEET, at4, wall, 0)
  assert.ok(clear && !clear.muffled && Math.abs(clear.perceived - 0.6) < 1e-9)
  assert.ok(muffled && muffled.muffled && Math.abs(muffled.perceived - 0.2) < 1e-9)
  assert.equal(h.hear('g', FEET, noise({ kind: 'run', position: v3(0, 0, -6), loudness: 10 }), wall, 0), null)
  const noMuffle = new Hearing({ ...DEFAULT_HEARING, wallMuffle: 1 })
  assert.ok(noMuffle.hear('g', FEET, noise({ kind: 'run', position: v3(0, 0, -6), loudness: 10 }), wall, 0))
})

test('alert: one loud noise alarms at once, a faint one only makes the guard wary', () => {
  const loud = new Hearing()
  const r = loud.update(0.1, 0, 'g', FEET, [noise({ kind: 'run', position: v3(0, 0, -4), loudness: 12 })], CLEAR_LINE_OF_SIGHT)
  assert.equal(r.level, 'alarmed')
  assert.ok(r.loudest && r.loudest.kind === 'run')
  const faint = new Hearing()
  assert.equal(faint.update(0.1, 0, 'g', FEET, [noise({ kind: 'test', position: v3(0, 0, -8), loudness: 10 })], CLEAR_LINE_OF_SIGHT).level, 'wary')
})

test('alert: repeated noises escalate, kinds weigh differently, the meter decays', () => {
  const jogAt4 = () => noise({ kind: 'steps', position: v3(0, 0, -4), loudness: 7 }) // perceived ~0.43
  const h = new Hearing()
  const levels: string[] = []
  for (let i = 0; i < 4; i++) levels.push(h.update(0.5, i * 0.5, 'g', FEET, [jogAt4()], CLEAR_LINE_OF_SIGHT).level)
  assert.equal(levels[0], 'wary')
  assert.ok(levels.indexOf('alarmed') > 0 && levels.indexOf('alarmed') <= 3, levels.join(','))
  // The same perceived level weighs more as an impact than as a footstep.
  const steps = new Hearing()
  const impact = new Hearing()
  steps.update(0.1, 0, 'g', FEET, [noise({ kind: 'steps', position: v3(0, 0, -6), loudness: 10 })], CLEAR_LINE_OF_SIGHT)
  impact.update(0.1, 0, 'g', FEET, [noise({ kind: 'impact', position: v3(0, 0, -6), loudness: 10 })], CLEAR_LINE_OF_SIGHT)
  assert.ok(impact.alert > steps.alert * 1.5)
  // Decay back to calm when nothing more is heard.
  const before = h.alert
  h.update(1, 2, 'g', FEET, [], CLEAR_LINE_OF_SIGHT)
  assert.ok(Math.abs(before - h.alert - DEFAULT_HEARING.alertDecayPerSecond) < 1e-9)
  for (let i = 0; i < 20; i++) h.update(1, 3 + i, 'g', FEET, [], CLEAR_LINE_OF_SIGHT)
  assert.equal(h.level, 'calm')
})
