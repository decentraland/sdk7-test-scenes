import { engine, Transform, MeshRenderer, MeshCollider, Material, ColliderLayer, TriggerArea, triggerAreaEventsSystem } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import * as C from '../constants'
import { createSign, createReadout, createFloorMark, COLORS } from '../lib'
import { counters, slog, logEntity, logMark, onReset } from '../state'

export function setupS2Jump() {
  const sign = createSign(C.S2_SIGN, 'S2 -- JUMP / VERTICAL\nwalk jump:true vs press_input JUMP', COLORS.info)
  logEntity('S2 sign', sign)

  const readout = createReadout(C.S2_READOUT, 'no arrivals yet')
  logEntity('S2 readout', readout.entity)

  const platform = engine.addEntity()
  Transform.create(platform, { position: C.S2_PLATFORM, scale: C.S2_PLATFORM_SCALE })
  MeshRenderer.setBox(platform)
  MeshCollider.setBox(platform, ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER)
  Material.setPbrMaterial(platform, { albedoColor: COLORS.idle })
  logEntity('S2 platform (1.2m -- unsteppable, jumpable)', platform)

  const plate = engine.addEntity()
  Transform.create(plate, { position: C.S2_PLATE, scale: Vector3.create(3, 0.1, 3) })
  MeshRenderer.setBox(plate)
  Material.setPbrMaterial(plate, { albedoColor: COLORS.idle })
  logEntity('S2 pressure plate (visual)', plate)

  // The trigger volume is a separate invisible box 2m tall: a 0.1m-thin slab spans y 1.20-1.30, which the
  // avatar capsule standing on top of it never overlaps, so its TriggerArea would never fire.
  const plateTrigger = engine.addEntity()
  Transform.create(plateTrigger, {
    position: Vector3.create(C.S2_PLATE.x, C.S2_PLATE.y + 1, C.S2_PLATE.z),
    scale: Vector3.create(3, 2, 3)
  })
  TriggerArea.setBox(plateTrigger)
  logEntity('S2 pressure plate (TriggerArea)', plateTrigger)

  createFloorMark(C.S2_GROUND_JUMP_MARK, 'S2: press_input JUMP here\n(global jump, no platform)', COLORS.warn)
  logMark('S2 ground jump mark', C.S2_GROUND_JUMP_MARK)

  const resetPlateColor = () => Material.setPbrMaterial(plate, { albedoColor: COLORS.idle })
  onReset(() => {
    resetPlateColor()
    insidePlate = false
    plateDwell = 0
    arrivalCounted = false
    readout.setText('no arrivals yet')
  })

  // An "arrival" is a landing, not a pass: a jump arc that overshoots the platform crosses the 2m trigger
  // volume mid-air and exits within a couple of frames, while a player who landed stays in it. Count only
  // after the player dwelled inside for a moment.
  const ARRIVAL_DWELL_SEC = 0.4
  let insidePlate = false
  let plateDwell = 0
  let arrivalCounted = false

  function updateReadout() {
    readout.setText(
      `platform arrivals: ${counters.s2PlatformArrivals}\nglobal IA_JUMP presses: ${counters.globalJump} (see S6)`
    )
  }

  triggerAreaEventsSystem.onTriggerEnter(plateTrigger, (result) => {
    if (result.trigger?.entity !== engine.PlayerEntity) return
    insidePlate = true
    plateDwell = 0
    arrivalCounted = false
    Material.setPbrMaterial(plate, { albedoColor: COLORS.active })
  })
  triggerAreaEventsSystem.onTriggerExit(plateTrigger, (result) => {
    if (result.trigger?.entity !== engine.PlayerEntity) return
    if (insidePlate && !arrivalCounted) {
      slog('S2-JUMP', `platform fly-through (${plateDwell.toFixed(2)}s inside) -- not counted as an arrival`)
    }
    insidePlate = false
    resetPlateColor()
  })

  let lastJumpCount = -1
  engine.addSystem((dt: number) => {
    if (insidePlate && !arrivalCounted) {
      plateDwell += dt
      if (plateDwell >= ARRIVAL_DWELL_SEC) {
        arrivalCounted = true
        counters.s2PlatformArrivals++
        slog('S2-JUMP', `platform arrival #${counters.s2PlatformArrivals} -- reached via walk(..., jump:true)`)
        updateReadout()
      }
    }

    if (counters.globalJump !== lastJumpCount) {
      lastJumpCount = counters.globalJump
      updateReadout()
    }
  })

  slog('S2-JUMP', 'station ready -- walk with jump:true to reach the platform; press_input JUMP on the ground plate')
}
