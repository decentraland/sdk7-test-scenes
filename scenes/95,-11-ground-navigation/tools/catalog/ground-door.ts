import {
  addTile, BuildContext, buildCompactHeightfield, buildContours, buildDistanceField, buildPolyMesh,
  buildPolyMeshDetail, buildRegions, buildTile, ContourBuildFlags, erodeWalkableArea, getTileAt,
  markBoxArea, NULL_AREA, polyMeshDetailToTileDetailMesh, polyMeshToTilePolys, removeTile, WALKABLE_AREA
} from 'navcat'
import type { BoxObstacle } from 'recast-navigation'
import { generateTileCache } from 'recast-navigation/generators'
import type { Point } from '../../src/arena'
import { createNavcatNavigatorFromMesh, toRecastGeometry, type Navigator, type Route } from '../../src/navigation'
import { createDetourNavigatorFromMesh } from '../../test/detour'
import { createTraversalNavigator, type AuthoredLink } from '../sdk-detour-probe/traversal-routing'
import { crosses, floor, pathLength } from './ground'
import { groundClearance, groundFollower, pointDistance, rectangleEdges } from './ground-motion'
import { bakeNavcatTiles, CELL_SIZE, TILE_EDGE } from './native-tiles'
import { check, type CatalogCase } from './types'

const RADIUS = 0.18
const START: Point = [3.3, 0, 1]
const GOAL: Point = [7.4, 0, 1]
const GATE = { x0: 3.65, x1: 4.35, z0: 0.12, z1: 1.88 }
const OPEN = [floor(0, 3, 0, 6), floor(5, 9, 0, 6), floor(3, 5, 4, 6), floor(3, 5, 0, 2)]
const CLOSED = [...OPEN.slice(0, -1), floor(3, GATE.x0, 0, 2), floor(GATE.x1, 5, 0, 2)]
const DOOR_LINK: AuthoredLink = { from: [3.32, 0, 1], to: [4.68, 0, 1], flags: 2, bidirectional: true }
const gateEdges = rectangleEdges(GATE.x0, GATE.x1, GATE.z0, GATE.z1)
const direct = (route: Route) => crosses(route, 0, 4, ([, , z]) => z < 2)
const detour = (route: Route) => crosses(route, 0, 4, ([, , z]) => z > 4)
const clearGate = (from: Point, to: Point) => groundClearance([from, to], gateEdges) >= RADIUS - 1e-6
const host = globalThis as typeof globalThis & { performance?: { now(): number } }
const clock = () => host.performance?.now() ?? Date.now()
const gateTiles = ['1,2', '2,2']

type LiveGate = {
  navigator: Navigator
  enqueue(closed: boolean): void
  apply(): { changed: string[]; complete: boolean }
  dispose?(): void
}

