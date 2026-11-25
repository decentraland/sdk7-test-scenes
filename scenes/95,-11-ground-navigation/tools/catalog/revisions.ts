import type { Point } from '../../src/arena'
import { toRecastGeometry } from '../../src/navigation'
import type { TraversalShape } from '../../src/traversal/types'
import { traversalSurfaces, type TraversalBackend } from '../sdk-detour-probe/traversal-routing'
import { outsideRect } from './ground'
import { CELL_SIZE, TILE_EDGE } from './native-tiles'
import { initialSnapshot, patchedSnapshot } from './revision-snapshot'
import type { TileCoordinate, WorldBounds } from './revision-tile-worker'
import { createRevisionWorkers } from './revision-workers'
import { box, check, type CatalogCase } from './types'

const start: Point = [1, 0, 4]
const goal: Point = [11, 0, 4]
const slab = box('floor', 'surface', [0, -0.2, 0], [12, 0, 10])
const wall = box('old wall', 'obstacle', [5.8, 0, 0], [6.2, 2, 7])
const chunks = [box('nw', 'obstacle', [5.4, 0, 5.4], [6, 2, 6]),
  box('ne', 'obstacle', [6, 0, 5.4], [6.6, 2, 6]),
  box('sw', 'obstacle', [5.4, 0, 6], [6, 2, 6.6]),
  box('se', 'obstacle', [6, 0, 6], [6.6, 2, 6.6])]

const worldBounds: WorldBounds = [[0, 0, -10], [12, 0, 0]]
const dirtyHalo = (Math.ceil(0.18 / CELL_SIZE) + 3) * CELL_SIZE

function dirtyTiles(before: readonly TraversalShape[], after: readonly TraversalShape[]) {
  const changed = [
    ...before.filter((shape) => !after.includes(shape)), ...after.filter((shape) => !before.includes(shape))
  ]
  const coords: TileCoordinate[] = []
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) {
    const west = x * TILE_EDGE
    const near = 10 - (y + 1) * TILE_EDGE
    if (changed.some(({ center: [cx, , cz], size: [width, , depth] }) =>
      cx + width / 2 >= west - dirtyHalo && cx - width / 2 <= west + TILE_EDGE + dirtyHalo &&
      cz + depth / 2 >= near - dirtyHalo && cz - depth / 2 <= near + TILE_EDGE + dirtyHalo
    )) coords.push([x, y])
  }
  return coords
}

function store(backend: TraversalBackend, initial: readonly TraversalShape[]) {
  const surfaces = (shapes: readonly TraversalShape[]) => traversalSurfaces([slab, ...shapes], 1.4)
  let published = { revision: 0, shapes: initial, mesh: initialSnapshot(backend, surfaces(initial)) }
  const workers = createRevisionWorkers(backend)
  let latestRevision = 0
  return {
    query(from = start, to = goal) {
      const { revision, mesh } = published
      return { revision, path: mesh.navigator.route(from, to) }
    },
    schedule(shapes: readonly TraversalShape[], hold?: Promise<unknown>, heldTile?: TileCoordinate) {
      const revision = ++latestRevision
      const coordinates = dirtyTiles(published.shapes, shapes)
      const held = heldTile ?? coordinates[coordinates.length - 1]
      const geometry = toRecastGeometry(surfaces(shapes))
      const jobs = coordinates.map((coord) => workers.build({
        ...geometry, coordinates: coord, bounds: worldBounds
      }, held && coord[0] === held[0] && coord[1] === held[1] ? hold : undefined))
      let error: unknown
      const ready = Promise.all(jobs.map(({ result }) => result)).then((patches) => {
        if (revision !== latestRevision) return false
        const mesh = patchedSnapshot(published.mesh, patches)
        const retired = published.mesh
        published = { revision, shapes, mesh }
        retired.dispose()
        return true
      }).catch((failure: unknown) => {
        error = failure
        return false
      })
      return {
        revision, coordinates, ready,
        progress: () => {
          if (error !== undefined) throw error
          const states = jobs.map(({ state }) => state())
          return { active: states.filter((state) => state === 1).length, built: states.filter((state) => state === 2).length }
        }
      }
    },
    async dispose() {
      latestRevision++
      published.mesh.dispose()
      await workers.dispose()
    }
  }
}

function barrier() {
  let release!: () => void
  const passed = new Promise<void>((resolve) => { release = resolve })
  return { passed, release }
}

const yieldWorker = () => new Promise<void>((resolve) => setTimeout(resolve, 1))

async function waitForWorkers(report: () => boolean) {
  const end = Date.now() + 15_000
  while (!report()) {
    if (Date.now() >= end) throw new Error('Timed out waiting for native tile worker progress.')
    await yieldWorker()
  }
}

