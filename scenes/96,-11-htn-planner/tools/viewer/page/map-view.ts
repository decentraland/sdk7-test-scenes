// The domain map: model/domain-map.ts laid out with ELK (layered, top down, the model's order kept so branches read
// in priority order and subtasks left to right) and drawn as an AND/OR graph: OR nodes rounded, AND nodes square
// with their precondition chips and the AND arc across their subtask edges, primitives as small grey leaves,
// recursion as a grey back-edge with ↺, axioms and callterms on dashed edges. The selected run is drawn over it:
// the chosen path bold, the other nodes faint, the branches that failed red, the last one filled. Click an OR node
// to focus it.
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api'
import type { DomainGraph } from '../../../src/htn-planner/htn/domain-graph'
import type { PlanRun } from '../../../src/htn-planner/htn/trace'
import { domainMap, mapOverlay } from '../model/domain-map'
import type { DomainMap, MapNode } from '../model/domain-map'
import { h, measure, s, tip } from './dom'
import type { State, Store } from './state'
import { CHIP_FILL, CHIP_TEXT, COLOR, FAINT, INK, MUTED, PAPER, SHADE } from './theme'

interface Size {
  w: number
  h: number
}

interface Laid {
  map: DomainMap
  nodes: Map<string, { x: number; y: number; w: number; h: number }>
  edges: Map<string, { x: number; y: number }[]>
  width: number
  height: number
}

const elk = new ELK()
const layouts = new Map<string, Promise<Laid>>()

const CHIP = 10.5

function sizeOf(n: MapNode): Size {
  switch (n.kind) {
    case 'or':
      return { w: Math.ceil(measure(n.label, 13, 600) + 34), h: 30 }
    case 'and': {
      const chips = n.chips.reduce((a, c) => a + measure(c, CHIP) + 12, 0) + Math.max(0, n.chips.length - 1) * 4
      return { w: Math.ceil(Math.max(measure(n.label, 12.5, 600) + 24, chips + 16)), h: n.chips.length ? 46 : 26 }
    }
    case 'prim':
      return { w: Math.ceil(measure(n.label, 12) + 18), h: 22 }
    case 'axiom':
      return { w: Math.ceil(measure(n.label, 11.5) + 30), h: 22 }
    case 'callterm':
      return { w: Math.ceil(measure(n.label, 11.5) + 28), h: 22 }
  }
}

async function lay(map: DomainMap): Promise<Laid> {
  const sizes = new Map(map.nodes.map(n => [n.id, sizeOf(n)]))
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
      'elk.spacing.nodeNode': '12',
      'elk.layered.spacing.nodeNodeBetweenLayers': '46',
      'elk.layered.spacing.edgeNodeBetweenLayers': '14',
      'elk.spacing.edgeNode': '12',
      'elk.spacing.edgeEdge': '8',
      'elk.padding': '[top=20,left=20,bottom=20,right=20]'
    },
    children: map.nodes.map(n => ({ id: n.id, width: sizes.get(n.id)!.w, height: sizes.get(n.id)!.h })),
    edges: [...map.edges]
      .sort((a, b) => (a.from === b.from ? a.order - b.order : 0))
      // A back-edge goes in reversed, so the layout gets a DAG (the map's back-edges are exactly its cycles).
      .map(e => ({ id: e.id, sources: [e.kind === 'back' ? e.to : e.from], targets: [e.kind === 'back' ? e.from : e.to] }) as ElkExtendedEdge)
  }
  const out = await elk.layout(graph)
  const nodes = new Map<string, { x: number; y: number; w: number; h: number }>()
  for (const c of out.children ?? []) nodes.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 })
  const edges = new Map<string, { x: number; y: number }[]>()
  const back = new Set(map.edges.filter(e => e.kind === 'back').map(e => e.id))
  for (const e of out.edges ?? []) {
    const sec = (e as ElkExtendedEdge).sections?.[0]
    if (!sec) continue
    const pts = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint]
    edges.set(e.id, back.has(e.id) ? pts.reverse() : pts)
  }
  return { map, nodes, edges, width: out.width ?? 0, height: out.height ?? 0 }
}

