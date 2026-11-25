import {
  DEFAULT_QUERY_FILTER,
  FindStraightPathOptions,
  createFindNearestPolyResult,
  findNearestPoly,
  findNodePath,
  findStraightPath,
  type NavMesh,
  type QueryFilter,
  type Vec3,
} from 'navcat'
import { generateSoloNavMesh } from 'navcat/blocks'
import type { Point, Surface } from './navmesh/types'

import { NAVIGATION_BAKE, SNAP_EXTENTS, reflectZ, toRecastGeometry, withinSnap, type NavigationBake, type Navigator } from './navmesh/geometry'

export { NAVIGATION_BAKE, SNAP_EXTENTS, toRecastGeometry, withinSnap } from './navmesh/geometry'
export type { NavigationBake, Navigator, Route } from './navmesh/geometry'

export function bakeNavcatMesh(surfaces: readonly Surface[], bake: NavigationBake = NAVIGATION_BAKE): NavMesh {
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

export function createNavcatNavigatorFromMesh(navMesh: NavMesh, filter: QueryFilter = DEFAULT_QUERY_FILTER): Navigator {
  const findEndpoint = (point: Vec3) => {
    const nearest = findNearestPoly(
      createFindNearestPolyResult(),
      navMesh,
      point,
      SNAP_EXTENTS,
      filter,
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
        filter,
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
