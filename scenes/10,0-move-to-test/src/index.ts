// We define the empty imports so the auto-complete feature works as expected.
import { } from '@dcl/sdk/math'
import { engine} from '@dcl/sdk/ecs'

import {movePlayerSystem, circularSystem} from './systems'
import { setupUi } from './ui'

export function main() {
  // Defining behavior. See `src/systems.ts` file.
  engine.addSystem(circularSystem)
  engine.addSystem(movePlayerSystem)

  // draw UI. Here is the logic to spawn cubes.
  setupUi()
}
