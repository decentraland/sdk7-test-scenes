// The timeline strip: one track per agent with its plan spans, step spans and ◆ replans, a time axis and the
// cursor. Click or drag on a track: move the cursor (and pick that agent); click a ◆: open that replan's run.
import type { ReplanMarker, Track } from '../model/timeline'
import { s, tip } from './dom'
import type { State, Store } from './state'
import { AMBER, BLUE, COLOR, FAINT, INK, MUTED, RULE, SHADE } from './theme'
import { stepText } from '../model/format'

const LABEL_W = 92
const ROW_H = 34
const AXIS_H = 22
const PAD_R = 16

function ticks(t0: number, t1: number, width: number, whole: boolean): number[] {
  const span = Math.max(t1 - t0, 1e-6)
  const target = Math.max(2, Math.floor(width / 90))
  const raw = whole ? Math.max(1, span / target) : span / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map(k => k * mag).find(k => k >= raw) ?? raw
  const out: number[] = []
  for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6)
  return out
}

export function renderTimeline(el: HTMLElement, st: State, store: Store): void {
  const tl = st.timeline
  const ix = st.index
  el.replaceChildren()
  if (!tl || !ix) return
  if (tl.t1 <= tl.t0 && ix.session.timeline.length === 0) {
    // One plan at one moment (a Domain Runner session): nothing to replay.
    const runs = ix.session.runs.length
    el.append(Object.assign(document.createElement('p'), { className: 'muted single', textContent: `${runs} run${runs === 1 ? '' : 's'} at one moment: no timeline. Record a level (npm run htn:level -- <level> --session <file>) to replay one.` }))
    return
  }
  const width = Math.max(400, el.clientWidth || 1200)
  const tracks = tl.tracks
  const height = AXIS_H + tracks.length * ROW_H + 6
  const t0 = tl.t0
  const t1 = tl.t1 > tl.t0 ? tl.t1 : tl.t0 + 1
  const x = (t: number) => LABEL_W + ((t - t0) / (t1 - t0)) * (width - LABEL_W - PAD_R)
  const tOf = (px: number) => t0 + ((px - LABEL_W) / (width - LABEL_W - PAD_R)) * (t1 - t0)
  const svg = s('svg', { width, height, class: 'timeline', 'font-size': 11 })
  // Axis.
  for (const t of ticks(t0, t1, width - LABEL_W, !ix.timed)) {
    svg.append(
      s('line', { x1: x(t), x2: x(t), y1: AXIS_H - 4, y2: height, stroke: '#eaeef2' }),
      s('text', { x: x(t), y: 12, 'text-anchor': 'middle', fill: MUTED, text: ix.timed ? `${t.toFixed(t1 - t0 < 5 ? 1 : 0)} s` : `run ${t + 1}` })
    )
  }
  tracks.forEach((tr: Track, i: number) => {
    const y = AXIS_H + i * ROW_H
    const selected = tr.agent === st.agent
    const row = s('g', { class: 'track' })
    row.append(s('rect', { x: 0, y, width, height: ROW_H, fill: selected ? '#f3f6fa' : 'transparent' }))
    row.append(s('text', { x: 8, y: y + ROW_H / 2 + 4, fill: selected ? INK : MUTED, 'font-weight': selected ? 600 : 400, 'font-size': 12, text: tr.agent }))
    // Plan spans: light bars with the plan's first step.
    for (const p of tr.plans) {
      const x0 = x(p.t0)
      const w = Math.max(2, x(p.t1) - x0)
      const g = s('g', {}, tip(`plan from ${p.t0.toFixed(2)} s: ${p.steps} step${p.steps === 1 ? '' : 's'}\n${p.label}`))
      g.append(s('rect', { x: x0, y: y + 6, width: w, height: 14, rx: 2, fill: SHADE, stroke: RULE }))
      const label = stepText(p.label.replace(/\s+\+\d+$/, ''))
      if (w > 40) g.append(s('text', { x: x0 + 4, y: y + 16.5, fill: MUTED, 'font-size': 10, text: clipText(label, w - 8) }))
      row.append(g)
    }
    // Step spans: a thin bar under the plan, coloured by how the step ended.
    for (const sp of tr.steps) {
      const color = sp.status === 'done' ? '#8c959f' : sp.status === 'failed' ? COLOR.failed : sp.status === 'cancelled' ? AMBER : BLUE
      row.append(s('rect', { x: x(sp.t0), y: y + 23, width: Math.max(1.5, x(sp.t1) - x(sp.t0) - 1), height: 4, fill: color }, tip(`${stepText(sp.label)}: ${sp.status} (${sp.t0.toFixed(2)}–${sp.t1.toFixed(2)} s)`)))
      if (sp.status === 'failed') row.append(s('text', { x: x(sp.t1), y: y + 31, 'text-anchor': 'middle', fill: COLOR.failed, 'font-size': 10, text: '×' }))
    }
    // Runs without a replan of their own (deferred expansions): a tick.
    for (const r of tr.runs) row.append(s('line', { x1: x(r.t), x2: x(r.t), y1: y + 4, y2: y + 8, stroke: r.ok ? FAINT : COLOR.failed }, tip(`run #${r.seq}${r.deferred ? ' (deferred step)' : ''}`)))
    // Replans.
    for (const m of tr.markers) row.append(markerGlyph(m, x(m.t), y + 6, st, store, tr.agent))
    svg.append(row)
  })
  // Cursor.
  const cx = x(Math.min(Math.max(st.cursor, t0), t1))
  svg.append(s('line', { x1: cx, x2: cx, y1: AXIS_H - 6, y2: height, stroke: BLUE, 'stroke-width': 1.5 }), s('path', { d: `M${cx - 5} ${AXIS_H - 10} h10 l-5 6 z`, fill: BLUE }))
  // Scrubbing.
  let dragging = false
  const at = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect()
    const px = e.clientX - r.left
    const row = Math.floor((e.clientY - r.top - AXIS_H) / ROW_H)
    const t = Math.min(t1, Math.max(t0, tOf(px)))
    const agent = row >= 0 && row < tracks.length ? tracks[row].agent : st.agent
    return { t: ix.timed ? t : Math.round(t), agent }
  }
  svg.addEventListener('pointerdown', e => {
    if ((e.target as Element).closest('.marker')) return
    dragging = true
    svg.setPointerCapture(e.pointerId)
    const p = at(e)
    store.set({ cursor: p.t, agent: p.agent, runSeq: null, marker: null, selected: null, playing: false })
  })
  svg.addEventListener('pointermove', e => {
    if (!dragging) return
    store.set({ cursor: at(e).t, runSeq: null, marker: null })
  })
  svg.addEventListener('pointerup', () => (dragging = false))
  el.append(svg)
}

