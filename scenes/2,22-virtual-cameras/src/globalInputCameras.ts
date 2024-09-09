import {Vector3, Quaternion, Color4} from '@dcl/sdk/math'
import {
    engine,
    Transform,
    MeshRenderer,
    Entity,
    MainCamera,
    VirtualCamera,
    Tween,
    TweenSequence,
    TweenLoop,
    EasingFunction,
    InputAction,
    inputSystem,
    PointerEventType,
    VisibilityComponent, 
    TextShape,
    TransformType,
    PBVirtualCamera
} from '@dcl/sdk/ecs'
import { controllableCameraIsActive } from "./controllableCamera";

const centerOfScenePosition = Vector3.create(8, 1, 8)
const virtualCamerasCollection : Entity[] = []
virtualCamerasCollection.push(engine.CameraEntity)
const virtualCamerasTextCollection : Entity[] = []
virtualCamerasTextCollection.push(engine.CameraEntity)
let currentVirtualCameraIndex = 0
const sceneCenterEntity = engine.addEntity()
Transform.create(sceneCenterEntity, {
    position: Vector3.create(8, 0, 8),
})

export function InstantiateGlobalInputCameras() {
    // Cameras setup
    SpawnVirtualCamera({
        position: Vector3.create(8, 16, 8),
        rotation: Quaternion.fromEulerDegrees(89, 0, 0)
    }, {
        defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0) }
    }, "1")

    const staticVirtualCamera2Pos = Vector3.create(0, 16, 15)
    SpawnVirtualCamera({
        position: staticVirtualCamera2Pos,
        rotation: Quaternion.fromLookAt(staticVirtualCamera2Pos, centerOfScenePosition)
    }, {
        defaultTransition: { transitionMode: VirtualCamera.Transition.Time(2) }
    }, "2")

    const staticVirtualCamera3Pos = Vector3.create(15, 16, 0)
    SpawnVirtualCamera({
        position: staticVirtualCamera3Pos,
        rotation: Quaternion.fromLookAt(staticVirtualCamera3Pos, centerOfScenePosition)
    }, {
        defaultTransition: { transitionMode: VirtualCamera.Transition.Speed(20) },
        lookAtEntity: engine.PlayerEntity
    }, "3")

    const movingVirtualCamera = SpawnVirtualCamera({
        position: Vector3.create(2, 16, 2),
        rotation: Quaternion.fromEulerDegrees(89, 0, 0)
    }, {
        defaultTransition: { transitionMode: VirtualCamera.Transition.Speed(0) },
        lookAtEntity: sceneCenterEntity
    }, "4")    
    Tween.create(movingVirtualCamera, {
        duration: 4000,
        easingFunction: EasingFunction.EF_LINEAR,
        currentTime: 0,
        playing: true,
        mode: Tween.Mode.Move({
            start: Vector3.create(2, 16, 2),
            end: Vector3.create(2, 16, 14),
        }),
    })
    TweenSequence.create(movingVirtualCamera, {
        sequence: [
            {
                duration: 4000,
                easingFunction: EasingFunction.EF_LINEAR,
                mode: Tween.Mode.Move({
                    start: Vector3.create(2, 16, 14),
                    end: Vector3.create(14, 16, 14),
                }),
            },
            {
                duration: 4000,
                easingFunction: EasingFunction.EF_LINEAR,
                mode: Tween.Mode.Move({
                    start: Vector3.create(14, 16, 14),
                    end: Vector3.create(14, 16, 2),
                }),
            },
            {
                duration: 4000,
                easingFunction: EasingFunction.EF_LINEAR,
                mode: Tween.Mode.Move({
                    start: Vector3.create(14, 16, 2),
                    end: Vector3.create(2, 16, 2),
                }),
            },
        ],
        loop: TweenLoop.TL_RESTART,
    })

    // Cameras Changing System
    engine.addSystem(() => {
        if (controllableCameraIsActive) return
        
        if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
            const mainCamera = MainCamera.getMutableOrNull(engine.CameraEntity)
            if (!mainCamera) return
            
            // const currentVCam = VirtualCamera.getMutableOrNull(mainCamera.virtualCameraEntity as Entity)
            // if (currentVCam && currentVCam.lookAtEntity) {
            //   currentVCam.lookAtEntity = undefined;
            //   return
            // }
            
            const visibility = VisibilityComponent.getMutableOrNull(virtualCamerasCollection[currentVirtualCameraIndex])
            if (visibility) {
                visibility.visible = true
                VisibilityComponent.getMutable(virtualCamerasTextCollection[currentVirtualCameraIndex]).visible = true
            }
            
            currentVirtualCameraIndex++
            if (currentVirtualCameraIndex == virtualCamerasCollection.length)
                currentVirtualCameraIndex = 0

            if (virtualCamerasCollection[currentVirtualCameraIndex] == engine.CameraEntity) {
                mainCamera.virtualCameraEntity = 0
            } else {
                mainCamera.virtualCameraEntity = virtualCamerasCollection[currentVirtualCameraIndex]
                VisibilityComponent.getMutable(virtualCamerasCollection[currentVirtualCameraIndex]).visible = false
                VisibilityComponent.getMutable(virtualCamerasTextCollection[currentVirtualCameraIndex]).visible = false                
            }
        }
    })
}

function SpawnVirtualCamera(transformProps:  Partial<TransformType>, camProps: PBVirtualCamera, camText: string ): Entity {
    const virtualCameraEntity = engine.addEntity()
    Transform.create(virtualCameraEntity, transformProps)
    MeshRenderer.setBox(virtualCameraEntity)
    VirtualCamera.create(virtualCameraEntity, camProps)
    VisibilityComponent.create(virtualCameraEntity, { visible: true })
    virtualCamerasCollection.push(virtualCameraEntity)
    
    const camEntityText = engine.addEntity()
    Transform.create(camEntityText, {
        parent: virtualCameraEntity,
        position: Vector3.create(0, 0, 0.75),
        rotation: Quaternion.fromEulerDegrees(0, 180, 0)
    })
    TextShape.create(camEntityText, {
        text: camText,
        fontSize: 8,
        textColor: Color4.Green(),
    })
    VisibilityComponent.create(camEntityText, { visible: true })
    virtualCamerasTextCollection.push(camEntityText)
    
    return virtualCameraEntity
}