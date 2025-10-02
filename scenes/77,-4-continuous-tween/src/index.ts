import { TextureMovementType, TextureWrapMode, Material, InputAction, MeshCollider, pointerEventsSystem, MeshRenderer, EasingFunction, engine, Transform, Tween, TweenLoop, TweenSequence } from '@dcl/sdk/ecs'
import { Vector2, Vector3, Quaternion } from '@dcl/sdk/math'

export function main() {
  //// Continuous Rotation
  const continuousRotationEntity = engine.addEntity()
  Transform.create(continuousRotationEntity, {
    position: Vector3.create(4, 1, 8),
    // rotation: Quaternion.fromEulerDegrees(30, 55, 183)
  })
  MeshRenderer.setBox(continuousRotationEntity)
  MeshCollider.setBox(continuousRotationEntity)
  pointerEventsSystem.onPointerDown(
      { entity: continuousRotationEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'toggle' } },
      () => {
        if (Tween.has(continuousRotationEntity)) {
          Tween.deleteFrom(continuousRotationEntity)
          return
        }

        Tween.create(continuousRotationEntity, {
          mode: {
            $case: 'rotateContinuous', rotateContinuous: {
              // direction: Quaternion.fromEulerDegrees(-60, 80, 50),
              direction: Quaternion.fromEulerDegrees(0, 1, 0),
              speed: 100
            }
          },
          duration: -1,
          easingFunction: EasingFunction.EF_LINEAR
        })     
      }
  )
    
  //// Continuous Movement
    const continuousMovementEntity = engine.addEntity()
    Transform.create(continuousMovementEntity, {
        position: Vector3.create(8, 1, 8),
    })
    MeshRenderer.setSphere(continuousMovementEntity)
    MeshCollider.setSphere(continuousMovementEntity)
    pointerEventsSystem.onPointerDown(
        { entity: continuousMovementEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'toggle' } },
        () => {
            if (Tween.has(continuousMovementEntity)) {
                return
            }
    
            Tween.create(continuousMovementEntity, {
                mode: {
                    $case: 'moveContinuous', moveContinuous: {
                        direction: Vector3.create(0, 1, 0),
                        speed: 3
                    }
                },
                duration: -1,
                easingFunction: EasingFunction.EF_LINEAR
            })
            
            const resetSystem = () => {
                const mutableTransform = Transform.getMutable(continuousMovementEntity)
                if (mutableTransform.position.y > 3) {
                    Tween.deleteFrom(continuousMovementEntity)
                    mutableTransform.position.y = 1
                    engine.removeSystem(resetSystem)
                }
            }
            engine.addSystem(resetSystem)
        }
    )
  
  //// Continuous TextureMove
    const continuousTexMoveEntity = engine.addEntity()
    Transform.create(continuousTexMoveEntity, {
        position: Vector3.create(12, 1, 8),
        scale: Vector3.create(1, 3, 1)
    })
    MeshRenderer.setPlane(continuousTexMoveEntity)
    MeshCollider.setPlane(continuousTexMoveEntity)
    Material.setPbrMaterial(continuousTexMoveEntity, {
        texture: Material.Texture.Common({
            src: 'assets/tiles.png',
            wrapMode: TextureWrapMode.TWM_REPEAT,
            tiling: Vector2.One(),
            offset: Vector2.Zero()
        })
    })
    pointerEventsSystem.onPointerDown(
        { entity: continuousTexMoveEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'toggle', showHighlight: false } },
        () => {
            if (Tween.has(continuousTexMoveEntity)) {
                Tween.deleteFrom(continuousTexMoveEntity)
                return
            }

            Tween.create(continuousTexMoveEntity, {
                mode: {
                    $case: 'textureMoveContinuous', textureMoveContinuous: {
                        direction: Vector2.create(0, 1),
                        speed: 1,
                        // movementType: TextureMovementType.TMT_OFFSET
                    }
                },
                duration: -1,
                easingFunction: EasingFunction.EF_LINEAR
            })
        }
    )
}
