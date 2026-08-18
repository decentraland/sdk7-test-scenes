import {
  engine,
  Entity,
  Transform,
  VirtualCamera,
  MainCamera,
  InputModifier,
  InputAction,
  inputSystem,
  PointerEventType,
  PointerLock,
  PrimaryPointerInfo
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { onEnterScene, onLeaveScene } from '@dcl/sdk/src/players'

// Camera pivot for free-cam mode: scene center, high enough for a good overview
const PIVOT = Vector3.create(8, 8, 8)
// The engine disables VirtualCamera entities outside parcel bounds. Match these to
// scene.json parcels: this is a 1x1 parcel scene (16x16, height ~log2(n+1)*20 = 20)
const BOUNDS_MIN = Vector3.create(0, 0, 0)
const BOUNDS_MAX = Vector3.create(16, 20, 16)
const BOUNDS_MARGIN = 0.5

const PITCH_SPEED = 60 // deg/s
const YAW_SPEED = 90 // deg/s
const PITCH_MIN = -25
const PITCH_MAX = 80
const PITCH_DEFAULT = 45
const ZOOM_SPEED = 0.5 // zoom fraction/s while following
const RAISE_SPEED = 5 // m/s while free-cam
const MAX_Y_OFFSET = 5
const MIN_FOLLOW_DISTANCE = 1
const MAX_FOLLOW_DISTANCE = 16
const LERP_FACTOR = 0.1
// Degrees of camera rotation per pixel of PrimaryPointerInfo.screenDelta (mouse-look)
const MOUSE_SENSITIVITY = 0.15

// Live values consumed by the HUD in ui.tsx
export const state = {
  active: false,
  followTargetId: null as string | null,
  playerCount: 0,
  isPointerLocked: false
}

// --- Player roster: who is in the scene, so 1/2 can cycle follow targets ---

const playerEntities = new Map<string, Entity>()
let playerIds: string[] = []
let followTargetId: string | null = null

onEnterScene((player) => {
  if (!player) return
  playerIds.push(player.userId)
  playerEntities.set(player.userId, player.entity)
  state.playerCount = playerIds.length
})

onLeaveScene((userId) => {
  if (!userId) return
  playerIds = playerIds.filter((id) => id !== userId)
  playerEntities.delete(userId)
  if (followTargetId === userId) setFollowTarget(null)
  state.playerCount = playerIds.length
})

function setFollowTarget(userId: string | null) {
  followTargetId = userId
  state.followTargetId = userId
}

// Cycle order: free-cam → player 0 → ... → player n-1 → free-cam
function cycleTarget(delta: number) {
  if (playerIds.length === 0) {
    setFollowTarget(null)
    return
  }
  const slots = playerIds.length + 1 // slot -1 is free-cam
  const current = followTargetId ? playerIds.indexOf(followTargetId) : -1
  const next = ((((current + delta + 1) % slots) + slots) % slots) - 1
  setFollowTarget(next === -1 ? null : playerIds[next])
}

// --- Two-entity camera rig: root owns world position + yaw, child owns pitch + orbit offset.
// Splitting yaw and pitch across two Transforms keeps the euler math trivial. ---

let rigRoot: Entity | null = null
let rigCamera: Entity | null = null

let yaw = 0
let pitch = PITCH_DEFAULT
let zoom = 0.5 // 0-1 between MIN and MAX follow distance
let yOffset = 0

export function toggleSpectate() {
  if (state.active) disableSpectate()
  else enableSpectate()
}

function enableSpectate() {
  if (state.active) return
  state.active = true

  yaw = 0
  pitch = PITCH_DEFAULT
  zoom = 0.5
  yOffset = 0
  setFollowTarget(null)

  rigRoot = engine.addEntity()
  Transform.create(rigRoot, {
    position: PIVOT,
    rotation: Quaternion.fromEulerDegrees(0, yaw, 0)
  })

  rigCamera = engine.addEntity()
  Transform.create(rigCamera, {
    parent: rigRoot,
    rotation: Quaternion.fromEulerDegrees(pitch, 0, 0)
  })
  VirtualCamera.create(rigCamera, {})

  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: rigCamera })

  // Freeze the avatar so WASD/E/F drive the camera instead
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: true })
  })

  engine.addSystem(spectateInputSystem)
  engine.addSystem(cameraRigSystem)
}

function disableSpectate() {
  if (!state.active) return
  state.active = false

  // Clear MainCamera BEFORE removing the VirtualCamera entity — otherwise the engine
  // keeps binding to a dead entity and the view falls through to the player's feet
  const mainCamera = MainCamera.getMutableOrNull(engine.CameraEntity)
  if (mainCamera) mainCamera.virtualCameraEntity = undefined

  if (rigCamera) engine.removeEntity(rigCamera)
  if (rigRoot) engine.removeEntity(rigRoot)
  rigCamera = null
  rigRoot = null
  setFollowTarget(null)
  state.isPointerLocked = false

  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: false })
  })

  engine.removeSystem(spectateInputSystem)
  engine.removeSystem(cameraRigSystem)
}

// --- Input: WASD pitch/yaw, mouse-look while pointer is locked, E/F zoom (following)
// or raise/lower (free), 1/2 cycle target ---

