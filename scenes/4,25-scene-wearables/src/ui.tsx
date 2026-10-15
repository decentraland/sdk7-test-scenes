import ReactEcs, { ReactEcsRenderer, Label, UiEntity, Button } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { SCENE_WEARABLES, getWornNames, isWorn, toggleWearable, takeOffAll, getNpcOutfitLabel } from './sceneWearables'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
}

const wearablesPanel = () => {
  const worn = getWornNames()
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 180, left: 80 },
        width: 300,
        flexDirection: 'column',
        padding: 12
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
    >
      <Label value="Scene wearables" fontSize={20} color={Color4.White()} textAlign="middle-left" />
      {SCENE_WEARABLES.map((w) => (
        <Button
          key={w.name}
          value={`${isWorn(w.name) ? 'Take off' : 'Wear'} ${w.name}`}
          variant={isWorn(w.name) ? 'primary' : 'secondary'}
          fontSize={16}
          uiTransform={{ width: '100%', height: 36, margin: { top: 4 } }}
          onMouseDown={() => toggleWearable(w.name)}
        />
      ))}
      <Button
        value="Take off all"
        fontSize={16}
        uiTransform={{ width: '100%', height: 36, margin: { top: 8 } }}
        onMouseDown={() => takeOffAll()}
      />
      <Label
        value={`Worn: ${worn.length ? worn.join(', ') : '-'}`}
        fontSize={14}
        color={Color4.create(0.8, 0.8, 0.8, 1)}
        textAlign="middle-left"
        uiTransform={{ margin: { top: 8 } }}
      />
      <Label
        value={`NPC outfit: ${getNpcOutfitLabel()}`}
        fontSize={14}
        color={Color4.create(0.8, 0.8, 0.8, 1)}
        textAlign="middle-left"
      />
    </UiEntity>
  )
}

export const uiMenu = () => <UiEntity uiTransform={{ width: '100%', height: '100%' }}>{wearablesPanel()}</UiEntity>
