// Domain Runner tab (upstream HTNDemo main.cpp :346-462): pick a domain of the scene, a top-level method, a world
// state (a gallery or lab scenario, a copy of the selected NPC's world, or an empty one) and a backtracking mode;
// Run plans once on a fresh world (a live world is never touched) and shows Success / Failure, the time, the plan,
// whether it is the plan the scenario expects, and the tree with its watch. The result is also a host of the
// registry ("Domain Runner"), so the World and Domain tabs read it too.
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import type { DomainIR } from '../../htn-planner'
import { GALLERY_STATIONS } from '../../examples/upstream/gallery'
import { LAB_STATIONS } from '../../examples/upstream/lab'
import { MODES } from '../../examples/upstream/stations'
import { debugRegistry, DebugHost } from '../registry'
import { cloneWorld, runDomain, RunnerDomain, runnerCatalogue, RunnerWorld, topLevelMethods } from '../runner'
import { clip, colored, escapeRich, HEX, STATUS_HEX } from '../theme'
import { formatMs, sceneClockStep } from '../timing'
import { rowWindow } from '../tree-rows'
import { button, C, label, para, scrollbar } from './kit'
import { BODY_H, INNER_W } from './layout'
import { selectHost, set, state, touch } from './state'
import { adoptRun, treeBox, watchBox } from './tree-view'

const LEFT_W = 360
const ROW_H = 22
const LIST_ROWS = 9
export const RUNNER_ID = 'domain-runner'

let catalogue: { key: string; list: RunnerDomain[] } | null = null

/** Gallery and lab domains, then the domains of the hosts in the scene now (the playground NPCs'). */
function domains(): RunnerDomain[] {
  const extra: { domain: DomainIR; label: string }[] = []
  for (const h of debugRegistry.hosts()) if (h.id !== RUNNER_ID && !extra.some(e => e.domain === h.domain)) extra.push({ domain: h.domain, label: `${h.domain.name} (${h.label})` })
  const key = extra.map(e => e.domain.name).join(',')
  if (!catalogue || catalogue.key !== key) catalogue = { key, list: runnerCatalogue([...GALLERY_STATIONS, ...LAB_STATIONS], extra) }
  return catalogue.list
}

/** The world states of a domain: a copy of the selected host's world first, when the host plans with that domain. */
function worldsOf(d: RunnerDomain): RunnerWorld[] {
  const h = debugRegistry.find(state.host)
  if (!h || h.id === RUNNER_ID || h.domain !== d.domain) return d.worlds
  return [{ id: 'clone', label: `copy of ${h.label}'s world now`, setup: w => cloneWorld('clone', '', h.world).setup(w) }, ...d.worlds]
}

const runnerHost: DebugHost = {
  id: RUNNER_ID,
  label: 'Domain Runner',
  group: 'Domain Runner',
  get domain() {
    return state.runner.result!.recorder.domain
  },
  get recorder() {
    return state.runner.result!.recorder
  },
  get world() {
    return state.runner.result!.world
  },
  status: () => {
    const r = state.runner.result!
    return { state: 'run', lastStatus: r.status, reason: state.runner.ran, current: '', steps: [], done: [] }
  }
}

let registered = false
function register() {
  if (registered) return
  registered = true
  debugRegistry.add(() => (state.runner.result ? [runnerHost] : []))
}

export function runSelected() {
  register()
  const r = state.runner
  const list = domains()
  const d = list[Math.min(r.domain, list.length - 1)]
  if (!d) return
  const methods = topLevelMethods(d.domain)
  const m = methods[Math.min(r.method, methods.length - 1)]
  const worlds = worldsOf(d)
  const w = worlds[Math.min(r.world, worlds.length - 1)]
  if (!m || !w) return
  const args = w.method === m.name ? w.args : undefined
  r.result = runDomain({ domain: d.domain, method: m.name, args, world: w, mode: MODES[r.mode].mode })
  r.ran = `${d.id} · ${m.name} · ${w.label} · ${MODES[r.mode].name}`
  r.count++
  touch()
}

