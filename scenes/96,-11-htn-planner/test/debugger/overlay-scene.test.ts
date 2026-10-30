// The in-world overlay on the headless engine, level 9 (crowd, ten guards): a label on every guard's body at each
// level, lines to the step targets, within the entity budget; nothing rewritten while paused; nothing left when off.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Entity, TextShape, Transform } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import { debugRegistry } from '../../src/debugger/registry'
import { GIZMO_BASE, MAX_HOSTS, overlayStats, ROUTE_MAX, setupOverlay } from '../../src/debugger/overlay-scene'
import { selectHost, setOverlay, state } from '../../src/debugger/ui/state'
import { PLAYGROUNDS } from '../../src/playgrounds'
import { despawn, spawn } from '../../src/spawn/spawner'
import { sceneClock } from '../../src/htn-planner'

const DT = 1 / 30

async function run(seconds: number) {
  for (let t = 0; t < seconds; t += DT) await engine.update(DT)
}

/** The overlay label riding on `body`. */
function labelOn(body: number): string | undefined {
  for (const [e, text] of engine.getEntitiesWith(TextShape)) {
    const t = Transform.getOrNull(e as Entity)
    if (t?.parent === body) return text.text
  }
  return undefined
}

test('crowd: a label per guard at every level, lines to targets, in budget; paused: no rewrites; off: nothing', async () => {
  Transform.createOrReplace(engine.PlayerEntity, { position: { x: 48, y: 0, z: 20 }, rotation: Quaternion.Identity() })
  setupOverlay()
  spawn(PLAYGROUNDS.find(p => p.id === 'crowd')!)
  await run(2)
  assert.equal(overlayStats.entities, 0, 'off by default: no entities')
  const hosts = debugRegistry.hosts().filter(h => h.entity !== undefined)
  assert.equal(hosts.length, 10)

  setOverlay('full')
  selectHost(hosts[0].id, true)
  await run(2)
  assert.equal(overlayStats.hosts, 10)
  assert.equal(overlayStats.gizmos, 10, "full: every guard's sense gizmo")
  const budget = (n: number) => (3 + GIZMO_BASE) * n + ROUTE_MAX
  assert.ok(overlayStats.entities <= budget(10) && overlayStats.entities <= budget(MAX_HOSTS), `${overlayStats.entities}`)
  assert.ok(overlayStats.entities > 10, 'labels and some lines')
  for (const h of hosts) {
    const text = labelOn(h.entity!)
    assert.ok(text && text.split('\n').length >= 3, `${h.id}: ${text}`)
    assert.ok(text.includes(h.label))
  }
  console.log(`[overlay] crowd full: ${overlayStats.entities} entities; ${hosts[0].id}: ${JSON.stringify(labelOn(hosts[0].entity!))}`)

  setOverlay('step')
  await run(0.5)
  for (const h of hosts) assert.equal(labelOn(h.entity!)!.split('\n').length, 1, h.id)
  assert.equal(overlayStats.gizmos, 1, "step: the selected guard's gizmo only")
  console.log(`[overlay] crowd step: ${overlayStats.entities} entities`)

  sceneClock().pause()
  await run(0.3)
  const rewrites = overlayStats.rewrites
  await run(1)
  assert.equal(overlayStats.rewrites, rewrites, 'paused: nothing rewritten')
  sceneClock().resume()

  // One guard set apart.
  state.overlayHosts.set(hosts[1].id, 'off')
  setOverlay('step') // a global change clears it again
  assert.equal(state.overlayHosts.size, 0)

  setOverlay('off')
  await run(0.3)
  assert.equal(overlayStats.entities, 0)
  assert.equal(overlayStats.hosts, 0)
  assert.equal(overlayStats.gizmos, 0)
  for (const h of hosts) assert.equal(labelOn(h.entity!), undefined, 'labels removed')
  despawn()
})

/** Metres above the body's feet of the overlay label riding on `body` (the label is scaled back to metres). */
function labelHeight(body: Entity): number | undefined {
  const b = Transform.get(body)
  for (const [e] of engine.getEntitiesWith(TextShape)) {
    const t = Transform.getOrNull(e as Entity)
    if (t?.parent === body) return b.position.y + t.position.y * b.scale.y
  }
  return undefined
}

test('every host with a body says its label height; the gallery and lab stations put it just above the head', async () => {
  Transform.createOrReplace(engine.PlayerEntity, { position: { x: 48, y: 0, z: 30 }, rotation: Quaternion.Identity() })
  setOverlay('full') // the overlay system is set up by the test above
  for (const id of ['crowd', 'squad', 'gallery', 'lab']) {
    spawn(PLAYGROUNDS.find(p => p.id === id)!)
    await run(1)
    const hosts = debugRegistry.hosts().filter(h => h.entity !== undefined)
    assert.ok(hosts.length > 0, id)
    for (const h of hosts) {
      assert.ok(h.overlayHeight !== undefined, `${h.id}: no overlayHeight, the 2.6 m default fits no body here`)
      const y = labelHeight(h.entity as Entity)
      assert.ok(y !== undefined && Math.abs(y - h.overlayHeight!) < 1e-6, `${h.id}: label at ${y}`)
      // The station NPC's head tops out at 1.78 m; its own label is the pad's sign at 4.2 m.
      if (id === 'gallery' || id === 'lab') assert.ok(y! > 1.85 && y! < 2.2, `${h.id}: label at ${y}`)
    }
  }
  setOverlay('off')
  await run(0.3)
  despawn()
})

test('level 12: the stalker\'s gizmo shows its cone, its nose and, with a light around, the lure ring; none off-stage', async () => {
  Transform.createOrReplace(engine.PlayerEntity, { position: { x: 48, y: 0, z: 20 }, rotation: Quaternion.Identity() })
  const spawned = spawn(PLAYGROUNDS.find(p => p.id === 'ambush')!)
  const level = (spawned.built as unknown as { level: { out: boolean; testerLight: string; testerPaused: boolean } }).level
  setOverlay('full')
  await run(0.5)
  assert.equal(overlayStats.gizmos, 0, 'off-stage: nothing to sense with')
  for (let t = 0; t < 10 && !level.out; t += 0.5) await run(0.5)
  await run(0.5)
  assert.equal(overlayStats.gizmos, 1)
  const dark = overlayStats.entities
  level.testerPaused = true
  level.testerLight = 'lit'
  await run(0.5)
  assert.ok(overlayStats.entities >= dark + 6, `the lure ring's arc: ${dark} -> ${overlayStats.entities}`)
  setOverlay('off')
  await run(0.3)
  assert.equal(overlayStats.entities, 0)
  despawn()
})
