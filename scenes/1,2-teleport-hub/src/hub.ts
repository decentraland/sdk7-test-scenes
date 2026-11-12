import { Billboard, BillboardMode, InputAction, Material, MeshCollider, MeshRenderer, TextShape, Transform, engine, pointerEventsSystem } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

import { DESTINATIONS, Destination, TEST_SCENES_WORLD } from './destinations'
import { teleportToDestination } from './teleport'

/** Base parcel of this scene, shown on the sign so a traveller can get back. */
const HUB_PARCEL = '1,2'

const CENTER = Vector3.create(8, 0, 8)
const RING_RADIUS = 5.5
const PORTAL_HEIGHT = 3

/** Cycled over the ring so neighbouring portals never share a colour. */
const PORTAL_COLORS = ['#4f8cff', '#38c9a5', '#ffb547', '#ff5f8f', '#a86bff', '#5fd0ff'].map(Color3.fromHexString)

export function setupHub() {
  createPlatform()
  createSign()

  DESTINATIONS.forEach((destination, index) => {
    const angle = (index / DESTINATIONS.length) * Math.PI * 2
    createPortal(destination, angle, PORTAL_COLORS[index % PORTAL_COLORS.length])
  })
}

function createPlatform() {
  const platform = engine.addEntity()
  Transform.create(platform, { position: Vector3.create(CENTER.x, 0.05, CENTER.z), scale: Vector3.create(15.6, 0.1, 15.6) })
  MeshRenderer.setBox(platform)
  MeshCollider.setBox(platform)
  Material.setPbrMaterial(platform, { albedoColor: Color4.create(0.09, 0.1, 0.16, 1) })
}

function createSign() {
  const sign = engine.addEntity()
  Transform.create(sign, { position: Vector3.create(CENTER.x, 3.2, CENTER.z) })
  TextShape.create(sign, {
    text: `TELEPORT HUB\n${TEST_SCENES_WORLD}\n\nclick a portal to travel\n\nback here: /goto ${TEST_SCENES_WORLD}/${HUB_PARCEL}`,
    fontSize: 3,
    textColor: Color4.White()
  })
  Billboard.create(sign, { billboardMode: BillboardMode.BM_Y })

  const pedestal = engine.addEntity()
  Transform.create(pedestal, { position: Vector3.create(CENTER.x, 0.6, CENTER.z), scale: Vector3.create(2, 1.2, 2) })
  MeshRenderer.setBox(pedestal)
  MeshCollider.setBox(pedestal)
  Material.setPbrMaterial(pedestal, { albedoColor: Color4.create(0.16, 0.18, 0.28, 1) })
}

function createPortal(destination: Destination, angle: number, color: Color3) {
  const position = Vector3.create(CENTER.x + Math.sin(angle) * RING_RADIUS, PORTAL_HEIGHT / 2, CENTER.z + Math.cos(angle) * RING_RADIUS)

  const portal = engine.addEntity()
  Transform.create(portal, {
    position,
    scale: Vector3.create(1.6, PORTAL_HEIGHT, 0.3),
    // Face the centre of the ring, where the player spawns — at the portal's own height, so the
    // pillar turns without tilting.
    rotation: Quaternion.fromLookAt(position, Vector3.create(CENTER.x, position.y, CENTER.z))
  })
  MeshRenderer.setBox(portal)
  MeshCollider.setBox(portal)
  Material.setPbrMaterial(portal, { albedoColor: Color4.fromColor3(color), emissiveColor: color, emissiveIntensity: 0.6 })

  pointerEventsSystem.onPointerDown(
    {
      entity: portal,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: `Teleport to ${destination.title} (${destination.x},${destination.y})`
      }
    },
    () => teleportToDestination(destination)
  )

  const label = engine.addEntity()
  Transform.create(label, { position: Vector3.create(position.x, PORTAL_HEIGHT + 0.6, position.z) })
  TextShape.create(label, {
    text: `${destination.title}\n${destination.x},${destination.y}`,
    fontSize: 1.6,
    textColor: Color4.White()
  })
  Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
}
