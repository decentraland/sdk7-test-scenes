import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { ADD_BATCH, addBoxes, addSpheres, deleteAll, getBoxCount, getSphereCount } from './spawner'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
  // Full-screen wrapper: pin the panel to the vertical middle of the right edge.
  <UiEntity
    uiTransform={{
      width: '100%',
      height: '100%',
      flexDirection: 'row',
      alignItems: 'center', // vertical center → "mid"
      justifyContent: 'flex-end' // right edge
    }}
  >
    <UiEntity
      uiTransform={{
        width: 520,
        height: 620,
        margin: '0 32px 0 0',
        padding: 20,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
    >
      <Label
        value="Mesh-sharing benchmark"
        fontSize={34}
        color={Color4.White()}
        uiTransform={{ width: '100%', height: 50, margin: '0 0 8px 0' }}
      />
      <Label
        value={`Spheres: ${getSphereCount()}  (shared mesh)`}
        fontSize={26}
        color={Color4.create(0.4, 0.6, 1, 1)}
        uiTransform={{ width: '100%', height: 40 }}
      />
      <Label
        value={`Boxes: ${getBoxCount()}  (mesh per entity)`}
        fontSize={26}
        color={Color4.create(1, 0.4, 0.35, 1)}
        uiTransform={{ width: '100%', height: 40, margin: '0 0 12px 0' }}
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
        value={`+${ADD_BATCH} boxes`}
        variant="primary"
        fontSize={30}
        onMouseDown={() => addBoxes()}
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
