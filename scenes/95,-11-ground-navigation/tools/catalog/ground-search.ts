import {
  createFindNearestPolyResult, createGetClosestPointOnPolyResult, createSlicedNodePathQuery, DEFAULT_QUERY_FILTER,
  finalizeSlicedFindNodePath, findNearestPoly, findStraightPath, getClosestPointOnPoly, initSlicedFindNodePath,
  SlicedFindNodePathStatusFlags, updateSlicedFindNodePath, type NavMesh
} from 'navcat'
import { Detour, NavMeshQuery, Raw, statusDetail, type NavMesh as DetourMesh } from 'recast-navigation'
import type { Point } from '../../src/arena'
import type { Route } from '../../src/navigation'
import { crosses, floor, pathLength } from './ground'
import { groundClearance, groundFollower, pointDistance, rectangleEdges } from './ground-motion'
import { detourPoint, detourTiles, nativePoint, navcatTiles } from './native-tiles'
import { check, type CatalogCase } from './types'

export function observeNavcatSearch(mesh: NavMesh, start: Point, goal: Point, budget?: number) {
  const filter = DEFAULT_QUERY_FILTER
  const project = (position: Point) =>
    findNearestPoly(createFindNearestPolyResult(), mesh, nativePoint(position), [0.55, 0.35, 0.55], filter)
  const a = project(start)
  const b = project(goal)
  if (!a.success || !b.success || pointDistance(nativePoint(a.position), start) > 0.56 ||
      pointDistance(nativePoint(b.position), goal) > 0.56) return

  const query = createSlicedNodePathQuery()
  initSlicedFindNodePath(mesh, query, a.nodeRef, b.nodeRef, a.position, b.position, filter)
  let expanded = 0
  let peakOpen = query.openList.length
  while (query.status === SlicedFindNodePathStatusFlags.IN_PROGRESS && (budget === undefined || expanded < budget)) {
    const performed = updateSlicedFindNodePath(mesh, query, 1)
    expanded += performed
    peakOpen = Math.max(peakOpen, query.openList.length)
    if (performed === 0 && query.status === SlicedFindNodePathStatusFlags.IN_PROGRESS) {
      throw new Error('Navcat sliced query stopped making progress.')
    }
  }
  const bounded = budget !== undefined && query.status === SlicedFindNodePathStatusFlags.IN_PROGRESS
  const result = finalizeSlicedFindNodePath(mesh, query)
  const last = result.path[result.path.length - 1]
  if (last === undefined) return { points: [], complete: false, bounded, expanded, peakOpen }
  const end = getClosestPointOnPoly(createGetClosestPointOnPolyResult(), mesh, last, b.position)
  const waypoints = findStraightPath(mesh, a.position, end.position, result.path)
  return {
    points: end.success && waypoints.success ? waypoints.path.map(({ position }) => nativePoint(position)) : [],
    complete: !bounded && last === b.nodeRef, bounded, expanded, peakOpen
  }
}

function boundedDetour(mesh: DetourMesh, start: Point, goal: Point, maxNodes: number) {
  const query = new NavMeshQuery(mesh, { maxNodes })
  try {
    const a = query.findNearestPoly(detourPoint(start))
    const b = query.findNearestPoly(detourPoint(goal))
    if (!a.success || !b.success || !a.nearestRef || !b.nearestRef) return
    const result = query.findPath(a.nearestRef, b.nearestRef, a.nearestPoint, b.nearestPoint)
    try {
      const last = result.polys.size ? result.polys.get(result.polys.size - 1) : 0
      const bounded = statusDetail(result.status, Detour.DT_OUT_OF_NODES)
      if (!result.success || !last) return { points: [], bounded, complete: false }
      const end = query.closestPointOnPoly(last, b.nearestPoint)
      if (!end.success) return { points: [], bounded, complete: false }
      const path = query.findStraightPath(a.nearestPoint, end.closestPoint, result.polys)
      try {
        return {
          points: path.success ? Array.from({ length: path.straightPathCount }, (_, i): Point => [
            path.straightPath.get(i * 3), path.straightPath.get(i * 3 + 1), -path.straightPath.get(i * 3 + 2)
          ]) : [],
          bounded: bounded && statusDetail(result.status, Detour.DT_PARTIAL_RESULT),
          complete: last === b.nearestRef && !bounded
        }
      } finally {
        path.straightPath.destroy()
        path.straightPathFlags.destroy()
        path.straightPathRefs.destroy()
      }
    } finally {
      result.polys.destroy()
    }
  } finally {
    Raw.destroy(query.defaultFilter.raw)
    query.destroy()
  }
}

export const budgetedHairpin: CatalogCase['run'] = (backend) => {
  const geometry = [floor(0, 3, 0, 22), floor(3.5, 6.5, 0, 22), floor(3, 3.5, 20, 22)]
  const start: Point = [2.75, 0, 1]
  const goal: Point = [3.75, 0, 1]
  const radius = 0.18
  const wall = rectangleEdges(3, 3.5, 0, 20)
  function test(run: (budget: number) => ReturnType<typeof boundedDetour>) {
    const restricted = run(4)
    const expanded = run(256)
    if (!restricted || !expanded) return check(false, 'Could not project endpoints on both sides of the hairpin.')
    const follower = groundFollower(start)
    follower.assign(restricted.points)
    let safe = true
    for (let tick = 0; tick < 240 && !follower.finished(); tick++) {
      safe = follower.step(0.15, (a, b) => groundClearance([a, b], wall) >= radius - 0.015) && safe
    }
    const stop = follower.position()
    follower.step(0.15, () => true)
    const route: Route = { status: 'complete', points: expanded.points }
    const roundsEnd = crosses(route, 0, 3.25, ([, , z]) => z > 20)
    const clearance = groundClearance(route.points, wall)
    return check(restricted.bounded && !restricted.complete && restricted.points.length > 0 && follower.finished() &&
      safe && stop[0] < 3 && pointDistance(stop, goal) > 0.9 && pointDistance(stop, follower.position()) < 1e-6 &&
      expanded.complete && !expanded.bounded && pathLength(route) > 37 && pointDistance(goal, route.points[route.points.length - 1]) < 0.2 &&
      roundsEnd && clearance >= radius - 0.015,
    'Same tiled mesh across budgets. A bounded query yields a safe, unfinished prefix. The expanded route rounds the remote wall end. ' +
      JSON.stringify({ bounded: restricted.bounded, prefixPoints: restricted.points.length, stop,
        detourLength: pathLength(route), completed: expanded.complete, roundsEnd, clearance }))
  }
  if (backend === 'navcat') {
    const mesh = navcatTiles(geometry, radius)
    return test((budget) => observeNavcatSearch(mesh, start, goal, budget))
  }
  const mesh = detourTiles(geometry, radius)
  try { return test((budget) => boundedDetour(mesh, start, goal, budget)) }
  finally { mesh.destroy() }
}
