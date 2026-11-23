import type { Point } from '../../src/arena'

export type GroundEdge = readonly [Point, Point]

function distanceToEdge([x, , z]: Point, [a, b]: GroundEdge) {
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  const lengthSquared = dx * dx + dz * dz
  const projection = lengthSquared === 0 ? 0 : ((x - a[0]) * dx + (z - a[2]) * dz) / lengthSquared
  const t = Math.max(0, Math.min(1, projection))
  return Math.hypot(x - a[0] - t * dx, z - a[2] - t * dz)
}

function side(a: Point, b: Point, p: Point) {
  return (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0])
}

function distanceBetweenEdges(a: GroundEdge, b: GroundEdge) {
  if (side(a[0], a[1], b[0]) * side(a[0], a[1], b[1]) < 0 &&
      side(b[0], b[1], a[0]) * side(b[0], b[1], a[1]) < 0) return 0
  return Math.min(distanceToEdge(a[0], b), distanceToEdge(a[1], b),
    distanceToEdge(b[0], a), distanceToEdge(b[1], a))
}

export function groundClearance(points: readonly Point[], bounds: readonly GroundEdge[]) {
  if (points.length < 2) return 0
  let minimum = Infinity
  for (let i = 1; i < points.length; i++) {
    for (const edge of bounds) minimum = Math.min(minimum, distanceBetweenEdges([points[i - 1], points[i]], edge))
  }
  return minimum
}

export function rectangleEdges(x0: number, x1: number, z0: number, z1: number): GroundEdge[] {
  const a = [x0, 0, z0] as const
  const b = [x1, 0, z0] as const
  const c = [x1, 0, z1] as const
  const d = [x0, 0, z1] as const
  return [[a, b], [b, c], [c, d], [d, a]]
}

export function pointDistance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function groundFollower(start: Point) {
  let position = start
  let waypoints: readonly Point[] = []
  let next = 0
  return {
    position: () => position,
    finished: () => next === waypoints.length,
    assign(points: readonly Point[]) {
      waypoints = points
      next = 0
    },
    step(distance: number, allow: (from: Point, to: Point) => boolean) {
      while (next < waypoints.length && distance > 1e-7) {
        const target = waypoints[next]
        const remaining = pointDistance(position, target)
        if (remaining < 1e-7) {
          next++
          continue
        }
        const t = Math.min(1, distance / remaining)
        const candidate: Point = [
          position[0] + (target[0] - position[0]) * t,
          position[1] + (target[1] - position[1]) * t,
          position[2] + (target[2] - position[2]) * t
        ]
        if (!allow(position, candidate)) return false
        position = candidate
        distance -= remaining * t
        if (t === 1) next++
      }
      return true
    }
  }
}
