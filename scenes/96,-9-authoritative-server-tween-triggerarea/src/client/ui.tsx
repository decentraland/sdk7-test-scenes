import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { getPlatform } from '@dcl/sdk/platform'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Summary, summarize, supportName } from '../shared/runner'
import { LiveRig, ServerCapabilities, ServerResults, Support, TestStatus } from '../shared/schemas'
import { TESTS, TRIGGER_TESTS, TWEEN_TESTS, TestDescriptor } from '../shared/tests'
import { requestServerSuite, requestServerTest } from './setup'
import {
  getClientCurrentIndex,
  getClientResults,
  getClientSummary,
  getToast,
  isClientRunning,
  isServerAlive,
  runClientSuite,
  runClientTest
} from './state'

const platform = getPlatform()
const isMobile = platform === 'mobile'

export function setupUi(): void {
  ReactEcsRenderer.setUiRenderer(uiComponent, {
    virtualWidth: isMobile ? 1600 : 1920,
    virtualHeight: isMobile ? 720 : 1080
  })
}

// --- Synced-state readers (one server-owned entity carries every component) -------
const EMPTY_RESULTS = { status: [] as TestStatus[], detail: [] as string[], durationMs: [] as number[] }

function readServerResults() {
  for (const [, results] of engine.getEntitiesWith(ServerResults)) {
    return { status: [...results.status], detail: [...results.detail], durationMs: [...results.durationMs] }
  }
  return EMPTY_RESULTS
}

function readServerCapabilities(): Summary & { running: boolean; currentIndex: number; probed: boolean } {
  for (const [, capabilities] of engine.getEntitiesWith(ServerCapabilities)) {
    return {
      tween: capabilities.tween,
      trigger: capabilities.trigger,
      tweenPassed: capabilities.tweenPassed,
      tweenTotal: capabilities.tweenTotal,
      triggerPassed: capabilities.triggerPassed,
      triggerTotal: capabilities.triggerTotal,
      running: capabilities.running,
      currentIndex: capabilities.currentIndex,
      probed: capabilities.completedAt > 0
    }
  }
  return { ...summarize([]), running: false, currentIndex: -1, probed: false }
}

function readLiveRig() {
  for (const [, rig] of engine.getEntitiesWith(LiveRig)) return rig
  return undefined
}

// --- Theme ------------------------------------------------------------------------
const PANEL_BG = Color4.create(0.03, 0.05, 0.10, 0.97)
const ROW_BG = Color4.create(1, 1, 1, 0.05)
const BANNER_BG = Color4.create(1, 1, 1, 0.08)
const SERVER_COLOR = Color4.fromHexString('#38bdf8ff')
const CLIENT_COLOR = Color4.fromHexString('#fb923cff')
const DIM = Color4.create(1, 1, 1, 0.6)
const GREEN = Color4.fromHexString('#4ade80ff')
const RED = Color4.fromHexString('#ff5a5aff')
const AMBER = Color4.fromHexString('#ffb347ff')
const BTN = Color4.create(0.16, 0.35, 0.55, 0.95)
const BTN_DIM = Color4.create(0.3, 0.3, 0.35, 0.55)

function statusGlyph(status: TestStatus | undefined): { glyph: string; color: Color4 } {
  switch (status) {
    case TestStatus.Running:
      return { glyph: '⏳', color: AMBER }
    case TestStatus.Pass:
      return { glyph: '✓', color: GREEN }
    case TestStatus.Fail:
      return { glyph: '✗', color: RED }
    default:
      return { glyph: '○', color: DIM }
  }
}

function supportColor(support: Support): Color4 {
  switch (support) {
    case Support.Supported:
      return GREEN
    case Support.Unsupported:
      return RED
    default:
      return DIM
  }
}

function button(label: string, color: Color4, onClick: () => void, width: number) {
  return (
    <UiEntity
      uiTransform={{ width, height: 30, justifyContent: 'center', alignItems: 'center', margin: { left: 5 } }}
      uiBackground={{ color }}
      onMouseDown={onClick}
    >
      <Label value={label} fontSize={14} color={Color4.White()} />
    </UiEntity>
  )
}

