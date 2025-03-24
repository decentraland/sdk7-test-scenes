import { Vector3, Color4, Quaternion } from '@dcl/sdk/math'
import { engine, ColliderLayer, AvatarShape, Transform, MeshRenderer, MeshCollider, pointerEventsSystem, InputAction, Entity, Tween, EasingFunction, TweenSequence, TweenLoop } from '@dcl/sdk/ecs'

const positionsToGo = [
    Vector3.create(1, 0.1, 1),
    Vector3.create(1, 0.1, 15),
    Vector3.create(15, 0.1, 1),
    Vector3.create(15, 0.1, 15)
]

let currentPosition = 0

const cubeButton = engine.addEntity()
MeshRenderer.setBox(cubeButton)
MeshCollider.setBox(cubeButton, ColliderLayer.CL_POINTER)
Transform.create(cubeButton, { position: Vector3.create(7, 1, 4), scale: Vector3.create(0.5, 0.5, 0.5) })

pointerEventsSystem.onPointerDown(
    { entity: cubeButton, opts: { button: InputAction.IA_POINTER, hoverText: 'spawn avatars', maxDistance: 5 } },
    () => {
        const avatarEntity1 = engine.addEntity()
        Transform.create(avatarEntity1, {
            position: Vector3.create(7, 0.1, 8),
            rotation: Quaternion.fromEulerDegrees(0, 180, 0)
        })
        AvatarShape.create(avatarEntity1, {
            wearables: [
                "urn:decentraland:off-chain:base-avatars:eyebrows_00",
                "urn:decentraland:off-chain:base-avatars:mouth_00",
                "urn:decentraland:off-chain:base-avatars:eyes_00",
                "urn:decentraland:off-chain:base-avatars:blue_tshirt",
                "urn:decentraland:off-chain:base-avatars:brown_pants",
                "urn:decentraland:off-chain:base-avatars:classic_shoes",
                "urn:decentraland:off-chain:base-avatars:cornrows"
            ],
            id: "dagon-id",
            name: "Dagon",
            bodyShape: "urn:decentraland:off-chain:base-avatars:BaseMale",
            hairColor: { "r": 0.9281997, "g": 0.997558951, "b": 0.715044141 },
            skinColor: { "r": 0.78, "g": 0.53, "b": 0.26 },
            emotes: []
        })

        const ballEntity1 = engine.addEntity()
        MeshRenderer.setSphere(ballEntity1)
        MeshCollider.setSphere(ballEntity1, ColliderLayer.CL_POINTER)
        Transform.create(ballEntity1, {position: Vector3.create(7, 1, 4)})

        pointerEventsSystem.onPointerDown(
            { entity: ballEntity1, opts: { button: InputAction.IA_POINTER, hoverText: "Change Dagon's position", maxDistance: 5 } },
            () => {
                const avatarTransform = Transform.getMutable(avatarEntity1)
                avatarTransform.position = Vector3.create(
                    positionsToGo[currentPosition].x, 
                    positionsToGo[currentPosition].y, 
                    positionsToGo[currentPosition].z)

                if (currentPosition < positionsToGo.length - 1) {
                    currentPosition++
                } else {
                    currentPosition = 0
                }
            }
        )

        const avatarEntity2 = engine.addEntity()
        Transform.create(avatarEntity2, {
            position: positionsToGo[0],
            rotation: Quaternion.fromEulerDegrees(0, 180, 0)
        })
        AvatarShape.create(avatarEntity2, {
            wearables: [
                "urn:decentraland:off-chain:base-avatars:eyebrows_00",
                "urn:decentraland:off-chain:base-avatars:mouth_00",
                "urn:decentraland:off-chain:base-avatars:eyes_00",
                "urn:decentraland:off-chain:base-avatars:blue_tshirt",
                "urn:decentraland:off-chain:base-avatars:brown_pants",
                "urn:decentraland:off-chain:base-avatars:classic_shoes",
                "urn:decentraland:off-chain:base-avatars:cornrows"
            ],
            id: "dagon-tween-sequence-id",
            name: "Dagon (Sequence Tween)",
            bodyShape: "urn:decentraland:off-chain:base-avatars:BaseMale",
            hairColor: { "r": 0.1281997, "g": 0.597558951, "b": 0.315044141 },
            skinColor: { "r": 0.58, "g": 0.33, "b": 0.16 },
            emotes: []
        })

        Tween.create(avatarEntity2, {
            mode: Tween.Mode.Move({
                start: positionsToGo[0],
                end: positionsToGo[1],
            }),
            duration: 6000,
            easingFunction: EasingFunction.EF_LINEAR,
        })

        TweenSequence.create(avatarEntity2, {
            sequence: [
                {
                    duration: 2000,
                    easingFunction: EasingFunction.EF_LINEAR,
                    mode: Tween.Mode.Move({
                        start: positionsToGo[1],
                        end: positionsToGo[2],
                    }),
                },
                {
                    duration: 6000,
                    easingFunction: EasingFunction.EF_LINEAR,
                    mode: Tween.Mode.Move({
                        start: positionsToGo[2],
                        end: positionsToGo[3],
                    }),
                },
                {
                    duration: 2000,
                    easingFunction: EasingFunction.EF_LINEAR,
                    mode: Tween.Mode.Move({
                        start: positionsToGo[3],
                        end: positionsToGo[0],
                    }),
                },
            ],
            loop: TweenLoop.TL_RESTART,
        })

        const avatarEntity3 = engine.addEntity()
        Transform.create(avatarEntity3, {
            position: Vector3.create(3, 0.1, 3),
            rotation: Quaternion.fromEulerDegrees(0, 180, 0)
        })
        AvatarShape.create(avatarEntity3, {
            wearables: [
                "urn:decentraland:off-chain:base-avatars:eyebrows_00",
                "urn:decentraland:off-chain:base-avatars:mouth_00",
                "urn:decentraland:off-chain:base-avatars:eyes_00",
                "urn:decentraland:off-chain:base-avatars:blue_tshirt",
                "urn:decentraland:off-chain:base-avatars:brown_pants",
                "urn:decentraland:off-chain:base-avatars:classic_shoes",
                "urn:decentraland:off-chain:base-avatars:cornrows"
            ],
            id: "dagon-tween-id",
            name: "Dagon (Normal Tween)",
            bodyShape: "urn:decentraland:off-chain:base-avatars:BaseMale",
            hairColor: { "r": 0.1281997, "g": 0.597558951, "b": 0.315044141 },
            skinColor: { "r": 0.58, "g": 0.33, "b": 0.16 },
            emotes: []
        })

        Tween.create(avatarEntity3, {
            mode: Tween.Mode.Move({
                start: Vector3.create(3, 0.1, 3),
                end: Vector3.create(9, 0.1, 11),
            }),
            duration: 2000,
            easingFunction: EasingFunction.EF_LINEAR,
        })

        engine.removeEntity(cubeButton)
    }
)
