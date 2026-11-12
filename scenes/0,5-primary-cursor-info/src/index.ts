import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { engine, Entity, InputAction, inputSystem, MainCamera, pointerEventsSystem, PointerEventType, PrimaryPointerInfo, RaycastQueryType, raycastSystem, VirtualCamera, Transform, TextShape, MeshRenderer, MeshCollider, Material, InputModifier, ColliderLayer } from '@dcl/sdk/ecs'
import { getRandomPastelColor } from './utils'

let textShapeEntity: Entity
let currentCamera = 0
let cameraEntities: Entity[] = []
let timerFrequency = 1
let rayFrequency = 0.1
let mousePressed = false

export function main() {
  createBoard()
  createTextShape()
  createClickableBox()
  SetupVirtualCameras()
  setupSystems()
  setupInstructions()
}

function createBoard() {
  let boardEntity = engine.addEntity()
  Transform.create(boardEntity, {
    position: { x: 2, y: 1, z: 2 },
    scale: { x: 2, y: 2, z: 0.1 },
    rotation: Quaternion.fromEulerDegrees(0, 45, 0)
  })
  MeshRenderer.setBox(boardEntity)
  MeshCollider.setBox(boardEntity)
}

function createTextShape() {
  textShapeEntity = engine.addEntity()
  Transform.create(textShapeEntity, {
    position: { x: 2.05, y: 1, z: 2.05 },
    rotation: Quaternion.fromEulerDegrees(0, 225, 0)
  })

  TextShape.create(textShapeEntity, {
    text: `placeholder`,
    fontSize: 1.5,
    textColor: { r: 0, g: 0, b: 0, a: 1 }
  })
}

function setupSystems() {
  // ClickableBox Raycast System
  engine.addSystem((t) => {
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)) {
      mousePressed = true
    }

    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_UP)) {
      mousePressed = false
    }

    if (!mousePressed) {
      timerFrequency = 1
      raycastSystem.removeRaycasterEntity(engine.CameraEntity)
      return
    }

    timerFrequency += t
    if (timerFrequency < rayFrequency) return
    timerFrequency = 0

      const pointerInfo = PrimaryPointerInfo.getOrCreateMutable(engine.RootEntity)
      let dir = pointerInfo.worldRayDirection

      raycastSystem.registerGlobalDirectionRaycast(
        {
          entity: engine.CameraEntity,
          opts: {
            queryType: RaycastQueryType.RQT_HIT_FIRST,
            direction: dir,
          },
        },
        function (raycastResult) {
          let result = raycastResult.hits[0]
          if (result && result.position) {
            SpawnSphere(result.position)
          }
        }
      )
  })

  // TextShape System
  engine.addSystem(() => {
    const pointerInfo = PrimaryPointerInfo.getOrCreateMutable(engine.RootEntity)

    let cursorPos = {
      x: Math.floor(pointerInfo.screenCoordinates?.x ?? -666),
      y: Math.floor(pointerInfo.screenCoordinates?.y ?? -666)
    }

    const text = TextShape.getMutable(textShapeEntity)
    text.text = `Primary Cursor Info:
    position: ${cursorPos.x}, ${cursorPos.y}
    delta: ${Math.floor(pointerInfo.screenDelta?.x ?? 0)}, ${Math.floor(pointerInfo.screenDelta?.y ?? 0)}
    worldRayDirection:
    x: ${pointerInfo.worldRayDirection?.x.toFixed(2)}  y: ${pointerInfo.worldRayDirection?.y.toFixed(2)}  z: ${pointerInfo.worldRayDirection?.z.toFixed(2)}`
  })
}

function createClickableBox() {
  const clickableBox = engine.addEntity()
  Transform.create(clickableBox, {
    position: { x: 8, y: 2, z: 8 },
    scale: { x: 2, y: 4, z: 2 }
  })
  MeshRenderer.setBox(clickableBox)
  MeshCollider.setBox(clickableBox)
  Material.setPbrMaterial(clickableBox, {
    albedoColor: { r: 0.65, g: 0.78, b: 0.9, a: 1 }
  })
}

function SpawnSphere(position: Vector3) {
  const sphere = engine.addEntity()
  Transform.create(sphere, {
    position,
    scale: { x: .1, y: .1, z: .1 }
  })
  MeshRenderer.setSphere(sphere)

  Material.setPbrMaterial(sphere, {
    albedoColor: getRandomPastelColor()
  })
}

function SetupVirtualCameras() {
  const center = { x: 8, y: 2, z: 8 }
  const offset = 5
  const miniScale = { x: 0.25, y: 0.25, z: 0.25 }
  const positions = [
    { x: center.x + offset, y: center.y, z: center.z },
    { x: center.x, y: center.y, z: center.z + offset },
    { x: center.x - offset, y: center.y, z: center.z },
    { x: center.x, y: center.y, z: center.z - offset },
  ]

  for (const pos of positions) {
    const miniCube = engine.addEntity()
    cameraEntities.push(miniCube)

    const direction = {
      x: center.x - pos.x,
      y: center.y - pos.y,
      z: center.z - pos.z
    }

    const rotation = Quaternion.lookRotation(direction, Vector3.Up())

    Transform.create(miniCube, {
      position: pos,
      scale: miniScale,
      rotation: rotation
    })
    MeshRenderer.setBox(miniCube)

    Material.setPbrMaterial(miniCube, {
      albedoColor: getRandomPastelColor()
    })

    VirtualCamera.create(miniCube, {
      defaultTransition: { transitionMode: VirtualCamera.Transition.Time(1) },
    })
  }

  engine.addSystem(() => {
    if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
      MainCamera.createOrReplace(engine.CameraEntity, {
        virtualCameraEntity: cameraEntities[currentCamera]
      })

      InputModifier.createOrReplace(engine.PlayerEntity, {
        mode: InputModifier.Mode.Standard({
          disableAll: true
        }),
      })

      currentCamera++
      if (currentCamera > 3) {
        currentCamera = 0
      }
    }

    if (
      inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
    ) {
      currentCamera = 0
      MainCamera.createOrReplace(engine.CameraEntity, {
        virtualCameraEntity: undefined
      })
      InputModifier.createOrReplace(engine.PlayerEntity, {
        mode: InputModifier.Mode.Standard({
          disableAll: false
        }),
      })
    }
  })
}

function setupInstructions() {
  // Create instruction board
  let instructionBoard = engine.addEntity()
  Transform.create(instructionBoard, {
    position: { x: 1, y: 1, z: 8 },
    scale: { x: 4, y: 2, z: 0.1 },
    rotation: Quaternion.fromEulerDegrees(0, 90, 0)
  })
  MeshRenderer.setBox(instructionBoard)
  MeshCollider.setBox(instructionBoard)

  // Create instruction text
  let instructionText = engine.addEntity()
  Transform.create(instructionText, {
    position: { x: 1.1, y: 1, z: 8 },
    rotation: Quaternion.fromEulerDegrees(0, 270, 0)
  })

  TextShape.create(instructionText, {
    text: `Instructions:
    > Press F to enter virtual camera mode
    > Press F again to switch between cameras
    > Press E to exit virtual camera mode
    > Right click to free the cursor

    Spawn spheres in the central pillar:
    > Press left mouse button once to spawn a sphere where
      you're aiming with your camera or your free cursor
    > Hold left mouse button to continuously spawn spheres where
      you're aiming with your camera or your free cursor`,
    fontSize: 1.25,
    textColor: { r: 0, g: 0, b: 0, a: 1 }
  })
}
