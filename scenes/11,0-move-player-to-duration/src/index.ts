import { Vector3 } from '@dcl/sdk/math'
import {ColliderLayer, engine, InputAction, MeshCollider, MeshRenderer, pointerEventsSystem, Transform, InputModifier } from '@dcl/sdk/ecs'
import { movePlayerTo } from '~system/RestrictedActions'

export function main() {
  InstantiateTargetCube(Vector3.create(10, 0.1, 10))
  InstantiateTargetCube(Vector3.create(14, 0.1, 2))
}

function InstantiateTargetCube(position: Vector3) {
  // Spawn target cube
  const targetPosCube = engine.addEntity()
  Transform.create(targetPosCube, {
    position,
    scale: Vector3.create(0.5, 0.5, 0.5)
  })
  MeshRenderer.setBox(targetPosCube)
  MeshCollider.setBox(targetPosCube, ColliderLayer.CL_POINTER)

  function activateCube() {
    // InputModifier here to BLOCK input if wanted
    InputModifier.createOrReplace(engine.PlayerEntity, {
      mode: InputModifier.Mode.Standard({
        disableAll: true,
      }),
    })

    movePlayerTo({
      newRelativePosition: Transform.get(targetPosCube).position,
      duration: 2
    }).then((result) => {
      // Randomize position of target cube
      Transform.getMutable(targetPosCube).position = GetRandomScenePosition()

      // Was movement interrupted? (can be interrupted by movement input, if InputModifier was not used)
      console.log(`movePlayerTo() success ? ${result.success}`)

      // Remove InputModifier regardless of result success
      InputModifier.deleteFrom(engine.PlayerEntity)
    })
  }

  pointerEventsSystem.onPointerDown({
    entity: targetPosCube,
    opts: {
      hoverText: 'move there',
      button: InputAction.IA_POINTER,
      maxDistance: 100
    }
  }, activateCube)

  // Obstacle in the middle of the scene to test passing through it
  const obstacleEntity = engine.addEntity()
  Transform.create(obstacleEntity, {
    position: Vector3.create(8, 2, 8),
    scale: Vector3.create(3, 3, 3)
  })
  MeshRenderer.setSphere(obstacleEntity)
  MeshCollider.setSphere(obstacleEntity, ColliderLayer.CL_PHYSICS)

  // for debugging out-of-scene global action call...
  // let timer = 7
  // engine.addSystem((dt) => {
  //   timer -= dt
  //   if (timer <= 0) {
  //     activateCube()
  //     timer = 7
  //   }
  // })
}

function GetRandomScenePosition() : Vector3 {
  const y = 0.1
  let x = 1 + Math.random() * 14
  let z = 1 + Math.random() * 14

  return Vector3.create(x, y, z)
}