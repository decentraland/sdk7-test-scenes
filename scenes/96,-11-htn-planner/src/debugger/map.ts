// The debugger's map: a schematic top-down view of one area (the spawned level's pad, a reference zone) with every
// host on it, after upstream HTNDemo's NPC Simulation world map (HTNNPCSimulationPanel.cpp:362-640): a dot per NPC
// in its state's colour with a nose where it looks, a ring on the selected one, a line to where each running step
// goes, the selected one's whole route (its plan's positions, upstream's "selected path"), the props, the tester and
// the player. Hosts on one spot spread around it (upstream's same-cell ring) so each stays clickable; the hit test
// picks the topmost dot. Everything is laid out here in view pixels; ui/map-view.tsx only draws it. Pure.
import { atomVec3 } from '../htn-planner'
import type { Atom, Vec3 } from '../htn-planner'
import type { MapActor, MapPose, MapProp } from './registry'
import { STATUS_HEX } from './theme'

export interface Viewport {
  w: number
  h: number
}

/** Local metres to view pixels: one scale, the area centred; x right, +z up. */
export interface Projection {
  scale: number
  ox: number
  oy: number
  half: { x: number; z: number }
}

export interface MapHostInput {
  id: string
  label: string
  state: string
  /** Its running step, formatted, or ''. */
  current: string
  pose: MapPose
}

export interface MapInput {
  label: string
  half: { x: number; z: number }
  selected: string | null
  hosts: readonly MapHostInput[]
  props: readonly MapProp[]
  actors: readonly MapActor[]
}

export interface MapDot {
  id: string
  label: string
  current: string
  x: number
  y: number
  r: number
  /** #rrggbb */
  color: string
  selected: boolean
  /** Where it looks: a point just outside the dot. */
  nose: { x: number; y: number }
}

export interface MapMark {
  x: number
  y: number
  size: number
  color: string
  kind: 'target' | 'route'
}

export interface MapRect {
  id: string
  x: number
  y: number
  w: number
  h: number
  color: string
  solid: boolean
  round: boolean
  label?: string
}

export interface MapScene {
  proj: Projection
  /** The area's outline, in view pixels. */
  bounds: { x: number; y: number; w: number; h: number }
  /** Grid lines, thin rectangles, every `gridStep` m. */
  grid: { x: number; y: number; w: number; h: number }[]
  gridStep: number
  rects: MapRect[]
  marks: MapMark[]
  /** The selected host's route points, numbered from its running step. */
  waypoints: { x: number; y: number; i: number }[]
  actors: { id: string; label: string; kind: MapActor['kind']; x: number; y: number }[]
  /** In drawing order: the selected one last (on top). */
  dots: MapDot[]
}

/** Dots and the marks of every line together stay under this (the panel's entity budget). */
export const MAX_MARKS = 400
export const DOT_R = 8
const TARGET_SPACING = 9
const TARGET_MAX = 14
const ROUTE_SPACING = 7
const ROUTE_MAX = 60
const MAX_PROPS = 80
/** Upstream's selected path colour (0.20, 0.78, 0.95). */
export const ROUTE_HEX = '#33C7F2'

const STATE_HEX: Record<string, string> = {
  patrol: STATUS_HEX.chosen,
  idle: '#7BB88F',
  walk: STATUS_HEX.running,
  step: STATUS_HEX.abandoned,
  alert: '#FFD866',
  investigate: '#C78BFF',
  chase: STATUS_HEX.failed,
  'no plan': STATUS_HEX.failed
}
const PALETTE = ['#E3B341', '#79C0FF', '#D2A8FF', '#56D364', '#FFA657', '#FF7B72', '#A5D6FF', '#F2CC60']

