// The simulation clock (src/htn-planner/npc/sim-clock.ts): one dt per frame for every system that ticks planners,
// agents and levels: the engine's dt clamped and scaled, 0 while paused, one fixed step per "step".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SimClock, splitSteps, TIME_SCALES } from '../../src/htn-planner/npc/sim-clock'

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

test('running at scale 1: the engine dt, clamped for hitches; time and frames add up', () => {
  const c = new SimClock()
  assert.equal(c.advance(1 / 30), 1 / 30)
  assert.equal(c.dt, 1 / 30)
  assert.equal(c.advance(0.5), 0.1, 'a hitch is clamped to maxFrame')
  assert.equal(c.advance(-1), 0, 'a negative dt is no time')
  assert.ok(near(c.time, 1 / 30 + 0.1))
  assert.equal(c.frames, 2, 'a frame without time does not count')
})

test('time scale multiplies the clamped engine dt; it snaps to the range', () => {
  const c = new SimClock()
  c.setScale(0.25)
  assert.ok(near(c.advance(0.04), 0.01))
  c.setScale(4)
  assert.ok(near(c.advance(0.5), 0.4), 'clamped first (0.1), then scaled')
  c.setScale(100)
  assert.equal(c.scale, TIME_SCALES[TIME_SCALES.length - 1])
  c.setScale(0)
  assert.equal(c.scale, TIME_SCALES[0])
})

test('paused: dt 0 every frame, time stands; resume goes on', () => {
  const c = new SimClock()
  c.advance(0.02)
  c.pause()
  assert.equal(c.advance(0.02), 0)
  assert.equal(c.advance(0.02), 0)
  assert.ok(near(c.time, 0.02))
  assert.equal(c.frames, 1)
  c.toggle()
  assert.equal(c.paused, false)
  assert.equal(c.advance(0.02), 0.02)
})

test('step: pauses, then exactly one fixed frame per step, whatever the engine dt and the scale', () => {
  const c = new SimClock({ stepSeconds: 1 / 30 })
  c.setScale(4)
  c.step()
  assert.equal(c.paused, true)
  assert.equal(c.advance(0.07), 1 / 30)
  assert.equal(c.advance(0.07), 0, 'one step is one frame')
  c.step(2)
  assert.equal(c.advance(0.01), 1 / 30)
  assert.equal(c.advance(0.01), 1 / 30)
  assert.equal(c.advance(0.01), 0)
  assert.equal(c.frames, 3)
  c.resume()
  assert.ok(near(c.advance(0.01), 0.04), 'running again at its scale')
})

test('splitSteps: a long frame in equal pieces of at most maxStep; nothing for no time', () => {
  assert.deepEqual(splitSteps(0, 0.1), [])
  assert.deepEqual(splitSteps(0.05, 0.1), [0.05])
  assert.deepEqual(splitSteps(0.1, 0.1), [0.1], 'exactly maxStep is one piece')
  const four = splitSteps(0.4, 0.1)
  assert.equal(four.length, 4)
  assert.ok(near(four.reduce((a, b) => a + b, 0), 0.4))
  assert.ok(four.every(s => near(s, 0.1)))
  const three = splitSteps(0.25, 0.1)
  assert.equal(three.length, 3)
  assert.ok(three.every(s => near(s, 0.25 / 3)))
  assert.equal(splitSteps(100, 0.1).length, 16, 'capped: a long stall does not run a hundred host steps')
})

test('each: runs the host over this frame in pieces, not at all while paused', () => {
  const c = new SimClock()
  const seen: number[] = []
  c.setScale(4)
  c.advance(0.1)
  c.each(0.1, dt => seen.push(dt))
  assert.equal(seen.length, 4)
  c.pause()
  c.advance(0.1)
  c.each(0.1, dt => seen.push(dt))
  assert.equal(seen.length, 4)
})

test('label: what the debugger shows', () => {
  const c = new SimClock()
  c.advance(0.1)
  assert.equal(c.label(), 'sim 0.1 s · ×1')
  c.setScale(0.25)
  c.pause()
  assert.equal(c.label(), 'sim 0.1 s · ×0.25 · paused')
})
