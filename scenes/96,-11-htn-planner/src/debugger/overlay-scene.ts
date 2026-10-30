// The in-world overlay in the scene (labels and lines from overlay.ts): above each host on a map area, a billboard
// label parented to its body (it moves with the NPC for free), a line on the ground from it to where its running step
// points with a disc there, and for the host selected in the debugger at full detail its route through the plan's
// positions in the map's cyan.
// Cost: nothing while every level is off (no entities). On, a check every PERIOD of wall time, skipped when neither
// the simulation (a paused clock), the debugger state nor the hosts moved; a label is rewritten only when its key
// changes, a line in 0.2 m steps. Entities: 3 per host shown (label, line, disc) plus ROUTE_MAX for the selected
// route: at most 3 * MAX_HOSTS + ROUTE_MAX.
// Sense gizmos (senses.ts): at full detail for every host that perceives, and for the host selected in the debugger
// at step too, its sight cone (edges and arc), the extra arcs its level adds, its presence radius as a faint disc and
// the last noise it heard as a ring-coloured disc. A pivot entity carries them (moved when the host moves 0.1 m or
// turns 2 degrees); the pieces are rebuilt only when the shape or the colour changes. Entities: 1 + 2 + ARC_SEGMENTS
// for the cone, ARC_SEGMENTS per extra arc, 1 for the presence and 1 for the noise: 10 for a guard, 17 on level 12.
import { Billboard, BillboardMode, engine, Entity, Material, MaterialTransparencyMode, MeshRenderer, TextAlignMode, TextShape, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion } from '@dcl/sdk/math'
import { sceneClock } from '../htn-planner'
import type { Vec3 } from '../htn-planner'
import { paint } from '../demo/world'
import { ROUTE_HEX, stateHex } from './map'
import { goalKey, goalOf, Goal, levelFor, lineKey, overlayKey, overlayText, segment } from './overlay'
import { debugRegistry, DebugHost, MapArea } from './registry'
import { ARC_SEGMENTS, gizmoSegments, hasSenses, NOISE_HEX, noiseKey, poseKey, SENSE_HEX, SenseView, shapeKey } from './senses'
import { state, uiVersion } from './ui/state'

const PERIOD = 0.1 // s of wall time between checks
export const MAX_HOSTS = 32
/** A sense gizmo's entities without extra arcs: pivot, two edges, the arc, presence, noise. */
export const GIZMO_BASE = 1 + 2 + ARC_SEGMENTS + 2
export const ROUTE_MAX = 8
const DEFAULT_HEIGHT = 2.6 // m above the feet
const FONT = 1.5
const LINE_Y = 0.12 // m above the feet: over the pad's floor
const LINE_W = 0.06
const DISC = { d: 0.55, h: 0.04 }

interface Rec {
  body: Entity
  label: Entity | null
  labelKey: string
  goalKey: string
  goal: Goal | null
  line: Entity | null
  disc: Entity | null
  lineKey: string
  /** The line's paint. */
  color: string
  gizmo: Gizmo | null
}

interface Gizmo {
  pivot: Entity
  /** Cone, arcs and the presence disc: children of the pivot. */
  pieces: Entity[]
  noise: Entity | null
  shape: string
  pose: string
  noiseKey: string
}

const recs = new Map<string, Rec>()
let route: Entity[] = []
let routeKey = ''
/** Entities the overlay holds now (the budget in docs/htn-guidance.md, Debugging); `gizmos`: hosts with a sense gizmo. */
export const overlayStats = { entities: 0, hosts: 0, rewrites: 0, gizmos: 0 }

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

function drop(e: Entity | null): null {
  if (e !== null) engine.removeEntity(e)
  return null
}

function dropRec(id: string) {
  const r = recs.get(id)
  if (!r) return
  drop(r.label)
  drop(r.line)
  drop(r.disc)
  r.gizmo = dropGizmo(r.gizmo)
  recs.delete(id)
}

function dropGizmo(g: Gizmo | null): null {
  if (g === null) return null
  for (const e of g.pieces) engine.removeEntity(e)
  drop(g.noise)
  engine.removeEntity(g.pivot)
  return null
}

const GIZMO_W = 0.05
const PRESENCE_ALPHA = { calm: 0.12, hot: 0.3 }
const NOISE_ALPHA = 0.1

/** A faint see-through colour (the presence and noise discs). */
function glass(e: Entity, hex: string, alpha: number) {
  const c = rgb(hex)
  Material.setPbrMaterial(e, {
    albedoColor: Color4.create(c.r, c.g, c.b, alpha),
    emissiveColor: Color3.create(c.r, c.g, c.b),
    emissiveIntensity: 0.4,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
    roughness: 1,
    metallic: 0
  })
}

function flatDisc(parent: Entity | undefined, position: Vec3, radius: number, hex: string, alpha: number): Entity {
  const e = engine.addEntity()
  Transform.create(e, { parent, position, scale: { x: radius * 2, y: 0.01, z: radius * 2 } })
  MeshRenderer.setCylinder(e)
  glass(e, hex, alpha)
  return e
}

