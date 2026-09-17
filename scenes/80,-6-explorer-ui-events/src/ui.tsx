import ReactEcs, { ReactEcsRenderer, Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { OpenExplorerUiResult } from '~system/RestrictedActions'
import { callResults } from './modules/resultsHud'
import { uiEvents, drainStatus } from './modules/explorerUiEvents'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiMenu)
}

const sceneNameHud = () => (
  <UiEntity
    uiTransform={{ positionType: 'absolute', position: { top: 16, right: 16 }, padding: 12 }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
  >
    <Label value="Explorer UI events" fontSize={24} color={Color4.White()} />
  </UiEntity>
)

// Right-hand feed of the latest call verdicts, newest first with a timestamp: green OPENED,
// yellow WAS_ALREADY_OPEN, red rejections — so QA can verify without tailing logs.
function verdictColor(code: number): Color4 {
  switch (code) {
    case OpenExplorerUiResult.OPENED:
      return Color4.create(0.3, 1, 0.3, 1)
    case OpenExplorerUiResult.WAS_ALREADY_OPEN:
      return Color4.create(1, 0.9, 0.2, 1)
    default:
      return Color4.create(1, 0.35, 0.35, 1)
  }
}

const openResultsHud = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { top: 80, right: 16 },
      padding: 12,
      flexDirection: 'column'
    }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
  >
    <Label value="Call results" fontSize={18} color={Color4.White()} textAlign="middle-left" />
    {callResults.map((r, i) => (
      <Label
        key={`${i}-${r.label}-${r.code}`}
        value={`[${r.time}] ${r.label} -> ${r.verdict} (${r.code})`}
        fontSize={14}
        color={verdictColor(r.code)}
        textAlign="middle-left"
        uiTransform={{ margin: { top: 4 } }}
      />
    ))}
  </UiEntity>
)

// Left-hand feed: the panel lifecycle events the explorer appends to the scene root. A verdict
// says the open request was accepted, an event says the panel really appeared — and CLOSED has
// no verdict counterpart at all, it arrives unprompted.
function eventColor(kind: string): Color4 {
  switch (kind) {
    case 'OPENED':
      return Color4.create(0.3, 1, 0.3, 1)
    case 'CLOSED':
      return Color4.create(1, 0.7, 0.2, 1)
    default:
      return Color4.create(1, 0.35, 0.35, 1)
  }
}

const uiEventsHud = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { top: 80, left: 16 },
      padding: 12,
      flexDirection: 'column'
    }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
  >
    <Label value="ExplorerUiEventsResult" fontSize={18} color={Color4.White()} textAlign="middle-left" />
    {uiEvents.length === 0 && (
      <Label
        value={
          drainStatus.running
            ? `no events yet — set size ${drainStatus.setSize}, drained ${drainStatus.ticks} ticks`
            : 'drain system never ran — scene bundle is stale'
        }
        fontSize={14}
        color={Color4.create(0.7, 0.7, 0.7, 1)}
        textAlign="middle-left"
        uiTransform={{ margin: { top: 4 } }}
      />
    )}
    {uiEvents.map((e, i) => (
      <Label
        key={`${i}-${e.panel}-${e.tick}-${e.kind}`}
        value={`[${e.time}] ${e.panel} ${e.kind} (tick ${e.tick}, req ${e.requestId})`}
        fontSize={14}
        color={eventColor(e.kind)}
        textAlign="middle-left"
        uiTransform={{ margin: { top: 4 } }}
      />
    ))}
  </UiEntity>
)

const uiMenu = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
    {sceneNameHud()}
    {openResultsHud()}
    {uiEventsHud()}
  </UiEntity>
)
