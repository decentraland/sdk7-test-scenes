import { type PBTween } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, {
  Dropdown,
  Input,
  Label,
  UiEntity,
  type JSX
} from '@dcl/sdk/react-ecs'
import { PbTweenUiMode } from './PbTweenModeUi'
import { EasingFunctionKeys } from './utils'

type PbTweenUiProps = {
  tween: PBTween
  onChange: (tween: PBTween) => void
}
export function PbTweenUi(props: PbTweenUiProps): JSX.Element {
  const { tween, onChange } = props

  return (
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
      <Label value="Duration" uiTransform={{ height: 16, width: 'auto' }} />
      <Input
        uiTransform={{ margin: 10, height: 20 }}
        uiBackground={{ color: Color4.White() }}
        color={Color4.Black()}
        onChange={(newValue) => {
          tween.duration = Number(newValue)
          onChange(tween)
        }}
        value={`${tween.duration}`}
      />
      <Label value="Easing" uiTransform={{ height: 16, width: 'auto' }} />
      <Dropdown
        uiTransform={{ margin: 10, height: 20 }}
        uiBackground={{ color: Color4.White() }}
        color={Color4.Black()}
        onChange={(newValue) => {
          tween.easingFunction = Number(newValue)
          onChange(tween)
        }}
        options={EasingFunctionKeys}
        selectedIndex={tween.easingFunction}
      />
      <Label value="Mode" uiTransform={{ height: 16, width: 'auto' }} />
      <PbTweenUiMode
        mode={tween.mode}
        onChange={(mode) => {
          tween.mode = mode
          onChange(tween)
        }}
      />
    </UiEntity>
  )
}
