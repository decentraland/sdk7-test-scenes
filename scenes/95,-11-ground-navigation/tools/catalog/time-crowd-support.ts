import type { Point } from '../../src/arena'

export type Graph = readonly (readonly number[])[]
export type TimedPoint = { position: Point; time: number }

export function timedRoute(
  graph: Graph, start: number, goal: number, limit: number,
  canEnter: (node: number, tick: number) => boolean,
  wait = true
): number[] | undefined {
  const queue = [[start]]
  const seen = new Set(['0:' + start])
  for (let head = 0; head < queue.length; head++) {
    const path = queue[head]
    const node = path[path.length - 1]
    if (node === goal) return path
    const tick = path.length
    if (tick > limit) continue
    for (const next of wait ? [node, ...graph[node]] : graph[node]) {
      const key = tick + ':' + next
      if (!canEnter(next, tick) || seen.has(key)) continue
      seen.add(key)
      queue.push([...path, next])
    }
  }
}

export function jointRoute(
  graph: Graph, starts: readonly number[], goals: readonly number[],
  policy: 'stay' | 'disappear' | 'release'
): number[][] | undefined {
  const initial = starts.map((node, i) => policy === 'disappear' && node === goals[i] ? -1 : node)
  const queue = [{ positions: initial, previous: -1 }]
  const seen = new Set([initial.join(',')])
  for (let head = 0; head < queue.length; head++) {
    const positions = queue[head].positions
    if (positions.every((node, i) => node === -1 || node === goals[i])) {
      const route: number[][] = []
      for (let i = head; i !== -1; i = queue[i].previous) route.push(queue[i].positions)
      return route.reverse()
    }
    function addAt(i: number, next: number[]) {
      if (i === positions.length) {
        const key = next.join(',')
        if (!seen.has(key)) {
          seen.add(key)
          queue.push({ positions: next.slice(), previous: head })
        }
        return
      }
      const current = positions[i]
      const destinations = current === -1 || (policy === 'stay' && current === goals[i])
        ? [current]
        : [current, ...graph[current]]
      for (const destination of destinations) {
        const occupied = destination !== -1 && next.some((other, j) =>
          other === destination || (positions[j] === destination && other === current))
        if (occupied) continue
        // A disappearing arrival still claims its destination during this transition.
        next.push(destination)
        if (i === positions.length - 1) {
          const settled = next.map((node, j) => policy === 'disappear' && node === goals[j] ? -1 : node)
          addAt(i + 1, settled)
        } else {
          addAt(i + 1, next)
        }
        next.pop()
      }
    }
    addAt(0, [])
  }
}

export function interpolate(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function gap(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[2] - b[2])
}

export function sweptGap(a0: Point, a1: Point, b0: Point, b1: Point) {
  const rx = a0[0] - b0[0]
  const rz = a0[2] - b0[2]
  const vx = a1[0] - b1[0] - rx
  const vz = a1[2] - b1[2] - rz
  const speed2 = vx * vx + vz * vz
  const t = speed2 > 0 ? Math.max(0, Math.min(1, -(rx * vx + rz * vz) / speed2)) : 0
  return { distance: Math.hypot(rx + vx * t, rz + vz * t), t }
}

function positionAt(a: TimedPoint, b: TimedPoint, time: number) {
  return interpolate(a.position, b.position, (time - a.time) / (b.time - a.time))
}

export function closestBetween(a: readonly TimedPoint[], b: readonly TimedPoint[]) {
  let result = { time: 0, distance: Infinity }
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const start = Math.max(a[i - 1].time, b[j - 1].time)
      const end = Math.min(a[i].time, b[j].time)
      if (start > end) continue
      const close = sweptGap(positionAt(a[i - 1], a[i], start), positionAt(a[i - 1], a[i], end),
        positionAt(b[j - 1], b[j], start), positionAt(b[j - 1], b[j], end))
      if (close.distance < result.distance) result = { time: start + (end - start) * close.t, distance: close.distance }
    }
  }
  return result
}

export function pathLength(points: readonly Point[]) {
  return points.slice(1).reduce((length, point, i) => length + gap(points[i], point), 0)
}

