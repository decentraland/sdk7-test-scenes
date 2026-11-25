import { NavMeshQuery, Raw, type NavMesh, type Vector3 } from 'recast-navigation'
import { SNAP_EXTENTS, withinSnap, type Navigator } from './geometry'
import type { Point } from './types'

// dtStraightPathOptions. Keep ramp height changes at polygon crossings.
const ALL_CROSSINGS = 2

export function toDetour([x, y, z]: Point): Vector3 {
  return { x, y, z: -z }
}

export function fromDetour({ x, y, z }: Vector3): Point {
  return [x, y, -z]
}

// Takes ownership of the mesh, including releasing it on dispose().
export type DetourQueryLimits = { maxNodes?: number; maxPathPolys?: number; maxStraightPathPoints?: number }

export function createDetourNavigatorFromMesh(
  mesh: NavMesh, configure?: (filter: NavMeshQuery['defaultFilter']) => void, limits: DetourQueryLimits = {}
): Navigator & { dispose(): void } {
  const query = new NavMeshQuery(mesh, { maxNodes: limits.maxNodes })
  let disposed = false
  configure?.(query.defaultFilter)
  const halfExtents = { x: SNAP_EXTENTS[0], y: SNAP_EXTENTS[1], z: SNAP_EXTENTS[2] }

  const findEndpoint = (point: Point) => {
    const nearest = query.findNearestPoly(toDetour(point), { halfExtents })
    return nearest.success && nearest.nearestRef && withinSnap(fromDetour(nearest.nearestPoint), point)
      ? nearest
      : undefined
  }

  return {
    route(start, goal) {
      if (disposed) throw new Error('Navigation has been disposed.')
      const from = findEndpoint(start)
      const to = findEndpoint(goal)
      if (!from || !to) return { status: 'unreachable', points: [] }

      const { success, polys } = query.findPath(
        from.nearestRef,
        to.nearestRef,
        from.nearestPoint,
        to.nearestPoint,
        { maxPathPolys: limits.maxPathPolys },
      )
      try {
        if (!success || !polys.size || polys.get(polys.size - 1) !== to.nearestRef) {
          return { status: 'unreachable', points: [] }
        }
        const straight = query.findStraightPath(from.nearestPoint, to.nearestPoint, polys, {
          straightPathOptions: ALL_CROSSINGS,
          maxStraightPathPoints: limits.maxStraightPathPoints,
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
      if (disposed) return
      disposed = true
      Raw.destroy(query.defaultFilter.raw)
      query.destroy()
      mesh.destroy()
    },
  }
}
