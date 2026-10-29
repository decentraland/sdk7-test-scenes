// Picking and poking a planner host in the scene. Its body gets a pointer-only collider (it blocks neither the player
// nor the NPCs' sight raycasts) and one pointer entry per input: a click selects it in the debugger (the hover line
// says its name and running step), E / F / 1-4 act on it (interact.ts: the map and why). The Explorer lists every
// entry's hover line with its key while the cursor is on the body. 1 works with nothing under the cursor; 2/3 require the debugger panel open.
// One system reads the presses (only in a frame with one) and, 4 times a second, rewrites a hover line whose step
// changed.
import { ColliderLayer, engine, Entity, EntityState, InputAction, inputSystem, MeshCollider, PointerEvents, PointerEventType } from '@dcl/sdk/ecs'
import { sceneClock } from '../htn-planner'
import { dumpText, hoverText, NPC_KEYS, NpcAction, resolvePress } from './interact'
import { goalOf, levelFor, nextLevel } from './overlay'
import { debugRegistry } from './registry'
import { set, setOverlay, state, touch } from './ui/state'

const MAX_DISTANCE = 40 // m
const HOVER_PERIOD = 0.25 // s

export const NPC_INPUT: Record<NpcAction, InputAction> = {
  open: InputAction.IA_PRIMARY,
  replan: InputAction.IA_SECONDARY,
  detail: InputAction.IA_ACTION_3,
  pause: InputAction.IA_ACTION_4,
  step: InputAction.IA_ACTION_5,
  dump: InputAction.IA_ACTION_6
}

/** Pickable bodies and their host ids. */
const bodies = new Map<Entity, string>()
const hovers = new Map<Entity, string>()

const entry = (button: InputAction, hoverText: string) => ({
  eventType: PointerEventType.PET_DOWN,
  eventInfo: { button, hoverText, maxDistance: MAX_DISTANCE, showFeedback: true }
})

/** Make `entity` (a cylinder-ish body) clickable for the debugger, with the debug keys on it. */
export function pickable(entity: Entity, id: string, label: string): void {
  MeshCollider.setCylinder(entity, undefined, undefined, ColliderLayer.CL_POINTER)
  PointerEvents.createOrReplace(entity, {
    pointerEvents: [entry(InputAction.IA_POINTER, `HTN debugger: ${label}`), ...NPC_KEYS.map(k => entry(NPC_INPUT[k.action], k.hint))]
  })
  bodies.set(entity, id)
  hovers.delete(entity)
}

/** The host whose body got this press of `input` this frame. */
function pressedOn(input: InputAction): string | undefined {
  for (const [e, id] of bodies) if (inputSystem.getInputCommand(input, PointerEventType.PET_DOWN, e)) return id
  return undefined
}

/** Do `action` on host `id` (null: everyone). Exported for the tests. */
export function npcAction(action: NpcAction, id: string | null): void {
  const host = id === null ? undefined : debugRegistry.find(id)
  switch (action) {
    case 'open':
      if (!host) return
      if (state.open && state.host === host.id) set({ open: false })
      else debugRegistry.pick(host.id)
      return
    case 'replan':
      host?.replan?.('debug')
      return
    case 'detail':
      if (!host) setOverlay(nextLevel(state.overlay))
      else {
        state.overlayHosts.set(host.id, nextLevel(levelFor(state.overlay, state.overlayHosts, host.id)))
        touch()
      }
      return
    case 'pause':
      if (!state.open) return
      sceneClock().toggle()
      touch()
      return
    case 'step':
      if (!state.open) return
      sceneClock().step()
      touch()
      return
    case 'dump':
      if (host) console.log(dumpText({ id: host.id, label: host.label, domain: host.domain.name, status: host.status(), goal: goalOf(host.recorder), world: host.world }))
      return
  }
}

function forget() {
  for (const e of [...bodies.keys()])
    if (engine.getEntityState(e) === EntityState.Removed) {
      bodies.delete(e)
      hovers.delete(e)
    }
}

/** The hover line of every body: its name and running step, rewritten when that changed. */
function syncHovers() {
  if (bodies.size === 0) return
  const byEntity = new Map(debugRegistry.hosts().map(h => [h.entity, h] as const))
  for (const e of bodies.keys()) {
    const h = byEntity.get(e)
    if (!h) continue
    const s = h.status()
    const text = hoverText(h.label, s.current, s.state)
    if (hovers.get(e) === text) continue
    hovers.set(e, text)
    const click = PointerEvents.getMutableOrNull(e)?.pointerEvents[0]?.eventInfo
    if (click) click.hoverText = text
  }
}

/** The system: clicks and keys on bodies (and 1-3 anywhere), hover lines. */
export function setupPicking(): void {
  let since = HOVER_PERIOD
  engine.addSystem(dt => {
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)) {
      const id = pressedOn(InputAction.IA_POINTER)
      if (id !== undefined) debugRegistry.pick(id)
    }
    for (const k of NPC_KEYS) {
      const input = NPC_INPUT[k.action]
      if (!inputSystem.isTriggered(input, PointerEventType.PET_DOWN)) continue
      const press = resolvePress(k.action, pressedOn(input))
      if (press) npcAction(press.action, press.host)
    }
    since += dt
    if (since < HOVER_PERIOD) return
    since = 0
    forget()
    syncHovers()
  }, undefined, 'htn-picking')
}
