import { Vector3 } from '@dcl/sdk/math'
import { triggerEmote, triggerSceneEmote } from '~system/RestrictedActions'

import * as utils from '@dcl-sdk/utils'
import { engine, GltfContainer, Transform } from '@dcl/sdk/ecs'

utils.addTestCube({ position: Vector3.create(8, 1, 5) }, () => {
  triggerEmote({ predefinedEmote: 'robot' })
}, "Trigger Avatar Emote")

utils.addTestCube({ position: Vector3.create(8, 1, 8) }, () => {
  triggerSceneEmote({ src: 'animations/Crafting_Snowball.glb', loop: false })
}, "Trigger Scene Emote Craft Snowball")

utils.addTestCube({ position: Vector3.create(8, 1, 12) }, () => {
  triggerSceneEmote({ src: 'animations/Snowball_Throw.glb', loop: false })
}, "Trigger Scene Emote Snowball Throw")


let snowTree = engine.addEntity()

GltfContainer.create(snowTree, { src: "models/SnowTree_01.glb" })
Transform.create(snowTree, {
  position: Vector3.create(12, 0, 10),
  scale: Vector3.create(1, 1, 1)
})