function markerGlyph(m: ReplanMarker, cx: number, y: number, st: State, store: Store, agent: string): SVGGElement {
  const open = st.marker === m || (st.marker && st.marker.t === m.t && st.agent === agent && st.marker.run === m.run)
  const fail = m.kind === 'fail'
  const color = fail ? COLOR.failed : m.kept ? FAINT : INK
  const g = s('g', { class: 'marker', cursor: 'pointer' })
  g.append(
    tip(`${fail ? '×' : '◆'} ${m.t.toFixed(2)} s${m.count > 1 ? ` (×${m.count} until ${m.until.toFixed(2)} s)` : ''}\nwhy: ${m.why}\n${m.outcome}${m.changes ? `\nchanged: ${m.changes}` : ''}`)
  )
  if (fail) g.append(s('text', { x: cx, y: y + 1, 'text-anchor': 'middle', fill: color, 'font-size': 13, 'font-weight': 700, text: '×' }))
  else g.append(s('path', { d: `M${cx} ${y - 6} l5 5 l-5 5 l-5 -5 z`, fill: open ? BLUE : m.kept ? '#fff' : color, stroke: open ? BLUE : color, 'stroke-width': 1.2 }))
  g.append(s('rect', { x: cx - 7, y: y - 8, width: 14, height: 16, fill: 'transparent' }))
  g.addEventListener('pointerdown', e => {
    e.stopPropagation()
    store.set({ agent, cursor: m.until, runSeq: m.run ?? null, marker: m, selected: null, playing: false })
  })
  return g
}

/** Text cut to fit `px` (about 6 px a character at 10 px). */
function clipText(text: string, px: number): string {
  const n = Math.floor(px / 5.6)
  return text.length <= n ? text : n <= 1 ? '' : text.slice(0, n - 1) + '…'
}

/** Seconds as the header shows them. */
export function timeText(st: State): string {
  const ix = st.index
  if (!ix) return ''
  return ix.timed ? `t = ${st.cursor.toFixed(2)} s` : `run ${Math.round(st.cursor) + 1} of ${Math.max(1, ...ix.agents.map(a => a.runs.length))}`
}

