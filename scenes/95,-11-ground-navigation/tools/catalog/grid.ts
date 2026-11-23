import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { PerformanceObserver } from 'node:perf_hooks'
import { exportNavMesh, importNavMesh } from 'recast-navigation'
import type { Point, Surface } from '../../src/arena'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, NAVIGATION_BAKE, type Navigator, type Route } from '../../src/navigation'
import { bakeDetourMesh, createDetourNavigatorFromMesh } from '../../test/detour'
import { CLUTTER_CELL, CLUTTER_GOAL, CLUTTER_RADIUS, CLUTTER_SPEED, CLUTTER_START, clutterMaps, clutterPoint,
  clutterOverlap, clutterTrace } from './clutter'
import { crosses, floor, outsideRect, pathLength, usingMesh } from './ground'
import { check, missing, type CatalogCase } from './types'

type Cell = readonly [x: number, z: number]
type Sample = { start: Cell; goal: Cell; cost: number }
const CELL_SIZE = 0.4
const dataDirectory = () => resolve(process.env.DCL_MAPF_DATA ?? '.comparison/movingai')

type BenchmarkNavigator = Navigator & { dispose?(): void }

function scalingMesh(backend: 'navcat' | 'detour') {
  const faces = [floor(0, 14, 0, 14)]
  const start = performance.now()
  if (backend === 'navcat') {
    const mesh = bakeNavcatMesh(faces)
    const buildMs = performance.now() - start
    const image = JSON.stringify(mesh)
    const beforeLoad = performance.now()
    const nav: BenchmarkNavigator = createNavcatNavigatorFromMesh(JSON.parse(image) as typeof mesh)
    return { nav, buildMs, loadMs: performance.now() - beforeLoad, bytes: Buffer.byteLength(image) }
  }
  const mesh = bakeDetourMesh(faces)
  const buildMs = performance.now() - start
  let image: Uint8Array
  try { image = exportNavMesh(mesh) }
  finally { mesh.destroy() }
  const beforeLoad = performance.now()
  const nav: BenchmarkNavigator = createDetourNavigatorFromMesh(importNavMesh(image).navMesh)
  return { nav, buildMs, loadMs: performance.now() - beforeLoad, bytes: image.byteLength }
}

async function queryScaling(backend: 'navcat' | 'detour') {
  const benchmarkStart = performance.now()
  let gcCount = 0
  let gcMs = 0
  const gc = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.startTime < benchmarkStart) continue
      gcCount++
      gcMs += entry.duration
    }
  })
  gc.observe({ entryTypes: ['gc'] })
  const initialMemory = process.memoryUsage()
  const peak = { rss: initialMemory.rss, heap: initialMemory.heapUsed, external: initialMemory.external }
  function sampleMemory() {
    const value = process.memoryUsage()
    peak.rss = Math.max(peak.rss, value.rss)
    peak.heap = Math.max(peak.heap, value.heapUsed)
    peak.external = Math.max(peak.external, value.external)
  }
  try {
    const { nav, buildMs, loadMs, bytes } = scalingMesh(backend)
    try {
      const points: Point[] = Array.from({ length: 121 }, (_, i) => [2 + (i % 11), 0, 2 + Math.floor(i / 11)])
      let seed = 71429
      const random = (max: number) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return seed % max
      }
      const cell = (index: number) => points[index]
      const origin = cell(10)
      const target = cell(0)
      const good = (route: Route, a: Point, b: Point) => route.status === 'complete' &&
        Math.abs(pathLength(route) - Math.hypot(a[0] - b[0], a[2] - b[2])) < 0.02
      const coldStart = performance.now()
      const first = nav.route(origin, target)
      const firstQueryMs = performance.now() - coldStart
      for (let i = 0; i < 30; i++) nav.route(cell(random(121)), cell(random(121)))
      sampleMemory()
      const timings = (values: number[]) => {
        values.sort((a, b) => a - b)
        return [0.5, 0.95, 0.99].map((p) => values[Math.ceil(values.length * p) - 1])
      }
      let matches = 0
      const workloads = [121, 5, 1].map((goalCount) => ({
        goalCount,
        p50p95p99Ms: timings(Array.from({ length: 1000 }, (_, i) => {
          const a = goalCount === 1 ? origin : cell(random(121))
          const b = goalCount === 1 ? target : cell(random(goalCount))
          const tick = performance.now()
          const path = nav.route(a, b)
          const elapsed = performance.now() - tick
          if (good(path, a, b)) matches++
          if (i % 25 === 0) sampleMemory()
          return elapsed
        }))
      }))
      const cache = new Map<string, Route>()
      let nativeCalls = 0
      const cachedRepeatMs = timings(Array.from({ length: 1000 }, () => {
        const tick = performance.now()
        let path = cache.get('10:0')
        if (!path) {
          nativeCalls++
          path = nav.route(origin, target)
          cache.set('10:0', path)
        }
        const elapsed = performance.now() - tick
        if (good(path, origin, target)) matches++
        return elapsed
      }))
      sampleMemory()
      await new Promise<void>((done) => setImmediate(() => setImmediate(done)))
      return check(good(first, origin, target) && matches === 4000 && nativeCalls === 1,
        'Open-floor oracle and isolated answer cache: ' + JSON.stringify({
          matches, buildMs, loadMs, bytes, firstQueryMs, workloads, cachedRepeatMs, nativeCalls,
          baselineBytes: initialMemory, sampledPeakBytes: peak, gcCount, gcMs
        }))
    } finally {
      nav.dispose?.()
    }
  } finally {
    gc.disconnect()
  }
}

