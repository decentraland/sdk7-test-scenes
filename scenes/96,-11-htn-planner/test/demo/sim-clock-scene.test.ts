// The scene's simulation clock on the headless engine: every system that ticks planners reads it (the spawned
// playground, GuardSquad's own system, the player noise bus), so the debugger's pause, step and time scale hold all of
// them; the planning time stays wall-clock.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Transform } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import { createCapsuleBody, float, GuardSquad, noiseBus, sceneClock, v3, Vec3 } from '../../src/htn-planner'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { StationRunner, Zone } from '../../src/demo/upstream-zone'
import { Station } from '../../src/playground/station'
import { PLAYGROUNDS } from '../../src/playgrounds'
import { despawn, spawn } from '../../src/spawn/spawner'
import { prim, scripted } from '../npc/fake-planner'

const DT = 1 / 30
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

async function frames(n: number, dt = DT) {
  for (let i = 0; i < n; i++) await engine.update(dt)
}

function setPlayer(p: Vec3) {
  Transform.createOrReplace(engine.PlayerEntity, { position: p, rotation: Quaternion.Identity() })
}

function reset() {
  const c = sceneClock()
  c.resume()
  c.setScale(1)
}

test('a level: paused nothing runs, a step is one frame, scale 2 runs twice as fast, resume goes on', async () => {
  setPlayer(v3(48, 0, 40))
  const clock = sceneClock()
  const s = spawn(PLAYGROUNDS.find(p => p.id === 'squad')!)
  const level = (s.built as Station).level
  await frames(30)
  assert.ok(near(level.time, 1), `ran a second: ${level.time}`)
  const agent = level.crew[0].agent
  const plans = agent.metrics.plansMade
  const at = { ...agent.kinematic.position }

  clock.pause()
  await frames(30)
  assert.ok(near(level.time, 1), 'paused: level time stands')
  assert.deepEqual(agent.kinematic.position, at, 'paused: nobody moves')
  assert.equal(agent.metrics.plansMade, plans, 'paused: nobody plans')

  clock.step()
  await frames(5)
  assert.ok(near(level.time, 1 + clock.stepSeconds), `one step: ${level.time}`)

  clock.resume()
  clock.setScale(2)
  await frames(15)
  assert.ok(near(level.time, 1 + clock.stepSeconds + 1), `scale 2: 15 frames are a second: ${level.time}`)

  clock.setScale(4)
  const before = level.time
  await frames(3, 0.1)
  assert.ok(near(level.time, before + 1.2), `scale 4 at 10 fps: 0.4 s a frame, in 0.1 s steps: ${level.time - before}`)
  assert.ok(agent.metrics.lastPlanMs >= 0 && agent.metrics.plansMade > plans, 'planning goes on, timed on the wall clock')
  reset()
  despawn()
})

test('a reference zone: its stations stop with the clock', async () => {
  const clock = sceneClock()
  const s = spawn(PLAYGROUNDS.find(p => p.id === 'gallery')!)
  const runners = (s.built as Zone).runners as StationRunner[]
  await frames(10)
  const before = runners.map(r => r.debug.history?.total ?? 0)
  const time = (runners[0] as unknown as { time: number }).time
  clock.pause()
  await frames(60)
  assert.equal((runners[0] as unknown as { time: number }).time, time)
  assert.deepEqual(runners.map(r => r.debug.history?.total ?? 0), before, 'no step started or ended while paused')
  reset()
  despawn()
})

test("GuardSquad's own system reads the clock; the scene noise bus ages on it", async () => {
  const clock = sceneClock()
  const squad = new GuardSquad({
    planner: scripted(() => [prim('!wait', float(100))]).factory,
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    terrain: { groundY: () => 0 },
    targets: () => []
  })
  squad.spawn([{ id: 'g1', route: [v3(4, 0, 4)], body: createCapsuleBody }])
  const agent = squad.guards[0].agent
  await frames(3)
  assert.ok(near(agent.time, 3 * DT))
  const busTime = noiseBus.now
  assert.ok(busTime > 0, 'the bus ages while running')
  clock.pause()
  await frames(10)
  assert.ok(near(agent.time, 3 * DT), 'paused')
  assert.equal(noiseBus.now, busTime, 'the bus time stands too')
  clock.step(2)
  await frames(4)
  assert.ok(near(agent.time, 3 * DT + 2 * clock.stepSeconds), `two steps: ${agent.time}`)
  clock.resume()
  clock.setScale(4)
  await frames(1, 0.1)
  assert.ok(near(agent.time, 3 * DT + 2 * clock.stepSeconds + 0.4), 'a 0.4 s frame in maxDt steps, none lost')
  reset()
  squad.despawn()
})
