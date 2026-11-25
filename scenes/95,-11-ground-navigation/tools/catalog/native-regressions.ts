import {
  addOffMeshConnection, addTile, buildTile, createDefaultQueryFilter, createFindNearestPolyResult,
  createGetClosestPointOnPolyResult,
  createSlicedNodePathQuery, DEFAULT_QUERY_FILTER, finalizeSlicedFindNodePath, findNearestPoly,
  findNodePath, findSmoothPath, FindNodePathResultFlags, FindSmoothPathResultFlags,
  findStraightPath, FindStraightPathOptions, getClosestPointOnPoly, getNodeByRef, getNodeByTileAndPoly,
  getTileAt, initSlicedFindNodePath, INVALID_NODE_REF, moveAlongSurface, OffMeshConnectionDirection, raycast,
  raycastWithCosts, removeTile, SlicedFindNodePathStatusFlags, updateSlicedFindNodePath,
  type NavMesh
} from 'navcat'
import { Detour, NavMeshQuery, Raw, statusDetail } from 'recast-navigation'
import { generateTileCache } from 'recast-navigation/generators'
import type { Point } from '../../src/arena'
import { findNavcatPathWithShortcut } from '../../src/navigation-any-angle'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, toRecastGeometry, type Route } from '../../src/navigation'
import { bakeDetourMesh, createDetourNavigatorFromMesh } from '../../test/detour'
import { crosses, floor } from './ground'
import { detourAnyAngleCosts } from './detour-any-angle'
import { degenerateDetails } from './ground-detail'
import { groundFollower, pointDistance } from './ground-motion'
import { CELL_SIZE, detourPoint, detourTiles, nativePoint, navcatTiles, TILE_EDGE, usingNativeTiles } from './native-tiles'
import { obstacleBackpressure } from './obstacle-backpressure'
import { check, notApplicable, type CatalogCase } from './types'

const nearest = (mesh: NavMesh, point: Point) =>
  findNearestPoly(createFindNearestPolyResult(), mesh, nativePoint(point), [0.3, 0.3, 0.3], DEFAULT_QUERY_FILTER)

const importResolution: CatalogCase['run'] = (backend) => {
  const room = [
    floor(0, 1.75, 0, 1.8), floor(1.75, 2.25, 0.56, 1.24), floor(2.25, 6, 0, 1.8)
  ]
  return usingNativeTiles(backend, (fixture) => {
    const openAt = (runtimeCell: number) => Math.abs(runtimeCell - fixture.cellSize) > 1e-6
      ? undefined : fixture.navigator.route([1, 0, 0.9], [5, 0, 0.9])
    const incompatible = openAt(0.1)
    const restored = openAt(CELL_SIZE)
    return check(incompatible === undefined && restored?.status === 'complete' &&
      crosses(restored, 0, 2, ([, , z]) => z > 0.56 && z < 1.24),
    'SDK import guard rejects incompatible voxel size using the native tile metadata, then routes through the only door when restored.')
  }, room, room, { roundTrip: true })
}

const persistedLink: CatalogCase['run'] = (backend) => {
  const from: Point = [1, 0, 0.9]
  const to: Point = [5, 0, 0.9]
  const links = [{ from: [2.5, 0, 0.9] as Point, to: [4.5, 0, 0.9] as Point }]
  const right = floor(4, 6, 0, 1.8)
  const open = [floor(0, 3, 0, 1.8), right]
  const revised = [floor(0, 2.25, 0, 1.8), floor(2.25, 2.75, 0.45, 1.8), floor(2.75, 3, 0, 1.8), right]
  const direction = (nav: { navigator: ReturnType<typeof createNavcatNavigatorFromMesh> }) => {
    const through = nav.navigator.route(from, to)
    return through.status === 'complete' && crosses(through, 0, 3.5, ([, , z]) => Math.abs(z - 0.9) < 0.2) &&
      nav.navigator.route(to, from).status === 'unreachable'
  }
  const initial = usingNativeTiles(backend, direction, open, revised, { links })
  return usingNativeTiles(backend, (fixture) => {
    const loaded = direction(fixture)
    const evicted = fixture.evict() && fixture.navigator.route(from, to).status === 'unreachable'
    fixture.refill('changed')
    const rebuilt = direction(fixture)
    return check(initial && loaded && evicted && rebuilt,
      'The serialized one-way link survives a fresh runtime and replacement of its source tile. ' +
      JSON.stringify({ initial, loaded, evicted, rebuilt }))
  }, open, revised, { links, roundTrip: true })
}

