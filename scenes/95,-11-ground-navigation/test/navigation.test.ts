import { init } from 'recast-navigation'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { SCENARIOS, getSurfaces, type Point } from '../src/arena'
import {
  bakeNavcatMesh,
  createNavcatNavigatorFromMesh,
  type Navigator,
} from '../src/navigation'
import { createDetourNavigator } from './detour'

const backends = [
  {
    name: 'navcat',
    async open(doorOpen: boolean) {
      // Exercise the same data format used to load a precomputed mesh in the scene.
      const baked = bakeNavcatMesh(getSurfaces(doorOpen))
      return createNavcatNavigatorFromMesh(JSON.parse(JSON.stringify(baked)))
    },
  },
  {
    name: 'Detour (WASM in Node)',
    async open(doorOpen: boolean) {
      await init()
      return createDetourNavigator(getSurfaces(doorOpen))
    },
  },
]

function distance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function pathLength(path: readonly Point[]) {
  return path.slice(1).reduce((length, point, i) => length + distance(path[i], point), 0)
}

function crossesRamp(path: readonly Point[], side: 'west' | 'east') {
  // The two routes overlap in XZ with the ground floor. A waypoint at ramp
  // height may be omitted by pulling a straight segment between portal edges.
  const elevation = 1.5
  return path.slice(1).some((point, i) => {
    const a = path[i]
    const rise = point[1] - a[1]
    if (rise === 0) return false
    const fraction = (elevation - a[1]) / rise
    if (fraction < 0 || fraction > 1) return false
    const x = a[0] + fraction * (point[0] - a[0])
    const z = a[2] + fraction * (point[2] - a[2])
    return z >= 3 && z <= 9 && (side === 'east' ? x >= 11 : x <= 5)
  })
}

for (const backend of backends) {
  describe(backend.name, () => {
    let open: Navigator & { dispose?(): void }
    let closed: Navigator & { dispose?(): void }

    beforeAll(async () => {
      open = await backend.open(true)
      closed = await backend.open(false)
    })

    afterAll(() => {
      open?.dispose?.()
      closed?.dispose?.()
    })

    for (const scenario of SCENARIOS) {
      test(scenario.id, () => {
        const navigator = scenario.doorOpen ? open : closed
        const route = navigator.route(scenario.start, scenario.goal)
        expect(route.status).toBe(scenario.expected)
        if (route.status === 'unreachable') {
          expect(route.points).toEqual([])
          return
        }
        expect(distance(route.points[0], scenario.start)).toBeLessThan(0.6)
        expect(distance(route.points[route.points.length - 1], scenario.goal)).toBeLessThan(0.6)
        if ('via' in scenario && scenario.via) {
          expect(crossesRamp(route.points, scenario.via)).toBe(true)
        }
        if (scenario.id === 'underpass') {
          expect(route.points.every((point) => Math.abs(point[1]) < 0.35)).toBe(true)
        }
      })
    }

    test('backs down the east ramp and takes the west ramp when the gate closes mid-route', () => {
      const start: Point = [12.5, 1.2, 5.4]
      const goal: Point = [8, 3, 11.5]
      const before = open.route(start, goal)
      const after = closed.route(start, goal)
      expect(before.status).toBe('complete')
      expect(crossesRamp(before.points, 'east')).toBe(true)
      expect(after.status).toBe('complete')
      expect(crossesRamp(after.points, 'west')).toBe(true)
      expect(crossesRamp(after.points, 'east')).toBe(false)
    })

    test('does not silently snap to the floor below an off-mesh goal', () => {
      expect(open.route([8, 0, 11], [8, 1.5, 11])).toEqual({
        status: 'unreachable',
        points: [],
      })
    })

    if (process.env.NAV_BENCHMARK === '1') {
      test('reports warmed Node query timings and route lengths', () => {
        const route = (scenario: (typeof SCENARIOS)[number]) =>
          (scenario.doorOpen ? open : closed).route(scenario.start, scenario.goal)
        for (const scenario of SCENARIOS) {
          for (let i = 0; i < 100; i++) route(scenario)
          const durations = []
          for (let i = 0; i < 500; i++) {
            const start = performance.now()
            route(scenario)
            durations.push(performance.now() - start)
          }
          durations.sort((a, b) => a - b)
          const result = route(scenario)
          console.log(
            `${backend.name} / ${scenario.id}: ${result.status}, ` +
              `${pathLength(result.points).toFixed(2)} m, ` +
              `p95 ${durations[Math.ceil(durations.length * 0.95) - 1].toFixed(3)} ms`,
          )
        }
      })
    }
  })
}