function walkable(rows: readonly string[], x: number, z: number) {
  const marker = rows[z]?.[x]
  return marker !== undefined && '.GS'.includes(marker)
}

export function gridDistance(
  rows: readonly string[], from: Cell, to: Cell, diagonals = true,
  stats?: { expanded: number; peak: number }
) {
  const width = rows[0].length
  const distances = new Float64Array(width * rows.length).fill(Infinity)
  const queue: [cost: number, cell: number][] = []
  function push(value: [number, number]) {
    let index = queue.length
    queue.push(value)
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (queue[parent][0] <= value[0]) break
      queue[index] = queue[parent]
      index = parent
    }
    queue[index] = value
  }
  function pop() {
    const head = queue[0]
    const tail = queue.pop()!
    if (queue.length === 0) return head
    let index = 0
    while (index * 2 + 1 < queue.length) {
      let child = index * 2 + 1
      if (child + 1 < queue.length && queue[child + 1][0] < queue[child][0]) child++
      if (tail[0] <= queue[child][0]) break
      queue[index] = queue[child]
      index = child
    }
    queue[index] = tail
    return head
  }
  if (!walkable(rows, ...from) || !walkable(rows, ...to)) return Infinity
  const fromIndex = from[1] * width + from[0]
  const goalIndex = to[1] * width + to[0]
  distances[fromIndex] = 0
  push([0, fromIndex])
  while (queue.length) {
    if (stats) stats.peak = Math.max(stats.peak, queue.length)
    const [distance, index] = pop()
    if (distance !== distances[index]) continue
    if (stats) stats.expanded++
    if (index === goalIndex) return distance
    const x = index % width
    const z = Math.floor(index / width)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || !walkable(rows, x + dx, z + dz)) continue
        if (dx && dz && (!diagonals || !walkable(rows, x + dx, z) || !walkable(rows, x, z + dz))) continue
        const next = (z + dz) * width + x + dx
        const total = distance + (dx && dz ? Math.SQRT2 : 1)
        if (total < distances[next]) {
          distances[next] = total
          push([total, next])
        }
      }
    }
  }
  return Infinity
}

const toPoint = ([x, z]: Cell, scale = CELL_SIZE): Point => [(x + 0.5) * scale, 0, (z + 0.5) * scale]
function toSurfaces(rows: readonly string[], scale = CELL_SIZE, cellQuads = false): Surface[] {
  const surfaces: Surface[] = []
  for (let z = 0; z < rows.length; z++) {
    let start = -1
    for (let x = 0; x <= rows[z].length; x++) {
      if (walkable(rows, x, z)) {
        if (cellQuads) {
          surfaces.push(floor(x * scale, (x + 1) * scale, z * scale, (z + 1) * scale))
          continue
        }
        if (start === -1) start = x
      } else if (start >= 0) {
        surfaces.push(floor(start * scale, x * scale, z * scale, (z + 1) * scale))
        start = -1
      }
    }
  }
  return surfaces
}