export const revisionCases: CatalogCase[] = [
  {
    id: 'GAME-14', layer: 'integration',
    async run(backend) {
      const map = store(backend, [wall])
      const gate = barrier()
      try {
        const from: Point = [1, 0, 6]
        const to: Point = [11, 0, 6]
        const before = map.query(from, to)
        const change = map.schedule(chunks, gate.passed, [3, 2])
        const corners = ['2,1', '2,2', '3,1', '3,2'].every((tile) => change.coordinates.some((coord) => coord.join() === tile))
        await waitForWorkers(() => change.progress().built === change.coordinates.length - 1)
        const during = map.query(from, to)
        gate.release()
        const rebuilt = await change.ready
        const after = map.query(from, to)
        const unaffected = map.query([1, 0, 8.4], [11, 0, 8.4])
        const remove = map.schedule([])
        const removed = await remove.ready
        const clear = map.query(from, to)
        return check(corners && rebuilt && removed && before.path.status === 'complete' &&
          JSON.stringify(after.path) !== JSON.stringify(before.path) && during.revision === before.revision &&
          JSON.stringify(during.path) === JSON.stringify(before.path) && after.revision === change.revision &&
          after.path.status === 'complete' && outsideRect(after.path, [5.4, 6.6, 5.4, 6.6]) &&
          unaffected.path.status === 'complete' && clear.path.status === 'complete' &&
          !outsideRect(clear.path, [5.4, 6.6, 5.4, 6.6]),
        change.coordinates.length + ' native worker patches include the four debris corners. Until the held corner is built, queries see the original route. After commit, the detour is open and clearing the debris restores the shortcut.')
      } finally {
        gate.release()
        await map.dispose()
      }
    }
  },
  {
    id: 'GAME-27', layer: 'integration',
    async run(backend) {
      let rng = 417
      const boxes = Array.from({ length: 100 }, (_, i) => {
        rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0
        const x = 0.6 + (i % 10) * 1.075
        const z = 5.1 + Math.floor(i / 10) * 0.45
        const width = 0.08 + (rng % 5) * 0.025
        return box('debris' + i, 'obstacle', [x, 0, z], [x + width, 1.8, z + width])
      })
      const map = store(backend, boxes)
      let invalid = 0
      let overlapped = 0
      try {
        for (let revision = 1; revision <= 5; revision++) {
          const gate = barrier()
          const z = 2.5 + revision * 0.1
          const hazard = box('hazard', 'obstacle', [4.8, 0, z], [6.3, 2, z + 1.5])
          const moved = boxes.map((block, index) => {
            if (index % 13 !== 0) return block
            const [x, y, baseZ] = block.center
            return { ...block, center: [x + revision * 0.045, y, baseZ - revision * 0.025] as Point }
          })
          const shapes = [...moved, hazard]
          const job = map.schedule(shapes, gate.passed)
          try {
            await waitForWorkers(() => {
              const { active, built } = job.progress()
              return active > 0 || built === job.coordinates.length - 1
            })
            for (let i = 0; i < 30; i++) {
              const lane = 2.6 + i * 0.015
              const { active } = job.progress()
              const entry = map.query([1, 0, lane], [11, 0, lane])
              if (active) overlapped++
              if (entry.revision !== revision - 1 || entry.path.status !== 'complete') invalid++
              if (i % 5 === 4) await yieldWorker()
            }
          } finally {
            gate.release()
          }
          if (!(await job.ready)) invalid++
          for (let i = 0; i < 30; i++) {
            const lane = 2.6 + i * 0.015
            const after = map.query([1, 0, lane], [11, 0, lane])
            const hits = shapes.some(({ center: [cx, , cz], size: [w, , d] }) =>
              !outsideRect(after.path, [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2]))
            if (after.revision !== revision || after.path.status !== 'complete' || hits) invalid++
          }
        }
        return check(invalid === 0 && overlapped > 0,
          '300 queries around 100 seeded blockers; ' + overlapped + ' started while a worker reported a native tile build in progress. Invalid routes ' + invalid + '.')
      } finally {
        await map.dispose()
      }
    }
  },
  {
    id: 'GAME-28', layer: 'integration',
    async run(backend) {
      const map = store(backend, [])
      const staleGate = barrier()
      const gate = barrier()
      try {
        const oldRevision = map.schedule(chunks, staleGate.passed)
        const revision = map.schedule([wall], gate.passed)
        let settled = false
        const ready = revision.ready.then((valid) => { settled = true; return valid })
        await waitForWorkers(() => revision.progress().built === revision.coordinates.length - 1)
        staleGate.release()
        const obsolete = !(await oldRevision.ready) && oldRevision.progress().built === oldRevision.coordinates.length
        const oldRoute = map.query()
        const stillPending = !settled && oldRoute.revision === 0 && oldRoute.path.status === 'complete' &&
          !outsideRect(oldRoute.path, [5.8, 6.2, 0, 7])
        gate.release()
        const current = await ready
        const result = map.query()
        return check(obsolete && stillPending && current && revision.progress().built === revision.coordinates.length &&
          result.revision === revision.revision && result.path.status === 'complete' &&
          outsideRect(result.path, [5.8, 6.2, 0, 7]),
        'A finished tile patch from the superseded worker batch cannot satisfy the current fence. Only the last current tile publishes the new detour.')
      } finally {
        staleGate.release()
        gate.release()
        await map.dispose()
      }
    }
  }
]
