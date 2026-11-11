import { engine, InputAction, inputSystem, PointerEventType } from '@dcl/sdk/ecs'
import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { state, uiRoot } from './ui'

export function main() {
  ReactEcsRenderer.setUiRenderer(uiRoot)

  // Burns CPU inside the scene tick so one tick outlasts several render frames. The Explorer then runs its
  // throttled scene-UI systems only once per tick while global input keeps running every frame, which is the
  // condition under which UI clicks were dropped (unity-explorer#10542).
  engine.addSystem(function tickStallSystem() {
    state.ticks++

    if (state.stallMs <= 0) return

    const until = Date.now() + state.stallMs
    while (Date.now() < until) {
      // busy wait
    }
  })

  // Counts the global (entity-less) pointer events of the same clicks, so a click that reached the scene but not
  // the button shows up as a gap between the two counters.
  engine.addSystem(function globalPointerCounterSystem() {
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)) state.globalDowns++
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_UP)) state.globalUps++
  })
}
