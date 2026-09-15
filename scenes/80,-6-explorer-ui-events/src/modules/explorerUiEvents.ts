import { ExplorerUi, ExplorerUiEventsResult, engine } from '@dcl/sdk/ecs'
import { formatNow } from './resultsHud'

// The explorer appends one PBExplorerUiEventsResult per panel lifecycle event to the scene
// root entity, so the scene learns that a panel it asked for was actually shown, and later
// dismissed — including dismissals it never requested (the player pressing Escape).
// Everything logs with the `[explorerUiEvents]` prefix so it is filterable in explorer logs.
export interface UiEvent {
  time: string
  tick: number
  panel: string
  kind: string
  requestId: number
}

// ExplorerUi is generated as a `const enum`, so it carries no usable reverse mapping —
// indexing it with a variable is a compile error. Hence the explicit table.
const PANEL_NAMES: Record<number, string> = {
  [ExplorerUi.EU_SETTINGS]: 'SETTINGS',
  [ExplorerUi.EU_MAP]: 'MAP',
  [ExplorerUi.EU_BACKPACK]: 'BACKPACK',
  [ExplorerUi.EU_CAMERA_REEL]: 'CAMERA_REEL',
  [ExplorerUi.EU_COMMUNITIES]: 'COMMUNITIES',
  [ExplorerUi.EU_PLACES]: 'PLACES',
  [ExplorerUi.EU_EVENTS]: 'EVENTS'
}

const MAX_EVENTS = 8

export const uiEvents: UiEvent[] = []

// Diagnostics for the HUD: an empty event list on its own cannot tell "the explorer never
// wrote the component" apart from "the drain never ran". setSize is the raw element count on
// the root entity, before any windowing.
export const drainStatus = { running: false, setSize: 0, ticks: 0 }

// The value set is never cleared — it accumulates for the lifetime of the scene and keeps
// the 100 newest by timestamp, so it is not a journal that can be re-read from the start
// and consumed elements cannot be tracked by counting.
//
// Progress is tracked the way `input.ts` does it for PointerEventsResult: remember the
// highest timestamp seen last tick and process the window (prevMax, curMax]. Several events
// sharing one timestamp all fall inside the window and are all processed, which is the case
// a grow-only set exists for. `timestamp` is the explorer tick the event happened on, so
// equal timestamps are ordinary, not a defect.
let previousFrameMaxTimestamp = -1

export function setupExplorerUiEvents() {
  engine.addSystem(drainExplorerUiEvents)
  console.log(`[explorerUiEvents] ${formatNow()} watching the scene root entity for panel events`)
}

function drainExplorerUiEvents(): void {
  // get() answers with an empty set while the component is still absent, so this needs no
  // has() guard despite what the SDK's TSDoc claims.
  const events = ExplorerUiEventsResult.get(engine.RootEntity)

  drainStatus.running = true
  drainStatus.setSize = events.size
  drainStatus.ticks++

  let currentFrameMaxTimestamp = previousFrameMaxTimestamp

  for (const event of events) {
    if (event.timestamp > currentFrameMaxTimestamp) currentFrameMaxTimestamp = event.timestamp
  }

  for (const event of events) {
    if (event.timestamp > previousFrameMaxTimestamp && event.timestamp <= currentFrameMaxTimestamp) {
      record(event.ui, event.event?.$case, event.timestamp, event.requestId)
    }
  }

  previousFrameMaxTimestamp = currentFrameMaxTimestamp
}

function record(ui: ExplorerUi, variant: 'opened' | 'closed' | undefined, tick: number, requestId: number): void {
  const panel = PANEL_NAMES[ui] ?? `UNKNOWN_${ui}`
  // A payload with no `event` variant set means the explorer appended an event this SDK
  // build has no name for, so surface it rather than silently treating it as a close.
  const kind = variant === undefined ? 'NO_VARIANT' : variant.toUpperCase()
  const time = formatNow()

  uiEvents.unshift({ time, tick, panel, kind, requestId })
  if (uiEvents.length > MAX_EVENTS) uiEvents.pop()

  // req 0 is the explorer saying the call asked for no correlation; the open and the close of
  // one call must share any other value, and two calls must not share one.
  console.log(`[explorerUiEvents] ${time} ${panel} ${kind} (tick ${tick}, req ${requestId})`)
}