function spectateInputSystem(dt: number) {
  // Mouse-look: screenDelta keeps reporting raw mouse deltas while the pointer is locked
  // (same pattern as the 32,20-virtual-camera-mouse-look scene)
  const isLocked = PointerLock.getOrNull(engine.CameraEntity)?.isPointerLocked ?? false
  state.isPointerLocked = isLocked
  if (isLocked) {
    const delta = PrimaryPointerInfo.getOrNull(engine.RootEntity)?.screenDelta
    if (delta) {
      yaw = (yaw + delta.x * MOUSE_SENSITIVITY) % 360
      // delta.y is subtracted so mouse-up tilts the camera up (same sign convention as 32,20)
      pitch = clamp(pitch - delta.y * MOUSE_SENSITIVITY, PITCH_MIN, PITCH_MAX)
    }
  }

  if (inputSystem.isPressed(InputAction.IA_FORWARD)) pitch = clamp(pitch - dt * PITCH_SPEED, PITCH_MIN, PITCH_MAX)
  if (inputSystem.isPressed(InputAction.IA_BACKWARD)) pitch = clamp(pitch + dt * PITCH_SPEED, PITCH_MIN, PITCH_MAX)
  if (inputSystem.isPressed(InputAction.IA_LEFT)) yaw = (yaw - dt * YAW_SPEED) % 360
  if (inputSystem.isPressed(InputAction.IA_RIGHT)) yaw = (yaw + dt * YAW_SPEED) % 360

  if (inputSystem.isPressed(InputAction.IA_PRIMARY)) {
    if (followTargetId) zoom = clamp(zoom - dt * ZOOM_SPEED, 0, 1)
    else yOffset = clamp(yOffset + dt * RAISE_SPEED, -MAX_Y_OFFSET, MAX_Y_OFFSET)
  }
  if (inputSystem.isPressed(InputAction.IA_SECONDARY)) {
    if (followTargetId) zoom = clamp(zoom + dt * ZOOM_SPEED, 0, 1)
    else yOffset = clamp(yOffset - dt * RAISE_SPEED, -MAX_Y_OFFSET, MAX_Y_OFFSET)
  }

  if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) cycleTarget(1)
  if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) cycleTarget(-1)
}

function cameraRigSystem() {
  if (!rigRoot || !rigCamera) return
  const rootTransform = Transform.getMutableOrNull(rigRoot)
  const cameraTransform = Transform.getMutableOrNull(rigCamera)
  if (!rootTransform || !cameraTransform) return

  const followEntity = followTargetId ? playerEntities.get(followTargetId) : undefined
  const followPosition = followEntity ? Transform.getOrNull(followEntity)?.position : undefined

  // Root: lerp toward the follow target (or the free-cam pivot) and slerp yaw
  const targetPosition = followPosition ? Vector3.add(followPosition, Vector3.create(0, 1, 0)) : PIVOT
  rootTransform.position = Vector3.lerp(rootTransform.position, targetPosition, LERP_FACTOR)
  rootTransform.rotation = Quaternion.slerp(rootTransform.rotation, Quaternion.fromEulerDegrees(0, yaw, 0), LERP_FACTOR)

  // Child: slerp pitch
  cameraTransform.rotation = Quaternion.slerp(
    cameraTransform.rotation,
    Quaternion.fromEulerDegrees(pitch, 0, 0),
    LERP_FACTOR
  )

  if (!followPosition) {
    // Free-cam sits on the pivot; E/F move it up/down
    cameraTransform.position = Vector3.lerp(cameraTransform.position, Vector3.create(0, yOffset, 0), LERP_FACTOR)
    return
  }

  // Follow: orbit behind/above the target at the zoomed distance, pulled in so the
  // camera never leaves the scene bounds (pitch is elevation from horizontal)
  const pitchRad = (pitch * Math.PI) / 180
  const orbitDirLocal = Vector3.create(0, Math.sin(pitchRad), -Math.cos(pitchRad))
  let distance = MIN_FOLLOW_DISTANCE + (MAX_FOLLOW_DISTANCE - MIN_FOLLOW_DISTANCE) * zoom

  const margin = Vector3.create(BOUNDS_MARGIN, BOUNDS_MARGIN, BOUNDS_MARGIN)
  const orbitDirWorld = Vector3.rotate(orbitDirLocal, rootTransform.rotation)
  const maxDistance = maxDistanceInBounds(
    rootTransform.position,
    orbitDirWorld,
    Vector3.add(BOUNDS_MIN, margin),
    Vector3.subtract(BOUNDS_MAX, margin)
  )
  distance = Math.min(distance, maxDistance)

  cameraTransform.position = Vector3.lerp(cameraTransform.position, Vector3.scale(orbitDirLocal, distance), LERP_FACTOR)

  // Lerp can lag behind a shrinking bound and leave the camera out of bounds for a
  // few frames — hard clamp the offset length
  const currentLength = Vector3.length(cameraTransform.position)
  if (currentLength > maxDistance && currentLength > 1e-6) {
    cameraTransform.position = Vector3.scale(cameraTransform.position, maxDistance / currentLength)
  }
}

/** Furthest t along origin + t*dir that stays inside the AABB (origin assumed inside) */
function maxDistanceInBounds(origin: Vector3, dir: Vector3, boundsMin: Vector3, boundsMax: Vector3): number {
  let tMax = Number.POSITIVE_INFINITY
  const clampAxis = (o: number, d: number, min: number, max: number) => {
    if (Math.abs(d) < 1e-8) {
      if (o < min || o > max) tMax = 0
      return
    }
    tMax = Math.min(tMax, d > 0 ? (max - o) / d : (min - o) / d)
  }
  clampAxis(origin.x, dir.x, boundsMin.x, boundsMax.x)
  clampAxis(origin.y, dir.y, boundsMin.y, boundsMax.y)
  clampAxis(origin.z, dir.z, boundsMin.z, boundsMax.z)
  return Math.max(0, tMax)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
