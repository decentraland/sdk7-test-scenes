import {
  engine,
  Transform,
  TextShape,
  TextAlignMode,
  Billboard,
  BillboardMode,
  CameraModeArea,
  CameraType,
  VirtualCamera,
  MainCamera,
  MeshRenderer,
  Material,
  InputAction,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import * as C from '../constants'
import { createSign, createReadout, createFloorMark, createBox, setBoxColor, COLORS } from '../lib'
import { counters, slog, logEntity, logMark, onReset } from '../state'

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

/**
 * S7's camera-mode area and virtual camera. Set up after S11 so every earlier entity keeps the
 * `crdtEntityId` that MCP_SHOWCASE.md quotes.
 */
export function setupS7CameraExtras() {
  setupCameraModeArea()
  setupVirtualCameraToggle()
}

/**
 * A `CameraModeArea` forcing first person. Inside it the client refuses `set_camera_mode third_person`,
 * and the refusal must name this scene, this entity's crdt id, the forced mode and the area size.
 */
function setupCameraModeArea() {
  const area = engine.addEntity()
  Transform.create(area, { position: C.S7_CMA_CENTER })
  CameraModeArea.create(area, { area: C.S7_CMA_AREA, mode: CameraType.CT_FIRST_PERSON })
  logEntity(`S7 camera-mode area (forces first person; area ${fmtLocal(C.S7_CMA_AREA)})`, area)
  logMark('S7 camera-mode area centre', C.S7_CMA_CENTER)

  // A translucent plate shows the footprint; the volume itself has no collider.
  const plate = engine.addEntity()
  Transform.create(plate, {
    position: Vector3.create(C.S7_CMA_CENTER.x, 0.05, C.S7_CMA_CENTER.z),
    scale: Vector3.create(C.S7_CMA_AREA.x, 0.05, C.S7_CMA_AREA.z)
  })
  MeshRenderer.setBox(plate)
  Material.setPbrMaterial(plate, { albedoColor: Color4.create(0.6, 0.3, 1, 0.5) })

  createSign(Vector3.create(C.S7_CMA_CENTER.x, 3.4, C.S7_CMA_CENTER.z), 'S7: FIRST-PERSON\nCameraModeArea', COLORS.warn)
  createFloorMark(C.S7_CMA_OUTSIDE_MARK, 'S7: outside the area\n(walk west into it)', COLORS.info)
  logMark('S7 camera-mode area outside mark', C.S7_CMA_OUTSIDE_MARK)

  // Counts entries from the player's own position, so the log says when the lock is expected to hold.
  const half = Vector3.scale(C.S7_CMA_AREA, 0.5)
  let inside = false
  engine.addSystem(() => {
    if (!Transform.has(engine.PlayerEntity)) return
    const p = Transform.get(engine.PlayerEntity).position
    const now =
      Math.abs(p.x - C.S7_CMA_CENTER.x) <= half.x &&
      Math.abs(p.z - C.S7_CMA_CENTER.z) <= half.z &&
      p.y >= C.S7_CMA_CENTER.y - half.y &&
      p.y <= C.S7_CMA_CENTER.y + half.y
    if (now === inside) return
    inside = now
    if (inside) {
      counters.s7CmaEnters++
      slog('S7-CAMERA', `player entered the camera-mode area (#${counters.s7CmaEnters}) -- first person forced`)
    } else slog('S7-CAMERA', 'player left the camera-mode area -- camera mode free again')
  })
}

/**
 * A `VirtualCamera` toggle. A click binds the camera above the hub; a second click (or the auto-off)
 * hands the player camera back, which the client blends over ~0.5 s -- the window a `screenshot`
 * used to capture mid-transition.
 */
function setupVirtualCameraToggle() {
  const vcam = engine.addEntity()
  Transform.create(vcam, {
    position: C.S7_VCAM_POSITION,
    rotation: Quaternion.fromLookAt(C.S7_VCAM_POSITION, Vector3.create(C.S7_STAND.x, 1, C.S7_STAND.z))
  })
  VirtualCamera.create(vcam, { defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0.5) } })
  logEntity('S7 virtual camera (above the hub, looking at the stand mark)', vcam)
  logMark('S7 virtual camera position', C.S7_VCAM_POSITION)

  const button = createBox(C.S7_VCAM_BUTTON, Vector3.create(1.2, 1.2, 1.2), COLORS.info)
  logEntity('S7 virtual-camera toggle button', button)
  createFloorMark(C.S7_VCAM_STAND_MARK, 'S7: stand here, look_at the\nvcam button (north of you)', COLORS.info)
  logMark('S7 virtual-camera stand mark', C.S7_VCAM_STAND_MARK)

  let autoOffAt = -1
  const setActive = (active: boolean, why: string) => {
    if (active === counters.s7VcamActive) return
    counters.s7VcamActive = active
    if (active) {
      counters.s7VcamActivations++
      MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: vcam })
      autoOffAt = Date.now() + C.S7_VCAM_AUTO_OFF_SEC * 1000
      slog('S7-CAMERA', `vcam on (#${counters.s7VcamActivations}, ${why}; auto-off in ${C.S7_VCAM_AUTO_OFF_SEC} s)`)
    } else {
      const cam = MainCamera.getMutableOrNull(engine.CameraEntity)
      if (cam) cam.virtualCameraEntity = undefined
      autoOffAt = -1
      slog('S7-CAMERA', `vcam off (${why}) -- the client blends back to the player camera`)
    }
    setBoxColor(button, active ? COLORS.active : COLORS.info)
  }

  pointerEventsSystem.onPointerDown(
    { entity: button, opts: { button: InputAction.IA_POINTER, hoverText: 'Toggle virtual camera', maxDistance: 16 } },
    () => setActive(!counters.s7VcamActive, 'click')
  )

  engine.addSystem(() => {
    if (autoOffAt > 0 && Date.now() >= autoOffAt) setActive(false, 'auto-off')
  })

  onReset(() => setActive(false, 'reset'))
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
