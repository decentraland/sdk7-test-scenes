import { GATE, GATE_SIZE, OPPOSING_GROUPS, SLABS, type Point, type Scenario, type Slab } from './arena'
import type { Route } from './navigation'

type Interval = readonly [number, number]
const FULL_SEGMENT: Interval = [0, 1]
const EPSILON = 1e-6
// Both bakers smooth the floor/ramp joins within the lab's vertical snap tolerance.
const SUPPORT_TOLERANCE = 0.35
const { radius, height } = OPPOSING_GROUPS
// A foot at the edge of the capsule can be one radius farther along the steepest ramp.
const SLOPE_ALLOWANCE = radius * Math.max(...SLABS.map((slab) =>
  Math.abs(slab.farY - slab.nearY) / (slab.maxZ - slab.minZ)
))
const FOOTPRINT_PROBES = [
  [radius, 0], [-radius, 0], [0, radius], [0, -radius]
] as const

function clip(interval: Interval | undefined, a: number, b: number, low: number, high: number): Interval | undefined {
  if (!interval) return undefined
  low -= EPSILON
  high += EPSILON
  if (a === b) return a >= low && a <= high ? interval : undefined
  const first = (low - a) / (b - a)
  const second = (high - a) / (b - a)
  const start = Math.max(interval[0], Math.min(first, second))
  const end = Math.min(interval[1], Math.max(first, second))
  return start <= end ? [start, end] : undefined
}

function intervalOnSlab(slab: Slab, a: Point, b: Point, dx: number, dz: number, tolerance: number) {
  const slope = (slab.farY - slab.nearY) / (slab.maxZ - slab.minZ)
  const offsetA = a[1] - slab.nearY - slope * (a[2] + dz - slab.minZ)
  const offsetB = b[1] - slab.nearY - slope * (b[2] + dz - slab.minZ)
  const x = clip(FULL_SEGMENT, a[0] + dx, b[0] + dx, slab.minX, slab.maxX)
  const xz = clip(x, a[2] + dz, b[2] + dz, slab.minZ, slab.maxZ)
  return clip(xz, offsetA, offsetB, -tolerance, tolerance)
}

function supportedThroughout(slabs: readonly Slab[], a: Point, b: Point, dx: number, dz: number, tolerance: number) {
  const intervals = slabs.map((slab) => intervalOnSlab(slab, a, b, dx, dz, tolerance))
    .filter((interval) => interval !== undefined)
    .sort(([left], [right]) => left - right)
  let supportedUntil = 0
  for (const [start, end] of intervals) {
    if (start > supportedUntil + EPSILON) return false
    supportedUntil = Math.max(supportedUntil, end)
  }
  return supportedUntil >= 1 - EPSILON
}

function intersectsGate(a: Point, b: Point) {
  const gateX = GATE_SIZE[0] / 2 + radius
  const gateY = GATE_SIZE[1] / 2
  const gateZ = GATE_SIZE[2] / 2 + radius
  const x = clip(FULL_SEGMENT, a[0], b[0], GATE.x - gateX, GATE.x + gateX)
  const xz = clip(x, a[2], b[2], GATE.z - gateZ, GATE.z + gateZ)
  // The swept vertical capsule is bounded conservatively by its enclosing prism.
  return clip(xz, a[1], b[1], GATE.y - gateY - height, GATE.y + gateY) !== undefined
}

function crossesRamp(path: readonly Point[], side: 'east' | 'west') {
  return path.slice(1).some(([x, y, z], i) => {
    const [ax, ay, az] = path[i]
    if (ay === y) return false
    const t = (1.5 - ay) / (y - ay)
    const heightX = ax + t * (x - ax)
    const heightZ = az + t * (z - az)
    return t >= 0 && t <= 1 && heightZ >= 3 && heightZ <= 9 && (side === 'east' ? heightX >= 11 : heightX <= 5)
  })
}

function near(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= 0.6
}

export function evaluateArenaRoute(scenario: Scenario, route: Route): string {
  if (route.points.some((p) => p.length !== 3 || !p.every(Number.isFinite))) return 'malformed route points'
  if (route.status !== scenario.expected) return 'unexpected status'
  if (route.status === 'unreachable') return route.points.length === 0 ? 'pass' : 'returned partial route'
  const path = route.points
  if (!path.length || !near(path[0], scenario.start) || !near(path[path.length - 1], scenario.goal)) return 'wrong endpoint'
  if (scenario.via && !crossesRamp(path, scenario.via)) return 'wrong ramp'
  if (scenario.id === 'gate-closes-mid-route' && crossesRamp(path, 'east')) return 'used closed ramp'
  if (scenario.id === 'underpass' && path.some((point) => Math.abs(point[1]) >= 0.35)) return 'wrong floor'
  const slabs = SLABS.filter((slab) => scenario.doorOpen || !slab.behindGate)
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    if (!supportedThroughout(slabs, a, b, 0, 0, SUPPORT_TOLERANCE)) return 'route segment leaves walkable support'
    if (!scenario.doorOpen && intersectsGate(a, b)) return 'route capsule intersects closed gate'
    if (!FOOTPRINT_PROBES.every(([dx, dz]) => supportedThroughout(slabs, a, b, dx, dz, SUPPORT_TOLERANCE + SLOPE_ALLOWANCE))) {
      return 'route footprint lacks edge clearance'
    }
  }
  return 'pass'
}
