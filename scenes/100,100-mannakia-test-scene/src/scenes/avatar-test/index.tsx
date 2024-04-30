import {
  AvatarEmoteCommand,
  PlayerIdentityData,
  engine,
  type DeepReadonlyObject,
  type Entity,
  type PBAvatarEmoteCommand,
  AvatarShape
} from '@dcl/sdk/ecs'
import ReactEcs, { Label, type JSX } from '@dcl/sdk/react-ecs'
import { UiBox } from '../../utils/ui/box'
import * as observables from '@dcl/sdk/observables'
import * as utils from '@dcl-sdk/utils'
import { Vector3 } from '@dcl/sdk/math'
import { triggerEmote, triggerSceneEmote } from '~system/RestrictedActions'
import { sceneEntities } from '../../utils/entity'
import { sceneSystems } from '../../utils/system'

export function main(): void {
  observables.onPlayerExpressionObservable.add((expressionId) => {
    console.log({ playerExpressionId: expressionId })
  })

  sceneEntities.pushEntity(
    utils.addTestCube({ position: Vector3.create(8, 1, 5) }, () => {
      console.log('triggering emote')
      triggerSceneEmote({
        src: 'assets/animations/Pose.glb',
        loop: true
      }).catch(console.error)
    })
  )

  sceneEntities.pushEntity(
    utils.addTestCube({ position: Vector3.create(8, 1, 8) }, () => {
      console.log('triggering emote')
      triggerSceneEmote({
        src: 'assets/animations/Crafting_Snowball.glb',
        loop: false
      }).catch(console.error)
    })
  )

  sceneEntities.pushEntity(
    utils.addTestCube({ position: Vector3.create(8, 1, 12) }, () => {
      triggerEmote({ predefinedEmote: 'wave' }).catch(console.error)
    })
  )

  const avatarEntity = sceneEntities.addEntity()
  AvatarShape.create(avatarEntity, {
    ...AvatarShape.schema.create(),

    wearables: [
      'urn:decentraland:off-chain:base-avatars:eyes_00',
      'urn:decentraland:off-chain:base-avatars:eyebrows_00',
      'urn:decentraland:off-chain:base-avatars:mouth_00',
      'urn:decentraland:off-chain:base-avatars:casual_hair_01',
      'urn:decentraland:off-chain:base-avatars:beard',
      'urn:decentraland:off-chain:base-avatars:m_greenflipflops',
      'urn:decentraland:matic:collections-v2:0xfb1d9d5dbb92f2dccc841bd3085081bb1bbeb04d:0:262',
      'urn:decentraland:matic:collections-v2:0xfb1d9d5dbb92f2dccc841bd3085081bb1bbeb04d:16:1684996666696914987166688442938726917102321526408785780068975640749',
      'urn:decentraland:matic:collections-v2:0x0dc28547b88100eb6b3f3890f0501607aa5dd6be:0:2783',
      'urn:decentraland:matic:collections-v2:0x8ae1f9f24ffb53806721a8de2ab7af9be39e635d:17:1790308958365472173864606470622397349421216621809334891323286624083'
    ]
  })
  let lastEmoteUrn = ''

  sceneSystems.addSystemWithInverval(
    (_dt) => {
      const playerEmotes = Array.from(
        AvatarEmoteCommand.get(engine.PlayerEntity)
      )
      if (playerEmotes.length === 0) return

      const lastEmote = playerEmotes[playerEmotes.length - 1]
      if (lastEmote.emoteUrn !== lastEmoteUrn) {
        lastEmoteUrn = lastEmote.emoteUrn
        AvatarEmoteCommand.addValue(avatarEntity, lastEmote)
      }
    },
    1,
    'avatar-test-system'
  )
}

function getEmotes(): Array<
  [Entity, DeepReadonlyObject<PBAvatarEmoteCommand>]
> {
  const allEmotes: Array<[Entity, DeepReadonlyObject<PBAvatarEmoteCommand>]> =
    []
  for (const [entity] of engine.getEntitiesWith(PlayerIdentityData)) {
    for (const data of AvatarEmoteCommand.get(entity)) {
      allEmotes.push([entity, data])
    }
  }
  return allEmotes
}

export function UI(): JSX.Element {
  const emotes = getEmotes()
  return (
    <UiBox width={400} height={100} uiTransform={{ padding: 10 }}>
      <Label value="Check the console logs" uiTransform={{ height: 30 }} />
      <Label
        value={`Users in this scene: ${
          Array.from(engine.getEntitiesWith(PlayerIdentityData)).length
        }`}
        uiTransform={{ height: 30 }}
      />
      <Label
        value={`Emotes triggered in this scene: ${emotes.length}`}
        uiTransform={{ height: 30 }}
      />
      {emotes.length > 0 && (
        <Label
          value={`${JSON.stringify(emotes[emotes.length - 1])}`}
          uiTransform={{ height: 30 }}
        />
      )}
    </UiBox>
  )
}
