import { createFindNearestPolyResult, DEFAULT_QUERY_FILTER, findNearestPoly, type Box3 } from 'navcat'
import { NavMeshQuery, Raw, type BoxObstacle } from 'recast-navigation'
import { generateTileCache } from 'recast-navigation/generators'
import type { Point } from '../../src/arena'
import { createNavcatNavigatorFromMesh, toRecastGeometry, type Navigator } from '../../src/navigation'
import { createDetourNavigatorFromMesh } from '../../test/detour'
import type { TraversalBackend } from '../sdk-detour-probe/traversal-routing'
import { floor, outsideRect } from './ground'
import { replaceNavcatObstacleTile } from './live-obstacles'
import { bakeNavcatTiles, CELL_SIZE, detourPoint, nativePoint, TILE_EDGE } from './native-tiles'
import { check } from './types'

const floorFaces = [floor(0, 20, 0, 20)]
const positions: Point[] = Array.from({ length: 65 }, (_, i) => [1 + i % 8 * 2, 0, 1 + Math.floor(i / 8) * 2])
const halfSize = 0.45
const radius = 0.15
const batchSize = 8
type Command = { id: number; blocked: boolean }
type Fixture = {
  apply(commands: readonly Command[]): void
  blocked(point: Point): boolean
  route: Navigator['route']
  dispose(): void
}

function navcatFixture(): Fixture {
  const { navMesh, intermediates } = bakeNavcatTiles(floorFaces, radius)
  const nav = createNavcatNavigatorFromMesh(navMesh)
  const active = new Set<number>()
  const boxes: Box3[] = positions.map(([x, , z]) =>
    [x - halfSize, -0.3, -z - halfSize, x + halfSize, 2, -z + halfSize])
  const padding = (Math.ceil(radius / CELL_SIZE) + 3) * CELL_SIZE
  const jobs = Object.values(navMesh.tiles).map((tile) => {
    const x = navMesh.origin[0] + tile.tileX * TILE_EDGE
    const z = navMesh.origin[2] + tile.tileY * TILE_EDGE
    const field = intermediates.heightfield.find(({ bounds }) =>
      Math.abs(bounds[0] + padding - x) < 1e-6 && Math.abs(bounds[2] + padding - z) < 1e-6)
    if (!field) throw new Error('Missing original heightfield for obstacle tile.')
    const overlaps = ([x0, , z0, x1, , z1]: Box3) =>
      x0 < field.bounds[3] && x1 > field.bounds[0] && z0 < field.bounds[5] && z1 > field.bounds[2]
    return { tile, field, overlaps }
  })
  return {
    apply(commands) {
      for (const { id, blocked } of commands) {
        if (blocked) active.add(id)
        else active.delete(id)
      }
      const obstacles = Array.from(active, (id) => boxes[id])
      for (const { tile, field, overlaps } of jobs) {
        if (commands.some(({ id }) => overlaps(boxes[id]))) {
          replaceNavcatObstacleTile(navMesh, tile, field, obstacles.filter(overlaps), radius)
        }
      }
    },
    blocked(point) {
      return !findNearestPoly(createFindNearestPolyResult(), navMesh, nativePoint(point), [0.1, 0.3, 0.1], DEFAULT_QUERY_FILTER).success
    },
    route: nav.route,
    dispose() {}
  }
}

