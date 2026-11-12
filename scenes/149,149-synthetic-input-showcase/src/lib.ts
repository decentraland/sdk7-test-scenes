import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  TextShape,
  TextAlignMode,
  Billboard,
  BillboardMode,
  ColliderLayer
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'

/** A station title board: floating, camera-facing (Y-only) text with a colored backing plate. */
export function createSign(position: Vector3, text: string, color: Color4 = Color4.White()): Entity {
  const sign = engine.addEntity()
  Transform.create(sign, { position })
  TextShape.create(sign, {
    text,
    fontSize: 3,
    textColor: color,
    outlineColor: Color4.Black(),
    outlineWidth: 0.15,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
  Billboard.create(sign, { billboardMode: BillboardMode.BM_Y })
  return sign
}

/** A live-updating readout board. Returns the entity plus a setter that mutates its text. */
export function createReadout(position: Vector3, initial: string): { entity: Entity; setText: (t: string) => void } {
  const entity = engine.addEntity()
  Transform.create(entity, { position })
  TextShape.create(entity, {
    text: initial,
    fontSize: 1.6,
    textColor: Color4.Yellow(),
    outlineColor: Color4.Black(),
    outlineWidth: 0.2,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
    textWrapping: true,
    width: 6,
    height: 3
  })
  Billboard.create(entity, { billboardMode: BillboardMode.BM_Y })
  let last = initial
  return {
    entity,
    setText: (t: string) => {
      if (t === last) return // avoid redundant CRDT writes when nothing changed
      last = t
      TextShape.getMutable(entity).text = t
    }
  }
}

/** A flat, non-interactive floor mark with a label -- used for "stand here" spots. */
export function createFloorMark(position: Vector3, label: string, color: Color4 = Color4.create(0.2, 0.6, 1, 1)): Entity {
  const mark = engine.addEntity()
  Transform.create(mark, { position, scale: Vector3.create(1.6, 0.05, 1.6) })
  MeshRenderer.setCylinder(mark)
  Material.setPbrMaterial(mark, {
    albedoColor: color,
    emissiveColor: Color3.create(color.r, color.g, color.b),
    emissiveIntensity: 0.4
  })

  const labelEntity = engine.addEntity()
  Transform.create(labelEntity, { position: Vector3.create(position.x, position.y + 0.9, position.z) })
  TextShape.create(labelEntity, {
    text: label,
    fontSize: 1.4,
    textColor: Color4.White(),
    outlineColor: Color4.Black(),
    outlineWidth: 0.2,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
  Billboard.create(labelEntity, { billboardMode: BillboardMode.BM_Y })
  return mark
}

/** A simple clickable/collidable box with a solid color. */
export function createBox(position: Vector3, scale: Vector3, color: Color4): Entity {
  const box = engine.addEntity()
  Transform.create(box, { position, scale })
  MeshRenderer.setBox(box)
  MeshCollider.setBox(box, ColliderLayer.CL_POINTER | ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(box, { albedoColor: color })
  return box
}

/** Sets a box's albedo (and matching emissive) color -- the standard "reacted" visual state change. */
export function setBoxColor(entity: Entity, color: Color4, emissive = true) {
  Material.setPbrMaterial(entity, {
    albedoColor: color,
    emissiveColor: emissive ? Color3.create(color.r, color.g, color.b) : Color3.Black(),
    emissiveIntensity: emissive ? 0.6 : 0
  })
}

export const COLORS = {
  idle: Color4.create(0.55, 0.55, 0.6, 1),
  active: Color4.create(0.2, 1, 0.4, 1),
  blocked: Color4.create(1, 0.2, 0.2, 1),
  warn: Color4.create(1, 0.65, 0, 1),
  info: Color4.create(0.2, 0.6, 1, 1),
  charge: Color4.create(1, 0.85, 0.2, 1)
}
