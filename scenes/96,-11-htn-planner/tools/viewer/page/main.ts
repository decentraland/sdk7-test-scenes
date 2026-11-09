// The HTN session viewer page (npm run htn:view): one self-contained HTML file showing a recorded DebugSession as
// figures, the way a conference talk would draw it: the timeline of every agent, the selected run's refinement tree
// or the domain's AND/OR map, its plan, why it was planned, the world it planned against. One selected agent and one
// time cursor drive every view. The session is embedded in the page (script#htn-session); another one can be dropped
// on the page. Offline: no server, no network.
import { parseSession } from '../../../src/htn-planner/debug/session'
import type { DebugSession, SessionRun } from '../../../src/htn-planner/debug/session'
import { indexSession, runAt, runBySeq, runTime } from '../model/session-index'
import type { AgentInfo } from '../model/session-index'
import { markerTimes, timelineModel } from '../model/timeline'
import { planStrip, stepStatesByNode } from '../model/plan-strip'
import { h, mount } from './dom'
import { renderMap } from './map-view'
import { renderSide } from './side-view'
import { initialState, State, Store } from './state'
import { renderTimeline, timeText } from './timeline-view'
import { renderTree } from './tree-view'

const store = new Store()

function load(session: DebugSession, source: string): void {
  const index = indexSession(session)
  const timeline = timelineModel(index)
  const first = index.agents[0]
  store.set({ ...initialState(), index, timeline, source, agent: first?.id ?? '', cursor: index.t0 })
}

function loadText(text: string, source: string): void {
  try {
    load(parseSession(text), source)
  } catch (e) {
    store.set({ error: `${source}: ${(e as Error).message}` })
  }
}

function current(st: State): { agent?: AgentInfo; run?: SessionRun } {
  const agent = st.index?.agents.find(a => a.id === st.agent)
  if (!agent) return {}
  const run = (st.runSeq !== null ? runBySeq(agent, st.runSeq) : undefined) ?? runAt(agent, st.cursor)
  return { agent, run }
}

// ---- layout ---------------------------------------------------------------------------------------

const header = h('header', { class: 'top' })
const timeline = h('div', { class: 'timeline-box' })
const figure = h('div', { class: 'figure-box' })
const side = h('aside', { class: 'side' })
const banner = h('div', { class: 'banner', hidden: true })
const body = h('main', {}, h('div', { class: 'left' }, h('div', { class: 'figure-bar' }), figure), side)
document.body.append(header, banner, timeline, body, h('div', { class: 'drop-hint', text: 'Drop a session JSON to open it' }))

function button(label: string, on: boolean, onclick: () => void, title = ''): HTMLButtonElement {
  return h('button', { class: `chip ${on ? 'on' : ''}`, onclick, title }, label)
}

function renderHeader(st: State): void {
  const ix = st.index
  const domain = ix?.agents.find(a => a.id === st.agent)?.graph.name ?? ix?.session.domain.name ?? ''
  const times = st.timeline ? markerTimes(st.timeline, st.agent) : []
  const jump = (dir: 1 | -1) => {
    const t = dir > 0 ? times.find(x => x > st.cursor + 1e-6) : [...times].reverse().find(x => x < st.cursor - 1e-6)
    if (t !== undefined) store.set({ cursor: t, runSeq: null, marker: null, selected: null })
  }
  mount(
    header,
    h('div', { class: 'title' }, h('b', { text: 'HTN session' }), h('span', { class: 'muted', text: ix ? `  ${domain} · ${st.source}` : '  drop a session JSON here' })),
    ix
      ? h(
          'div',
          { class: 'controls' },
          h('span', { class: 'label', text: 'agent' }),
          ...ix.agents.map(a => button(a.id, a.id === st.agent, () => store.set({ agent: a.id, runSeq: null, marker: null, selected: null, mapFocus: null }))),
          h('span', { class: 'sep' }),
          h('button', { class: 'chip', title: 'previous replan (←)', onclick: () => jump(-1) }, '◆‹'),
          h('button', { class: 'chip', title: st.playing ? 'pause' : 'replay from the cursor', onclick: () => store.set({ playing: !st.playing }) }, st.playing ? '❚❚' : '▶'),
          h('button', { class: 'chip', title: 'next replan (→)', onclick: () => jump(1) }, '›◆'),
          h('span', { class: 'time', text: timeText(st) })
        )
      : null
  )
}

function renderFigureBar(st: State, agent: AgentInfo | undefined, run: SessionRun | undefined): void {
  const bar = body.querySelector('.figure-bar') as HTMLElement
  const graph = agent?.graph
  mount(
    bar,
    button('Planning', st.tab === 'tree', () => store.set({ tab: 'tree' }), 'the refinement tree of the run: what the planner tried and chose'),
    button('Domain map', st.tab === 'map', () => store.set({ tab: 'map' }), 'the domain as an AND/OR graph, the run drawn over it'),
    h('span', { class: 'sep' }),
    st.tab === 'tree'
      ? [
          button('Normal', st.mode === 'normal', () => store.set({ mode: 'normal' }), 'one line per condition term, read at its last success'),
          button('Verbose', st.mode === 'verbose', () => store.set({ mode: 'verbose' }), 'every attempt as recorded, terms never reached in grey'),
          button('reset folds', false, () => store.set({ folds: new Map() }), 'back to the default folds: failures folded')
        ]
      : [
          button('Focus', !st.mapWhole, () => store.set({ mapWhole: false }), 'one task: its branches, subtasks, callers'),
          button('Whole domain', st.mapWhole, () => store.set({ mapWhole: true })),
          !st.mapWhole && graph && run && st.mapFocus !== null && st.mapFocus !== run.method ? button('back to the run’s task', false, () => store.set({ mapFocus: null })) : null
        ],
    h('span', { class: 'sep' }),
    button('−', false, () => store.set({ zoom: Math.max(0.3, st.zoom / 1.2) }), 'zoom out'),
    h('span', { class: 'muted small', text: `${Math.round(st.zoom * 100)}%` }),
    button('+', false, () => store.set({ zoom: Math.min(3, st.zoom * 1.2) }), 'zoom in'),
    button('1:1', false, () => store.set({ zoom: 1 })),
    h('span', { class: 'legend' }, ...legend(st.tab))
  )
}

