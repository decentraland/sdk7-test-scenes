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
    InputModifier
} from '@dcl/sdk/ecs'

InputModifier.create(engine.PlayerEntity)
function ToggleCharacterInput(enabled: boolean) {
    InputModifier.getMutable(engine.PlayerEntity).mode = {
        $case: 'standard',
        standard: {
            disableWalk: !enabled,
            disableRun: !enabled,
            disableJog: !enabled,
        }
    }
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
    VirtualCamera.create(controllableCameraEntity)
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

            ToggleCharacterInput(false)
            
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
            ToggleCharacterInput(true)
            controllableCameraIsActive = false
            mainCamera.virtualCameraEntity = undefined
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