// The planning figure: the run's refinement tree (model/plan-tree.ts) laid out left to right (model/tree-layout.ts)
// and drawn as SVG: task nodes rounded, branch cards with their precondition lines, steps as small boxes, edges
// coloured and dashed by status, "× N attempts" stubs that unfold on a click. A click on a node selects it for the
// detail panel; a click on a card's fold mark or a stub folds or unfolds it.
import type { DomainGraph } from '../../../src/htn-planner/htn/domain-graph'
import type { PlanRun } from '../../../src/htn-planner/htn/trace'
import { planTree } from '../model/plan-tree'
import type { FigNode } from '../model/plan-tree'
import { layoutTree, TREE } from '../model/tree-layout'
import type { TreeBox } from '../model/tree-layout'
import { measure, s, tip } from './dom'
import type { State, Store } from './state'
import { AMBER, BLUE, COLOR, FAINT, GLYPH, INK, MUTED, PAPER, SHADE, stroke } from './theme'
import type { StepState } from '../model/plan-strip'

const metrics = { measure: (text: string, size: number) => measure(text, size, size === TREE.titleSize ? 600 : 400) + 1, maxLines: 16 }

/**
 * `steps`: on replay, where the agent was in this run's plan at the cursor (by the task node of each step): a running
 * step is drawn blue, a done one shaded, a failed or cut one red / amber; none without events.
 */
export function renderTree(el: HTMLElement, st: State, store: Store, run: PlanRun | undefined, graph: DomainGraph | undefined, steps: ReadonlyMap<number, StepState> = new Map()): void {
  el.replaceChildren()
  if (!run || !graph) {
    el.append(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'No run for this agent at this time.' }))
    return
  }
  const root = planTree(run, graph, { mode: st.mode, open: st.folds })
  if (!root) {
    el.append(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'This run recorded no decomposition.' }))
    return
  }
  const l = layoutTree(root, metrics)
  const M = 24
  const z = st.zoom
  const svg = s('svg', { width: (l.width + 2 * M) * z, height: (l.height + 2 * M) * z, viewBox: `${-M} ${-M} ${l.width + 2 * M} ${l.height + 2 * M}`, class: 'figure' })
  const toggle = (key: string, open: boolean) => {
    const folds = new Map(st.folds)
    folds.set(key, open)
    store.set({ folds })
  }
  for (const e of l.edges) {
    const k = stroke(e.status)
    const d = e.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
    svg.append(s('path', { d, fill: 'none', stroke: k.color === INK ? '#424a53' : k.color, 'stroke-width': k.width, 'stroke-dasharray': k.dash, 'stroke-linejoin': 'round' }))
  }
  for (const stub of l.stubs) {
    const g = s('g', { class: 'stub', cursor: 'pointer' }, tip('click to unfold'))
    g.append(
      s('line', { x1: stub.x - 18, x2: stub.x, y1: stub.y + stub.h / 2, y2: stub.y + stub.h / 2, stroke: COLOR.failed, 'stroke-dasharray': '2 3' }),
      s('rect', { x: stub.x, y: stub.y, width: stub.w, height: stub.h, rx: stub.h / 2, fill: '#fff5f5', stroke: '#ffb8b8' }),
      s('text', { x: stub.x + stub.w / 2, y: stub.y + stub.h / 2 + 4, 'text-anchor': 'middle', fill: COLOR.failed, 'font-size': TREE.subSize, text: stub.text })
    )
    g.addEventListener('click', () => toggle(stub.key, true))
    svg.append(g)
  }
  for (const b of l.boxes) svg.append(box(b, st, store, toggle, steps.get(b.fig.node)))
  el.append(svg)
  // A new run: bring its root into view (a big tree centres it far down); once, so the user's scrolling stays.
  const view = `${run.seq}|${st.agent}`
  if (el.dataset.view !== view) {
    el.dataset.view = view
    const r = l.boxes[0]
    if (r) el.scrollTo({ top: Math.max(0, (r.y + M + r.h / 2) * z - el.clientHeight / 3), left: 0 })
  }
}

const STEP_FILL: Record<StepState, { fill: string; stroke?: string; width?: number }> = {
  done: { fill: '#eef1f4' },
  running: { fill: '#ddf4ff', stroke: BLUE, width: 2 },
  upcoming: { fill: PAPER },
  failed: { fill: '#fff1f0', stroke: COLOR.failed, width: 1.6 },
  cut: { fill: '#fff8c5', stroke: AMBER, width: 1.4 }
}

