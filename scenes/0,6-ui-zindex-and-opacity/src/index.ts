import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { engine, InputAction, inputSystem, MainCamera, pointerEventsSystem, PointerEventType, PrimaryPointerInfo, RaycastQueryType, raycastSystem, VirtualCamera, Transform, TextShape, MeshRenderer, MeshCollider, Material, InputModifier, ColliderLayer } from '@dcl/sdk/ecs'
import { uiMenu, changeGreenZIndex } from './ui'

export function main() {
    ReactEcsRenderer.setUiRenderer(uiMenu)
    engine.addSystem(() => {
        if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
            changeGreenZIndex()
        }
    })
}
