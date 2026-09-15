import {
  AnyChannel,
  ExplorerUi,
  ExplorerUiEvents,
  OpenExplorerUiResult,
  WaitOutcome,
  openExplorerUiAndWait,
  variant
} from '@dcl/sdk/explorer-ui'
import { Color4 } from '@dcl/sdk/math'
import { COLOR, ROW_Z, button, rowTitle } from './layout'
import { formatNow, pushResult } from './resultsHud'

// The `openExplorerUiAndWait` helper, exercised next to the raw drain in explorerUiEvents.ts —
// both consumption styles must work side by side, and every event the helper consumes must
// still show up in the drain HUD.
//
// One cube per scenario, covering the whole outcome surface on the lifecycle channel alone:
// closed, matched, timedOut and notOpened. Logs use the `[explorerUiWait]` prefix.
//
// Nothing purchase-shaped is exercised here: this explorer build has no EU_ITEM_PURCHASE and
// no producer for the purchase result component. The two-event chain in CHAIN is the same
// mechanic a "purchased, then closed" wait will use.
type Scenario = {
  label: string
  hover: string
  color: Color4
  /** Resolves to the line shown in the HUD, plus the code that colours it. */
  run: () => Promise<{ verdict: string; code: number }>
}

const START_X = 4
const SPACING = 6
const TIMEOUT_MS = 3000

const SCENARIOS: Scenario[] = [
  {
    label: 'CLOSE(MAP)',
    hover: 'await the panel close, collecting nothing',
    color: COLOR.blue,
    // The shorthand overload: one panel, no options, no channels.
    run: async () => describe(await openExplorerUiAndWait(ExplorerUi.EU_MAP))
  },
  {
    label: 'CHAIN(BACKPACK)',
    hover: 'await the close and collect the whole event chain',
    color: COLOR.purple,
    run: async () => {
      const outcome = await openExplorerUiAndWait({ ui: ExplorerUi.EU_BACKPACK }, { collect: [ExplorerUiEvents] })
      if (outcome.$case === 'notOpened') return describe(outcome)
      // Expected: opened, closed — two events, one call, no manual draining.
      const chain = outcome.events.map((collected) => collected.event.event?.$case ?? 'unknown').join('+')
      return { verdict: `${outcome.$case.toUpperCase()} [${chain}]`, code: OpenExplorerUiResult.OPENED }
    }
  },
  {
    label: 'MATCH-OPENED(PLACES)',
    hover: 'resolve as soon as the panel opens, leaving it on screen',
    color: COLOR.teal,
    run: async () =>
      describe(await openExplorerUiAndWait({ ui: ExplorerUi.EU_PLACES }, { until: variant(ExplorerUiEvents, 'opened') }))
  },
  {
    label: `TIMEOUT-${TIMEOUT_MS / 1000}s(SETTINGS)`,
    hover: `await close or ${TIMEOUT_MS / 1000}s, whichever comes first`,
    color: COLOR.grey,
    run: async () => describe(await openExplorerUiAndWait({ ui: ExplorerUi.EU_SETTINGS }, { timeoutMs: TIMEOUT_MS }))
  },
  {
    label: 'DOUBLE(EVENTS)',
    hover: 'two calls back to back; the second one is reported',
    color: COLOR.orange,
    run: async () => {
      // The first wait is left running on purpose — its outcome goes to the log only.
      void report('DOUBLE(EVENTS)#1', openExplorerUiAndWait(ExplorerUi.EU_EVENTS).then(describe))
      // The panel is already spoken for, so the explorer must refuse: NOT_OPENED
      // WAS_ALREADY_OPEN. An OPENED here means the verdict outran the state behind it.
      return describe(await openExplorerUiAndWait(ExplorerUi.EU_EVENTS))
    }
  }
]

export function setupWaitHelperButtons() {
  SCENARIOS.forEach((scenario, index) => {
    button(
      START_X + index * SPACING,
      ROW_Z.wait,
      scenario.color,
      scenario.label,
      `${scenario.label}: ${scenario.hover}`,
      // The pointer handler has to be synchronous, so the promise is reported detached.
      () => {
        console.log(`[explorerUiWait] ${formatNow()} click ${scenario.label} — ${scenario.hover}`)
        void report(scenario.label, scenario.run())
      }
    )
  })

  rowTitle('openExplorerUiAndWait — closed · matched · timedOut · notOpened', ROW_Z.wait)
}

/**
 * Turns any outcome into a HUD line. `code` only drives the colour: the open verdict for
 * notOpened, OPENED for every outcome that did start a session.
 */
function describe<C extends readonly AnyChannel[]>(outcome: WaitOutcome<C>): { verdict: string; code: number } {
  if (outcome.$case === 'notOpened') {
    // A newer explorer can answer with a verdict this build has no name for.
    const name: string | undefined = OpenExplorerUiResult[outcome.openResult]
    return { verdict: `NOT_OPENED ${name ?? outcome.openResult}`, code: outcome.openResult }
  }
  return {
    verdict: `${outcome.$case.toUpperCase()} (${outcome.events.length} collected)`,
    code: OpenExplorerUiResult.OPENED
  }
}

async function report(callLabel: string, outcome: Promise<{ verdict: string; code: number }>): Promise<void> {
  try {
    const { verdict, code } = await outcome
    const time = pushResult(callLabel, code, verdict)
    console.log(`[explorerUiWait] ${time} ${callLabel} -> ${verdict}`)
  } catch (error) {
    // The helper only rejects when an event cannot be attributed to a call, or when the RPC
    // itself fails — both are worth seeing rather than swallowing.
    const time = pushResult(callLabel, -1, 'ERROR')
    console.error(`[explorerUiWait] ${time} ${callLabel} -> ERROR`, error)
  }
}
