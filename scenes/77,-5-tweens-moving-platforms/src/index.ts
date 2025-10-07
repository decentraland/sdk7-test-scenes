import { TextureMovementType, TextureWrapMode, Material, InputAction, MeshCollider, pointerEventsSystem, MeshRenderer, EasingFunction, engine, Entity, GltfContainer, Transform, Tween, TweenLoop, TweenSequence } from '@dcl/sdk/ecs'
import { Vector2, Vector3, Quaternion } from '@dcl/sdk/math'
import { createCoin } from './modules/coin'
import * as utils from '@dcl-sdk/utils'
import { setupUi } from './ui'

export function main() {
  // Instantiate base models
  GltfContainer.create(engine.addEntity(), {
    src: 'models/baseLight.glb'
  })

  GltfContainer.create(engine.addEntity(), {
    src: 'models/staticPlatforms.glb'
  })

  // Instantiate moving platforms

  //// only horizontal
  const platform1 = engine.addEntity()
  GltfContainer.create(platform1, {
    src: 'models/movingPlatform.glb'
  })
  Transform.create(platform1, {
    position: Vector3.create(2, 1.5, 8)
  })

  Tween.setMove(platform1,
      Vector3.create(2, 1.5, 8),
      Vector3.create(2, 1.5, 10),
2000)

  TweenSequence.create(platform1, { sequence: [], loop: TweenLoop.TL_YOYO })

  //// only vertical
  const platform2 = engine.addEntity()
  GltfContainer.create(platform2, {
    src: 'models/movingPlatform.glb'
  })
  Transform.create(platform2, {
    position: Vector3.create(4, 1.5, 14)
  })

  Tween.setMove(platform2,
    Vector3.create(4, 1.5, 14),
    Vector3.create(4, 4, 14),
    2000)

  TweenSequence.create(platform2, { sequence: [], loop: TweenLoop.TL_YOYO })

  //// triggerable platform
  const platform3 = engine.addEntity()
  GltfContainer.create(platform3, {
    src: 'models/triggerPlatform.glb'
  })
  Transform.create(platform3, {
    position: Vector3.create(14, 4, 12)
  })

  utils.triggers.addTrigger(
    platform3,
    utils.LAYER_1,
    utils.LAYER_1,
    [{ type: 'box', scale: Vector3.create(1, 2, 1) }],
    () => {
      console.log('JUMPED ON')

      Tween.createOrReplace(platform3, {
        mode: Tween.Mode.Move({
          start: Vector3.create(14, 4, 12),
          end: Vector3.create(14, 4, 4)
        }),
        duration: 2000,
        easingFunction: EasingFunction.EF_LINEAR,
        currentTime: 0 // in case it was already moving
      })

      TweenSequence.createOrReplace(platform3, {
        sequence: [
          {
            mode: Tween.Mode.Move({
              start: Vector3.create(14, 4, 4),
              end: Vector3.create(14, 4, 12)
            }),
            duration: 2000,
            easingFunction: EasingFunction.EF_LINEAR
          }
        ]
      }) // non looping
    }
  )

  //utils.triggers.enableDebugDraw(true)

  //// path with many waypoints
  const platform4 = engine.addEntity()
  GltfContainer.create(platform4, {
    src: 'models/movingPlatform.glb'
  })
  Transform.create(platform4, {
    position: Vector3.create(6.5, 7, 4)
  })
    Tween.setMove(platform4, 
      Vector3.create(6.5, 7, 4),
      Vector3.create(6.5, 7, 12),
    2000)

  TweenSequence.create(platform4, {
    sequence: [
      {
        mode: Tween.Mode.Move({
          start: Vector3.create(6.5, 7, 12),
          end: Vector3.create(6.5, 10.5, 12)
        }),
        duration: 2000,
        easingFunction: EasingFunction.EF_LINEAR
      },
      {
        mode: Tween.Mode.Move({
          start: Vector3.create(6.5, 10.5, 12),
          end: Vector3.create(6.5, 10.5, 4)
        }),
        duration: 2000,
        easingFunction: EasingFunction.EF_LINEAR
      },
      {
        mode: Tween.Mode.Move({
          start: Vector3.create(6.5, 10.5, 4),
          end: Vector3.create(6.5, 7, 4)
        }),
        duration: 2000,
        easingFunction: EasingFunction.EF_LINEAR
      }
    ],
    loop: TweenLoop.TL_RESTART
  })

    //// Continuous Rotation
    const continuousRotationEntity = engine.addEntity()
    Transform.create(continuousRotationEntity, {
        position: Vector3.create(4, 1, 8),
        rotation: Quaternion.fromEulerDegrees(30, 55, 183)
    })
    MeshRenderer.setBox(continuousRotationEntity)
    MeshCollider.setBox(continuousRotationEntity)
    pointerEventsSystem.onPointerDown(
        { entity: continuousRotationEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'toggle' } },
        () => {
            const comp = Tween.getMutableOrNull(continuousRotationEntity)
            if (comp) {
                comp.playing = !comp.playing
                return
            }

            Tween.setRotateContinuous(continuousRotationEntity, Quaternion.fromEulerDegrees(0, 1, 0), 100)
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

            Tween.setMoveContinuous(continuousMovementEntity, Vector3.create(0, 1, 0), 3)

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

            Tween.setTextureMoveContinuous(continuousTexMoveEntity, Vector2.create(0, 1), 0.5)
        }
    )
  
  
  

  // Instantiate pickable coin
  createCoin('models/starCoin.glb', Vector3.create(9, 12.75, 8), Vector3.create(1.5, 3, 1.5), Vector3.create(0, 1, 0))

  // UI with GitHub link
  setupUi()
}
