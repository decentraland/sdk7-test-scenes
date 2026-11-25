import { exportNavMesh, importNavMesh } from 'recast-navigation'
import type { Point, Surface } from '../../src/arena'
import { createNavcatCrowd, type CrowdSettings } from '../../src/crowd'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, NAVIGATION_BAKE } from '../../src/navigation'
import { advance } from '../../src/traversal/fixtures/mantles-support'
import { bakeDetourMesh, createDetourCrowdFromMesh, createDetourNavigatorFromMesh } from '../../test/detour'
import {
  createTraversalNavigator, traversalSurfaces, type AuthoredLink, type TraversalBackend, type TraversalQueryOptions
} from '../sdk-detour-probe/traversal-routing'
import { CLUTTER_CELL, CLUTTER_GOAL, CLUTTER_RADIUS, CLUTTER_SPEED, CLUTTER_START,
  clutterMaps, clutterOverlap, clutterPoint, clutterTrace, routeThroughClutter } from './clutter'
import { gridDistance, gridRouteProblem } from './grid'
import { liveCrossingFlow } from './time-crowd-gate'
import { outsideRect } from './ground'
import { box, check, missing, type CatalogCase, type CatalogResult } from './types'
import {
  closestBetween, gap, interpolate, jointRoute, pathLength, reservedGridRoutes, sweptGap, timedRoute,
  validateGridRoutes, type TimedPoint
} from './time-crowd-support'

function surface(x1: number, x2: number, z1: number, z2: number, y = 0): Surface {
  return { vertices: [[x1, y, z1], [x1, y, z2], [x2, y, z2], [x2, y, z1]], triangles: [0, 1, 2, 0, 2, 3] }
}

