// Layered AND/OR layout of a domain graph with orthogonal edges, for a UI that can only draw axis-aligned
// rectangles. Sugiyama-lite:
//   1. primitives are drawn once per use (a leaf box under its branch), compound tasks once;
//   2. a DFS from the root marks recursion back-edges, the rest is a DAG layered by longest path;
//   3. edges spanning several layers go through dummy nodes (one per crossed layer);
//   4. a few barycenter sweeps order each layer;
//   5. x: nodes pulled toward their parents/children, overlaps resolved in order;
//   6. edges routed as buses: down from the parent, along a track in the gap, down into the child. Tracks are
//      shared by buses that don't overlap. Back-edges go down, sideways to a lane past the nearer edge of the
//      graph, up, back and down into the task.
// Every length scales with `scale`, so zoom is a re-layout. Pure, no SDK.
import type { GraphModel, GraphNodeKind } from './model'

export interface LayoutNode {
  id: string
  kind: GraphNodeKind | 'dummy'
  label: string
  chips: string[]
  layer: number
  x: number
  y: number
  w: number
  h: number
}

export interface Segment {
  x: number
  y: number
  w: number
  h: number
  back: boolean
}

export interface GraphLayout {
  /** Real nodes (no dummies). */
  nodes: LayoutNode[]
  /** Edge pieces, each an axis-aligned thin rectangle. Dummy nodes are drawn as vertical segments here. */
  segments: Segment[]
  /** Arrow nubs at the in-ports, small squares. */
  ports: Segment[]
  width: number
  height: number
  layers: number
  dummies: number
  backEdges: number
}

export interface LayoutOptions {
  scale?: number
  /** Approximate glyph width as a fraction of the font size, for sizing boxes. */
  charWidth?: number
  /**
   * Where a parent sits over its children: their mean (default), or over its first child, so that a graph wider
   * than its view starts at the top-left (a scroll view opens there and the SDK cannot move it).
   */
  parentAlign?: 'centre' | 'first'
}

interface Work extends LayoutNode {
  order: number
  out: string[]
  in: string[]
}

export const FONT = { task: 14, branch: 12, chip: 10, primitive: 12 }

