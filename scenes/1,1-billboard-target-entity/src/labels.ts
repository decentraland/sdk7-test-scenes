import { Billboard, Entity, engine, Material, MeshRenderer, TextShape, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'

/**
 * Creates a floating description sign. It always faces the camera (default Billboard
 * behavior, no targetEntity) so it stays readable regardless of where the player stands.
 * This is informational text, separate from the billboard entities under test.
 */
export function createInfoSign(position: Vector3, text: string): Entity {
  const sign = engine.addEntity()
  Transform.create(sign, { position })
  Billboard.create(sign)
  TextShape.create(sign, {
    text,
    fontSize: 2,
    textColor: Color4.create(1, 1, 1, 1),
    outlineWidth: 0.15,
    outlineColor: Color3.create(0, 0, 0)
  })
  return sign
}

export type BillboardCardOptions = {
  targetEntity?: Entity
  billboardMode?: number
}

/**
 * Creates the visual "card" that is the actual subject under test: a colored backing panel
 * plus a text label, both parented to a single entity that carries the Billboard component
 * being exercised. Rotating the parent (via Billboard) rotates the whole card.
 */
export function createBillboardCard(position: Vector3, label: string, color: Color4, options: BillboardCardOptions): Entity {
  const card = engine.addEntity()
  Transform.create(card, { position })
  Billboard.create(card, options)

  const backing = engine.addEntity()
  Transform.create(backing, { parent: card, scale: Vector3.create(1.6, 1, 0.05) })
  MeshRenderer.setBox(backing)
  Material.setPbrMaterial(backing, {
    albedoColor: color,
    emissiveColor: color,
    emissiveIntensity: 0.5,
    metallic: 0,
    roughness: 0.6
  })

  const text = engine.addEntity()
  Transform.create(text, { parent: card, position: Vector3.create(0, 0, -0.04) })
  TextShape.create(text, {
    text: label,
    fontSize: 3,
    textColor: Color4.create(1, 1, 1, 1),
    outlineWidth: 0.2,
    outlineColor: Color3.create(0, 0, 0)
  })

  return card
}