function wallSurfaces(rows: readonly string[], scale = CELL_SIZE): Surface[] {
  const surfaces: Surface[] = []
  for (let z = 0; z < rows.length; z++) {
    for (let x = 0; x < rows[z].length; x++) {
      if (walkable(rows, x, z)) continue
      const left = x * scale
      const right = left + scale
      const front = z * scale
      const back = front + scale
      const vertices: Point[] = [
        [left, 0, front], [left, 0, back], [right, 0, back], [right, 0, front],
        [left, 1.8, front], [left, 1.8, back], [right, 1.8, back], [right, 1.8, front]
      ]
      surfaces.push({ vertices, triangles: [
        4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3, 3, 7, 6, 3, 6, 2,
        2, 6, 5, 2, 5, 1, 1, 5, 4, 1, 4, 0, 0, 3, 2, 0, 2, 1
      ] })
    }
  }
  return surfaces
}

function legal(route: Route, rows: readonly string[], sample: Sample, scale = CELL_SIZE) {
  if (route.status !== 'complete' || route.points.length === 0) return false
  const cell = ([x, , z]: Point): Cell => [Math.floor(x / scale), Math.floor(z / scale)]
  if (cell(route.points[0]).join() !== sample.start.join() ||
      cell(route.points[route.points.length - 1]).join() !== sample.goal.join()) return false
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]
    const b = route.points[i]
    const count = Math.ceil(Math.hypot(a[0] - b[0], a[2] - b[2]) / 0.03)
    for (let j = 0; j <= count; j++) {
      const t = j / Math.max(1, count)
      if (!walkable(rows, ...cell([a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t]))) return false
    }
  }
  return true
}

function parseMap(path: string) {
  const text = readFileSync(path, 'utf8').trimEnd().split(/\r?\n/)
  const offset = text.indexOf('map')
  const rows = text.slice(offset + 1)
  const width = Number(text.find((line) => line.startsWith('width '))?.split(/\s+/)[1])
  const height = Number(text.find((line) => line.startsWith('height '))?.split(/\s+/)[1])
  if (offset < 0 || width < 1 || height < 1 || rows.length !== height || rows.some((row) => row.length !== width)) {
    throw new Error('Malformed Moving AI map: ' + path)
  }
  return { rows, width, height }
}