/** The method the map centres on by default: the run's entry task, else the domain's first top-level one. */
export function defaultFocus(graph: DomainGraph, run: PlanRun | undefined): number | null {
  if (run && graph.methods[run.method]) return run.method
  return graph.topLevel[0] ?? graph.methods[0]?.id ?? null
}

export function renderMap(el: HTMLElement, st: State, store: Store, run: PlanRun | undefined, graph: DomainGraph | undefined): void {
  if (!graph) {
    el.replaceChildren(h('p', { class: 'empty', text: 'No domain.' }))
    return
  }
  const focus = st.mapWhole ? null : (st.mapFocus ?? defaultFocus(graph, run))
  const key = `${graph.name}|${st.mapWhole ? 'whole' : focus}`
  let p = layouts.get(key)
  if (!p) {
    let map: DomainMap
    try {
      map = domainMap(graph, { focus, maxNodes: 320 })
    } catch {
      el.replaceChildren(h('p', { class: 'empty', text: 'This domain could not be drawn.' }))
      return
    }
    p = lay(map)
    layouts.set(key, p)
  }
  const token = Symbol()
  ;(el as unknown as { token: symbol }).token = token
  if (!el.firstChild) el.append(h('p', { class: 'empty', text: 'Laying out the domain…' }))
  p.then(
    laid => {
      if ((el as unknown as { token: symbol }).token !== token) return
      // Zoom 100% fits the map to the panel's width (never larger than its natural size).
      const fit = Math.min(1, Math.max(0.7, (el.clientWidth - 24) / Math.max(1, laid.width)))
      el.replaceChildren(draw(laid, st, store, run, fit))
      // A new map or run: bring its chosen path into view (once, so the user's own scrolling stays).
      const view = `${key}|${run?.seq ?? ''}`
      if (el.dataset.view !== view) {
        el.dataset.view = view
        const o = mapOverlay(laid.map, run ?? null)
        // The branches it chose (the root task is centred on all its branches, so it says little).
        const boxes = [...o.chosen]
          .filter(id => id.startsWith('b'))
          .map(id => laid.nodes.get(id))
          .filter((b): b is NonNullable<typeof b> => !!b)
        if (boxes.length > 0) {
          const z = st.zoom * fit
          const y0 = Math.min(...boxes.map(b => b.y)) * z
          const y1 = Math.max(...boxes.map(b => b.y + b.h)) * z
          const top = y1 - y0 > el.clientHeight - 80 ? y0 - 40 : (y0 + y1) / 2 - el.clientHeight / 2
          el.scrollTo({ top: Math.max(0, top), left: 0 })
        } else el.scrollTo({ top: 0, left: 0 })
      }
    },
    err => el.replaceChildren(h('p', { class: 'empty', text: `Layout failed: ${String(err)}` }))
  )
}

