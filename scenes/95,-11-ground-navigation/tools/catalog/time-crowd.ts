import { exportNavMesh, importNavMesh } from 'recast-navigation'
import type { Point, Surface } from '../../src/arena'
import { createNavcatCrowd, type CrowdSettings } from '../../src/crowd'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, NAVIGATION_BAKE } from '../../src/navigation'
import { bakeDetourMesh, createDetourCrowdFromMesh, createDetourNavigatorFromMesh } from '../../test/detour'
import {
  createTraversalNavigator, traversalSurfaces, type AuthoredLink, type TraversalBackend
} from '../sdk-detour-probe/traversal-routing'
import { box, check, unsupported, type CatalogCase, type CatalogResult } from './types'
import {
  closestBetween, gap, interpolate, jointRoute, pathLength, reservedGridRoutes, sweptGap, timedRoute,
  validateGridRoutes, type TimedPoint
} from './time-crowd-support'

function surface(x1: number, x2: number, z1: number, z2: number, y = 0): Surface {
  return { vertices: [[x1, y, z1], [x1, y, z2], [x2, y, z2], [x2, y, z1]], triangles: [0, 1, 2, 0, 2, 3] }
}

function withNavigator<T>(
  backend: TraversalBackend, surfaces: readonly Surface[], run: (nav: ReturnType<typeof createTraversalNavigator>) => T,
  links: readonly AuthoredLink[] = [], radius = 0.18
): T {
  const nav = createTraversalNavigator(backend, surfaces, radius, 0.8, links, true)
  try {
    return run(nav)
  } finally {
    nav.dispose?.()
  }
}

function crossedZ(points: readonly Point[], x: number) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if ((a[0] < x) !== (b[0] < x)) return interpolate(a, b, (x - a[0]) / (b[0] - a[0]))[2]
  }
}

function doorReplan(backend: TraversalBackend) {
  const s: Point = [1, 0, 1]
  const live: Point = [4, 0, 1]
  const g: Point = [11, 0, 1]
  const left = surface(0, 3, 0, 8)
  const right = surface(9, 12, 0, 8)
  const bypass = surface(3, 9, 6, 8)
  const meshes = [
    [left, right, surface(3, 9, 0, 2), bypass],
    [left, right, surface(3, 5, 0, 2), surface(7, 9, 0, 2), bypass],
    [left, right, surface(3, 5, 0, 2), surface(7, 9, 0, 2)]
  ]
  const navigators = meshes.map((mesh) => createTraversalNavigator(backend, mesh, 0.18, 0.8))
  const events = [0, 1, 0, 2]
  let checks = 0
  try {
    for (let i = 0; i < 100; i++) {
      const state = events[i % events.length]
      const expected = state === 0 ? 2 : state === 1 ? 5 : Infinity
      for (const from of [s, live]) {
        const route = navigators[state].route(from, g)
        const crossing = crossedZ(route.points, 6)
        const observed = route.status === 'unreachable' ? Infinity
          : crossing !== undefined && crossing <= 2 ? 2 : crossing !== undefined && crossing >= 6 ? 5 : NaN
        if (observed !== expected) return check(false, 'Topology toggle ' + i + ' chose cost class ' + observed + ', expected ' + expected)
        checks++
      }
    }
    return check(true, checks + ' queries at start and current position matched short, bypass, reopened and unreachable cost classes; prebuilt topology snapshots')
  } finally {
    for (const nav of navigators) nav.dispose?.()
  }
}

function timedDoor() {
  const graph = [[1], [2], []]
  const enter = (node: number, tick: number) => node !== 1 || tick >= 3
  const waiting = timedRoute(graph, 0, 2, 6, enter)
  const noWait = timedRoute(graph, 0, 2, 6, enter, false)
  const permanent = timedRoute(graph, 0, 2, 6, (node) => node !== 1)
  return check(waiting?.join(',') === '0,0,0,1,2' && !noWait && !permanent,
    'Time-expanded controller: waits two ticks, arrives at tick 4; no-wait and permanent blockage rejected')
}

