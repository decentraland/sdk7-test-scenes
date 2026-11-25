import { addOffMeshConnection, createDefaultQueryFilter, createFindNearestPolyResult, DEFAULT_QUERY_FILTER,
  findNearestPoly, getNodeByRef, getNodeByTileAndPoly, OffMeshConnectionDirection } from 'navcat'
import { NavMeshQuery, Raw, statusSucceed } from 'recast-navigation'
import type { Point, Surface } from '../../src/arena'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, type Route } from '../../src/navigation'
import { bakeDetourMesh, createDetourNavigatorFromMesh } from '../../test/detour'
import type { AuthoredLink, TraversalBackend } from '../sdk-detour-probe/traversal-routing'
import { crosses, floor, pathLength } from './ground'
import { groundClearance, groundFollower, pointDistance, type GroundEdge } from './ground-motion'
import { detourPoint, detourTiles, nativePoint, navcatTiles } from './native-tiles'
import { check, type CatalogCase } from './types'

const WALK = 1
const TAGGED = 2
const LINK = 8
const SHORT_LANE_INTERIOR = 16
const TERRAIN = 3

type PolyTag = { flags: number; area?: number }
type Policy = { include?: number; exclude?: number; terrainWeight?: number }
type Query = (start: Point, goal: Point, policy?: Policy) => Route
type AreaAt = (point: Point) => number | undefined

function nativeTerrainLength(route: Route, areaAt: AreaAt) {
  let distance = 0
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]
    const b = route.points[i]
    // Native straight paths include every portal, so each open segment belongs to one polygon.
    const area = areaAt([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])
    if (area === undefined) return NaN
    if (area === TERRAIN) distance += pointDistance(a, b)
  }
  return distance
}

