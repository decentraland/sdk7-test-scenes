import { ExplorerUi, InputAction, PointerEventType, engine, inputSystem } from '@dcl/sdk/ecs'
import { call } from './openExplorerUiButtons'
import { formatNow } from './resultsHud'

// The user-gesture gate accepts three sources: a click on a 3D entity (the cubes), a click on
// scene UI (the button in ui.tsx), and a global input action with no entity target (the keys
// below). Hover events never count. Each call is made in the same tick as the input, and its
// verdict lands in the right-hand "Call results" HUD.

const KEY_BINDINGS: { action: InputAction; key: string; ui: ExplorerUi; name: string }[] = [
  { action: InputAction.IA_PRIMARY, key: 'E', ui: ExplorerUi.EU_MAP, name: 'MAP' },
  { action: InputAction.IA_SECONDARY, key: 'F', ui: ExplorerUi.EU_SETTINGS, name: 'SETTINGS' },
  { action: InputAction.IA_ACTION_3, key: '1', ui: ExplorerUi.EU_BACKPACK, name: 'BACKPACK' },
  { action: InputAction.IA_ACTION_4, key: '2', ui: ExplorerUi.EU_CAMERA_REEL, name: 'CAMERA_REEL' },
  { action: InputAction.IA_ACTION_5, key: '3', ui: ExplorerUi.EU_COMMUNITIES, name: 'COMMUNITIES' },
  { action: InputAction.IA_ACTION_6, key: '4', ui: ExplorerUi.EU_PLACES, name: 'PLACES' }
]

export const KEY_HINT = KEY_BINDINGS.map((b) => `${b.key}=${b.name}`).join('  ')

// Called from the React-ECS button's onMouseDown: scene-UI click as the gesture source.
export function openFromUiClick(): void {
  console.log(`[openExplorerUi] ${formatNow()} scene-UI click`)
  call('UI-CLICK(MAP)', ExplorerUi.EU_MAP)
}

export function setupGestureSources(): void {
  engine.addSystem(() => {
    for (const b of KEY_BINDINGS) {
      if (inputSystem.isTriggered(b.action, PointerEventType.PET_DOWN)) {
        console.log(`[openExplorerUi] ${formatNow()} global key ${b.key} (no entity target)`)
        call(`KEY-${b.key}(${b.name})`, b.ui)
      }
    }
  }, 0, 'explorerUiGestureKeys')
}