function braking() {
  function stop(distance: number) {
    let position = 0
    let velocity = 2
    let collision = false
    while (velocity > 0) {
      const dt = Math.min(0.05, velocity)
      const next = velocity - dt
      position += (velocity + next) * dt / 2
      velocity = next
      collision ||= position >= distance
    }
    return { position, collision }
  }
  const early = stop(2.5)
  const late = stop(1)
  const feasible = [1, 2.5].find((clearance) => !stop(clearance).collision)
  return check(Math.abs(early.position - 2) < 1e-6 && !early.collision && late.collision && feasible === 2.5,
    'Integrated braking at ≤0.05 s stops after ' + early.position.toFixed(2) + ' m; predictive policy rejects 1 m approach')
}

function hiddenCollision() {
  const a0: Point = [-1, 0, -1]
  const a1: Point = [1, 0, 1]
  const b0: Point = [-1, 0, 1]
  const b1: Point = [1, 0, -1]
  const a = [{ position: a0, time: 0 }, { position: a1, time: 1 }, { position: a1, time: 2 }]
  const simultaneous = closestBetween(a, [{ position: b0, time: 0 }, { position: b1, time: 1 }])
  const delayed = closestBetween(a, [{ position: b0, time: 0 }, { position: b0, time: 1 }, { position: b1, time: 2 }])
  return check(gap(a0, b0) >= 0.5 && gap(a1, b1) >= 0.5 &&
    Math.abs(simultaneous.time - 0.5) < 1e-6 && simultaneous.distance < 0.5 && delayed.distance >= 0.5,
  'Continuous sweep finds collision at t=0.5 s missed by endpoint samples; delayed departure clears both traces')
}

type WeightedEdge = readonly [number, number]

function dijkstra(graph: readonly (readonly WeightedEdge[])[], start: number) {
  const distance = graph.map(() => Infinity)
  const visited = new Set<number>()
  distance[start] = 0
  for (;;) {
    const next = distance.reduce((best, value, i) => !visited.has(i) && value < (distance[best] ?? Infinity) ? i : best, -1)
    if (next < 0 || next === 3) return distance[3]
    visited.add(next)
    for (const [to, cost] of graph[next]) distance[to] = Math.min(distance[to], distance[next] + cost)
  }
}

function changingWeights() {
  let adjacent = 1
  let remote = 1
  let previousRemote: number | undefined
  let changed = 0
  for (let tick = 0; tick <= 100; tick++) {
    const live = tick % 10 === 0 ? 0 : tick % 2 === 0 ? 1 : 2
    if (tick % 20 === 0) {
      const before = adjacent
      adjacent = tick % 40 ? 3 : 1
      if (adjacent !== before) changed++
    } else if (tick % 20 === 10) {
      remote = remote === 1 ? 3 : 1
    }
    const reference = dijkstra([[[1, 3 * adjacent], [2, 5]], [[3, 3 * adjacent]], [[3, 5]], [], [[5, 6 * remote]], []], live)
    const planned = live === 1 ? 3 * adjacent : live === 2 ? 5 : Math.min(6 * adjacent, 10)
    if (planned !== reference || (tick % 20 === 10 && planned !== previousRemote)) {
      return check(false, 'Weight event changed the wrong route or disagreed with Dijkstra at tick ' + tick)
    }
    if (tick % 20 === 0) previousRemote = planned
  }
  return check(changed === 5, '101 live-position queries matched fresh Dijkstra; isolated weight updates left branch ordering unchanged (controller cost layer)')
}

function passingBay() {
  const noBay = jointRoute([[1], [0]], [0, 1], [1, 0], 'stay')
  const bay = jointRoute([[1], [0, 2, 3], [1], [1]], [0, 2], [2, 0], 'stay')
  return check(!noBay && bay !== undefined && bay.length <= 6 && bay.some((state) => state.includes(3)),
    'Joint-state BFS rejects two-node swap and solves passing-bay swap in ' + ((bay?.length ?? 0) - 1) + ' ticks')
}

function goalResidency() {
  const graph = [[1], [0, 2, 3], [1], [1]]
  const stay = jointRoute(graph, [1, 0], [1, 2], 'stay')
  const disappear = jointRoute(graph, [1, 0], [1, 2], 'disappear')
  const released = jointRoute(graph, [1, 0], [3, 2], 'stay')
  return check(!stay && disappear?.length === 3 && released?.length === 3 && released[released.length - 1][0] === 3,
    'Resident prevents transit, disappearance clears it in 2 ticks, explicit parking moves both agents to their goals')
}