function withTaggedNavmesh<T>(
  backend: TraversalBackend, floors: readonly Surface[], tag: (x: number, z: number, y: number) => PolyTag,
  run: (query: Query, tagged: number, areaAt: AreaAt) => T, link?: AuthoredLink
) {
  let tagged = 0
  if (backend === 'navcat') {
    const mesh = link ? bakeNavcatMesh(floors) : navcatTiles(floors, 0.18)
    for (const tile of Object.values(mesh.tiles)) {
      tile.polys.forEach((poly, index) => {
        const centroid = (axis: number) => poly.vertices.reduce((sum, vertex) => sum + tile.vertices[3 * vertex + axis], 0) / poly.vertices.length
        const { flags, area = 0 } = tag(centroid(0), -centroid(2), centroid(1))
        const node = getNodeByTileAndPoly(mesh, tile, index)
        node.flags = poly.flags = flags
        node.area = poly.area = area
        if (flags !== WALK || area !== 0) tagged++
      })
    }
    if (link) {
      addOffMeshConnection(mesh, { start: nativePoint(link.from), end: nativePoint(link.to), radius: 0.55,
        direction: OffMeshConnectionDirection.BIDIRECTIONAL, flags: LINK, area: 0 })
    }
    const filter = createDefaultQueryFilter()
    const defaultCost = filter.getCost
    let weight = 1
    filter.getCost = (a, b, navmesh, previous, current, next) =>
      defaultCost(a, b, navmesh, previous, current, next) * (getNodeByRef(navmesh, current).area === TERRAIN ? weight : 1)
    const navigator = createNavcatNavigatorFromMesh(mesh, filter)
    const areaAt = (point: Point) => {
      const projected = findNearestPoly(createFindNearestPolyResult(), mesh, nativePoint(point), [0.2, 0.25, 0.2], DEFAULT_QUERY_FILTER)
      return projected.success ? getNodeByRef(mesh, projected.nodeRef).area : undefined
    }
    return run((from, to, policy = {}) => {
      filter.includeFlags = policy.include ?? 0xffff
      filter.excludeFlags = policy.exclude ?? 0
      weight = policy.terrainWeight ?? 1
      return navigator.route(from, to)
    }, tagged, areaAt)
  }

  const mesh = link ? bakeDetourMesh(floors, undefined, [{
    startPosition: detourPoint(link.from), endPosition: detourPoint(link.to), radius: 0.55, bidirectional: true, flags: LINK
  }]) : detourTiles(floors, 0.18)
  let configure = (_: Policy) => {}
  const navigator = createDetourNavigatorFromMesh(mesh, (filter) => {
    configure = (policy) => {
      filter.includeFlags = policy.include ?? 0xffff
      filter.excludeFlags = policy.exclude ?? 0
      filter.setAreaCost(TERRAIN, policy.terrainWeight ?? 1)
    }
  })
  let inspector: NavMeshQuery | undefined
  try {
    for (let i = 0; i < mesh.getMaxTiles(); i++) {
      const tile = mesh.getTile(i)
      const header = tile.header()
      if (!header) continue
      const base = mesh.getPolyRefBase(tile)
      for (let index = 0; index < header.polyCount(); index++) {
        const poly = tile.polys(index)
        if (poly.getType() !== 0) continue
        const centroid = (axis: number) => Array.from({ length: poly.vertCount() }, (_, vertex) =>
          tile.verts(3 * poly.verts(vertex) + axis)).reduce((sum, value) => sum + value, 0) / poly.vertCount()
        const { flags, area = 0 } = tag(centroid(0), -centroid(2), centroid(1))
        const ref = base + index
        if (!statusSucceed(mesh.setPolyFlags(ref, flags)) || !statusSucceed(mesh.setPolyArea(ref, area))) {
          throw new Error('Could not set native Detour ground polygon labels.')
        }
        if (flags !== WALK || area !== 0) tagged++
      }
    }
    const areaAt = (point: Point) => {
      inspector ??= new NavMeshQuery(mesh)
      const projected = inspector.findNearestPoly(detourPoint(point), { halfExtents: { x: 0.2, y: 0.25, z: 0.2 } })
      if (!projected.success || !projected.nearestRef) return
      const area = mesh.getPolyArea(projected.nearestRef)
      return statusSucceed(area.status) ? area.area : undefined
    }
    return run((from, to, policy = {}) => {
      configure(policy)
      return navigator.route(from, to)
    }, tagged, areaAt)
  } finally {
    if (inspector) {
      Raw.destroy(inspector.defaultFilter.raw)
      inspector.destroy()
    }
    navigator.dispose()
  }
}

export const occupiedRegionEscape: CatalogCase['run'] = (backend) => {
  const upper = 3
  const from: Point = [1, upper, 2]
  const to: Point = [7, upper, 2]
  const floors = [floor(0, 4, 1, 3, upper), floor(4, 8, 1.2, 2.8, upper), floor(0, 8, 0, 4)]
  return withTaggedNavmesh(backend, floors, (x, _, y) => ({ flags: x < 4 && y > 2.8 ? TAGGED : WALK }), (route, count) => {
    const follower = groundFollower(from)
    const original = route(from, to)
    follower.assign(original.points)
    follower.step(0.5, () => true)
    const occupied = follower.position()
    const beforeValid = route(to, occupied)
    const forbidden = { exclude: TAGGED }
    const inbound = route(to, occupied, forbidden)
    const normalOutbound = route(occupied, to, forbidden)
    const upperRecovery = route(occupied, to)
    follower.assign(upperRecovery.points)
    let leftRegion = false
    let safe = true
    for (let tick = 0; tick < 150 && safe && !follower.finished(); tick++) {
      safe = follower.step(0.15, (_, next) => {
        if (next[1] < 2.8 || next[1] > 3.25 || next[2] < 1.35 || next[2] > 2.65 ||
            (leftRegion && next[0] < 4)) return false
        leftRegion ||= next[0] >= 4
        return true
      })
    }
    const lower = route([1, 0, 2], [7, 0, 2], forbidden)
    return check(count > 0 && original.status === 'complete' && beforeValid.status === 'complete' &&
      occupied[0] > 1.25 && occupied[0] < 4 && occupied[1] > 2.8 &&
      inbound.status === 'unreachable' && normalOutbound.status === 'unreachable' &&
      upperRecovery.status === 'complete' && crosses(upperRecovery, 0, 4, ([, y]) => y > 2.8) &&
      safe && leftRegion && follower.finished() && pointDistance(follower.position(), to) < 0.1 &&
      lower.status === 'complete' && lower.points.every(([, y]) => y < 0.25),
    'The current top-floor region becomes excluded for ordinary requests. Its occupant alone uses the one-time exit and cannot re-enter. The floor below stays usable. ' +
      JSON.stringify({ original: original.status, occupied, inbound: inbound.status, normalOutbound: normalOutbound.status,
        recovery: upperRecovery.status, safe, leftRegion, end: follower.position() }))
  })
}