function legend(tab: State['tab']): HTMLElement[] {
  const item = (cls: string, glyph: string, text: string) => h('span', { class: `key ${cls}` }, h('b', { text: glyph }), ` ${text}`)
  if (tab === 'map')
    return [
      item('', '◯', 'task (OR: one branch)'),
      item('', '▭', 'branch (AND: all subtasks, top to bottom)'),
      item('ok', '━', 'chosen'),
      item('bad', '▭', 'last failed branch'),
      item('', '↺', 'recursion'),
      item('', '┄', 'uses axiom / callterm')
    ]
  return [
    item('ok', '✓', 'chosen'),
    item('bad', '×', 'failed'),
    item('bad', '↶', 'backtracked'),
    item('', '·', 'not tried'),
    item('', '↺N', 'tried N times'),
    item('run', '▭', 'running step (replay)')
  ]
}

store.on(st => {
  banner.hidden = !st.error
  banner.textContent = st.error ?? ''
  renderHeader(st)
  const { agent, run } = current(st)
  const runKey = run ? `${agent?.id}:${run.seq}` : ''
  if (runKey !== st.foldsRun) {
    // Another run: its own default folds, and no selection from the one before (node ids are per run).
    st.folds = new Map()
    st.foldsRun = runKey
    st.selected = null
  }
  renderFigureBar(st, agent, run)
  if (st.tab === 'tree') {
    figure.classList.remove('map')
    const steps = run && agent && agent.events.length > 0 ? stepStatesByNode(run, planStrip(run, agent.events, st.cursor)) : undefined
    renderTree(figure, st, store, run, agent?.graph, steps)
  } else {
    figure.classList.add('map')
    renderMap(figure, st, store, run, agent?.graph)
  }
  renderSide(side, st, store, agent, run)
  renderTimeline(timeline, st, store)
})

// ---- replay ----------------------------------------------------------------------------------------

let lastFrame = 0
function tick(now: number): void {
  const st = store.state
  if (st.playing && st.index) {
    const dt = lastFrame ? (now - lastFrame) / 1000 : 0
    const step = st.index.timed ? dt : dt * 2
    const next = st.cursor + step
    if (next >= st.index.t1) store.set({ cursor: st.index.t1, playing: false })
    else store.set({ cursor: next, runSeq: null, marker: null })
  }
  lastFrame = now
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

window.addEventListener('keydown', e => {
  const st = store.state
  if (!st.timeline || (e.target as HTMLElement).tagName === 'INPUT') return
  const times = markerTimes(st.timeline, st.agent)
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const t = e.key === 'ArrowRight' ? times.find(x => x > st.cursor + 1e-6) : [...times].reverse().find(x => x < st.cursor - 1e-6)
    if (t !== undefined) store.set({ cursor: t, runSeq: null, marker: null, selected: null })
    e.preventDefault()
  } else if (e.key === ' ') {
    store.set({ playing: !st.playing })
    e.preventDefault()
  }
})
window.addEventListener('resize', () => renderTimeline(timeline, store.state, store))

// ---- drop a file -----------------------------------------------------------------------------------

window.addEventListener('dragover', e => {
  e.preventDefault()
  document.body.classList.add('dragging')
})
window.addEventListener('dragleave', () => document.body.classList.remove('dragging'))
window.addEventListener('drop', e => {
  e.preventDefault()
  document.body.classList.remove('dragging')
  const file = e.dataTransfer?.files[0]
  if (!file) return
  file.text().then(
    text => loadText(text, file.name),
    err => store.set({ error: `${file.name}: ${String(err)}` })
  )
})

// ---- start -----------------------------------------------------------------------------------------

const embedded = document.getElementById('htn-session')
const params = new URLSearchParams(location.search)
const text = embedded?.textContent?.trim() ?? ''
if (text) loadText(text, embedded?.getAttribute('data-source') ?? 'session')
else store.set({ error: null })
// Deep links for screenshots and bug reports: ?agent=a&t=12.5&tab=map&mode=verbose&whole=1&run=7&node=3
{
  const st = store.state
  const patch: Partial<State> = {}
  const agent = params.get('agent')
  if (agent && st.index?.agents.some(a => a.id === agent)) patch.agent = agent
  const t = Number(params.get('t'))
  if (params.has('t') && Number.isFinite(t)) patch.cursor = t
  const tab = params.get('tab')
  if (tab === 'map' || tab === 'tree') patch.tab = tab
  if (params.get('mode') === 'verbose') patch.mode = 'verbose'
  if (params.get('whole') === '1') patch.mapWhole = true
  const run = Number(params.get('run'))
  if (params.has('run') && Number.isFinite(run)) {
    patch.runSeq = run
    const a = st.index?.agents.find(x => x.id === (patch.agent ?? st.agent))
    const r = a ? runBySeq(a, run) : undefined
    if (r) patch.cursor = runTime(r)
  }
  const zoom = Number(params.get('zoom'))
  if (params.has('zoom') && zoom > 0) patch.zoom = zoom
  if (Object.keys(patch).length) store.set(patch)
  // After the run is settled (a new run clears the selection).
  const node = Number(params.get('node'))
  if (params.has('node') && Number.isInteger(node)) store.set({ selected: node })
}