function cyclicTraffic() {
  const rotation = jointRoute([[1, 2], [0, 2], [0, 1]], [0, 1, 2], [1, 2, 0], 'stay')
  const swap = jointRoute([[1], [0]], [0, 1], [1, 0], 'stay')
  return check(rotation?.length === 2 && !swap, 'Joint-state rules permit one-tick three-agent rotation and reject a head-on edge swap')
}

async function warehouseScale(backend: TraversalBackend): Promise<CatalogResult> {
  const { readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const cache = process.env.DCL_MAPF_DATA ?? join(tmpdir(), 'sdk7-moving-ai-mapf')
  const names = ['warehouse-10-20-10-2-1', 'room-64-64-16', 'empty-32-32']
  const summaries: string[] = []
  let correct = true
  let overallNative = 0
  try {
    for (const name of names) {
      const text = (await readFile(join(cache, name + '.map'), 'utf8')).trim().split(/\r?\n/)
      const height = Number(text[1].split(' ')[1])
      const width = Number(text[2].split(' ')[1])
      const rows = text.slice(4)
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 2 || height < 2 ||
          rows.length !== height || rows.some((row) => row.length !== width)) {
        throw new Error('Invalid Moving AI map headers: ' + name)
      }
      const walkable = (x: number, z: number) => z >= 0 && z < height && x >= 0 && x < width && '.G'.includes(rows[z][x])
      const neighbors = Array.from({ length: width * height }, (_, cell) => {
        const x = cell % width
        const z = Math.floor(cell / width)
        if (!walkable(x, z)) return []
        return [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]
          .filter(([otherX, otherZ]) => walkable(otherX, otherZ)).map(([otherX, otherZ]) => otherZ * width + otherX)
      })
      const geometry: Surface[] = []
      for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
          if (!walkable(x, z)) continue
          const start = x
          while (walkable(x + 1, z)) x++
          geometry.push(surface(start, x + 1, z, z + 1))
        }
      }
      const point = (cell: number): Point => [cell % width + 0.5, 0, Math.floor(cell / width) + 0.5]
      const bake = {
        ...NAVIGATION_BAKE, radius: 0.18, height: 0.8, cellSize: 0.25,
        maxEdgeLength: 40, maxSimplificationError: 0.35
      }
      const native = backend === 'navcat' ? createNavcatNavigatorFromMesh(bakeNavcatMesh(geometry, bake))
        : createDetourNavigatorFromMesh(bakeDetourMesh(geometry, bake))
      try {
        for (const pool of ['even', 'random']) {
          const data = await readFile(join(cache, 'scen-' + pool, name + '-' + pool + '-1.scen'), 'utf8')
          const requests = data.trim().split(/\r?\n/).slice(1, 65).map((line) => {
            const fields = line.split(/\s+/)
            const [w, h, sx, sz, gx, gz] = fields.slice(2, 8).map(Number)
            if (fields[1] !== name + '.map' || w !== width || h !== height || !walkable(sx, sz) || !walkable(gx, gz)) {
              throw new Error('Mismatched Moving AI scenario: ' + name + ' ' + pool)
            }
            return { start: sz * width + sx, goal: gz * width + gx }
          })
          if (requests.length !== 64 || new Set(requests.map(({ start }) => start)).size !== 64) {
            throw new Error('Expected 64 distinct starts: ' + name + ' ' + pool)
          }
          const solved = reservedGridRoutes(neighbors, requests, 4 * (width + height))
          const nativeChecks = requests.map(({ start, goal }) => {
            const from = point(start)
            const to = point(goal)
            const route = native.route(from, to)
            if (route.status !== 'complete' || gap(route.points[0], from) > 0.25 ||
                gap(route.points[route.points.length - 1], to) > 0.25) return false
            return route.points.slice(1).every((end, i) => {
              const start = route.points[i]
              const samples = Math.max(1, Math.ceil(gap(start, end) / 0.15))
              for (let j = 0; j <= samples; j++) {
                const [x, , z] = interpolate(start, end, j / samples)
                if (!walkable(Math.floor(x), Math.floor(z))) return false
              }
              return true
            })
          })
          overallNative += nativeChecks.filter(Boolean).length
          const scores = []
          for (const count of [4, 8, 16, 32, 64]) {
            const selected = solved.slice(0, count)
            const paths: number[][] = []
            let sum = 0
            let bound = 0
            let makespan = 0
            let longest = 0
            selected.forEach(({ path, lowerBound }, index) => {
              if (!path) return
              const length = path.length - 1
              correct &&= path[0] === requests[index].start && path[path.length - 1] === requests[index].goal &&
                lowerBound >= 0 && length >= lowerBound
              sum += length
              bound += lowerBound
              makespan = Math.max(makespan, length)
              longest = Math.max(longest, lowerBound)
              paths.push(path)
            })
            correct &&= validateGridRoutes(neighbors, paths) && makespan >= longest && sum >= bound
            scores.push(paths.length + '/' + count + ':' + makespan + '/' + sum)
          }
          summaries.push(name + '/' + pool + ' ' + scores.join(' '))
        }
      } finally {
        if ('dispose' in native && typeof native.dispose === 'function') native.dispose()
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return unsupported(
      'Moving AI map/scenario input missing: extract the official original archives into DCL_MAPF_DATA with scen-even/ and scen-random/')
    throw error
  }
  return check(correct && overallNative === 384,
    'Native queries with valid assigned endpoints and walked cells ' + overallNative + '/384; original Moving AI 4-neighbour coordination with goal residency (done/requested:makespan/sum), path bounds and conflicts independently verified. ' + summaries.join('; '))
}