function load(name: string, mode: string) {
  try {
    const data = dataDirectory()
    const directory = readdirSync(data)
    const map = directory.find((file) => file === name + '.map')
    const scene = readdirSync(resolve(data, 'scen-' + mode)).find((file) => file === name + '-' + mode + '-1.scen')
    if (!map || !scene) return undefined
    const { rows, width, height } = parseMap(resolve(data, map))
    const [header, ...entries] = readFileSync(resolve(data, 'scen-' + mode, scene), 'utf8').trimEnd().split(/\r?\n/)
    if (!entries.length || !/^version 1(?:\.0)?$/.test(header.trim())) throw new Error('Malformed Moving AI scenario for ' + name)
    const samples = entries.map((line): Sample => {
      const fields = line.trim().split(/\s+/)
      const [x1, z1, x2, z2, cost] = fields.slice(4, 9).map(Number)
      if (fields[1] !== map || Number(fields[2]) !== width || Number(fields[3]) !== height ||
          ![x1, z1, x2, z2].every(Number.isSafeInteger) ||
          !walkable(rows, x1, z1) || !walkable(rows, x2, z2) || !Number.isFinite(cost)) {
        throw new Error('Invalid Moving AI scenario row for ' + name + ': ' + line)
      }
      return { start: [x1, z1], goal: [x2, z2], cost }
    })
    return { rows, samples }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function fromMovingAI(
  name: string, mode: string, choose: (samples: Sample[]) => Sample[],
  representation: 'merged' | 'cells' | 'walls' = 'merged'
) {
  return (backend: Parameters<CatalogCase['run']>[0]) => {
    const beganLoading = performance.now()
    const input = load(name, mode)
    const loadMs = performance.now() - beganLoading
    if (!input) return missing('Missing local Moving AI map or first scenario: ' + name)
    const { rows, samples: sourceSamples } = input
    const samples = choose(sourceSamples)
    if (!samples.length) return missing('No selected Moving AI queries for ' + name)
    let matches = 0
    let defaultLegal = 0
    let expandedLegal = 0
    const start = performance.now()
    const queryTimes: number[] = []
    const stats = { expanded: 0, peak: 0 }
    const faces = toSurfaces(rows, CELL_SIZE, representation !== 'merged')
    if (representation === 'walls') faces.push(...wallSurfaces(rows))
    let longestRoute = 0
    let maximumWaypoints = 0
    let stretchTotal = 0
    let builtMs = 0
    const rssBefore = process.memoryUsage.rss()
    let rssDelta = 0
    const beganBake = performance.now()

    function record(route: Route, sample: Sample) {
      if (!legal(route, rows, sample)) return false
      const length = pathLength(route)
      longestRoute = Math.max(longestRoute, length)
      maximumWaypoints = Math.max(maximumWaypoints, route.points.length)
      stretchTotal += sample.cost > 0 ? length / (sample.cost * CELL_SIZE) : 1
      return true
    }

    usingMesh(backend, faces, (nav) => {
      builtMs = performance.now() - beganBake
      rssDelta = process.memoryUsage.rss() - rssBefore
      for (const sample of samples) {
        if (Math.abs(gridDistance(rows, sample.start, sample.goal, true, stats) - sample.cost) < 0.0001) matches++
        const began = performance.now()
        const route = nav.route(toPoint(sample.start), toPoint(sample.goal))
        queryTimes.push(performance.now() - began)
        if (record(route, sample)) defaultLegal++
      }
    }, { radius: 0.01, tiled: true })
    if (backend === 'detour' && defaultLegal !== samples.length) {
      longestRoute = 0
      maximumWaypoints = 0
      stretchTotal = 0
      usingMesh(backend, faces, (nav) => {
        for (const sample of samples) {
          if (record(nav.route(toPoint(sample.start), toPoint(sample.goal)), sample)) expandedLegal++
        }
      }, { radius: 0.01, tiled: true, detourLimits: { maxNodes: 16384, maxPathPolys: 4096, maxStraightPathPoints: 4096 } })
    } else {
      expandedLegal = defaultLegal
    }
    queryTimes.sort((a, b) => a - b)
    const p95 = queryTimes[Math.ceil(queryTimes.length * 0.95) - 1]
    const p99 = queryTimes[Math.ceil(queryTimes.length * 0.99) - 1]
    return check(matches === samples.length && expandedLegal === samples.length,
      `${name} (${representation}): grid oracle ${matches}/${samples.length}, legal paths at default ${defaultLegal}/${samples.length}` +
      (backend === 'detour' && defaultLegal !== samples.length ? `, expanded limits ${expandedLegal}/${samples.length}` : '') +
      `, default query p95/p99 ${p95.toFixed(3)}/${p99.toFixed(3)} ms, load ${loadMs.toFixed(1)} ms, bake ${builtMs.toFixed(1)} ms` +
      `, bake RSS delta ${(rssDelta / 2 ** 20).toFixed(1)} MiB, input vertices ${faces.reduce((n, face) => n + face.vertices.length, 0)}` +
      `, longest ${longestRoute.toFixed(2)} m, max waypoints ${maximumWaypoints}, mean route/grid ratio ${(stretchTotal / Math.max(expandedLegal, 1)).toFixed(3)}` +
      `, Dijkstra expanded ${stats.expanded} / peak open ${stats.peak}, full run ${(performance.now() - start).toFixed(1)} ms`)
  }
}

function useMaps(...run: CatalogCase['run'][]): CatalogCase['run'] {
  return async (backend) => {
    const outcomes = await Promise.all(run.map((next) => next(backend)))
    const status = outcomes.some((r) => r.status === 'missing') ? 'missing'
      : outcomes.some((r) => r.status === 'fail') ? 'fail'
      : outcomes.some((r) => r.status === 'unsupported') ? 'unsupported' : 'pass'
    return { status, detail: outcomes.map((r) => r.detail).join(' | ') }
  }
}

const bench = (id: string, run: CatalogCase['run'], coverage?: CatalogCase['coverage']): CatalogCase =>
  ({ id, layer: 'benchmark', run, coverage })

const holeFloors = [floor(0, 4, 0, 8), floor(6, 10, 0, 8), floor(4, 6, 0, 3), floor(4, 6, 5, 8)]
const longest = (samples: Sample[]) => samples.slice().sort((a, b) => b.cost - a.cost).slice(0, 10)
const dungeonSample = (samples: Sample[]) => [...longest(samples), ...samples.slice().sort((a, b) => a.cost - b.cost).slice(0, 10)]

const uRoom: CatalogCase['run'] = (backend) => {
  const rows = ['...........', '..@@@@@@@..', '..@.....@..', '..@.....@..', '..@.....@..', '..@.....@..',
    '...........', '...........']
  const start: Cell = [5, 2]
  const goal: Cell = [5, 0]
  const from = toPoint(start)
  const to = toPoint(goal)
  const oracle = gridDistance(rows, start, goal)
  return usingMesh(backend, toSurfaces(rows), (nav) => {
    const route = nav.route(from, to)
    const first = route.points.find((point) => Math.hypot(point[0] - from[0], point[2] - from[2]) > 0.08)
    const walksAway = first !== undefined && first[2] > from[2] &&
      Math.hypot(first[0] - to[0], first[2] - to[2]) > Math.hypot(from[0] - to[0], from[2] - to[2])
    const throughOpening = crosses(route, 2, 6 * CELL_SIZE, ([x]) => x > 2.8 * CELL_SIZE && x < 8.2 * CELL_SIZE)
    return check(oracle > 14 && walksAway && throughOpening && legal(route, rows, { start, goal, cost: oracle }),
      'Generated U: first significant move away from goal ' + walksAway + ', takes opening ' + throughOpening +
      ', route/grid ratio ' + (pathLength(route) / (oracle * CELL_SIZE)).toFixed(3))
  }, { radius: 0.01, tiled: true })
}

const isolatedGoal: CatalogCase['run'] = (backend) => {
  const rows = Array.from({ length: 5 }, () => '....@@@....')
  const start: Cell = [1, 2]
  const otherIsland: Cell = [8, 2]
  const blockedGoal: Cell = [4, 2]
  const strict = walkable(rows, ...blockedGoal) ? 'query' : 'invalid-before-query'
  return usingMesh(backend, toSurfaces(rows), (nav) => {
    const isolated = nav.route(toPoint(start), toPoint(otherIsland))
    const blocked = toPoint(blockedGoal)
    const snapped = nav.route(toPoint(start), blocked)
    const snappedEnd = snapped.points[snapped.points.length - 1]
    const snapDistance = snappedEnd ? Math.hypot(snappedEnd[0] - blocked[0], snappedEnd[2] - blocked[2]) : Infinity
    const snappedCell = snappedEnd ? [Math.floor(snappedEnd[0] / CELL_SIZE), Math.floor(snappedEnd[2] / CELL_SIZE)] as const : blockedGoal
    return check(gridDistance(rows, start, otherIsland) === Infinity && isolated.status === 'unreachable' &&
      strict === 'invalid-before-query' && snapDistance > 0.1 && snapDistance < 0.55 &&
      legal(snapped, rows, { start, goal: snappedCell, cost: 0 }),
    'Disjoint islands stay unreachable. Strict projection rejects the blocked goal; explicit nearest projection travelled ' +
      snapDistance.toFixed(3) + ' m to a walkable goal cell.')
  }, { radius: 0.01, tiled: true })
}

export const gridCases: CatalogCase[] = [
  bench('G01', (backend) => {
    const rows = ['.@', '@.']
    const a: Cell = [0, 0]
    const b: Cell = [1, 1]
    return usingMesh(backend, toSurfaces(rows), (nav) => check(
      [false, true].every((diagonal) => gridDistance(rows, a, b, diagonal) === Infinity) &&
      nav.route(toPoint(a), toPoint(b)).status === 'unreachable', 'Neither the grid nor the surface permits corner cutting.'), { radius: 0.01 })
  }),
  bench('G02', (backend) => {
    let input: ReturnType<typeof parseMap>
    try {
      input = parseMap(resolve(dataDirectory(), 'arena.map'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return missing(
        'Add the original Moving AI Dragon Age arena.map to DCL_MAPF_DATA (local input only).')
      throw error
    }
    const { rows, width, height } = input
    const sample: Sample = { start: [1, 13], goal: [4, 12], cost: 2 + Math.SQRT2 }
    const scale = 1
    return usingMesh(backend, toSurfaces(rows, scale), (nav) => {
      const path = nav.route(toPoint(sample.start, scale), toPoint(sample.goal, scale))
      return check(width === 49 && height === 49 && Math.abs(gridDistance(rows, sample.start, sample.goal) - sample.cost) < 1e-5 &&
        legal(path, rows, sample, scale),
      'Original 49×49 arena.map and format example (1,13)→(4,12). Octile 2+√2; native endpoints remain in their declared cells.')
    }, { radius: 0.01, tiled: true })
  }),
  bench('G03', useMaps(fromMovingAI('room-32-32-4', 'even', (samples) => {
    const byDistance = samples.slice().sort((a, b) => a.cost - b.cost)
    const decile = Math.ceil(byDistance.length / 10)
    const ratios = samples.slice().sort((a, b) => stretch(b) - stretch(a)).slice(0, 20)
    function stretch(s: Sample) {
      return s.cost / Math.max(1, Math.hypot(s.start[0] - s.goal[0], s.start[1] - s.goal[1]))
    }
    return [...new Set([...byDistance.slice(0, decile), ...byDistance.slice(-decile), ...ratios])]
  }), uRoom), 'adapted'),
  bench('G04', useMaps(...['maze-32-32-2', 'maze-128-128-1'].flatMap((name) =>
    [fromMovingAI(name, 'even', longest, 'cells'), fromMovingAI(name, 'even', longest, 'walls')])), 'adapted'),
  bench('G05', useMaps(...['random-32-32-10', 'random-32-32-20', 'random-64-64-20'].map((name) =>
    fromMovingAI(name, 'even', (samples) => samples.slice(0, 32))), isolatedGoal)),
  bench('G06', useMaps(fromMovingAI('den312d', 'even', dungeonSample, 'cells'),
    fromMovingAI('den312d', 'even', dungeonSample))),
  bench('G07', fromMovingAI('Berlin_1_256', 'random', (s) => s.slice(0, 64))),
  bench('P01', (backend) => usingMesh(backend, holeFloors, (nav) => {
    const symmetric = nav.route([1, 0, 4], [9, 0, 4])
    const biased = nav.route([1, 0, 4.1], [9, 0, 4])
    const shortest = 2 * Math.sqrt(10) + 2
    const perturbed = Math.sqrt(9 + 0.9 ** 2) + Math.sqrt(10) + 2
    return check(symmetric.status === 'complete' && biased.status === 'complete' &&
      [symmetric, biased].every((r) => outsideRect(r, [4, 6, 3, 5])) &&
      pathLength(symmetric) >= shortest - 0.03 && pathLength(biased) >= perturbed - 0.03,
    `All segments avoid the hole; stretch ${(pathLength(symmetric) / shortest).toFixed(3)} and ${(pathLength(biased) / perturbed).toFixed(3)}.`)
  }, { radius: 0.01 })),
  bench('P02', (backend) => {
    const segments = Array.from({ length: 20 }, (_, i) => [i * 0.5, (i + 1) * 0.5] as const)
    const strips = segments.flatMap(([from, to]) => from >= 4 && to <= 6
      ? [floor(from, to, 0, 3), floor(from, to, 5, 8)] : [floor(from, to, 0, 8)])
    const outcomes = [holeFloors, strips].flatMap((faces) => [false, true].map((tiled) => usingMesh(backend, faces,
      (nav) => nav.route([1, 0, 4], [9, 0, 4]), { tiled, radius: 0.01 })))
    return check(outcomes.every((route) => route.status === 'complete' && outsideRect(route, [4, 6, 3, 5]) &&
      pathLength(route) >= 2 * Math.sqrt(10) + 1.97),
    'Four tessellations: lengths ' + outcomes.map((route) => pathLength(route).toFixed(3)).join(', '))
  }),
  bench('P03', (backend) => {
    const start: Point = [1, 0, 2]
    const goal: Point = [7, 0, 2]
    const probes = [0, 0.04].flatMap((margin) => [0.56, 0.64].map((width) => {
      const low = 2 - width / 2
      const high = 2 + width / 2
      const radius = 0.3 + margin
      const possible = high - low > 2 * radius
      const faces = [floor(0, 3, 0, 4), floor(5, 8, 0, 4), floor(3, 5, low, high)]
      const settings = {
        ...NAVIGATION_BAKE, radius, height: 1.4, cellSize: 0.01, cellHeight: 0.05, maxEdgeLength: 80,
        maxSimplificationError: 0.35
      }
      const nav = backend === 'navcat' ? createNavcatNavigatorFromMesh(bakeNavcatMesh(faces, settings))
        : createDetourNavigatorFromMesh(bakeDetourMesh(faces, settings))
      try {
        const route = nav.route(start, goal)
        const accepted = route.status === 'complete'
        const tolerance = 0.005
        const clear = accepted && outsideRect(route, [3, 5, 0, low + radius - tolerance]) &&
          outsideRect(route, [3, 5, high - radius + tolerance, 4]) &&
          crosses(route, 0, 4, ([, , z]) => z >= low + radius - tolerance && z <= high - radius + tolerance)
        return { width, margin, possible, accepted, clear }
      } finally {
        if ('dispose' in nav && typeof nav.dispose === 'function') nav.dispose()
      }
    }))
    return check(probes.map(({ possible }) => possible).join() === 'false,true,false,false' &&
      probes.every(({ possible, accepted, clear }) => possible === accepted && (!accepted || clear)),
    'Exact free-width oracle and swept clearance through a 1 cm bake with/without extra margin: ' + JSON.stringify(probes))
  }),
  bench('P06', queryScaling),
  bench('P07', (backend) => {
    const start = clutterPoint(CLUTTER_START)
    const goal = clutterPoint(CLUTTER_GOAL)
    const tiers = clutterMaps().map(({ density, maps }) => {
      let reachable = 0
      let arrived = 0
      let collisions = 0
      let falselyReachable = 0
      let timeOverReference = 0
      for (const { rows, obstacles } of maps) {
        const cost = gridDistance(rows, CLUTTER_START, CLUTTER_GOAL)
        const route = usingMesh(backend, toSurfaces(rows, CLUTTER_CELL),
          (nav) => nav.route(start, goal), { radius: CLUTTER_RADIUS })
        if (!Number.isFinite(cost)) {
          if (route.status === 'complete') falselyReachable++
          continue
        }
        reachable++
        if (route.status !== 'complete') continue
        const trace = clutterTrace([start, ...route.points])
        if (!legal(route, rows, { start: CLUTTER_START, goal: CLUTTER_GOAL, cost }, CLUTTER_CELL) ||
            trace.slice(1).some(({ position }, i) => clutterOverlap(trace[i].position, position, obstacles))) {
          collisions++
          continue
        }
        const final = trace[trace.length - 1]
        if (Math.hypot(final.position[0] - goal[0], final.position[2] - goal[2]) <= 0.25) {
          arrived++
          timeOverReference += final.time / (cost * CLUTTER_CELL / CLUTTER_SPEED)
        }
      }
      return { density, reachable, unreachable: maps.length - reachable, arrived, collisions, falselyReachable,
        timeRatio: arrived ? timeOverReference / arrived : null }
    })
    return check(tiers.every((tier) => tier.collisions === 0 && tier.falselyReachable === 0 &&
      tier.arrived === tier.reachable),
    '60 shared seeded maps. 30 Hz follower and swept circular capsule, arrival and independent grid time ratio: ' + JSON.stringify(tiers))
  })
]
