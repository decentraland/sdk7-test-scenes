import { Color4 } from '@dcl/sdk/math'
import ReactEcs, {
  Label,
  UiEntity,
  type JSX,
  Dropdown,
  ReactEcsRenderer
} from '@dcl/sdk/react-ecs'
import { sceneEntities } from '../../utils/entity'
import { sceneSystems } from '../../utils/system'
import { scenesOptions } from './scenes'

function nullUi(): JSX.Element {
  return <UiEntity></UiEntity>
}

export function setupUi(element?: () => JSX.Element, extended?: boolean): void {
  if (element !== undefined) {
    const uiComponent =
      extended === true
        ? (): any => [MainSceneUi(), ...(element as any)()]
        : (): any => [MainSceneUi(), element()]
    ReactEcsRenderer.setUiRenderer(uiComponent)
  } else {
    ReactEcsRenderer.setUiRenderer(MainSceneUi)
  }
}

let sceneIndex = 0
export function setChangeScene(newSceneIndex: number): void {
  if (newSceneIndex === sceneIndex) return
  sceneIndex = newSceneIndex

  sceneEntities.clean()
  sceneSystems.clean()
  ReactEcsRenderer.setUiRenderer(nullUi)
  const newScene = scenesOptions[sceneIndex]

  if (newScene.mainFn !== undefined) {
    newScene.mainFn()
  }

  setupUi(newScene.ui, newScene.extended)
}

export function MainSceneUi(): JSX.Element {
  return (
    <UiEntity
      uiTransform={{
        position: { left: 0, top: 0 },
        positionType: 'absolute',
        height: '100%',
        width: '100%'
      }}
    >
      <UiEntity
        uiBackground={{ color: Color4.Blue() }}
        uiTransform={{
          flexDirection: 'column',
          height: 120,
          width: 350,
          positionType: 'absolute',
          position: { right: '5%', top: '5%' }
        }}
      >
        <Label
          textAlign="middle-center"
          value="Choose the scene"
          fontSize={24}
          uiTransform={{ margin: 10, width: '100%', height: 36 }}
        />

        <Dropdown
          options={scenesOptions.map((item) => item.name)}
          color={Color4.Red()}
          font="sans-serif"
          fontSize={14}
          selectedIndex={sceneIndex}
          onChange={setChangeScene}
          uiTransform={{
            width: '100%',
            height: 48,
            padding: 5
          }}
          uiBackground={{ color: Color4.Gray() }}
        />
      </UiEntity>
    </UiEntity>
  )
}
