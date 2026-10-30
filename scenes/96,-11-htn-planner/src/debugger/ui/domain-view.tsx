// Domain tab: the domain as an AND/OR graph (graph-layout: layered, orthogonal edges from thin rectangles) inside a
// native scroll view (pan by scrolling), zoom by re-layout. Focus view by default: one method and its neighbours,
// click a method to focus it; Full shows the domain from its top-level methods, capped. The overlay is the shown
// run: the methods and branches it committed to in green, the branches it tried that failed in red (the last one
// thicker). Ours: upstream has no domain graph.
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import type { DomainGraph, PlanRun } from '../../htn-planner'
import { focusModel, fullModel, Overlay, parseNode, runOverlay } from '../domain-focus'
import { FONT, GraphLayout, layoutDomain, LayoutNode } from '../graph-layout'
import { colored, HEX, STATUS_HEX } from '../theme'
import { HostView } from './data'
import { button, C, label } from './kit'
import { BODY_H, BODY_W } from './layout'
import { set, state } from './state'

export const ZOOMS = [0.4, 0.6, 0.8, 1, 1.2, 1.5]
const BAR_H = 30
const MAX_NODES = 200

interface Drawn {
  key: unknown[]
  layout: GraphLayout
  closed: Set<string>
  hidden: number
  focus: number
}

let drawn: Drawn | null = null

/** The method the focus view centres on: the user's, else the run's root, else the first top-level one. */
function focusOf(graph: DomainGraph, run: PlanRun | null): number {
  if (state.focusDomain !== graph.name) {
    state.focusDomain = graph.name
    state.focus = null
  }
  if (state.focus !== null && graph.methods[state.focus]) return state.focus
  if (run && run.method >= 0 && graph.methods[run.method]) return run.method
  return graph.topLevel[0] ?? 0
}

function layoutFor(graph: DomainGraph, run: PlanRun | null): Drawn {
  const focus = focusOf(graph, run)
  const key = [graph, state.domainFull, state.domainFull ? -1 : focus, state.zoom]
  if (drawn && drawn.key.every((k, i) => k === key[i])) return drawn
  const m = state.domainFull ? fullModel(graph, MAX_NODES) : focusModel(graph, focus)
  drawn = { key, layout: layoutDomain(m.model, { scale: state.zoom, parentAlign: 'first' }), closed: new Set(m.closed.map(id => `m${id}`)), hidden: m.hidden, focus }
  return drawn
}

function node(n: LayoutNode, s: number, o: Overlay, closed: boolean, focus: boolean) {
  const target = n.kind === 'primitive' ? n.id.slice(0, n.id.indexOf('>')) : n.id
  const chosen = o.chosen.has(target)
  const failed = n.kind === 'branch' && o.failed.has(n.id)
  const last = o.last === n.id
  const borderColor = chosen ? C.ok : failed ? C.bad : n.kind === 'task' ? C.taskBorder : n.kind === 'primitive' ? C.primBorder : C.border
  const borderWidth = last ? 4 : chosen || failed || focus ? 2 : 1
  const base = { positionType: 'absolute' as const, position: { left: n.x, top: n.y }, width: n.w, height: n.h, borderWidth, borderColor }
  const parsed = parseNode(n.id)
  const refocus = parsed && parsed.kind === 'method' ? () => set({ focus: parsed.id, domainFull: false }) : undefined
  if (n.kind !== 'branch') {
    const text = n.kind === 'task' && closed ? `${n.label} ▸` : n.label
    return (
      <UiEntity
        key={n.id}
        uiTransform={{ ...base, borderRadius: n.kind === 'task' ? n.h / 2 : 2, justifyContent: 'center', alignItems: 'center' }}
        uiBackground={{ color: n.kind === 'task' ? (focus ? C.buttonOn : C.task) : C.prim }}
        uiText={{ value: text, fontSize: FONT[n.kind === 'task' ? 'task' : 'primitive'] * s, color: Color4.White(), textAlign: 'middle-center', textWrap: 'nowrap' }}
        onMouseDown={refocus}
      />
    )
  }
  const glyph = chosen ? colored(STATUS_HEX.chosen, '✓ ') : failed ? colored(STATUS_HEX.failed, '× ') : ''
  return (
    <UiEntity key={n.id} uiTransform={{ ...base, borderRadius: 4 * s, flexDirection: 'column', padding: { left: 4 * s, top: 2 * s } }} uiBackground={{ color: C.branch }}>
      <UiEntity key="l" uiTransform={{ height: 18 * s, width: '100%' }} uiText={{ value: `${glyph}<b>&</b> ${n.label}`, fontSize: FONT.branch * s, color: C.text, textAlign: 'middle-left', textWrap: 'nowrap' }} />
      {n.chips.length > 0 && (
        <UiEntity key="c" uiTransform={{ flexDirection: 'row', height: 16 * s }}>
          {n.chips.map((c, i) => (
            <UiEntity
              key={i}
              uiTransform={{ height: 15 * s, margin: { right: 4 * s }, padding: { left: 4 * s, right: 4 * s }, borderRadius: 3 * s }}
              uiBackground={{ color: C.chip }}
              uiText={{ value: c, fontSize: FONT.chip * s, color: C.chipText, textAlign: 'middle-center', textWrap: 'nowrap' }}
            />
          ))}
        </UiEntity>
      )}
    </UiEntity>
  )
}