const anyAngleCosts: CatalogCase['run'] = (backend) => {
  if (backend === 'detour') return detourAnyAngleCosts()
  const mesh = navcatTiles([floor(0, 12, 0, 6)])
  for (const tile of Object.values(mesh.tiles)) {
    if (tile.tileY !== 2 || (tile.tileX !== 2 && tile.tileX !== 3)) continue
    tile.polys.forEach((poly, i) => {
      poly.area = 2
      getNodeByTileAndPoly(mesh, tile, i).area = 2
    })
  }
  const from = nearest(mesh, [1, 0, 1])
  const to = nearest(mesh, [11, 0, 1])
  function query(areaCost: number, raycastDistance: number) {
    const filter = createDefaultQueryFilter()
    const distance = filter.getCost
    filter.getCost = (a, b, nav, previous, current, next) =>
      distance(a, b, nav, previous, current, next) * (getNodeByRef(nav, current).area === 2 ? areaCost : 1)
    const rawRay = raycastWithCosts(mesh, from.nodeRef, from.position, to.position, filter, from.nodeRef)
    const route = findNavcatPathWithShortcut(mesh, from, to, filter, raycastDistance)
    const upstream = raycastDistance > 0
      ? findNodePath(mesh, from.nodeRef, to.nodeRef, from.position, to.position, filter, { raycastDistance })
      : undefined
    const upstreamStraight = upstream &&
      findStraightPath(mesh, from.position, to.position, upstream.path, null, FindStraightPathOptions.ALL_CROSSINGS)
    const upstreamPath = upstreamStraight?.path ?? []
    const upstreamEnd = upstreamPath[upstreamPath.length - 1]?.position
    return {
      directCost: rawRay.pathCost,
      chosenCost: route?.cost ?? Infinity,
      reachesGoal: route !== undefined,
      outside: route?.path.some(({ position }) => position[2] < -1.95) ?? false,
      upstreamAnyAngleReachesGoal: upstream && Boolean(upstreamStraight?.success && upstreamEnd &&
        Math.hypot(...upstreamEnd.map((value, axis) => value - to.position[axis])) < 1e-4)
    }
  }
  const cheap = query(1, 30)
  const expensive = query(20, 30)
  const control = query(20, 0)
  return check(from.success && to.success && control.reachesGoal && control.outside && cheap.reachesGoal &&
    !cheap.outside && expensive.reachesGoal && expensive.outside &&
    Math.abs(cheap.directCost - 10) < 0.15 && expensive.directCost > 70 &&
    expensive.chosenCost <= control.chosenCost + 0.5,
  'Standard search at 20x: ' + JSON.stringify(control) +
    '. Complete ray corridor versus ordinary A* at equal and 20x cost: ' + JSON.stringify(cheap) + ' / ' + JSON.stringify(expensive) + '.')
}

