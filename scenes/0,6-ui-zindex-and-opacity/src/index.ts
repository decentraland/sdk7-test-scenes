import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { engine, InputAction, inputSystem, MainCamera, pointerEventsSystem, PointerEventType, PrimaryPointerInfo, RaycastQueryType, raycastSystem, VirtualCamera, Transform, TextShape, MeshRenderer, MeshCollider, Material, InputModifier, ColliderLayer } from '@dcl/sdk/ecs'
import { uiMenu, changeGreenZIndex } from './ui'
import { setupRendererStacking } from './renderer-stacking'
import { setupRawSiblings } from './raw-siblings'
import { setupAdminToolkitStacking } from './admin-toolkit-stacking'

export function main() {
    ReactEcsRenderer.setUiRenderer(uiMenu)
    setupRendererStacking()
    setupRawSiblings()
    setupAdminToolkitStacking()
    engine.addSystem(() => {
        if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
            changeGreenZIndex()
        }
    })
}