function navcatGate(): LiveGate {
  const { navMesh, intermediates } = bakeNavcatTiles(OPEN, RADIUS)
  // The short corridor lies in tile row 2; its door straddles the x=4 seam.
  const affected = [1, 2].map((x) => {
    const tile = getTileAt(navMesh, x, 2, 0)
    const padding = (Math.ceil(RADIUS / CELL_SIZE) + 3) * CELL_SIZE
    const heightfield = intermediates.heightfield.find(({ bounds }) =>
      Math.abs(bounds[0] + padding - x * TILE_EDGE) < 1e-6 &&
      Math.abs(bounds[2] + padding - (navMesh.origin[2] + 2 * TILE_EDGE)) < 1e-6)
    if (!tile || !heightfield) throw new Error('Missing input for a door tile.')
    return { tile, heightfield }
  })
  let closed = false
  let pending = 0
  return {
    navigator: createNavcatNavigatorFromMesh(navMesh),
    enqueue(value) {
      closed = value
      pending = affected.length
    },
    apply() {
      if (!pending) return { changed: [], complete: true }
      const { tile, heightfield } = affected[affected.length - pending]
      const ctx = BuildContext.create()
      const radius = Math.ceil(RADIUS / CELL_SIZE)
      const compact = buildCompactHeightfield(ctx, 28, 2, heightfield)
      erodeWalkableArea(radius, compact)
      if (closed) markBoxArea([GATE.x0, -0.4, -GATE.z1, GATE.x1, 2, -GATE.z0], NULL_AREA, compact)
      buildDistanceField(compact)
      buildRegions(ctx, compact, radius + 3, 1, 1)
      const contours = buildContours(ctx, compact, 0.35, 80, ContourBuildFlags.CONTOUR_TESS_WALL_EDGES)
      const polygons = buildPolyMesh(ctx, contours, 6)
      for (let i = 0; i < polygons.nPolys; i++) {
        if (polygons.areas[i] === WALKABLE_AREA) polygons.areas[i] = 0
        if (polygons.areas[i] === 0) polygons.flags[i] = 1
      }
      const detail = buildPolyMeshDetail(ctx, polygons, compact, 0.25, 0.05)
      const data = polyMeshToTilePolys(polygons)
      const mesh = polyMeshDetailToTileDetailMesh(data.polys, detail)
      if (!removeTile(navMesh, tile.tileX, tile.tileY, tile.tileLayer)) throw new Error('Could not remove a door tile.')
      addTile(navMesh, buildTile({ ...tile, bounds: polygons.bounds, ...data, ...mesh }))
      pending--
      return { changed: [tile.tileX + ',' + tile.tileY], complete: pending === 0 }
    }
  }
}

function detourGate(): LiveGate {
  const geometry = toRecastGeometry(OPEN)
  const result = generateTileCache(geometry.positions, geometry.indices, {
    cs: CELL_SIZE, ch: CELL_SIZE, tileSize: TILE_EDGE / CELL_SIZE,
    walkableHeight: 28, walkableRadius: Math.ceil(RADIUS / CELL_SIZE), walkableClimb: 2,
    expectedLayersPerTile: 1, maxObstacles: 1
  })
  if (!result.success) throw new Error(result.error)
  const { navMesh, tileCache } = result
  const navigator = createDetourNavigatorFromMesh(navMesh)
  const tileRefs = () => Array.from({ length: 15 }, (_, i) => navMesh.getTileRefAt(i % 5, Math.floor(i / 5), 0))
  let obstacle: BoxObstacle | undefined
  return {
    navigator,
    enqueue(closed) {
      if (closed) {
        const added = tileCache.addBoxObstacle({ x: 4, y: 0.7, z: -1 },
          { x: (GATE.x1 - GATE.x0) / 2, y: 0.7, z: (GATE.z1 - GATE.z0) / 2 }, 0)
        if (!added.success) throw new Error('Could not queue the door obstacle.')
        obstacle = added.obstacle
      } else if (!obstacle || !tileCache.removeObstacle(obstacle).success) {
        throw new Error('Could not queue removal of the door obstacle.')
      }
    },
    apply() {
      const before = tileRefs()
      const update = tileCache.update(navMesh)
      if (!update.success) throw new Error('Could not update the door obstacle.')
      const changed = tileRefs().flatMap((ref, i) => ref === before[i] ? [] : [i % 5 + ',' + Math.floor(i / 5)])
      return { changed, complete: update.upToDate }
    },
    dispose() {
      tileCache.destroy()
      navigator.dispose()
    }
  }
}

function applyAtTick(gate: LiveGate) {
  const started = clock()
  const tiles = new Set<string>()
  for (let ticks = 1; ticks < 12; ticks++) {
    const update = gate.apply()
    for (const tile of update.changed) tiles.add(tile)
    if (update.complete) {
      // A tile's build border may trigger adjacent work. Both tiles containing the door must be replaced.
      return { tiles: tiles.size, changed: [...tiles], gatesRebuilt: gateTiles.every((tile) => tiles.has(tile)),
        ticks, ms: clock() - started }
    }
  }
  throw new Error('Door update never settled.')
}