const zeroPolygon: CatalogCase['run'] = (backend) => {
  if (backend === 'detour') return notApplicable('Reference 0 denotes no polygon in Detour. Invalid and stale references are checked in Недействительная ссылка после замены тайла.')
  const mesh = navcatTiles([floor(0, 6, 0, 1.8)])
  const from: Point = [1, 0, 0.9]
  const to: Point = [5, 0, 0.9]
  const query = () => {
    const start = nearest(mesh, from)
    const goal = nearest(mesh, to)
    const sight = raycast(mesh, start.nodeRef, start.position, goal.position, DEFAULT_QUERY_FILTER)
    const sliced = createSlicedNodePathQuery()
    initSlicedFindNodePath(mesh, sliced, start.nodeRef, goal.nodeRef, start.position, goal.position, DEFAULT_QUERY_FILTER)
    for (let i = 0; i < 30 && sliced.status === SlicedFindNodePathStatusFlags.IN_PROGRESS; i++) {
      updateSlicedFindNodePath(mesh, sliced, 1)
    }
    const route = finalizeSlicedFindNodePath(mesh, sliced)
    const smooth = findSmoothPath(mesh, start.position, goal.position, [0.3, 0.3, 0.3], DEFAULT_QUERY_FILTER,
      { stepSize: 0.25, slop: 0.02, maxPoints: 100 })
    const last = smooth.path[smooth.path.length - 1]?.position
    return {
      ref: start.nodeRef,
      count: route.pathCount,
      clear: start.success && goal.success && sight.t > 1 && sight.path[0] === start.nodeRef &&
        route.path[0] === start.nodeRef && route.path[route.path.length - 1] === goal.nodeRef &&
        Boolean(smooth.flags & FindSmoothPathResultFlags.COMPLETE_PATH) && smooth.startNodeRef === start.nodeRef &&
        last !== undefined && Math.abs(last[0] - to[0]) < 0.05
    }
  }
  const zero = query()
  const old = getTileAt(mesh, 0, 0, 0)
  if (!old) return check(false, 'Could not capture the zero-reference tile.')
  const copy = JSON.parse(JSON.stringify(old)) as typeof old
  removeTile(mesh, 0, 0, 0)
  addTile(mesh, buildTile(copy))
  const nonzero = query()
  return check(zero.ref === 0 && nonzero.ref !== 0 && zero.clear && nonzero.clear && zero.count === nonzero.count,
    'Raycast, one-iteration sliced search and smooth path agree before and after re-inserting the node that originally had reference zero.')
}

const invalidPolyRef: CatalogCase['run'] = (backend) => usingNativeTiles(backend, (fixture) => {
  const start: Point = [1, 0, 0.9]
  const goal: Point = [5, 0, 0.9]
  const invalid = backend === 'detour' ? 0 : INVALID_NODE_REF
  const before = fixture.path(start, goal)
  const oldRef = fixture.middleRef(before.refs)
  const noStart = fixture.path([100, 0, 100], goal)
  if (oldRef === undefined || !before.complete || !fixture.valid(oldRef) || !fixture.evict()) {
    return check(false, 'The test requires a complete corridor and a removable live middle polygon.')
  }
  const staleWhileEvicted = !fixture.valid(oldRef) && !fixture.path(start, goal).complete
  fixture.refill('original')
  const after = fixture.path(start, goal)
  const newRef = fixture.middleRef(after.refs)
  return check(!fixture.valid(invalid) && noStart.refs.length === 0 && !noStart.complete &&
    staleWhileEvicted && !fixture.valid(oldRef) && newRef !== undefined && newRef !== oldRef &&
    fixture.valid(newRef) && after.complete,
  'Native invalid-ref sentinel and missing projection are rejected. The replaced tile invalidates its old ref and the fresh corridor succeeds.')
})

