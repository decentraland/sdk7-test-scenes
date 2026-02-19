import { TextureWrapMode, Material, InputAction, MeshCollider, pointerEventsSystem, MeshRenderer, engine, Transform, Tween, TweenSequence, TweenLoop, EasingFunction } from '@dcl/sdk/ecs'
import { Vector2, Vector3, Quaternion } from '@dcl/sdk/math'

export function main() {

    // ─── Finite Tween Modes ───

    //// Move
    const moveEntity = engine.addEntity()
    Transform.create(moveEntity, { position: Vector3.create(2, 1, 2) })
    MeshRenderer.setBox(moveEntity)
    MeshCollider.setBox(moveEntity)
    pointerEventsSystem.onPointerDown(
        { entity: moveEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'Move' } },
        () => {
            Tween.setMove(moveEntity, Vector3.create(2, 1, 2), Vector3.create(2, 3, 2), 1500, EasingFunction.EF_EASEOUTQUAD)
        }
    )

    //// Rotate
    const rotateEntity = engine.addEntity()
    Transform.create(rotateEntity, { position: Vector3.create(5, 1, 2) })
    MeshRenderer.setBox(rotateEntity)
    MeshCollider.setBox(rotateEntity)
    pointerEventsSystem.onPointerDown(
        { entity: rotateEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'Rotate' } },
        () => {
            Tween.setRotate(
                rotateEntity,
                Quaternion.fromEulerDegrees(0, 0, 0),
                Quaternion.fromEulerDegrees(0, 180, 90),
                1500,
                EasingFunction.EF_EASEQUAD
            )
        }
    )

    //// Scale
    const scaleEntity = engine.addEntity()
    Transform.create(scaleEntity, { position: Vector3.create(8, 1, 2) })
    MeshRenderer.setBox(scaleEntity)
    MeshCollider.setBox(scaleEntity)
    pointerEventsSystem.onPointerDown(
        { entity: scaleEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'Scale' } },
        () => {
            Tween.setScale(scaleEntity, Vector3.One(), Vector3.create(2, 0.5, 2), 1500, EasingFunction.EF_EASEBOUNCE)
        }
    )

    //// TextureMove
    const texMoveEntity = engine.addEntity()
    Transform.create(texMoveEntity, { position: Vector3.create(11, 1.5, 2), scale: Vector3.create(2, 2, 1) })
    MeshRenderer.setPlane(texMoveEntity)
    MeshCollider.setPlane(texMoveEntity)
    Material.setPbrMaterial(texMoveEntity, {
        texture: Material.Texture.Common({
            src: 'assets/tiles.png',
            wrapMode: TextureWrapMode.TWM_REPEAT,
            tiling: Vector2.create(2, 2),
            offset: Vector2.Zero()
        })
    })
    pointerEventsSystem.onPointerDown(
        { entity: texMoveEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'TextureMove', showHighlight: false } },
        () => {
            Tween.setTextureMove(texMoveEntity, Vector2.Zero(), Vector2.create(0, 2), 2000)
        }
    )

    //// MoveRotateScale
    const mrsEntity = engine.addEntity()
    Transform.create(mrsEntity, { position: Vector3.create(14, 1, 2) })
    MeshRenderer.setBox(mrsEntity)
    MeshCollider.setBox(mrsEntity)
    pointerEventsSystem.onPointerDown(
        { entity: mrsEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'MoveRotateScale' } },
        () => {
            Tween.setMoveRotateScale(
                mrsEntity,
                Vector3.create(14, 1, 2),
                Vector3.create(14, 3, 2),
                Quaternion.fromEulerDegrees(0, 0, 0),
                Quaternion.fromEulerDegrees(0, 180, 90),
                Vector3.One(),
                Vector3.create(2, 0.5, 2),
                2000
            )
        }
    )

    // ─── Continuous Tween Modes ───

    //// MoveContinuous
    const moveContEntity = engine.addEntity()
    Transform.create(moveContEntity, { position: Vector3.create(2, 1, 6) })
    MeshRenderer.setSphere(moveContEntity)
    MeshCollider.setSphere(moveContEntity)
    pointerEventsSystem.onPointerDown(
        { entity: moveContEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'MoveContinuous' } },
        () => {
            const comp = Tween.getMutableOrNull(moveContEntity)
            if (comp) {
                comp.playing = !comp.playing
                return
            }
            Tween.setMoveContinuous(moveContEntity, Vector3.create(0, 1, 0), 1, 5000)
        }
    )

    //// RotateContinuous
    const rotContEntity = engine.addEntity()
    Transform.create(rotContEntity, { position: Vector3.create(5, 1, 6) })
    MeshRenderer.setBox(rotContEntity)
    MeshCollider.setBox(rotContEntity)
    pointerEventsSystem.onPointerDown(
        { entity: rotContEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'RotateContinuous' } },
        () => {
            const comp = Tween.getMutableOrNull(rotContEntity)
            if (comp) {
                comp.playing = !comp.playing
                return
            }
            Tween.setRotateContinuous(rotContEntity, Quaternion.fromEulerDegrees(0, 1, 0), 90)
        }
    )

    //// TextureMoveContinuous
    const texContEntity = engine.addEntity()
    Transform.create(texContEntity, { position: Vector3.create(8, 1.5, 6), scale: Vector3.create(2, 2, 1) })
    MeshRenderer.setPlane(texContEntity)
    MeshCollider.setPlane(texContEntity)
    Material.setPbrMaterial(texContEntity, {
        texture: Material.Texture.Common({
            src: 'assets/tiles.png',
            wrapMode: TextureWrapMode.TWM_REPEAT,
            tiling: Vector2.create(2, 2),
            offset: Vector2.Zero()
        })
    })
    pointerEventsSystem.onPointerDown(
        { entity: texContEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'TextureMoveContinuous', showHighlight: false } },
        () => {
            if (Tween.has(texContEntity)) {
                Tween.deleteFrom(texContEntity)
                return
            }
            Tween.setTextureMoveContinuous(texContEntity, Vector2.create(0, 1), 0.5)
        }
    )

    //// MoveRotateScaleContinuous
    const mrsContEntity = engine.addEntity()
    Transform.create(mrsContEntity, { position: Vector3.create(11, 1, 6) })
    MeshRenderer.setBox(mrsContEntity)
    MeshCollider.setBox(mrsContEntity)
    pointerEventsSystem.onPointerDown(
        { entity: mrsContEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'MRSContinuous' } },
        () => {
            const comp = Tween.getMutableOrNull(mrsContEntity)
            if (comp) {
                comp.playing = !comp.playing
                return
            }
            Tween.setMoveRotateScaleContinuous(
                mrsContEntity,
                Vector3.create(0, 0.1, 0),
                Quaternion.fromEulerDegrees(0, 5, 0),
                Vector3.create(0.01, 0.01, 0.01),
                5
            )
        }
    )

    // ─── TweenSequence Examples ───

    //// TweenSequence: Mixed modes (Move, Rotate, MoveRotateScale x2)
    const seqMixedEntity = engine.addEntity()
    const mixedLow = Vector3.create(5, 2, 11)
    const mixedHigh = Vector3.create(5, 4, 11)
    Transform.create(seqMixedEntity, { position: mixedLow })
    MeshRenderer.setBox(seqMixedEntity)
    MeshCollider.setBox(seqMixedEntity)
    pointerEventsSystem.onPointerDown(
        { entity: seqMixedEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'Sequence (mixed)' } },
        () => {
            // Step 1: Move (rise up)
            Tween.createOrReplace(seqMixedEntity, {
                mode: Tween.Mode.Move({ start: mixedLow, end: mixedHigh }),
                duration: 1000,
                easingFunction: EasingFunction.EF_EASEOUTQUAD,
                playing: true
            })

            TweenSequence.createOrReplace(seqMixedEntity, {
                loop: TweenLoop.TL_RESTART,
                sequence: [
                    // Step 2: Rotate (spin 180deg in place)
                    {
                        mode: Tween.Mode.Rotate({
                            start: Quaternion.fromEulerDegrees(0, 0, 0),
                            end: Quaternion.fromEulerDegrees(0, 180, 0)
                        }),
                        duration: 1000,
                        easingFunction: EasingFunction.EF_EASEQUAD
                    },
                    // Step 3: MoveRotateScale (descend + complete rotation, no scale change)
                    {
                        mode: Tween.Mode.MoveRotateScale({
                            positionStart: mixedHigh,
                            positionEnd: mixedLow,
                            rotationStart: Quaternion.fromEulerDegrees(0, 180, 0),
                            rotationEnd: Quaternion.fromEulerDegrees(0, 360, 0),
                            scaleStart: Vector3.One(),
                            scaleEnd: Vector3.One()
                        }),
                        duration: 1500,
                        easingFunction: EasingFunction.EF_EASEQUAD
                    },
                    // Step 4: MoveRotateScale (rise + tilt + squash)
                    {
                        mode: Tween.Mode.MoveRotateScale({
                            positionStart: mixedLow,
                            positionEnd: mixedHigh,
                            rotationStart: Quaternion.fromEulerDegrees(0, 0, 0),
                            rotationEnd: Quaternion.fromEulerDegrees(0, 0, 90),
                            scaleStart: Vector3.One(),
                            scaleEnd: Vector3.create(1.5, 0.5, 1.5)
                        }),
                        duration: 1500,
                        easingFunction: EasingFunction.EF_EASESINE
                    }
                ]
            })
        }
    )

    //// TweenSequence: All MoveRotateScale (4 steps)
    const seqMrsEntity = engine.addEntity()
    const mrsLow = Vector3.create(11, 2, 11)
    const mrsHigh = Vector3.create(11, 4, 11)
    Transform.create(seqMrsEntity, { position: mrsLow })
    MeshRenderer.setBox(seqMrsEntity)
    MeshCollider.setBox(seqMrsEntity)
    pointerEventsSystem.onPointerDown(
        { entity: seqMrsEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'Sequence (MRS x4)' } },
        () => {
            // Step 1: Move only (rise up)
            Tween.createOrReplace(seqMrsEntity, {
                mode: Tween.Mode.MoveRotateScale({
                    positionStart: mrsLow,
                    positionEnd: mrsHigh,
                    rotationStart: Quaternion.fromEulerDegrees(0, 0, 0),
                    rotationEnd: Quaternion.fromEulerDegrees(0, 0, 0),
                    scaleStart: Vector3.One(),
                    scaleEnd: Vector3.One()
                }),
                duration: 1000,
                easingFunction: EasingFunction.EF_EASEOUTQUAD,
                playing: true
            })

            TweenSequence.createOrReplace(seqMrsEntity, {
                loop: TweenLoop.TL_RESTART,
                sequence: [
                    // Step 2: Rotate only (spin 180deg at top)
                    {
                        mode: Tween.Mode.MoveRotateScale({
                            positionStart: mrsHigh,
                            positionEnd: mrsHigh,
                            rotationStart: Quaternion.fromEulerDegrees(0, 0, 0),
                            rotationEnd: Quaternion.fromEulerDegrees(0, 180, 0),
                            scaleStart: Vector3.One(),
                            scaleEnd: Vector3.One()
                        }),
                        duration: 1000,
                        easingFunction: EasingFunction.EF_EASEQUAD
                    },
                    // Step 3: Move + Rotate (descend + finish rotation)
                    {
                        mode: Tween.Mode.MoveRotateScale({
                            positionStart: mrsHigh,
                            positionEnd: mrsLow,
                            rotationStart: Quaternion.fromEulerDegrees(0, 180, 0),
                            rotationEnd: Quaternion.fromEulerDegrees(0, 360, 0),
                            scaleStart: Vector3.One(),
                            scaleEnd: Vector3.One()
                        }),
                        duration: 1500,
                        easingFunction: EasingFunction.EF_EASEQUAD
                    },
                    // Step 4: Move + Rotate + Scale (rise + tilt + squash)
                    {
                        mode: Tween.Mode.MoveRotateScale({
                            positionStart: mrsLow,
                            positionEnd: mrsHigh,
                            rotationStart: Quaternion.fromEulerDegrees(0, 0, 0),
                            rotationEnd: Quaternion.fromEulerDegrees(0, 0, 90),
                            scaleStart: Vector3.One(),
                            scaleEnd: Vector3.create(1.5, 0.5, 1.5)
                        }),
                        duration: 1500,
                        easingFunction: EasingFunction.EF_EASESINE
                    }
                ]
            })
        }
    )
}
