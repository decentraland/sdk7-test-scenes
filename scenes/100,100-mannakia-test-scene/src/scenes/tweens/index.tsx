import {
  EasingFunction,
  MeshRenderer,
  Tween,
  TweenLoop,
  TweenSequence,
  type Entity,
  type PBTween,
  type PBTweenSequence
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import ReactEcs, {
  Button,
  Dropdown,
  Label,
  UiEntity,
  type JSX
} from '@dcl/sdk/react-ecs'
import { sceneSystems } from '../../utils/system'
import { UiBox } from '../../utils/ui/box'

import { sceneEntities } from '../../utils/entity'
import { PbTweenUi } from './PbTweenUi'
import { WhiteAlphaBackgroundColor } from './utils'

type State = {
  tween: PBTween
  tweenSequence: PBTweenSequence
  tweenEntity?: Entity
  dirty: boolean

  editingTweenIndex: number
  editingTween: PBTween
  tweenOptions: string[]
}

const state: State = {
  dirty: true,
  tween: {
    mode: Tween.Mode.Move({
      start: Vector3.create(4, 2, 4),
      end: Vector3.create(4, 2, 12),
      faceDirection: true
    }),
    duration: 2000,
    easingFunction: EasingFunction.EF_LINEAR
  },
  tweenSequence: {
    sequence: [],
    loop: TweenLoop.TL_YOYO
  },

  editingTweenIndex: 0,
  editingTween: {} as any,
  tweenOptions: ['Tween']
}
state.editingTween = state.tween

export function main(): void {
  sceneSystems.addSystemWithInverval(
    (_dt) => {
      if (!state.dirty) return

      console.log('Changing tween')
      state.dirty = false
      if (state.tweenEntity !== undefined) {
        sceneEntities.removeEntity(state.tweenEntity)
      }

      const tweenEntity = sceneEntities.addEntity()
      state.tweenEntity = tweenEntity
      MeshRenderer.setBox(tweenEntity)
      Tween.create(tweenEntity, JSON.parse(JSON.stringify(state.tween)))
      TweenSequence.create(
        tweenEntity,
        JSON.parse(JSON.stringify(state.tweenSequence))
      )
    },
    0.1,
    'tween-system'
  )
}

export function MainSceneUi(): JSX.Element {
  return (
    <UiBox width={500} height={400} uiTransform={{ padding: 10 }}>
      <UiEntity>
        <Label value="Select tween" />
        <Dropdown
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.editingTweenIndex = Number(newValue)
            if (state.editingTweenIndex === 0) {
              state.editingTween = state.tween
            } else {
              if (
                state.editingTweenIndex <= state.tweenSequence.sequence.length
              ) {
                state.editingTween =
                  state.tweenSequence.sequence[state.editingTweenIndex - 1]
              } else {
                state.editingTween = state.tween
                console.error(
                  "Can't find tween",
                  state.editingTweenIndex - 1,
                  state.tweenSequence.sequence.length
                )
              }
            }
          }}
          options={state.tweenOptions}
          selectedIndex={state.editingTweenIndex}
        />
        <Label value="Loop Mode" />
        <Dropdown
          uiTransform={{ margin: 10, height: 20 }}
          uiBackground={{ color: Color4.White() }}
          color={Color4.Black()}
          onChange={(newValue) => {
            state.tweenSequence.loop = Number(newValue)
            state.dirty = true
          }}
          options={['TL_RESTART', 'TL_YOYO']}
          selectedIndex={state.tweenSequence.loop}
        />
        <Button
          value="Add Tween"
          uiTransform={{ minHeight: 20, minWidth: 60 }}
          onMouseDown={() => {
            state.tweenSequence.sequence = [
              ...state.tweenSequence.sequence,
              {
                mode: Tween.Mode.Move({
                  start: Vector3.create(4, 2, 4),
                  end: Vector3.create(4, 2, 12),
                  faceDirection: true
                }),
                duration: 2000,
                easingFunction: EasingFunction.EF_LINEAR
              }
            ]

            state.tweenOptions = [
              ...state.tweenOptions,
              `Seq ${state.tweenSequence.sequence.length}`
            ]
            state.dirty = true
            console.log('Adding tween', state.tweenSequence.sequence.length)
          }}
        />

        <Button
          value="Remove current tween"
          uiTransform={{ minHeight: 20, minWidth: 100 }}
          disabled={state.editingTweenIndex === 0}
          onMouseDown={() => {
            if (state.editingTweenIndex > 0) {
              state.tweenSequence.sequence =
                state.tweenSequence.sequence.filter(
                  (_value, index) => index === state.editingTweenIndex
                )
              state.tweenOptions = [
                'Tween',
                ...state.tweenSequence.sequence.map(
                  (_value, index) => `Seq ${index + 1}`
                )
              ]

              state.editingTweenIndex = 0
              state.editingTween = state.tween

              state.dirty = true
            }
          }}
        />
      </UiEntity>

      <UiEntity
        uiTransform={{ flexDirection: 'column' }}
        uiBackground={{ color: WhiteAlphaBackgroundColor }}
      >
        <PbTweenUi
          tween={state.editingTween}
          onChange={(newValue) => {
            console.log('Tween changing', newValue)
            if (state.editingTweenIndex > 0) {
              state.tweenSequence.sequence[state.editingTweenIndex - 1] =
                newValue
            } else {
              state.tween = newValue
            }
            state.dirty = true
          }}
        />
      </UiEntity>
    </UiBox>
  )
}