export const regionalFilters: CatalogCase['run'] = (backend) => {
  const surfaces = [floor(0, 3, 0, 3), floor(6, 9, 0, 3), floor(11, 14, 0, 3)]
  const a: Point = [1, 0, 1]
  const b: Point = [8, 0, 1]
  const c: Point = [12, 0, 1]
  const cGoal: Point = [13, 0, 1]
  const link = { from: [2, 0, 1], to: [7, 0, 1] } satisfies AuthoredLink
  return withTaggedNavmesh(backend, surfaces, (x) => ({ flags: x < 4 ? WALK : x < 10 ? TAGGED : 4 }), (route, count) => {
    const modes: Policy[] = [{}, { exclude: 4 }, { include: WALK | TAGGED | LINK }, { exclude: TAGGED }]
    const reachB = modes.map((mode) => route(a, b, mode).status)
    const reachC = modes.map((mode) => route(c, cGoal, mode).status)
    return check(count >= 2 && reachB.join() === 'complete,complete,complete,unreachable' &&
      reachC.join() === 'complete,unreachable,unreachable,complete' &&
      route(a, c).status === 'unreachable' && route(a, [1.5, 0, 1], modes[3]).status === 'complete',
    'Ground polygons of B and C have distinct flags; the independent link is allowed when excluding C or including A/B, while excluding B prevents entry.')
  }, link)
}

function authoredLanes<T>(backend: TraversalBackend, shortLength: number, longLength: number,
  run: (query: (policy?: Policy) => Route, branch: (route: Route) => string, count: number, exposure: (route: Route) => number) => T,
  coverEndpoints = false
) {
  const endX = 1 + shortLength
  const z = 4
  const laneHalfWidth = 0.53
  const bypass = z + (longLength - shortLength) / 2 + 0.43
  const surfaces = [
    floor(0, 1.6, z - laneHalfWidth, bypass + laneHalfWidth),
    floor(endX - 0.6, endX + 1, z - laneHalfWidth, bypass + laneHalfWidth),
    floor(1.6, endX - 0.6, z - laneHalfWidth, z + laneHalfWidth),
    floor(1.6, endX - 0.6, bypass - laneHalfWidth, bypass + laneHalfWidth)
  ]
  const source: Point = [1, 0, z]
  const target: Point = [endX, 0, z]
  const difficult = (x: number, depth: number) => (coverEndpoints || (x >= 2 && x < endX - 0.3)) && depth < z + laneHalfWidth
  return withTaggedNavmesh(backend, surfaces,
    (x, depth) => difficult(x, depth)
      ? { flags: TAGGED | (x > 3 && x < endX - 2 ? SHORT_LANE_INTERIOR : 0), area: TERRAIN }
      : { flags: WALK },
    (query, count) => {
      const branch = (route: Route) => route.status !== 'complete' ? 'unreachable'
        : crosses(route, 0, endX / 2, (point) => point[2] > (z + bypass) / 2) ? 'long' : 'short'
      const exposure = (route: Route) => route.points.slice(1).reduce((length, b, i) => {
        const a = route.points[i]
        const x = (a[0] + b[0]) / 2
        const depth = (a[2] + b[2]) / 2
        return difficult(x, depth)
          ? length + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) : length
      }, 0)
      return run((policy) => query(source, target, policy), branch, count, exposure)
    })
}