export function layoutDomain(g: GraphModel, opts: LayoutOptions = {}): GraphLayout {
  const s = opts.scale ?? 1
  const cw = opts.charWidth ?? 0.58
  const thick = Math.max(1, Math.round(2 * s))
  const margin = 16 * s
  const step = 5 * s
  const pad = 9 * s

  // 1. Nodes, with primitives split per use.
  const work = new Map<string, Work>()
  const mk = (id: string, kind: Work['kind'], label: string, chips: string[] = []): Work => {
    const n: Work = { id, kind, label, chips, layer: 0, order: 0, x: 0, y: 0, w: 0, h: 0, out: [], in: [] }
    work.set(id, n)
    return n
  }
  const src = new Map(g.nodes.map(n => [n.id, n]))
  for (const n of g.nodes) if (n.kind !== 'primitive') mk(n.id, n.kind, n.label, n.chips ?? [])
  const edges: [string, string][] = []
  let use = 0
  for (const e of g.edges) {
    const to = src.get(e.to)
    if (!work.has(e.from) || !to) continue
    if (to.kind === 'primitive') {
      const id = `${e.from}>${e.to}#${use++}`
      mk(id, 'primitive', to.label)
      edges.push([e.from, id])
    } else edges.push([e.from, e.to])
  }
  const out = new Map<string, string[]>()
  for (const [a, b] of edges) (out.get(a) ?? out.set(a, []).get(a)!).push(b)

  // 2. DFS: back-edges and a topological order of the rest.
  const state = new Map<string, number>()
  const post: string[] = []
  const pre: string[] = []
  const fwd: [string, string][] = []
  const back: [string, string][] = []
  const dfs = (v: string) => {
    state.set(v, 1)
    pre.push(v)
    for (const w of out.get(v) ?? []) {
      const st = state.get(w) ?? 0
      if (st === 1) back.push([v, w])
      else {
        fwd.push([v, w])
        if (st === 0) dfs(w)
      }
    }
    state.set(v, 2)
    post.push(v)
  }
  if (work.has(g.root)) dfs(g.root)
  for (const id of work.keys()) if (!state.has(id)) dfs(id)
  const topo = post.slice().reverse()
  for (const v of topo) for (const w of out.get(v) ?? []) {
    if (back.some(([a, b]) => a === v && b === w)) continue
    const nv = work.get(v)!, nw = work.get(w)!
    nw.layer = Math.max(nw.layer, nv.layer + 1)
  }

  // 3. Dummies for long edges; links all span one layer.
  let dummies = 0
  const link = (a: Work, b: Work) => {
    a.out.push(b.id)
    b.in.push(a.id)
  }
  for (const [a, b] of fwd) {
    const na = work.get(a)!, nb = work.get(b)!
    let prev = na
    for (let l = na.layer + 1; l < nb.layer; l++) {
      const d = mk(`~${a}>${b}@${l}#${dummies}`, 'dummy', '')
      d.layer = l
      dummies++
      link(prev, d)
      prev = d
    }
    link(prev, nb)
  }

  // 4. Order: discovery order, then barycenter sweeps (the subtask index breaks ties so order is kept).
  const nLayers = Math.max(0, ...[...work.values()].map(n => n.layer)) + 1
  const layers: Work[][] = Array.from({ length: nLayers }, () => [])
  const seen = new Set<string>()
  const place = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const n = work.get(id)!
    layers[n.layer].push(n)
    n.out.forEach(place)
  }
  pre.forEach(place)
  for (const n of work.values()) place(n.id)
  const renumber = (layer: Work[]) => layer.forEach((n, i) => (n.order = i))
  layers.forEach(renumber)
  const bary = (n: Work, nbrs: string[], own: (o: Work) => string[]) => {
    if (nbrs.length === 0) return n.order
    let sum = 0
    for (const id of nbrs) {
      const o = work.get(id)!
      sum += o.order + 0.01 * own(o).indexOf(n.id)
    }
    return sum / nbrs.length
  }
  for (let it = 0; it < 4; it++) {
    for (let l = 1; l < nLayers; l++) sortBy(layers[l], n => bary(n, n.in, o => o.out))
    for (let l = nLayers - 2; l >= 0; l--) sortBy(layers[l], n => bary(n, n.out, o => o.in))
  }

  // 5. Sizes and x.
  for (const n of work.values()) {
    if (n.kind === 'dummy') continue
    const f = FONT[n.kind] * s
    // The view prefixes a branch with its glyph and '& ' (4 characters) and suffixes a closed task with ' ▸'.
    const extra = n.kind === 'branch' ? 4 : n.kind === 'task' ? 2 : 0
    const textW = (n.label.length + extra) * f * cw + 16 * s
    if (n.kind === 'branch') {
      const chipsW = n.chips.reduce((a, c) => a + c.length * FONT.chip * s * cw + 12 * s, 0) + 8 * s
      n.w = Math.max(textW, chipsW)
      n.h = (n.chips.length ? 40 : 24) * s
    } else {
      n.w = textW
      n.h = (n.kind === 'task' ? 26 : 22) * s
    }
  }
  const gapOf = (a: Work, b: Work) => (a.kind === 'dummy' || b.kind === 'dummy' ? 6 : 14) * s
  const pack = (layer: Work[], want: (n: Work) => number) => {
    // Feasible left-to-right and right-to-left placements around the wanted centres, averaged.
    const left = layer.map(n => want(n) - n.w / 2)
    for (let i = 1; i < layer.length; i++) left[i] = Math.max(left[i], left[i - 1] + layer[i - 1].w + gapOf(layer[i - 1], layer[i]))
    const right = layer.map(n => want(n) - n.w / 2)
    for (let i = layer.length - 2; i >= 0; i--) right[i] = Math.min(right[i], right[i + 1] - layer[i].w - gapOf(layer[i], layer[i + 1]))
    layer.forEach((n, i) => (n.x = (left[i] + right[i]) / 2))
  }
  let cursor = 0
  layers.forEach(layer => {
    cursor = 0
    for (let i = 0; i < layer.length; i++) {
      layer[i].x = cursor
      cursor += layer[i].w + (i + 1 < layer.length ? gapOf(layer[i], layer[i + 1]) : 0)
    }
  })
  const centre = (n: Work) => n.x + n.w / 2
  const first = (ids: string[], fallback: number) => (ids.length ? Math.min(...ids.map(id => centre(work.get(id)!))) : fallback)
  const mean = (ids: string[], fallback: number) => (ids.length ? ids.reduce((a, id) => a + centre(work.get(id)!), 0) / ids.length : fallback)
  for (let it = 0; it < 3; it++) {
    for (let l = 1; l < nLayers; l++) pack(layers[l], n => mean(n.in, centre(n)))
    for (let l = nLayers - 2; l >= 0; l--) pack(layers[l], n => (opts.parentAlign === 'first' ? first(n.out, centre(n)) : mean(n.out, centre(n))))
  }
  // Back-edges take the lane on the nearer side of the graph (left lanes get room before the first node).
  const minX = Math.min(...[...work.values()].map(n => n.x))
  const maxX = Math.max(...[...work.values()].map(n => n.x + n.w))
  const onLeft = back.map(([a]) => centre(work.get(a)!) < (minX + maxX) / 2)
  const leftCount = onLeft.filter(Boolean).length
  const rightCount = back.length - leftCount
  const leftRoom = leftCount ? (12 + (leftCount - 1) * 6) * s : 0
  for (const n of work.values()) n.x += margin + leftRoom - minX

  // In-ports spread over each target's top, ordered by source x.
  const inPort = new Map<string, number>() // `${from}>${to}` → x
  for (const n of work.values()) {
    const ins = n.in.slice().sort((a, b) => centre(work.get(a)!) - centre(work.get(b)!))
    ins.forEach((from, i) => inPort.set(`${from}>${n.id}`, n.kind === 'dummy' ? n.x : n.x + (n.w * (i + 1)) / (ins.length + 1)))
  }

  // 6. Tracks per gap: buses that overlap in x get different tracks.
  interface Bus { from: Work; lo: number; hi: number; track: number }
  const buses: Bus[][] = layers.map(() => [])
  const trackCount: number[] = layers.map(() => 0)
  layers.forEach((layer, l) => {
    const list: Bus[] = []
    for (const n of layer) {
      if (n.out.length === 0) continue
      const xs = [centre(n), ...n.out.map(t => inPort.get(`${n.id}>${t}`)!)]
      list.push({ from: n, lo: Math.min(...xs), hi: Math.max(...xs), track: -1 })
    }
    list.sort((a, b) => a.lo - b.lo)
    const ends: number[] = []
    for (const b of list) {
      if (b.hi - b.lo < 0.5) continue // a straight drop needs no track
      let t = ends.findIndex(e => e < b.lo - 4 * s)
      if (t < 0) t = ends.push(0) - 1
      ends[t] = b.hi
      b.track = t
    }
    buses[l] = list
    trackCount[l] = ends.length
  })
  const backBelow = layers.map(() => 0)
  const backAbove = layers.map(() => 0)
  for (const [a, b] of back) {
    backBelow[work.get(a)!.layer]++
    backAbove[work.get(b)!.layer]++
  }

  // 7. y per layer.
  const layerTop: number[] = []
  const layerH: number[] = []
  let y = margin + pad + backAbove[0] * step
  layers.forEach((layer, l) => {
    layerTop[l] = y
    layerH[l] = Math.max(1, ...layer.map(n => n.h))
    for (const n of layer) {
      n.y = y
      if (n.kind === 'dummy') n.h = layerH[l]
    }
    const next = l + 1 < nLayers ? backAbove[l + 1] : 0
    y += layerH[l] + pad + (trackCount[l] + backBelow[l] + next) * step + pad
  })
  const height = y - pad + margin
  const trackY = (l: number, t: number) => layerTop[l] + layerH[l] + pad + t * step

  // 8. Segments.
  const segments: Segment[] = []
  const ports: Segment[] = []
  const hseg = (x1: number, x2: number, yy: number, isBack = false) => {
    if (Math.abs(x2 - x1) < 0.5) return
    segments.push({ x: Math.min(x1, x2) - thick / 2, y: yy - thick / 2, w: Math.abs(x2 - x1) + thick, h: thick, back: isBack })
  }
  const vseg = (xx: number, y1: number, y2: number, isBack = false) => {
    if (Math.abs(y2 - y1) < 0.5) return
    segments.push({ x: xx - thick / 2, y: Math.min(y1, y2), w: thick, h: Math.abs(y2 - y1), back: isBack })
  }
  const port = (xx: number, yy: number, isBack = false) => {
    const p = 3 * s + thick
    ports.push({ x: xx - p, y: yy - p, w: 2 * p, h: p, back: isBack })
  }
  for (const n of work.values()) if (n.kind === 'dummy') vseg(n.x, n.y, n.y + n.h)
  buses.forEach((list, l) => {
    for (const b of list) {
      const x0 = centre(b.from)
      const bottom = b.from.y + b.from.h
      if (b.track < 0) {
        const to = work.get(b.from.out[0])!
        vseg(x0, bottom, to.y)
        if (to.kind !== 'dummy') port(x0, to.y)
        continue
      }
      const ty = trackY(l, b.track)
      vseg(x0, bottom, ty)
      hseg(b.lo, b.hi, ty)
      for (const t of b.from.out) {
        const to = work.get(t)!
        const px = inPort.get(`${b.from.id}>${t}`)!
        vseg(px, ty, to.y)
        if (to.kind !== 'dummy') port(px, to.y)
      }
    }
  })
  const right = Math.max(...[...work.values()].map(n => n.x + n.w))
  const belowUsed = layers.map(() => 0)
  const aboveUsed = layers.map(() => 0)
  let li = 0
  let ri = 0
  back.forEach(([a, b], i) => {
    const na = work.get(a)!, nb = work.get(b)!
    const left = onLeft[i]
    const lane = left ? margin + (leftCount - 1 - li++) * 6 * s : right + (12 + ri++ * 6) * s
    const y1 = trackY(na.layer, trackCount[na.layer] + belowUsed[na.layer]++)
    const y2 = layerTop[nb.layer] - pad - aboveUsed[nb.layer]++ * step
    const x0 = left ? na.x + na.w * 0.25 : na.x + na.w * 0.75
    const x1 = left ? nb.x + 6 * s : nb.x + nb.w - 6 * s
    vseg(x0, na.y + na.h, y1, true)
    hseg(x0, lane, y1, true)
    vseg(lane, y1, y2, true)
    hseg(lane, x1, y2, true)
    vseg(x1, y2, nb.y, true)
    port(x1, nb.y, true)
  })

  const nodes = [...work.values()].filter(n => n.kind !== 'dummy').map(({ order, out, in: _in, ...n }) => n)
  return {
    nodes,
    segments,
    ports,
    width: right + (rightCount ? (12 + rightCount * 6) * s : 0) + margin,
    height,
    layers: nLayers,
    dummies,
    backEdges: back.length
  }
}

function sortBy<T>(xs: T[], key: (x: T) => number) {
  const keyed = xs.map((x, i) => ({ x, k: key(x), i }))
  keyed.sort((a, b) => a.k - b.k || a.i - b.i)
  keyed.forEach((e, i) => {
    xs[i] = e.x
    ;(e.x as unknown as { order: number }).order = i
  })
}
