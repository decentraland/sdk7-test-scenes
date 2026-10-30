// Scene props for the demo zones: floors, walls, signs and click buttons. Not part of the library.
import {
  Billboard,
  BillboardMode,
  engine,
  Entity,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  pointerEventsSystem,
  TextAlignMode,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { playerTargets, TargetSample } from '../htn-planner'

export type Rgb = { r: number; g: number; b: number }

/** The player as a target only while inside the zone rectangle, so the spawn and the other zones are safe. */
export function playerInside(minX: number, maxX: number, minZ: number, maxZ: number): () => TargetSample[] {
  return () => playerTargets().filter(t => t.position.x >= minX && t.position.x <= maxX && t.position.z >= minZ && t.position.z <= maxZ)
}

export function paint(entity: Entity, c: Rgb, emissive = 0) {
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(c.r, c.g, c.b, 1),
    emissiveColor: Color3.create(c.r, c.g, c.b),
    emissiveIntensity: emissive,
    roughness: 1,
    metallic: 0
  })
}

/** A box with a physics collider (blocks the player and the guards' raycast sight). */
export function wall(center: Vector3, size: Vector3, color: Rgb = { r: 0.45, g: 0.45, b: 0.5 }, parent?: Entity): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: center, scale: size, parent })
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e)
  paint(e, color)
  return e
}

/** A flat coloured floor patch marking a zone. */
export function floor(center: Vector3, sizeX: number, sizeZ: number, color: Rgb, parent?: Entity, height = 0.01): Entity {
  const e = engine.addEntity()
  Transform.create(e, {
    parent,
    position: Vector3.create(center.x, height, center.z),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0),
    scale: Vector3.create(sizeX, sizeZ, 1)
  })
  MeshRenderer.setPlane(e)
  paint(e, color)
  return e
}

/** World text; `billboard` turns it to the camera. */
export function sign(position: Vector3, text: string, opts: { size?: number; billboard?: boolean; yaw?: number; parent?: Entity } = {}): Entity {
  const e = engine.addEntity()
  Transform.create(e, {
    position,
    rotation: Quaternion.fromEulerDegrees(0, opts.yaw ?? 0, 0),
    parent: opts.parent
  })
  TextShape.create(e, {
    text,
    fontSize: opts.size ?? 2,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
    outlineWidth: 0.15,
    outlineColor: Color3.Black()
  })
  if (opts.billboard) Billboard.create(e, { billboardMode: BillboardMode.BM_Y })
  return e
}

export function setText(e: Entity, text: string) {
  const t = TextShape.getMutable(e)
  if (t.text !== text) t.text = text
}

/** A clickable pedestal with a label; `onClick` runs on E / pointer. Labels face -Z (toward the spawn). */
export function button(position: Vector3, label: string, onClick: () => void, color: Rgb = { r: 0.2, g: 0.45, b: 0.9 }, parent?: Entity): Entity {
  const e = engine.addEntity()
  Transform.create(e, { parent, position: Vector3.create(position.x, 0.5, position.z), scale: Vector3.create(1.6, 1, 0.6) })
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e)
  paint(e, color, 0.3)
  pointerEventsSystem.onPointerDown({ entity: e, opts: { button: InputAction.IA_POINTER, hoverText: label, maxDistance: 12 } }, onClick)
  sign(Vector3.create(position.x, 1.35, position.z - 0.31), label, { size: 1.5, yaw: 0, parent })
  return e
}
