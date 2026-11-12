// The HTN debugger panel: the 'HTN debugger' button opens it; on the left the planner hosts of the scene (the spawned
// playground's NPCs or stations, and the Domain Runner's result) with their state, on top the selected host's header
// (upstream HTNDemo's NPC panel: state, plans, last / max ms, current task, why it last planned), then the tabs Plan /
// World / Domain / History / Map / Domain Runner. Unlocked, the selection follows the host nearest to the player; a click
// on an NPC in the scene, or on the list, selects it and locks.
// Rebuilds: the element tree is cached and rebuilt only when the UI state changed or, at most every DATA_PERIOD, the
// selected host's data did (a new run, a new event): a still panel costs React-ECS a bailout.
// Time: the header's Pause / Step / time scale drive the scene's simulation clock (htn-planner sceneClock), which
// every system that ticks planners reads; the debugger itself runs on the engine's dt, so it stays live while paused.
import { engine, Transform } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { readableReason } from '../history-rows'
import { debugRegistry, DebugHost, nearestHost } from '../registry'
import { clip, colored, escapeRich, HEX, STATUS_HEX } from '../theme'
import { budgetWaits, planTimes, sceneClockStep } from '../timing'
import { sceneClock, TIME_SCALES } from '../../htn-planner'
import { dataKey, hostView, HostView } from './data'
import { domainTab } from './domain-view'
import { historyTab } from './history-view'
import { button, C, countEntities, hex, label, para } from './kit'
import { BODY_H, GAP, HEADER_H, HOST_H, INNER_W, LIST_W, PANEL } from './layout'
import { planView } from './plan-view'
import { RUNNER_ID, runnerTab } from './runner-view'
import { selectHost, set, setOverlay, state, Tab, touch, uiVersion } from './state'
import { worldTab } from './world-view'
import { mapInput, mapTab } from './map-view'
import { mapKey } from '../map'
import { nextLevel } from '../overlay'
import { overlayStats, setupOverlay } from '../overlay-scene'
import { setupPicking } from '../pick'

const STATS_W = 900 // px: the simulation and debugger line, under the panel
// The clock bar, right of the tabs: the simulated time (an overlay, it changes every frame), Pause / Run, Step, scales.
// Header budget (inner width 1240): title 150, tabs ~500, this bar ~540 with the close button.
const CLOCK = { label: 96, pause: 70, step: 50, scale: 40, close: 34, margin: 4 }
const CLOCK_LABEL_LEFT =
  PANEL.left + PANEL.width - PANEL.padding - (CLOCK.close + 6) /* the kit button's margin */ - TIME_SCALES.length * (CLOCK.scale + CLOCK.margin) -
  (CLOCK.step + CLOCK.margin) - (CLOCK.pause + CLOCK.margin) - (CLOCK.label + CLOCK.margin)
const CLOCK_PERIOD = 0.1 // s between updates of the simulated time label
const MAP_PERIOD = 0.2 // s between map change checks (the map moves at most 5 times a second)
const PAUSED = hex('#FFA44D')
const DATA_PERIOD = 0.5 // s between data-driven rebuilds
const NEAREST_PERIOD = 1 // s between nearest-host checks while unlocked
const NEAREST_RADIUS = 30 // m

const OVERLAY_W = 110 // px: the overlay button in the host header

/** Everyone's in-world overlay level: off → step → full (key 1 does the same). */
const cycleOverlay = () => setOverlay(nextLevel(state.overlay))

const stats = { buildMs: 0, builds: 0, entities: 0, text: '', clock: '' }
let dataVersion = 0
let cache: { ui: number; data: number; el: ReactEcs.JSX.Element } | null = null

const STATE_HEX: Record<string, string> = { chase: STATUS_HEX.failed, alert: HEX.warn, investigate: STATUS_HEX.abandoned, 'no plan': STATUS_HEX.failed }

function hostLine(h: DebugHost): string {
  const s = h.status()
  const bad = s.lastStatus !== '' && s.lastStatus !== 'succeeded'
  const badge = bad ? colored(STATUS_HEX.failed, '×') : s.current ? colored(STATUS_HEX.running, '▶') : colored(HEX.dim, '·')
  const what = s.current ? clip(s.current, 70) : bad ? s.lastStatus : s.state
  return `${badge} <b>${escapeRich(h.label)}</b>\n${colored(STATE_HEX[s.state] ?? HEX.dim, escapeRich(what))}`
}

