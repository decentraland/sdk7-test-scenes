import { engine, Transform, TextShape, TextAlignMode, Billboard, BillboardMode } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import * as C from '../constants'
import { createSign, createReadout, createFloorMark, COLORS } from '../lib'
import { counters, slog, logEntity, logMark } from '../state'

type Marker = { label: string; pos: Vector3; counterKey: 'S7_L' | 'S7_R' | 'S7_U' | 'S7_D' }

export function setupS7Camera() {
  const sign = createSign(Vector3.create(16, 5.2, 16), 'S7 -- CAMERA LOOK', COLORS.info)
  logEntity('S7 sign', sign)

  const readout = createReadout(C.S7_READOUT, 'booting...')
  logEntity('S7 readout', readout.entity)

  createFloorMark(C.S7_STAND, 'S7: stand here', COLORS.info)
  logMark('S7 stand mark', C.S7_STAND)

  const markers: Marker[] = [
    { label: 'MARKER-L (left)', pos: C.S7_MARKER_LEFT, counterKey: 'S7_L' },
    { label: 'MARKER-R (right)', pos: C.S7_MARKER_RIGHT, counterKey: 'S7_R' },
    { label: 'MARKER-U (up)', pos: C.S7_MARKER_UP, counterKey: 'S7_U' },
    { label: 'MARKER-D (down)', pos: C.S7_MARKER_DOWN, counterKey: 'S7_D' }
  ]

  const markerEntities = markers.map((m) => {
    const e = engine.addEntity()
    Transform.create(e, { position: m.pos })
    TextShape.create(e, {
      text: `${m.label}\n${fmtLocal(m.pos)}`,
      fontSize: 2,
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })
    Billboard.create(e, { billboardMode: BillboardMode.BM_Y })
    logEntity(`S7 ${m.label}`, e)
    logMark(`S7 ${m.label} aim point`, m.pos)
    return e
  })

  const wasAimed = { S7_L: false, S7_R: false, S7_U: false, S7_D: false }

  let frame = 0
  engine.addSystem(() => {
    frame++
    if (!Transform.has(engine.CameraEntity)) return
    const camTransform = Transform.get(engine.CameraEntity)
    const camPos = camTransform.position
    const forward = Vector3.rotate(Vector3.Forward(), camTransform.rotation)
    const euler = Quaternion.toEulerAngles(camTransform.rotation)

    for (let i = 0; i < markers.length; i++) {
      const m = markers[i]
      const toMarker = Vector3.normalize(Vector3.subtract(m.pos, camPos))
      const dot = Vector3.dot(forward, toMarker)
      const angleDeg = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI
      // Hysteresis: a tight cone to ENTER, a wider one to leave. Without the gap the settling
      // third-person boom drifts back across a single threshold and the station flaps -- one aim
      // logging enter/leave/enter and leaving the counter's parity wrong (see constants.ts).
      const aimed = wasAimed[m.counterKey]
        ? angleDeg <= C.S7_ANGLE_RELEASE_DEG
        : angleDeg <= C.S7_ANGLE_TOLERANCE_DEG

      if (aimed && !wasAimed[m.counterKey]) {
        wasAimed[m.counterKey] = true
        bumpCounter(m.counterKey)
        slog('S7-CAMERA', `${m.label} entered aim (angle ${angleDeg.toFixed(1)} deg)`)
      } else if (!aimed && wasAimed[m.counterKey]) {
        wasAimed[m.counterKey] = false
        slog('S7-CAMERA', `${m.label} left aim (angle ${angleDeg.toFixed(1)} deg)`)
      }
    }

    if (frame % 6 === 0) {
      readout.setText(
        `camera pos: (${camPos.x.toFixed(1)}, ${camPos.y.toFixed(1)}, ${camPos.z.toFixed(1)})\n` +
          `yaw: ${euler.y.toFixed(1)}  pitch: ${euler.x.toFixed(1)}\n` +
          `L:${counters.s7MarkerLeftHits} R:${counters.s7MarkerRightHits} U:${counters.s7MarkerUpHits} D:${counters.s7MarkerDownHits}`
      )
    }
  })

  slog('S7-CAMERA', 'station ready -- camera_look or look_at at each marker world point (see [INIT] MARK lines)')
}

function bumpCounter(key: 'S7_L' | 'S7_R' | 'S7_U' | 'S7_D') {
  if (key === 'S7_L') counters.s7MarkerLeftHits++
  if (key === 'S7_R') counters.s7MarkerRightHits++
  if (key === 'S7_U') counters.s7MarkerUpHits++
  if (key === 'S7_D') counters.s7MarkerDownHits++
}

function fmtLocal(v: Vector3): string {
  return `(${v.x}, ${v.y}, ${v.z})`
}