function box(b: TreeBox, st: State, store: Store, toggle: (key: string, open: boolean) => void, exec: StepState | undefined): SVGGElement {
  const n = b.fig
  const k = stroke(n.status)
  const selected = st.selected !== null && st.selected === n.node
  const g = s('g', { class: `node ${n.kind}`, cursor: 'pointer', transform: `translate(${b.x} ${b.y})` })
  const radius = n.kind === 'task' ? 12 : n.kind === 'step' ? 3 : 4
  const fill = n.kind === 'step' ? SHADE : n.kind === 'untried' ? PAPER : PAPER
  const run = exec ? STEP_FILL[exec] : undefined
  g.append(
    s(
      'rect',
      {
        width: b.w,
        height: b.h,
        rx: radius,
        fill: selected ? '#eef6ff' : (run?.fill ?? fill),
        stroke: selected ? BLUE : (run?.stroke ?? k.color),
        'stroke-width': selected ? 2.2 : (run?.width ?? (n.kind === 'step' ? Math.min(k.width, 1.2) : k.width)),
        'stroke-dasharray': k.dash
      },
      exec ? tip(`on replay: ${exec}`) : null
    )
  )
  // Title: glyph, name.
  const ty = TREE.padY + 13
  const color = n.status === 'untried' ? FAINT : INK
  g.append(s('text', { x: TREE.padX, y: ty, fill: COLOR[n.status], 'font-size': TREE.titleSize, 'font-weight': 700, text: GLYPH[n.status] }))
  g.append(s('text', { x: TREE.padX + TREE.glyph, y: ty, fill: color, 'font-size': TREE.titleSize, 'font-weight': n.kind === 'step' ? 400 : 600, text: n.title }))
  let y = ty
  if (n.sub) {
    y += TREE.lineH - 2
    g.append(s('text', { x: TREE.padX + TREE.glyph, y, fill: MUTED, 'font-size': TREE.subSize, 'font-style': 'italic', text: n.sub }))
  }
  if (b.lines.length > 0) {
    y += 6
    g.append(s('line', { x1: 6, x2: b.w - 6, y1: y - 2, y2: y - 2, stroke: '#eaeef2' }))
    for (const line of b.lines) {
      y += TREE.lineH
      const x0 = TREE.padX + line.depth * TREE.indent
      if (line.node === st.selected) g.append(s('rect', { x: 4, y: y - TREE.lineH + 2, width: b.w - 8, height: TREE.lineH, rx: 3, fill: '#ddf4ff' }))
      const lc = line.status === 'untried' ? FAINT : line.status === 'failed' ? COLOR.failed : INK
      g.append(s('text', { x: x0, y: y - 3, fill: COLOR[line.status], 'font-size': TREE.lineSize, 'font-weight': 700, text: GLYPH[line.status] }))
      const t = s('text', { x: x0 + TREE.glyph, y: y - 3, fill: lc, 'font-size': TREE.lineSize, text: line.text })
      if (line.retries) t.append(s('tspan', { fill: MUTED, 'font-size': TREE.subSize, text: `  ↺${line.retries}` }))
      if (line.note) t.append(s('tspan', { fill: COLOR.failed, 'font-size': TREE.subSize, 'font-style': 'italic', text: `  ${line.note}` }))
      t.addEventListener('click', e => {
        e.stopPropagation()
        store.set({ selected: line.node })
      })
      g.append(t)
    }
    if (b.more > 0) {
      y += TREE.lineH
      g.append(s('text', { x: TREE.padX + TREE.glyph, y: y - 3, fill: MUTED, 'font-size': TREE.subSize, text: `+${b.more} more (select for all)` }))
    }
  }
  if (n.children.length > 0 && n.kind !== 'task') {
    // A fold mark at the right edge.
    const mark = s('g', { class: 'fold' }, tip(n.open ? 'fold' : 'unfold'))
    mark.append(s('circle', { cx: b.w, cy: b.h / 2, r: 7, fill: PAPER, stroke: k.color }), s('text', { x: b.w, y: b.h / 2 + 4, 'text-anchor': 'middle', 'font-size': 11, fill: k.color, text: n.open ? '−' : '+' }))
    mark.addEventListener('click', e => {
      e.stopPropagation()
      toggle(n.key, !n.open)
    })
    g.append(mark)
  }
  g.append(tip(tooltip(n)))
  g.addEventListener('click', () => {
    if (n.node >= 0) store.set({ selected: n.node })
  })
  return g
}

function tooltip(n: FigNode): string {
  const what = { task: 'task', branch: 'branch', attempt: 'attempt', step: 'step', untried: 'branches not tried', failures: 'branches that failed (open: their cards)' }[n.kind]
  const status = { chosen: 'chosen', failed: 'failed', backtracked: 'backtracked: its condition held, a subtask failed', untried: 'not tried', running: 'running' }[n.status]
  return `${what}: ${n.title}${n.sub ? `\n${n.sub}` : ''}\n${status}${n.hiddenFailures && !n.open ? `\n${n.hiddenFailures} failed attempt(s) folded` : ''}`
}
