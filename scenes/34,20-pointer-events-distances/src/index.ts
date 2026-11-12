import { engine } from '@dcl/sdk/ecs'
import { setupLanes, updateLaneLabels } from './lanes'
import { setupCameras } from './cameras'
import { setupUi } from './ui'

export function main() {
  setupLanes()
  setupCameras()
  setupUi()

  engine.addSystem(updateLaneLabels)
}
