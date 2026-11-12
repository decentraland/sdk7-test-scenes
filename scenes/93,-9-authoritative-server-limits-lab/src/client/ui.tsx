import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { ENTITY_TARGETS } from '../shared/config'
import { LastWords, RunnerState, TestResults, TestStatus } from '../shared/schemas'
import { TestCategory, TESTS } from '../shared/tests'
import { armDestructive, disarm, getToast, isArmed, isServerAlive } from './state'
import { requestCleanup, requestTest } from './setup'
import { getPlatform } from '@dcl/sdk/platform'

const platform = getPlatform()
const isMobile = platform === 'mobile';

export function setupUi(): void {
  ReactEcsRenderer.setUiRenderer(uiComponent, { virtualWidth: isMobile ? 1600 : 1920, virtualHeight: isMobile ? 720 : 1080 })
}

// --- Synced-state readers (one server-owned entity carries every component) -----
function readResults() {
  for (const [, r] of engine.getEntitiesWith(TestResults)) {
    return { status: [...r.status], detail: [...r.detail], durationMs: [...r.durationMs] }
  }
  return { status: [] as TestStatus[], detail: [] as string[], durationMs: [] as number[] }
}

function readRunner() {
  for (const [, rs] of engine.getEntitiesWith(RunnerState)) {
    return { busy: rs.busy, currentTestIndex: rs.currentTestIndex, liveEntities: rs.liveEntities, createdEntities: rs.createdEntities }
  }
  return { busy: false, currentTestIndex: -1, liveEntities: 0, createdEntities: 0 }
}

function readLastWords() {
  for (const [, lw] of engine.getEntitiesWith(LastWords)) {
    return { testIndex: lw.testIndex, message: lw.message }
  }
  return { testIndex: -1, message: '' }
}

// --- Theme ----------------------------------------------------------------------
const PANEL_BG = Color4.create(0.06, 0.04, 0.12, 0.9)
const ROW_BG = Color4.create(1, 1, 1, 0.05)
const DANGER_BG = Color4.create(0.35, 0.05, 0.08, 0.35)
const ACCENT = Color4.fromHexString('#b487ffff')
const DIM = Color4.create(1, 1, 1, 0.65)
const GREEN = Color4.fromHexString('#4ade80ff')
const RED = Color4.fromHexString('#ff5a5aff')
const AMBER = Color4.fromHexString('#ffb347ff')
const BTN = Color4.create(0.4, 0.28, 0.7, 0.9)
const BTN_DIM = Color4.create(0.3, 0.3, 0.35, 0.6)
const BTN_DANGER = Color4.fromHexString('#c0392bff')

// Local UI selection for the entity-spam target (not synced — purely cosmetic).
let selectedSpamTarget = ENTITY_TARGETS[0]

