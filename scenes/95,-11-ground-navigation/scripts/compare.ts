import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { OPPOSING_GROUPS, getSurfaces, type Point, type Scenario } from '../src/arena'
import { evaluateArenaRoute } from '../src/arena-route-check'
import { createCrowdObserver, createNavcatCrowd, type CrowdMetrics, type CrowdRun } from '../src/crowd'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, type Navigator, type Route } from '../src/navigation'
import { createDetourCrowd, createDetourNavigator } from '../test/detour'
import { COMPARISON_SCENARIOS, writeFixtures } from './fixtures'

type TimedRoute = Route & { id: string; p95Ms: number }
type CrowdReport = CrowdMetrics & { p95Ms?: number }
type Backend = { backend: string; runtime: string; scenarios: TimedRoute[]; crowd?: CrowdReport }

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function p95(samples: number[]) {
  samples.sort((a, b) => a - b)
  return samples[Math.ceil(samples.length * 0.95) - 1]
}

function timedRoute(scenario: Scenario, navigator: Navigator): TimedRoute {
  const route = () => navigator.route(scenario.start, scenario.goal)
  for (let i = 0; i < 100; i++) route()
  const durations = Array.from({ length: 500 }, () => {
    const start = performance.now()
    route()
    return performance.now() - start
  })
  return { id: scenario.id, ...route(), p95Ms: p95(durations) }
}

function timedCrowd(crowd: CrowdRun): CrowdReport {
  const observer = createCrowdObserver()
  const durations = Array.from({ length: OPPOSING_GROUPS.steps }, () => {
    const start = performance.now()
    crowd.step(OPPOSING_GROUPS.stepSeconds)
    const duration = performance.now() - start
    observer.observe(crowd.positions())
    return duration
  })
  return { ...observer.metrics(), p95Ms: p95(durations) }
}

function compareNode(): Backend[] {
  const openMesh = bakeNavcatMesh(getSurfaces(true))
  const navcat = createNavcatNavigatorFromMesh(openMesh)
  const closedNavcat = createNavcatNavigatorFromMesh(bakeNavcatMesh(getSurfaces(false)))
  const detour = createDetourNavigator(getSurfaces(true))
  const closedDetour = createDetourNavigator(getSurfaces(false))
  const detourCrowd = createDetourCrowd(getSurfaces(true))
  try {
    return [
      {
        backend: 'navcat', runtime: 'navcat 0.4.1 / Node ' + process.version,
        scenarios: COMPARISON_SCENARIOS.map((item) => timedRoute(item, item.doorOpen ? navcat : closedNavcat)),
        crowd: timedCrowd(createNavcatCrowd(openMesh))
      },
      {
        backend: 'detour', runtime: 'Detour WASM 0.44.0 / Node ' + process.version,
        scenarios: COMPARISON_SCENARIOS.map((item) => timedRoute(item, item.doorOpen ? detour : closedDetour)),
        crowd: timedCrowd(detourCrowd)
      }
    ]
  } finally {
    detourCrowd.dispose()
    closedDetour.dispose()
    detour.dispose()
  }
}

async function native(executable: string, args: string[], report: string, backend: string): Promise<Backend> {
  const result = spawnSync(executable, args, { stdio: 'inherit' })
  if (result.error) throw new Error('Cannot start ' + backend + ': ' + result.error.message)
  if (result.status !== 0) throw new Error(backend + ' exited with status ' + result.status)
  const data: Backend = JSON.parse(await readFile(report, 'utf8'))
  if (data.backend !== backend || !data.runtime || data.scenarios.length !== COMPARISON_SCENARIOS.length) {
    throw new Error('Unexpected report from ' + backend)
  }
  return data
}

const flags = new Set(process.argv.slice(2))
if (flags.has('--node-only') && flags.has('--write-replays')) throw new Error('Replays require all four engines')
if ([...flags].some((flag) => !['--node-only', '--write-replays'].includes(flag))) {
  throw new Error('Use pnpm compare [--node-only | --write-replays]')
}

const fixture = await writeFixtures(resolve('.comparison'))
const directory = dirname(fixture)
const backends = compareNode()
if (!flags.has('--node-only')) {
  const godotPath = resolve(directory, 'godot.json')
  backends.push(await native(process.env.GODOT_BIN || 'godot', [
    '--headless', '--fixed-fps', '30', '--path', 'tools/godot', '--script', 'compare.gd', '--', fixture, godotPath
  ], godotPath, 'godot'))

  const landmassPath = resolve(directory, 'landmass.json')
  backends.push(await native('cargo', [
    'run', '--locked', '--release', '--manifest-path', 'tools/landmass/Cargo.toml', '--', fixture, landmassPath
  ], landmassPath, 'landmass'))
}

const report = backends.map((backend) => ({
  ...backend,
  scenarios: COMPARISON_SCENARIOS.map((scenario) => {
    const matches = backend.scenarios.filter((route) => route.id === scenario.id)
    if (matches.length !== 1) throw new Error(backend.backend + ': missing or repeated case ' + scenario.id)
    const route = matches[0]
    const length = route.points.slice(1).reduce((total, point, index) => total + distance(route.points[index], point), 0)
    const verdict = Number.isFinite(route.p95Ms) && route.p95Ms >= 0
      ? evaluateArenaRoute(scenario, route)
      : 'malformed route timing'
    return { ...route, length, verdict }
  })
}))

for (const backend of report) {
  const passed = backend.scenarios.filter((scenario) => scenario.verdict === 'pass').length
  console.log(backend.runtime + ': ' + passed + '/' + COMPARISON_SCENARIOS.length + ' route checks')
  console.table(backend.scenarios.map(({ id, status, p95Ms, length, verdict }) => ({
    id, status, p95Ms: Number(p95Ms.toFixed(4)), length: Number(length.toFixed(2)), verdict
  })))
  if (backend.crowd) console.log('Opposing groups:', backend.crowd)
}
await writeFile(resolve(directory, 'results.json'), JSON.stringify(report, null, 2) + '\n')
if (report.some((backend) => backend.scenarios.some((scenario) => scenario.verdict !== 'pass'))) {
  console.error('A route check failed. See .comparison/results.json.')
  process.exitCode = 1
} else if (flags.has('--write-replays')) {
  const replay = report.filter((backend) => backend.backend !== 'navcat').map(({ backend, runtime, scenarios }) => ({
    backend, runtime,
    scenarios: scenarios.map(({ id, status, points }) => ({
      id, status, points: points.map((point) => point.map((value) => Number(value.toFixed(5))))
    }))
  }))
  await writeFile(resolve('src/reference-routes.json'), JSON.stringify(replay, null, 2) + '\n')
}
