// Smoke tests of the scene on the headless engine: every playground of the menu spawns in front of the player,
// replaces the one before and restarts in place; the levels plan and fill their boards; the reference zones plan
// as expected and play their scenarios by themselves. Stations are found by id.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Entity, TextShape, Transform } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import { v3, Vec3 } from '../../src/htn-planner'
import { StationRunner, Zone } from '../../src/demo/upstream-zone'
import { Figure, Station } from '../../src/playground/station'
import { LEVELS, PLAYGROUNDS } from '../../src/playgrounds'
import { placeInFront, SCENE, toLocal, toScene } from '../../src/spawn/frame'
import { despawn, spawn, Spawned } from '../../src/spawn/spawner'

const DT = 1 / 30

async function run(seconds: number, each: () => void = () => {}) {
  for (let t = 0; t < seconds; t += DT) {
    await engine.update(DT)
    each()
  }
}

/** The player at `p` looking along `yawDeg` (0: +z). */
function setPlayer(p: Vec3, yawDeg = 0) {
  Transform.createOrReplace(engine.PlayerEntity, { position: p, rotation: Quaternion.fromEulerDegrees(0, yawDeg, 0) })
}

/** Removed with its playground: the entity has no Transform any more. */
const gone = (e: Entity) => Transform.getOrNull(e) === null

const entities = () => [...engine.getEntitiesWith(Transform)].length

const playground = (id: string) => PLAYGROUNDS.find(p => p.id === id) ?? assert.fail(`no playground ${id}`)

function station(s: Spawned): Station {
  if (!(s.built instanceof Station)) assert.fail(`${s.playground.id} is not a level`)
  return s.built
}

function runners(s: Spawned): StationRunner[] {
  const zone = s.built as Partial<Zone>
  return zone.runners ?? assert.fail(`${s.playground.id} is not a reference zone`)
}

test('frame: local and scene coordinates round-trip; a playground goes in front of the player and inside the scene', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const f = { origin: v3(40, 0, 60), yaw }
    const back = toLocal(f, toScene(f, v3(3, 1, -5)))
    assert.ok(Math.abs(back.x - 3) < 1e-9 && Math.abs(back.y - 1) < 1e-9 && Math.abs(back.z + 5) < 1e-9)
  }
  const half = { x: 14, z: 13 }
  const north = placeInFront(v3(48, 0, 40), 0.2, half)
  assert.deepEqual(north, { origin: v3(48, 0, 59), yaw: 0 })
  // Facing east: local +z is scene +x, and the player stands at the front edge's side.
  const east = placeInFront(v3(30, 0, 64), Math.PI / 2 - 0.3, half)
  assert.equal(east.yaw, Math.PI / 2)
  assert.ok(Math.abs(east.origin.x - 49) < 1e-9 && Math.abs(east.origin.z - 64) < 1e-9)
  assert.ok(toLocal(east, v3(30, 0, 64)).z < -half.z, 'the player is in front of the front edge')
  // In a corner looking out: moved inside, the whole footprint in the scene.
  const corner = placeInFront(v3(2, 0, 2), Math.PI, half)
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const p = toScene(corner, v3(x * half.x, 0, z * half.z))
    assert.ok(p.x >= 0 && p.x <= SCENE.x && p.z >= 0 && p.z <= SCENE.z, `corner ${x},${z} at ${p.x},${p.z}`)
  }
})

test('levels: each spawns in front of the player, plans and fills its board; the next one replaces it', async () => {
  setPlayer(v3(48, 0, 40))
  const empty = entities()
  let before: Spawned | null = null
  for (const p of LEVELS) {
    const s = spawn(p)
    if (before) assert.ok(gone(before.root), `${before.playground.id} removed`)
    before = s
    await run(3)
    const level = station(s).level
    assert.equal(level.info.id, p.id)
    assert.equal(level.agent.lastPlanStatus, 'succeeded', p.id)
    assert.ok(level.chosen, `${p.id}: a chosen branch`)
    const texts = [...engine.getEntitiesWith(TextShape)].map(([, t]) => t.text).join('\n')
    assert.ok(texts.includes(`BRANCHES of (behave)`), 'planner panel')
    assert.ok(texts.includes('AUTO-TEST'), 'tester panel')
    assert.equal(level.player, null, `${p.id}: the player stands in front of the pad, not on it`)
  }
  despawn()
  assert.equal(entities(), empty, 'nothing left behind')
})

