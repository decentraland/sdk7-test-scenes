import type { Point, Surface } from '../arena'
import type { Navigator, Route } from '../navigation'

export const GLASS_WALL_MODEL = 'models/recipe-authoring/glass-wall.glb'
export const GLASS_WALL_CENTER: Point = [4, 0, 3]
export const GLASS_WALL_HALF_DEPTH = 1.4
export const GLASS_WALL_HALF_THICKNESS = 0.15
export const GLASS_WALL_HEIGHT = 2.4
export const GLASS_WALL_MESH = 'glass'
export const GLASS_WALL_COLLIDER = 'barrier_collider'
export const GLASS_PANEL_OFFSET: Point = [0.45, 0, 1.8]
export const GLASS_PANEL_HALF_DEPTH = 0.3
export const MASK_AGENT_RADIUS = 0.22
export const MASK_ROUTE_START: Point = [2, 0, 3]
export const MASK_ROUTE_GOAL: Point = [6, 0, 3]

export function rectangularFloor(x0: number, x1: number, z0: number, z1: number, y = 0): Surface {
  return { vertices: [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], triangles: [0, 1, 2, 0, 2, 3] }
}

export function glassWallSurface(halfDepth = GLASS_WALL_HALF_DEPTH): Surface {
  const t = GLASS_WALL_HALF_THICKNESS
  const h = GLASS_WALL_HEIGHT
  return {
    vertices: [
      [-t, 0, -halfDepth], [t, 0, -halfDepth], [t, 0, halfDepth], [-t, 0, halfDepth],
      [-t, h, -halfDepth], [t, h, -halfDepth], [t, h, halfDepth], [-t, h, halfDepth]
    ],
    triangles: [
      0, 1, 2, 0, 2, 3, 4, 7, 6, 4, 6, 5,
      0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2,
      2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0
    ]
  }
}

export function moveSurface(surface: Surface, [dx, dy, dz]: Point): Surface {
  return { ...surface, vertices: surface.vertices.map(([x, y, z]) => [x + dx, y + dy, z + dz]) }
}

export function maskFloor(withBypass: boolean): Surface {
  return rectangularFloor(1, 7, 2, withBypass ? 6 : 4)
}

export function wallCrossingZ(route: Route, [wallX]: Point = GLASS_WALL_CENTER): number | undefined {
  const index = route.points.findIndex(([x]) => x >= wallX)
  if (index <= 0) return undefined
  const [x0, , z0] = route.points[index - 1]
  const [x1, , z1] = route.points[index]
  return z0 + (z1 - z0) * (wallX - x0) / (x1 - x0)
}

// Check the whole swept disc. The center-wall crossing alone misses a diagonal
// path that enters a corner before it reaches the wall's center plane.
export function routeClearsPhysicalWall(points: readonly Point[]): boolean {
  const [x, , z] = GLASS_WALL_CENTER
  const minX = x - GLASS_WALL_HALF_THICKNESS
  const maxX = x + GLASS_WALL_HALF_THICKNESS
  const minZ = z - GLASS_WALL_HALF_DEPTH
  const maxZ = z + GLASS_WALL_HALF_DEPTH
  const clearance = MASK_AGENT_RADIUS - 0.01
  const corners = [[minX, minZ], [minX, maxZ], [maxX, minZ], [maxX, maxZ]]
  const pointDistance = ([px, , pz]: Point) =>
    Math.hypot(Math.max(minX - px, px - maxX, 0), Math.max(minZ - pz, pz - maxZ, 0))

  return points.slice(1).every((end, i) => {
    const start = points[i]
    if (pointDistance(start) < clearance || pointDistance(end) < clearance) return false
    let low = 0
    let high = 1
    for (const [axis, min, max] of [[0, minX, maxX], [2, minZ, maxZ]] as const) {
      const delta = end[axis] - start[axis]
      if (delta === 0) {
        if (start[axis] < min || start[axis] > max) high = -1
        continue
      }
      const a = (min - start[axis]) / delta
      const b = (max - start[axis]) / delta
      low = Math.max(low, Math.min(a, b))
      high = Math.min(high, Math.max(a, b))
    }
    if (low <= high) return false
    const dx = end[0] - start[0]
    const dz = end[2] - start[2]
    const lengthSquared = dx * dx + dz * dz
    return corners.every(([cx, cz]) => {
      const alpha = lengthSquared === 0 ? 0
        : Math.max(0, Math.min(1, ((cx - start[0]) * dx + (cz - start[2]) * dz) / lengthSquared))
      return Math.hypot(cx - start[0] - dx * alpha, cz - start[2] - dz * alpha) >= clearance
    })
  })
}

type Position = { x: number; y: number; z: number }

export type NavigationHit = {
  entityId?: number
  position?: Position
  length: number
}

export type FloorZone = { floor: 'lower' | 'upper'; y: number }
export type FloorDestination = { floor: FloorZone['floor']; point: Point }

export const FLOOR_PICK_LOWER: FloorZone = { floor: 'lower', y: 0 }
export const FLOOR_PICK_UPPER: FloorZone = { floor: 'upper', y: 3 }
export const FLOOR_PICK_TARGET_X = 8
export const FLOOR_PICK_TARGET_Z = 11
export const FLOOR_PICK_START: Point = [8, 0, 7]

// Explorer raycast positions are scene-local, but entity IDs are transient.
// Register IDs when creating the zones and retain only their author's floor key.
export function pickFloorDestination(
  hits: readonly NavigationHit[],
  zones: ReadonlyMap<number, FloorZone>,
  previous?: FloorDestination
): FloorDestination | undefined {
  let nearest = Number.POSITIVE_INFINITY
  let destination = previous
  for (const hit of hits) {
    const zone = hit.entityId === undefined ? undefined : zones.get(hit.entityId)
    const point = hit.position
    if (!zone || !point || ![point.x, point.y, point.z, hit.length].every(Number.isFinite) ||
        hit.length < 0 || hit.length >= nearest || Math.abs(point.y - zone.y) > 0.05) continue
    nearest = hit.length
    destination = { floor: zone.floor, point: [point.x, point.y, point.z] }
  }
  return destination
}

export function routeToPickedFloor(navigator: Navigator, destination: FloorDestination): boolean {
  const route = navigator.route(FLOOR_PICK_START, destination.point)
  const end = route.points[route.points.length - 1]
  return route.status === 'complete' && end !== undefined &&
    Math.abs(end[1] - destination.point[1]) < 0.2 &&
    Math.hypot(end[0] - destination.point[0], end[2] - destination.point[2]) < 0.2
}
