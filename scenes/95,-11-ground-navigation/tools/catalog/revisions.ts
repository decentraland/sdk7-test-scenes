import type { Point } from '../../src/arena'
import { createNavcatNavigatorFromMesh } from '../../src/navigation'
import type { TraversalShape } from '../../src/traversal/types'
import { createDetourNavigatorFromMesh } from '../../test/detour'
import { traversalSurfaces, type TraversalBackend } from '../sdk-detour-probe/traversal-routing'
import { outsideRect } from './ground'
import { detourTiles, navcatTiles } from './native-tiles'
import { box, check, type CatalogCase } from './types'

const start: Point = [1, 0, 4]
const goal: Point = [11, 0, 4]
const slab = box('floor', 'surface', [0, -0.2, 0], [12, 0, 10])
const wall = box('old wall', 'obstacle', [5.8, 0, 0], [6.2, 2, 7])
const chunks = [box('nw', 'obstacle', [5.4, 0, 5.4], [6, 2, 6]),
  box('ne', 'obstacle', [6, 0, 5.4], [6.6, 2, 6]),
  box('sw', 'obstacle', [5.4, 0, 6], [6, 2, 6.6]),
  box('se', 'obstacle', [6, 0, 6], [6.6, 2, 6.6])]

function store(backend: TraversalBackend, initial: readonly TraversalShape[]) {
  function stage(revision: number, shapes: readonly TraversalShape[]) {
    const faces = traversalSurfaces([slab, ...shapes], 1.4)
    if (backend === 'navcat') {
      const mesh = navcatTiles(faces, 0.18)
      return { revision, navigator: createNavcatNavigatorFromMesh(mesh), tiles: Object.keys(mesh.tiles).length, dispose() {} }
    }
    const mesh = detourTiles(faces, 0.18)
    let tiles = 0
    for (let i = 0; i < mesh.getMaxTiles(); i++) {
      if (mesh.getTile(i).header()) tiles++
    }
    const navigator = createDetourNavigatorFromMesh(mesh)
    return { revision, navigator, tiles, dispose: navigator.dispose }
  }
  let published = stage(0, initial)
  let staged: ReturnType<typeof stage> | undefined
  let latestRevision = 0
  let pending = Promise.resolve()
  return {
    query(from = start, to = goal) {
      const { revision, navigator, tiles } = published
      return { revision, tiles, path: navigator.route(from, to) }
    },
    inspectStaged(revision: number, from = start, to = goal) {
      if (staged?.revision !== revision) return undefined
      return { tiles: staged.tiles, path: staged.navigator.route(from, to) }
    },
    schedule(shapes: readonly TraversalShape[], completions: readonly Promise<unknown>[]) {
      const revision = latestRevision + 1
      const candidate = stage(revision, shapes)
      staged?.dispose()
      staged = candidate
      latestRevision = revision
      // Build native tile data now. The barrier delays publication, so queries
      // during the hold still run against the previous live tiled snapshot.
      pending = Promise.all(completions).then(() => {
        if (revision !== latestRevision) return
        published.dispose()
        published = candidate
        staged = undefined
      })
      return revision
    },
    async ready(revision: number) {
      while (revision === latestRevision && published.revision < revision) await pending
      return published.revision === revision
    },
    dispose() {
      latestRevision++
      staged?.dispose()
      staged = undefined
      published.dispose()
    }
  }
}

function barrier() {
  let release!: () => void
  const passed = new Promise<void>((resolve) => { release = resolve })
  return { passed, release }
}

