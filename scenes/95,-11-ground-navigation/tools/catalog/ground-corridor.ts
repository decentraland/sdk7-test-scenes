import { createFindNearestPolyResult, DEFAULT_QUERY_FILTER, findNearestPoly, findNodePath, findStraightPath } from 'navcat'
import { pathCorridor } from 'navcat/blocks'
import { NavMeshQuery, Raw } from 'recast-navigation'
import type { Point } from '../../src/arena'
import type { Route } from '../../src/navigation'
import { crosses, floor } from './ground'
import { groundClearance, groundFollower, pointDistance, rectangleEdges } from './ground-motion'
import { detourPoint, detourTiles, nativePoint, navcatTiles } from './native-tiles'
import { check, type CatalogCase } from './types'

const START: Point = [0.75, 0, 2.5]
const NEAR: Point = [2.45, 0, 2.5]
const FAR: Point = [5, 0, 2.5]
const GOAL: Point = [8, 0, 7]
const radius = 0.18
const localRange = 2
const faces = [floor(0, 3, 0, 8), floor(3, 9, 6, 8)]
const edges = rectangleEdges(3, 9, 0, 6)
const endsAt = (refs: readonly number[], goalRef: number) => refs[refs.length - 1] === goalRef

function follow(from: Point, points: Point[]) {
  const follower = groundFollower(from)
  follower.assign(points)
  let safe = true
  for (let tick = 0; tick < 150 && safe && !follower.finished(); tick++) {
    safe = follower.step(0.13, (a, b) => groundClearance([a, b], edges) >= radius - 0.015)
  }
  const route: Route = { status: 'complete', points }
  return safe && follower.finished() && pointDistance(follower.position(), GOAL) < 0.12 &&
    crosses(route, 0, 3.1, ([, , z]) => z > 6)
}

function navcatRecovery() {
  const mesh = navcatTiles(faces, radius)
  const filter = DEFAULT_QUERY_FILTER
  const project = (point: Point, x = 0.35) => findNearestPoly(createFindNearestPolyResult(), mesh, nativePoint(point), [x, 0.35, 0.35], filter)
  const from = project(START)
  const goal = project(GOAL)
  const plan = (source: typeof from) => findNodePath(mesh, source.nodeRef, goal.nodeRef, source.position, goal.position, filter)
  const original = plan(from)
  const corridor = pathCorridor.create()
  pathCorridor.reset(corridor, from.nodeRef, from.position)
  pathCorridor.setPath(corridor, goal.position, original.path)
  const near = pointDistance(NEAR, START) < localRange &&
    pathCorridor.movePosition(corridor, nativePoint(NEAR), mesh, filter)
  const local = findStraightPath(mesh, corridor.position, goal.position, corridor.path)
  const farStrict = project(FAR)
  const recovered = project(FAR, 3)
  const retry = plan(recovered)
  const reroute = findStraightPath(mesh, recovered.position, goal.position, retry.path)
  const points = (path: typeof local) => path.path.map(({ position }) => nativePoint(position))
  return {
    original: from.success && goal.success && original.success && endsAt(original.path, goal.nodeRef),
    repaired: near && corridor.path[0] === project(NEAR).nodeRef && corridor.path[0] !== from.nodeRef &&
      pathCorridor.corridorIsValid(corridor, corridor.path.length, mesh, filter) &&
      pointDistance(nativePoint(corridor.position), NEAR) < 0.12 && local.success &&
      follow(nativePoint(corridor.position), points(local)),
    replanned: pointDistance(FAR, START) > localRange && !farStrict.success && recovered.success &&
      retry.success && endsAt(retry.path, goal.nodeRef) && reroute.success &&
      follow(nativePoint(recovered.position), points(reroute))
  }
}

function detourRecovery() {
  const mesh = detourTiles(faces, radius)
  const query = new NavMeshQuery(mesh)
  const position = ({ x, y, z }: ReturnType<typeof detourPoint>): Point => [x, y, -z]
  const project = (point: Point, x = 0.35) => query.findNearestPoly(detourPoint(point), { halfExtents: { x, y: 0.35, z: 0.35 } })
  try {
    const from = project(START)
    const goal = project(GOAL)
    const plan = (source: typeof from) => {
      const found = query.findPath(source.nearestRef, goal.nearestRef, source.nearestPoint, goal.nearestPoint)
      try { return found.success ? Array.from(found.polys.toTypedArray()) : [] }
      finally { found.polys.destroy() }
    }
    const points = (from: ReturnType<typeof detourPoint>, refs: number[]) => {
      const result = query.findStraightPath(from, goal.nearestPoint, refs)
      try {
        return result.success ? Array.from({ length: result.straightPathCount }, (_, index): Point => [
          result.straightPath.get(index * 3), result.straightPath.get(index * 3 + 1), -result.straightPath.get(index * 3 + 2)
        ]) : []
      } finally {
        result.straightPath.destroy()
        result.straightPathRefs.destroy()
        result.straightPathFlags.destroy()
      }
    }
    const original = plan(from)
    const nudge = query.moveAlongSurface(from.nearestRef, from.nearestPoint, detourPoint(NEAR))
    // The Detour JS bindings expose the local native walk, but not dtPathCorridor.
    // Splice the visited prefix using the same reference-only rule used by navcat.
    const corridor = pathCorridor.mergeStartMoved(original, nudge.visited)
    const farStrict = project(FAR)
    const recovered = project(FAR, 3)
    const retry = plan(recovered)
    return {
      original: from.success && goal.success && endsAt(original, goal.nearestRef),
      repaired: pointDistance(NEAR, START) < localRange && nudge.success && corridor[0] === project(NEAR).nearestRef &&
        corridor[0] !== from.nearestRef && corridor.every((ref) => mesh.isValidPolyRef(ref)) &&
        pointDistance(position(nudge.resultPosition), NEAR) < 0.12 && follow(position(nudge.resultPosition), points(nudge.resultPosition, corridor)),
      replanned: pointDistance(FAR, START) > localRange && !farStrict.nearestRef && recovered.nearestRef !== 0 &&
        endsAt(retry, goal.nearestRef) && follow(position(recovered.nearestPoint), points(recovered.nearestPoint, retry))
    }
  } finally {
    Raw.destroy(query.defaultFilter.raw)
    query.destroy()
    mesh.destroy()
  }
}

export const displacedCorridor: CatalogCase['run'] = (backend) => {
  const results = backend === 'navcat' ? navcatRecovery() : detourRecovery()
  return check(Object.values(results).every(Boolean),
    'Nearby nudge repairs the existing native corridor; far nudge needs projection and fresh search. Both traverse the L bend safely. ' +
      JSON.stringify(results))
}
