import {
  addOffMeshConnection, addTile, buildTile, createDefaultQueryFilter, createFindNearestPolyResult,
  createSlicedNodePathQuery, DEFAULT_QUERY_FILTER, finalizeSlicedFindNodePath, findNearestPoly,
  findNodePath, findSmoothPath, FindNodePathResultFlags, FindSmoothPathResultFlags,
  findStraightPath, FindStraightPathOptions, getNodeByRef, getNodeByTileAndPoly,
  getTileAt, initSlicedFindNodePath, moveAlongSurface, NODE_FLAG_CLOSED, OffMeshConnectionDirection, raycast,
  raycastWithCosts, removeTile, SlicedFindNodePathStatusFlags, updateSlicedFindNodePath,
  type NavMesh
} from 'navcat'
import { Detour, NavMeshQuery, Raw, statusDetail } from 'recast-navigation'
import { generateTileCache } from 'recast-navigation/generators'
import type { Point } from '../../src/arena'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, toRecastGeometry } from '../../src/navigation'
import { bakeDetourMesh, createDetourNavigatorFromMesh } from '../../test/detour'
import { crosses, floor } from './ground'
import { CELL_SIZE, detourPoint, nativePoint, navcatTiles, usingNativeTiles } from './native-tiles'
import { check, unsupported, type CatalogCase } from './types'

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
  }, room, room)
}

const anyAngleCosts: CatalogCase['run'] = (backend) => {
  if (backend === 'detour') return unsupported('Pinned Detour JS bindings expose a cost-aware raycast but no sliced any-angle search.')
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
    const corridor = findNodePath(mesh, from.nodeRef, to.nodeRef, from.position, to.position, filter, { raycastDistance })
    const straight = findStraightPath(mesh, from.position, to.position, corridor.path, null, FindStraightPathOptions.ALL_CROSSINGS)
    const finalPoint = straight.path[straight.path.length - 1]?.position
    const terminal = corridor.nodes[to.nodeRef]?.find((node) => (node.flags & NODE_FLAG_CLOSED) !== 0)
    return {
      directCost: rawRay.pathCost,
      chosenCost: terminal?.cost ?? Infinity,
      reachesGoal: Boolean(corridor.flags & FindNodePathResultFlags.COMPLETE_PATH) && straight.success &&
        finalPoint !== undefined && Math.abs(finalPoint[0] - to.position[0]) < 0.05,
      outside: straight.path.some(({ position }) => position[2] < -1.95)
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
    '. Any-angle at equal and 20x cost: ' + JSON.stringify(cheap) + ' / ' + JSON.stringify(expensive) + '.')
}

const zeroPolygon: CatalogCase['run'] = (backend) => {
  if (backend === 'detour') return unsupported('Reference 0 denotes no polygon in Detour, so the navcat numeric-zero regression does not apply.')
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

const surfaceStopsAtGap: CatalogCase['run'] = (backend) => {
  const surfaces = [floor(0, 2, 0, 2), floor(2.8, 5, 0, 2)]
  const from: Point = [1.5, 0, 1]
  const to: Point = [3.4, 0, 1]
  const isLocal = (x: number) => x >= from[0] && x <= 2
  if (backend === 'navcat') {
    const mesh = bakeNavcatMesh(surfaces)
    addOffMeshConnection(mesh, {
      start: nativePoint(from), end: nativePoint(to), radius: 0.4,
      direction: OffMeshConnectionDirection.START_TO_END, flags: 1, area: 0
    })
    const start = nearest(mesh, from)
    const local = moveAlongSurface(mesh, start.nodeRef, start.position, nativePoint(to), DEFAULT_QUERY_FILTER)
    return check(start.success && local.success && isLocal(local.position[0]) && local.visited.length >= 1 &&
      createNavcatNavigatorFromMesh(mesh).route(from, to).status === 'complete',
    'Native local surface movement stops on the launch deck. An authored off-mesh action has a complete route across the gap.')
  }
  const mesh = bakeDetourMesh(surfaces, undefined, [{
    startPosition: detourPoint(from), endPosition: detourPoint(to), radius: 0.4, bidirectional: false
  }])
  const navigator = createDetourNavigatorFromMesh(mesh)
  const query = new NavMeshQuery(mesh)
  try {
    const start = query.findNearestPoly(detourPoint(from))
    const local = query.moveAlongSurface(start.nearestRef, start.nearestPoint, detourPoint(to))
    return check(start.success && local.success && isLocal(local.resultPosition.x) && local.visited.length >= 1 &&
      navigator.route(from, to).status === 'complete',
    'Native local surface movement stops on the launch deck. An authored off-mesh action has a complete route across the gap.')
  } finally {
    Raw.destroy(query.defaultFilter.raw)
    query.destroy()
    navigator.dispose()
  }
}

const obstacleQueue: CatalogCase['run'] = (backend) => {
  if (backend === 'navcat') return unsupported('Navcat has no Detour TileCache obstacle request queue or fixed cap of 64.')
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
  if (positionState() !== 'complete' || !fixture.evict()) return check(false, 'Could not evict the centre tile.')
  const partial = fixture.path(start, goal)
  const pending = positionState() === 'pending' && partial.refs.length > 0 && !partial.complete &&
    partial.refs.every(fixture.valid) && fixture.navigator.route(start, goal).status === 'unreachable'
  fixture.refill('changed')
  const knownBlocked = positionState() === 'blocked'
  if (!fixture.evict()) return check(false, 'Could not remove the known blocked tile.')
  fixture.refill('original')
  const resumed = positionState() === 'complete'
  if (!fixture.evict()) return check(false, 'Could not invalidate the loaded path a second time.')
  const stopped = positionState() === 'pending' && !fixture.path(start, goal).complete
  return check(pending && knownBlocked && resumed && stopped,
    'A missing native tile exposes a usable partial prefix and pending state. A loaded disconnected tile is blocked, reopening completes, and eviction stops the path again.')
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
  { id: 'E12', layer: 'integration', coverage: 'adapted', run: importResolution },
  { id: 'E14', layer: 'planner', run: anyAngleCosts },
  { id: 'E15', layer: 'planner', run: zeroPolygon },
  { id: 'E19', layer: 'planner', coverage: 'adapted', run: surfaceStopsAtGap },
  { id: 'E23', layer: 'integration', run: obstacleQueue },
  { id: 'E24', layer: 'integration', run: replaceCorridor },
  { id: 'GAME-21', layer: 'integration', coverage: 'adapted', run: streamedFrontier },
  { id: 'GAME-29', layer: 'integration', run: evictAndReturn }
]
