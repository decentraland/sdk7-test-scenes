import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  TextShape,
  VirtualCamera,
  MainCamera,
  InputModifier,
  PointerLock,
  PrimaryPointerInfo,
  pointerEventsSystem,
  InputAction,
  inputSystem,
  PointerEventType
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { setupUi } from './ui'

const CENTER = Vector3.create(8, 1, 8)
const RING_RADIUS = 6
const RING_BOX_COUNT = 10
// Degrees of camera rotation per pixel of PrimaryPointerInfo.screenDelta
const SENSITIVITY = 0.15

let cameraEntity: Entity
let cameraActive = false
let yaw = 0
let pitch = 0

// Live values consumed by the HUD in ui.tsx. Updated from mouseLookSystem using getOrNull reads only,
// so the HUD never triggers a CRDT re-sync by mutating components on every frame.
export const state = {
  screenDelta: { x: 0, y: 0 },
  isPointerLocked: false,
  cameraActive: false,
  yaw: 0,
  pitch: 0
}

export function main() {
  createGround()
  createReferenceRing()
  cameraEntity = createVirtualCamera()
  createToggleBox()

  engine.addSystem(mouseLookSystem)
  engine.addSystem(exitSystem)

  setupUi()
}

function createGround() {
  const ground = engine.addEntity()
  Transform.create(ground, {
    position: Vector3.create(8, 0.01, 8),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0),
    scale: Vector3.create(16, 16, 0.1)
  })
  MeshRenderer.setPlane(ground)
  Material.setBasicMaterial(ground, { diffuseColor: Color4.Gray() })
}

// A ring of colored boxes at varied heights plus cardinal N/E/S/W text markers, so that camera
// rotation driven by mouse-look is easy to read unambiguously.
function createReferenceRing() {
  for (let i = 0; i < RING_BOX_COUNT; i++) {
    const angle = (i / RING_BOX_COUNT) * Math.PI * 2
    const x = CENTER.x + Math.cos(angle) * RING_RADIUS
    const z = CENTER.z + Math.sin(angle) * RING_RADIUS
    const height = 1 + (i % 4) * 0.75

    const box = engine.addEntity()
    Transform.create(box, {
      position: Vector3.create(x, height / 2, z),
      scale: Vector3.create(0.8, height, 0.8)
    })
    MeshRenderer.setBox(box)
    MeshCollider.setBox(box)
    Material.setPbrMaterial(box, {
      albedoColor: Color4.create((i * 0.37) % 1, (i * 0.61) % 1, (i * 0.83) % 1, 1)
    })
  }

  createCardinalMarker('N', Vector3.create(CENTER.x, 3, CENTER.z - RING_RADIUS - 1), 180)
  createCardinalMarker('S', Vector3.create(CENTER.x, 3, CENTER.z + RING_RADIUS + 1), 0)
  createCardinalMarker('E', Vector3.create(CENTER.x + RING_RADIUS + 1, 3, CENTER.z), 270)
  createCardinalMarker('W', Vector3.create(CENTER.x - RING_RADIUS - 1, 3, CENTER.z), 90)
}

function createCardinalMarker(label: string, position: Vector3, facingYaw: number) {
  const marker = engine.addEntity()
  Transform.create(marker, {
    position,
    rotation: Quaternion.fromEulerDegrees(0, facingYaw, 0)
  })
  TextShape.create(marker, {
    text: label,
    fontSize: 6,
    textColor: Color4.White()
  })
}

function createVirtualCamera(): Entity {
  const cam = engine.addEntity()
  Transform.create(cam, {
    position: Vector3.create(CENTER.x, 3, CENTER.z)
  })
  VirtualCamera.create(cam, {
    defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0.5) }
  })
  return cam
}

function createToggleBox() {
  const box = engine.addEntity()
  Transform.create(box, {
    position: Vector3.create(8, 1, 4)
  })
  MeshRenderer.setBox(box)
  MeshCollider.setBox(box)
  Material.setBasicMaterial(box, { diffuseColor: Color4.Green() })

  pointerEventsSystem.onPointerDown(
    {
      entity: box,
      opts: { button: InputAction.IA_POINTER, hoverText: 'Toggle mouse-look camera' }
    },
    () => activateCamera(!cameraActive)
  )
}

export function activateCamera(active: boolean) {
  cameraActive = active
  state.cameraActive = active

  MainCamera.createOrReplace(engine.CameraEntity, {
    virtualCameraEntity: active ? cameraEntity : undefined
  })

  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: active })
  })
}

// THE SHOWCASE: PrimaryPointerInfo.screenDelta keeps reporting raw mouse delta while the pointer is
// locked (renderer-side fix, shipped separately from this scene). We use it to drive virtual camera
// rotation instead of the frozen screenCoordinates/worldRayDirection, which report the screen center
// and center ray while locked.
function mouseLookSystem() {
  const pointerInfo = PrimaryPointerInfo.getOrNull(engine.RootEntity)
  const pointerLock = PointerLock.getOrNull(engine.CameraEntity)

  const dx = pointerInfo?.screenDelta?.x ?? 0
  const dy = pointerInfo?.screenDelta?.y ?? 0
  const isLocked = pointerLock?.isPointerLocked ?? false

  state.screenDelta.x = dx
  state.screenDelta.y = dy
  state.isPointerLocked = isLocked

  if (!cameraActive || !isLocked) return

  yaw += dx * SENSITIVITY
  // NOTE: verify pitch sign in-engine — mouse up should look up, so a negative screenDelta.y
  // (cursor moving toward the top of the screen) must increase pitch.
  pitch = clamp(pitch - dy * SENSITIVITY, -85, 85)

  state.yaw = yaw
  state.pitch = pitch

  Transform.getMutable(cameraEntity).rotation = Quaternion.fromEulerDegrees(pitch, yaw, 0)
}

function exitSystem() {
  if (!cameraActive) return
  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
    activateCamera(false)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
