import type { Point, Surface } from '../../src/arena'
import type { CrowdRun, CrowdSettings } from '../../src/crowd'
import type { Navigator } from '../../src/navigation'

const STEPS = 45 * 30
const GATE_TICK = 60
const WARMUP_TICKS = 30
const STEP = 1 / 30
const RADIUS = 0.3
const gate = { minX: 16, maxX: 18, minZ: 11.5, maxZ: 14.5 }
const detour = { minZ: 20, maxZ: 23 }

function floor(minX: number, maxX: number, minZ: number, maxZ: number): Surface {
  return {
    vertices: [[minX, 0, minZ], [minX, 0, maxZ], [maxX, 0, maxZ], [maxX, 0, minZ]],
    triangles: [0, 1, 2, 0, 2, 3]
  }
}

export function crowdLoadSurfaces(doorOpen: boolean): Surface[] {
  return [
    floor(0, 12, 0, 26), floor(22, 34, 0, 26), floor(12, 22, detour.minZ, detour.maxZ),
    ...(doorOpen
      ? [floor(12, 22, gate.minZ, gate.maxZ)]
      : [floor(12, gate.minX, gate.minZ, gate.maxZ), floor(gate.maxX, 22, gate.minZ, gate.maxZ)])
  ]
}

function crowdSettings(count: number): CrowdSettings {
  return {
    radius: RADIUS, height: 1.6, maxSpeed: 2, maxAcceleration: 8,
    agents: Array.from({ length: count }, (_, index) => {
      const side = index < count / 2 ? 1 : -1
      const row = index % (count / 2)
      const x = 9.5 - Math.floor(row / 8) * 1.1
      const z = 9.2 + (row % 8) * 1.05
      const stagger = side === 1 ? 0 : 0.22
      return {
        start: [side === 1 ? x : 34 - x, 0, z + stagger],
        goal: [side === 1 ? 34 - x : x, 0, z + stagger]
      }
    })
  }
}

type Backend = {
  id: string
  create(doorOpen: boolean, settings: CrowdSettings): CrowdRun & { dispose?(): void }
  closedRouter: Navigator
}

type Trial = { count: number; closes: boolean; repeat: number }
export const CROWD_LOAD_TRIALS: readonly Trial[] = [0, 1, 2].flatMap((repeat) =>
  [32, 64].flatMap((count) => [false, true].map((closes) => ({ count, closes, repeat }))))

function crossAt(a: Point, b: Point, x: number) {
  if ((a[0] < x) === (b[0] < x)) return undefined
  return a[2] + (x - a[0]) * (b[2] - a[2]) / (b[0] - a[0])
}

function positionDistance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function createCrowdLoadTrial(trial: Trial, backends: readonly Backend[], now: () => number) {
  const settings = crowdSettings(trial.count)
  const createState = (backend: Backend) => ({
    backend, group: backend.create(true, settings),
    previousPositions: settings.agents.map(({ start }) => start),
    arrived: new Set<number>(), overlapSteps: 0, gateCrossings: 0,
    minDistance: Infinity, maxSnap: 0, reissueMs: 0, replanQueriesMs: 0, detourRoutes: 0,
    lastArrivalStep: 0, leftPassages: 0, rightPassages: 0,
    updateMs: 0, timedSteps: 0
  })
  const states: ReturnType<typeof createState>[] = []
  function dispose() {
    for (const { group } of states) group.dispose?.()
    states.length = 0
  }
  try {
    for (const backend of backends) states.push(createState(backend))
  } catch (error) {
    dispose()
    throw error
  }
  let steps = 0
  let closed = false

  function closeGate() {
    closed = true
    for (const state of states) {
      const before = state.previousPositions
      const queryStart = now()
      state.detourRoutes = before.filter((position, index) => {
        const route = state.backend.closedRouter.route(position, settings.agents[index].goal)
        return route.status === 'complete' && route.points.slice(1).some((point, i) => {
          const cross = crossAt(route.points[i], point, 17)
          return cross !== undefined && cross >= detour.minZ && cross <= detour.maxZ
        })
      }).length
      state.replanQueriesMs = now() - queryStart
      const reissueStart = now()
      const replacement = state.backend.create(false, {
        ...settings, agents: settings.agents.map(({ goal }, index) => ({ start: before[index], goal }))
      })
      state.group.dispose?.()
      state.group = replacement
      state.reissueMs = now() - reissueStart
      state.previousPositions = replacement.positions()
      state.maxSnap = Math.max(...state.previousPositions.map((point, i) => positionDistance(point, before[i])))
    }
  }

  function observe(state: typeof states[number], positions: Point[], tick: number) {
    let overlap = false
    positions.forEach((point, i) => {
      const [x, , z] = point
      if (positionDistance(point, settings.agents[i].goal) <= 0.35 && !state.arrived.has(i)) {
        state.arrived.add(i)
        state.lastArrivalStep = tick
      }
      const old = state.previousPositions[i]
      const crossing = crossAt(old, point, 17)
      if (crossing !== undefined) {
        if (old[0] < x) state.rightPassages++
        else state.leftPassages++
        if (closed && crossing >= gate.minZ && crossing <= gate.maxZ) state.gateCrossings++
      }
      for (let j = 0; j < i; j++) {
        const [otherX, , otherZ] = positions[j]
        const distance = Math.hypot(x - otherX, z - otherZ)
        state.minDistance = Math.min(state.minDistance, distance)
        overlap ||= distance < 2 * RADIUS - 0.02
      }
    })
    if (overlap) state.overlapSteps++
    state.previousPositions = positions
  }

  return {
    step(batchSize = 8) {
      if (trial.closes && steps === GATE_TICK) closeGate()
      const boundary = steps < WARMUP_TICKS ? WARMUP_TICKS : trial.closes && !closed ? GATE_TICK : STEPS
      const batch = Math.min(batchSize, boundary - steps)
      const order = (Math.floor(steps / batchSize) + trial.repeat) % 2 === 0 ? states : states.slice().reverse()
      for (const state of order) {
        const snapshots: Point[][] = []
        const start = now()
        for (let i = 0; i < batch; i++) {
          state.group.step(STEP)
          snapshots.push(state.group.positions())
        }
        const elapsed = now() - start
        if (steps >= WARMUP_TICKS) {
          state.updateMs += elapsed
          state.timedSteps += batch
        }
        snapshots.forEach((snapshot, i) => observe(state, snapshot, steps + i + 1))
      }
      steps += batch
      return steps === STEPS
    },
    result() {
      return states.map(({ backend, arrived, ...state }) => ({
        backend: backend.id, count: trial.count, door: trial.closes ? 'closes' : 'open', repeat: trial.repeat + 1,
        steps, arrived: arrived.size, lastArrivalSeconds: state.lastArrivalStep * STEP,
        minDistance: state.minDistance, overlapSteps: state.overlapSteps,
        passages: [state.leftPassages, state.rightPassages],
        meanUpdateAndSnapshotMs: state.updateMs / state.timedSteps,
        ...(trial.closes && {
          gateCrossings: state.gateCrossings, maxSnap: state.maxSnap,
          reissueMs: state.reissueMs, replanQueriesMs: state.replanQueriesMs, detourRoutes: state.detourRoutes
        })
      }))
    },
    dispose
  }
}
