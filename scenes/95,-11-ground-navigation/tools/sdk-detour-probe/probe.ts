import { engine, executeTask } from '@dcl/sdk/ecs'
import { init, importNavMesh } from 'recast-navigation'
import { OPPOSING_GROUPS, SCENARIOS, type Point, type Scenario } from '../../src/arena'
import { createCrowdObserver, createNavcatCrowd, type CrowdRun } from '../../src/crowd'
import meshes from '../../src/generated/meshes'
import { createNavcatNavigatorFromMesh, type Navigator, type Route } from '../../src/navigation'
import { createDetourCrowdFromMesh, createDetourNavigatorFromMesh } from '../../test/detour'

const host = globalThis as typeof globalThis & { performance?: { now(): number } }
const timer = typeof host.performance?.now === 'function' ? 'performance.now' : 'Date.now'
const now = () => host.performance?.now?.() ?? Date.now()
const scenarios: readonly Scenario[] = [
  ...SCENARIOS,
  { id: 'gate-closes-mid-route', start: [12.5, 1.2, 5.4], goal: [8, 3, 11.5], doorOpen: false, expected: 'complete', via: 'west' },
  { id: 'invalid-floor-height', start: [8, 0, 11], goal: [8, 1.5, 11], doorOpen: true, expected: 'unreachable' }
]
const backends = ['navcat', 'detour'] as const

function log(data: unknown) {
  console.log('[detour-sdk-probe] ' + JSON.stringify(data))
}

function p95(samples: number[]) {
  const ordered = samples.slice().sort((a, b) => a - b)
  return ordered[Math.ceil(ordered.length * 0.95) - 1]
}

function distance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function routeMatches(route: Route, scenario: Scenario) {
  if (route.status !== scenario.expected) return false
  if (route.status === 'unreachable') return route.points.length === 0
  if (!route.points.length || distance(route.points[0], scenario.start) > 0.6 ||
      distance(route.points[route.points.length - 1], scenario.goal) > 0.6) return false
  if (scenario.id === 'underpass') return route.points.every((point) => Math.abs(point[1]) < 0.35)
  if (!scenario.via) return true
  return route.points.slice(1).some(([x, y, z], i) => {
    const [ax, ay, az] = route.points[i]
    if (ay === y) return false
    const t = (1.5 - ay) / (y - ay)
    const rampX = ax + t * (x - ax)
    const rampZ = az + t * (z - az)
    return t >= 0 && t <= 1 && rampZ >= 3 && rampZ <= 9 && (scenario.via === 'east' ? rampX >= 11 : rampX <= 5)
  })
}

export function runProbe(openData: Uint8Array, closedData: Uint8Array) {
  const globals = globalThis as unknown as Record<string, unknown>
  log({ stage: 'host', wasm: typeof globals.WebAssembly, timer, process: typeof globals.process, window: typeof globals.window })
  executeTask(async () => {
    const initStart = now()
    try {
      await init()
      log({ stage: 'init', result: 'ok', ms: now() - initStart })
    } catch (error) {
      log({ stage: 'init', result: 'failed', error: String(error) })
      return
    }

    try {
      const importStart = now()
      const detour = [openData, closedData].map((bytes) => createDetourNavigatorFromMesh(importNavMesh(bytes).navMesh))
      const detourCrowd = createDetourCrowdFromMesh(importNavMesh(openData).navMesh)
      log({ stage: 'import', ms: now() - importStart, bytes: openData.length + closedData.length })
      const navcat = [meshes.open, meshes.closed].map(createNavcatNavigatorFromMesh)
      const routers: Navigator[][] = [navcat, detour]
      const groups: CrowdRun[] = [createNavcatCrowd(meshes.open), detourCrowd]
      const observations = groups.map(createCrowdObserver)
      const crowdTimes: number[][] = [[], []]
      const queryTimes: number[][] = [[], []]
      const queryBatchSize = 32
      const warmupBatches = 4
      const measuredBatches = 20
      let caseIndex = 0
      let batch = 0
      let crowdStep = 0
      let stopped = false

      function cleanup() {
        stopped = true
        engine.removeSystem(tick)
        detour.forEach((router) => router.dispose())
        detourCrowd.dispose()
      }

      function tick() {
        if (stopped) return
        try {
          if (caseIndex < scenarios.length) {
            const scenario = scenarios[caseIndex]
            const meshIndex = scenario.doorOpen ? 0 : 1
            for (const i of batch % 2 === 0 ? [0, 1] : [1, 0]) {
              const router = routers[i][meshIndex]
              const start = now()
              for (let j = 0; j < queryBatchSize; j++) router.route(scenario.start, scenario.goal)
              if (batch >= warmupBatches) queryTimes[i].push(now() - start)
            }

            batch++
            if (batch === warmupBatches + measuredBatches) {
              const results = backends.map((backend, i) => {
                const route = routers[i][meshIndex].route(scenario.start, scenario.goal)
                const samples = queryTimes[i].splice(0)
                return {
                  backend, status: route.status, matches: routeMatches(route, scenario),
                  meanUs: 1000 * samples.reduce((a, b) => a + b, 0) / (samples.length * queryBatchSize),
                  p95BatchMs: p95(samples)
                }
              })
              log({ stage: 'route', id: scenario.id, queryBatchSize, results })
              caseIndex++
              batch = 0
            }
            return
          }

          for (const i of crowdStep % 2 === 0 ? [0, 1] : [1, 0]) {
            const start = now()
            groups[i].step(OPPOSING_GROUPS.stepSeconds)
            crowdTimes[i].push(now() - start)
            observations[i].observe(groups[i].positions())
          }
          crowdStep++
          if (crowdStep === OPPOSING_GROUPS.steps) {
            const results = backends.map((backend, i) => ({
              backend, ...observations[i].metrics(),
              meanMs: crowdTimes[i].reduce((a, b) => a + b, 0) / crowdStep,
              ...(timer === 'performance.now' && { p95Ms: p95(crowdTimes[i]) })
            }))
            log({ stage: 'crowd', steps: crowdStep, results })
            cleanup()
            log({ stage: 'done' })
          }
        } catch (error) {
          log({ stage: 'tick', result: 'failed', error: String(error) })
          cleanup()
        }
      }
      engine.addSystem(tick)
    } catch (error) {
      log({ stage: 'setup', result: 'failed', error: String(error) })
    }
  })
}
