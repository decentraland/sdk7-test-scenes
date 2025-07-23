// We define the empty imports so the auto-complete feature works as expected.
import { } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import { initAssetPacks } from '@dcl/asset-packs/dist/scene-entrypoint'
import { changeColorSystem, circularSystem } from './systems'
import { setupUi } from './ui'

// You can remove this if you don't use any asset packs
initAssetPacks(engine)

export function main() {
  // Defining behavior. See `src/systems.ts` file.
  engine.addSystem(circularSystem)
  engine.addSystem(changeColorSystem)

  // draw UI. Here is the logic to spawn cubes.
  setupUi()
}
