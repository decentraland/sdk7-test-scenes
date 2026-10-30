// Where a spawned playground stands: an origin and a yaw (a multiple of 90°), in front of the player, moved inside
// the scene when it would stick out. Playgrounds work in local coordinates: x right, z away from the visitor.
// Pure, so tests can place them too.
import type { Vec3 } from '../htn-planner'

/** The scene, 6 x 8 parcels, in scene metres. */
export const SCENE = { x: 96, z: 128 }
const MARGIN = 1 // m kept free at the scene edge
const GAP = 6 // m from the player to the playground's front edge

/** Half extents in local metres; the visitor's side is -z. */
export interface Footprint {
  x: number
  z: number
}

export interface Frame {
  origin: Vec3
  /** Radians, a multiple of 90°: local +z points along (sin yaw, cos yaw). */
  yaw: number
}

const QUARTER = Math.PI / 2

/** The playground in front of a player at `at` looking along `facing` (radians), its front edge GAP m away. */
export function placeInFront(at: Vec3, facing: number, half: Footprint, scene = SCENE): Frame {
  const yaw = Math.round(facing / QUARTER) * QUARTER
  const sideways = Math.abs(Math.sin(yaw)) > 0.5
  const hx = sideways ? half.z : half.x
  const hz = sideways ? half.x : half.z
  const ahead = half.z + GAP
  const fit = (v: number, h: number, size: number) => (2 * (h + MARGIN) >= size ? size / 2 : Math.max(h + MARGIN, Math.min(size - h - MARGIN, v)))
  return {
    origin: { x: fit(at.x + Math.sin(yaw) * ahead, hx, scene.x), y: 0, z: fit(at.z + Math.cos(yaw) * ahead, hz, scene.z) },
    yaw
  }
}

/** A scene point in the playground's local coordinates. */
export function toLocal(f: Frame, p: Vec3): Vec3 {
  const dx = p.x - f.origin.x
  const dz = p.z - f.origin.z
  const c = Math.cos(f.yaw)
  const s = Math.sin(f.yaw)
  return { x: dx * c - dz * s, y: p.y - f.origin.y, z: dx * s + dz * c }
}

/** A local point in scene coordinates. */
export function toScene(f: Frame, p: Vec3): Vec3 {
  const c = Math.cos(f.yaw)
  const s = Math.sin(f.yaw)
  return { x: f.origin.x + p.x * c + p.z * s, y: f.origin.y + p.y, z: f.origin.z - p.x * s + p.z * c }
}
