import { Vector3, Color4 } from '@dcl/sdk/math'
import { engine, TextShape, Entity, Transform, TransformType, MeshRenderer, MeshCollider, PointerEvents, PointerEventType, pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'
export function createCube(transformProps: Partial<TransformType>, feedback: boolean, highlight: boolean, useHoverText: boolean, text: string): Entity {
  const textEntity = engine.addEntity()
  Transform.create(textEntity, { position: Vector3.add(transformProps.position!, Vector3.create(0, 1.25, 0)) })

  const defaultExplorerTextUsed = feedback && !useHoverText
  TextShape.create(textEntity, {
    fontSize: 2,
    textColor: Color4.Yellow(),
    text: `HIGHLIGHT: ${(feedback && highlight) ? 'ON' : 'OFF'}
        \nHOVER TEXT: ${(defaultExplorerTextUsed || (feedback && useHoverText && text !== '')) ? 'ON' : 'OFF'}`
  })
  const cubeEntity = engine.addEntity()
  Transform.create(cubeEntity, transformProps)
  MeshRenderer.setBox(cubeEntity)
  MeshCollider.setBox(cubeEntity)
  PointerEvents.create(cubeEntity, {
    pointerEvents: [
      {
        eventType: PointerEventType.PET_DOWN, eventInfo: {
          button: InputAction.IA_POINTER,
          hoverText: useHoverText ? text : undefined,
          showFeedback: feedback,
          showHighlight: highlight
        }
      }
    ]
  })
  return cubeEntity
}
createCube({ position: { x: 2, y: 1.5, z: 8 } }, false, true, true, 'SHOULD NOT HIGHLIGHT')
createCube({ position: { x: 4, y: 1.5, z: 8 } }, true, true, true, 'SHOULD HIGHLIGHT')
createCube({ position: { x: 6, y: 1.5, z: 8 } }, true, false, true, 'SHOULD NOT HIGHLIGHT')
createCube({ position: { x: 8, y: 1.5, z: 8 } }, true, true, true, '')
createCube({ position: { x: 10, y: 1.5, z: 8 } }, true, true, false, '')
