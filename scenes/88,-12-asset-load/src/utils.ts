import {
    engine,
    MeshRenderer,
    Transform,
    MeshCollider,
    pointerEventsSystem,
    InputAction,
    Entity
  } from '@dcl/sdk/ecs'
import { Vector3, Color4, Quaternion } from "@dcl/sdk/math"

export function createClickableCube(
    position: Vector3,
    hoverText: string,
    onClick: (entity: Entity) => void
) {
  const cube = engine.addEntity()
  Transform.create(cube, { position: position })
  MeshRenderer.setBox(cube)
  MeshCollider.setBox(cube)
  
  pointerEventsSystem.onPointerDown({ entity: cube, opts: { button: InputAction.IA_POINTER, hoverText: hoverText, maxDistance:7 } }, () => {
    onClick(cube)
  });

  return cube
}