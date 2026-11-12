import {
  engine,
  Transform,
  Tween,
  EasingFunction,
  MeshRenderer,
  MeshCollider,
  Material,
  TextShape,
  pointerEventsSystem,
  InputAction,
  Billboard,
  BillboardMode,
  Entity
} from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'

// ─── Tuning ───

const MOVE_THRESHOLD = 0.1 // meters the player must move before we re-aim
const STOP_DISTANCE = 1 // how close (in meters) the cube gets before stopping
const CUBE_SPEED = 3 // meters per second the cube travels while chasing
const MIN_TWEEN_DURATION_MS = 100 // avoids near-zero-duration tweens (Move mode only)
const POINTER_MAX_DISTANCE = 20 // double the SDK default, so the pad is clickable from anywhere

// ─── Colors ───

const COLOR_CONTINUOUS = Color4.create(0.15, 0.8, 0.35, 1) // green -- smooth mode
const COLOR_MOVE = Color4.create(0.95, 0.25, 0.1, 1) // red-orange -- jittery mode
const COLOR_TOGGLE_PAD = Color4.create(0.75, 0.1, 0.85, 1) // magenta

// Which tween mode drives the chase.
// 'continuous' -> Tween.setMoveContinuous: the renderer seeds the start from its OWN live
//                 transform, so re-aiming never snaps the cube backwards.
// 'move'       -> Tween.Mode.Move rebuilt from Transform.get(cube).position: that value is
//                 what the renderer last wrote back over CRDT, so it trails the cube's real
//                 position by the round trip (~1-3 frames). The renderer applies the new
//                 `start` immediately, snapping the cube backwards every re-aim.
type FollowMode = 'continuous' | 'move'

// ─── Helpers ───

function createLabel(text: string, position: Vector3, fontSize = 2): Entity {
  const label = engine.addEntity()
  Transform.create(label, { position })
  TextShape.create(label, {
    text,
    fontSize,
    textColor: Color4.White()
  })
  // BM_Y so the text turns to face the player but stays upright, instead of
  // tilting with the camera the way the BM_ALL default would.
  Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
  return label
}

function createFlatPad(position: Vector3, color: Color4): Entity {
  const pad = engine.addEntity()
  Transform.create(pad, { position, scale: Vector3.create(1.6, 0.2, 1.6) })
  MeshRenderer.setBox(pad)
  MeshCollider.setBox(pad)
  Material.setPbrMaterial(pad, { albedoColor: color })
  return pad
}