function pickList<T>(items: readonly T[], selected: number, offset: number, text: (t: T) => string, choose: (i: number) => void, scroll: (o: number) => void, key: string) {
  const height = LIST_ROWS * ROW_H
  const { start, end } = rowWindow(items.length, offset, LIST_ROWS)
  const rows = []
  for (let i = start; i < end; i++)
    rows.push(
      <UiEntity
        key={i - start}
        uiTransform={{ width: '100%', height: ROW_H, flexShrink: 0, padding: { left: 6 }, overflow: 'hidden' }}
        uiBackground={{ color: i === selected ? C.selected : Color4.Clear() }}
        uiText={{ value: escapeRich(clip(text(items[i]), 46)), fontSize: 13, color: C.text, textAlign: 'middle-left', textWrap: 'nowrap' }}
        onMouseDown={() => choose(i)}
      />
    )
  return (
    <UiEntity key={key} uiTransform={{ width: LEFT_W, height, flexDirection: 'row', flexShrink: 0, margin: { bottom: 8 } }} uiBackground={{ color: C.card }}>
      <UiEntity uiTransform={{ width: LEFT_W - 18, height, flexDirection: 'column', overflow: 'hidden' }}>{rows}</UiEntity>
      {scrollbar(items.length, start, LIST_ROWS, height, scroll, `${key}-sb`)}
    </UiEntity>
  )
}