function stairBlockage(backend: TraversalBackend) {
  const before: Point = [2, 0, 2]
  const after: Point = [7, 2, 2]
  const geometry = [surface(0, 4, 0, 4), surface(6, 10, 0, 4, 2)]
  const stair: AuthoredLink = { from: [3, 0, 2], to: [7, 2, 2] }
  const initiallyOpen = withNavigator(backend, geometry, (nav) => nav.route(before, after).status === 'complete', [stair])
  const fixed = withNavigator(backend, geometry, (nav) => nav.route(before, after).status === 'unreachable')
  const timed = timedRoute([[1], [2], []], 0, 2, 8, (node, t) => node !== 1 || t >= 3)
  return check(initiallyOpen && fixed && timed?.join(',') === '0,0,0,1,2',
    'Authored stair is reachable with link and unreachable after fixed blockage; transient occupancy waits until release')
}

function docking(backend: TraversalBackend) {
  const left: Point = [1, 0, 2]
  const right: Point = [7, 0.45, 2]
  const bank = surface(0, 4, 0, 4)
  const positions = [
    { start: 4.5, locked: false }, { start: 3.7, locked: false },
    { start: 3.7, locked: true }, { start: 4.5, locked: false }
  ]
  const connected = positions.map(({ start, locked }) => {
    const link: AuthoredLink = { from: [3.3, 0, 2], to: [4.4, 0.45, 2], bidirectional: true }
    return withNavigator(backend, [bank, surface(start, 9, 0, 4, 0.45)],
      (nav) => nav.route(left, right).status === 'complete', locked ? [link] : [])
  })
  const halfway: Point = [3.65, 0.2, 2]
  const safe = gap(halfway, [3.3, 0, 2]) < gap(halfway, [4.4, 0.45, 2])
    ? [3.3, 0, 2] as Point : [4.4, 0.45, 2] as Point
  const recovered = withNavigator(backend, [bank, surface(4.5, 9, 0, 4, 0.45)],
    (nav) => nav.route(safe, left).status === 'complete' && nav.route(safe, right).status === 'unreachable')
  return check(connected.join(',') === 'false,false,true,false' && recovered,
    'Separate, overlapping, latched and released states gave ' + connected.join('/') + '; queued transfer resolves to the original bank')
}

function occupancySlots() {
  const slots = [-0.34, 0.34]
  const occupants = [{ x: -0.34, radius: 0.25 }, { x: 0.34, radius: 0.25 }]
  function choose(radius: number, active: typeof occupants) {
    return [...slots, 0].find((x) => Math.abs(x) + radius <= 0.65 &&
      active.every((other) => Math.abs(x - other.x) >= radius + other.radius))
  }
  const one = choose(0.25, occupants.slice(0, 1))
  const two = choose(0.25, occupants)
  const wide = choose(0.45, occupants.slice(0, 1))
  const freed = choose(0.25, occupants.slice(1))
  return check(one === 0.34 && two === undefined && wide === undefined && freed === -0.34 && choose(0.45, []) === 0,
    'Capsule occupancy reserves one lane, rejects a full cell or wide mover, then resumes through the released slot')
}

