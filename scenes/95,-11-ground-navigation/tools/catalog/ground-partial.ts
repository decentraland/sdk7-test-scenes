import {
  createFindNearestPolyResult, createGetClosestPointOnPolyResult, DEFAULT_QUERY_FILTER,
  findNearestPoly, findNodePath, FindNodePathResultFlags, findStraightPath, getClosestPointOnPoly,
  type NavMesh
} from 'navcat'
import { Detour, NavMeshQuery, Raw, statusDetail, type NavMesh as DetourMesh } from 'recast-navigation'
import type { Point } from '../../src/arena'
import { traversalSurfaces, type TraversalBackend } from '../sdk-detour-probe/traversal-routing'
import { groundClearance, groundFollower, pointDistance, rectangleEdges } from './ground-motion'
import { detourPoint, detourTiles, nativePoint, navcatTiles } from './native-tiles'
import { box, check, type CatalogCase } from './types'

const RADIUS = 0.18
const START: Point = [1, 0, 1]
const SEALED_GOAL: Point = [5.55, 0, 1]
const WALL = box('seal', 'obstacle', [5, 0, 0], [6.05, 2, 2])
const HEIGHTFIELD = traversalSurfaces([box('heightfield', 'surface', [0, -0.2, 0], [9, 0, 2]), WALL], 1.4)
const wallEdges = rectangleEdges(5, 6.05, 0, 2)
const bounds = [1.2, 0.35, 0.4] as const

type PartialRoute = { status: 'partial'; points: readonly Point[]; projectedGoal: Point }

function navcatPartial(mesh: NavMesh, start: Point, goal: Point): PartialRoute | undefined {
  const nearest = (point: Point) =>
    findNearestPoly(createFindNearestPolyResult(), mesh, nativePoint(point), [...bounds], DEFAULT_QUERY_FILTER)
  const from = nearest(start)
  const to = nearest(goal)
  if (!from.success || !to.success) return
  const route = findNodePath(mesh, from.nodeRef, to.nodeRef, from.position, to.position, DEFAULT_QUERY_FILTER)
  const last = route.path[route.path.length - 1]
  if (!route.success || !(route.flags & FindNodePathResultFlags.PARTIAL_PATH) || last === undefined || last === to.nodeRef) return
  const end = getClosestPointOnPoly(createGetClosestPointOnPolyResult(), mesh, last, nativePoint(goal))
  if (!end.success) return
  const straight = findStraightPath(mesh, from.position, end.position, route.path)
  if (!straight.success) return
  return { status: 'partial', points: straight.path.map(({ position }) => nativePoint(position)),
    projectedGoal: nativePoint(to.position) }
}

function detourPartial(mesh: DetourMesh, start: Point, goal: Point): PartialRoute | undefined {
  const query = new NavMeshQuery(mesh)
  try {
    const halfExtents = { x: bounds[0], y: bounds[1], z: bounds[2] }
    const from = query.findNearestPoly(detourPoint(start), { halfExtents })
    const to = query.findNearestPoly(detourPoint(goal), { halfExtents })
    if (!from.success || !to.success || !from.nearestRef || !to.nearestRef) return
    const route = query.findPath(from.nearestRef, to.nearestRef, from.nearestPoint, to.nearestPoint)
    try {
      if (!route.success || !statusDetail(route.status, Detour.DT_PARTIAL_RESULT) || route.polys.size === 0) return
      const last = route.polys.get(route.polys.size - 1)
      if (last === to.nearestRef) return
      const end = query.closestPointOnPoly(last, detourPoint(goal))
      if (!end.success) return
      const straight = query.findStraightPath(from.nearestPoint, end.closestPoint, route.polys)
      try {
        if (!straight.success) return
        return {
          status: 'partial',
          points: Array.from({ length: straight.straightPathCount }, (_, i): Point => [
            straight.straightPath.get(3 * i), straight.straightPath.get(3 * i + 1), -straight.straightPath.get(3 * i + 2)
          ]),
          projectedGoal: [to.nearestPoint.x, to.nearestPoint.y, -to.nearestPoint.z]
        }
      } finally {
        straight.straightPath.destroy()
        straight.straightPathFlags.destroy()
        straight.straightPathRefs.destroy()
      }
    } finally {
      route.polys.destroy()
    }
  } finally {
    Raw.destroy(query.defaultFilter.raw)
    query.destroy()
  }
}

function sealedGoal(backend: TraversalBackend) {
  if (backend === 'navcat') return navcatPartial(navcatTiles(HEIGHTFIELD, RADIUS), START, SEALED_GOAL)
  const mesh = detourTiles(HEIGHTFIELD, RADIUS)
  try {
    return detourPartial(mesh, START, SEALED_GOAL)
  } finally {
    mesh.destroy()
  }
}

function executePartial(route: PartialRoute, tolerance: number) {
  const follower = groundFollower(START)
  follower.assign(route.points)
  let safe = true
  const allow = (from: Point, to: Point) => groundClearance([from, to], wallEdges) >= RADIUS - 0.02
  for (let tick = 0; tick < 100 && !follower.finished(); tick++) safe = follower.step(0.16, allow) && safe
  const stop = follower.position()
  for (let tick = 0; tick < 3; tick++) follower.step(0.16, allow)
  const held = pointDistance(stop, follower.position()) < 1e-6
  const distance = pointDistance(stop, SEALED_GOAL)
  return { safe, stop, held, distance, reachedPrefixEnd: follower.finished(),
    reachedGoal: follower.finished() && distance <= tolerance }
}

export const followPartial: CatalogCase['run'] = (backend) => {
  const route = sealedGoal(backend)
  if (!route || route.points.length < 2 || route.projectedGoal[0] <= 6.05) {
    return check(false, 'The native query did not expose a partial prefix toward the projection on the far side of the wall.')
  }
  const result = executePartial(route, 0.05)
  return check(result.safe && result.held && result.reachedPrefixEnd && !result.reachedGoal &&
    result.stop[0] > 4.6 && result.stop[0] < 5 && result.distance > 0.7,
  'The native partial prefix ends before the solid wall. The follower holds at its safe boundary: ' + JSON.stringify(result))
}

export const tolerantGoal: CatalogCase['run'] = (backend) => {
  const route = sealedGoal(backend)
  if (!route || route.points.length < 2) return check(false, 'No native partial route to the blocked goal.')
  const narrow = executePartial(route, 0.7)
  const wide = executePartial(route, 0.9)
  return check(narrow.safe && wide.safe && narrow.held && wide.held && narrow.reachedPrefixEnd && wide.reachedPrefixEnd &&
    !narrow.reachedGoal && wide.reachedGoal, 'Native projected endpoint is ' + narrow.distance.toFixed(3) +
    ' m from the sealed target. A 0.7 m tolerance refuses it and a 0.9 m tolerance accepts the safe position.')
}