function draw(l: Laid, st: State, store: Store, run: PlanRun | undefined, fit: number): SVGSVGElement {
  const o = mapOverlay(l.map, run ?? null)
  const overlay = !!run && o.chosen.size > 0
  const z = st.zoom * fit
  const svg = s('svg', { width: l.width * z, height: l.height * z, viewBox: `0 0 ${l.width} ${l.height}`, class: 'figure map' })
  svg.append(
    s(
      'defs',
      {},
      s('marker', { id: 'arrow', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0 L8 4 L0 8 z', fill: FAINT })),
      s('marker', { id: 'arrow-ink', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0 L8 4 L0 8 z', fill: INK }))
    )
  )
  const byId = new Map(l.map.nodes.map(n => [n.id, n]))
  // Edges first.
  const starts = new Map<string, { x: number; y: number }[]>()
  for (const e of l.map.edges) {
    const pts = l.edges.get(e.id)
    if (!pts || pts.length < 2) continue
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
    const chosen = o.chosenEdges.has(e.id)
    let attrs: Record<string, string | number | null>
    if (e.kind === 'uses') attrs = { stroke: '#9aa4ae', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'marker-end': 'url(#arrow)' }
    else if (e.kind === 'back') attrs = { stroke: chosen ? INK : FAINT, 'stroke-width': chosen ? 1.8 : 1.1, 'stroke-dasharray': null, 'marker-end': chosen ? 'url(#arrow-ink)' : 'url(#arrow)' }
    else attrs = { stroke: chosen ? INK : overlay ? '#c4cbd2' : '#6e7781', 'stroke-width': chosen ? 2.2 : 1.1, 'stroke-dasharray': e.deferred ? '6 3' : null }
    svg.append(s('path', { d, fill: 'none', 'stroke-linejoin': 'round', ...attrs }))
    if (e.kind === 'back') {
      const end = pts[pts.length - 1]
      svg.append(s('text', { x: end.x + 6, y: end.y - 6, fill: chosen ? INK : FAINT, 'font-size': 12, text: '↺' }, tip('recursion: a call back into a task above')))
    }
    if (e.kind === 'subtask' || e.kind === 'back') {
      const list = starts.get(e.from) ?? []
      list.push(pts[0])
      starts.set(e.from, list)
    }
  }
  // The AND arc across a branch's subtask edges.
  for (const [id, pts] of starts) {
    const n = byId.get(id)
    const box = l.nodes.get(id)
    if (!n || n.kind !== 'and' || !box || pts.length < 2) continue
    // Left to right: the subtask edges leave the branch's right side; the arc crosses them just past it.
    const ys = pts.map(p => p.y)
    const x = box.x + box.w + 8
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    if (y1 - y0 < 2) continue
    const chosen = o.chosen.has(id)
    svg.append(s('path', { d: `M${x} ${y0} Q${x + 7} ${(y0 + y1) / 2} ${x} ${y1}`, fill: 'none', stroke: chosen ? INK : overlay ? '#c4cbd2' : '#6e7781', 'stroke-width': chosen ? 1.8 : 1.1 }, tip('AND: every subtask, in order')))
  }
  for (const n of l.map.nodes) {
    const b = l.nodes.get(n.id)
    if (b) svg.append(node(n, b, o, overlay, store))
  }
  return svg
}

function node(n: MapNode, b: { x: number; y: number; w: number; h: number }, o: ReturnType<typeof mapOverlay>, overlay: boolean, store: Store): SVGGElement {
  const chosen = o.chosen.has(n.id)
  const failed = o.failed.has(n.id)
  const last = o.last === n.id
  // The run drawn over the map: its chosen path bold, the last branch that failed red; the other failed ones keep
  // a red × in their label but a faint border, so a long list of failed branches does not shout over the path.
  const faint = overlay && !chosen && !last
  const ink = faint ? FAINT : INK
  const strokeColor = last ? COLOR.failed : chosen ? INK : faint ? (failed ? '#e8b4b4' : '#c4cbd2') : '#57606a'
  const width = last ? 2.4 : chosen ? 2.2 : 1.1
  const g = s('g', { transform: `translate(${b.x} ${b.y})`, class: `mapnode ${n.kind}` })
  const status = chosen ? ' (chosen in this run)' : last ? ' (the last branch that failed in this run)' : failed ? ' (failed in this run)' : ''
  switch (n.kind) {
    case 'or': {
      g.append(s('rect', { width: b.w, height: b.h, rx: b.h / 2, fill: n.focus ? '#f6f8fa' : PAPER, stroke: strokeColor, 'stroke-width': n.focus ? width + 0.8 : width }))
      if (n.focus) g.append(s('rect', { x: 3, y: 3, width: b.w - 6, height: b.h - 6, rx: (b.h - 6) / 2, fill: 'none', stroke: strokeColor, 'stroke-width': 0.8 }))
      g.append(s('text', { x: b.w / 2, y: b.h / 2 + 4.5, 'text-anchor': 'middle', fill: ink, 'font-size': 13, 'font-weight': 600, text: n.label }))
      if (n.closed) g.append(s('text', { x: b.w - 12, y: b.h / 2 + 4, 'text-anchor': 'middle', fill: FAINT, 'font-size': 11, text: '▸' }))
      g.append(tip(`task ${n.label} (OR: the planner picks one branch)${n.topLevel ? ', top level' : ''}${n.closed ? '\nclick to open it here' : ''}${status}`))
      g.setAttribute('cursor', 'pointer')
      g.addEventListener('click', () => store.set({ mapFocus: n.ref, mapWhole: false }))
      break
    }
    case 'and': {
      g.append(s('rect', { width: b.w, height: b.h, rx: 2, fill: last ? '#fff1f0' : PAPER, stroke: strokeColor, 'stroke-width': width }))
      g.append(s('text', { x: b.w / 2, y: 17, 'text-anchor': 'middle', fill: last ? COLOR.failed : failed ? '#d27a7a' : ink, 'font-size': 12.5, 'font-weight': 600, text: (failed ? '× ' : chosen && overlay ? '✓ ' : '') + n.label }))
      let x = (b.w - (n.chips.reduce((a, c) => a + measure(c, CHIP) + 12, 0) + Math.max(0, n.chips.length - 1) * 4)) / 2
      for (const c of n.chips) {
        const w = measure(c, CHIP) + 12
        g.append(s('rect', { x, y: 25, width: w, height: 15, rx: 7.5, fill: faint ? SHADE : CHIP_FILL }), s('text', { x: x + w / 2, y: 36, 'text-anchor': 'middle', fill: faint ? FAINT : CHIP_TEXT, 'font-size': CHIP, text: c }))
        x += w + 4
      }
      g.append(tip(`branch ${n.label} (AND: every subtask, in order)\nprecondition: ${n.chips.join(', ') || 'always'}${status}`))
      break
    }
    case 'prim':
      g.append(s('rect', { width: b.w, height: b.h, rx: 2, fill: chosen ? '#eaeef2' : SHADE, stroke: chosen ? INK : faint ? '#d8dee4' : '#afb8c1', 'stroke-width': chosen ? 1.6 : 0.9 }))
      g.append(s('text', { x: b.w / 2, y: b.h / 2 + 4, 'text-anchor': 'middle', fill: faint ? FAINT : chosen ? INK : MUTED, 'font-size': 12, text: n.label }), tip(`primitive ${n.label}${chosen ? ' (in this plan)' : ''}`))
      break
    case 'axiom':
      g.append(
        s('path', { d: `M8 0 H${b.w - 8} L${b.w} ${b.h / 2} L${b.w - 8} ${b.h} H8 L0 ${b.h / 2} z`, fill: PAPER, stroke: '#9aa4ae', 'stroke-dasharray': '4 3' }),
        s('text', { x: b.w / 2, y: b.h / 2 + 4, 'text-anchor': 'middle', fill: MUTED, 'font-size': 11.5, 'font-style': 'italic', text: n.label }),
        tip(`axiom ${n.label}: a derived condition`)
      )
      break
    case 'callterm':
      g.append(
        s('path', { d: `M6 0 H${b.w} L${b.w - 6} ${b.h} H0 z`, fill: PAPER, stroke: '#9aa4ae', 'stroke-dasharray': '4 3' }),
        s('text', { x: b.w / 2, y: b.h / 2 + 4, 'text-anchor': 'middle', fill: MUTED, 'font-size': 11.5, 'font-style': 'italic', text: `ƒ ${n.label}` }),
        tip(`callterm ${n.label}: a host function`)
      )
      break
  }
  return g
}