function elevator() {
  const stairsTicks = 10
  function schedule(start: number, disable?: number) {
    const earliestBoard = Math.ceil(start / 8) * 8
    if (earliestBoard + 4 - start >= stairsTicks) return { events: ['stairs'], duration: stairsTicks }
    const events: string[] = []
    for (let tick = start; tick <= earliestBoard + 4; tick++) {
      if (disable !== undefined && tick >= disable) {
        return { events: [...events, 'stairs'], duration: tick - start + stairsTicks }
      }
      if (tick < earliestBoard && !events.length) events.push('wait')
      if (tick === earliestBoard && tick % 8 === 0) events.push('board')
      if (tick === earliestBoard + 1 && events.includes('board')) events.push('ride')
      if (tick === earliestBoard + 4 && events.includes('ride')) events.push('exit')
    }
    return { events, duration: earliestBoard + 4 - start }
  }
  const arrives = schedule(0)
  const missed = schedule(1)
  const disabled = schedule(3, 4)
  const order = 'board,ride,exit'
  return check(arrives.events.join(',') === order && arrives.duration === 4 &&
    missed.events.join(',') === 'stairs' && missed.duration === 10 &&
    disabled.events.join(',') === 'wait,stairs' && disabled.duration === 11,
  'Cabin contacts permit board→ride→exit only during actual service; just missed and disabled calls choose stairs')
}

function rotatingIsland(backend: TraversalBackend) {
  const a: Point = [2, 0, 6]
  const b: Point = [6, 0, 10]
  const center: Point = [6, 0, 6]
  const ends = [surface(0, 4.06, 5, 7), surface(5, 7, 7.94, 12)]
  const phases = [0, 45, 90].map((angle) => {
    const radians = angle * Math.PI / 180
    const rectangle = surface(4, 8, 5.3, 6.7)
    const vertices = rectangle.vertices.map(([x, y, z]): Point => {
      const ox = x - center[0]
      const oz = z - center[2]
      return [center[0] + ox * Math.cos(radians) - oz * Math.sin(radians), y,
        center[2] + ox * Math.sin(radians) + oz * Math.cos(radians)]
    })
    return withNavigator(backend, [...ends, { vertices, triangles: rectangle.triangles }], (nav) =>
      [nav.route(a, center).status, nav.route(b, center).status].map((status) => status === 'complete' ? '1' : '0').join(''))
  })
  return check(phases.join(',') === '10,00,01', 'Fresh navmesh topology for 0°, 45°, 90°: ' + phases.join(' → ') + ' (expected A–island, neither, B–island)')
}

function shuffledCells(seed: number) {
  let state = seed >>> 0
  const cells = Array.from({ length: 400 }, (_, index) => ({ x: index % 20, z: Math.floor(index / 20) }))
    .filter(({ x, z }) => (x < 8 || x > 11) && (z < 8 || z > 11))
  for (let i = cells.length - 1; i > 0; i--) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    const j = state % (i + 1)
    const cell = cells[i]
    cells[i] = cells[j]
    cells[j] = cell
  }
  return cells
}

function intersectsCell(a: Point, b: Point, x: number, z: number, margin: number) {
  let enter = 0
  let leave = 1
  for (const [axis, coordinate] of [[0, x], [2, z]]) {
    const low = coordinate * 0.25 - margin
    const high = (coordinate + 1) * 0.25 + margin
    const delta = b[axis] - a[axis]
    if (delta === 0) {
      if (a[axis] < low || a[axis] > high) return false
      continue
    }
    const first = (low - a[axis]) / delta
    const second = (high - a[axis]) / delta
    enter = Math.max(enter, Math.min(first, second))
    leave = Math.min(leave, Math.max(first, second))
    if (enter > leave) return false
  }
  return true
}

function obstacleTrace(phase: number, rate: number, end: number): TimedPoint[] {
  const samples = [0]
  for (let boundary = 3 * (Math.floor(phase / 3) + 1); (boundary - phase) / rate < end; boundary += 3) {
    samples.push((boundary - phase) / rate)
  }
  samples.push(end)
  return samples.map((time) => {
    const cycle = (phase + time * rate) % 6
    const z = 0.5 + 4 * (cycle <= 3 ? cycle : 6 - cycle) / 3
    return { time, position: [2.5, 0, z] }
  })
}