export function domainTab(v: HostView) {
  const run = v.pick.run
  const d = layoutFor(v.graph, run)
  const l = d.layout
  const o = runOverlay(run)
  const i = ZOOMS.indexOf(state.zoom)
  const focusName = v.graph.methods[d.focus]?.name ?? '?'
  const what = state.domainFull
    ? `whole domain${d.hidden > 0 ? `, ${d.hidden} methods left closed (cap ${MAX_NODES} nodes)` : ''}`
    : `around ${colored(HEX.method, focusName)}${d.hidden > 0 ? `, ${d.hidden} more callers` : ''}: click a method to focus it`
  const info = `${what}   ${colored(HEX.faint, `${l.nodes.length} nodes · ${l.backEdges} back-edges`)}   ${colored(STATUS_HEX.chosen, '■ run chose')} ${colored(STATUS_HEX.failed, '■ tried, failed')}`
  return (
    <UiEntity uiTransform={{ width: BODY_W, height: BODY_H, flexDirection: 'column' }}>
      <UiEntity key="bar" uiTransform={{ flexDirection: 'row', height: BAR_H, alignItems: 'center', flexShrink: 0 }}>
        {button('Focus', () => set({ domainFull: false }), !state.domainFull, 'auto', 'focus')}
        {button('Full', () => set({ domainFull: true }), state.domainFull, 'auto', 'full')}
        {button('run root', () => set({ focus: null, domainFull: false }), false, 'auto', 'root')}
        {button('−', () => set({ zoom: ZOOMS[Math.max(0, i - 1)] }), false, 36, 'zo')}
        {label(`${Math.round(state.zoom * 100)}%`, 14, C.text, 48, 'z')}
        {button('+', () => set({ zoom: ZOOMS[Math.min(ZOOMS.length - 1, i + 1)] }), false, 36, 'zi')}
        <UiEntity key="info" uiTransform={{ height: 26, flexShrink: 0, margin: { left: 6 } }} uiText={{ value: info, fontSize: 13, color: C.dim, textAlign: 'middle-left', textWrap: 'nowrap' }} />
      </UiEntity>
      <UiEntity key="graph" uiTransform={{ width: BODY_W, height: BODY_H - BAR_H - 8, margin: { top: 8 }, overflow: 'scroll', flexShrink: 0 }} uiBackground={{ color: C.card }}>
        <UiEntity uiTransform={{ width: l.width, height: l.height, flexShrink: 0 }}>
          {l.segments.map((g, k) => (
            <UiEntity key={`s${k}`} uiTransform={{ positionType: 'absolute', position: { left: g.x, top: g.y }, width: g.w, height: g.h }} uiBackground={{ color: g.back ? C.back : C.edge }} />
          ))}
          {l.ports.map((g, k) => (
            <UiEntity key={`p${k}`} uiTransform={{ positionType: 'absolute', position: { left: g.x, top: g.y }, width: g.w, height: g.h }} uiBackground={{ color: g.back ? C.back : C.edge }} />
          ))}
          {l.nodes.map(n => node(n, state.zoom, o, d.closed.has(n.id), !state.domainFull && n.id === `m${d.focus}`))}
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
