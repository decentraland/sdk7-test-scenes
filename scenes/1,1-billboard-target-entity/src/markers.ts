import { Entity, engine, Material, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

/**
 * Creates a small glowing sphere used to mark the position of a Billboard's targetEntity,
 * so it's easy to see what each demo billboard is pointing at.
 */
export function createTargetMarker(position: Vector3, color: Color4): Entity {
  const marker = engine.addEntity()
  Transform.create(marker, { position, scale: Vector3.create(0.4, 0.4, 0.4) })
  MeshRenderer.setSphere(marker)
  Material.setPbrMaterial(marker, {
    albedoColor: color,
    emissiveColor: color,
    emissiveIntensity: 1
  })
  return marker
}
