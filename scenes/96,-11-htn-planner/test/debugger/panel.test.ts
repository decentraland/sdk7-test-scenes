// The debugger panel on the headless engine: the spawned playground's hosts register (and unregister on despawn),
// stations record while the debugger is open, every tab builds on real data within the entity budget, the
// Domain Runner's result becomes a host the other tabs read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Transform } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import { debugRegistry } from '../../src/debugger/registry'
import { countEntities } from '../../src/debugger/ui/kit'
import { panel } from '../../src/debugger/ui/panel'
import { RUNNER_ID, runSelected } from '../../src/debugger/ui/runner-view'
import { selectHost, set, state, Tab } from '../../src/debugger/ui/state'
import { PLAYGROUNDS } from '../../src/playgrounds'
import { despawn, spawn } from '../../src/spawn/spawner'
import { sceneClock } from '../../src/htn-planner'

const DT = 1 / 30
const TABS: Tab[] = ['plan', 'world', 'domain', 'history', 'map', 'runner']
const BUDGET = 2000

async function run(seconds: number) {
  for (let t = 0; t < seconds; t += DT) await engine.update(DT)
}

function everyTab(what: string) {
  const counts: string[] = []
  for (const tab of TABS) {
    set({ tab })
    const n = countEntities(panel())
    assert.ok(n > 10 && n < BUDGET, `${what} ${tab}: ${n} entities`)
    counts.push(`${tab} ${n}`)
  }
  console.log(`[entities] ${what}: ${counts.join(', ')}`)
}

test('gallery: stations register, record while open, every tab builds', async () => {
  Transform.createOrReplace(engine.PlayerEntity, { position: { x: 48, y: 0, z: 20 }, rotation: Quaternion.Identity() })
  set({ open: true })
  debugRegistry.tracing = true
  spawn(PLAYGROUNDS.find(p => p.id === 'gallery')!)
  const hosts = debugRegistry.hosts()
  assert.equal(hosts.length, 10)
  assert.ok(hosts.every(h => h.id.startsWith('gallery:') && h.entity !== undefined))
  await run(4)
  const aaa = debugRegistry.find('gallery:aaa')!
  assert.ok(aaa.recorder, 'a recorder from its next plan')
  assert.ok(aaa.recorder.lastPlan, 'it planned with it')
  assert.ok((aaa.history?.total ?? 0) > 0)
  assert.equal(aaa.status().lastStatus, 'succeeded')
  selectHost('gallery:aaa', true)
  everyTab('gallery aaa')
  // The complex station's 241-step recursive plan: the tree is windowed.
  selectHost('gallery:complex', true)
  set({ mode: 'verbose' })
  everyTab('gallery complex verbose')
  set({ mode: 'normal' })
  debugRegistry.tracing = false
  despawn()
  assert.equal(debugRegistry.hosts().length, 0)
})

test('a level with three NPCs: picking by entity, every tab builds', async () => {
  debugRegistry.tracing = true
  spawn(PLAYGROUNDS.find(p => p.id === 'squad')!)
  await run(3)
  const hosts = debugRegistry.hosts()
  assert.equal(hosts.length, 3)
  let picked = ''
  debugRegistry.onPick = id => (picked = id)
  debugRegistry.pick(hosts[2].id)
  assert.equal(picked, hosts[2].id)
  assert.equal(debugRegistry.byEntity(hosts[1].entity!)?.id, hosts[1].id)
  for (const h of hosts) {
    assert.ok(h.recorder?.lastPlan, `${h.id} records (levels always do)`)
    selectHost(h.id, true)
    everyTab(h.id)
  }
  despawn()
})

test('Domain Runner: a run becomes a host the tabs read; it never touches a live world', async () => {
  state.runner.domain = 0
  state.runner.world = 0
  runSelected()
  const r = state.runner.result
  assert.ok(r)
  assert.ok(r.run.nodes.length > 0)
  assert.equal(debugRegistry.find(RUNNER_ID)?.recorder, r.recorder)
  selectHost(RUNNER_ID, true)
  everyTab('runner')
  set({ open: false })
})

/** The element with React key `key` in a tree, depth first. */
function find(node: unknown, key: string): { props: Record<string, unknown> } | undefined {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = find(n, key)
      if (hit) return hit
    }
    return undefined
  }
  if (!node || typeof node !== 'object') return undefined
  const el = node as { key?: unknown; props?: Record<string, unknown> & { children?: unknown } }
  if (el.key === key && el.props) return el as { props: Record<string, unknown> }
  return find(el.props?.children, key)
}

const click = (key: string) => {
  const el = find(panel(), key)
  assert.ok(el, `a ${key} button`)
  ;(el.props.onMouseDown as () => void)()
}

test('the header drives the simulation clock: Pause / Run, Step, the time scale', async () => {
  const clock = sceneClock()
  set({ open: true, tab: 'plan' })
  click('pause')
  assert.equal(clock.paused, true)
  const time = clock.time
  await run(0.5)
  assert.equal(clock.time, time, 'paused')
  click('step')
  await run(0.2)
  assert.ok(Math.abs(clock.time - time - clock.stepSeconds) < 1e-9, 'one frame')
  click('x0.25')
  assert.equal(clock.scale, 0.25)
  click('pause')
  assert.equal(clock.paused, false, 'Run')
  await engine.update(0.04)
  assert.ok(Math.abs(clock.time - time - clock.stepSeconds - 0.01) < 1e-9, 'a quarter of the frame')
  click('x1')
  set({ open: false })
})

test('Map tab: every NPC of the level is a dot; a click on a dot selects its host; a zone maps its stations', async () => {
  Transform.createOrReplace(engine.PlayerEntity, { position: { x: 48, y: 0, z: 40 }, rotation: Quaternion.Identity() })
  spawn(PLAYGROUNDS.find(p => p.id === 'crowd')!)
  await run(2)
  set({ open: true, tab: 'map' })
  selectHost(null, false)
  const hosts = debugRegistry.hosts().filter(h => h.pose)
  assert.ok(hosts.length >= 3, `${hosts.length} NPCs`)
  for (const h of hosts) assert.ok(find(panel(), `d-${h.id}`), `${h.id} on the map`)
  click(`d-${hosts[1].id}`)
  assert.equal(state.host, hosts[1].id)
  assert.equal(state.locked, true)
  const route = find(panel(), 'w0')
  assert.ok(route || !hosts[1].pose!()?.route?.length, 'the selected route is drawn')
  console.log(`[entities] map crowd: ${countEntities(panel())}`)
  spawn(PLAYGROUNDS.find(p => p.id === 'gallery')!)
  await run(2)
  const stations = debugRegistry.hosts().filter(h => h.pose)
  assert.equal(stations.length, 10)
  for (const h of stations) assert.ok(find(panel(), `d-${h.id}`), `${h.id} on the map`)
  const n = countEntities(panel())
  assert.ok(n < BUDGET, `${n}`)
  console.log(`[entities] map gallery: ${n}`)
  despawn()
  set({ open: false, tab: 'plan' })
})