/** The area's turn against the scene (radians): a playground's frame is a multiple of 90 degrees. */
function areaYaw(area: MapArea): number {
  if (!area.toScene) return 0
  const o = area.toScene({ x: 0, y: 0, z: 0 })
  const z = area.toScene({ x: 0, y: 0, z: 1 })
  return Math.atan2(z.x - o.x, z.z - o.z)
}

/** The host's sense gizmo: built, moved, rebuilt or dropped as its view says. */
function syncGizmo(r: Rec, h: DebugHost, area: MapArea, show: boolean) {
  const v: SenseView | undefined = show ? h.senses?.() : undefined
  if (!v || (!hasSenses(v) && !v.noise)) {
    if (r.gizmo) overlayStats.rewrites++
    r.gizmo = dropGizmo(r.gizmo)
    return
  }
  const toScene = (p: Vec3) => (area.toScene ? area.toScene(p) : p)
  let g = r.gizmo
  if (g === null) {
    const pivot = engine.addEntity()
    Transform.create(pivot, {})
    g = r.gizmo = { pivot, pieces: [], noise: null, shape: '', pose: '', noiseKey: '' }
  }
  const pose = poseKey(v)
  if (pose !== g.pose) {
    g.pose = pose
    const t = Transform.getMutable(g.pivot)
    t.position = lift(toScene(v.position))
    t.rotation = Quaternion.fromEulerDegrees(0, ((v.yaw + areaYaw(area)) * 180) / Math.PI, 0)
  }
  const shape = `${shapeKey(v)}|${v.state}`
  if (shape !== g.shape) {
    g.shape = shape
    overlayStats.rewrites++
    for (const e of g.pieces) engine.removeEntity(e)
    g.pieces = gizmoSegments(v).map(s => {
      const e = box(s.hex, 1)
      Transform.getMutable(e).parent = g!.pivot
      placeSegment(e, s.a, s.b, GIZMO_W)
      return e
    })
    if (v.presence > 0) {
      const hot = v.state === 'smelled'
      g.pieces.push(flatDisc(g.pivot, { x: 0, y: -0.02, z: 0 }, v.presence, SENSE_HEX.smelled, hot ? PRESENCE_ALPHA.hot : PRESENCE_ALPHA.calm))
    }
  }
  const nk = noiseKey(v)
  if (nk !== g.noiseKey) {
    g.noiseKey = nk
    g.noise = drop(g.noise)
    if (v.noise) g.noise = flatDisc(undefined, lift(toScene(v.noise.position)), v.noise.radius, NOISE_HEX, NOISE_ALPHA)
  }
}

/** A label riding on the body: parented to it, scaled back to metres (bodies are scaled cylinders, uniform in x and z,
 *  so a Y billboard under them stays undistorted). */
function makeLabel(body: Entity, height: number): Entity {
  const t = Transform.getOrNull(body)
  const s = t?.scale ?? { x: 1, y: 1, z: 1 }
  const y0 = t?.position.y ?? 0
  const e = engine.addEntity()
  Transform.create(e, {
    parent: body,
    position: { x: 0, y: (height - y0) / (s.y || 1), z: 0 },
    scale: { x: 1 / (s.x || 1), y: 1 / (s.y || 1), z: 1 / (s.z || 1) }
  })
  TextShape.create(e, { text: '', fontSize: FONT, textAlign: TextAlignMode.TAM_BOTTOM_CENTER, outlineWidth: 0.15, outlineColor: Color3.Black() })
  Billboard.create(e, { billboardMode: BillboardMode.BM_Y })
  return e
}

function placeSegment(e: Entity, a: Vec3, b: Vec3, width: number) {
  const s = segment(a, b)
  const t = Transform.getMutable(e)
  if (!s) {
    t.scale = { x: 0, y: 0, z: 0 }
    return
  }
  t.position = s.position
  t.rotation = Quaternion.fromEulerDegrees(s.pitch, s.yaw, 0)
  t.scale = { x: width, y: width, z: s.length }
}

function box(color: string, glow = 0.8): Entity {
  const e = engine.addEntity()
  Transform.create(e, {})
  MeshRenderer.setBox(e)
  paint(e, rgb(color), glow)
  return e
}

const lift = (p: Vec3): Vec3 => ({ x: p.x, y: p.y + LINE_Y, z: p.z })