// Compare legal candidates after the funnel, using the movement controller's cost model.
function cheapestRoute<T>(routes: readonly [T, T], cost: (route: T) => number) {
  const [first, alternate] = routes
  return cost(first) <= cost(alternate) ? first : alternate
}

export const slowTerrain: CatalogCase['run'] = (backend) =>
  authoredLanes(backend, 10, 16, (query, branch, count, exposure) => {
    const normal = query()
    const nativeWeighted = query({ terrainWeight: 2 })
    const forcedBypass = query({ exclude: SHORT_LANE_INTERIOR })
    const travelTime = (path: Route) => path.status === 'complete' ? pathLength(path) + exposure(path) : Infinity
    const cautious = cheapestRoute([normal, forcedBypass], travelTime)
    const short = pathLength(normal)
    const long = pathLength(forcedBypass)
    const shortTimeAtHalfSpeed = short + exposure(normal)
    const longTime = long + exposure(forcedBypass)
    return check(count > 0 && branch(normal) === 'short' && branch(cautious) === 'long' &&
      branch(forcedBypass) === 'long' && Math.abs(short - 10) < 0.12 && Math.abs(long - 16) < 0.85 &&
      Math.abs(pathLength(cautious) - long) < 0.25 && shortTimeAtHalfSpeed > longTime,
    'Two native routes on one tagged mesh, ranked by travel time at half speed. ' + JSON.stringify({
      lengthM: [short, long], timeAtNormalSpeed: short, timeAtHalfSpeedOnDifficultTerrain: [shortTimeAtHalfSpeed, longTime],
      observedBranches: [branch(normal), branch(cautious), branch(forcedBypass)], nativeWeightedBranch: branch(nativeWeighted),
      pathLengthAtHalfSpeed: pathLength(cautious)
    }))
  }, true)

export const hazardTerrain: CatalogCase['run'] = (backend) =>
  authoredLanes(backend, 8, 12, (query, branch, count, exposure) => {
    const neutral = query()
    const difficultDistance = exposure(neutral)
    if (difficultDistance <= 0) return check(false, 'No measured distance in the marked short lane.')
    let appliedPenalty: number | undefined
    let replans = 0
    let current = neutral
    function update(penaltyMeters: number) {
      if (appliedPenalty !== penaltyMeters) {
        appliedPenalty = penaltyMeters
        current = query({ terrainWeight: 1 + penaltyMeters / difficultDistance })
        replans++
      }
      return branch(current)
    }
    const selection = [0, 6, 6, 0].map((penalty) => update(penalty))
    const independent = query({ terrainWeight: 1 })
    const detour = query({ terrainWeight: 1 + 6 / difficultDistance })
    return check(count > 0 && selection.join() === 'short,long,long,short' && replans === 3 &&
      branch(independent) === 'short' && Math.abs(pathLength(neutral) - 8) < 0.12 &&
      Math.abs(pathLength(detour) - 12) < 0.8 && pathLength(neutral) + 6 > pathLength(detour),
    'Only the risk-sensitive profile replanned when the +6 m penalty changed. Both queries reused one labeled mesh; duplicate cost updates caused no replan: ' +
      JSON.stringify({ selection, replans, lengths: [pathLength(neutral), pathLength(detour)] }))
  })

