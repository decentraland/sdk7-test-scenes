// The refinement tree laid out left to right, a tidy tree: each node beside its parent, children top to bottom in
// the order they were tried, a parent centred on its children. Wide labels and tall cards fit because each column
// starts where its own parent ends. A closed node with failures below it gets a stub ("× N attempts"). Text widths
// come from `measure` (the page measures with the canvas; tests count characters). Pure.
import type { CondLine, FigNode } from './plan-tree'

export interface TreeMetrics {
  /** Width in px of `text` at font size `size`. */
  measure: (text: string, size: number) => number
  /** Card lines shown before "+N more" (default 8). */
  maxLines?: number
}

export const TREE = {
  titleSize: 13,
  lineSize: 12,
  subSize: 11,
  padX: 10,
  padY: 7,
  lineH: 17,
  titleH: 18,
  indent: 12,
  /** The glyph column of a line or a title. */
  glyph: 16,
  hgap: 44,
  vgap: 12,
  stubGap: 18
}

export interface TreeBox {
  key: string
  fig: FigNode
  x: number
  y: number
  w: number
  h: number
  /** Lines drawn (cut to maxLines, the "+N more" line not counted). */
  lines: CondLine[]
  /** Lines left out. */
  more: number
}

export interface TreeEdge {
  from: string
  to: string
  /** Polyline: out of the parent's right side, along a bus, into the child's left side. */
  points: { x: number; y: number }[]
  status: FigNode['status']
}

export interface TreeStub {
  /** The closed node's key. */
  key: string
  text: string
  x: number
  y: number
  w: number
  h: number
}

export interface TreeLayout {
  boxes: TreeBox[]
  edges: TreeEdge[]
  stubs: TreeStub[]
  width: number
  height: number
}

function size(n: FigNode, m: TreeMetrics): { w: number; h: number; lines: CondLine[]; more: number } {
  const max = Math.max(1, m.maxLines ?? 8)
  const cut = n.lines.length > max ? max - 1 : max
  const lines = n.lines.slice(0, cut)
  const more = n.lines.length - lines.length
  let w = TREE.glyph + m.measure(n.title, TREE.titleSize)
  let h = TREE.titleH
  if (n.sub) {
    w = Math.max(w, m.measure(n.sub, TREE.subSize))
    h += TREE.lineH - 2
  }
  for (const l of lines) {
    const text = l.text + (l.retries ? `  ↺${l.retries}` : '') + (l.note ? `  ${l.note}` : '')
    w = Math.max(w, l.depth * TREE.indent + TREE.glyph + m.measure(text, TREE.lineSize))
  }
  if (lines.length > 0) h += 4 + lines.length * TREE.lineH
  if (more > 0) h += TREE.lineH
  // Room for the fold mark on the right edge of a card that has children.
  if (n.children.length > 0 && n.kind !== 'task') w += 10
  return { w: Math.ceil(w + 2 * TREE.padX), h: Math.ceil(h + 2 * TREE.padY), lines, more }
}

export function stubText(n: number): string {
  return `× ${n} attempt${n === 1 ? '' : 's'}`
}

/** Lay out the open part of the tree from `root`. */
export function layoutTree(root: FigNode, m: TreeMetrics): TreeLayout {
  const boxes: TreeBox[] = []
  const edges: TreeEdge[] = []
  const stubs: TreeStub[] = []
  const sizes = new Map<FigNode, ReturnType<typeof size>>()
  const sizeOf = (n: FigNode) => {
    let s = sizes.get(n)
    if (!s) sizes.set(n, (s = size(n, m)))
    return s
  }
  const shown = (n: FigNode) => (n.open ? n.children : [])
  const stubOf = (n: FigNode) => (!n.open && n.children.length > 0 && n.kind !== 'failures' ? stubText(Math.max(1, n.hiddenFailures)) : null)
  const stubSize = (text: string) => ({ w: Math.ceil(m.measure(text, TREE.subSize) + 16), h: 20 })
  // Subtree heights, bottom up.
  const heights = new Map<FigNode, number>()
  const height = (n: FigNode): number => {
    const own = sizeOf(n).h
    const kids = shown(n)
    let total = 0
    kids.forEach((k, i) => (total += height(k) + (i > 0 ? TREE.vgap : 0)))
    const stub = stubOf(n)
    const h = Math.max(own, total, stub ? stubSize(stub).h : 0)
    heights.set(n, h)
    return h
  }
  height(root)
  let width = 0
  const place = (n: FigNode, x: number, top: number): TreeBox => {
    const s = sizeOf(n)
    const sub = heights.get(n) ?? s.h
    const box: TreeBox = { key: n.key, fig: n, x, y: top + (sub - s.h) / 2, w: s.w, h: s.h, lines: s.lines, more: s.more }
    boxes.push(box)
    width = Math.max(width, x + s.w)
    const midY = box.y + box.h / 2
    const stub = stubOf(n)
    if (stub) {
      const ss = stubSize(stub)
      stubs.push({ key: n.key, text: stub, x: x + s.w + TREE.stubGap, y: midY - ss.h / 2, w: ss.w, h: ss.h })
      width = Math.max(width, x + s.w + TREE.stubGap + ss.w)
    }
    const kids = shown(n)
    if (kids.length === 0) return box
    let total = 0
    kids.forEach((k, i) => (total += (heights.get(k) ?? 0) + (i > 0 ? TREE.vgap : 0)))
    let y = top + (sub - total) / 2
    const cx = x + s.w + TREE.hgap
    const busX = x + s.w + TREE.hgap / 2
    for (const k of kids) {
      const kb = place(k, cx, y)
      const ky = kb.y + kb.h / 2
      edges.push({
        from: n.key,
        to: k.key,
        status: k.status,
        points: [
          { x: x + s.w, y: midY },
          { x: busX, y: midY },
          { x: busX, y: ky },
          { x: cx, y: ky }
        ]
      })
      y += (heights.get(k) ?? 0) + TREE.vgap
    }
    return box
  }
  place(root, 0, 0)
  return { boxes, edges, stubs, width: Math.ceil(width), height: Math.ceil(heights.get(root) ?? 0) }
}
