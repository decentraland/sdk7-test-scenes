import { ExplorerUi, TextShape, engine } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { openExplorerUi, OpenExplorerUiResult } from '~system/RestrictedActions'
import { COLOR, ROW_Z, button, label, rowTitle } from './layout'
import { formatNow, pushResult } from './resultsHud'

// The raw `openExplorerUi` restricted action, called directly rather than through the SDK
// helper, so the verdict and the event stream can be checked independently of it.
//
// Row 1 (panels): one cube per ExplorerUi value — the happy path.
// Row 2 (gates): calls the explorer must refuse — no user gesture, a second call while the
// panel is already spoken for, an unknown enum value — plus an on-start call fired from
// main() with no gesture at all.
interface PanelButton {
  ui: ExplorerUi
  name: string
  color: Color4
}

const PANELS: PanelButton[] = [
  { ui: ExplorerUi.EU_MAP, name: 'MAP', color: COLOR.blue },
  { ui: ExplorerUi.EU_SETTINGS, name: 'SETTINGS', color: COLOR.grey },
  { ui: ExplorerUi.EU_BACKPACK, name: 'BACKPACK', color: COLOR.purple },
  { ui: ExplorerUi.EU_CAMERA_REEL, name: 'CAMERA_REEL', color: COLOR.orange },
  { ui: ExplorerUi.EU_COMMUNITIES, name: 'COMMUNITIES', color: COLOR.cyan },
  { ui: ExplorerUi.EU_PLACES, name: 'PLACES', color: COLOR.green },
  { ui: ExplorerUi.EU_EVENTS, name: 'EVENTS', color: COLOR.red }
]

const PANEL_START_X = 4
const PANEL_SPACING = 4
const DELAYED_CALL_SECONDS = 5

export function setupOpenExplorerUiButtons() {
  PANELS.forEach((panel, index) => {
    button(PANEL_START_X + index * PANEL_SPACING, ROW_Z.panels, panel.color, panel.name, `Open ${panel.name}`, () => {
      console.log(`[openExplorerUi] ${formatNow()} click ${panel.name}`)
      call(panel.name, panel.ui)
    })
  })

  rowTitle('openExplorerUi — one cube per panel', ROW_Z.panels)

  makeDelayedCallButton(8)
  makeDoubleCallButton(16)
  makeInvalidValueButton(24)

  rowTitle(
    'Gates — DELAYED: NO_USER_GESTURE (5) · DOUBLE: one panel only · INVALID: FEATURE_DISABLED (4)',
    ROW_Z.gates
  )

  console.log(`[openExplorerUi] ${formatNow()} scene ready — firing the no-gesture ON-START call`)

  // Fired from main() without any pointer event: LastUserInputTick is still 0, so the
  // explorer must reject with REJECTED_NO_USER_GESTURE (5).
  call('ON-START(MAP)', ExplorerUi.EU_MAP)
}

// Every cube but DOUBLE CALL leaves `requestId` unset, so the event drain also shows what the
// explorer does with a call that asked for no correlation: it reports `req 0`.
function call(callLabel: string, ui: ExplorerUi, requestId?: number): void {
  console.log(`[openExplorerUi] ${formatNow()} request ${callLabel} (ui=${ui}, requestId=${requestId ?? 'none'})`)

  openExplorerUi({ ui, requestId })
    .then(({ openResult }) => {
      const verdict = OpenExplorerUiResult[openResult] ?? `UNKNOWN_${openResult}`
      const time = pushResult(callLabel, openResult, verdict)
      console.log(`[openExplorerUi] ${time} verdict ${callLabel} -> ${verdict} (${openResult})`)
    })
    .catch((err) => {
      const time = pushResult(callLabel, -1, 'RPC_ERROR')
      console.error(`[openExplorerUi] ${time} verdict ${callLabel} -> RPC_ERROR`, err)
    })
}

// Waits out the user-gesture window before calling, so the verdict must be
// REJECTED_NO_USER_GESTURE (5) — or REJECTED_NOT_CURRENT_SCENE (3) if the player manages to
// leave the scene during the countdown.
function makeDelayedCallButton(x: number): void {
  const countdownLabel = label(`DELAYED ${DELAYED_CALL_SECONDS}s`, Vector3.create(x, 2.2, ROW_Z.gates))
  let remaining = 0

  engine.addSystem((dt) => {
    if (remaining <= 0) return
    remaining -= dt

    if (remaining <= 0) {
      TextShape.getMutable(countdownLabel).text = `DELAYED ${DELAYED_CALL_SECONDS}s`
      console.log(`[openExplorerUi] ${formatNow()} delayed countdown finished`)
      call('DELAYED(MAP)', ExplorerUi.EU_MAP)
    } else {
      TextShape.getMutable(countdownLabel).text = `DELAYED\n${remaining.toFixed(1)}s...`
    }
  })

  button(
    x,
    ROW_Z.gates,
    COLOR.yellow,
    '',
    `Call openExplorerUi in ${DELAYED_CALL_SECONDS}s (expect NO_USER_GESTURE)`,
    () => {
      console.log(
        `[openExplorerUi] ${formatNow()} click DELAYED — countdown ${DELAYED_CALL_SECONDS}s started, don't click anything`
      )
      remaining = DELAYED_CALL_SECONDS
    }
  )
}

// Two calls from one click, simulating rapid clicks: exactly one panel must open, the second
// call must be told WAS_ALREADY_OPEN (2), and the one panel that does open must report both
// its events under 101 — the id of the call that actually got it.
function makeDoubleCallButton(x: number): void {
  button(
    x,
    ROW_Z.gates,
    COLOR.teal,
    'DOUBLE CALL',
    'Call openExplorerUi twice as req 101 and 102 (expect a single panel)',
    () => {
      console.log(`[openExplorerUi] ${formatNow()} click DOUBLE CALL — firing two calls back-to-back`)
      call('DOUBLE#1(MAP)', ExplorerUi.EU_MAP, 101)
      call('DOUBLE#2(MAP)', ExplorerUi.EU_MAP, 102)
    }
  )
}

// 99 is not a member of the ExplorerUi enum: the explorer cannot map it to a panel and must
// reject with REJECTED_FEATURE_DISABLED (4).
function makeInvalidValueButton(x: number): void {
  button(x, ROW_Z.gates, COLOR.maroon, 'INVALID (99)', 'Send unknown ui value 99 (expect FEATURE_DISABLED)', () => {
    console.log(`[openExplorerUi] ${formatNow()} click INVALID (99)`)
    call('INVALID(99)', 99 as ExplorerUi)
  })
}