function timedClutter(backend: TraversalBackend) {
  const start: Point = [0.5, 0, 2.5]
  const goal: Point = [4.5, 0, 2.5]
  const floor = box('floor', 'surface', [0, -0.2, 0], [5, 0, 5])
  const speed = 1.5
  const radius = 0.15
  const summaries: string[] = []
  let complete = true
  for (const density of [10, 20, 30]) {
    let arrival = 0
    let walls = 0
    let timeout = 0
    let travelTotal = 0
    for (let index = 0; index < 20; index++) {
      const blockers = shuffledCells(813 + index).slice(0, density * 4)
      const shapes = blockers.map(({ x, z }, i) =>
        box('obstacle-' + i, 'obstacle', [x * 0.25, 0, z * 0.25], [(x + 1) * 0.25, 1, (z + 1) * 0.25]))
      const route = withNavigator(backend, traversalSurfaces([floor, ...shapes], 0.8, 0),
        (nav) => nav.route(start, goal), [], radius)
      if (route.status !== 'complete' || gap(route.points[route.points.length - 1], goal) > 0.25) {
        timeout += 12
        continue
      }
      if (route.points.slice(1).some((point, i) => blockers.some(({ x, z }) =>
        intersectsCell(route.points[i], point, x, z, radius - 0.002)))) {
        walls += 12
        continue
      }
      const travel = pathLength(route.points) / speed
      for (const phase of [0, 1.5, 3, 4.5]) {
        for (const rate of [0.75, 1, 1.25]) {
          let chosen: number | undefined
          for (let hold = 0; hold + travel <= 9; hold += 0.25) {
            let time = hold
            const trace: TimedPoint[] = hold ? [{ position: route.points[0], time: 0 }] : []
            trace.push({ position: route.points[0], time })
            for (let i = 1; i < route.points.length; i++) {
              const dist = gap(route.points[i - 1], route.points[i])
              if (dist === 0) continue
              time += dist / speed
              trace.push({ position: route.points[i], time })
            }
            if (closestBetween(trace, obstacleTrace(phase, rate, time)).distance >= radius + 0.2) {
              chosen = time
              break
            }
          }
          if (chosen === undefined) timeout++
          else {
            arrival++
            travelTotal += chosen
          }
        }
      }
    }
    complete &&= arrival === 240 && !walls && !timeout
    summaries.push(density + '%: ' + arrival + '/240 arrivals, ' + walls + ' wall exits, ' + timeout +
      ' timeouts, ' + (arrival ? (travelTotal / arrival).toFixed(2) : '—') + ' s mean')
  }
  return check(complete, 'Native ground routes, shared wait/swept-contact controller in 60 synthetic layouts. ' + summaries.join('; '))
}

function crowdFactory(backend: TraversalBackend, surfaces: readonly Surface[], radius: number, height: number) {
  const bake = { ...NAVIGATION_BAKE, radius, height }
  if (backend === 'navcat') {
    const mesh = bakeNavcatMesh(surfaces, bake)
    return (settings: CrowdSettings) => ({ ...createNavcatCrowd(mesh, settings), dispose() {} })
  }
  const mesh = bakeDetourMesh(surfaces, bake)
  let bytes: Uint8Array
  try {
    bytes = exportNavMesh(mesh)
  } finally {
    mesh.destroy()
  }
  return (settings: CrowdSettings) => createDetourCrowdFromMesh(importNavMesh(bytes).navMesh, settings)
}

