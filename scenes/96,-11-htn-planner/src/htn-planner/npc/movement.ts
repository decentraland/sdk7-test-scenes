// Kinematic NPC movement: turn toward a point at a limited turn rate, walk toward it at a speed,
// stop inside an arrival radius, stay on the ground. No physics, no pathfinding: callers give
// points that are reachable in a straight line (patrol routes are authored that way).
import { angleDiff, distanceXZ, Vec3, yawTo } from './vec'

/** Pose the movement code mutates in place. */
export interface Kinematic {
  position: Vec3 // feet, world space
  yaw: number // radians, 0 = +Z
}

export interface MoveParams {
  speed: number // m/s
  turnRate: number // rad/s
  arrivalRadius: number // m, horizontal
}

export interface Terrain {
  /** Ground height at (x, z). */
  groundY(x: number, z: number): number
  /** Optional walkable rectangle; positions are clamped into it. */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number }
  /** Optional: push the feet out of obstacles after a step (e.g. tree trunks on a navigation map). */
  collide?(position: Vec3): void
}

export const FLAT_GROUND: Terrain = { groundY: () => 0 }

/** Rotate toward `targetYaw` by at most `turnRate * dt`. Returns true once facing it. */
export function turnToward(k: Kinematic, targetYaw: number, dt: number, turnRate: number): boolean {
  const diff = angleDiff(k.yaw, targetYaw)
  const max = turnRate * dt
  if (Math.abs(diff) <= max) {
    k.yaw = normalizeYaw(targetYaw)
    return true
  }
  k.yaw = normalizeYaw(k.yaw + Math.sign(diff) * max)
  return false
}

/**
 * One movement tick toward `target`. Turns at the turn rate and translates straight at the target,
 * scaled by how much the NPC already faces it (pivots in place when the target is behind), never overshoots, then snaps to the ground.
 * Returns true when within `arrivalRadius` (horizontal) of the target.
 */
export function stepToward(k: Kinematic, target: Vec3, dt: number, p: MoveParams, terrain: Terrain = FLAT_GROUND): boolean {
  const dist = distanceXZ(k.position, target)
  if (dist <= p.arrivalRadius) {
    settle(k, terrain)
    return true
  }
  const desired = yawTo(k.position, target)
  turnToward(k, desired, dt, p.turnRate)
  // Translate straight at the target (guaranteed convergence, no orbiting), slowed while still turning.
  const facing = Math.cos(angleDiff(k.yaw, desired))
  if (facing > 0) {
    const step = Math.min(p.speed * dt * facing, dist)
    k.position.x += ((target.x - k.position.x) / dist) * step
    k.position.z += ((target.z - k.position.z) / dist) * step
  }
  settle(k, terrain)
  return distanceXZ(k.position, target) <= p.arrivalRadius
}

/** Clamp into bounds, out of obstacles, and put the feet on the ground. */
export function settle(k: Kinematic, terrain: Terrain): void {
  terrain.collide?.(k.position)
  const b = terrain.bounds
  if (b) {
    k.position.x = Math.min(b.maxX, Math.max(b.minX, k.position.x))
    k.position.z = Math.min(b.maxZ, Math.max(b.minZ, k.position.z))
  }
  k.position.y = terrain.groundY(k.position.x, k.position.z)
}

export function normalizeYaw(yaw: number): number {
  return angleDiff(0, yaw)
}
