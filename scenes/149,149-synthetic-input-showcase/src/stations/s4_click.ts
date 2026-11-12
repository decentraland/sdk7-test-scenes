import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  ColliderLayer,
  Material,
  pointerEventsSystem,
  InputAction,
  Entity
} from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import * as C from '../constants'
import { createSign, createReadout, createFloorMark, createBox, setBoxColor, COLORS } from '../lib'
import { counters, slog, logEntity, logMark, onReset } from '../state'

export function setupS4Click() {
  const sign = createSign(C.S4_SIGN, 'S4 -- CLICK TARGETS', COLORS.info)
  logEntity('S4 sign', sign)

  const readout = createReadout(C.S4_READOUT, 'no clicks yet')
  logEntity('S4 readout', readout.entity)

  let frame = 0
  engine.addSystem(() => {
    frame++
  })

  function refresh() {
    readout.setText(
      `down/up: ${counters.s4DownUpClicks}  charge: ${counters.s4ChargeCommits} (${counters.s4LastChargeMs}ms)\n` +
        `short-range hits: ${counters.s4ShortHits}  long-range hits: ${counters.s4LongHits}\n` +
        `occluded blocked: ${counters.s4OccludedBlocked}  cleared: ${counters.s4OccludedCleared}\n` +
        `offset-pivot hits: ${counters.s4OffsetHits}  secondary hits: ${counters.s4SecondaryHits}\n` +
        `big/click_at hits: ${counters.s4BigHits}`
    )
  }
  refresh()

  // -----------------------------------------------------------------------------------------
  // Plain down/up button -- registers BOTH event types to prove down-then-up ordering.
  // -----------------------------------------------------------------------------------------
  const btnDownUp = createBox(C.S4_BTN_DOWNUP, Vector3.create(1.2, 1.2, 1.2), COLORS.idle)
  logEntity('S4 plain down/up button', btnDownUp)
  pointerEventsSystem.onPointerDown(
    { entity: btnDownUp, opts: { button: InputAction.IA_POINTER, hoverText: 'Click (down+up)', maxDistance: 16 } },
    () => {
      setBoxColor(btnDownUp, COLORS.active)
      slog('S4-CLICK', `plain button DOWN at frame ${frame}`)
    }
  )
  pointerEventsSystem.onPointerUp(
    { entity: btnDownUp, opts: { button: InputAction.IA_POINTER, hoverText: 'Click (down+up)', maxDistance: 16 } },
    () => {
      setBoxColor(btnDownUp, COLORS.idle)
      counters.s4DownUpClicks++
      slog('S4-CLICK', `plain button UP at frame ${frame} (click #${counters.s4DownUpClicks} complete)`)
      refresh()
    }
  )

  // -----------------------------------------------------------------------------------------
  // Hold-to-charge target -- eventType:down starts the charge, eventType:up commits it.
  // -----------------------------------------------------------------------------------------
  const btnCharge = createBox(C.S4_BTN_CHARGE, Vector3.create(1.2, 1.2, 1.2), COLORS.idle)
  logEntity('S4 hold-to-charge target', btnCharge)
  let chargeStartMs = -1
  pointerEventsSystem.onPointerDown(
    { entity: btnCharge, opts: { button: InputAction.IA_POINTER, hoverText: 'Hold to charge (down)', maxDistance: 16 } },
    () => {
      chargeStartMs = Date.now()
      slog('S4-CLICK', `charge target DOWN at frame ${frame} -- charging started`)
    }
  )
  pointerEventsSystem.onPointerUp(
    { entity: btnCharge, opts: { button: InputAction.IA_POINTER, hoverText: 'Release to commit (up)', maxDistance: 16 } },
    () => {
      if (chargeStartMs < 0) return
      const elapsed = Date.now() - chargeStartMs
      counters.s4LastChargeMs = elapsed
      counters.s4ChargeCommits++
      chargeStartMs = -1
      setBoxColor(btnCharge, COLORS.idle)
      slog('S4-CLICK', `charge target UP at frame ${frame} -- commit #${counters.s4ChargeCommits}, held ${elapsed}ms`)
      refresh()
    }
  )
  engine.addSystem(() => {
    if (chargeStartMs < 0) return
    const t = Math.min(1, (Date.now() - chargeStartMs) / 2000)
    const c = Color4.create(COLORS.idle.r + (COLORS.charge.r - COLORS.idle.r) * t, COLORS.idle.g + (COLORS.charge.g - COLORS.idle.g) * t, COLORS.idle.b + (COLORS.charge.b - COLORS.idle.b) * t, 1)
    setBoxColor(btnCharge, c)
  })

  // -----------------------------------------------------------------------------------------
  // Short-range (maxDistance:3) vs long-range (maxDistance:16) targets, one shared far mark.
  // -----------------------------------------------------------------------------------------
  const btnShort = createBox(C.S4_BTN_SHORT, Vector3.create(1, 1, 1), COLORS.idle)
  logEntity('S4 short-range target (maxDistance:3)', btnShort)
  pointerEventsSystem.onPointerDown(
    { entity: btnShort, opts: { button: InputAction.IA_POINTER, hoverText: 'Short range (3m)', maxDistance: 3 } },
    () => {
      counters.s4ShortHits++
      setBoxColor(btnShort, COLORS.active)
      slog('S4-CLICK', `short-range target hit #${counters.s4ShortHits}`)
      refresh()
    }
  )

  const btnLong = createBox(C.S4_BTN_LONG, Vector3.create(1, 1, 1), COLORS.idle)
  logEntity('S4 long-range target (maxDistance:16)', btnLong)
  pointerEventsSystem.onPointerDown(
    { entity: btnLong, opts: { button: InputAction.IA_POINTER, hoverText: 'Long range (16m)', maxDistance: 16 } },
    () => {
      counters.s4LongHits++
      setBoxColor(btnLong, COLORS.active)
      slog('S4-CLICK', `long-range target hit #${counters.s4LongHits}`)
      refresh()
    }
  )
  createFloorMark(C.S4_FAR_MARK, 'S4: far mark\n(~11m from both -- fails short, hits long)', COLORS.warn)
  logMark('S4 far mark', C.S4_FAR_MARK)

  // -----------------------------------------------------------------------------------------
  // Occluded target -- a plain box parked in front blocks the south approach.
  // -----------------------------------------------------------------------------------------
  const btnOccluded = createBox(C.S4_BTN_OCCLUDED, Vector3.create(1.2, 1.2, 1.2), COLORS.idle)
  logEntity('S4 occluded target', btnOccluded)
  pointerEventsSystem.onPointerDown(
    { entity: btnOccluded, opts: { button: InputAction.IA_POINTER, hoverText: 'Occluded from the south', maxDistance: 16 } },
    () => {
      counters.s4OccludedCleared++
      setBoxColor(btnOccluded, COLORS.active)
      slog('S4-CLICK', `occluded target hit #${counters.s4OccludedCleared} (clear line of sight)`)
      refresh()
    }
  )
  const occluder = createBox(C.S4_OCCLUDER, Vector3.create(1.4, 1.6, 0.4), COLORS.blocked)
  logEntity('S4 occluder box (blocks the south approach)', occluder)
  createFloorMark(C.S4_BLOCKED_MARK, 'S4: stand here\n(blocked shot -- expect blockedBy)', COLORS.blocked)
  logMark('S4 blocked-shot mark', C.S4_BLOCKED_MARK)
  createFloorMark(C.S4_CLEAR_MARK, 'S4: walk here\n(clear shot -- succeeds)', COLORS.active)
  logMark('S4 clear-shot mark', C.S4_CLEAR_MARK)

  // -----------------------------------------------------------------------------------------
  // Offset-pivot target -- the pivot has NO collider; the actual collider is a child entity
  // offset from it, so aiming requires the explicit world x/y/z of the collider, not the pivot.
  // -----------------------------------------------------------------------------------------
  const pivot = engine.addEntity()
  Transform.create(pivot, { position: C.S4_OFFSET_PIVOT })
  MeshRenderer.setSphere(pivot)
  Material.setPbrMaterial(pivot, { albedoColor: COLORS.idle })
  logEntity('S4 offset-pivot (NO collider -- do not aim here)', pivot)

  const offsetCollider = engine.addEntity()
  Transform.create(offsetCollider, { position: C.S4_OFFSET_LOCAL, scale: Vector3.create(0.9, 0.9, 0.9), parent: pivot })
  MeshRenderer.setBox(offsetCollider)
  MeshCollider.setBox(offsetCollider, ColliderLayer.CL_POINTER | ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(offsetCollider, { albedoColor: COLORS.warn })
  const offsetWorld = Vector3.add(C.S4_OFFSET_PIVOT, C.S4_OFFSET_LOCAL)
  logEntity('S4 offset target collider (aim here via explicit x/y/z)', offsetCollider)
  logMark('S4 offset target actual collider world point', offsetWorld)
  pointerEventsSystem.onPointerDown(
    { entity: offsetCollider, opts: { button: InputAction.IA_POINTER, hoverText: 'Offset from pivot -- aim with x/y/z', maxDistance: 16 } },
    () => {
      counters.s4OffsetHits++
      setBoxColor(offsetCollider, COLORS.active)
      slog('S4-CLICK', `offset target hit #${counters.s4OffsetHits}`)
      refresh()
    }
  )

  // -----------------------------------------------------------------------------------------
  // Big, centered click_at target.
  // -----------------------------------------------------------------------------------------
  const btnBig = createBox(C.S4_BIG_TARGET, Vector3.create(2.2, 2.2, 2.2), COLORS.idle)
  logEntity('S4 big click_at target', btnBig)
  pointerEventsSystem.onPointerDown(
    { entity: btnBig, opts: { button: InputAction.IA_POINTER, hoverText: 'Big target for click_at', maxDistance: 16 } },
    () => {
      counters.s4BigHits++
      setBoxColor(btnBig, COLORS.active)
      slog('S4-CLICK', `big target hit #${counters.s4BigHits} (click_at)`)
      refresh()
    }
  )
  createFloorMark(C.S4_BIG_STAND_MARK, 'S4: stand here, look_at the big target,\nthen click_at 0.5,0.5', COLORS.info)
  logMark('S4 big-target stand mark', C.S4_BIG_STAND_MARK)

  // -----------------------------------------------------------------------------------------
  // Secondary-button target.
  // -----------------------------------------------------------------------------------------
  const btnSecondary = createBox(C.S4_BTN_SECONDARY, Vector3.create(1.2, 1.2, 1.2), COLORS.idle)
  logEntity('S4 secondary-button target', btnSecondary)
  pointerEventsSystem.onPointerDown(
    { entity: btnSecondary, opts: { button: InputAction.IA_SECONDARY, hoverText: 'Right-click (secondary)', maxDistance: 16 } },
    () => {
      counters.s4SecondaryHits++
      setBoxColor(btnSecondary, COLORS.active)
      slog('S4-CLICK', `secondary-button target hit #${counters.s4SecondaryHits}`)
      refresh()
    }
  )

  const allBoxes: Entity[] = [btnDownUp, btnCharge, btnShort, btnLong, btnOccluded, offsetCollider, btnBig, btnSecondary]
  onReset(() => {
    for (const box of allBoxes) setBoxColor(box, COLORS.idle)
    chargeStartMs = -1
    refresh()
  })

  slog('S4-CLICK', 'station ready -- try click_entity, click_at, occlusion and range gating')
}
