import { Vector3, Color4, Quaternion } from '@dcl/sdk/math'
import { engine, ColliderLayer, AvatarShape, Transform, MeshRenderer, MeshCollider, pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'

const avatarShapeSpawner1 = engine.addEntity()
MeshRenderer.setBox(avatarShapeSpawner1)
MeshCollider.setBox(avatarShapeSpawner1, ColliderLayer.CL_POINTER)
Transform.create(avatarShapeSpawner1, { position: Vector3.create(7, 1, 4), scale: Vector3.create(0.5, 0.5, 0.5) })
pointerEventsSystem.onPointerDown(
    { entity: avatarShapeSpawner1, opts: { button: InputAction.IA_POINTER, hoverText: 'spawn avatar 1', maxDistance: 5 } },
    () => {
        const avatarShapeEntity1 = engine.addEntity()
        Transform.create(avatarShapeEntity1, {
            position: Vector3.create(7, 0.1, 8),
            rotation: Quaternion.fromEulerDegrees(0, 180, 0)
        })
        AvatarShape.create(avatarShapeEntity1, {
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
    }
)

const avatarShapeSpawner2 = engine.addEntity()
MeshRenderer.setBox(avatarShapeSpawner2)
MeshCollider.setBox(avatarShapeSpawner2, ColliderLayer.CL_POINTER)
Transform.create(avatarShapeSpawner2, { position: Vector3.create(10, 1, 4), scale: Vector3.create(0.5, 0.5, 0.5) })
pointerEventsSystem.onPointerDown(
    { entity: avatarShapeSpawner2, opts: { button: InputAction.IA_POINTER, hoverText: 'spawn avatar 2', maxDistance: 5 } },
    () => {
        const avatarShapeEntity2 = engine.addEntity()
        Transform.create(avatarShapeEntity2, {
            position: Vector3.create(10, 0.1, 8),
            rotation: Quaternion.fromEulerDegrees(0, 180, 0)
        })
        AvatarShape.create(avatarShapeEntity2, {
            wearables: [
                "urn:decentraland:off-chain:base-avatars:eyebrows_00",
                "urn:decentraland:off-chain:base-avatars:mouth_00",
                "urn:decentraland:off-chain:base-avatars:eyes_00",
                "urn:decentraland:ethereum:collections-v1:xmas_2019:santa_facial_hair",
                "urn:decentraland:matic:collections-v2:0x4334a820f556a54845a35f8aad5986aecdf07d43:1",
                "urn:decentraland:matic:collections-v2:0x3a53afcd4f3a40953fa1217a56265909bb2f6309:0",
                "urn:decentraland:ethereum:collections-v1:sugarclub_yumi:yumi_retro_shades_eyewear",
                "urn:decentraland:matic:collections-v2:0x4334a820f556a54845a35f8aad5986aecdf07d43:0"
            ],
            id: "cthulhu-id",
            name: "Cthulhu",
            hairColor: Color4.Red(),
            skinColor: Color4.Green(),
            emotes: []
        })
    }
)
