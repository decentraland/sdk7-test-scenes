import { Color3, Vector3 } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import { addLight, setupBlackRoom, setupCornellBox, setupStage } from './utils'

export function main() {
  const redLight = engine.getEntityOrNullByName('RedLight')
  const greenLight = engine.getEntityOrNullByName('GreenLight')
  addLight(
    redLight,
    true,
    25,
    1500,
    Color3.Red(),
    Vector3.create(90, 0, 0),
    true,
    undefined,
    40,
    40
  )
  addLight(
    greenLight,
    true,
    25,
    1500,
    Color3.Green(),
    Vector3.create(90, 0, 0),
    true,
    undefined,
    40,
    40
  )

  const pbrNameSuffix = '_PBR'
  const basicNameSuffix = '_Basic'

  setupCornellBox(pbrNameSuffix)
  setupCornellBox(basicNameSuffix)
  setupStage()
  setupBlackRoom()
}