export const avoidTerrain: CatalogCase['run'] = (backend) =>
  authoredLanes(backend, 8, 12, (query, branch, count) => {
    const excluded = query({ exclude: TAGGED })
    const allowed = query()
    return check(count > 0 && branch(excluded) === 'long' && branch(allowed) === 'short' && pathLength(allowed) < pathLength(excluded),
      'The same native heightfield and endpoints use the marked ground when enabled. Only its polygon flags force a walkable detour; no obstacle was added.')
  })

export const clearanceWeights: CatalogCase['run'] = (backend) => {
  const nearLength = 10
  const farLength = 12
  const endX = 1 + nearLength
  const depth = 4
  const shortHalf = 0.55
  const longHalf = 1.05
  const bypass = 6.24
  const start: Point = [1, 0, depth]
  const goal: Point = [endX, 0, depth]
  const faces = [
    floor(0, 1.65, depth - shortHalf, bypass + longHalf),
    floor(endX - 0.65, endX + 1, depth - shortHalf, bypass + longHalf),
    floor(1.65, endX - 0.65, depth - shortHalf, depth + shortHalf),
    floor(1.65, endX - 0.65, bypass - longHalf, bypass + longHalf)
  ]
  const walls = [depth - shortHalf, depth + shortHalf, bypass - longHalf, bypass + longHalf].map((z): GroundEdge =>
    [[2, 0, z], [endX - 1, 0, z]])
  const inShortLane = (z: number) => z < depth + shortHalf
  // Integrate the fraction of every smoothed segment in the measured short lane.
  // This oracle uses authored geometry rather than native search cost estimates.
  function lengthInShortLane(route: Route) {
    return route.points.slice(1).reduce((sum, b, i) => {
      const a = route.points[i]
      const from = inShortLane(a[2])
      const to = inShortLane(b[2])
      const boundary = from !== to ? (depth + shortHalf - a[2]) / (b[2] - a[2]) : 0
      const fraction = from && to ? 1 : from ? boundary : to ? 1 - boundary : 0
      return sum + fraction * pointDistance(a, b)
    }, 0)
  }
  return withTaggedNavmesh(backend, faces, (x, z) => inShortLane(z)
    ? { flags: TAGGED | (x > 3 && x < endX - 2 ? SHORT_LANE_INTERIOR : 0), area: TERRAIN }
    : { flags: WALK },
    (query, taggedCount, areaAt) => {
      function characterize(route: Route) {
        let selectedArea: number | undefined
        const crossed = crosses(route, 0, (start[0] + goal[0]) / 2, (point) => {
          selectedArea = areaAt(point)
          return true
        })
        return {
          length: pathLength(route), exposure: lengthInShortLane(route),
          nativeExposure: nativeTerrainLength(route, areaAt),
          clearance: groundClearance(route.points, walls),
          area: selectedArea, complete: route.status === 'complete' && crossed &&
            pointDistance(route.points[route.points.length - 1], goal) < 0.15
        }
      }
      const neutral = characterize(query(start, goal))
      const alternative = characterize(query(start, goal, { exclude: SHORT_LANE_INTERIOR }))
      const crossOver = (alternative.length - neutral.length) / (neutral.nativeExposure - alternative.nativeExposure)
      const penaltyCost = (route: typeof neutral, multiplier: number) =>
        route.complete ? route.length + (multiplier - 1) * route.nativeExposure : Infinity
      const lower = cheapestRoute([neutral, alternative], (route) => penaltyCost(route, 1 + Math.max(0, crossOver - 0.09)))
      const multiplier = 1 + crossOver + 0.16
      const nativeWeighted = characterize(query(start, goal, { terrainWeight: multiplier }))
      const cost = (route: typeof neutral) => penaltyCost(route, multiplier)
      const weighted = cheapestRoute([neutral, alternative], cost)
      return check(taggedCount > 0 && [neutral, alternative, lower, weighted].every(({ complete }) => complete) &&
        neutral.area === TERRAIN && lower.area === TERRAIN && alternative.area === 0 && weighted.area === 0 &&
        [neutral, alternative, lower, weighted].every(({ clearance }) => clearance > 0.13) &&
        Math.abs(neutral.length - nearLength) < 0.13 && Math.abs(alternative.length - farLength) < 0.45 &&
        Math.abs(neutral.length - neutral.nativeExposure) < 0.13 && alternative.nativeExposure < 2 &&
        crossOver > 0 && cost(neutral) > cost(alternative) && Math.abs(weighted.length - alternative.length) < 0.15,
      'Two native routes on one tagged mesh, ranked by measured exposure after smoothing. ' +
      JSON.stringify({ laneWidthsM: [2 * shortHalf, 2 * longHalf], neutral, alternative, lower, weighted, nativeWeighted, crossOver, multiplier,
        highPenaltyCost: { short: cost(neutral), long: cost(alternative), chosen: cost(weighted) } }))
    })
}

