import { engine, InputAction, pointerEventsSystem, Entity, PointerLock } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import * as C from '../constants'
import { createSign, createReadout, createFloorMark, createBox, setBoxColor, COLORS } from '../lib'
import { counters, slog, logEntity, logMark, onReset } from '../state'

export function setupS5Hover() {
  const sign = createSign(C.S5_SIGN, 'S5 -- HOVER', COLORS.info)
  logEntity('S5 sign', sign)

  const readout = createReadout(C.S5_READOUT, 'no hovers yet')
  logEntity('S5 readout', readout.entity)

  function refresh() {
    readout.setText(
      `A enters/leaves: ${counters.s5AEnters}/${counters.s5ALeaves}\n` +
        `B enters/leaves: ${counters.s5BEnters}/${counters.s5BLeaves}\n` +
        `C (maxDistance 2) enters/leaves: ${counters.s5CEnters}/${counters.s5CLeaves}`
    )
  }
  refresh()

  const hoverA = createBox(C.S5_HOVER_A, Vector3.create(1, 1, 1), COLORS.idle)
  logEntity('S5 hover target A (short hoverText)', hoverA)
  pointerEventsSystem.onPointerHoverEnter(
    { entity: hoverA, opts: { button: InputAction.IA_POINTER, hoverText: 'Hover A', maxDistance: 16 } },
    () => {
      counters.s5AEnters++
      setBoxColor(hoverA, COLORS.active)
      slog('S5-HOVER', `A: PET_HOVER_ENTER (#${counters.s5AEnters}) hoverText="Hover A"`)
      refresh()
    }
  )
  pointerEventsSystem.onPointerHoverLeave(
    { entity: hoverA, opts: { button: InputAction.IA_POINTER, hoverText: 'Hover A', maxDistance: 16 } },
    () => {
      counters.s5ALeaves++
      setBoxColor(hoverA, COLORS.idle)
      slog('S5-HOVER', `A: PET_HOVER_LEAVE (#${counters.s5ALeaves})`)
      refresh()
    }
  )

  const hoverB = createBox(C.S5_HOVER_B, Vector3.create(1, 1, 1), COLORS.idle)
  logEntity('S5 hover target B (long hoverText)', hoverB)
  const longText = 'Hover B -- this is a deliberately long hover tooltip string to verify hoverText renders and reports fully via hover_entity, even past what a short label would show'
  pointerEventsSystem.onPointerHoverEnter(
    { entity: hoverB, opts: { button: InputAction.IA_POINTER, hoverText: longText, maxDistance: 16 } },
    () => {
      counters.s5BEnters++
      setBoxColor(hoverB, COLORS.active)
      slog('S5-HOVER', `B: PET_HOVER_ENTER (#${counters.s5BEnters}) hoverText(long)`)
      refresh()
    }
  )
  pointerEventsSystem.onPointerHoverLeave(
    { entity: hoverB, opts: { button: InputAction.IA_POINTER, hoverText: longText, maxDistance: 16 } },
    () => {
      counters.s5BLeaves++
      setBoxColor(hoverB, COLORS.idle)
      slog('S5-HOVER', `B: PET_HOVER_LEAVE (#${counters.s5BLeaves})`)
      refresh()
    }
  )

  const hoverC = createBox(C.S5_HOVER_C, Vector3.create(1, 1, 1), COLORS.idle)
  logEntity('S5 hover target C (maxDistance:2, distance-gated)', hoverC)
  pointerEventsSystem.onPointerHoverEnter(
    { entity: hoverC, opts: { button: InputAction.IA_POINTER, hoverText: 'Close-range only (2m)', maxDistance: 2 } },
    () => {
      counters.s5CEnters++
      setBoxColor(hoverC, COLORS.active)
      slog('S5-HOVER', `C: PET_HOVER_ENTER (#${counters.s5CEnters}) -- only reachable within 2m`)
      refresh()
    }
  )
  pointerEventsSystem.onPointerHoverLeave(
    { entity: hoverC, opts: { button: InputAction.IA_POINTER, hoverText: 'Close-range only (2m)', maxDistance: 2 } },
    () => {
      counters.s5CLeaves++
      setBoxColor(hoverC, COLORS.idle)
      slog('S5-HOVER', `C: PET_HOVER_LEAVE (#${counters.s5CLeaves})`)
      refresh()
    }
  )
  createFloorMark(C.S5_HOVER_C_NEAR_MARK, 'S5: near mark (~1.8m)\nhover C should succeed', COLORS.active)
  logMark('S5 hover-C near mark', C.S5_HOVER_C_NEAR_MARK)
  createFloorMark(C.S5_HOVER_C_FAR_MARK, 'S5: far mark (~5m)\nhover C should miss (out of range)', COLORS.warn)
  logMark('S5 hover-C far mark', C.S5_HOVER_C_FAR_MARK)

  const allBoxes: Entity[] = [hoverA, hoverB, hoverC]
  onReset(() => {
    for (const box of allBoxes) setBoxColor(box, COLORS.idle)
    refresh()
  })

  slog('S5-HOVER', 'station ready -- hover_entity on A/B/C to observe PET_HOVER_ENTER/LEAVE and hoverText')
}

/**
 * Pointer-lock toggle, for `get_reticle`: with the cursor free the reticle ray goes through wherever the
 * OS cursor rests, which no driver controls; locked, it goes through the screen centre that `look_at`
 * aims. The scene can only REQUEST the lock -- the client may still release it (Esc). Set up after S11
 * so every earlier entity keeps the `crdtEntityId` that MCP_SHOWCASE.md quotes.
 */
export function setupS5PointerLock() {
  PointerLock.createOrReplace(engine.CameraEntity, { isPointerLocked: false })
  const lockButton = createBox(C.S5_LOCK_BUTTON, Vector3.create(1.2, 1.2, 1.2), COLORS.info)
  logEntity('S5 pointer-lock toggle (requests/releases the cursor lock, for get_reticle)', lockButton)
  createFloorMark(C.S5_LOCK_APPROACH_MARK, 'S5: stand here, look_at the\nlock button (south of you)', COLORS.info)
  logMark('S5 pointer-lock approach mark', C.S5_LOCK_APPROACH_MARK)
  const setLockRequested = (v: boolean, why: string) => {
    counters.s5PointerLockRequested = v
    PointerLock.getMutable(engine.CameraEntity).isPointerLocked = v
    setBoxColor(lockButton, v ? COLORS.active : COLORS.info)
    slog('S5-HOVER', `pointer lock ${v ? 'REQUESTED' : 'released'} (${why})`)
  }
  pointerEventsSystem.onPointerDown(
    { entity: lockButton, opts: { button: InputAction.IA_POINTER, hoverText: 'Toggle cursor lock', maxDistance: 16 } },
    () => setLockRequested(!counters.s5PointerLockRequested, 'click')
  )
  PointerLock.onChange(engine.CameraEntity, (lock) => {
    slog('S5-HOVER', `client pointer lock is now ${lock?.isPointerLocked ? 'LOCKED' : 'free'}`)
  })

  onReset(() => {
    if (counters.s5PointerLockRequested) setLockRequested(false, 'reset')
  })

  slog('S5-HOVER', 'pointer-lock toggle ready -- lock, look_at a target, get_reticle, then unlock')
}