export const lateDoor: CatalogCase['run'] = (backend) => {
  const gate = backend === 'navcat' ? navcatGate() : detourGate()
  const follower = groundFollower(START)
  try {
    const original = gate.navigator.route(START, GOAL)
    follower.assign(original.points)
    follower.step(0.17, clearGate)
    const before = follower.position()
    const openAtApproach = gate.navigator.route(before, GOAL)
    gate.enqueue(true)
    const queued = gate.navigator.route(before, GOAL)
    const stopped = !follower.step(0.17, clearGate) && pointDistance(before, follower.position()) < 1e-7
    const closedUpdate = applyAtTick(gate)
    const reroute = gate.navigator.route(follower.position(), GOAL)
    follower.assign(reroute.points)
    let safe = true
    for (let tick = 0; tick < 150 && !follower.finished(); tick++) safe = follower.step(0.17, clearGate) && safe
    const arrived = pointDistance(follower.position(), GOAL) < 0.12
    gate.enqueue(false)
    const openUpdate = applyAtTick(gate)
    const reopened = gate.navigator.route(before, GOAL)
    return check(original.status === 'complete' && direct(openAtApproach) && direct(queued) && stopped &&
      closedUpdate.gatesRebuilt && reroute.status === 'complete' && detour(reroute) && safe && arrived &&
      openUpdate.gatesRebuilt && reopened.status === 'complete' && direct(reopened) &&
      pathLength(reroute) > pathLength(reopened) + 1,
    JSON.stringify({ stopped, safe, arrived, original: original.status, queued: direct(queued),
      closed: { route: reroute.status, detour: detour(reroute), ...closedUpdate },
      reopened: { route: reopened.status, shortcut: direct(reopened), ...openUpdate } }))
  } finally {
    gate.dispose?.()
  }
}

export const actionableDoor: CatalogCase['run'] = (backend) => {
  const permitted = createTraversalNavigator(backend, CLOSED, RADIUS, 1.4, [DOOR_LINK], true)
  const restricted = createTraversalNavigator(backend, CLOSED, RADIUS, 1.4)
  try {
    function replay(kind: 'opens' | 'denied' | 'locks') {
      const follower = groundFollower([2, 0, 1])
      const initial = (kind === 'denied' ? restricted : permitted).route(follower.position(), GOAL)
      follower.assign(initial.points)
      let requested: number | undefined
      let opened = false
      let replanned = false
      let waited = 0
      let shortCrossings = 0
      let longCrossings = 0
      for (let tick = 0; tick < 150 && !follower.finished(); tick++) {
        if (requested !== undefined && tick === requested + 3) {
          if (kind === 'opens') opened = true
          if (kind === 'locks') {
            const replacement = restricted.route(follower.position(), GOAL)
            replanned = replacement.status === 'complete' && detour(replacement)
            follower.assign(replacement.points)
          }
        }
        const stepped = follower.step(0.2, (from, to) => {
          if (!opened && !clearGate(from, to)) return false
          const segment: Route = { status: 'complete', points: [from, to] }
          if (direct(segment)) shortCrossings++
          if (detour(segment)) longCrossings++
          return true
        })
        if (!stepped) {
          requested ??= tick
          waited++
        }
      }
      return { start: initial.status, choseDoor: direct(initial), requested: requested !== undefined, waited,
        opened, replanned, shortCrossings, longCrossings, arrived: pointDistance(follower.position(), GOAL) < 0.12 }
    }
    const opens = replay('opens')
    const denied = replay('denied')
    const locks = replay('locks')
    return check([opens, denied, locks].every((trial) => trial.start === 'complete' && trial.arrived) &&
      opens.choseDoor && opens.requested && opens.waited === 3 && opens.opened && opens.shortCrossings === 1 &&
      !denied.choseDoor && !denied.requested && denied.longCrossings === 1 && denied.shortCrossings === 0 &&
      locks.choseDoor && locks.requested && locks.waited === 3 && !locks.opened && locks.replanned &&
      locks.longCrossings === 1 && locks.shortCrossings === 0,
    JSON.stringify({ opens, denied, locks }))
  } finally {
    permitted.dispose?.()
    restricted.dispose?.()
  }
}
