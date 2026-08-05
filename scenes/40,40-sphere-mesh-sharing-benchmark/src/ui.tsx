import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { ADD_BATCH, addBoxes, addSpheres, deleteAll, getBoxCount, getSphereCount } from './spawner'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
  <UiEntity
    uiTransform={{
      width: 260,
      height: 260,
      margin: '16px 0 0 16px',
      padding: 8,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start'
    }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
  >
    <Label
      value="Mesh-sharing benchmark"
      fontSize={16}
      color={Color4.White()}
      uiTransform={{ width: '100%', height: 24, margin: '0 0 4px 0' }}
    />
    <Label
      value={`Spheres: ${getSphereCount()}  (shared mesh)`}
      fontSize={14}
      color={Color4.create(0.4, 0.6, 1, 1)}
      uiTransform={{ width: '100%', height: 22 }}
    />
    <Label
      value={`Boxes: ${getBoxCount()}  (mesh per entity)`}
      fontSize={14}
      color={Color4.create(1, 0.4, 0.35, 1)}
      uiTransform={{ width: '100%', height: 22, margin: '0 0 6px 0' }}
    />
    <Button
      uiTransform={{ width: '100%', height: 40, margin: '4px 0' }}
      value={`+${ADD_BATCH} spheres`}
      variant="primary"
      fontSize={14}
      onMouseDown={() => addSpheres()}
    />
    <Button
      uiTransform={{ width: '100%', height: 40, margin: '4px 0' }}
      value={`+${ADD_BATCH} boxes`}
      variant="primary"
      fontSize={14}
      onMouseDown={() => addBoxes()}
    />
    <Button
      uiTransform={{ width: '100%', height: 40, margin: '4px 0' }}
      value="Delete all"
      variant="secondary"
      fontSize={14}
      onMouseDown={() => deleteAll()}
    />
  </UiEntity>
)