export const weightedGround: CatalogCase['run'] = (backend) => {
  const start: Point = [1, 0, 4]
  const goal: Point = [9, 0, 4]
  const lower = 3.45
  const edge = 4.55
  const farDepth = 7.1
  const faces = [floor(0, 2, lower, farDepth + 0.55), floor(8, 10, lower, farDepth + 0.55),
    floor(2, 8, lower, edge), floor(2, 8, farDepth - 0.55, farDepth + 0.55)]
  const expensive = (x: number, z: number) => x >= 2 && x < 8 && z <= edge
  function segmentCost(a: Point, b: Point, multiplier: number) {
    let enter = 0
    let leave = 1
    for (const [axis, min, max] of [[0, 2, 8], [2, lower, edge]] as const) {
      const delta = b[axis] - a[axis]
      if (!delta) {
        if (a[axis] < min || a[axis] > max) return pointDistance(a, b)
      } else {
        const first = (min - a[axis]) / delta
        const last = (max - a[axis]) / delta
        enter = Math.max(enter, Math.min(first, last))
        leave = Math.min(leave, Math.max(first, last))
      }
    }
    return pointDistance(a, b) * (1 + Math.max(0, leave - enter) * (multiplier - 1))
  }
  return withTaggedNavmesh(backend, faces, (x, z) => expensive(x, z) ? { flags: TAGGED, area: TERRAIN } : { flags: WALK },
    (query, labeled, areaAt) => {
      const neutral = query(start, goal)
      const weighted = query(start, goal, { terrainWeight: 3 })
      const measured = (path: Route) => path.points.slice(1).reduce((cost, next, i) => cost + segmentCost(path.points[i], next, 3), 0)
      const shortCost = measured(neutral)
      const longCost = measured(weighted)
      const sampledAreas = [nativeTerrainLength(neutral, areaAt), nativeTerrainLength(weighted, areaAt)]
      const inArea = (path: Route, expected: number) => crosses(path, 0, 5, (point) => areaAt(point) === expected)
      return check(labeled >= 3 && [neutral, weighted].every((r) => r.status === 'complete') &&
        inArea(neutral, TERRAIN) && inArea(weighted, 0) &&
        Math.abs(pathLength(neutral) - 8) < 0.06 && Math.abs(pathLength(weighted) - 12) < 0.35 &&
        Math.abs(sampledAreas[0] - 6) < 0.05 && sampledAreas[1] < 0.05 &&
        Math.abs(shortCost - 20) < 0.15 && Math.abs(shortCost - longCost - 8) < 0.35,
      'Native area IDs distinguish the 6 m ×3 and about 10 m ×1 branches. The independent segment integral includes the shared connector costs and measures the weighted difference. ' +
        JSON.stringify({ lengthsWithConnectors: [pathLength(neutral), pathLength(weighted)], costsWithConnectors: [shortCost, longCost], sampledAreas,
          costDifference: shortCost - longCost, chosenAreas: [inArea(neutral, TERRAIN), inArea(weighted, 0)] }))
    })
}
