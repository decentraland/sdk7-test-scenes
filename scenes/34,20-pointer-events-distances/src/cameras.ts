import {
  engine,
  Entity,
  Transform,
  VirtualCamera,
  MainCamera,
  InputAction,
  PointerEventType,
  inputSystem
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'

// Rules 2 and 3 (camera-distance based) are unobservable with the default
// third-person camera because it trails the avatar at a fixed offset, so
// player distance and camera distance move together. These virtual cameras
// decouple the two so the camera-distance rule can be proven independently.

export type SceneCameraMode = 'DEFAULT' | 'NEAR' | 'FAR'

const CUBE_ROW_LOOK_AT = Vector3.create(3, 1.6, 8)

let currentMode: SceneCameraMode = 'DEFAULT'
let nearCameraEntity: Entity
let farCameraEntity: Entity

export function getCameraMode(): SceneCameraMode {
  return currentMode
}

function spawnVirtualCamera(position: Vector3, fov: number): Entity {
  const cam = engine.addEntity()
  Transform.create(cam, {
    position,
    rotation: Quaternion.fromLookAt(position, CUBE_ROW_LOOK_AT)
  })
  VirtualCamera.create(cam, { fov })
  return cam
}

function cycleCamera() {
  const mainCamera = MainCamera.getMutableOrNull(engine.CameraEntity)
  if (!mainCamera) return

  if (currentMode === 'DEFAULT') {
    currentMode = 'NEAR'
    mainCamera.virtualCameraEntity = nearCameraEntity
  } else if (currentMode === 'NEAR') {
    currentMode = 'FAR'
    mainCamera.virtualCameraEntity = farCameraEntity
  } else {
    currentMode = 'DEFAULT'
    mainCamera.virtualCameraEntity = undefined
  }

  console.log(`[pointer-events-distances] camera mode -> ${currentMode}`)
}

export function setupCameras() {
  // NEAR: pinned ~6.5m from the cube row, comfortably under the 10m camera
  // thresholds on lanes z=7 and z=9 no matter where the avatar walks.
  // fov 75 (vertical) gives a ~54deg horizontal half-angle, which covers the
  // 45deg to the outermost lane -- the whole 14m row (z 1..15) stays in frame
  // without the fisheye distortion a much wider fov would introduce.
  nearCameraEntity = spawnVirtualCamera(Vector3.create(10, 2.5, 8), 75)

  // FAR: pinned ~16.6m from the cube row, comfortably OVER the 10m camera
  // thresholds, so the camera arm of rules 2 and 3 fails here.
  farCameraEntity = spawnVirtualCamera(Vector3.create(20, 4, 8), 60)

  engine.addSystem(() => {
    if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) {
      cycleCamera()
    }
  })
}