export const revisionCases: CatalogCase[] = [
  {
    id: 'GAME-14', layer: 'integration', coverage: 'adapted',
    async run(backend) {
      const map = store(backend, [wall])
      const gates = chunks.map(() => barrier())
      try {
        const from: Point = [1, 0, 6]
        const to: Point = [11, 0, 6]
        const before = map.query(from, to)
        const change = map.schedule(chunks, gates.map((gate) => gate.passed))
        const candidate = map.inspectStaged(change, from, to)
        gates.slice(0, 3).forEach((gate) => gate.release())
        await Promise.resolve()
        const during = map.query(from, to)
        gates[3].release()
        const rebuilt = await map.ready(change)
        const after = map.query(from, to)
        const unaffected = map.query([1, 0, 8.4], [11, 0, 8.4])
        const remove = map.schedule([], [])
        await map.ready(remove)
        const clear = map.query(from, to)
        return check(rebuilt && before.tiles > 4 && before.path.status === 'complete' &&
          candidate !== undefined && candidate.tiles > 4 && candidate.path.status === 'complete' &&
          outsideRect(candidate.path, [5.4, 6.6, 5.4, 6.6]) &&
          JSON.stringify(candidate.path) !== JSON.stringify(before.path) && during.revision === before.revision &&
          JSON.stringify(during.path) === JSON.stringify(before.path) && after.revision === change &&
          JSON.stringify(after.path) === JSON.stringify(candidate.path) &&
          after.path.status === 'complete' && outsideRect(after.path, [5.4, 6.6, 5.4, 6.6]) &&
          unaffected.path.status === 'complete' && clear.path.status === 'complete' &&
          !outsideRect(clear.path, [5.4, 6.6, 5.4, 6.6]),
        'The staged native tiled map already routes around debris. Three released barriers expose only the original map. ' +
          'The fourth publishes the staged path, and removing debris restores the direct passage.')
      } finally {
        map.dispose()
      }
    }
  },
  {
    id: 'GAME-27', layer: 'integration', coverage: 'adapted',
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
      try {
        for (let revision = 1; revision <= 5; revision++) {
          const gate = barrier()
          const z = 2.5 + revision * 0.1
          const hazard = box('hazard', 'obstacle', [4.8, 0, z], [6.3, 2, z + 1.5])
          const job = map.schedule([...boxes.slice(revision), hazard], [gate.passed])
          if ((map.inspectStaged(job)?.tiles ?? 0) <= 4) invalid++
          const concurrent = await Promise.all(Array.from({ length: 30 }, async (_, i) => {
            await Promise.resolve()
            const lane = 2.6 + i * 0.015
            return map.query([1, 0, lane], [11, 0, lane])
          }))
          invalid += concurrent.filter((entry) => entry.revision !== revision - 1 || entry.path.status !== 'complete').length
          gate.release()
          if (!(await map.ready(job))) invalid++
          for (let i = 0; i < 30; i++) {
            const lane = 2.6 + i * 0.015
            const after = map.query([1, 0, lane], [11, 0, lane])
            if (after.revision !== revision || after.path.status !== 'complete' ||
                !outsideRect(after.path, [4.8, 6.3, z, z + 1.5])) invalid++
          }
        }
        return check(invalid === 0, '300 calls against 100 seeded obstacles and five staged native tiled revisions, invalid results ' + invalid + '.')
      } finally {
        map.dispose()
      }
    }
  },
  {
    id: 'GAME-28', layer: 'integration', coverage: 'adapted',
    async run(backend) {
      const map = store(backend, [])
      try {
        const staleGate = barrier()
        const oldRevision = map.schedule(chunks, [staleGate.passed])
        const oldReady = map.ready(oldRevision)
        const gate = barrier()
        const revision = map.schedule([wall], [gate.passed])
        const candidate = map.inspectStaged(revision)
        let settled = false
        const ready = map.ready(revision).then((valid) => { settled = true; return valid })
        staleGate.release()
        const obsolete = !(await oldReady)
        const oldRoute = map.query()
        const stillPending = !settled && oldRoute.revision === 0 && oldRoute.path.status === 'complete' &&
          !outsideRect(oldRoute.path, [5.8, 6.2, 0, 7])
        gate.release()
        const current = await ready
        const result = map.query()
        return check(obsolete && stillPending && current && candidate !== undefined && candidate.tiles > 4 &&
          result.revision === revision && result.path.status === 'complete' && JSON.stringify(result.path) === JSON.stringify(candidate.path) &&
          outsideRect(result.path, [5.8, 6.2, 0, 7]),
        'The obsolete native snapshot is discarded. The last barrier keeps the original tiled path visible until the current staged detour can publish.')
      } finally {
        map.dispose()
      }
    }
  }
]