function detourFixture(): Fixture {
  const { positions: vertices, indices } = toRecastGeometry(floorFaces)
  const baked = generateTileCache(vertices, indices, {
    cs: CELL_SIZE, ch: CELL_SIZE, tileSize: TILE_EDGE / CELL_SIZE,
    walkableHeight: 28, walkableRadius: Math.ceil(radius / CELL_SIZE), walkableClimb: 2,
    expectedLayersPerTile: 1, maxObstacles: 128
  })
  if (!baked.success) throw new Error(baked.error)
  const { navMesh, tileCache } = baked
  const nav = createDetourNavigatorFromMesh(navMesh)
  const query = new NavMeshQuery(navMesh)
  const active = new Map<number, BoxObstacle>()
  return {
    apply(commands) {
      for (const { id, blocked } of commands) {
        if (blocked) {
          const [x, , z] = positions[id]
          const result = tileCache.addBoxObstacle(detourPoint([x, 0.85, z]), { x: halfSize, y: 1.15, z: halfSize }, 0)
          if (!result.success) throw new Error('Detour rejected an obstacle batch.')
          active.set(id, result.obstacle)
        } else {
          const obstacle = active.get(id)
          if (!obstacle || !tileCache.removeObstacle(obstacle).success) throw new Error('Detour rejected an obstacle removal.')
          active.delete(id)
        }
      }
      for (let i = 0; i < 180; i++) {
        const status = tileCache.update(navMesh)
        if (!status.success) throw new Error('Detour obstacle batch update failed.')
        if (status.upToDate) return
      }
      throw new Error('Detour obstacle batch did not converge.')
    },
    blocked(point) {
      return query.findNearestPoly(detourPoint(point), { halfExtents: { x: 0.1, y: 0.3, z: 0.1 } }).nearestRef === 0
    },
    route: nav.route,
    dispose() {
      Raw.destroy(query.defaultFilter.raw)
      query.destroy()
      tileCache.destroy()
      nav.dispose()
    }
  }
}

function simulate(backend: TraversalBackend, burst: boolean) {
  const fixture = backend === 'navcat' ? navcatFixture() : detourFixture()
  const pending: Command[] = []
  const deferred: Command[] = []
  const applied: Command[] = []
  const blocked = () => positions.map(fixture.blocked)
  const enqueue = (command: Command) => {
    if (pending.length === 64) return false
    pending.push(command)
    return true
  }
  let maxBatch = 0
  function drain() {
    while (pending.length) {
      const batch = pending.splice(0, batchSize)
      fixture.apply(batch)
      applied.push(...batch)
      maxBatch = Math.max(maxBatch, batch.length)
    }
  }
  try {
    const clear = blocked().every((value) => !value)
    positions.forEach((_, id) => {
      const command = { id, blocked: true }
      if (!enqueue(command)) deferred.push(command)
      if (!burst && pending.length === batchSize) drain()
    })
    const untouchedBeforeDrain = !burst || blocked().every((value) => !value)
    drain()
    const beforeRetry = blocked().filter(Boolean).length
    for (const command of deferred) if (!enqueue(command)) throw new Error('Retry did not enqueue after draining.')
    drain()
    const allBlocked = blocked().every(Boolean)
    const path = fixture.route([0.5, 0, 0.5], [18.5, 0, 18.5])
    const routeClear = path.status === 'complete' && positions.every(([x, , z]) =>
      outsideRect(path, [x - 0.4, x + 0.4, z - 0.4, z + 0.4]))
    const removalIds = new Set([0, positions.length - 1])
    for (const id of removalIds) if (!enqueue({ id, blocked: false })) throw new Error('Removal did not enqueue.')
    drain()
    const removed = blocked().every((value, id) => value === !removalIds.has(id))
    const fifo = positions.every((_, id) => applied[id]?.id === id && applied[id]?.blocked) &&
      applied.slice(positions.length).length === removalIds.size &&
      applied.slice(positions.length).every(({ id, blocked: value }) => removalIds.has(id) && !value)
    return { clear, untouchedBeforeDrain, beforeRetry, deferred: deferred.map(({ id }) => id), allBlocked,
      routeClear, path: JSON.stringify(path.points), removed, fifo, maxBatch }
  } finally {
    fixture.dispose()
  }
}

export function obstacleBackpressure(backend: TraversalBackend) {
  const burst = simulate(backend, true)
  const scheduled = simulate(backend, false)
  const consistent = burst.path === scheduled.path
  const valid = [burst, scheduled].every(({ clear, untouchedBeforeDrain, allBlocked, routeClear, removed, fifo, maxBatch }) =>
    clear && untouchedBeforeDrain && allBlocked && routeClear && removed && fifo && maxBatch === batchSize)
  const passed = valid && consistent && burst.beforeRetry === 64 && burst.deferred.join() === '64' &&
    scheduled.beforeRetry === 65 && scheduled.deferred.length === 0
  const describe = ({ path, ...result }: typeof burst) => result
  return check(passed, 'Shared application queue with capacity 64 and batches of eight. ' +
    JSON.stringify({ burst: describe(burst), scheduled: describe(scheduled), consistent }))
}
