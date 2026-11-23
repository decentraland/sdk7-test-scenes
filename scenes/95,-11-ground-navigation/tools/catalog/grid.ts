import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Point, Surface } from '../../src/arena'
import type { Route } from '../../src/navigation'
import { crosses, floor, outsideRect, pathLength, usingMesh } from './ground'
import { check, unsupported, type CatalogCase } from './types'

type Cell = readonly [x: number, z: number]
type Sample = { start: Cell; goal: Cell; cost: number }
const CELL_SIZE = 0.4
const dataDirectory = () => resolve(process.env.DCL_MAPF_DATA ?? '.comparison/movingai')

function walkable(rows: readonly string[], x: number, z: number) {
  const marker = rows[z]?.[x]
  return marker !== undefined && '.GS'.includes(marker)
}

function gridDistance(rows: readonly string[], from: Cell, to: Cell, diagonals = true) {
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
    const [distance, index] = pop()
    if (distance !== distances[index]) continue
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
function toSurfaces(rows: readonly string[], scale = CELL_SIZE): Surface[] {
  const surfaces: Surface[] = []
  for (let z = 0; z < rows.length; z++) {
    let start = -1
    for (let x = 0; x <= rows[z].length; x++) {
      if (walkable(rows, x, z)) {
        if (start === -1) start = x
      } else if (start >= 0) {
        surfaces.push(floor(start * scale, x * scale, z * scale, (z + 1) * scale))
        start = -1
      }
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

function load(name: string, mode: string) {
  try {
    const data = dataDirectory()
    const directory = readdirSync(data)
    const map = directory.find((file) => file === name + '.map')
    const scene = readdirSync(resolve(data, 'scen-' + mode)).find((file) => file === name + '-' + mode + '-1.scen')
    if (!map || !scene) return undefined
    const text = readFileSync(resolve(data, map), 'utf8').trimEnd().split(/\r?\n/)
    const rows = text.slice(text.indexOf('map') + 1)
    const samples = readFileSync(resolve(data, 'scen-' + mode, scene), 'utf8').trimEnd().split(/\r?\n/).slice(1).map((line): Sample => {
      const fields = line.trim().split(/\s+/)
      const [x1, z1, x2, z2, cost] = fields.slice(4, 9).map(Number)
      return { start: [x1, z1], goal: [x2, z2], cost }
    })
    if (!rows.length || !samples.length || rows.some((row) => row.length !== rows[0].length) ||
        samples.some(({ cost }) => !Number.isFinite(cost))) throw new Error('Malformed Moving AI files for ' + name)
    return { rows, samples }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function fromMovingAI(name: string, mode: string, choose: (samples: Sample[]) => Sample[]) {
  return (backend: Parameters<CatalogCase['run']>[0]) => {
    const input = load(name, mode)
    if (!input) return unsupported('Missing local Moving AI map or first scenario: ' + name)
    const samples = choose(input.samples)
    let matches = 0
    let defaultLegal = 0
    let expandedLegal = 0
    const start = performance.now()
    const queryTimes: number[] = []
    const faces = toSurfaces(input.rows)
    usingMesh(backend, faces, (nav) => {
      for (const sample of samples) {
        if (Math.abs(gridDistance(input.rows, sample.start, sample.goal) - sample.cost) < 0.0001) matches++
        const began = performance.now()
        const route = nav.route(toPoint(sample.start), toPoint(sample.goal))
        queryTimes.push(performance.now() - began)
        if (legal(route, input.rows, sample)) defaultLegal++
      }
    }, { radius: 0.01, tiled: true })
    if (backend === 'detour' && defaultLegal !== samples.length) {
      usingMesh(backend, faces, (nav) => {
        for (const sample of samples) {
          if (legal(nav.route(toPoint(sample.start), toPoint(sample.goal)), input.rows, sample)) expandedLegal++
        }
      }, { radius: 0.01, tiled: true, detourLimits: { maxNodes: 16384, maxPathPolys: 4096, maxStraightPathPoints: 4096 } })
    } else {
      expandedLegal = defaultLegal
    }
    queryTimes.sort((a, b) => a - b)
    const p95 = queryTimes[Math.ceil(queryTimes.length * 0.95) - 1]
    return check(matches === samples.length && expandedLegal === samples.length,
      `${name}: grid oracle ${matches}/${samples.length}, legal paths at default ${defaultLegal}/${samples.length}` +
      (backend === 'detour' && defaultLegal !== samples.length ? `, expanded limits ${expandedLegal}/${samples.length}` : '') +
      `, default query p95 ${p95.toFixed(3)} ms, full run ${(performance.now() - start).toFixed(1)} ms`)
  }
}

function useMaps(...run: CatalogCase['run'][]): CatalogCase['run'] {
  return async (backend) => {
    const outcomes = await Promise.all(run.map((next) => next(backend)))
    const status = outcomes.some((r) => r.status === 'fail') ? 'fail'
      : outcomes.some((r) => r.status === 'unsupported') ? 'unsupported' : 'pass'
    return { status, detail: outcomes.map((r) => r.detail).join(' | ') }
  }
}

const bench = (id: string, run: CatalogCase['run'], coverage?: CatalogCase['coverage']): CatalogCase =>
  ({ id, layer: 'benchmark', run, coverage })

const holeFloors = [floor(0, 4, 0, 8), floor(6, 10, 0, 8), floor(4, 6, 0, 3), floor(4, 6, 5, 8)]
const longest = (samples: Sample[]) => samples.slice().sort((a, b) => b.cost - a.cost).slice(0, 10)

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
    const rows = Array.from({ length: 16 }, () => '.'.repeat(16))
    const sample: Sample = { start: [1, 13], goal: [4, 12], cost: 2 + Math.SQRT2 }
    return usingMesh(backend, toSurfaces(rows), (nav) => check(
      Math.abs(gridDistance(rows, sample.start, sample.goal) - sample.cost) < 1e-5 &&
      legal(nav.route(toPoint(sample.start), toPoint(sample.goal)), rows, sample),
      'Octile baseline and row-to-world transform agree on the published coordinate pair.'), { radius: 0.01 })
  }, 'adapted'),
  bench('G03', fromMovingAI('room-32-32-4', 'even', (samples) => {
    const byDistance = samples.slice().sort((a, b) => a.cost - b.cost)
    const decile = Math.ceil(byDistance.length / 10)
    const ratios = samples.slice().sort((a, b) => stretch(b) - stretch(a)).slice(0, 20)
    function stretch(s: Sample) {
      return s.cost / Math.max(1, Math.hypot(s.start[0] - s.goal[0], s.start[1] - s.goal[1]))
    }
    return [...new Set([...byDistance.slice(0, decile), ...byDistance.slice(-decile), ...ratios])]
  }), 'adapted'),
  bench('G04', useMaps(fromMovingAI('maze-32-32-2', 'even', longest), fromMovingAI('maze-128-128-1', 'even', longest)), 'adapted'),
  bench('G05', useMaps(...['random-32-32-10', 'random-32-32-20', 'random-64-64-20'].map((name) =>
    fromMovingAI(name, 'even', (samples) => samples.slice(0, 32)))), 'adapted'),
  bench('G06', fromMovingAI('den312d', 'even', (s) => [...longest(s), ...s.slice().sort((a, b) => a.cost - b.cost).slice(0, 10)]), 'adapted'),
  bench('G07', fromMovingAI('Berlin_1_256', 'random', (s) => s.slice(0, 64)), 'adapted'),
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
    const probes = [0, 0.04].flatMap((margin) => [0.56, 0.64].map((width) => {
      const faces = [floor(0, 3, 0, 4), floor(5, 8, 0, 4), floor(3, 5, 2 - width / 2, 2 + width / 2)]
      return usingMesh(backend, faces, (nav) => nav.route([1, 0, 2], [7, 0, 2]).status, { radius: 0.3 + margin })
    }))
    return check(probes.join() === 'unreachable,complete,unreachable,unreachable',
      'Clearance .56/.64 m with and without .04 margin; observed ' + probes.join(', '))
  }, 'adapted'),
  bench('P06', (backend) => usingMesh(backend, [floor(0, 14, 0, 14)], (nav) => {
    const points: Point[] = Array.from({ length: 121 }, (_, i) => [2 + (i % 11), 0, 2 + Math.floor(i / 11)])
    let state = 71429
    function random(max: number) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state % max
    }
    for (let i = 0; i < 30; i++) nav.route(points[random(121)], points[random(121)])
    let matches = 0
    const percentiles = [121, 5, 1].map((goals) => {
      const times = Array.from({ length: 1000 }, () => {
        const a = points[goals === 1 ? 10 : random(121)]
        const b = points[random(goals)]
        const start = performance.now()
        const r = nav.route(a, b)
        const dt = performance.now() - start
        if (r.status === 'complete' && Math.abs(pathLength(r) - Math.hypot(a[0] - b[0], a[2] - b[2])) < 0.02) matches++
        return dt
      }).sort((a, b) => a - b)
      return [0.5, 0.95, 0.99].map((p) => times[Math.ceil(p * times.length) - 1].toFixed(4)).join('/')
    })
    return check(matches === 3000, `Open-floor oracle ${matches}/3000. p50/p95/p99 ms per workload: ${percentiles.join('; ')}`)
  }), 'adapted'),
  bench('P07', (backend) => {
    const start: Cell = [2, 10]
    const goal: Cell = [17, 10]
    const scale = 0.25
    const radius = 0.045
    let rng = 8312
    const tiers = [0.1, 0.2, 0.3].map((fraction) => {
      let reachable = 0
      let arrived = 0
      let collisions = 0
      let timeOverReference = 0
      for (let attempt = 0; attempt < 20; attempt++) {
        const blocked = new Set<number>()
        while (blocked.size < 400 * fraction) {
          rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0
          const i = (rng >>> 12) % 400
          if (i !== 202 && i !== 217) blocked.add(i)
        }
        const rows = Array.from({ length: 20 }, (_, j) =>
          Array.from({ length: 20 }, (_, i) => blocked.has(j * 20 + i) ? '@' : '.').join(''))
        const cost = gridDistance(rows, start, goal)
        const route = usingMesh(backend, toSurfaces(rows, scale),
          (nav) => nav.route(toPoint(start, scale), toPoint(goal, scale)), { radius })
        if (!Number.isFinite(cost)) {
          if (route.status === 'complete') collisions++
          continue
        }
        reachable++
        if (route.status !== 'complete') continue
        const safe = legal(route, rows, { start, goal, cost }, scale) && [...blocked].every((i) => {
          const x = (i % 20) * scale
          const z = Math.floor(i / 20) * scale
          return outsideRect(route, [x - radius, x + scale + radius, z - radius, z + scale + radius])
        })
        if (!safe) {
          collisions++
          continue
        }
        const end = route.points[route.points.length - 1]
        const target = toPoint(goal, scale)
        if (Math.hypot(end[0] - target[0], end[2] - target[2]) <= 0.25) {
          arrived++
          // At constant speed, route length divided by the grid length equals the time ratio.
          timeOverReference += pathLength(route) / (cost * scale)
        }
      }
      return { fraction, reachable, arrived, collisions, timeRatio: arrived ? timeOverReference / arrived : null }
    })
    return check(tiers.every((tier) => tier.collisions === 0 && tier.arrived === tier.reachable),
      '60 seeded 5 m maps. Arrival, conservative swept clearance and path-time proxy: ' + JSON.stringify(tiers))
  }, 'adapted')
]
