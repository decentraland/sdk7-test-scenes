import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  TextShape,
  pointerEventsSystem,
  InputAction
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { toggleSpectate } from './spectate'
import { setupUi } from './ui'

const CENTER = Vector3.create(8, 1, 8)
const RING_RADIUS = 6
const RING_BOX_COUNT = 10

export function main() {
  createGround()
  createReferenceRing()
  createToggleBox()
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

// A ring of colored boxes at varied heights plus cardinal N/E/S/W text markers, so that
// spectator camera yaw/pitch/zoom movement is easy to read unambiguously
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
      opts: { button: InputAction.IA_POINTER, hoverText: 'Toggle spectate mode' }
    },
    () => toggleSpectate()
  )
}
