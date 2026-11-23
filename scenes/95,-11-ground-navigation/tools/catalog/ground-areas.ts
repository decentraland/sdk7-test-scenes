import { addOffMeshConnection, createDefaultQueryFilter, getNodeByRef, getNodeByTileAndPoly, OffMeshConnectionDirection } from 'navcat'
import { statusSucceed } from 'recast-navigation'
import type { Point, Surface } from '../../src/arena'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, type Route } from '../../src/navigation'
import { bakeDetourMesh, createDetourNavigatorFromMesh } from '../../test/detour'
import type { AuthoredLink, TraversalBackend } from '../sdk-detour-probe/traversal-routing'
import { crosses, floor, pathLength } from './ground'
import { detourPoint, detourTiles, nativePoint, navcatTiles } from './native-tiles'
import { check, type CatalogCase } from './types'

const WALK = 1
const TAGGED = 2
const LINK = 8
const TERRAIN = 3

type PolyTag = { flags: number; area?: number }
type Policy = { include?: number; exclude?: number; terrainWeight?: number }
type Query = (start: Point, goal: Point, policy?: Policy) => Route

function withTaggedNavmesh<T>(
  backend: TraversalBackend, floors: readonly Surface[], tag: (x: number, z: number) => PolyTag,
  run: (query: Query, tagged: number) => T, link?: AuthoredLink
) {
  let tagged = 0
  if (backend === 'navcat') {
    const mesh = link ? bakeNavcatMesh(floors) : navcatTiles(floors, 0.18)
    for (const tile of Object.values(mesh.tiles)) {
      tile.polys.forEach((poly, index) => {
        const centroid = (axis: number) => poly.vertices.reduce((sum, vertex) => sum + tile.vertices[3 * vertex + axis], 0) / poly.vertices.length
        const { flags, area = 0 } = tag(centroid(0), -centroid(2))
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
    return run((from, to, policy = {}) => {
      filter.includeFlags = policy.include ?? 0xffff
      filter.excludeFlags = policy.exclude ?? 0
      weight = policy.terrainWeight ?? 1
      return navigator.route(from, to)
    }, tagged)
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
        const { flags, area = 0 } = tag(centroid(0), -centroid(2))
        const ref = base + index
        if (!statusSucceed(mesh.setPolyFlags(ref, flags)) || !statusSucceed(mesh.setPolyArea(ref, area))) {
          throw new Error('Could not set native Detour ground polygon labels.')
        }
        if (flags !== WALK || area !== 0) tagged++
      }
    }
    return run((from, to, policy = {}) => {
      configure(policy)
      return navigator.route(from, to)
    }, tagged)
  } finally {
    navigator.dispose()
  }
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
    (x, depth) => difficult(x, depth) ? { flags: TAGGED, area: TERRAIN } : { flags: WALK },
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

export const slowTerrain: CatalogCase['run'] = (backend) =>
  authoredLanes(backend, 10, 16, (query, branch, count, exposure) => {
    const normal = query()
    const cautious = query({ terrainWeight: 2 })
    const forcedBypass = query({ terrainWeight: 3 })
    const short = pathLength(normal)
    const long = pathLength(forcedBypass)
    const shortTimeAtHalfSpeed = short + exposure(normal)
    const longTime = long + exposure(forcedBypass)
    return check(count > 0 && branch(normal) === 'short' && branch(cautious) === 'long' &&
      branch(forcedBypass) === 'long' && Math.abs(short - 10) < 0.12 && Math.abs(long - 16) < 0.85 &&
      Math.abs(pathLength(cautious) - long) < 0.25 && shortTimeAtHalfSpeed > longTime,
    'Same ground geometry and native area labels. ' + JSON.stringify({
      lengthM: [short, long], timeAtNormalSpeed: short, timeAtHalfSpeedOnDifficultTerrain: [shortTimeAtHalfSpeed, longTime],
      observedBranches: [branch(normal), branch(cautious), branch(forcedBypass)], pathLengthAtHalfSpeed: pathLength(cautious)
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
