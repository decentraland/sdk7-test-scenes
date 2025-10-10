import { GltfContainer, TextureWrapMode, Material, InputAction, MeshCollider, pointerEventsSystem, MeshRenderer, engine, Transform, Tween } from '@dcl/sdk/ecs'
import { Vector2, Vector3, Quaternion } from '@dcl/sdk/math'

export function main() {
    //// Continuous Rotation 1
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

    //// Continuous Rotation 2
    const rotatingCoin = engine.addEntity()
    Transform.create(rotatingCoin, {
        position: Vector3.create(8, 1, 4),
    })
    GltfContainer.create(rotatingCoin, { src: 'assets/starCoin.glb' })
    Tween.setRotateContinuous(rotatingCoin, Quaternion.fromEulerDegrees(0, -1, 0), 100)

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
}
