import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { ADD_BATCH, addSpheres, deleteAll, getSphereCount } from './spawner'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
  // Full-screen wrapper; the panel itself is absolutely positioned against the
  // right edge, 25% down from the top of the screen.
  <UiEntity
    uiTransform={{
      width: '100%',
      height: '100%'
    }}
  >
    <UiEntity
      uiTransform={{
        width: 520,
        height: 460,
        positionType: 'absolute',
        position: { top: '25%', right: 32 },
        padding: 20,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
    >
      <Label
        value="Sphere mesh-sharing benchmark"
        fontSize={32}
        color={Color4.White()}
        uiTransform={{ width: '100%', height: 50, margin: '0 0 8px 0' }}
      />
      <Label
        value={`Spheres: ${getSphereCount()}`}
        fontSize={28}
        color={Color4.create(0.4, 0.6, 1, 1)}
        uiTransform={{ width: '100%', height: 44, margin: '0 0 12px 0' }}
      />
      <Button
        uiTransform={{ width: '100%', height: 90, margin: '8px 0' }}
        value={`+${ADD_BATCH} spheres`}
        variant="primary"
        fontSize={30}
        onMouseDown={() => addSpheres()}
      />
      <Button
        uiTransform={{ width: '100%', height: 90, margin: '8px 0' }}
        value="Delete all"
        variant="secondary"
        fontSize={30}
        onMouseDown={() => deleteAll()}
      />
    </UiEntity>
  </UiEntity>
)