function statusGlyph(status: TestStatus): { glyph: string; color: Color4 } {
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

function button(label: string, color: Color4, onClick: () => void, width: number = 84) {
  return (
    <UiEntity
      uiTransform={{ width, height: 34, justifyContent: 'center', alignItems: 'center', margin: { left: 6 } }}
      uiBackground={{ color }}
      onMouseDown={onClick}
    >
      <Label value={label} fontSize={15} color={Color4.White()} />
    </UiEntity>
  )
}

function testRow(index: number, results: ReturnType<typeof readResults>, runner: ReturnType<typeof readRunner>) {
  const test = TESTS[index]
  const status = results.status[index] ?? TestStatus.Idle
  const detail = results.detail[index] ?? ''
  const g = statusGlyph(status)
  const isDanger = test.category === TestCategory.Destructive
  const armed = isArmed(index)

  return (
    <UiEntity
      key={test.id}
      uiTransform={{
        width: '100%',
        height: 'auto',
        minHeight: 58,
        margin: { bottom: 5 },
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
      uiBackground={{ color: armed ? Color4.fromHexString('#7a1f1fff') : isDanger ? DANGER_BG : ROW_BG }}
    >
      {/* Left: glyph + text */}
      <UiEntity uiTransform={{ width: 300, flexDirection: 'column' }}>
        <Label value={`${g.glyph}  ${test.name}`} fontSize={17} color={g.color} uiTransform={{ height: 22 }} />
        <Label value={test.limitLabel} fontSize={12} color={DIM} uiTransform={{ height: 16 }} />
        {detail !== '' && <Label value={detail} fontSize={12} color={Color4.White()} uiTransform={{ height: 16 }} />}
      </UiEntity>

      {/* Right: action button(s) */}
      {isDanger ? (
        button(armed ? '⚠ KILL' : 'ARM', armed ? BTN_DANGER : BTN, () => {
          if (armed) {
            disarm()
            requestTest(index, 0)
          } else {
            armDestructive(index)
          }
        })
      ) : (
        button('RUN', runner.busy ? BTN_DIM : BTN, () => requestTest(index, index === 9 ? selectedSpamTarget : 0))
      )}
    </UiEntity>
  )
}

// The entity-spam row gets an extra control strip: target picker + live counts +
// Cleanup. Rendered right after its test row.
function spamControls(runner: ReturnType<typeof readRunner>) {
  return (
    <UiEntity
      key="spam-controls"
      uiTransform={{
        width: '100%',
        height: 'auto',
        minHeight: 40,
        margin: { bottom: 8 },
        padding: { left: 10, right: 10, top: 4, bottom: 4 },
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
      uiBackground={{ color: ROW_BG }}
    >
      <UiEntity uiTransform={{ flexDirection: 'column', width: 150 }}>
        <Label value="spam target" fontSize={12} color={DIM} uiTransform={{ height: 15 }} />
        <Label value={`live ${runner.liveEntities} / made ${runner.createdEntities}`} fontSize={12} color={Color4.White()} uiTransform={{ height: 16 }} />
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
        {ENTITY_TARGETS.map((t) =>
          button(
            `${t / 1000}k`,
            selectedSpamTarget === t ? ACCENT : BTN_DIM,
            () => {
              selectedSpamTarget = t
            },
            48
          )
        )}
        {button('Cleanup', BTN, () => requestCleanup(), 84)}
      </UiEntity>
    </UiEntity>
  )
}

const uiComponent = () => {
  const results = readResults()
  const runner = readRunner()
  const lastWords = readLastWords()
  const alive = isServerAlive()
  const toast = getToast()

  const safe = TESTS.filter((t) => t.category === TestCategory.Safe)
  const destructive = TESTS.filter((t) => t.category === TestCategory.Destructive)

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
          width: 470,
          height: '94%',
          margin: { right: 18 },
          flexDirection: 'column',
          padding: 16,
          overflow: 'scroll'
        }}
        uiBackground={{ color: PANEL_BG }}
      >
        {/* Header */}
        <Label value="⚙ SERVER LIMITS LAB" fontSize={24} color={ACCENT} uiTransform={{ height: 34 }} />
        <Label
          value={alive ? '● server online' : '○ server offline — waking up or killed by a test'}
          fontSize={15}
          color={alive ? GREEN : AMBER}
          uiTransform={{ height: 24, margin: { bottom: 6 } }}
        />

        {/* Last-words banner (survives after a destructive test kills the server) */}
        {lastWords.testIndex >= 0 && lastWords.message !== '' && (
          <UiEntity uiTransform={{ width: '100%', height: 'auto', minHeight: 34, padding: 8, margin: { bottom: 8 } }} uiBackground={{ color: DANGER_BG }}>
            <Label value={`☠ ${lastWords.message}`} fontSize={13} color={RED} />
          </UiEntity>
        )}

        {/* Safe tests */}
        <Label value="SAFE TESTS" fontSize={15} color={DIM} uiTransform={{ height: 22, margin: { bottom: 4 } }} />
        {safe.map((t) => {
          const row = testRow(t.index, results, runner)
          return t.id === 'entity-spam' ? [row, spamControls(runner)] : row
        })}

        {/* Danger zone */}
        <Label value="⚠ DANGER ZONE — these KILL the server" fontSize={15} color={RED} uiTransform={{ height: 24, margin: { top: 8, bottom: 4 } }} />
        <Label
          value="Two clicks: ARM, then KILL. The server dies (heartbeat goes offline) — that is the pass."
          fontSize={12}
          color={DIM}
          uiTransform={{ height: 18, margin: { bottom: 4 } }}
        />
        {destructive.map((t) => testRow(t.index, results, runner))}

        {/* Toast */}
        {toast !== '' && (
          <UiEntity uiTransform={{ width: '100%', height: 'auto', minHeight: 30, padding: 8, margin: { top: 8 } }} uiBackground={{ color: Color4.create(0, 0, 0, 0.5) }}>
            <Label value={toast} fontSize={14} color={AMBER} />
          </UiEntity>
        )}
      </UiEntity>
    </UiEntity>
  )
}
