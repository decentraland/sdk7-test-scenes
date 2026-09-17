import {
  Billboard,
  BillboardMode,
  Entity,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  TextShape,
  Transform,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

// Four rows of clickable cubes running north from the spawn at (16, 0, 2), one row per
// feature under test. The scene is 2x2 parcels, so everything must stay inside 0..32 on
// both axes — cubes that straddle the edge get culled by the explorer.
export const ROW_Z = {
  panels: 6,
  gates: 13,
  wait: 20,
  emote: 26
}

const ROW_CENTER_X = 16

export const COLOR = {
  blue: Color4.create(0.2, 0.5, 1, 1),
  grey: Color4.create(0.6, 0.6, 0.6, 1),
  purple: Color4.create(0.8, 0.2, 1, 1),
  orange: Color4.create(1, 0.55, 0.1, 1),
  cyan: Color4.create(0.2, 0.85, 0.95, 1),
  green: Color4.create(0.3, 0.85, 0.4, 1),
  red: Color4.create(0.95, 0.2, 0.4, 1),
  yellow: Color4.create(1, 0.8, 0.1, 1),
  teal: Color4.create(0.1, 0.9, 0.7, 1),
  maroon: Color4.create(0.5, 0.1, 0.1, 1)
}

export function button(
  x: number,
  z: number,
  color: Color4,
  name: string,
  hoverText: string,
  onClick: () => void
): Entity {
  const cube = engine.addEntity()
  Transform.create(cube, { position: Vector3.create(x, 1, z) })
  MeshRenderer.setBox(cube)
  MeshCollider.setBox(cube)
  Material.setPbrMaterial(cube, { albedoColor: color })
  label(name, Vector3.create(x, 2.2, z))

  pointerEventsSystem.onPointerDown({ entity: cube, opts: { button: InputAction.IA_POINTER, hoverText } }, onClick)

  return cube
}

export function rowTitle(text: string, z: number): Entity {
  return label(text, Vector3.create(ROW_CENTER_X, 3.6, z + 2))
}

export function label(text: string, pos: Vector3, color: Color4 = Color4.White()): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: pos })
  Billboard.create(e, { billboardMode: BillboardMode.BM_Y })
  TextShape.create(e, { text, textColor: color, fontSize: 2 })
  return e
}
