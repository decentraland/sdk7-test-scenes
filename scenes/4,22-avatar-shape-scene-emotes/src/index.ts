import { Vector3, Quaternion } from '@dcl/sdk/math'
import { engine, AvatarShape, GltfContainer, Transform, pointerEventsSystem, MeshRenderer, MeshCollider, TransformType, EventSystemCallback } from '@dcl/sdk/ecs'

const avatarEntity = engine.addEntity()
Transform.create(avatarEntity, {
    position: Vector3.create(12, 0.1, 8),
    rotation: Quaternion.fromEulerDegrees(0, -90, 0)
})
AvatarShape.create(avatarEntity, {
    id: "SceneEmoteAvatar",
    name: "SceneEmoteAvatar",
    bodyShape: "urn:decentraland:off-chain:base-avatars:BaseMale",
    skinColor: {
        "r": 0.9882353,
        "g": 0.8862745,
        "b": 0.768627465
    },
    hairColor: {
        "r": 0.596078455,
        "g": 0.372549027,
        "b": 0.215686277
    },
    eyeColor: {
        "r": 0.372549027,
        "g": 0.223529413,
        "b": 0.196078435
    },
    expressionTriggerId: '',
    wearables: [],
    emotes: []
})


addTestCube({ position: Vector3.create(8, 1, 5) }, () => {
    AvatarShape.getMutable(avatarEntity).expressionTriggerId = 'robot'
}, "robot")

addTestCube({ position: Vector3.create(8, 1, 8) }, () => {
    AvatarShape.getMutable(avatarEntity).expressionTriggerId = 'animations/Crafting_Snowball_emote.glb'
}, "Crafting_Snowball_emote.glb")

addTestCube({ position: Vector3.create(8, 1, 11) }, () => {
    AvatarShape.getMutable(avatarEntity).expressionTriggerId = 'animations/Snowball_Throw_emote.glb'
}, "Snowball_Throw_emote.glb")

addTestCube({ position: Vector3.create(8, 1, 14) }, () => {
    AvatarShape.getMutable(avatarEntity).expressionTriggerId = 'animations/LoveGrenade_emote.glb'
}, "LoveGrenade_emote.glb")

export function addTestCube(transform: Partial<TransformType>, triggeredFunction: EventSystemCallback, label: string) {
  let cube = engine.addEntity();
  Transform.create(cube, transform);
  MeshRenderer.setBox(cube);
  MeshCollider.setBox(cube);
  pointerEventsSystem.onPointerDown(
      {
        entity: cube,
        opts: { button: 0, hoverText: label, showHighlight: false, showFeedback: true }
      },
      triggeredFunction
  )
  return cube;
}