// The list wraps its text (a group title, a long label or step takes two lines) instead of cutting it.
function hostList(hosts: DebugHost[]) {
  const rows = []
  let group = ''
  for (const h of hosts.slice(0, 22)) {
    if (h.group !== group) {
      group = h.group
      rows.push(para(colored(HEX.dim, group), 12, `g-${group}`, LIST_W))
    }
    rows.push(
      <UiEntity
        key={h.id}
        uiTransform={{ width: LIST_W, height: 'auto', minHeight: 38, flexShrink: 0, padding: { left: 6, right: 4, top: 3, bottom: 3 }, margin: { bottom: 2 }, borderRadius: 4 }}
        uiBackground={{ color: h.id === state.host ? C.selected : C.card }}
        uiText={{ value: hostLine(h), fontSize: 12, color: C.text, textAlign: 'middle-left', textWrap: 'wrap' }}
        onMouseDown={() => selectHost(h.id, true)}
      />
    )
  }
  if (hosts.length === 0) rows.push(label('No planner here: spawn a playground', 12, C.dim, 'auto', 'none'))
  if (hosts.length > 22) rows.push(label(`+${hosts.length - 22} more`, 12, C.dim, 'auto', 'more'))
  return (
    <UiEntity key="list" uiTransform={{ width: LIST_W, height: BODY_H + HOST_H, flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
      {rows}
    </UiEntity>
  )
}

/** Upstream HTNDemo's NPC header: state, plans, last / max ms, current task; and why it last planned. */
function hostHeader(v: HostView | null) {
  let text = colored(HEX.dim, 'No host selected: walk to an NPC or a station, or click one.')
  if (v) {
    const h = v.host
    const s = h.status()
    const m = h.metrics
    const waits = m ? budgetWaits(m) : ''
    const plans = m ? `plans ${m.plansMade} · ${planTimes(m, sceneClockStep())}${waits ? ` · ${waits}` : ''} · steps done ${m.tasksCompleted}` : ''
    const status = s.lastStatus === 'succeeded' ? colored(STATUS_HEX.chosen, 'succeeded') : s.lastStatus ? colored(STATUS_HEX.failed, s.lastStatus) : colored(HEX.dim, '-')
    const rec = h.recorder ? '' : colored(HEX.warn, '  (recording from its next plan)')
    text =
      `<b>${escapeRich(h.label)}</b>  ${colored(HEX.faint, escapeRich(h.domain.name))}   ${colored(STATE_HEX[s.state] ?? HEX.text, s.state)}   last plan ${status}   ${colored(HEX.dim, plans)}${rec}\n` +
      `${colored(HEX.dim, 'current ')}${s.current ? colored(STATUS_HEX.running, '▶ ' + escapeRich(clip(s.current, 60))) : colored(HEX.dim, '-')}    ${colored(HEX.dim, 'why it planned: ')}${escapeRich(clip(readableReason(s.reason) || '-', 80))}`
  }
  return (
    <UiEntity key="host" uiTransform={{ width: '100%', height: HOST_H, flexShrink: 0, flexDirection: 'row', alignItems: 'center' }}>
      <UiEntity key="t" uiTransform={{ width: INNER_W - LIST_W - GAP - 120 - OVERLAY_W - 6, height: HOST_H, overflow: 'hidden' }} uiText={{ value: text, fontSize: 13, color: C.text, textAlign: 'middle-left', textWrap: 'nowrap' }} />
      {button(`overlay: ${state.overlay}`, cycleOverlay, state.overlay !== 'off', OVERLAY_W, 'overlay', 12)}
      {button(state.locked ? 'locked' : 'follow nearest', () => set({ locked: !state.locked }), state.locked, 112, 'lock', 12)}
    </UiEntity>
  )
}

function tabBody(v: HostView | null) {
  if (state.tab === 'runner') return runnerTab()
  if (state.tab === 'map') return mapTab()
  if (!v) return <UiEntity key="empty" uiTransform={{ width: 10, height: 10 }} />
  switch (state.tab) {
    case 'plan':
      return planView(v)
    case 'world':
      return worldTab(v)
    case 'domain':
      return domainTab(v)
    case 'history':
      return historyTab(v)
    default:
      return <UiEntity key="empty" uiTransform={{ width: 10, height: 10 }} />
  }
}

/** Upstream's toolbar line (HTNNPCSimulationPanel.cpp:269-290): hosts, plans, steps done, planner total (wall clock). */
function simulationLine(hosts: readonly DebugHost[]): string {
  let plans = 0
  let steps = 0
  let ms = 0
  for (const h of hosts) {
    plans += h.metrics?.plansMade ?? 0
    steps += h.metrics?.tasksCompleted ?? 0
    ms += h.metrics?.totalPlanMs ?? 0
  }
  return `${hosts.length} hosts · plans ${plans} · steps done ${steps} · planner total ${ms.toFixed(0)} ms`
}

function clockButton(key: string, text: string, width: number, on: boolean, onClick: () => void) {
  return (
    <UiEntity
      key={key}
      uiTransform={{ width, height: 26, flexShrink: 0, margin: { right: CLOCK.margin }, borderRadius: 5, justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: on ? C.buttonOn : C.button }}
      uiText={{ value: text, fontSize: 12, color: Color4.White(), textWrap: 'nowrap' }}
      onMouseDown={() => {
        onClick()
        touch()
      }}
    />
  )
}

/** Pause / Run, one frame, the time scale (upstream HTNDemo's NPC Simulation toolbar, plus a frame step). */
function clockBar() {
  const clock = sceneClock()
  return (
    <UiEntity key="clock" uiTransform={{ flexDirection: 'row', height: 26, flexShrink: 0, alignItems: 'center' }}>
      <UiEntity key="time" uiTransform={{ width: CLOCK.label, height: 26, margin: { right: CLOCK.margin } }} />
      {clockButton('pause', clock.paused ? '▶ Run' : 'Pause', CLOCK.pause, clock.paused, () => clock.toggle())}
      {clockButton('step', 'Step', CLOCK.step, false, () => clock.step())}
      {TIME_SCALES.map(k => clockButton(`x${k}`, `×${k}`, CLOCK.scale, clock.scale === k, () => clock.setScale(k)))}
    </UiEntity>
  )
}

export function panel() {
  const hosts = debugRegistry.hosts()
  const host = hosts.find(h => h.id === state.host)
  const v = host ? hostView(host, state.plan.pinned) : null
  const tab = (t: Tab, text: string) => button(text, () => set({ tab: t }), state.tab === t, 'auto', `tab-${t}`)
  const runner = state.tab === 'runner'
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: PANEL.left, top: PANEL.top }, width: PANEL.width, height: PANEL.height, flexDirection: 'column', padding: PANEL.padding, borderRadius: 10 }}
      uiBackground={{ color: C.panel }}
    >
      <UiEntity key="header" uiTransform={{ flexDirection: 'row', height: HEADER_H, alignItems: 'center', flexShrink: 0 }}>
        {label('HTN debugger', 18, Color4.White(), 150, 'title')}
        {tab('plan', 'Plan')}
        {tab('world', 'World')}
        {tab('domain', 'Domain')}
        {tab('history', 'History')}
        {tab('map', 'Map')}
        {tab('runner', 'Domain Runner')}
        <UiEntity key="space" uiTransform={{ flexGrow: 1, height: 26 }} />
        {clockBar()}
        {button('×', () => set({ open: false }), false, CLOCK.close, 'close')}
      </UiEntity>
      <UiEntity key="main" uiTransform={{ flexDirection: 'row', width: INNER_W, flexGrow: 1 }}>
        {!runner && hostList(hosts)}
        {!runner && <UiEntity key="gap" uiTransform={{ width: GAP, height: 1 }} />}
        <UiEntity key={`body-${state.tab}`} uiTransform={{ flexDirection: 'column', flexGrow: 1 }}>
          {!runner && hostHeader(v)}
          {tabBody(v)}
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

