import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { startHub } from './hub/state'
import { HubUi } from './hub/ui'

export function main(): void {
  ReactEcsRenderer.setUiRenderer(HubUi)
  startHub()
}
