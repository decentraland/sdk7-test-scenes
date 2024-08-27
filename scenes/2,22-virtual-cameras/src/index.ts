// We define the empty imports so the auto-complete feature works as expected.
import { Vector3, Quaternion } from '@dcl/sdk/math'
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
  Tween,
  TweenSequence,
  TweenLoop,
  EasingFunction,
} from '@dcl/sdk/ecs'

const centerOfScenePosition = Vector3.create(8, 1, 8)
const virtualCamerasCollection : Entity[] = []
virtualCamerasCollection.push(engine.CameraEntity)
let currentVirtualCameraIndex = 0

export function main() {
  // floor mesh
  const groundEntity = engine.addEntity()
  Transform.create(groundEntity, {
    position: Vector3.create(8, 0.01, 8),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0),
    scale: Vector3.create(16, 16, 0.1),
  })
  MeshRenderer.setPlane(groundEntity)
  const sceneCenterEntity = engine.addEntity()
  Transform.create(sceneCenterEntity, {
    position: Vector3.create(8, 0, 8),
  })

  const staticVirtualCamera1 = engine.addEntity()
  Transform.create(staticVirtualCamera1, {
    position: Vector3.create(8, 16, 8),
    rotation: Quaternion.fromEulerDegrees(89, 0, 0)
  })
  MeshRenderer.setBox(staticVirtualCamera1)
  VirtualCamera.create(staticVirtualCamera1, {
    defaultTransition: {
      transitionMode: {
        $case: "time", time: 0
      }
    }
  })
  virtualCamerasCollection.push(staticVirtualCamera1)

  const staticVirtualCamera2 = engine.addEntity()
  const staticVirtualCamera2Pos = Vector3.create(0, 16, 16)
  Transform.create(staticVirtualCamera2, {
    position: staticVirtualCamera2Pos,
    rotation: Quaternion.fromLookAt(staticVirtualCamera2Pos, centerOfScenePosition)
  })
  MeshRenderer.setBox(staticVirtualCamera2)
  VirtualCamera.create(staticVirtualCamera2, {
    defaultTransition: {
      transitionMode: {
        $case: "time", time: 2
      }
    }
  })
  virtualCamerasCollection.push(staticVirtualCamera2)

  const staticVirtualCamera3 = engine.addEntity()
  const staticVirtualCamera3Pos = Vector3.create(16, 16, 0)
  Transform.create(staticVirtualCamera3, {
    position: staticVirtualCamera3Pos,
    rotation: Quaternion.fromLookAt(staticVirtualCamera3Pos, centerOfScenePosition)
  })
  MeshRenderer.setBox(staticVirtualCamera3)
  VirtualCamera.create(staticVirtualCamera3, {
    defaultTransition: { transitionMode: { $case: "speed", speed: 20 } },
    lookAtEntity: engine.PlayerEntity
  })
  virtualCamerasCollection.push(staticVirtualCamera3)

  const movingVirtualCamera = engine.addEntity()
  Transform.create(movingVirtualCamera, {
    position: Vector3.create(2, 16, 2),
    rotation: Quaternion.fromEulerDegrees(89, 0, 0)
  })
  MeshRenderer.setBox(movingVirtualCamera)
  VirtualCamera.create(movingVirtualCamera, {
    defaultTransition: {
      transitionMode: {
        // $case: "speed", speed: 10 // 10 meters per second
        $case: "speed", speed: 0
      }
    },
    lookAtEntity: sceneCenterEntity
  })
  virtualCamerasCollection.push(movingVirtualCamera)
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

  engine.addSystem(() => {
    const mainCamera = MainCamera.getMutableOrNull(engine.CameraEntity)
    if (!mainCamera) return

    if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
      // const currentVCam = VirtualCamera.getMutableOrNull(mainCamera.virtualCameraEntity as Entity)
      // if (currentVCam && currentVCam.lookAtEntity) {
      //   currentVCam.lookAtEntity = undefined;
      //   return
      // }

      currentVirtualCameraIndex++
      if (currentVirtualCameraIndex == virtualCamerasCollection.length)
        currentVirtualCameraIndex = 0

      if (virtualCamerasCollection[currentVirtualCameraIndex] == engine.CameraEntity)
        mainCamera.virtualCameraEntity = 0
      else
        mainCamera.virtualCameraEntity = virtualCamerasCollection[currentVirtualCameraIndex]
    }
  })
}
