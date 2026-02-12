// We define the empty imports so the auto-complete feature works as expected.
import { Vector2 } from '@dcl/sdk/math'
import { setupUi } from './ui'
import { engine, UiCanvasInformation } from "@dcl/sdk/ecs"

let timer = 0
let canvasInfoTimer = 0.5
let lastScreenSize = Vector2.Zero()
export let uiScaleFactor = 1

export function main() {
  engine.addSystem((dt) => {
    timer += dt

    if (timer <= canvasInfoTimer) return
    timer = 0

    const uiCanvasInfo = UiCanvasInformation.getOrNull(engine.RootEntity)

    if (!uiCanvasInfo) return
    
    if (lastScreenSize.x === uiCanvasInfo.width && lastScreenSize.y === uiCanvasInfo.height) return
    lastScreenSize = Vector2.create(uiCanvasInfo.width, uiCanvasInfo.height)

    const newScaleFactor = Math.min(uiCanvasInfo.width / 1920, uiCanvasInfo.height / 1080)

    if (newScaleFactor !== uiScaleFactor) {
      uiScaleFactor = newScaleFactor
    }
  })
  
  setupUi()
}
