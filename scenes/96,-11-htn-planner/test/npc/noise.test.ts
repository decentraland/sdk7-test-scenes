// Noise events and the player's footstep/landing noise heuristics (pure, no engine).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PLAYER_NOISE, NOISE_LOUDNESS, NoiseBus, NoiseInput, PlayerNoiseTracker } from '../../src/htn-planner/npc/noise'
import { v3 } from '../../src/htn-planner/npc/vec'

const DT = 1 / 30

/** Move the tracker along +X at `speed` for `seconds`; returns every noise with its emission time. */
function move(tracker: PlayerNoiseTracker, speed: number, seconds: number, start = 0, x0 = 0) {
  const out: { t: number; noise: NoiseInput }[] = []
  let x = x0
  const n = Math.round(seconds / DT)
  for (let i = 1; i <= n; i++) {
    x += speed * DT
    for (const noise of tracker.update(DT, v3(x, 0.2, 0))) out.push({ t: start + i * DT, noise })
  }
  return { out, x }
}

function fresh() {
  const t = new PlayerNoiseTracker({ ...DEFAULT_PLAYER_NOISE })
  t.update(DT, v3(0, 0.2, 0))
  return t
}

test('noise bus: loudness defaults by kind, cursors read each event once, capacity', () => {
  const bus = new NoiseBus(3)
  const cursor = bus.lastSeq
  bus.advance(1.5)
  const a = bus.emit({ kind: 'run', position: v3(1, 0, 2) })
  assert.equal(a.loudness, NOISE_LOUDNESS.run)
  assert.equal(a.time, 1.5)
  assert.equal(a.source, 'scene')
  assert.equal(bus.emit({ kind: 'mystery', position: v3(0, 0, 0), loudness: 3, source: 'x' }).loudness, 3)
  assert.deepEqual(bus.since(cursor).map(e => e.kind), ['run', 'mystery'])
  assert.deepEqual(bus.since(bus.lastSeq), [])
  for (let i = 0; i < 5; i++) bus.emit({ kind: 'steps', position: v3(0, 0, 0) })
  assert.equal(bus.since(0).length, 3)
})

test('footsteps: walking is nearly silent, jogging audible, running loud', () => {
  const walk = move(fresh(), 1.5, 4).out
  assert.ok(walk.length > 0)
  assert.ok(walk.every(e => e.noise.kind === 'steps' && e.noise.loudness === DEFAULT_PLAYER_NOISE.walkLoudness))
  assert.ok(walk.every(e => (e.noise.loudness ?? 0) <= 1))
  const jog = move(fresh(), 8, 4).out
  assert.ok(jog.every(e => e.noise.kind === 'steps' && e.noise.loudness === NOISE_LOUDNESS.steps), JSON.stringify(jog))
  const run = move(fresh(), 10, 4).out
  assert.ok(run.every(e => e.noise.kind === 'run' && e.noise.loudness === NOISE_LOUDNESS.run), JSON.stringify(run))
  assert.equal(run[0].noise.source, 'player')
  // A walk-silent config emits nothing at all while walking.
  const silent = new PlayerNoiseTracker({ ...DEFAULT_PLAYER_NOISE, walkLoudness: 0 })
  silent.update(DT, v3(0, 0.2, 0))
  assert.equal(move(silent, 1.5, 4).out.length, 0)
})

test('footsteps: one noise per interval while moving, first soon after starting, none while still', () => {
  const tracker = fresh()
  const { out, x } = move(tracker, 10, 3)
  assert.ok(out[0].t <= DEFAULT_PLAYER_NOISE.firstStepDelay + DT, `first at ${out[0].t}`)
  assert.equal(out[0].noise.kind, 'run', 'the first noise already has the running gait')
  const gaps = out.slice(1).map((e, i) => e.t - out[i].t)
  assert.ok(gaps.every(g => Math.abs(g - DEFAULT_PLAYER_NOISE.stepInterval) < DT + 1e-6), gaps.join(','))
  assert.ok(out.length >= 5 && out.length <= 7, `${out.length} noises in 3 s`)
  // Standing still: nothing once the smoothed speed has settled (~0.4 s).
  for (let i = 0; i < 15; i++) tracker.update(DT, v3(x, 0.2, 0))
  assert.equal(tracker.gait, 'still')
  let quiet = 0
  for (let i = 0; i < 90; i++) quiet += tracker.update(DT, v3(x, 0.2, 0)).length
  assert.equal(quiet, 0)
})

test('footsteps: a teleport makes no noise and resets the speed', () => {
  const tracker = fresh()
  assert.deepEqual(tracker.update(DT, v3(50, 0.2, 50)), [])
  assert.equal(tracker.speed, 0)
  assert.deepEqual(tracker.update(DT, v3(50, 0.2, 50)), [])
})

/** Vertical trajectory: rise then fall under gravity `g`, starting at y0 with upward speed v0. */
function jump(tracker: PlayerNoiseTracker, v0: number, g: number, y0 = 0.2) {
  const out: NoiseInput[] = []
  let y = y0
  let vy = v0
  for (let i = 0; i < 120; i++) {
    vy -= g * DT
    y = Math.max(y0, y + vy * DT)
    if (y === y0) vy = 0
    out.push(...tracker.update(DT, v3(5, y, 5)))
  }
  return out
}

test('landing: a jump makes a land noise on touchdown, a small bump does not', () => {
  const tracker = new PlayerNoiseTracker({ ...DEFAULT_PLAYER_NOISE })
  tracker.update(DT, v3(5, 0.2, 5))
  const landed = jump(tracker, 4.5, 10) // ~1 m jump
  assert.equal(landed.length, 1, JSON.stringify(landed))
  assert.equal(landed[0].kind, 'land')
  assert.ok((landed[0].loudness ?? 0) >= DEFAULT_PLAYER_NOISE.landLoudness)
  assert.ok((landed[0].loudness ?? 0) <= DEFAULT_PLAYER_NOISE.maxLandLoudness)
  const bump = jump(tracker, 1.5, 10) // ~0.1 m hop
  assert.equal(bump.length, 0)
  // Higher fall, louder landing.
  const high = jump(tracker, 8, 10)
  assert.ok((high[0].loudness ?? 0) > (landed[0].loudness ?? 0))
  // Off by config.
  const off = new PlayerNoiseTracker({ ...DEFAULT_PLAYER_NOISE, landing: false })
  off.update(DT, v3(5, 0.2, 5))
  assert.equal(jump(off, 4.5, 10).length, 0)
})