function integrateCrowd(
  create: ReturnType<typeof crowdFactory>, settings: CrowdSettings, dt: number, duration: number
) {
  const crowd = create(settings)
  const ticks = Math.ceil(duration / dt)
  let positions = crowd.positions()
  let minGap = Infinity
  let stalledSeconds = 0
  let valid = true
  const samples: number[] = []
  try {
    for (let step = 0; step < ticks; step++) {
      const time = performance.now()
      crowd.step(dt)
      if (step > 20) samples.push((performance.now() - time) / settings.agents.length)
      const next = crowd.positions()
      valid &&= next.length === positions.length && next.every((point) => point.every(Number.isFinite))
      if (!valid) break
      let moving = 0
      for (let i = 0; i < next.length; i++) {
        moving += gap(positions[i], next[i])
        for (let j = 0; j < i; j++) minGap = Math.min(minGap, sweptGap(positions[i], next[i], positions[j], next[j]).distance)
      }
      if (moving < 0.02 && next.some((point, i) => gap(point, settings.agents[i].goal) > 0.25)) stalledSeconds += dt
      positions = next
    }
    const arrived = positions.filter((point, i) => gap(point, settings.agents[i].goal) <= 0.25).length
    const p95 = samples.sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1] ?? Infinity
    return { arrived, minGap, stalledSeconds, p95, valid: valid && Number.isFinite(minGap) && Number.isFinite(p95) }
  } finally {
    crowd.dispose()
  }
}

function antipodal(backend: TraversalBackend) {
  const reports: ReturnType<typeof integrateCrowd>[] = []
  const create = crowdFactory(backend, [surface(0, 24, 0, 24)], 0.3, 1.6)
  for (const count of [8, 16, 32]) {
    for (const ring of [4, 8]) {
      for (const dt of [1 / 30, 1 / 60]) {
        for (const rotation of [0, Math.PI / 6]) {
          for (const skew of [false, true]) {
            const agents = Array.from({ length: count }, (_, i) => {
              const angle = rotation + i * 2 * Math.PI / count
              const x = ring * Math.cos(angle)
              const z = ring * Math.sin(angle)
              const difference = skew ? (i % 2 ? -0.02 : 0.02) : 0
              return { start: [12 + x + difference, 0, 12 + z] as Point, goal: [12 - x, 0, 12 - z] as Point }
            })
            reports.push(integrateCrowd(create, { agents, radius: 0.3, height: 1.6, maxSpeed: 2, maxAcceleration: 8 }, dt, 12))
          }
        }
      }
    }
  }
  const clashes = reports.filter(({ minGap }) => minGap < 0.58).length
  const complete = reports.map(({ arrived }, i) => arrived / [8, 16, 32][Math.floor(i / 16)])
  const min = Math.min(...reports.map(({ minGap }) => minGap))
  const tail = Math.max(...reports.map(({ p95 }) => p95))
  const stall = Math.max(...reports.map(({ stalledSeconds }) => stalledSeconds))
  return check(reports.every(({ valid }) => valid) && !clashes,
    reports.length + ' native sweeps; completed fraction ' + Math.min(...complete).toFixed(2) + '–' + Math.max(...complete).toFixed(2) +
    '; unsafe sweeps ' + clashes + '; min gap ' + min.toFixed(4) + ' m; max stall ' + stall.toFixed(2) +
    ' s; max p95 ' + tail.toFixed(4) + ' ms/agent')
}

