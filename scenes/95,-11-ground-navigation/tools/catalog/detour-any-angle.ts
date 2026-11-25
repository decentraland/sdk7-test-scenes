import { Detour, NavMeshQuery, Raw, UnsignedIntArray, statusDetail, statusInProgress, statusSucceed } from 'recast-navigation'
import { findDetourSlicedPath, supportsDetourSlicedPath } from '../sdk-detour-probe/detour-sliced-path'
import { crosses, floor, pathLength } from './ground'
import { detourPoint, detourTiles } from './native-tiles'
import { check, unsupported } from './types'
import type { Point } from '../../src/arena'
import type { Route } from '../../src/navigation'

export function detourAnyAngleCosts() {
  if (!supportsDetourSlicedPath()) return unsupported('This Detour WASM does not expose sliced search. Load the patched module.')
  const mesh = detourTiles([floor(0, 12, 0, 6), floor(9, 12, 0, 2, 3)])
  const query = new NavMeshQuery(mesh)
  try {
    let weightedPolys = 0
    for (const tile of Array.from({ length: mesh.getMaxTiles() }, (_, i) => mesh.getTile(i))) {
      const header = tile.header()
      if (!header || header.y() !== 2 || (header.x() !== 2 && header.x() !== 3) || header.bmin(1) > 1) continue
      const base = mesh.getPolyRefBase(tile)
      for (let i = 0; i < header.polyCount(); i++) {
        if (!statusSucceed(mesh.setPolyArea(base + i, 2))) return check(false, 'Could not assign the expensive area.')
        weightedPolys++
      }
    }
    const nearest = (point: Point) => {
      const result = query.findNearestPoly(detourPoint(point), { halfExtents: { x: 0.3, y: 0.3, z: 0.3 } })
      return { ref: result.nearestRef, position: result.nearestPoint }
    }
    const start = nearest([1, 0, 1])
    const goal = nearest([11, 0, 1])
    const upper = nearest([11, 3, 1])
    if (!weightedPolys || !start.ref || !goal.ref || !upper.ref) return check(false, 'Missing tagged tiles or projected anchors.')
    function route(weight: number, anyAngle: boolean) {
      query.defaultFilter.setAreaCost(2, weight)
      const found = findDetourSlicedPath(query, start, goal, { anyAngle, iterationsPerBatch: 1 })
      const direct = query.raycast(start.ref, start.position, goal.position, { raycastOptions: Detour.DT_RAYCAST_USE_COSTS })
      const full = statusSucceed(found.status) && !statusDetail(found.status, Detour.DT_PARTIAL_RESULT) &&
        !statusDetail(found.status, Detour.DT_BUFFER_TOO_SMALL) && !statusDetail(found.status, Detour.DT_OUT_OF_NODES) &&
        found.refs[found.refs.length - 1] === goal.ref && found.refs.every((ref) => mesh.isValidPolyRef(ref))
      if (!full) return { ...found, complete: false, outside: false, directCost: direct.pathCost, length: 0 }
      const polys = new UnsignedIntArray()
      try {
        polys.copy(found.refs)
        const straight = query.findStraightPath(start.position, goal.position, polys, { straightPathOptions: 2 })
        try {
          const points: Point[] = Array.from({ length: straight.straightPathCount }, (_, i) =>
            [straight.straightPath.get(i * 3), straight.straightPath.get(i * 3 + 1), -straight.straightPath.get(i * 3 + 2)])
          const last = points[points.length - 1]
          const complete = straight.success && !!last && Math.hypot(last[0] - 11, last[2] - 1) < 0.05 &&
            Math.abs(last[1] - goal.position.y) < 0.05
          const asRoute: Route = { status: complete ? 'complete' : 'unreachable', points }
          return { ...found, complete, outside: crosses(asRoute, 0, 6, ([, , z]) => z > 1.95),
            directCost: direct.pathCost, length: pathLength(asRoute) }
        } finally {
          straight.straightPath.destroy()
          straight.straightPathRefs.destroy()
          straight.straightPathFlags.destroy()
        }
      } finally {
        polys.destroy()
      }
    }
    const cheap = route(1, true)
    const high = route(20, true)
    const standard = route(20, false)
    const small = findDetourSlicedPath(query, start, goal, { anyAngle: true, maxPathPolys: 1 })
    const budget = findDetourSlicedPath(query, start, goal, { anyAngle: true, maxIterations: 1 })
    const invalid = findDetourSlicedPath(query, { ...start, ref: 0 }, goal, { anyAngle: true })
    const disconnected = findDetourSlicedPath(query, start, upper, { anyAngle: true })
    return check(cheap.complete && cheap.batches > 1 && !cheap.outside && Math.abs(cheap.length - 10) < 0.15 &&
      Math.abs(cheap.directCost - 10) < 0.15 && high.complete && high.outside && high.directCost > 70 &&
      standard.complete && standard.outside && high.length <= standard.length + 0.5 &&
      statusDetail(small.status, Detour.DT_BUFFER_TOO_SMALL) && small.refs.length === 1 &&
      statusInProgress(budget.status) && budget.iterations === 1 && budget.refs.length === 0 &&
      !statusSucceed(invalid.status) && statusDetail(invalid.status, Detour.DT_INVALID_PARAM) && invalid.refs.length === 0 &&
      statusDetail(disconnected.status, Detour.DT_PARTIAL_RESULT) && !disconnected.refs.includes(upper.ref),
    'Native Detour sliced any-angle, weighted route, bounded corridor and disconnected upper floor: ' +
    JSON.stringify({ cheap, high, standard, small, budget, invalid, disconnected }))
  } finally {
    Raw.destroy(query.defaultFilter.raw)
    query.destroy()
    mesh.destroy()
  }
}