test('levels: the greeter sees the player on its pad; the same button restarts it in place', async () => {
  setPlayer(v3(48, 0, 40), 90)
  const s = spawn(playground('greeter'))
  assert.equal(s.frame.yaw, Math.PI / 2)
  const greeter = station(s).level
  greeter.testerPaused = true
  setPlayer(toScene(s.frame, v3(1, 0, 0)))
  let greeted = false
  await run(6, () => (greeted ||= greeter.binding('?who') === 'you'))
  assert.ok(greeted, `greeter saw the player: ${greeter.chosen}`)
  const again = spawn(playground('greeter'))
  assert.deepEqual(again.frame, s.frame, 'restarted where it stood')
  assert.ok(gone(s.root))
  assert.notEqual(station(again).level, greeter, 'a fresh level')
  assert.equal(station(again).level.testerPaused, false)
  despawn()
})

test('levels: in the squad the third NPC drives a ready-made figure (possessEntityBody) under the playground root', async () => {
  setPlayer(v3(48, 0, 40))
  const s = spawn(playground('squad'))
  const squad = station(s)
  assert.deepEqual(squad.level.crew.map(m => m.id), ['guard-a', 'guard-b', 'figure'])
  const i = squad.level.crew.findIndex(m => m.body === 'figure')
  const npc = squad.npcs[i]
  if (!(npc instanceof Figure)) assert.fail('the figure is possessed, not a capsule')
  await run(2)
  const robe = Transform.get(npc.body.entity)
  const k = squad.level.crew[i].agent.kinematic
  assert.equal(robe.parent, s.root)
  assert.ok(Math.abs(robe.position.x - k.position.x) < 1e-6 && Math.abs(robe.position.z - k.position.z) < 1e-6, 'robe at the agent')
  despawn()
  assert.ok(gone(npc.body.entity), 'the figure goes with the playground')
})

test('reference zones: every gallery and lab station plans as expected; switches replan; auto moves on', async () => {
  setPlayer(v3(48, 0, 30))
  const empty = entities()
  for (const id of ['gallery', 'lab']) {
    const all = runners(spawn(playground(id)))
    await run(1)
    for (const r of all) assert.equal(r.verdict, 'as expected', `${id}/${r.station.id}`)
    await run(3)
    for (const r of all) {
      r.auto = false
      r.nextScenario()
      if (r.station.modes) r.nextMode()
      else r.nextGroup()
    }
    await run(1)
    for (const r of all) assert.equal(r.verdict, 'as expected', `${id}/${r.station.id} after the switches`)
    await run(3)
  }
  despawn()
  assert.equal(entities(), empty, 'nothing left behind')
})

test('reference zones: no station scenario reports an unregistered callterm it does not leave out on purpose', () => {
  setPlayer(v3(48, 0, 30))
  const logged: string[] = []
  const log = console.log
  console.log = (...args: unknown[]) => void logged.push(args.join(' '))
  try {
    for (const id of ['gallery', 'lab']) {
      for (const r of runners(spawn(playground(id)))) {
        r.auto = false
        for (let i = 0; i < r.station.scenarios.length; i++) r.nextScenario()
        for (let i = 0; i < (r.station.reloads?.length ?? 0); i++) r.reload()
      }
    }
  } finally {
    console.log = log
    despawn()
  }
  assert.deepEqual(logged.filter(l => l.includes('unregistered_callterm')), [])
})

test('reference zones: the gallery wanderer walks to its waypoint and plays the animation of the interactable there, timed by its host', async () => {
  setPlayer(v3(48, 0, 30))
  const wanderer = runners(spawn(playground('gallery'))).find(r => r.station.id === 'wanderer') ?? assert.fail('no wanderer station')
  const seen = new Set<string>()
  await run(12, () => seen.add(wanderer.running))
  assert.ok(seen.has('!walk_segment (15 0)'), [...seen].join(', '))
  assert.ok(seen.has('!play_contextual_animation look_at_view (15 0)'), [...seen].join(', '))
  despawn()
})

test('reference zones: the hot reload station reloads by itself mid-walk; a broken source keeps the active revision', async () => {
  setPlayer(v3(48, 0, 30))
  const hot = runners(spawn(playground('lab'))).find(r => r.station.id === 'hot-reload') ?? assert.fail('no hot reload station')
  assert.equal(hot.active, 'A')
  let note = ''
  await run(40, () => {
    if (hot.reloads === 1 && !note) {
      note = hot.reloadNote
      hot.auto = false
    }
  })
  assert.equal(hot.reloads, 1, 'reloaded by itself')
  assert.equal(hot.active, 'B')
  assert.equal(hot.verdict, 'as expected')
  assert.match(note, /^rev B loaded; world kept: \(\d+ \d+\)$/)
  hot.reload() // the broken source
  assert.equal(hot.active, 'B')
  assert.match(hot.reloadNote, /compile failed, rev B stays/)
  hot.reload()
  assert.equal(hot.active, 'A')
  assert.equal(hot.verdict, 'as expected')
  despawn()
})