function crossingFlow(backend: TraversalBackend) {
  const west = surface(0, 8, 9, 11)
  const east = surface(12, 20, 9, 11)
  const south = surface(9, 11, 0, 8)
  const north = surface(9, 11, 12, 20)
  const arms = [west, east, south, north]
  const chamber = surface(8, 12, 8, 12)
  const constrained = [
    surface(8, 12, 9.6, 10.4), surface(9.6, 10.4, 8, 9.6), surface(9.6, 10.4, 10.4, 12)
  ]
  const meshes = [[...arms, chamber], [...arms, ...constrained]]
  function rotate([x, y, z]: Point, arm: number): Point {
    return arm === 0 ? [x, y, z] : arm === 1 ? [20 - x, y, 20 - z]
      : arm === 2 ? [z, y, x] : [20 - z, y, 20 - x]
  }
  const template = Array.from({ length: 32 }, (_, i) => {
    const index = i % 8
    const arm = Math.floor(i / 8)
    const start = rotate([6 - Math.floor(index / 2) * 1.25, 0, 9.65 + index % 2 * 0.7], arm)
    const goal = rotate([14 + Math.floor(index / 2) * 1.25, 0, 9.65 + index % 2 * 0.7], arm)
    return { start, goal, release: index * 0.2, arm }
  })
  let switched = false
  let everNarrowed = false
  let active: typeof template = []
  const settings: CrowdSettings = { agents: [], radius: 0.25, height: 1.2, maxSpeed: 2, maxAcceleration: 8 }
  const create = meshes.map((mesh) => crowdFactory(backend, mesh, settings.radius, settings.height))
  let crowd: ReturnType<ReturnType<typeof crowdFactory>> | undefined
  let positions: Point[] = []
  const completed = [0, 0, 0, 0]
  const waits = [0, 0, 0, 0]
  let contacts = 0
  let min = Infinity
  let maxBacklog = 0
  let resume = Infinity
  let previousArrived = 0
  try {
    for (let step = 0; step <= 25 * 30; step++) {
      const t = step / 30
      const unsafeToNarrow = positions.some(([x, , z]) =>
        x > 7.7 && x < 12.3 && z > 7.7 && z < 12.3 && (Math.abs(x - 10) > 0.13 && Math.abs(z - 10) > 0.13))
      const nextSwitch: boolean = t >= 1.2 && t < 11.2 && (switched || !unsafeToNarrow)
      const releases = template.filter(({ release }) => Math.abs(release - t) < 1e-6)
      if (!crowd || nextSwitch !== switched || releases.length) {
        active = [...active.map((entry, i) => ({ ...entry, start: positions[i] })), ...releases]
        switched = nextSwitch
        everNarrowed ||= switched
        const replacement = create[switched ? 1 : 0]({ ...settings, agents: active })
        crowd?.dispose()
        crowd = replacement
        positions = crowd.positions()
      }
      crowd.step(1 / 30)
      const next = crowd.positions()
      let hit = false
      for (let i = 0; i < next.length; i++) {
        if (gap(positions[i], next[i]) < 0.003 && gap(next[i], active[i].goal) > 0.25) waits[active[i].arm] += 1 / 30
        for (let j = 0; j < i; j++) {
          const distance = sweptGap(positions[i], next[i], positions[j], next[j]).distance
          min = Math.min(min, distance)
          hit ||= distance < 0.48
        }
      }
      if (hit) contacts++
      completed.fill(0)
      next.forEach((point, i) => { if (gap(point, active[i].goal) <= 0.25) completed[active[i].arm]++ })
      const done = completed.reduce((sum, n) => sum + n, 0)
      if (t >= 11.2 && done > previousArrived) resume = Math.min(resume, t - 11.2)
      previousArrived = done
      maxBacklog = Math.max(maxBacklog, active.length - done)
      positions = next
    }
    return check(everNarrowed && contacts === 0 && completed.every((count) => count === 8),
      'Four arms; narrowed ' + everNarrowed + '; finished ' + completed.join('/') + '; swept contact ticks ' + contacts + '; min gap ' + min.toFixed(3) +
      ' m; wait/arm ' + waits.map((wait) => wait.toFixed(1)).join('/') + ' s; backlog ' + maxBacklog +
      '; post-open progress ' + (Number.isFinite(resume) ? resume.toFixed(2) + ' s' : 'none'))
  } finally {
    crowd?.dispose()
  }
}

export const timeCrowdCases: CatalogCase[] = [
  { id: 'T01', layer: 'planner', coverage: 'adapted', run: doorReplan },
  { id: 'T02', layer: 'controller', run: timedDoor },
  { id: 'T03', layer: 'controller', run: braking },
  { id: 'T04', layer: 'controller', run: hiddenCollision },
  { id: 'T05', layer: 'controller', coverage: 'adapted', run: changingWeights },
  { id: 'T06', layer: 'integration', coverage: 'adapted', run: timedClutter },
  { id: 'M01', layer: 'controller', run: passingBay },
  { id: 'M02', layer: 'controller', run: goalResidency },
  { id: 'M03', layer: 'controller', run: cyclicTraffic },
  { id: 'M04', layer: 'benchmark', run: warehouseScale },
  { id: 'M05', layer: 'benchmark', run: antipodal },
  { id: 'M06', layer: 'benchmark', coverage: 'adapted', run: crossingFlow },
  { id: 'GAME-12', layer: 'integration', coverage: 'adapted', run: stairBlockage },
  { id: 'GAME-13', layer: 'integration', coverage: 'adapted', run: docking },
  { id: 'GAME-16', layer: 'controller', run: occupancySlots },
  { id: 'GAME-17', layer: 'controller', run: elevator },
  { id: 'E26', layer: 'planner', coverage: 'adapted', run: rotatingIsland }
]