export function main() {
  // ─── The follow cube ───
  // Chases the player, re-aiming whenever the player has moved MOVE_THRESHOLD meters.
  // Both modes use the SAME re-aim trigger and the same speed -- the only difference is
  // which kind of tween carries the motion, which is exactly what makes the jitter
  // attributable to the tween mode rather than to how often we re-aim.

  const cube = engine.addEntity()
  const CUBE_START = Vector3.create(3, 0.5, 6)
  const cubeHeight = CUBE_START.y

  Transform.create(cube, { position: CUBE_START })
  MeshRenderer.setBox(cube)
  Material.setPbrMaterial(cube, { albedoColor: COLOR_CONTINUOUS })

  createLabel(
    'FOLLOW CUBE\nThe cube chases you, re-aiming every 0.1m you move.\nClick the magenta pad to switch how it moves.',
    Vector3.create(8, 3.4, 8),
    1.4
  )

  let mode: FollowMode = 'continuous'

  // The player position the currently-running tween is aimed at. `null` means nothing is
  // aimed yet (or the cube just stopped and is waiting for the player to move away again).
  let lastTargetedPlayerPos: Vector3 | null = null

  // ─── Mode switch ───

  const modeLabel = createLabel('', Vector3.create(13, 1.6, 3), 1.2)

  function applyModeVisuals() {
    const isContinuous = mode === 'continuous'
    TextShape.getMutable(modeLabel).text = isContinuous
      ? 'MODE: setMoveContinuous\nsmooth -- renderer keeps its own start\n(click to switch)'
      : 'MODE: Move tween per re-aim\njitters -- rebuilt from a stale start\n(click to switch)'
    Material.setPbrMaterial(cube, { albedoColor: isContinuous ? COLOR_CONTINUOUS : COLOR_MOVE })
  }

  function stopChasing() {
    if (Tween.has(cube)) {
      Tween.deleteFrom(cube)
    }
    lastTargetedPlayerPos = null
  }

  const togglePad = createFlatPad(Vector3.create(13, 0.1, 3), COLOR_TOGGLE_PAD)
  pointerEventsSystem.onPointerDown(
    {
      entity: togglePad,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: 'Switch follow mode',
        maxDistance: POINTER_MAX_DISTANCE
      }
    },
    () => {
      mode = mode === 'continuous' ? 'move' : 'continuous'
      // Drop the in-flight tween so the new mode starts from a clean state.
      stopChasing()
      applyModeVisuals()
    }
  )

  applyModeVisuals()

  // ─── Aiming ───

  // JITTERY: rebuilds a finite Move tween from the cube's last known position. That position
  // came back from the renderer over CRDT and is a few frames old, and the renderer applies
  // the new `start` the moment it receives it -- so the cube jumps back before moving on.
  function aimWithMoveTween(cubePos: Vector3, playerPos: Vector3) {
    const direction = Vector3.normalize(Vector3.subtract(playerPos, cubePos))
    const target = Vector3.subtract(playerPos, Vector3.scale(direction, STOP_DISTANCE))
    target.y = cubeHeight

    const travelDistance = Vector3.distance(cubePos, target)
    const duration = Math.max(MIN_TWEEN_DURATION_MS, (travelDistance / CUBE_SPEED) * 1000)

    Tween.createOrReplace(cube, {
      mode: Tween.Mode.Move({ start: cubePos, end: target }),
      duration,
      easingFunction: EasingFunction.EF_LINEAR
    })
  }

  // SMOOTH: hands the renderer a direction and a speed instead of a start point. Continuous
  // modes take their start from the renderer's own live transform, so replacing this tween
  // mid-motion cannot snap the cube. It has no destination, so the stop check below is what
  // ends the chase.
  function aimWithMoveContinuous(cubePos: Vector3, playerPos: Vector3) {
    const direction = Vector3.subtract(playerPos, cubePos)
    direction.y = 0 // stay on the ground even while the player jumps
    Tween.setMoveContinuous(cube, Vector3.normalize(direction), CUBE_SPEED)
  }

  // ─── Chase system ───

  engine.addSystem(function followPlayerSystem() {
    if (!Transform.has(engine.PlayerEntity)) return

    const rawPlayerPos = Transform.get(engine.PlayerEntity).position
    const playerPos = Vector3.create(rawPlayerPos.x, rawPlayerPos.y, rawPlayerPos.z)

    const rawCubePos = Transform.get(cube).position
    const cubePos = Vector3.create(rawCubePos.x, rawCubePos.y, rawCubePos.z)

    const distanceToPlayer = Vector3.distance(cubePos, playerPos)

    if (distanceToPlayer <= STOP_DISTANCE) {
      // Close enough -- stop wherever the cube currently is and wait for the player to
      // move away again. In continuous mode this is the ONLY thing that stops the cube,
      // so it can drift slightly past STOP_DISTANCE before the removal round-trips.
      stopChasing()
      return
    }

    const movedEnough =
      lastTargetedPlayerPos === null || Vector3.distance(playerPos, lastTargetedPlayerPos) > MOVE_THRESHOLD

    if (!movedEnough) return

    if (mode === 'move') {
      aimWithMoveTween(cubePos, playerPos)
    } else {
      aimWithMoveContinuous(cubePos, playerPos)
    }

    lastTargetedPlayerPos = playerPos
  })
}
