import { movePlayerTo } from '~system/RestrictedActions'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { engine,
    Transform,
    MeshRenderer,
    MeshCollider,
    MainCamera,
    VirtualCamera,
    pointerEventsSystem,
    InputAction,
    inputSystem,
    PointerEventType,
    Material,
    VisibilityComponent,
} from '@dcl/sdk/ecs'

// Character movement confinement setup (until player input freeze component is there)
const characterPrisonPos = Vector3.create(14.5, 0.5, 14.5)
const characterPrison = engine.addEntity()
Transform.create(characterPrison, {
    position: characterPrisonPos,
})
VisibilityComponent.create(characterPrison, { visible: false })
const characterPrisonWall1 = engine.addEntity()
Transform.create(characterPrisonWall1, {
    position: Vector3.create(0, 1, 1),
    scale: Vector3.create(1.5, 3, 0.25),
    parent: characterPrison
})
MeshRenderer.setBox(characterPrisonWall1)
Material.setBasicMaterial(characterPrisonWall1, { diffuseColor: Color4.Black() })
VisibilityComponent.create(characterPrisonWall1, { visible: false })
const characterPrisonWall2 = engine.addEntity()
Transform.create(characterPrisonWall2, {
    position: Vector3.create(0, 1, -1),
    scale: Vector3.create(1.5, 3, 0.25),
    parent: characterPrison
})
MeshRenderer.setBox(characterPrisonWall2)
Material.setBasicMaterial(characterPrisonWall2, { diffuseColor: Color4.Black() })
VisibilityComponent.create(characterPrisonWall2, { visible: false })
const characterPrisonWall3 = engine.addEntity()
Transform.create(characterPrisonWall3, {
    position: Vector3.create(1, 1, 0),
    scale: Vector3.create(0.25, 3, 1.5),
    parent: characterPrison
})
MeshRenderer.setBox(characterPrisonWall3)
Material.setBasicMaterial(characterPrisonWall3, { diffuseColor: Color4.Black() })
VisibilityComponent.create(characterPrisonWall3, { visible: false })
const characterPrisonWall4 = engine.addEntity()
Transform.create(characterPrisonWall4, {
    position: Vector3.create(-1, 1, 0),
    scale: Vector3.create(0.25, 3, 1.5),
    parent: characterPrison
})
MeshRenderer.setBox(characterPrisonWall4)
Material.setBasicMaterial(characterPrisonWall4, { diffuseColor: Color4.Black() })
VisibilityComponent.create(characterPrisonWall4, { visible: false })

function ToggleCharacterPrison(enabled: boolean) {
    if (enabled) {    
        MeshCollider.setBox(characterPrisonWall1)
        MeshCollider.setBox(characterPrisonWall2)
        MeshCollider.setBox(characterPrisonWall3)
        MeshCollider.setBox(characterPrisonWall4)
    } else {
        MeshCollider.deleteFrom(characterPrisonWall1)
        MeshCollider.deleteFrom(characterPrisonWall2)
        MeshCollider.deleteFrom(characterPrisonWall3)
        MeshCollider.deleteFrom(characterPrisonWall4)
    }
    
    VisibilityComponent.getMutable(characterPrisonWall1).visible = enabled
    VisibilityComponent.getMutable(characterPrisonWall2).visible = enabled
    VisibilityComponent.getMutable(characterPrisonWall3).visible = enabled
    VisibilityComponent.getMutable(characterPrisonWall4).visible = enabled
}

// Controllable camera setup
export let controllableCameraIsActive = false
export function InstantiateControllableCamera() {
    const controllableCameraEntity = engine.addEntity()
    Transform.create(controllableCameraEntity, {
        position: Vector3.create(8, 1, 8),
    })
    MeshRenderer.setBox(controllableCameraEntity)
    MeshCollider.setBox(controllableCameraEntity)
    Material.setBasicMaterial(controllableCameraEntity, { diffuseColor: Color4.Green() })
    VirtualCamera.create(controllableCameraEntity, {
        defaultTransition: { transitionMode: { $case: "time", time: 0 } }
    })
    pointerEventsSystem.onPointerDown(
        {
            entity: controllableCameraEntity,
            opts: {
                button: InputAction.IA_POINTER,
                hoverText: 'control camera',
                maxDistance: 3.1,
                showFeedback: true
            }},
        () => {
            const mainCamera = MainCamera.getMutableOrNull(engine.CameraEntity)
            if (!mainCamera) return
            
            ToggleCharacterPrison(true)
            movePlayerTo({ newRelativePosition: characterPrisonPos })
            
            controllableCameraIsActive = true
            mainCamera.virtualCameraEntity = controllableCameraEntity
        }
    )
    const controllableCameraMovementSpeed = 15
    const controllableCameraRotationSpeed = 120
    engine.addSystem((dt) => {
        if (!controllableCameraIsActive) return

        const mainCamera = MainCamera.getMutableOrNull(engine.CameraEntity)
        if (!mainCamera) return

        const cameraTransform = Transform.getMutable(controllableCameraEntity)
        const cameraForward = Vector3.Forward()
        Vector3.rotateToRef(cameraForward, cameraTransform.rotation, cameraForward)
        const cameraLeft = Vector3.rotate(cameraForward, Quaternion.fromEulerDegrees(0, -90, 0))

        if (inputSystem.isTriggered(InputAction.IA_JUMP, PointerEventType.PET_DOWN)) {
            movePlayerTo({ newRelativePosition: Vector3.create(8, 0.5, 6) })
            ToggleCharacterPrison(false)            
            controllableCameraIsActive = false
            mainCamera.virtualCameraEntity = 0
        } else if (inputSystem.isPressed(InputAction.IA_FORWARD)) {
            const delta = Vector3.scale(cameraForward, controllableCameraMovementSpeed * dt)
            cameraTransform.position = Vector3.add(cameraTransform.position, delta)
        } else if (inputSystem.isPressed(InputAction.IA_BACKWARD)) {
            const delta = Vector3.scale(cameraForward, -controllableCameraMovementSpeed * dt)
            cameraTransform.position = Vector3.add(cameraTransform.position, delta)
        } else if (inputSystem.isPressed(InputAction.IA_LEFT)) {
            const delta = Vector3.scale(cameraLeft, controllableCameraMovementSpeed * dt)
            cameraTransform.position = Vector3.add(cameraTransform.position, delta)
        } else if (inputSystem.isPressed(InputAction.IA_RIGHT)) {
            const delta = Vector3.scale(cameraLeft, -controllableCameraMovementSpeed * dt)
            cameraTransform.position = Vector3.add(cameraTransform.position, delta)
        } else if (inputSystem.isPressed(InputAction.IA_SECONDARY)) {
            const delta = Quaternion.fromAngleAxis(controllableCameraRotationSpeed * dt, Vector3.Up())
            cameraTransform.rotation = Quaternion.multiply(cameraTransform.rotation, delta)
        } else if (inputSystem.isPressed(InputAction.IA_PRIMARY)) {
            const delta = Quaternion.fromAngleAxis(-controllableCameraRotationSpeed * dt, Vector3.Up())
            cameraTransform.rotation = Quaternion.multiply(cameraTransform.rotation, delta)
        }
    })
}