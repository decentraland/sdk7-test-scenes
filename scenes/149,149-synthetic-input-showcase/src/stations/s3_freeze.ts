import { engine, Transform, MeshRenderer, Material, TriggerArea, triggerAreaEventsSystem, InputModifier } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import * as C from '../constants'
import { createSign, createReadout, createFloorMark, COLORS } from '../lib'
import { counters, slog, logEntity, logMark, onReset } from '../state'

export function setupS3Freeze() {
  const sign = createSign(
    C.S3_SIGN,
    'S3 -- FREEZE ZONE (InputModifier)\nzone A: full freeze  |  zone B: run disabled',
    COLORS.info
  )
  logEntity('S3 sign', sign)

  const readout = createReadout(C.S3_READOUT, 'modifier: none')
  logEntity('S3 readout', readout.entity)

  const zoneA = engine.addEntity()
  Transform.create(zoneA, { position: C.S3_ZONE_A, scale: C.S3_ZONE_A_SCALE })
  MeshRenderer.setBox(zoneA)
  Material.setPbrMaterial(zoneA, { albedoColor: COLORS.blocked })
  logEntity('S3 zone A floor (full freeze)', zoneA)

  // The visual slab is 0.1m tall, so its trigger volume never overlaps the avatar
  // capsule standing on top of it. Keep the slab visual and put the trigger in a
  // separate, invisible, full-height box sitting on the slab.
  const zoneATrigger = engine.addEntity()
  Transform.create(zoneATrigger, {
    position: Vector3.create(C.S3_ZONE_A.x, 1, C.S3_ZONE_A.z),
    scale: Vector3.create(C.S3_ZONE_A_SCALE.x, 2, C.S3_ZONE_A_SCALE.z)
  })
  TriggerArea.setBox(zoneATrigger)

  const zoneB = engine.addEntity()
  Transform.create(zoneB, { position: C.S3_ZONE_B, scale: C.S3_ZONE_B_SCALE })
  MeshRenderer.setBox(zoneB)
  Material.setPbrMaterial(zoneB, { albedoColor: COLORS.warn })
  logEntity('S3 zone B floor (run disabled only)', zoneB)

  const zoneBTrigger = engine.addEntity()
  Transform.create(zoneBTrigger, {
    position: Vector3.create(C.S3_ZONE_B.x, 1, C.S3_ZONE_B.z),
    scale: Vector3.create(C.S3_ZONE_B_SCALE.x, 2, C.S3_ZONE_B_SCALE.z)
  })
  TriggerArea.setBox(zoneBTrigger)

  createFloorMark(C.S3_ZONE_B_ENTRY_MARK, 'S3: run NORTH from here\n(stays inside zone B for ~1s)', COLORS.warn)
  logMark('S3 zone B entry mark', C.S3_ZONE_B_ENTRY_MARK)

  function updateReadout() {
    readout.setText(
      `modifier: ${counters.s3CurrentModifier}\n` +
        `zone A enters: ${counters.s3ZoneAEnters}\n` +
        `zone B enters: ${counters.s3ZoneBEnters}\n` +
        `zone B: run degrades to jog -- compare a ~1s run burst\n` +
        `inside the corridor against one outside it`
    )
  }

  // Occupancy flags instead of writing the InputModifier from each handler directly: a move_to teleport
  // that crosses both volumes delivers the destination's enter BEFORE the origin's exit, and a stale exit
  // handler would wipe the modifier the enter just installed. Recomputing from current occupancy makes the
  // event order irrelevant.
  let insideZoneA = false
  let insideZoneB = false

  function applyModifierFromOccupancy() {
    if (insideZoneA) {
      counters.s3CurrentModifier = 'zone A: disableAll + disableJump'
      InputModifier.createOrReplace(engine.PlayerEntity, {
        mode: InputModifier.Mode.Standard({ disableAll: true, disableJump: true })
      })
    } else if (insideZoneB) {
      counters.s3CurrentModifier = 'zone B: disableRun only'
      InputModifier.createOrReplace(engine.PlayerEntity, {
        mode: InputModifier.Mode.Standard({ disableRun: true })
      })
    } else {
      InputModifier.deleteFrom(engine.PlayerEntity)
      counters.s3CurrentModifier = 'none'
    }
    updateReadout()
  }

  onReset(() => {
    insideZoneA = false
    insideZoneB = false
    InputModifier.deleteFrom(engine.PlayerEntity)
    updateReadout()
  })

  triggerAreaEventsSystem.onTriggerEnter(zoneATrigger, (result) => {
    if (result.trigger?.entity !== engine.PlayerEntity) return
    insideZoneA = true
    counters.s3ZoneAEnters++
    slog('S3-FREEZE', `zone A entered (#${counters.s3ZoneAEnters}) -- InputModifier disableAll+disableJump applied`)
    applyModifierFromOccupancy()
  })
  triggerAreaEventsSystem.onTriggerExit(zoneATrigger, (result) => {
    if (result.trigger?.entity !== engine.PlayerEntity) return
    insideZoneA = false
    slog('S3-FREEZE', 'zone A exited')
    applyModifierFromOccupancy()
  })

  triggerAreaEventsSystem.onTriggerEnter(zoneBTrigger, (result) => {
    if (result.trigger?.entity !== engine.PlayerEntity) return
    insideZoneB = true
    counters.s3ZoneBEnters++
    slog('S3-FREEZE', `zone B entered (#${counters.s3ZoneBEnters}) -- InputModifier disableRun applied (walk/jog still work)`)
    applyModifierFromOccupancy()
  })
  triggerAreaEventsSystem.onTriggerExit(zoneBTrigger, (result) => {
    if (result.trigger?.entity !== engine.PlayerEntity) return
    insideZoneB = false
    slog('S3-FREEZE', 'zone B exited')
    applyModifierFromOccupancy()
  })

  slog('S3-FREEZE', 'station ready -- walk into zone A (full freeze) then zone B (run-only disabled)')
}
