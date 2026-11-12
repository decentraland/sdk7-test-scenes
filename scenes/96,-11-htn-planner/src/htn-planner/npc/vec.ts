// Minimal 3D vector helpers for the NPC modules. Plain data, structurally compatible with
// @dcl/sdk/math Vector3, so pure modules stay free of SDK imports and run in Node tests.

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const copy = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z })

export function distance(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** Horizontal (ground plane) distance; NPCs and the player move on the XZ plane. */
export function distanceXZ(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  return Math.sqrt(dx * dx + dz * dz)
}

/** Yaw (radians) that faces from `from` to `to`. Yaw 0 looks along +Z, PI/2 along +X (DCL forward is +Z). */
export function yawTo(from: Vec3, to: Vec3): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
}

/** Signed shortest difference `to - from`, wrapped to (-PI, PI]. */
export function angleDiff(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d <= -Math.PI) d += 2 * Math.PI
  return d
}

export const DEG = Math.PI / 180
