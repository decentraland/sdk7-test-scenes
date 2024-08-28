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
  Tween,
  TweenSequence,
  TweenLoop,
  EasingFunction,
  Material,
  VisibilityComponent,
  PointerEvents
} from '@dcl/sdk/ecs'

const centerOfScenePosition = Vector3.create(8, 1, 8)
const virtualCamerasCollection : Entity[] = []
virtualCamerasCollection.push(engine.CameraEntity)
let currentVirtualCameraIndex = 0

// Environment
const groundEntity = engine.addEntity()
Transform.create(groundEntity, {
  position: Vector3.create(8, 0.01, 8),
  rotation: Quaternion.fromEulerDegrees(90, 0, 0),
  scale: Vector3.create(16, 16, 0.1),
})
MeshRenderer.setPlane(groundEntity)
Material.setBasicMaterial(groundEntity, { diffuseColor: Color4.Gray() })
const sceneCenterEntity = engine.addEntity()
Transform.create(sceneCenterEntity, {
  position: Vector3.create(8, 0, 8),
})

// Cameras setup
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

// "Controllable" Camera Setup
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

let usingControllableCamara = false
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
      usingControllableCamara = true

      mainCamera.virtualCameraEntity = controllableCameraEntity
    }
)
const controllableCameraMovementSpeed = 10
const controllableCameraRotationSpeed = 60
engine.addSystem((dt) => {
  if (!usingControllableCamara) return
  
  const mainCamera = MainCamera.getMutableOrNull(engine.CameraEntity)
  if (!mainCamera) return

  const cameraTransform = Transform.getMutable(controllableCameraEntity)
  const cameraForward = Vector3.Forward()
  Vector3.rotateToRef(cameraForward, cameraTransform.rotation, cameraForward)
  const cameraLeft = Vector3.rotate(cameraForward, Quaternion.fromEulerDegrees(0, -90, 0))
  
  if (inputSystem.isTriggered(InputAction.IA_JUMP, PointerEventType.PET_DOWN)) {
    ToggleCharacterPrison(false)
    usingControllableCamara = false
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

// Cameras Changing System
engine.addSystem(() => {
  if (usingControllableCamara) return
  
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
