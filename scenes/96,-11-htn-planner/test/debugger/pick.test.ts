// Poking an NPC in the scene (src/debugger/pick.ts) on the headless engine, level 8 (squad): every body carries a
// click and the six debug keys with their hover lines, the click's line follows the running step, and each key's
// action does what the map says.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engine, Entity, InputAction, PointerEvents } from '@dcl/sdk/ecs'
import { debugRegistry } from '../../src/debugger/registry'
import { NPC_INPUT, npcAction, setupPicking } from '../../src/debugger/pick'
import { NPC_KEYS } from '../../src/debugger/interact'
import { set, setOverlay, state } from '../../src/debugger/ui/state'
import { PLAYGROUNDS } from '../../src/playgrounds'
import { despawn, spawn } from '../../src/spawn/spawner'
import { sceneClock } from '../../src/htn-planner'

const DT = 1 / 30

async function run(seconds: number) {
  for (let t = 0; t < seconds; t += DT) await engine.update(DT)
}

test('squad: a click and six keys on every body; hover follows the step; each key acts', async () => {
  setupPicking()
  spawn(PLAYGROUNDS.find(p => p.id === 'squad')!)
  await run(2)
  const hosts = debugRegistry.hosts().filter(h => h.entity !== undefined)
  assert.equal(hosts.length, 3)
  const h = hosts[0]
  const pe = PointerEvents.get(h.entity! as Entity).pointerEvents
  assert.deepEqual(
    pe.map(p => p.eventInfo?.button),
    [InputAction.IA_POINTER, ...NPC_KEYS.map(k => NPC_INPUT[k.action])]
  )
  assert.deepEqual(pe.slice(1).map(p => p.eventInfo?.hoverText), NPC_KEYS.map(k => k.hint))
  const s = h.status()
  assert.equal(pe[0].eventInfo?.hoverText, `${h.label}: ${s.current || s.state}`.slice(0, 60))

  // E opens the debugger on it, E again closes it.
  let picked = ''
  debugRegistry.onPick = id => {
    picked = id
    set({ open: true, host: id })
  }
  npcAction('open', h.id)
  assert.equal(picked, h.id)
  npcAction('open', h.id)
  assert.equal(state.open, false)

  // F: it replans, for 'debug'.
  npcAction('replan', h.id)
  await run(0.2)
  const last = h.history!.toArray().reverse().find(e => e.event.type === 'replan')
  assert.equal(last && last.event.type === 'replan' && last.event.reason, 'debug')

  // 1 on it: its own level; 1 anywhere: everyone's, its own forgotten.
  setOverlay('off')
  npcAction('detail', h.id)
  assert.equal(state.overlayHosts.get(h.id), 'step')
  npcAction('detail', null)
  assert.equal(state.overlay, 'step')
  assert.equal(state.overlayHosts.size, 0)
  setOverlay('off')

  // Closed debugger must not let ordinary scene keys pause or step the simulation.
  const clock = sceneClock()
  set({ open: false })
  npcAction('pause', null)
  assert.equal(clock.paused, false, 'closed debugger ignores pause')
  npcAction('step', h.id)
  assert.equal(clock.paused, false, 'closed debugger ignores step even while pointing at an NPC')

  // With the debugger open, 2 pauses and runs, 3 steps one frame.
  set({ open: true })
  npcAction('pause', null)
  assert.equal(clock.paused, true)
  const t0 = clock.time
  npcAction('step', null)
  await run(0.2)
  assert.ok(Math.abs(clock.time - t0 - clock.stepSeconds) < 1e-9, 'one frame')
  npcAction('pause', null)
  assert.equal(clock.paused, false)

  // 4: its world and plan on the console.
  const logged: string[] = []
  const log = console.log
  console.log = (...a: unknown[]) => void logged.push(a.join(' '))
  try {
    npcAction('dump', h.id)
    npcAction('dump', null)
  } finally {
    console.log = log
  }
  assert.equal(logged.length, 1, 'nothing without an NPC')
  assert.ok(logged[0].startsWith(`[htn-debug] ${h.id}`) && logged[0].includes('world: '), logged[0])
  despawn()
})
