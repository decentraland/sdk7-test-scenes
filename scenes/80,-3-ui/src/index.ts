// We define the empty imports so the auto-complete feature works as expected.
import { } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'

import { setupRawTextWrapTest } from './raw-text-wrap'
import { changeColorSystem, circularSystem, flexBasisToggleSystem } from './systems'
import { setupUi } from './ui'

export function main() {
  // Defining behavior. See `src/systems.ts` file.
  engine.addSystem(circularSystem)
  engine.addSystem(changeColorSystem)
  engine.addSystem(flexBasisToggleSystem)

  // draw UI. Here is the logic to spawn cubes.
  setupUi()

  // Raw-SDK UiText wrap cases. See `src/raw-text-wrap.ts` file.
  setupRawTextWrapTest()
}