function cachedPanel() {
  const ui = uiVersion()
  if (cache && cache.ui === ui && cache.data === dataVersion) return cache.el
  const t0 = Date.now()
  const el = panel()
  stats.buildMs += Date.now() - t0
  stats.builds++
  stats.entities = countEntities(el)
  cache = { ui, data: dataVersion, el }
  return el
}

function DebuggerUi() {
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { bottom: 140, right: 22 }, width: 210, height: 34, borderRadius: 6, justifyContent: 'center', alignItems: 'center' }}
        uiBackground={{ color: state.open ? C.buttonOn : C.toggle }}
        uiText={{ value: state.open ? 'HTN debugger  ×' : 'HTN debugger', fontSize: 15, color: Color4.White() }}
        onMouseDown={() => set({ open: !state.open })}
      />
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { bottom: 180, right: 22 }, width: 210, height: 30, borderRadius: 6, justifyContent: 'center', alignItems: 'center' }}
        uiBackground={{ color: state.overlay !== 'off' ? C.buttonOn : C.toggle }}
        uiText={{ value: `NPC overlay: ${state.overlay}  (1)`, fontSize: 13, color: Color4.White() }}
        onMouseDown={cycleOverlay}
      />
      {state.open && cachedPanel()}
      {state.open && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { left: PANEL.left, top: PANEL.top + PANEL.height + 2 }, width: STATS_W, height: 22, padding: { left: 10 }, borderRadius: 5 }}
          uiBackground={{ color: C.panel }}
          uiText={{ value: stats.text, fontSize: 12, color: C.dim, textAlign: 'middle-left', textWrap: 'nowrap' }}
        />
      )}
      {state.open && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { left: CLOCK_LABEL_LEFT, top: PANEL.top + PANEL.padding + 4 }, width: CLOCK.label, height: 26 }}
          uiText={{ value: stats.clock, fontSize: 13, color: sceneClock().paused ? PAUSED : C.text, textAlign: 'middle-right', textWrap: 'nowrap' }}
        />
      )}
    </UiEntity>
  )
}