function withNavigator<T>(
  backend: TraversalBackend, surfaces: readonly Surface[], run: (nav: ReturnType<typeof createTraversalNavigator>) => T,
  links: readonly AuthoredLink[] = [], radius = 0.18, options: TraversalQueryOptions = {}
): T {
  const nav = createTraversalNavigator(backend, surfaces, radius, 0.8, links, true, options)
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
  let revision = 0
  let acknowledgementsMs = 0
  let invalidationsMs = 0
  let replansMs = 0
  let maxRecoveryTicks = 0
  const previous = navigators[0].route(s, g)
  const gate: readonly [number, number, number, number] = [4.82, 7.18, 0, 2]
  if (previous.status !== 'complete' || (crossedZ(previous.points, 6) ?? Infinity) > 2 || outsideRect(previous, gate)) {
    for (const nav of navigators) nav.dispose?.()
    return check(false, 'The original route does not use the gate being closed.')
  }
  try {
    for (let i = 0; i < 100; i++) {
      const state = events[i % events.length]
      const old = { revision, route: previous }
      let active: typeof old | undefined = old
      const updateAt = performance.now()
      const navigator = navigators[state]
      revision++
      const acknowledgedAt = performance.now()
      if (active.revision !== revision) active = undefined
      acknowledgementsMs += acknowledgedAt - updateAt
      invalidationsMs += performance.now() - acknowledgedAt
      const expected = dijkstra([[[1, 1], [2, 3]], state === 0 ? [[3, 1]] : [],
        state !== 2 ? [[3, 2]] : [], []], 0)
      for (const from of [s, live]) {
        const queryAt = performance.now()
        const route = navigator.route(from, g)
        replansMs += performance.now() - queryAt
        const crossing = crossedZ(route.points, 6)
        const observed = route.status === 'unreachable' ? Infinity
          : crossing !== undefined && crossing <= 2 ? 2 : crossing !== undefined && crossing >= 6 ? 5 : NaN
        if (observed !== expected) return check(false, 'Topology toggle ' + i + ' chose cost class ' + observed + ', expected ' + expected)
        checks++
        if (from === live) active = { revision, route }
      }
      if (state === 2) {
        if (active?.route.points.length) return check(false, 'A closed network retained motion targets.')
        continue
      }
      if (active?.revision !== revision || active.route.status !== 'complete' ||
          (state === 1 && !outsideRect(active.route, gate))) {
        return check(false, 'The replacement corridor steers through the closed gate at revision ' + revision + '.')
      }
      let feet = live
      let index = 0
      let ticks = 0
      while (index < active.route.points.length && ticks++ < 350) {
        const next = advance(feet, active.route.points[index], 0.1)
        if (state === 1 && !outsideRect({ status: 'complete', points: [feet, next] }, gate)) {
          return check(false, 'Swept follower entered a closed gate.')
        }
        feet = next
        if (feet === active.route.points[index]) index++
      }
      if (index !== active.route.points.length || gap(feet, g) > 0.08) return check(false, 'The recovered follower did not arrive.')
      maxRecoveryTicks = Math.max(maxRecoveryTicks, ticks)
    }
    return check(revision === 100 && checks === 200,
      checks + ' queries at start/live position match fresh Dijkstra. 100 snapshot acknowledgements ' +
      acknowledgementsMs.toFixed(3) + ' ms, invalidation ' + invalidationsMs.toFixed(3) + ' ms, requery ' +
      replansMs.toFixed(3) + ' ms, swept recovery max ' + maxRecoveryTicks + ' ticks; never entered a closed gate.')
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

function changingWeights(backend: TraversalBackend) {
  const goal: Point = [10.75, 0, 3]
  const links: readonly AuthoredLink[] = [
    { from: [2.6, 0, 3], to: [9.4, 0, 3], area: 1 },
    { from: [2.6, 0, 7], to: [9.4, 0, 7], area: 2 },
    { from: [2.6, 0, 15], to: [9.4, 0, 15], area: 3 }
  ]
  const geometry = [surface(0, 3, 0, 10), surface(9, 12, 0, 10), surface(0, 3, 13, 17), surface(9, 12, 13, 17)]
  const navigators = [1, 3].map((short) => [1, 3].map((isolated) =>
    createTraversalNavigator(backend, geometry, 0.18, 0.8, links, true, { costs: { 1: short, 3: isolated } })))
  let adjacent = 1
  let remote = 1
  let changed = 0
  let queried = 0
  let maxCompleteMs = 0
  let previousChoice: number | undefined
  try {
    for (let tick = 0; tick <= 100; tick++) {
      const live: Point = [1.25 + tick % 9 * 0.025, 0, 3 + tick % 7 * 0.08]
      const before = navigators[adjacent === 1 ? 0 : 1][remote === 1 ? 0 : 1]
      if (tick % 20 === 0) {
        const previous = adjacent
        adjacent = tick % 40 ? 3 : 1
        if (adjacent !== previous) changed++
      } else if (tick % 20 === 10) remote = remote === 1 ? 3 : 1
      const began = performance.now()
      const route = navigators[adjacent === 1 ? 0 : 1][remote === 1 ? 0 : 1].route(live, goal)
      maxCompleteMs = Math.max(maxCompleteMs, performance.now() - began)
      queried++
      const crossing = crossedZ(route.points, 6)
      const choice = crossing === undefined ? -1 : Math.abs(crossing - 3) < 0.15 ? 0 : Math.abs(crossing - 7) < 0.15 ? 1 : -1
      const entry = links.slice(0, 2).map(({ from }) => gap(live, from))
      const traversal = links.slice(0, 2).map(({ from, to }, i) => gap(from, to) * (i === 0 ? adjacent : 1) + gap(to, goal))
      const optimum = dijkstra([[[1, entry[0]], [2, entry[1]]], [[3, traversal[0]]], [[3, traversal[1]]], [],
        [[5, gap(links[2].from, links[2].to) * remote]], []], 0)
      const actual = choice < 0 ? Infinity : entry[choice] + traversal[choice]
      if (route.status !== 'complete' || Math.abs(actual - optimum) > 1e-6 ||
          (tick > 0 && tick % 20 === 0 && choice === previousChoice)) {
        return check(false, 'Native weight event chose the wrong branch at tick ' + tick + ', selected ' + choice + '.')
      }
      if (tick % 20 === 10) {
        const unmodified = before.route(live, goal)
        const previous = crossedZ(unmodified.points, 6)
        if (unmodified.status !== route.status || previous === undefined || crossing === undefined || Math.abs(previous - crossing) > 1e-6 ||
            Math.abs(pathLength(unmodified.points) - pathLength(route.points)) > 1e-6) {
          return check(false, 'Weight change on isolated island changed the active path.')
        }
      }
      previousChoice = choice
    }
    return check(changed === 5 && queried === 101,
      '101 native live-position queries matched the independent weighted branch oracle; five adjacent switches, ' +
      'remote changes left length and lane unchanged. Native query atomically exposes first and full points: max ' +
      maxCompleteMs.toFixed(3) + ' ms.')
  } finally {
    for (const row of navigators) for (const nav of row) nav.dispose?.()
  }
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
      // Eight voxels across a one-metre corridor leave room for erosion while
      // still resolving its boundary and the turns around shelves.
      const bake = {
        ...NAVIGATION_BAKE, radius: 0.18, height: 0.8, cellSize: 0.125,
        maxEdgeLength: 40, maxSimplificationError: 0.35
      }
      const native = backend === 'navcat' ? createNavcatNavigatorFromMesh(bakeNavcatMesh(geometry, bake))
        : createDetourNavigatorFromMesh(bakeDetourMesh(geometry, bake), undefined, {
          maxNodes: 16384, maxPathPolys: 4096, maxStraightPathPoints: 4096
        })
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
            return !gridRouteProblem(route, rows, {
              start: [start % width, Math.floor(start / width)], goal: [goal % width, Math.floor(goal / width)]
            }, 1)
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
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return missing(
      'Moving AI map/scenario input missing: extract the official original archives into DCL_MAPF_DATA with scen-even/ and scen-random/')
    throw error
  }
  return check(correct && overallNative === 384,
    'Native queries with valid assigned endpoints and walked cells ' + overallNative + '/384; original Moving AI 4-neighbour coordination with goal residency (done/requested:makespan/sum), path bounds and conflicts independently verified. ' + summaries.join('; '))
}

function stairBlockage(backend: TraversalBackend) {
  const bottom = surface(0, 4, 0, 4)
  const top = surface(8, 12, 0, 4, 2)
  const rise = (x: number) => (x - 4) / 2
  function stair(x0: number, x1: number): Surface {
    return { vertices: [[x0, rise(x0), 1.55], [x0, rise(x0), 2.45], [x1, rise(x1), 2.45], [x1, rise(x1), 1.55]],
      triangles: [0, 1, 2, 0, 2, 3] }
  }
  const before: Point = [4.5, rise(4.5), 2]
  const after: Point = [9, 2, 2]
  const obstruction: Point = [5.2, rise(5.2), 2]
  const radius = 0.25
  const path = withNavigator(backend, [bottom, stair(4, 8), top], (nav) => nav.route(before, after), [], radius, { climb: 0.1 })
  const fixed = withNavigator(backend, [bottom, stair(4, 5.05), stair(5.55, 8), top],
    (nav) => nav.route(before, after).status, [], radius, { climb: 0.1 })
  if (path.status !== 'complete' || gap(path.points[path.points.length - 1], after) > 0.08) {
    return check(false, 'The open one-person stair does not lead to the upper arrival.')
  }

  let feet = before
  let corner = 0
  let wait = 0
  let collisions = 0
  const follow = path.points.map(([x, , z]): Point => [x, Math.max(0, Math.min(2, rise(x))), z])
  for (let tick = 1; tick <= 150 && corner < follow.length; tick++) {
    const next = advance(feet, follow[corner], 2 / 30)
    if (tick <= 30 && sweptGap(feet, next, obstruction, obstruction).distance < 2 * radius) {
      wait++
      continue
    }
    if (tick <= 30 && gap(next, obstruction) < 2 * radius) collisions++
    feet = next
    if (next === follow[corner]) corner++
  }
  const unguarded = gap(before, obstruction) >= 2 * radius &&
    sweptGap(before, [obstruction[0] + 0.01, obstruction[1], obstruction[2]], obstruction, obstruction).distance < 2 * radius
  return check(fixed === 'unreachable' && wait > 0 && wait <= 30 && collisions === 0 &&
    corner === follow.length && gap(feet, after) < 0.08 && unguarded,
  'The moving actor clears in 1 s, waits ' + wait + ' ticks, collisions ' + collisions +
    ', no transient replan. The fixed blockage requires one replan and yields ' + fixed + '.')
}

function docking(backend: TraversalBackend) {
  const left: Point = [1, 0, 2]
  const right: Point = [7, 0.45, 2]
  const bank = surface(0, 4, 0, 4)
  const positions = [
    { start: 4.5, locked: false }, { start: 3.7, locked: false },
    { start: 3.7, locked: true }, { start: 3.7, locked: false }, { start: 4.5, locked: false }
  ]
  const near: Point = [3.3, 0, 2]
  const far: Point = [4.4, 0.45, 2]
  const link: AuthoredLink = { from: near, to: far, bidirectional: true }
  let connector: Point[] | undefined
  const connected = positions.map(({ start, locked }) => {
    return withNavigator(backend, [bank, surface(start, 9, 0, 4, 0.45)], (nav) => {
      const route = nav.route(left, right)
      if (locked && route.status === 'complete') {
        const entry = route.points.findIndex(([x, , z]) => Math.hypot(x - near[0], z - near[2]) < 0.1)
        if (entry >= 0 && entry + 1 < route.points.length &&
            Math.hypot(route.points[entry + 1][0] - far[0], route.points[entry + 1][2] - far[2]) < 0.1) {
          connector = route.points.slice(entry, entry + 2)
        }
      }
      return route.status === 'complete'
    }, locked ? [link] : [])
  })
  if (!connector) return check(false, 'The latched native route did not cross the authored connector.')
  let feet = near
  const speedPerTick = 0.04
  for (let tick = 0; tick < 9; tick++) feet = advance(feet, far, speedPerTick)
  const detachedAt = feet
  // The bridge hinge holds long enough to finish backtracking on the original side.
  const safe = gap(feet, near) < gap(feet, far) ? near : far
  let largestStep = 0
  for (let tick = 0; tick < 30 && feet !== safe; tick++) {
    const next = advance(feet, safe, speedPerTick)
    largestStep = Math.max(largestStep, Math.hypot(next[0] - feet[0], next[1] - feet[1], next[2] - feet[2]))
    feet = next
  }
  const recovered = withNavigator(backend, [bank, surface(4.5, 9, 0, 4, 0.45)],
    (nav) => nav.route(feet, left).status === 'complete' && nav.route(feet, right).status === 'unreachable')
  return check(connected.join(',') === 'false,false,true,false,false' && detachedAt[0] > near[0] &&
    detachedAt[0] < far[0] && feet === near && largestStep <= speedPerTick + 1e-8 && recovered,
  'Separate, overlapping, latched, unlocked and separated gave ' + connected.join('/') +
    '; the active transfer backed out from x=' + detachedAt[0].toFixed(2) + ' to the source anchor without teleporting.')
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

function rotatingIsland(backend: TraversalBackend) {
  const a: Point = [2, 0, 6]
  const b: Point = [6, 0, 10]
  const center: Point = [6, 0, 6]
  const ends = [surface(0, 4.06, 5, 7), surface(5, 7, 7.94, 12)]
  function rotate(x: number, z: number, angle: number): Point {
    const radians = angle * Math.PI / 180
    return [center[0] + x * Math.cos(radians) - z * Math.sin(radians), 0,
      center[2] + x * Math.sin(radians) + z * Math.cos(radians)]
  }
  const phases = [0, 45, 90].map((angle, revision) => {
    const rectangle = surface(4, 8, 5.3, 6.7)
    const vertices = rectangle.vertices.map(([x, , z]) => rotate(x - center[0], z - center[2], angle))
    return withNavigator(backend, [...ends, { vertices, triangles: rectangle.triangles }], (nav) =>
      [nav.route(a, center), nav.route(b, center)].map((route) => ({ route, revision })))
  })
  const crossings: string[] = []
  let revision = 0
  function cross(from: 'A' | 'B', token: typeof phases[number][number]) {
    if (token.revision !== revision || token.route.status !== 'complete') return false
    const points = token.route.points
    const portal = from === 'A' ? crossedZ(points, 4) : crossedZ(points.map(([x, y, z]): Point => [z, y, x]), 8)
    if (portal === undefined || Math.abs(portal - 6) > 0.7 || gap(points[points.length - 1], center) > 0.08) return false
    crossings.push(from + '@' + revision)
    return true
  }
  const attached = cross('A', phases[0][0]) && !cross('B', phases[0][1])
  const aboard: Point[] = []
  for (let tick = 0; tick <= 90; tick++) aboard.push(rotate(0.9, 0.05, tick))
  const continuity = aboard.slice(1).every((point, i) =>
    Math.abs(gap(point, center) - Math.hypot(0.9, 0.05)) < 1e-6 && gap(point, aboard[i]) < 0.016)
  revision = 1
  const staleRejected = !cross('A', phases[0][0]) && !cross('A', phases[1][0]) && !cross('B', phases[1][1])
  revision = 2
  const nextDock = !cross('A', phases[2][0]) && cross('B', phases[2][1])
  return check(attached && continuity && staleRejected && nextDock && crossings.join() === 'A@0,B@2',
    'A docks at 0°, the old portal is invalid at 45°, and B docks at 90°. Events ' + crossings.join(' → ') +
    '; attached world pose remains continuous throughout rotation.')
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
  const start = clutterPoint(CLUTTER_START)
  const goal = clutterPoint(CLUTTER_GOAL)
  const floor = box('floor', 'surface', [0, -0.2, 0], [5, 0, 5])
  const obstacleRadius = 0.2
  const minimumGap = CLUTTER_RADIUS + obstacleRadius
  const deadline = 9
  const phases = [0, 1.5, 3, 4.5]
  const rates = [0.75, 1, 1.25]
  const summaries: string[] = []
  const fixture: Point[] = [[1, 0, 2.5], [4, 0, 2.5]]
  const forbidden = closestBetween(clutterTrace(fixture), obstacleTrace(0.5, 1, 2))
  const delayed = closestBetween(clutterTrace(fixture, 1), obstacleTrace(0.5, 1, 3))
  let complete = forbidden.distance < 1e-6 && Math.abs(forbidden.time - 1) < 1e-6 && delayed.distance > minimumGap
  let preventedContacts = 0
  for (const { density, maps } of clutterMaps()) {
    const outcomes = phases.map((phase) => ({
      phase, arrivals: 0, blocked: 0, falseRoutes: 0, stalls: 0, walls: 0, timeouts: 0, contacts: 0
    }))
    for (const { rows, obstacles } of maps) {
      const shapes = obstacles.map(({ x, z }, i) =>
        box('obstacle-' + i, 'obstacle', [x * CLUTTER_CELL, 0, z * CLUTTER_CELL], [(x + 1) * CLUTTER_CELL, 1, (z + 1) * CLUTTER_CELL]))
      const route = withNavigator(backend, traversalSurfaces([floor, ...shapes], 0.8, 0),
        routeThroughClutter, [], CLUTTER_RADIUS)
      const connected = Number.isFinite(gridDistance(rows, CLUTTER_START, CLUTTER_GOAL))
      if (!connected || route.status !== 'complete' || gap(route.points[route.points.length - 1], goal) > 0.25) {
        for (const outcome of outcomes) {
          if (!connected) {
            if (route.status === 'unreachable') outcome.blocked += rates.length
            else outcome.falseRoutes += rates.length
          } else {
            outcome.stalls += rates.length
          }
        }
        continue
      }
      const poses = [start, ...route.points]
      const movingLane = obstacleTrace(0, 1, 6)
      if (poses.slice(1).some((point, i) => clutterOverlap(poses[i], point, obstacles)) ||
          movingLane.slice(1).some(({ position }, i) => clutterOverlap(movingLane[i].position, position, obstacles, obstacleRadius))) {
        for (const outcome of outcomes) outcome.walls += rates.length
        continue
      }
      const travel = pathLength(poses) / CLUTTER_SPEED
      for (const outcome of outcomes) {
        for (const rate of rates) {
          let departure: number | undefined
          for (let hold = 0; hold + travel <= deadline; hold += 0.25) {
            const close = closestBetween(clutterTrace(poses, hold, 0), obstacleTrace(outcome.phase, rate, hold + travel))
            if (close.distance >= minimumGap) {
              departure = hold
              if (hold > 0) preventedContacts++
              break
            }
          }
          if (departure === undefined) {
            outcome.timeouts++
            continue
          }
          const trace = clutterTrace(poses, departure)
          const arrival = trace[trace.length - 1]
          const distance = closestBetween(trace, obstacleTrace(outcome.phase, rate, arrival.time)).distance
          if (distance < minimumGap - 1e-6) outcome.contacts++
          else if (gap(arrival.position, goal) > 0.25 || arrival.time > deadline) outcome.timeouts++
          else outcome.arrivals++
        }
      }
    }
    complete &&= outcomes.every(({ arrivals, blocked }) => arrivals + blocked === maps.length * rates.length)
    summaries.push(Math.round(density * 100) + '% ' + JSON.stringify(outcomes))
  }
  return check(complete && preventedContacts > 0,
    'Shared static layouts, 4 phases × 3 speeds, 30 Hz follower and swept circles. ' +
    preventedContacts + ' waits prevented contact. ' + summaries.join('; '))
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
  const bodyRadius = 0.3
  // Native avoidance can compress its steering discs in dense crowds.
  const radius = bodyRadius + 0.06
  const create = crowdFactory(backend, [surface(0, 24, 0, 24)], radius, 1.6)
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
            reports.push(integrateCrowd(create, { agents, radius, height: 1.6, maxSpeed: 2, maxAcceleration: 8 }, dt, 12))
          }
        }
      }
    }
  }
  const clashes = reports.filter(({ minGap }) => minGap < 2 * bodyRadius - 0.02).length
  const complete = reports.map(({ arrived }, i) => arrived / [8, 16, 32][Math.floor(i / 16)])
  const min = Math.min(...reports.map(({ minGap }) => minGap))
  const tail = Math.max(...reports.map(({ p95 }) => p95))
  const stall = Math.max(...reports.map(({ stalledSeconds }) => stalledSeconds))
  return check(reports.every(({ valid }) => valid) && !clashes,
    reports.length + ' native sweeps with a 0.06 m steering margin; completed fraction ' +
    Math.min(...complete).toFixed(2) + '–' + Math.max(...complete).toFixed(2) +
    '; unsafe sweeps ' + clashes + '; min gap ' + min.toFixed(4) + ' m; max stall ' + stall.toFixed(2) +
    ' s; max p95 ' + tail.toFixed(4) + ' ms/agent')
}

export const timeCrowdCases: CatalogCase[] = [
  { id: 'T01', layer: 'integration', run: doorReplan },
  { id: 'T02', layer: 'controller', run: timedDoor },
  { id: 'T03', layer: 'controller', run: braking },
  { id: 'T04', layer: 'controller', run: hiddenCollision },
  { id: 'T05', layer: 'integration', run: changingWeights },
  { id: 'T06', layer: 'integration', run: timedClutter },
  { id: 'M01', layer: 'controller', run: passingBay },
  { id: 'M02', layer: 'controller', run: goalResidency },
  { id: 'M03', layer: 'controller', run: cyclicTraffic },
  { id: 'M04', layer: 'benchmark', run: warehouseScale },
  { id: 'M05', layer: 'benchmark', run: antipodal },
  { id: 'M06', layer: 'benchmark', run: liveCrossingFlow },
  { id: 'GAME-12', layer: 'integration', run: stairBlockage },
  { id: 'GAME-13', layer: 'integration', run: docking },
  { id: 'GAME-16', layer: 'controller', run: occupancySlots },
  { id: 'E26', layer: 'integration', run: rotatingIsland }
]
