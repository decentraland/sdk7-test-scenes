import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'

const STALL_STEPS_MS = [0, 40, 120]
const TARGET_NAMES = ['A', 'B', 'C']

type TargetCounters = { downs: number; ups: number; enters: number; leaves: number }

export const state = {
  ticks: 0,
  stallMs: STALL_STEPS_MS[0],
  churn: false,
  globalDowns: 0,
  globalUps: 0,
  targets: TARGET_NAMES.map((): TargetCounters => ({ downs: 0, ups: 0, enters: 0, leaves: 0 }))
}

function resetCounters() {
  state.globalDowns = 0
  state.globalUps = 0
  for (const target of state.targets) {
    target.downs = 0
    target.ups = 0
    target.enters = 0
    target.leaves = 0
  }
}

function cycleStall() {
  const next = (STALL_STEPS_MS.indexOf(state.stallMs) + 1) % STALL_STEPS_MS.length
  state.stallMs = STALL_STEPS_MS[next]
}

function toggleChurn() {
  state.churn = !state.churn
}

// A button whose ups outnumber its downs received a release whose press was lost.
function lostDowns(target: TargetCounters) {
  return Math.max(0, target.ups - target.downs)
}

function controlButton(label: string, onMouseDown: () => void, color: Color4) {
  return (
    <UiEntity
      uiTransform={{ width: 220, height: 40, margin: { right: 10 } }}
      uiBackground={{ color }}
      uiText={{ value: label, fontSize: 16, color: Color4.White(), textAlign: 'middle-center' }}
      onMouseDown={onMouseDown}
    />
  )
}

function targetButton(index: number) {
  const target = state.targets[index]
  const lost = lostDowns(target)

  return (
    <UiEntity
      key={`target-${index}`}
      uiTransform={{
        width: 200,
        height: 110,
        margin: { right: 16 },
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: lost > 0 ? Color4.create(0.6, 0.1, 0.1, 1) : Color4.create(0.1, 0.35, 0.6, 1) }}
      onMouseDown={() => {
        target.downs++
      }}
      onMouseUp={() => {
        target.ups++
      }}
      onMouseEnter={() => {
        target.enters++
      }}
      onMouseLeave={() => {
        target.leaves++
      }}
    >
      <UiEntity
        uiTransform={{ width: '100%', height: 36 }}
        uiText={{ value: `Click ${TARGET_NAMES[index]}`, fontSize: 22, color: Color4.White(), textAlign: 'middle-center' }}
      />
      <UiEntity
        uiTransform={{ width: '100%', height: 24 }}
        uiText={{
          value: `down ${target.downs}  up ${target.ups}  lost ${lost}`,
          fontSize: 16,
          color: Color4.White(),
          textAlign: 'middle-center'
        }}
      />
      <UiEntity
        uiTransform={{ width: '100%', height: 24 }}
        uiText={{
          value: `enter ${target.enters}  leave ${target.leaves}`,
          fontSize: 14,
          color: Color4.create(0.8, 0.8, 0.8, 1),
          textAlign: 'middle-center'
        }}
      />
    </UiEntity>
  )
}

// Re-rendered every tick while churn is on: the text and the bar width change, so the Explorer re-applies
// styles and re-lays out the panel each tick, like a scene whose UI shows live data.
function churnBar() {
  const phase = state.churn ? state.ticks % 60 : 0
  const width = 120 + phase * 8
  const hue = phase / 60

  return (
    <UiEntity uiTransform={{ width: 600, height: 30, margin: { top: 10 }, flexDirection: 'row', alignItems: 'center' }}>
      <UiEntity
        uiTransform={{ width, height: 20 }}
        uiBackground={{ color: Color4.create(hue, 1 - hue, 0.5, 1) }}
      />
      <UiEntity
        uiTransform={{ width: 200, height: 20, margin: { left: 10 } }}
        uiText={{
          value: state.churn ? `tick ${state.ticks}` : 'churn off',
          fontSize: 14,
          color: Color4.White(),
          textAlign: 'middle-left'
        }}
      />
    </UiEntity>
  )
}

export const uiRoot = () => (
  <UiEntity
    uiTransform={{
      width: 680,
      positionType: 'absolute',
      position: { top: 40, left: 40 },
      padding: 16,
      flexDirection: 'column'
    }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.75) }}
  >
    <UiEntity
      uiTransform={{ width: '100%', height: 60 }}
      uiText={{
        value:
          'Set stall + churn, press Reset, then click a target N times.\nExpected: down = up = N and lost = 0 on every target, and global down = N.',
        fontSize: 15,
        color: Color4.White(),
        textAlign: 'middle-left'
      }}
    />

    <UiEntity uiTransform={{ width: '100%', height: 40, margin: { top: 6 }, flexDirection: 'row' }}>
      {controlButton(`Tick stall: ${state.stallMs} ms`, cycleStall, Color4.create(0.3, 0.3, 0.3, 1))}
      {controlButton(`UI churn: ${state.churn ? 'ON' : 'off'}`, toggleChurn, Color4.create(0.3, 0.3, 0.3, 1))}
      {controlButton('Reset counters', resetCounters, Color4.create(0.45, 0.25, 0.1, 1))}
    </UiEntity>

    {churnBar()}

    <UiEntity uiTransform={{ width: '100%', height: 110, margin: { top: 16 }, flexDirection: 'row' }}>
      {state.targets.map((_, index) => targetButton(index))}
    </UiEntity>

    <UiEntity
      uiTransform={{ width: '100%', height: 28, margin: { top: 12 } }}
      uiText={{
        value: `global pointer: down ${state.globalDowns}  up ${state.globalUps}`,
        fontSize: 16,
        color: Color4.create(1, 0.85, 0.4, 1),
        textAlign: 'middle-left'
      }}
    />
  </UiEntity>
)
