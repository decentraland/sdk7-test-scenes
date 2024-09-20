import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

const uiComponent = () => (
  <UiEntity>
  </UiEntity>
)

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}