/** Mount the debugger: its button, its panel, and the system that keeps it current. */
export function setupDebugger() {
  debugRegistry.onPick = id => {
    selectHost(id, true)
    set({ open: true, tab: state.tab === 'runner' ? 'plan' : state.tab })
  }
  let acc = 0
  let frames = 0
  let sinceData = DATA_PERIOD
  let sinceNearest = NEAREST_PERIOD
  let lastKey = ''
  let lastHosts = -1
  let sinceClock = CLOCK_PERIOD
  let sinceMap = MAP_PERIOD
  let lastMap = ''
  engine.addSystem(dt => {
    debugRegistry.tracing = state.open
    sinceClock += dt
    if (state.open && sinceClock >= CLOCK_PERIOD) {
      sinceClock = 0
      const c = sceneClock()
      stats.clock = `sim ${c.time.toFixed(2)} s`
    }
    acc += dt
    frames++
    if (acc >= 1) {
      const build = stats.builds ? (stats.buildMs / stats.builds).toFixed(1) : '–'
      stats.text = `${simulationLine(debugRegistry.hosts())}   ·   debugger: tick ${(frames / acc).toFixed(1)} fps · build ${build} ms ×${stats.builds}/s · ${stats.entities} entities · overlay ${state.overlay} ${overlayStats.entities} entities`
      if (state.open) console.log(`[htn-debugger] ${state.tab} ${state.host ?? '-'} | ${stats.text}`)
      acc = 0
      frames = 0
      stats.buildMs = 0
      stats.builds = 0
    }
    if (!state.open) return
    sinceNearest += dt
    if (!state.locked && sinceNearest >= NEAREST_PERIOD) {
      sinceNearest = 0
      const p = Transform.getOrNull(engine.PlayerEntity)?.position
      const near = p ? nearestHost(debugRegistry.hosts(), p, NEAREST_RADIUS) : undefined
      if (near && near.id !== state.host) selectHost(near.id, false)
    }
    sinceMap += dt
    if (state.tab === 'map' && sinceMap >= MAP_PERIOD) {
      sinceMap = 0
      const input = mapInput()
      const key = input ? mapKey(input) : ''
      if (key !== lastMap) {
        lastMap = key
        dataVersion++
      }
    }
    sinceData += dt
    if (sinceData < DATA_PERIOD) return
    sinceData = 0
    // The list shows every host's state; the tabs the selected host's runs and events.
    const hosts = debugRegistry.hosts()
    let key = state.tab === 'runner' ? '' : hosts.map(h => `${h.id}:${h.status().current}:${h.status().lastStatus}`).join('|')
    key += '#' + dataKey(hosts.find(h => h.id === state.host))
    if (key !== lastKey || hosts.length !== lastHosts) {
      lastKey = key
      lastHosts = hosts.length
      dataVersion++
    }
    if (state.host !== null && state.host !== RUNNER_ID && !hosts.some(h => h.id === state.host)) selectHost(null, false)
  })
  setupOverlay()
  setupPicking()
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), DebuggerUi)
}
