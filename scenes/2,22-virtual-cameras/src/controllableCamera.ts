import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { engine,
    Transform,
    MeshRenderer,
    MeshCollider,
    Entity,
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
const characterPrison = engine.addEntity()
Transform.create(characterPrison, {
    position: Vector3.create(8, 1, 8),
})
VisibilityComponent.create(characterPrison, { visible: false })
const characterPrisonWall1 = engine.addEntity()
Transform.create(characterPrisonWall1, {
    position: Vector3.create(0, 1.5, 1),
    scale: Vector3.create(1.5, 3, 0.25),
    parent: characterPrison
})
const characterPrisonWall2 = engine.addEntity()
Transform.create(characterPrisonWall2, {
    position: Vector3.create(0, 1.5, -1),
    scale: Vector3.create(1.5, 3, 0.25),
    parent: characterPrison
})
const characterPrisonWall3 = engine.addEntity()
Transform.create(characterPrisonWall3, {
    position: Vector3.create(1, 1.5, 0),
    scale: Vector3.create(0.25, 3, 1.5),
    parent: characterPrison
})
const characterPrisonWall4 = engine.addEntity()
Transform.create(characterPrisonWall4, {
    position: Vector3.create(-1, 1.5, 0),
    scale: Vector3.create(0.25, 3, 1.5),
    parent: characterPrison
})

function ToggleCharacterPrison(enabled: boolean) {
    if (enabled) {
        MeshRenderer.setBox(characterPrisonWall1)
        Material.setBasicMaterial(characterPrisonWall1, { diffuseColor: Color4.Black() })
        MeshCollider.setBox(characterPrisonWall1)
        MeshRenderer.setBox(characterPrisonWall2)
        Material.setBasicMaterial(characterPrisonWall2, { diffuseColor: Color4.Black() })
        MeshCollider.setBox(characterPrisonWall2)
        MeshRenderer.setBox(characterPrisonWall3)
        Material.setBasicMaterial(characterPrisonWall3, { diffuseColor: Color4.Black() })
        MeshCollider.setBox(characterPrisonWall3)
        MeshRenderer.setBox(characterPrisonWall4)
        Material.setBasicMaterial(characterPrisonWall4, { diffuseColor: Color4.Black() })
        MeshCollider.setBox(characterPrisonWall4)
    } else {
        MeshRenderer.deleteFrom(characterPrisonWall1)
        Material.deleteFrom(characterPrisonWall1)
        MeshCollider.deleteFrom(characterPrisonWall1)
        MeshRenderer.deleteFrom(characterPrisonWall2)
        Material.deleteFrom(characterPrisonWall2)
        MeshCollider.deleteFrom(characterPrisonWall2)
        MeshRenderer.deleteFrom(characterPrisonWall3)
        Material.deleteFrom(characterPrisonWall3)
        MeshCollider.deleteFrom(characterPrisonWall3)
        MeshRenderer.deleteFrom(characterPrisonWall4)
        Material.deleteFrom(characterPrisonWall4)
        MeshCollider.deleteFrom(characterPrisonWall4)
    }
}

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

            Transform.getMutable(characterPrison).position = Transform.get(engine.PlayerEntity).position
            ToggleCharacterPrison(true)
            controllableCameraIsActive = true

            mainCamera.virtualCameraEntity = controllableCameraEntity
        }
    )
    const controllableCameraMovementSpeed = 10
    const controllableCameraRotationSpeed = 60
    engine.addSystem((dt) => {
        if (!controllableCameraIsActive) return

        const mainCamera = MainCamera.getMutableOrNull(engine.CameraEntity)
        if (!mainCamera) return

        const cameraTransform = Transform.getMutable(controllableCameraEntity)
        const cameraForward = Vector3.Forward()
        Vector3.rotateToRef(cameraForward, cameraTransform.rotation, cameraForward)
        const cameraLeft = Vector3.rotate(cameraForward, Quaternion.fromEulerDegrees(0, -90, 0))

        if (inputSystem.isTriggered(InputAction.IA_JUMP, PointerEventType.PET_DOWN)) {
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
            cameraTransform.rotation = Quaternion.multiply(cameraTransform.rotation, Quaternion.fromAngleAxis(controllableCameraRotationSpeed * dt, Vector3.Up()))
        } else if (inputSystem.isPressed(InputAction.IA_PRIMARY)) {
            cameraTransform.rotation = Quaternion.multiply(cameraTransform.rotation, Quaternion.fromAngleAxis(-controllableCameraRotationSpeed * dt, Vector3.Up()))
        }
    })
}