/** The colour of a host state (an agent's mode, a station's walk / step / idle / no plan); others by hash, stable. */
export function stateHex(state: string): string {
  const known = STATE_HEX[state]
  if (known) return known
  let h = 0
  for (let i = 0; i < state.length; i++) h = (h * 31 + state.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

/** The area `half` (metres around 0) in `view`, `pad` px kept free at each side. */
export function fitProjection(half: { x: number; z: number }, view: Viewport, pad = 16): Projection {
  const hx = Math.max(half.x, 0.5)
  const hz = Math.max(half.z, 0.5)
  const scale = Math.max(0.1, Math.min((view.w - 2 * pad) / (2 * hx), (view.h - 2 * pad) / (2 * hz)))
  return { scale, ox: view.w / 2, oy: view.h / 2, half: { x: hx, z: hz } }
}

/** A local point (x, z) in view pixels. */
export function project(p: Projection, x: number, z: number): { x: number; y: number } {
  return { x: p.ox + x * p.scale, y: p.oy - z * p.scale }
}

/** Clamped to the area first: someone off the pad sits on its edge. */
function projectIn(p: Projection, v: Vec3): { x: number; y: number } {
  return project(p, Math.max(-p.half.x, Math.min(p.half.x, v.x)), Math.max(-p.half.z, Math.min(p.half.z, v.z)))
}

/** Points every `spacing` px from `a` (exclusive) to `b` (inclusive); at most `max`, spaced wider if needed. */
export function dotsAlong(a: { x: number; y: number }, b: { x: number; y: number }, spacing: number, max: number): { x: number; y: number }[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-6 || max <= 0) return []
  const n = Math.min(max, Math.max(1, Math.floor(len / spacing)))
  const out: { x: number; y: number }[] = []
  for (let i = 1; i <= n; i++) out.push({ x: a.x + (dx * i) / n, y: a.y + (dy * i) / n })
  return out
}

function nameOf(a: Atom): string | undefined {
  return a.t === 'sym' || a.t === 'str' ? String(a.v) : undefined
}

/**
 * Where each step goes: its first position argument (a vec3), else the first argument naming someone `resolve`
 * knows (a target id: 'you', 'tester'); undefined for a step that goes nowhere.
 */
export function planPoints(steps: readonly { name: string; args: readonly Atom[] }[], resolve: (id: string) => Vec3 | undefined): (Vec3 | undefined)[] {
  return steps.map(step => {
    for (const a of step.args) {
      const v = atomVec3(a)
      if (v) return v
    }
    for (const a of step.args) {
      const id = nameOf(a)
      const v = id === undefined ? undefined : resolve(id)
      if (v) return { x: v.x, y: v.y, z: v.z }
    }
    return undefined
  })
}

/** A grid step (m) that keeps lines at least `minPx` apart. */
function gridStep(scale: number, minPx = 40): number {
  for (const s of [1, 2, 5, 10, 20, 50]) if (s * scale >= minPx) return s
  return 100
}

export function buildMap(input: MapInput, view: Viewport): MapScene {
  const proj = fitProjection(input.half, view)
  const tl = project(proj, -proj.half.x, proj.half.z)
  const br = project(proj, proj.half.x, -proj.half.z)
  const bounds = { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y }

  const step = gridStep(proj.scale)
  const grid: MapScene['grid'] = []
  for (let x = Math.ceil(-proj.half.x / step) * step; x <= proj.half.x + 1e-9; x += step) grid.push({ x: project(proj, x, 0).x, y: bounds.y, w: 1, h: bounds.h })
  for (let z = Math.ceil(-proj.half.z / step) * step; z <= proj.half.z + 1e-9; z += step) grid.push({ x: bounds.x, y: project(proj, 0, z).y, w: bounds.w, h: 1 })

  const rects: MapRect[] = input.props.slice(0, MAX_PROPS).map(p => {
    const c = project(proj, p.x, p.z)
    const w = Math.max(2, p.w * proj.scale)
    const h = Math.max(2, p.d * proj.scale)
    return { id: p.id, x: c.x - w / 2, y: c.y - h / 2, w, h, color: p.color, solid: !!p.solid, round: !!p.round, label: p.label }
  })

  // Dots, spread where several share a spot (upstream's same-cell ring), then the selected one moved last.
  const placed = input.hosts.map(h => ({ h, at: projectIn(proj, h.pose.position) }))
  const groups = new Map<string, number[]>()
  placed.forEach((p, i) => {
    const key = `${Math.round(p.at.x / DOT_R)},${Math.round(p.at.y / DOT_R)}`
    const g = groups.get(key) ?? []
    g.push(i)
    groups.set(key, g)
  })
  for (const g of groups.values()) {
    if (g.length < 2) continue
    g.forEach((i, k) => {
      const angle = (2 * Math.PI * k) / g.length
      placed[i].at = { x: placed[i].at.x + Math.cos(angle) * DOT_R * 1.1, y: placed[i].at.y + Math.sin(angle) * DOT_R * 1.1 }
    })
  }
  const dots: MapDot[] = placed.map(({ h, at }) => {
    const selected = h.id === input.selected
    const r = selected ? DOT_R + 1 : DOT_R
    const yaw = h.pose.yaw
    return {
      id: h.id,
      label: h.label,
      current: h.current,
      x: at.x,
      y: at.y,
      r,
      color: stateHex(h.state),
      selected,
      nose: { x: at.x + Math.sin(yaw) * (r + 3), y: at.y - Math.cos(yaw) * (r + 3) }
    }
  })
  const sel = dots.findIndex(d => d.selected)
  if (sel >= 0) dots.push(...dots.splice(sel, 1))

  // Lines: where each running step goes; the selected one's whole route.
  const marks: MapMark[] = []
  const waypoints: MapScene['waypoints'] = []
  const room = () => MAX_MARKS - marks.length
  for (const { h } of placed) {
    const dot = dots.find(d => d.id === h.id)!
    if (dot.selected || !h.pose.target) continue
    for (const p of dotsAlong(dot, projectIn(proj, h.pose.target), TARGET_SPACING, Math.min(TARGET_MAX, room())))
      marks.push({ ...p, size: 3, color: dot.color, kind: 'target' })
  }
  const selected = sel >= 0 ? dots[dots.length - 1] : undefined
  const host = selected && input.hosts.find(h => h.id === selected.id)
  if (selected && host) {
    const route = host.pose.route?.length ? host.pose.route : host.pose.target ? [host.pose.target] : []
    let from: { x: number; y: number } = selected
    route.forEach((v, i) => {
      const to = projectIn(proj, v)
      for (const p of dotsAlong(from, to, ROUTE_SPACING, Math.min(ROUTE_MAX, room()))) marks.push({ ...p, size: 4, color: ROUTE_HEX, kind: 'route' })
      waypoints.push({ ...to, i: i + 1 })
      from = to
    })
  }

  const actors = input.actors.map(a => ({ id: a.id, label: a.label, kind: a.kind, ...projectIn(proj, a.position) }))
  return { proj, bounds, grid, gridStep: step, rects, marks, waypoints, actors, dots }
}

/** The host whose dot is at view point (x, y): the topmost within its radius plus `slack`, else null. */
export function hitTest(scene: MapScene, x: number, y: number, slack = 3): string | null {
  for (let i = scene.dots.length - 1; i >= 0; i--) {
    const d = scene.dots[i]
    const r = d.r + slack
    if ((x - d.x) * (x - d.x) + (y - d.y) * (y - d.y) <= r * r) return d.id
  }
  return null
}

const q = (v: number, step: number) => Math.round(v / step)

/** #rrggbb from 0..1 channels (a scene colour as the map draws it). */
export function rgbHex(c: { r: number; g: number; b: number }): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

/** What the map shows, coarsely (0.2 m, 15°): the map rebuilds only when this changes. */
export function mapKey(input: MapInput): string {
  const p = (v: Vec3 | undefined) => (v ? `${q(v.x, 0.2)},${q(v.z, 0.2)}` : '-')
  const hosts = input.hosts.map(h => `${h.id}:${h.state}:${h.current}:${p(h.pose.position)}:${q((h.pose.yaw * 180) / Math.PI, 15)}:${p(h.pose.target)}:${h.pose.route?.length ?? 0}`)
  const props = input.props.map(r => `${r.id}:${q(r.x, 0.2)},${q(r.z, 0.2)}:${r.color}`)
  const actors = input.actors.map(a => `${a.id}:${p(a.position)}`)
  return `${input.label}|${input.selected ?? ''}|${hosts.join(';')}|${props.join(';')}|${actors.join(';')}`
}
