import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
  <UiEntity
    uiTransform={{
      width: 300,
      height: 60,
      positionType: 'absolute',
      position: { top: 20, left: '50%' },
      margin: '0 0 0 -150px', // Center horizontally by offsetting half the width
      padding: 16,
    }}
    uiBackground={{ color: Color4.create(0.2, 0.2, 0.2, 0.8) }}
  >
    <Label
      value="JSON World"
      fontSize={20}
      color={Color4.White()}
      uiTransform={{
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    />
  </UiEntity>
)