export function gridDistances(graph: Graph, goal: number) {
  const distance = new Int32Array(graph.length).fill(-1)
  const queue = [goal]
  distance[goal] = 0
  for (let i = 0; i < queue.length; i++) {
    const vertex = queue[i]
    for (const next of graph[vertex]) {
      if (distance[next] !== -1) continue
      distance[next] = distance[vertex] + 1
      queue.push(next)
    }
  }
  return distance
}

type QueueEntry = { key: number; priority: number }

function minQueue() {
  const heap: QueueEntry[] = []
  return {
    push(entry: QueueEntry) {
      let i = heap.length
      heap.push(entry)
      while (i) {
        const parent = (i - 1) >>> 1
        if (heap[parent].priority <= entry.priority) break
        heap[i] = heap[parent]
        i = parent
      }
      heap[i] = entry
    },
    pop() {
      const first = heap[0]
      const last = heap.pop()
      if (!last || heap.length === 0) return first
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        if (left >= heap.length) break
        const child = right < heap.length && heap[right].priority < heap[left].priority ? right : left
        if (last.priority <= heap[child].priority) break
        heap[i] = heap[child]
        i = child
      }
      heap[i] = last
      return first
    }
  }
}

// This is a prioritized coordinator above either navmesh. It reserves both the
// destination cell and the directed move, and keeps finished agents occupying their goals.
export function reservedGridRoutes(
  graph: Graph, requests: readonly { start: number; goal: number }[], horizon: number
) {
  const size = graph.length
  const cells = Array.from({ length: horizon + 1 }, () => new Set<number>())
  const edges = Array.from({ length: horizon + 1 }, () => new Set<number>())
  const lastUse = new Int32Array(size).fill(-1)
  function findPath(start: number, goal: number, distance: Int32Array) {
    if (distance[start] < 0 || lastUse[goal] === horizon) return
    const queue = minQueue()
    queue.push({ key: start, priority: distance[start] * (horizon + 1) })
    const previous = new Map([[start, -1]])
    for (let expanded = 0; expanded < 8_000; expanded++) {
      const state = queue.pop()
      if (!state) return
      const vertex = state.key % size
      const tick = Math.floor(state.key / size)
      if (vertex === goal && tick > lastUse[goal]) {
        const path: number[] = []
        for (let key = state.key; key !== -1; key = previous.get(key)!) path.push(key % size)
        return path.reverse()
      }
      if (tick === horizon) continue
      for (const next of [vertex, ...graph[vertex]]) {
        const nextTick = tick + 1
        if (distance[next] < 0 || cells[nextTick].has(next) || edges[nextTick].has(next * size + vertex)) continue
        const key = nextTick * size + next
        if (previous.has(key)) continue
        previous.set(key, state.key)
        const estimate = nextTick + distance[next]
        queue.push({ key, priority: estimate * (horizon + 1) - nextTick })
      }
    }
  }

  return requests.map(({ start, goal }) => {
    const distances = gridDistances(graph, goal)
    const path = findPath(start, goal, distances)
    if (path) {
      for (let tick = 0; tick <= horizon; tick++) {
        const vertex = path[Math.min(tick, path.length - 1)]
        cells[tick].add(vertex)
        lastUse[vertex] = Math.max(lastUse[vertex], tick)
        if (tick > 0 && tick < path.length) edges[tick].add(path[tick - 1] * size + vertex)
      }
    }
    return { path, lowerBound: distances[start] }
  })
}

// Read the returned routes independently of the reservation data structure.
export function validateGridRoutes(graph: Graph, paths: readonly number[][]) {
  const makespan = Math.max(1, ...paths.map((path) => path.length))
  for (let tick = 0; tick < makespan; tick++) {
    const at = paths.map((path) => path[Math.min(tick, path.length - 1)])
    if (new Set(at).size !== at.length) return false
    if (tick === 0) continue
    const before = paths.map((path) => path[Math.min(tick - 1, path.length - 1)])
    for (let i = 0; i < at.length; i++) {
      if (at[i] !== before[i] && !graph[before[i]].includes(at[i])) return false
      for (let j = 0; j < i; j++) if (at[i] === before[j] && at[j] === before[i]) return false
    }
  }
  return true
}
