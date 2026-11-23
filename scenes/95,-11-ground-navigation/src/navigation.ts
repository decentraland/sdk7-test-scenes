import {
  DEFAULT_QUERY_FILTER,
  FindStraightPathOptions,
  createFindNearestPolyResult,
  findNearestPoly,
  findNodePath,
  findStraightPath,
  type NavMesh,
  type Vec3,
} from 'navcat'
import { generateSoloNavMesh } from 'navcat/blocks'
import type { Point, Surface } from './arena'

export type Route = { status: 'complete' | 'unreachable'; points: Point[] }
export type Navigator = { route(start: Point, goal: Point): Route }

export const NAVIGATION_BAKE = {
  cellSize: 0.15,
  cellHeight: 0.1,
  radius: 0.3,
  height: 1.6,
  climb: 0.3,
  slope: 40,
  minRegionSize: 4,
  mergeRegionSize: 12,
  maxSimplificationError: 1.3,
  maxEdgeLength: 12,
  maxVerticesPerPoly: 6,
  detailSampleDistanceVoxels: 6,
  detailSampleErrorVoxels: 1,
}

export const SNAP_EXTENTS: Vec3 = [0.55, 0.35, 0.55]

export function withinSnap(point: Point, requested: Point): boolean {
  return (
    Math.abs(point[0] - requested[0]) <= SNAP_EXTENTS[0] &&
    Math.abs(point[1] - requested[1]) <= SNAP_EXTENTS[1] &&
    Math.abs(point[2] - requested[2]) <= SNAP_EXTENTS[2]
  )
}

function reflectZ(point: Point): Vec3 {
  return [point[0], point[1], -point[2]]
}

export function toRecastGeometry(surfaces: readonly Surface[]) {
  const positions: number[] = []
  const indices: number[] = []
  for (const { vertices, triangles } of surfaces) {
    const base = positions.length / 3
    for (const vertex of vertices) positions.push(...reflectZ(vertex))
    // Reflection changes handedness. Reverse winding so floor triangles still face up.
    for (let i = 0; i < triangles.length; i += 3) {
      indices.push(base + triangles[i], base + triangles[i + 2], base + triangles[i + 1])
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
}

export function bakeNavcatMesh(surfaces: readonly Surface[]): NavMesh {
  const bake = NAVIGATION_BAKE
  const { navMesh } = generateSoloNavMesh(toRecastGeometry(surfaces), {
    cellSize: bake.cellSize,
    cellHeight: bake.cellHeight,
    walkableRadiusWorld: bake.radius,
    walkableRadiusVoxels: Math.ceil(bake.radius / bake.cellSize),
    walkableHeightWorld: bake.height,
    walkableHeightVoxels: Math.ceil(bake.height / bake.cellHeight),
    walkableClimbWorld: bake.climb,
    walkableClimbVoxels: Math.round(bake.climb / bake.cellHeight),
    walkableSlopeAngleDegrees: bake.slope,
    borderSize: 0,
    minRegionArea: bake.minRegionSize ** 2,
    mergeRegionArea: bake.mergeRegionSize ** 2,
    maxSimplificationError: bake.maxSimplificationError,
    maxEdgeLength: bake.maxEdgeLength,
    maxVerticesPerPoly: bake.maxVerticesPerPoly,
    detailSampleDistance: bake.cellSize * bake.detailSampleDistanceVoxels,
    detailSampleMaxError: bake.cellHeight * bake.detailSampleErrorVoxels,
  })
  return navMesh
}

export function createNavcatNavigatorFromMesh(navMesh: NavMesh): Navigator {
  const findEndpoint = (point: Vec3) => {
    const nearest = findNearestPoly(
      createFindNearestPolyResult(),
      navMesh,
      point,
      SNAP_EXTENTS,
      DEFAULT_QUERY_FILTER,
    )
    return nearest.success && withinSnap(nearest.position, point) ? nearest : undefined
  }

  return {
    route(start, goal) {
      const from = findEndpoint(reflectZ(start))
      const to = findEndpoint(reflectZ(goal))
      if (!from || !to) return { status: 'unreachable', points: [] }

      const corridor = findNodePath(
        navMesh,
        from.nodeRef,
        to.nodeRef,
        from.position,
        to.position,
        DEFAULT_QUERY_FILTER,
      )
      // A successful search can still return a partial corridor.
      if (!corridor.success || corridor.path[corridor.path.length - 1] !== to.nodeRef) {
        return { status: 'unreachable', points: [] }
      }

      const straight = findStraightPath(
        navMesh,
        from.position,
        to.position,
        corridor.path,
        null,
        FindStraightPathOptions.ALL_CROSSINGS,
      )
      const points = straight.path.map(({ position }) => reflectZ(position))
      const end = points[points.length - 1]
      if (!straight.success || !end || !withinSnap(end, goal)) {
        return { status: 'unreachable', points: [] }
      }
      return { status: 'complete', points }
    },
  }
}

export function createNavcatNavigator(surfaces: readonly Surface[]): Navigator {
  return createNavcatNavigatorFromMesh(bakeNavcatMesh(surfaces))
}
