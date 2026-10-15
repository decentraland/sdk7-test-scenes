import { ExplorerUi, InputAction, PointerEventType, engine, inputSystem } from '@dcl/sdk/ecs'
import { OpenExplorerUiResult, openExplorerUi } from '~system/RestrictedActions'
import { call } from './openExplorerUiButtons'
import { formatNow, pushResult } from './resultsHud'

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
    // While the poll runs it must be the only caller: a key call here would take the panel first
    // and leave the poll with WAS_ALREADY_OPEN, so E could never show up as a POLL(MAP) OPENED.
    // The key press still registers as a gesture in the explorer, the scene just doesn't call.
    if (pollState.enabled) return
    for (const b of KEY_BINDINGS) {
      if (inputSystem.isTriggered(b.action, PointerEventType.PET_DOWN)) {
        console.log(`[openExplorerUi] ${formatNow()} global key ${b.key} (no entity target)`)
        call(`KEY-${b.key}(${b.name})`, b.ui)
      }
    }
  }, 0, 'explorerUiGestureKeys')
}

// Poll: calls openExplorerUi(EU_MAP) on every tick where no earlier poll call is still pending,
// with no user input of its own. Movement keys (WASD, jump, walk, sprint) must not count as a
// gesture, so on a fixed build this only ever grows "rejected". Starts POLL_START_DELAY_SECONDS after switching ON because the click on the
// toggle is itself a UI gesture and could legitimately open the map.
const POLL_START_DELAY_SECONDS = 1

export const pollState = { enabled: false, noGesture: 0, otherRejected: 0, opened: 0, alreadyOpen: 0 }

let pollDelayRemaining = 0
let pollPending = false
// Bumped on every toggle. A call still in flight from an earlier session (or from before OFF)
// resolves with a stale generation and is dropped, so it can't bump the counters or the dedup.
let pollGeneration = 0
let pollLastCode: number | undefined

export function togglePoll(): void {
  pollState.enabled = !pollState.enabled
  pollGeneration++
  pollPending = false
  pollDelayRemaining = pollState.enabled ? POLL_START_DELAY_SECONDS : 0
  pollLastCode = undefined
  console.log(`[openExplorerUi] ${formatNow()} poll ${pollState.enabled ? 'ON (starts in 1s)' : 'OFF'}`)
}

export function pollSummary(): string {
  const { noGesture, otherRejected, opened, alreadyOpen } = pollState
  const other = otherRejected + alreadyOpen > 0 ? `, ${alreadyOpen} already open, ${otherRejected} other` : ''
  return `poll: ${noGesture} rejected (no gesture), ${opened} opened${other}`
}

function pollOnce(): void {
  const generation = pollGeneration
  const isStale = () => generation !== pollGeneration
  pollPending = true
  openExplorerUi({ ui: ExplorerUi.EU_MAP })
    .then(({ openResult }) => {
      if (isStale()) return
      const verdict = OpenExplorerUiResult[openResult] ?? `UNKNOWN_${openResult}`
      if (openResult === OpenExplorerUiResult.OPENED) pollState.opened++
      else if (openResult === OpenExplorerUiResult.WAS_ALREADY_OPEN) pollState.alreadyOpen++
      else if (openResult === OpenExplorerUiResult.REJECTED_NO_USER_GESTURE) pollState.noGesture++
      else pollState.otherRejected++

      const opened = openResult === OpenExplorerUiResult.OPENED
      if (opened || openResult !== pollLastCode) {
        const time = pushResult('POLL(MAP)', openResult, verdict)
        if (opened) console.log(`[openExplorerUi] ${time} POLL(MAP) OPENED (${openResult})`)
      }
      pollLastCode = openResult
    })
    .catch((err) => {
      if (isStale()) return
      console.error(`[openExplorerUi] ${formatNow()} POLL(MAP) RPC_ERROR`, err)
      if (pollLastCode !== -1) pushResult('POLL(MAP)', -1, 'RPC_ERROR')
      pollLastCode = -1
    })
    .finally(() => {
      if (!isStale()) pollPending = false
    })
}

export function setupGesturePoll(): void {
  engine.addSystem((dt: number) => {
    if (!pollState.enabled) return
    if (pollDelayRemaining > 0) {
      pollDelayRemaining -= dt
      return
    }
    if (!pollPending) pollOnce()
  }, 0, 'explorerUiGesturePoll')
}
