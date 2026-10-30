// The in-world sense gizmos (the overlay's, at full detail and for the selected NPC): what an NPC with perception
// senses, drawn on the ground around it. Its sight cone (the range its targets' light allows now, the cone's angle,
// where its head looks), its presence (smell) radius, extra arcs a level adds (a lure ring), and the last noise it
// heard with that noise's radius, for a few seconds. The colour says what it senses: calm, suspicious (a target in
// sight, not yet detected), seen, smelled (detected by presence alone).
// Pure: the view model, the cone's geometry and the change keys; overlay-scene.ts makes the entities.
import type { GuardAgent, Vec3 } from '../htn-planner'

export type SenseState = 'calm' | 'suspicious' | 'seen' | 'smelled'

export const SENSE_HEX: Record<SenseState, string> = {
  calm: '#9fd3ff',
  suspicious: '#ffb14a',
  seen: '#ff6b5e',
  smelled: '#c78bff'
}
export const NOISE_HEX = '#ffe066'
/** Segments of a cone's arc (and of each extra arc). */
export const ARC_SEGMENTS = 6
/** Seconds a heard noise stays drawn. */
export const NOISE_SECONDS = 3

export interface SenseArc {
  radius: number
  /** #rrggbb */
  hex: string
}

/** What the gizmo shows, in the host's map-area coordinates. */
export interface SenseView {
  /** Its feet. */
  position: Vec3
  /** Where it looks, radians (0 = +z). */
  yaw: number
  /** m: the sight range now, the farthest any target's light lets it see (its plain range with no target). */
  range: number
  fovDeg: number
  /** m, 0: none. */
  presence: number
  state: SenseState
  arcs: readonly SenseArc[]
  /** The last noise it heard (the emitted radius, a wall's muffling included), while it is recent. */
  noise: { position: Vec3; radius: number } | null
}

/** The gizmo's view of an agent now; `arcs` from the level (LevelSim.senseArcs). */
export function senseView(agent: GuardAgent, arcs: readonly SenseArc[] = []): SenseView {
  const cfg = agent.perception.cfg
  const on = agent.sensing
  const senses = agent.perception.senses()
  let range = senses.length === 0 ? cfg.range : 0
  let state: SenseState = 'calm'
  const rank: Record<SenseState, number> = { calm: 0, suspicious: 1, smelled: 2, seen: 3 }
  for (const s of senses) {
    range = Math.max(range, s.range)
    const now: SenseState = s.detected ? (s.by === 'presence' ? 'smelled' : 'seen') : s.by !== null || s.suspicion > 0 ? 'suspicious' : 'calm'
    if (rank[now] > rank[state]) state = now
  }
  if (!on.sight) {
    // A domain that reads no sight fact does not see (GuardAgent): nothing to draw but what it hears.
    range = 0
    state = 'calm'
  }
  const heard = agent.lastHeard
  const noise =
    on.hearing && heard && agent.time - heard.at <= NOISE_SECONDS
      ? { position: heard.noise.position, radius: heard.noise.loudness * (heard.noise.muffled ? agent.hearing.cfg.wallMuffle : 1) }
      : null
  return {
    position: agent.kinematic.position,
    yaw: agent.gazeYaw,
    range,
    fovDeg: cfg.fovDeg,
    presence: on.sight ? cfg.presenceRadius : 0,
    state,
    arcs: on.sight ? arcs : [],
    noise
  }
}

/** True when the agent has something to draw: sight with a range, or a presence radius. */
export const hasSenses = (v: SenseView) => v.range > 0 || v.presence > 0

const at = (yaw: number, r: number): Vec3 => ({ x: Math.sin(yaw) * r, y: 0, z: Math.cos(yaw) * r })

/** An arc of `radius` across the cone (`fovDeg`, centred on +z), in `segments` straight pieces; full circle at 360. */
export function arcSegments(radius: number, fovDeg: number, segments = ARC_SEGMENTS): [Vec3, Vec3][] {
  if (!(radius > 0) || !(fovDeg > 0) || segments < 1) return []
  const half = (Math.min(360, fovDeg) * Math.PI) / 360
  const out: [Vec3, Vec3][] = []
  for (let i = 0; i < segments; i++) out.push([at(-half + (2 * half * i) / segments, radius), at(-half + (2 * half * (i + 1)) / segments, radius)])
  return out
}

/** The cone in its own frame (feet at 0, looking along +z): its two edges out to `length`, then the arc at `range`. */
export function coneSegments(range: number, fovDeg: number, length = range, segments = ARC_SEGMENTS): [Vec3, Vec3][] {
  if (!(range > 0) || !(fovDeg > 0)) return []
  const half = (Math.min(360, fovDeg) * Math.PI) / 360
  const edges: [Vec3, Vec3][] = fovDeg >= 360 ? [] : [[at(-half, 0), at(-half, length)], [at(half, 0), at(half, length)]]
  return [...edges, ...arcSegments(range, fovDeg, segments)]
}

/** Every segment the gizmo draws in its own frame, with its colour: the cone (edges out to the farthest arc), the
 *  extra arcs. */
export function gizmoSegments(v: SenseView): { a: Vec3; b: Vec3; hex: string }[] {
  const far = Math.max(v.range, ...v.arcs.map(a => a.radius))
  const main = coneSegments(v.range, v.fovDeg, far).map(([a, b]) => ({ a, b, hex: SENSE_HEX[v.state] }))
  const extra = v.arcs.flatMap(arc => arcSegments(arc.radius, v.fovDeg).map(([a, b]) => ({ a, b, hex: arc.hex })))
  return [...main, ...extra]
}

const q = (x: number, step: number) => Math.round(x / step)

/** What the gizmo's shape depends on (0.1 m, 1 degree): its pieces are rebuilt only when this changes. */
export function shapeKey(v: SenseView): string {
  return `${q(v.range, 0.1)}|${q(v.fovDeg, 1)}|${q(v.presence, 0.1)}|${v.arcs.map(a => `${q(a.radius, 0.1)}${a.hex}`).join(',')}`
}

/** Where it stands and looks (0.1 m, 2 degrees): the gizmo is moved only when this changes. */
export function poseKey(v: SenseView): string {
  return `${q(v.position.x, 0.1)},${q(v.position.z, 0.1)},${q(v.yaw, (2 * Math.PI) / 180)}`
}

/** The noise ring's key: redrawn when it appears, moves or goes. */
export function noiseKey(v: SenseView): string {
  return v.noise ? `${q(v.noise.position.x, 0.1)},${q(v.noise.position.z, 0.1)},${q(v.noise.radius, 0.1)}` : '-'
}
