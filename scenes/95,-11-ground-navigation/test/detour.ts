import { NavMeshQuery, Raw, type Vector3 } from 'recast-navigation'
import { generateSoloNavMesh } from 'recast-navigation/generators'
import type { Point, Surface } from '../src/arena'
import {
  NAVIGATION_BAKE,
  SNAP_EXTENTS,
  toRecastGeometry,
  withinSnap,
  type Navigator,
} from '../src/navigation'

// dtStraightPathOptions. Include every crossed polygon edge to retain ramp height changes.
const ALL_CROSSINGS = 2

function toDetour([x, y, z]: Point): Vector3 {
  return { x, y, z: -z }
}

function fromDetour({ x, y, z }: Vector3): Point {
  return [x, y, -z]
}

export function createDetourNavigator(surfaces: readonly Surface[]): Navigator & { dispose(): void } {
  const bake = NAVIGATION_BAKE
  const { positions, indices } = toRecastGeometry(surfaces)
  const result = generateSoloNavMesh(positions, indices, {
    cs: bake.cellSize,
    ch: bake.cellHeight,
    walkableSlopeAngle: bake.slope,
    walkableRadius: Math.ceil(bake.radius / bake.cellSize),
    walkableHeight: Math.ceil(bake.height / bake.cellHeight),
    walkableClimb: Math.round(bake.climb / bake.cellHeight),
    maxEdgeLen: bake.maxEdgeLength,
    maxSimplificationError: bake.maxSimplificationError,
    minRegionArea: bake.minRegionSize,
    mergeRegionArea: bake.mergeRegionSize,
    maxVertsPerPoly: bake.maxVerticesPerPoly,
    detailSampleDist: bake.detailSampleDistanceVoxels,
    detailSampleMaxError: bake.detailSampleErrorVoxels,
  })
  if (!result.success) throw new Error(`Detour bake failed: ${result.error}`)
  const query = new NavMeshQuery(result.navMesh)
  const halfExtents = { x: SNAP_EXTENTS[0], y: SNAP_EXTENTS[1], z: SNAP_EXTENTS[2] }

  const findEndpoint = (point: Point) => {
    const nearest = query.findNearestPoly(toDetour(point), { halfExtents })
    return nearest.success && nearest.nearestRef && withinSnap(fromDetour(nearest.nearestPoint), point)
      ? nearest
      : undefined
  }

  return {
    route(start, goal) {
      const from = findEndpoint(start)
      const to = findEndpoint(goal)
      if (!from || !to) return { status: 'unreachable', points: [] }

      const { success, polys } = query.findPath(
        from.nearestRef,
        to.nearestRef,
        from.nearestPoint,
        to.nearestPoint,
      )
      try {
        if (!success || !polys.size || polys.get(polys.size - 1) !== to.nearestRef) {
          return { status: 'unreachable', points: [] }
        }
        const straight = query.findStraightPath(from.nearestPoint, to.nearestPoint, polys, {
          straightPathOptions: ALL_CROSSINGS,
        })
        try {
          const points: Point[] = []
          for (let i = 0; i < straight.straightPathCount * 3; i += 3) {
            const vertices = straight.straightPath
            points.push([vertices.get(i), vertices.get(i + 1), -vertices.get(i + 2)])
          }
          const end = points[points.length - 1]
          if (!straight.success || !end || !withinSnap(end, goal)) {
            return { status: 'unreachable', points: [] }
          }
          return { status: 'complete', points }
        } finally {
          straight.straightPath.destroy()
          straight.straightPathFlags.destroy()
          straight.straightPathRefs.destroy()
        }
      } finally {
        polys.destroy()
      }
    },
    dispose() {
      Raw.destroy(query.defaultFilter.raw)
      query.destroy()
      result.navMesh.destroy()
    },
  }
}