/** The ground line from the host to its running step's target, and a disc there. */
function syncLine(r: Rec, h: DebugHost, area: MapArea, color: string) {
  const pose = h.pose?.()
  const at = h.position?.()
  const target = pose?.target && at ? lift(area.toScene ? area.toScene(pose.target) : pose.target) : undefined
  const from = at ? lift(at) : undefined
  const key = from ? `${lineKey(from, target)}|${color}` : '-'
  if (key === r.lineKey) return
  r.lineKey = key
  overlayStats.rewrites++
  if (!from || !target) {
    r.line = drop(r.line)
    r.disc = drop(r.disc)
    return
  }
  if (r.line === null || r.disc === null) {
    r.line = r.line ?? box(color)
    if (r.disc === null) {
      r.disc = engine.addEntity()
      Transform.create(r.disc, {})
      MeshRenderer.setCylinder(r.disc)
    }
    r.color = ''
  }
  if (color !== r.color) {
    r.color = color
    paint(r.line, rgb(color), 0.8)
    paint(r.disc, rgb(color), 1)
  }
  placeSegment(r.line, from, target, LINE_W)
  const d = Transform.getMutable(r.disc)
  d.position = target
  d.scale = { x: DISC.d, y: DISC.h, z: DISC.d }
}

/** The selected host's route through its plan's positions (full detail only). */
function syncRoute(h: DebugHost | undefined, area: MapArea | undefined) {
  const points = h && area ? (h.pose?.()?.route ?? []).slice(0, ROUTE_MAX + 1).map(p => lift(area.toScene ? area.toScene(p) : p)) : []
  const key = points.map(p => lineKey(p, p)).join(';')
  if (key === routeKey) return
  routeKey = key
  for (const e of route) engine.removeEntity(e)
  route = []
  for (let i = 0; i + 1 < points.length; i++) {
    const e = box(ROUTE_HEX, 1)
    placeSegment(e, points[i], points[i + 1], LINE_W * 0.8)
    route.push(e)
  }
}

function refresh() {
  const seen = new Set<string>()
  let selected: { h: DebugHost; area: MapArea } | undefined
  let shown = 0
  for (const { area, hosts } of debugRegistry.areas()) {
    for (const h of hosts) {
      if (h.entity === undefined) continue
      const level = shown < MAX_HOSTS ? levelFor(state.overlay, state.overlayHosts, h.id) : 'off'
      if (level === 'off') continue
      shown++
      seen.add(h.id)
      let r = recs.get(h.id)
      if (r && r.body !== h.entity) {
        dropRec(h.id) // a rebuilt level gives the host a new body
        r = undefined
      }
      if (!r) {
        r = { body: h.entity as Entity, label: null, labelKey: '', goalKey: '', goal: null, line: null, disc: null, lineKey: '', color: '', gizmo: null }
        recs.set(h.id, r)
      }
      const s = h.status()
      if (level === 'full') {
        const gk = goalKey(h.recorder)
        if (gk !== r.goalKey) {
          r.goalKey = gk
          r.goal = goalOf(h.recorder)
        }
      }
      const input = {
        label: h.label,
        state: s.state,
        lastStatus: s.lastStatus,
        current: s.current,
        reason: s.reason,
        trigger: s.replan?.trigger,
        changes: s.replan?.changes,
        goal: r.goal
      }
      const key = overlayKey(input, level)
      if (key !== r.labelKey) {
        r.labelKey = key
        if (r.label === null) r.label = makeLabel(r.body, h.overlayHeight ?? DEFAULT_HEIGHT)
        TextShape.getMutable(r.label).text = overlayText(input, level)
        overlayStats.rewrites++
      }
      syncLine(r, h, area, stateHex(s.state))
      syncGizmo(r, h, area, level === 'full' || h.id === state.host)
      if (level === 'full' && h.id === state.host) selected = { h, area }
    }
  }
  for (const id of [...recs.keys()]) if (!seen.has(id)) dropRec(id)
  syncRoute(selected?.h, selected?.area)
  let entities = route.length
  for (const r of recs.values()) {
    entities += (r.label ? 1 : 0) + (r.line ? 1 : 0) + (r.disc ? 1 : 0)
    if (r.gizmo) entities += 1 + r.gizmo.pieces.length + (r.gizmo.noise ? 1 : 0)
  }
  overlayStats.entities = entities
  overlayStats.hosts = recs.size
  overlayStats.gizmos = [...recs.values()].filter(r => r.gizmo !== null).length
}

/** One check (headless tests call it directly). */
export function overlayTick(dt: number): void {
  tick(dt)
}

let since = PERIOD
let last = { frames: -1, ui: -1, hosts: -1, empty: true }

function tick(dt: number) {
  since += dt
  if (since < PERIOD) return
  since = 0
  const off = state.overlay === 'off' && state.overlayHosts.size === 0
  if (off && last.empty) return
  const clock = sceneClock()
  // Paused and nothing else moved: the labels already say what they would.
  if (clock.frames === last.frames && uiVersion() === last.ui && debugRegistry.version === last.hosts) return
  refresh()
  last = { frames: clock.frames, ui: uiVersion(), hosts: debugRegistry.version, empty: recs.size === 0 && route.length === 0 }
}

/** The overlay's system (key 1 changes the levels: pick.ts). */
export function setupOverlay(): void {
  engine.addSystem(tick, undefined, 'htn-overlay')
}
