import { Vector3 } from '@dcl/sdk/math'
import { triggerEmote, triggerSceneEmote } from '~system/RestrictedActions'
import { engine, GltfContainer, Transform, pointerEventsSystem, MeshRenderer, MeshCollider, TransformType, EventSystemCallback, AvatarEmoteMask } from '@dcl/sdk/ecs'

addTestCube({ position: Vector3.create(8, 1, 2) }, () => {
  triggerEmote({ predefinedEmote: 'robot' })
}, "robot")

addTestCube({ position: Vector3.create(8, 1, 4) }, () => {
  triggerSceneEmote({ src: 'animations/Crafting_Snowball_emote.glb', loop: false })
}, "Crafting_Snowball_emote.glb")

// Not working on purpose, because the naming doesn't have "_emote"
addTestCube({ position: Vector3.create(8, 1, 6) }, () => {
  triggerSceneEmote({ src: 'animations/Snowball_Throw.glb', loop: false })
}, "Snowball_Throw.glb")

addTestCube({ position: Vector3.create(8, 1, 8) }, () => {
    triggerSceneEmote({ src: 'animations/LoveGrenade_emote.glb', loop: true })
}, "LoveGrenade_emote.glb")

addTestCube({ position: Vector3.create(8, 1, 10) }, () => {
  triggerSceneEmote({ src: 'animations/Crafting_Snowball_emote.glb', loop: true, mask: AvatarEmoteMask.AEM_UPPER_BODY })
}, "Crafting_Snowball_emote.glb (upper body)")

let snowTree = engine.addEntity()

GltfContainer.create(snowTree, { src: "models/SnowTree_01.glb" })
Transform.create(snowTree, {
  position: Vector3.create(12, 0, 10),
  scale: Vector3.create(1, 1, 1)
})

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