function config() {
  const r = state.runner
  const list = domains()
  r.domain = Math.min(r.domain, list.length - 1)
  const d = list[r.domain]
  const methods = d ? topLevelMethods(d.domain) : []
  const worlds = d ? worldsOf(d) : []
  r.method = Math.min(r.method, Math.max(0, methods.length - 1))
  r.world = Math.min(r.world, Math.max(0, worlds.length - 1))
  return (
    <UiEntity key="config" uiTransform={{ width: LEFT_W, height: BODY_H, flexDirection: 'column', flexShrink: 0 }}>
      {label('Domain', 14, C.dim, 'auto', 'dh')}
      {pickList(list, r.domain, r.domainOffset, x => `${x.label}  (${x.worlds.length - 1} worlds)`, i => set({ runner: { ...r, domain: i, method: 0, world: 0, worldOffset: 0 } }), o => set({ runner: { ...r, domainOffset: o } }), 'domains')}
      {label('Top level method', 14, C.dim, 'auto', 'mh')}
      <UiEntity key="methods" uiTransform={{ width: LEFT_W, flexDirection: 'row', flexWrap: 'wrap', flexShrink: 0, margin: { bottom: 8 } }}>
        {methods.slice(0, 12).map((m, i) => button(`${m.name}${m.arity ? `/${m.arity}` : ''}`, () => set({ runner: { ...r, method: i } }), i === r.method, 'auto', `m${i}`, 13))}
      </UiEntity>
      {label('World state', 14, C.dim, 'auto', 'wh')}
      {pickList(worlds, r.world, r.worldOffset, w => w.label, i => set({ runner: { ...r, world: i } }), o => set({ runner: { ...r, worldOffset: o } }), 'worlds')}
      {label('Backtracking', 14, C.dim, 'auto', 'bh')}
      <UiEntity key="modes" uiTransform={{ width: LEFT_W, flexDirection: 'row', flexWrap: 'wrap', flexShrink: 0, margin: { bottom: 12 } }}>
        {MODES.map((m, i) => button(m.name, () => set({ runner: { ...r, mode: i } }), i === r.mode, 'auto', `mode${i}`, 12))}
      </UiEntity>
      <UiEntity
        key="run"
        uiTransform={{ width: 200, height: 34, borderRadius: 6, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}
        uiBackground={{ color: C.buttonOn }}
        uiText={{ value: '<b>Run planner</b>', fontSize: 16, color: Color4.White() }}
        onMouseDown={runSelected}
      />
      {para(colored(HEX.faint, 'Plans once with a recorder on a fresh copy of the world, then again without one for up to 60 ms, for the time.'), 12, 'note', LEFT_W)}
    </UiEntity>
  )
}

function result() {
  const r = state.runner
  const res = r.result
  const width = INNER_W - LEFT_W - 12
  if (!res) return <UiEntity key="result" uiTransform={{ width, height: BODY_H }}>{para(colored(HEX.dim, 'Pick a domain, a method and a world state, then Run planner.'), 14, 'hint')}</UiEntity>
  const ok = res.status === 'succeeded'
  const head = `<b>${colored(ok ? STATUS_HEX.chosen : STATUS_HEX.failed, ok ? 'Success' : 'Failure')}</b> ${colored(ok ? STATUS_HEX.chosen : STATUS_HEX.failed, `(${res.status})`)} in ${res.ms.toFixed(3)} ms ${colored(HEX.faint, `(mean of ${res.repeats}, no recorder; recorded run ${formatMs(res.tracedMs, sceneClockStep())})`)}`
  const lines: string[] = [head, colored(HEX.faint, escapeRich(r.ran))]
  if (res.expected) {
    const e = res.expected
    lines.push(
      e.same
        ? colored(STATUS_HEX.chosen, '✓ the plan the scenario expects')
        : colored(STATUS_HEX.failed, `× the scenario expects ${e.status}${e.plan ? ': ' + escapeRich(clip(e.plan.join(', '), 110)) : ''}`)
    )
  }
  for (const d of res.diagnostics.slice(0, 2)) lines.push(colored(HEX.warn, escapeRich(clip(d, 110))))
  const plan = res.plan.length > 0 ? res.plan.slice(0, 6).map((s, i) => `${colored(HEX.faint, String(i).padStart(2, ' '))}  ${escapeRich(s)}`) : [colored(HEX.dim, '(no steps)')]
  if (res.plan.length > 6) plan.push(colored(HEX.faint, `   … +${res.plan.length - 6} steps`))
  // Another run of the same domain keeps the folds and the selection where its nodes are the same.
  adoptRun(r.tree, `runner:${res.recorder.domain.name}#${r.count}`, res.run, `runner:${res.recorder.domain.name}`)
  // One line each, so the head's height is known and the tree takes the rest.
  const headH = 24 + 21 * (lines.length - 1) + 6
  const treeH = BODY_H - headH - 100 - 8
  const graph = res.recorder.graph
  return (
    <UiEntity key="result" uiTransform={{ width, height: BODY_H, flexDirection: 'column' }}>
      <UiEntity key="head" uiTransform={{ width, height: headH, flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
        {lines.map((l, i) => label(l, i === 0 ? 16 : 13, C.text, width, `l${i}`))}
      </UiEntity>
      <UiEntity key="plan" uiTransform={{ width, height: 100, flexDirection: 'row', flexShrink: 0 }}>
        <UiEntity key="steps" uiTransform={{ width: width - 230, height: 100 }} uiText={{ value: plan.join('\n'), fontSize: 13, color: C.text, textAlign: 'top-left', textWrap: 'nowrap' }} />
        <UiEntity key="open" uiTransform={{ width: 230, flexDirection: 'column' }}>
          {button('World tab ›', () => (selectHost(RUNNER_ID, true), set({ tab: 'world' })), false, 200, 'ow', 13)}
          <UiEntity key="g" uiTransform={{ height: 6, width: 1 }} />
          {button('Domain tab ›', () => (selectHost(RUNNER_ID, true), set({ tab: 'domain' })), false, 200, 'od', 13)}
        </UiEntity>
      </UiEntity>
      <UiEntity key="tree" uiTransform={{ flexDirection: 'row', height: treeH, flexShrink: 0, margin: { top: 8 } }}>
        {treeBox(res.run, graph, r.tree, width - 320, treeH)}
        <UiEntity key="gap" uiTransform={{ width: 10, height: 1 }} />
        {watchBox(res.run, graph, r.tree, 310, treeH, { domain: res.recorder.domain, world: rev => res.recorder.world(rev) })}
      </UiEntity>
    </UiEntity>
  )
}

export function runnerTab() {
  return (
    <UiEntity uiTransform={{ width: INNER_W, height: BODY_H, flexDirection: 'row' }}>
      {config()}
      <UiEntity key="gap" uiTransform={{ width: 12, height: 1 }} />
      {result()}
    </UiEntity>
  )
}