const pathStatuses: CatalogCase['run'] = (backend) => {
  const from: Point = [1, 0, 1]
  const to: Point = [27, 0, 1]
  const chain = Array.from({ length: 12 }, (_, i) => floor(i * 2, i * 2 + 2, 0, 2))
  const faces = (connected: boolean) => [...chain, floor(connected ? 24 : 25, 28, 0, 2)]
  const atGoal = (x: number) => Math.abs(x - to[0]) < 0.05
  const beforeGap = (x: number) => x > 23 && x <= 24
  if (backend === 'navcat') {
    const matched = [true, false].every((connected) => {
      const mesh = navcatTiles(faces(connected))
      const start = nearest(mesh, from)
      const end = nearest(mesh, to)
      if (!start.success || !end.success) return false
      const route = findNodePath(mesh, start.nodeRef, end.nodeRef, start.position, end.position, DEFAULT_QUERY_FILTER)
      const last = route.path[route.path.length - 1]
      if (!route.success || last === undefined) return false
      const target = getClosestPointOnPoly(createGetClosestPointOnPolyResult(), mesh, last, end.position)
      const straight = findStraightPath(mesh, start.position, target.position, route.path, null, FindStraightPathOptions.ALL_CROSSINGS)
      const final = straight.path[straight.path.length - 1]?.position[0]
      const adapter = createNavcatNavigatorFromMesh(mesh).route(from, to)
      return target.success && straight.success && final !== undefined && (connected
        ? Boolean(route.flags & FindNodePathResultFlags.COMPLETE_PATH) && last === end.nodeRef && atGoal(final) && adapter.status === 'complete'
        : Boolean(route.flags & FindNodePathResultFlags.PARTIAL_PATH) && last !== end.nodeRef && beforeGap(final) &&
          adapter.status === 'unreachable' && adapter.points.length === 0)
    })
    return check(matched, 'Native complete and partial flags match the corridor endpoint. Navcat exposes no node-pool limit.')
  }
  function query(connected: boolean, maxNodes?: number, maxPathPolys?: number) {
    const mesh = detourTiles(faces(connected))
    const native = new NavMeshQuery(mesh, { maxNodes })
    const navigator = createDetourNavigatorFromMesh(mesh, undefined, { maxNodes, maxPathPolys })
    try {
      const start = native.findNearestPoly(detourPoint(from))
      const end = native.findNearestPoly(detourPoint(to))
      if (!start.success || !end.success || !start.nearestRef || !end.nearestRef) throw new Error('Missing native endpoints.')
      const route = native.findPath(start.nearestRef, end.nearestRef, start.nearestPoint, end.nearestPoint, { maxPathPolys })
      try {
        if (!route.success || !route.polys.size) throw new Error('Missing native corridor.')
        const last = route.polys.get(route.polys.size - 1)
        const target = native.closestPointOnPoly(last, end.nearestPoint)
        if (!target.success) throw new Error('Could not project onto the last polygon.')
        const straight = native.findStraightPath(start.nearestPoint, target.closestPoint, route.polys)
        try {
          if (!straight.success || !straight.straightPathCount) throw new Error('Missing native straight path.')
          return {
            final: straight.straightPath.get((straight.straightPathCount - 1) * 3),
            reached: last === end.nearestRef,
            partial: statusDetail(route.status, Detour.DT_PARTIAL_RESULT),
            exhausted: statusDetail(route.status, Detour.DT_OUT_OF_NODES),
            truncated: statusDetail(route.status, Detour.DT_BUFFER_TOO_SMALL),
            adapter: navigator.route(from, to).status,
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
      Raw.destroy(native.defaultFilter.raw)
      native.destroy()
      navigator.dispose()
    }
  }
  const full = query(true)
  const partial = query(false)
  const limited = query(true, 8)
  const truncated = query(true, undefined, 2)
  return check(full.reached && atGoal(full.final) && full.adapter === 'complete' &&
    partial.partial && !partial.exhausted && !partial.reached && beforeGap(partial.final) && partial.adapter === 'unreachable' &&
    limited.exhausted && !limited.reached && limited.final < 23 && limited.adapter === 'unreachable' &&
    truncated.truncated && !truncated.reached && truncated.final < 23 && truncated.adapter === 'unreachable',
  'Native Detour flags and endpoints distinguish complete, disconnected, node-pool exhaustion and polygon-buffer truncation. ' +
    JSON.stringify({ full, partial, limited, truncated }))
}

const surfaceStopsAtGap: CatalogCase['run'] = (backend) => {
  const surfaces = [floor(0, 2, 0, 2), floor(2.8, 5, 0, 2)]
  const from: Point = [1.5, 0, 1]
  const to: Point = [3.4, 0, 1]
  const observe = (local: Point, visited: number, success: boolean, path: Route) => {
    // Only an explicit action may leave the launch deck. Use the native local
    // movement result as the start of the fixed-step ballistic traversal.
    const clamped = success && visited > 0 && local[0] >= from[0] && local[0] <= 2
    const actionAvailable = path.status === 'complete' && crosses(path, 0, 2.4, ([, , z]) => Math.abs(z - 1) < 0.1)
    if (!clamped || !actionAvailable) return check(false, 'Local movement or the requested crossing action is invalid.')
    const ticks = 48
    const dt = 1 / 60
    const duration = ticks * dt
    const speed = (to[0] - local[0]) / duration
    const radius = 0.2
    let crossedAirborne = 0
    let clearance = Infinity
    let position: Point = [local[0], 0, local[2]]
    for (let tick = 1; tick <= ticks; tick++) {
      const t = tick * dt
      const next: Point = [local[0] + speed * t, 4 * t - 5 * t * t, local[2]]
      if (position[0] < 2.8 && next[0] > 2) {
        clearance = Math.min(clearance, position[1], next[1])
        crossedAirborne++
      }
      position = next
    }
    const landed = position[0] - radius >= 2.8 && position[0] + radius <= 5 &&
      Math.abs(position[0] - to[0]) < 0.01 && Math.abs(position[1]) < 1e-6 && position[2] >= radius && position[2] <= 2 - radius
    return check(crossedAirborne > 0 && clearance > 0.02 && landed,
      'Native walk remains on the launch deck. The separately authorized fixed-step action clears the gap and lands on the far deck: ' +
      JSON.stringify({ local, crossedAirborne, clearance, landed }))
  }
  if (backend === 'navcat') {
    const mesh = bakeNavcatMesh(surfaces)
    addOffMeshConnection(mesh, {
      start: nativePoint(from), end: nativePoint(to), radius: 0.4,
      direction: OffMeshConnectionDirection.START_TO_END, flags: 1, area: 0
    })
    const start = nearest(mesh, from)
    const local = moveAlongSurface(mesh, start.nodeRef, start.position, nativePoint(to), DEFAULT_QUERY_FILTER)
    return observe(nativePoint(local.position), local.visited.length, start.success && local.success,
      createNavcatNavigatorFromMesh(mesh).route(from, to))
  }
  const mesh = bakeDetourMesh(surfaces, undefined, [{
    startPosition: detourPoint(from), endPosition: detourPoint(to), radius: 0.4, bidirectional: false
  }])
  const navigator = createDetourNavigatorFromMesh(mesh)
  const query = new NavMeshQuery(mesh)
  try {
    const start = query.findNearestPoly(detourPoint(from))
    const local = query.moveAlongSurface(start.nearestRef, start.nearestPoint, detourPoint(to))
    const { x, y, z } = local.resultPosition
    return observe([x, y, -z], local.visited.length, start.success && local.success, navigator.route(from, to))
  } finally {
    Raw.destroy(query.defaultFilter.raw)
    query.destroy()
    navigator.dispose()
  }
}

function nativeDetourObstacleQueue() {
  const geometry = toRecastGeometry([floor(0, 20, 0, 20)])
  const obstaclePositions = Array.from({ length: 65 }, (_, i) =>
    ({ x: 1 + i % 8 * 2, y: 0, z: -1 - Math.floor(i / 8) * 2 }))
  function simulate(burst: boolean) {
    const generated = generateTileCache(geometry.positions, geometry.indices, {
      cs: CELL_SIZE, ch: CELL_SIZE, tileSize: 40, walkableHeight: 28, walkableRadius: 3, walkableClimb: 2,
      expectedLayersPerTile: 1, maxObstacles: 128
    })
    if (!generated.success) throw new Error(generated.error)
    const { navMesh, tileCache } = generated
    const navigator = createDetourNavigatorFromMesh(navMesh)
    const query = new NavMeshQuery(navMesh)
    const hole = (point: typeof obstaclePositions[number]) =>
      query.findNearestPoly(point, { halfExtents: { x: 0.1, y: 0.3, z: 0.1 } }).nearestRef === 0
    function drain() {
      for (let i = 0; i < 180; i++) {
        const update = tileCache.update(navMesh)
        if (!update.success) throw new Error('TileCache update failed.')
        if (update.upToDate) return
      }
      throw new Error('TileCache did not finish updating.')
    }
    try {
      const clear = obstaclePositions.every((point) => !hole(point))
      const skipped: typeof obstaclePositions = []
      let overflowAt = -1
      obstaclePositions.forEach((point, i) => {
        const added = tileCache.addCylinderObstacle(point, 0.45, 2)
        if (!added.success) {
          if (!statusDetail(added.status, Detour.DT_BUFFER_TOO_SMALL)) {
            throw new Error('Unexpected TileCache failure at request ' + (i + 1) + ' with status ' + added.status + '.')
          }
          overflowAt = i
          skipped.push(point)
        }
        if (!burst && (i + 1) % 8 === 0) drain()
      })
      drain()
      const preRetryCount = obstaclePositions.filter(hole).length
      for (const point of skipped) {
        if (!tileCache.addCylinderObstacle(point, 0.45, 2).success) throw new Error('Retry did not enqueue.')
      }
      drain()
      return {
        clear, overflowAt, preRetryCount, final: obstaclePositions.map(hole),
        through: navigator.route([0.5, 0, 0.5], [18.5, 0, 18.5]).status
      }
    } finally {
      Raw.destroy(query.defaultFilter.raw)
      query.destroy()
      tileCache.destroy()
      navigator.dispose()
    }
  }
  const burst = simulate(true)
  const batches = simulate(false)
  return check(burst.clear && batches.clear && burst.overflowAt === 64 && batches.overflowAt === -1 &&
    burst.preRetryCount === 64 && batches.preRetryCount === 65 && burst.final.every(Boolean) && batches.final.every(Boolean) &&
    burst.through === 'complete' && batches.through === burst.through,
  'Native TileCache rejected the 65th request. After draining and retry, all centres were blocked and a long path matched the 8-request batching control.')
}

const obstacleQueue: CatalogCase['run'] = (backend) => {
  const shared = obstacleBackpressure(backend)
  if (backend === 'navcat') return shared
  const native = nativeDetourObstacleQueue()
  return check(shared.status === 'pass' && native.status === 'pass', shared.detail + ' ' + native.detail)
}

const start: Point = [1, 0, 0.9]
const goal: Point = [5, 0, 0.9]

const replaceCorridor: CatalogCase['run'] = (backend) => usingNativeTiles(backend, (fixture) => {
  const initial = fixture.path(start, goal)
  const before = fixture.navigator.route(start, goal)
  const oldRef = fixture.middleRef(initial.refs)
  if (oldRef === undefined || !initial.complete || !fixture.valid(oldRef) || !fixture.evict()) {
    return check(false, 'Did not capture and evict the current centre corridor.')
  }
  const invalidWhileEvicted = !fixture.valid(oldRef) && !fixture.path(start, goal).complete
  fixture.refill('changed')
  const route = fixture.navigator.route(start, goal)
  const newCorridor = fixture.path(start, goal)
  return check(before.status === 'complete' && crosses(before, 0, 3, ([, , z]) => z < 1) &&
    invalidWhileEvicted && fixture.loaded() && !fixture.valid(oldRef) && newCorridor.complete &&
    newCorridor.refs.every(fixture.valid) && crosses(route, 0, 3, ([, , z]) => z > 1.12),
  'Saved centre reference expires after eviction. Replacing the same native tile with a cut in its floor forces the new corridor through the bypass.')
})

const streamedFrontier: CatalogCase['run'] = (backend) => usingNativeTiles(backend, (fixture) => {
  type State = 'complete' | 'pending' | 'blocked'
  const positionState = (): State => {
    if (!fixture.loaded()) return 'pending'
    return fixture.path(start, goal).complete ? 'complete' : 'blocked'
  }
  const outbound = fixture.navigator.route(start, goal)
  const traveler = groundFollower(start)
  traveler.assign(outbound.points)
  traveler.step(0.23, () => true)
  if (positionState() !== 'complete' || !fixture.evict()) return check(false, 'Could not evict the centre tile.')
  const partial = fixture.path(start, goal)
  const pending = positionState() === 'pending' && partial.refs.length > 0 && !partial.complete &&
    partial.refs.every(fixture.valid) && fixture.navigator.route(start, goal).status === 'unreachable'
  const beforeFrontier = 12
  for (let tick = 0; tick < beforeFrontier; tick++) traveler.step(0.1, (_, next) => next[0] + 0.18 <= TILE_EDGE)
  const held = traveler.position()
  const approachedButStopped = !traveler.finished() && held[0] > TILE_EDGE - 0.3 && held[0] + 0.18 <= TILE_EDGE
  fixture.refill('changed')
  const knownBlocked = positionState() === 'blocked' && fixture.navigator.route(held, goal).status === 'unreachable'
  if (!fixture.evict()) return check(false, 'Could not remove the known blocked tile.')
  fixture.refill('original')
  const recovered = fixture.navigator.route(held, goal)
  traveler.assign(recovered.points)
  for (let tick = 0; tick < 60 && !traveler.finished(); tick++) traveler.step(0.1, () => true)
  const resumed = recovered.status === 'complete' && traveler.finished() && pointDistance(traveler.position(), goal) < 0.1

  const returnPath = fixture.navigator.route(traveler.position(), start)
  traveler.assign(returnPath.points)
  traveler.step(0.28, () => true)
  if (!fixture.evict()) return check(false, 'Could not invalidate the loaded path a second time.')
  for (let tick = 0; tick < 15; tick++) traveler.step(0.1, (_, next) => next[0] - 0.18 >= TILE_EDGE * 2)
  const stopped = returnPath.status === 'complete' && positionState() === 'pending' && !traveler.finished() &&
    traveler.position()[0] - 0.18 >= TILE_EDGE * 2 && traveler.position()[0] < TILE_EDGE * 2 + 0.3 &&
    fixture.navigator.route(traveler.position(), start).status === 'unreachable'
  return check(pending && approachedButStopped && knownBlocked && resumed && stopped,
    'The follower stops before the unloaded footprint, distinguishes unknown from loaded-blocked, replans from the held pose on load, and stops safely after mid-route removal.')
}, undefined, [floor(0, 2.75, 0, 1.8), floor(3.25, 6, 0, 1.8)])

const evictAndReturn: CatalogCase['run'] = (backend) => usingNativeTiles(backend, (fixture) => {
  const corridor = fixture.path(start, goal)
  const old = fixture.middleRef(corridor.refs)
  if (!corridor.complete || old === undefined || !fixture.valid(old)) return check(false, 'Could not save a live native tile reference.')
  let centre = 3
  const tileCentre = 3
  const radius = 2
  const update = () => {
    const shouldLoad = Math.abs(centre - tileCentre) <= radius
    if (shouldLoad && !fixture.loaded()) fixture.refill('original')
    else if (!shouldLoad && fixture.loaded()) fixture.evict()
  }
  centre = 7
  update()
  const outOfRange = !fixture.loaded() && !fixture.valid(old) && !fixture.path(start, goal).complete
  centre = 3
  update()
  const loaded = fixture.path(start, goal)
  return check(outOfRange && fixture.loaded() && loaded.complete && !fixture.valid(old) &&
    fixture.middleRef(loaded.refs) !== old,
  'Leaving the streaming radius removes the native tile from lookup and route search. Returning recreates the route with a fresh reference.')
})

export const nativeRegressionCases: CatalogCase[] = [
  { id: 'E10', layer: 'planner', run: degenerateDetails },
  { id: 'E12', layer: 'integration', run: importResolution },
  { id: 'E14', layer: 'planner', run: anyAngleCosts },
  { id: 'E15', layer: 'planner', run: zeroPolygon },
  { id: 'E15B', layer: 'planner', run: invalidPolyRef },
  { id: 'E16', layer: 'planner', run: pathStatuses },
  { id: 'E19', layer: 'integration', run: surfaceStopsAtGap },
  { id: 'E21', layer: 'integration', run: persistedLink },
  { id: 'E23', layer: 'integration', run: obstacleQueue },
  { id: 'E24', layer: 'integration', run: replaceCorridor },
  { id: 'GAME-21', layer: 'integration', run: streamedFrontier },
  { id: 'GAME-29', layer: 'integration', run: evictAndReturn }
]