// One row = one test, both columns. Laid out as a COLUMN — a name/buttons strip on
// top, then the two detail lines at full panel width — because React-ECS labels sit
// at a fixed height and do not push their siblings down: a detail long enough to wrap
// inside a narrow left column silently overlaps the row beneath it (seen in-world).
// Full width plus RESULT_DETAIL_MAX keeps every detail on one line.
function testRow(
  test: TestDescriptor,
  server: ReturnType<typeof readServerResults>,
  serverBusy: boolean,
  clientBusy: boolean
) {
  const client = getClientResults()
  const serverGlyph = statusGlyph(server.status[test.index])
  const clientGlyph = statusGlyph(client.status[test.index])
  const serverDetail = server.detail[test.index] ?? ''
  const clientDetail = client.detail[test.index] ?? ''

  return (
    <UiEntity
      key={test.id}
      uiTransform={{
        width: '100%',
        height: 88,
        margin: { bottom: 5 },
        padding: { left: 10, right: 10, top: 5, bottom: 5 },
        flexDirection: 'column'
      }}
      uiBackground={{ color: ROW_BG }}
    >
      {/* Name + api on the left, the two RUN buttons on the right */}
      <UiEntity
        uiTransform={{
          width: '100%',
          height: 40,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <UiEntity uiTransform={{ width: 440, flexDirection: 'column' }}>
          <Label
            value={`${test.probe ? '◆ ' : ''}#${test.index}  ${test.name}`}
            fontSize={16}
            textAlign="middle-left"
            color={Color4.White()}
            uiTransform={{ width: '100%', height: 21 }}
          />
          <Label
            value={test.api}
            fontSize={11}
            textAlign="middle-left"
            color={DIM}
            uiTransform={{ width: '100%', height: 14 }}
          />
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
          {button('SRV', serverBusy ? BTN_DIM : BTN, () => requestServerTest(test.index), 52)}
          {button('CLI', clientBusy ? BTN_DIM : BTN, () => runClientTest(test.index), 52)}
        </UiEntity>
      </UiEntity>

      {/* The two verdicts, one per side, at full width */}
      {/* textAlign is required: a Label centres its text inside its box, so a
          full-width detail line would otherwise float in the middle of the row. */}
      <Label
        value={`SRV ${serverGlyph.glyph}  ${serverDetail || '—'}`}
        fontSize={11}
        textAlign="middle-left"
        color={serverGlyph.color === DIM ? DIM : SERVER_COLOR}
        uiTransform={{ width: '100%', height: 16 }}
      />
      <Label
        value={`CLI ${clientGlyph.glyph}  ${clientDetail || '—'}`}
        fontSize={11}
        textAlign="middle-left"
        color={clientGlyph.color === DIM ? DIM : CLIENT_COLOR}
        uiTransform={{ width: '100%', height: 16 }}
      />
    </UiEntity>
  )
}

// One verdict line per feature, server beside client. Reading the pair is the point:
// server ✗ next to client ✓ is a server finding, and ✗ next to ✗ is a harness finding.
function verdictLine(name: string, serverSupport: Support, serverScore: string, clientSupport: Support, clientScore: string) {
  return (
    <UiEntity
      key={name}
      uiTransform={{
        width: '100%',
        height: 26,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <Label value={name} fontSize={14} textAlign="middle-left" color={Color4.White()} uiTransform={{ width: 90 }} />
      <Label
        value={`SRV ${supportName(serverSupport)} ${serverScore}`}
        fontSize={13}
        textAlign="middle-left"
        color={supportColor(serverSupport)}
        uiTransform={{ width: 250 }}
      />
      <Label
        value={`CLI ${supportName(clientSupport)} ${clientScore}`}
        fontSize={13}
        textAlign="middle-left"
        color={supportColor(clientSupport)}
        uiTransform={{ width: 220 }}
      />
    </UiEntity>
  )
}

// The one-sentence conclusion. Three genuinely different situations, and conflating
// them would make the whole harness useless — so each gets its own wording.
function conclusion(
  server: Summary,
  client: Summary,
  serverProbed: boolean,
  serverRunning: boolean
): { text: string; color: Color4 } {
  const missing: string[] = []
  if (server.tween === Support.Unsupported) missing.push('TWEENS')
  if (server.trigger === Support.Unsupported) missing.push('TRIGGER AREAS')

  const clientBroken = client.tween === Support.Unsupported || client.trigger === Support.Unsupported
  if (clientBroken && missing.length > 0) {
    return {
      text: '⚠ The CLIENT column failed too — suspect the harness or the SDK build, not the server.',
      color: AMBER
    }
  }
  if (serverRunning) {
    return { text: '⏳ Server run in flight — rows below fill in as they land.', color: AMBER }
  }
  if (!serverProbed) {
    return { text: '○ The server has not reported a run yet.', color: DIM }
  }
  if (missing.length > 0) {
    return {
      text: `⛔ This server build does NOT implement ${missing.join(' or ')} — the client does. Old server confirmed.`,
      color: RED
    }
  }
  if (server.tween === Support.Supported && server.trigger === Support.Supported) {
    const partial = server.tweenPassed < server.tweenTotal || server.triggerPassed < server.triggerTotal
    return partial
      ? {
          text: '✓ Server implements both — but some rows still fail. Read the SRV details below.',
          color: AMBER
        }
      : { text: '✅ Server implements tweens AND raycasts, all rows passing. New server confirmed.', color: GREEN }
  }
  return { text: '○ Not probed yet.', color: DIM }
}

// Why ZONE ENTRIES reads what it reads. The rig needs a working tween AND working
// trigger areas to register even one entry, so a 0 is ambiguous on its own — and the
// wrong reading of it ("trigger areas must be broken too") is the natural one.
function zoneEntriesReason(rig: ReturnType<typeof readLiveRig>): string {
  if (rig === undefined) return 'no rig sample from the server yet'
  if (rig.zoneEntries > 0) return 'the server tweened its platform into its own trigger zone'
  const tweenAlive = rig.tweenState >= 0
  const triggerAlive = rig.canaryEvents > 0
  if (!triggerAlive && !tweenAlive) return 'neither feature is live server-side'
  if (!triggerAlive) return 'the zone is deaf — no trigger transition ever reported, not even for the canary'
  return tweenAlive
    ? 'both live — the platform has not reached the zone yet'
    : 'trigger areas work (canary firing); the platform never moves into the zone (no server tween)'
}

// The live rig readout — the same numbers the in-world beam is drawn from, for when
// the player wants the raw values instead of the picture.
function rigBlock(rig: ReturnType<typeof readLiveRig>) {
  const tweenStateText =
    rig === undefined
      ? '—'
      : rig.tweenState < 0
      ? 'NOT WRITTEN'
      : `state ${rig.tweenState} · t=${rig.tweenProgress.toFixed(2)}`
  const position = rig ? `(${rig.platformPosition.x.toFixed(1)}, ${rig.platformPosition.y.toFixed(1)}, ${rig.platformPosition.z.toFixed(1)})` : '—'
  const entries = rig?.zoneEntries ?? 0

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 'auto',
        minHeight: 100,
        padding: 8,
        margin: { bottom: 8 },
        flexDirection: 'column'
      }}
      uiBackground={{ color: BANNER_BG }}
    >
      <Label
        value="LIVE RIG (server’s own reading)"
        fontSize={13}
        textAlign="middle-left"
        color={SERVER_COLOR}
        uiTransform={{ width: '100%', height: 18 }}
      />
      <Label
        value={`platform at ${position}`}
        fontSize={11}
        textAlign="middle-left"
        color={DIM}
        uiTransform={{ width: '100%', height: 15 }}
      />
      <Label
        value={`TweenState: ${tweenStateText}`}
        fontSize={11}
        textAlign="middle-left"
        color={rig && rig.tweenState >= 0 ? GREEN : RED}
        uiTransform={{ width: '100%', height: 15 }}
      />
      {/* The canary is the tween-independent liveness signal for trigger areas — see
          the comment in server/rig.ts for why an empty zone cannot serve as one. */}
      <Label
        value={`Trigger canary events: ${rig?.canaryEvents ?? 0}`}
        fontSize={11}
        textAlign="middle-left"
        color={rig && rig.canaryEvents > 0 ? GREEN : RED}
        uiTransform={{ width: '100%', height: 15 }}
      />
      <Label
        value={`ZONE ENTRIES: ${entries}`}
        fontSize={13}
        textAlign="middle-left"
        color={entries > 0 ? GREEN : AMBER}
        uiTransform={{ width: '100%', height: 18 }}
      />
      {/* An entry needs BOTH features, so the count alone never says which one is
          missing. Spell out the cause rather than leaving the reader to infer it. */}
      <Label
        value={zoneEntriesReason(rig)}
        fontSize={11}
        textAlign="middle-left"
        color={DIM}
        uiTransform={{ width: '100%', height: 15 }}
      />
    </UiEntity>
  )
}

const uiComponent = () => {
  const serverResults = readServerResults()
  const serverCapabilities = readServerCapabilities()
  const clientSummary = getClientSummary()
  const rig = readLiveRig()
  const alive = isServerAlive()
  const toast = getToast()
  const clientBusy = isClientRunning()
  const serverBusy = serverCapabilities.running
  const verdict = conclusion(
    serverCapabilities,
    clientSummary,
    serverCapabilities.probed,
    serverCapabilities.running
  )

  const runningLabel = serverBusy
    ? `server running #${serverCapabilities.currentIndex}`
    : clientBusy
    ? `client running #${getClientCurrentIndex()}`
    : ''

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        position: { top: 0, right: 0 },
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          width: 640,
          height: '96%',
          margin: { right: 16 },
          flexDirection: 'column',
          padding: 14,
          overflow: 'scroll'
        }}
        uiBackground={{ color: PANEL_BG }}
      >
        {/* Header */}
        <Label value="◆ TWEEN & TRIGGER AREAS ON THE SERVER" fontSize={22} color={Color4.White()} uiTransform={{ height: 30 }} />
        <Label
          value={alive ? '● server online' : '○ server offline — waking up, or not running'}
          fontSize={13}
          color={alive ? GREEN : AMBER}
          uiTransform={{ height: 20 }}
        />

        {/* Verdict banner */}
        <UiEntity
          uiTransform={{ width: '100%', height: 'auto', minHeight: 96, padding: 8, margin: { top: 6, bottom: 8 }, flexDirection: 'column' }}
          uiBackground={{ color: BANNER_BG }}
        >
          {verdictLine(
            'TWEEN',
            serverCapabilities.tween,
            `${serverCapabilities.tweenPassed}/${serverCapabilities.tweenTotal}`,
            clientSummary.tween,
            `${clientSummary.tweenPassed}/${clientSummary.tweenTotal}`
          )}
          {verdictLine(
            'TRIGGER',
            serverCapabilities.trigger,
            `${serverCapabilities.triggerPassed}/${serverCapabilities.triggerTotal}`,
            clientSummary.trigger,
            `${clientSummary.triggerPassed}/${clientSummary.triggerTotal}`
          )}
          <Label
            value={verdict.text}
            fontSize={13}
            textAlign="middle-left"
            color={verdict.color}
            uiTransform={{ width: '100%', height: 34, margin: { top: 4 } }}
          />
        </UiEntity>

        {rigBlock(rig)}

        {/* Run-all controls */}
        <UiEntity uiTransform={{ width: '100%', height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: { bottom: 8 } }}>
          <Label
            value={runningLabel || `${TESTS.length} tests · ◆ = capability probe`}
            fontSize={12}
            color={DIM}
            uiTransform={{ width: 300 }}
          />
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
            {button('RUN ALL · SRV', serverBusy ? BTN_DIM : BTN, () => requestServerSuite(), 130)}
            {button('RUN ALL · CLI', clientBusy ? BTN_DIM : BTN, () => runClientSuite(), 130)}
          </UiEntity>
        </UiEntity>

        {/* Tween group */}
        <Label
          value="TWEEN"
          fontSize={15}
          textAlign="middle-left"
          color={DIM}
          uiTransform={{ width: '100%', height: 22, margin: { bottom: 4 } }}
        />
        {TWEEN_TESTS.map((test) => testRow(test, serverResults, serverBusy, clientBusy))}

        {/* TriggerArea group */}
        <Label
          value="TRIGGER AREAS"
          fontSize={15}
          textAlign="middle-left"
          color={DIM}
          uiTransform={{ width: '100%', height: 22, margin: { top: 8, bottom: 4 } }}
        />
        {TRIGGER_TESTS.map((test) => testRow(test, serverResults, serverBusy, clientBusy))}

        {/* Toast */}
        {toast !== '' && (
          <UiEntity
            uiTransform={{ width: '100%', height: 'auto', minHeight: 30, padding: 8, margin: { top: 8 } }}
            uiBackground={{ color: Color4.create(0, 0, 0, 0.5) }}
          >
            <Label value={toast} fontSize={13} color={AMBER} />
          </UiEntity>
        )}
      </UiEntity>
    </UiEntity>
  )
}
