import type { Point } from '../arena'
import type { Route } from '../navigation'
import type { TraversalFrame, TraversalRun, TraversalScenario, TraversalShape, TraversalVariant } from '../traversal/types'
import { navcatOpsBackend, type OpsBackend, type OpsMemory, type OpsTile, type OpsTileMesh } from './recipe-creator-ops-tiles'
import { FLOOR, marker, slab } from './recipe-runtime-support'

export type OpsResult = {
  passed: boolean
  detail: string
  metrics: Record<string, number>
  frames: Omit<TraversalFrame, 'verdict' | 'detail'>[]
}

type OpsDefinition = {
  id: string
  label: string
  variants: readonly TraversalVariant[]
  run(backend: OpsBackend, variant: string): OpsResult
}

const publishStart: Point = [1.6, FLOOR, 2.0]
const publishGoal: Point = [12.4, FLOOR, 2.0]
const chokeCentres = [3, 7, 11]

function patchFloor(south: readonly boolean[]) {
  return [
    slab('start', 1, 2.65, 1, 4.8),
    slab('first hall', 3.35, 6.65, 1, 4.8),
    slab('second hall', 7.35, 10.65, 1, 4.8),
    slab('goal', 11.35, 13, 1, 4.8),
    ...chokeCentres.map((x, i) => slab('gate ' + (i + 1), x - 0.35, x + 0.35,
      south[i] ? 3.4 : 1, south[i] ? 4.8 : 2.4))
  ]
}

function crossesAt(route: Route, x: number) {
  for (let i = 1; i < route.points.length; i++) {
    const [ax, , az] = route.points[i - 1]
    const [bx, , bz] = route.points[i]
    if (ax <= x && x <= bx && bx > ax) return az + (x - ax) * (bz - az) / (bx - ax)
  }
}

function trace(route: Route, prefix: string): TraversalShape[] {
  return route.points.map((point, index) => marker(prefix + ' ' + index, point, 'guide'))
}

function rollback(backend: OpsBackend, variant: string): OpsResult {
  const incremental = variant === 'incremental'
  const oldFloor = patchFloor([false, false, false])
  const newFloor = patchFloor([true, true, true])
  const mixedFloor = patchFloor([true, true, false])
  const startBake = backend.now()
  const original = backend.bakeTiles(oldFloor.map(({ surface }) => surface), 4)
  const update = backend.bakeTiles(newFloor.map(({ surface }) => surface), 4)
  const recipeBakeMs = backend.now() - startBake
  const sorted = [...update.tiles].sort((a, b) => a.x - b.x)
  if (sorted.length !== 3 || original.tiles.length !== 3) throw new Error('Import fixture must contain three tiles per revision')
  let active = original.open()
  let revision = 1
  let recipeImportMs = 0
  let recipeQueryMs = 0
  let importedBeforeFailure = 0
  let published = 0
  let diagnostic = 'missing'
  function query(mesh: OpsTileMesh) {
    const start = backend.now()
    const result = mesh.route(publishStart, publishGoal)
    recipeQueryMs += backend.now() - start
    return result
  }
  function install(mesh: OpsTileMesh, tile: OpsTile) {
    const start = backend.now()
    try { mesh.install(tile) }
    finally { recipeImportMs += backend.now() - start }
  }
  function matches(route: Route, south: readonly boolean[]) {
    return route.status === 'complete' && chokeCentres.every((x, i) => {
      const z = crossesAt(route, x)
      return z !== undefined && (south[i] ? z > 3.35 : z < 2.45)
    })
  }
  try {
    for (const tile of original.tiles) install(active, tile)
    const before = query(active)
    // Scope cached corridors by publication revision. Independent native meshes may issue the same numeric refs.
    const cached = { revision, route: before }
    const candidate = incremental ? active : update.open()
    try {
      for (const [i, slice] of sorted.entries()) {
        if (incremental && i < 2) candidate.remove(slice)
        const tile = i === 2 ? { ...slice, schema: slice.schema + 1 } : slice
        install(candidate, tile)
        importedBeforeFailure++
      }
    } catch (error) {
      diagnostic = String(error)
    } finally {
      if (!incremental) candidate.dispose()
    }
    const afterFailure = query(active)
    const retainedRevision = cached.revision === revision
    const retainedSnapshot = retainedRevision && JSON.stringify(cached.route) === JSON.stringify(afterFailure)
    const clean = update.open()
    try {
      for (const tile of sorted) install(clean, tile)
    } catch (error) {
      clean.dispose()
      throw error
    }
    active.dispose()
    active = clean
    revision++
    published++
    const afterRepair = query(active)
    const staleRejected = cached.revision !== revision
    const mixedObserved = matches(afterFailure, [true, true, false])
    const stages = [
      ['Active revision A', oldFloor, before],
      [incremental ? 'Bad control: partial publish mixes versions' : 'Last tile rejected. Revision A stays active',
        incremental ? mixedFloor : oldFloor, afterFailure],
      ['Repaired revision B published once', newFloor, afterRepair]
    ] as const
    return {
      passed: importedBeforeFailure === 2 && diagnostic.includes('Incompatible tile schema') &&
        matches(before, [false, false, false]) && matches(afterRepair, [true, true, true]) &&
        published === 1 && staleRejected &&
        (incremental ? !retainedSnapshot && mixedObserved : retainedSnapshot && !mixedObserved),
      detail: incremental
        ? 'The bad control exposes a complete route through two updated gates and one old gate before recovery.'
        : 'Two tiles staged, then the schema check failed. Revision A survived intact. A full retry published B and invalidated the cached route.',
      metrics: {
        recipeBakeMs, recipeBakeCount: 2, recipeQueryMs, recipeQueryCount: 3, recipeImportMs,
        importedBeforeFailure, published, mixedObserved: Number(mixedObserved), staleRejected: Number(staleRejected)
      },
      frames: stages.map(([phase, floor, route]) => ({
        phase, shapes: [...floor.map(({ shape }) => shape), ...trace(route, phase), marker('goal', publishGoal)],
        bots: [{ id: 'NPC with cached route', feet: publishStart }]
      }))
    }
  } finally {
    active.dispose()
  }
}

function streaming(backend: OpsBackend, variant: string): OpsResult {
  const retainEverything = variant === 'retain'
  const floor = slab('streamed strip', 1, 13, 1, 2.8)
  const startBake = backend.now()
  const pack = backend.bakeTiles([floor.surface], 2)
  const recipeBakeMs = backend.now() - startBake
  const tiles = [...pack.tiles].sort((a, b) => a.x - b.x)
  if (tiles.length !== 6 || tiles.some((tile, i) => tile.x !== i)) throw new Error('Expected six aligned streaming tiles')
  const windows = [[0, 1, 2], [2, 3, 4], [4, 5, 0]]
  const laps = 100
  const warmup = 10
  const heldRoutes: Route[] = []
  const frames: OpsResult['frames'] = []
  const mesh = pack.open()
  const samples: OpsMemory[] = []
  let peakResidentAfterWarmup = 0
  let residentOutOfWindow = 0
  let routeSuccesses = 0
  let recipeQueryMs = 0
  let tileLifecycleMs = 0
  let agentLifecycleMs = 0
  let installs = 0
  let evictions = 0
  let staleRefs = 0
  let liveAgents = 0
  let previous: { tile: number; ref: number } | undefined
  try {
    for (let lap = 0; lap < laps; lap++) {
      for (const [window, wanted] of windows.entries()) {
        const startTile = backend.now()
        if (!retainEverything) for (const [i, tile] of tiles.entries()) {
          if (mesh.has(tile) && !wanted.includes(i)) {
            mesh.remove(tile)
            evictions++
          }
        }
        if (previous && !wanted.includes(previous.tile) && !mesh.isValid(previous.ref)) staleRefs++
        for (const i of wanted) {
          if (!mesh.has(tiles[i])) {
            mesh.install(tiles[i])
            installs++
          }
        }
        tileLifecycleMs += backend.now() - startTile
        const resident = tiles.flatMap((tile, i) => mesh.has(tile) ? [i] : [])
        if (lap >= warmup) peakResidentAfterWarmup = Math.max(peakResidentAfterWarmup, resident.length)
        residentOutOfWindow += resident.filter((i) => !wanted.includes(i)).length
        const main = wanted[0]
        const start: Point = [2 + main * 2, FLOOR, 1.8]
        const goal: Point = [2 + wanted[1] * 2, FLOOR, 1.8]
        const startAgent = backend.now()
        const removeAgent = mesh.addAgent(start)
        liveAgents++
        agentLifecycleMs += backend.now() - startAgent
        try {
          const startQuery = backend.now()
          const path = mesh.route(start, goal)
          const ref = mesh.project(start)
          recipeQueryMs += backend.now() - startQuery
          if (path.status === 'complete' && ref !== undefined) routeSuccesses++
          if (ref !== undefined) previous = { tile: main, ref }
          heldRoutes.push(path)
          if (!retainEverything && heldRoutes.length > 1) heldRoutes.shift()
          if (lap === laps - 1) frames.push({
            phase: 'Zone ' + (window + 1) + ' of 3 · ' + resident.length + ' resident tiles',
            shapes: [
              ...resident.map((i) => slab('resident tile ' + i, 1 + i * 2, 3 + i * 2, 1, 2.8).shape),
              marker('loaded-window goal', goal), ...trace(path, 'streaming path')
            ],
            bots: [{ id: 'transient NPC', feet: start }]
          })
        } finally {
          const removalStarted = backend.now()
          removeAgent()
          liveAgents--
          agentLifecycleMs += backend.now() - removalStarted
        }
      }
      if (backend.memory && lap >= warmup - 1 && (lap + 1) % 10 === 0) samples.push(backend.memory())
    }
    const retainedRoutes = heldRoutes.length
    const memory: Record<string, number> = {}
    if (samples.length) {
      const first = samples[0]
      const last = samples[samples.length - 1]
      const heapRange = Math.max(...samples.map((sample) => sample.heapUsedBytes)) -
        Math.min(...samples.map((sample) => sample.heapUsedBytes))
      Object.assign(memory, {
        memorySamples: samples.length, jsHeapChangeBytes: last.heapUsedBytes - first.heapUsedBytes,
        jsHeapRangeBytes: heapRange, rssChangeBytes: last.rssBytes - first.rssBytes,
        observedPlateauToleranceBytes: 16 * 1024 * 1024, jsHeapWithinTolerance: Number(heapRange <= 16 * 1024 * 1024)
      })
      if (first.wasmHeapCapacityBytes !== undefined && last.wasmHeapCapacityBytes !== undefined) {
        memory.wasmHeapCapacityStartBytes = first.wasmHeapCapacityBytes
        memory.wasmHeapCapacityEndBytes = last.wasmHeapCapacityBytes
      }
    }
    return {
      passed: routeSuccesses === laps * windows.length && liveAgents === 0 &&
        (retainEverything ? peakResidentAfterWarmup === 6 && retainedRoutes === laps * windows.length &&
          residentOutOfWindow > 0 && evictions === 0 && staleRefs === 0
          : peakResidentAfterWarmup === 3 && heldRoutes.length === 1 && residentOutOfWindow === 0 &&
          evictions > 0 && staleRefs > 0),
      detail: retainEverything
        ? 'Disabling eviction and corridor release retains all six tiles and every route across 100 laps.'
        : 'A sliding window stays within three live tiles. Evicted refs become invalid, transient agents are removed and only the latest route survives.',
      frames,
      metrics: {
        laps, warmup, peakResidentAfterWarmup, residentOutOfWindow, installs, evictions, staleRefs, retainedRoutes,
        liveAgents, routeSuccesses, recipeBakeMs, recipeBakeCount: 1, recipeQueryMs, recipeQueryCount: 2 * routeSuccesses,
        tileLifecycleMs, agentLifecycleMs, ...memory
      }
    }
  } finally {
    mesh.dispose()
  }
}

const queuedStart: Point = [1.7, FLOOR, 2]
const queuedGoal: Point = [8.3, FLOOR, 2]
const switchTick = 3
const queryBudget = 4

function queueFloor(closed: boolean) {
  return [
    slab('start hall', 1.2, 2.6, 1.4, 5.8),
    slab('finish hall', 7.4, 8.8, 1.4, 5.8),
    slab('bypass', 2.6, 7.4, 4.5, 5.8),
    slab('short lane left', 2.6, closed ? 4.6 : 5, 1.4, 2.6),
    slab('short lane right', closed ? 5.4 : 5, 7.4, 1.4, 2.6)
  ]
}

function urgency(backend: OpsBackend, variant: string): OpsResult {
  const fifo = variant === 'fifo'
  const open = queueFloor(false)
  const closed = queueFloor(true)
  const startBake = backend.now()
  const original = backend.bakeRoute(open.map(({ surface }) => surface))
  try {
    const replacement = backend.bakeRoute(closed.map(({ surface }) => surface))
    const recipeBakeMs = backend.now() - startBake
    try {
      type Request = { kind: 'initial' | 'background' | 'leader' | 'validation'; from: Point }
      const pending: Request[] = [{ kind: 'initial', from: queuedStart }]
      for (let i = 0; i < 63; i++) pending.push({
        kind: 'background', from: [1.65 + (i % 4) * 0.10, FLOOR, 1.8 + (i % 7) * 0.08]
      })
      const traceFrames: OpsResult['frames'] = []
      const delayed: { route: Route; issuedUnder: number; finishTick: number }[] = []
      let currentRevision = 1
      let recipeQueryMs = 0
      let recipeQueryCount = 0
      let queryBudgetPeak = 0
      let maxTickQueryMs = 0
      let bgCompletions = 0
      let invalidRoutes = 0
      let leaderTick = 0
      let leaderUsedBypass = false
      let staleRejected = 0
      let staleWasDirect = false
      let ticksWithBgAndUrgent = 0
      let oldRoute: Route | undefined
      let currentLeaderRoute: Route | undefined
      let finish = 0
      for (let tick = 1; tick < 32; tick++) {
        if (tick === switchTick) {
          currentRevision = 2
          pending.push({ kind: 'leader', from: queuedStart })
          for (let i = 0; i < 7; i++) pending.push({ kind: 'validation', from: queuedStart })
        }
        for (const result of delayed.filter((item) => item.finishTick === tick)) {
          if (result.issuedUnder !== currentRevision) {
            staleRejected++
            staleWasDirect = result.route.status === 'complete' && (crossesAt(result.route, 5) ?? 10) < 2.75
          }
        }
        let budget = 0
        let bgThisTick = 0
        const hasUrgent = pending.some(({ kind }) => kind === 'leader' || kind === 'validation')
        const startTick = backend.now()
        while (pending.length && budget < queryBudget) {
          const urgent = fifo ? -1 : pending.findIndex(({ kind }) => kind === 'leader' || kind === 'validation')
          const background = pending.findIndex(({ kind }) => kind === 'background')
          const next = urgent >= 0 && !(budget === queryBudget - 1 && bgThisTick === 0 && background >= 0)
            ? urgent
            : urgent < 0 ? 0 : background
          const request = pending.splice(next, 1)[0]
          const nav = currentRevision === 1 ? original : replacement
          const started = backend.now()
          const route = nav.route(request.from, queuedGoal)
          recipeQueryMs += backend.now() - started
          recipeQueryCount++
          budget++
          if (route.status !== 'complete') invalidRoutes++
          if (request.kind === 'initial') {
            delayed.push({ route, issuedUnder: currentRevision, finishTick: switchTick + 1 })
            oldRoute = route
          }
          if (request.kind === 'leader') {
            leaderTick = tick
            leaderUsedBypass = route.status === 'complete' && (crossesAt(route, 5) ?? 0) >= 4.45
            currentLeaderRoute = route
          }
          if (request.kind === 'background') {
            bgCompletions++
            bgThisTick++
          }
        }
        maxTickQueryMs = Math.max(maxTickQueryMs, backend.now() - startTick)
        queryBudgetPeak = Math.max(queryBudgetPeak, budget)
        if (hasUrgent && bgThisTick > 0) ticksWithBgAndUrgent++
        if (tick === 1 || tick === switchTick || tick === leaderTick || tick === switchTick + 1) {
          const shown = tick < switchTick ? oldRoute : currentLeaderRoute
          traceFrames.push({
            phase: 'Tick ' + tick + ' · ' + pending.length + ' queued' + (leaderTick ? ' · fresh route found' : ''),
            shapes: [
              ...(tick < switchTick ? open : closed).map(({ shape }) => shape),
              marker('route goal', queuedGoal), ...(shown ? trace(shown, 'route') : [])
            ],
            bots: [{ id: 'leading NPC', feet: queuedStart }]
          })
        }
        if (!pending.length && tick > switchTick) {
          finish = tick
          break
        }
      }
      return {
        passed: queryBudgetPeak === queryBudget && bgCompletions === 63 && invalidRoutes === 0 &&
          finish > 0 && leaderUsedBypass && staleRejected === 1 && staleWasDirect &&
          (fifo ? leaderTick >= switchTick + 3 : leaderTick === switchTick && ticksWithBgAndUrgent >= 2),
        detail: fifo
          ? 'FIFO makes the leading NPC wait behind old background jobs. The fresh route takes the bypass when finally scheduled.'
          : 'The leader gets a new bypass on the closing tick. A background quota makes progress through the burst and the old result is discarded.',
        frames: traceFrames,
        metrics: {
          recipeBakeMs, recipeBakeCount: 2, recipeQueryMs, recipeQueryCount, queryBudgetPeak, maxTickQueryMs,
          bgCompletions, invalidRoutes, leaderTick, leaderDelayTicks: leaderTick - switchTick, staleRejected,
          ticksWithBgAndUrgent, finish
        }
      }
    } finally {
      replacement.dispose()
    }
  } finally {
    original.dispose()
  }
}

export const creatorOpsDefinitions: readonly OpsDefinition[] = [
  {
    id: 'RECIPE-IMPORT-ROLLBACK', label: 'Recover from a failed import',
    variants: [{ id: 'atomic', label: 'Stage the full update' }, { id: 'incremental', label: 'Publish tiles in place' }],
    run: rollback
  },
  {
    id: 'RECIPE-STREAMING-MEMORY', label: 'Bound tile streaming',
    variants: [{ id: 'window', label: 'Bounded window' }, { id: 'retain', label: 'Retain every tile and route' }],
    run: streaming
  },
  {
    id: 'RECIPE-URGENT-REPLAN', label: 'Schedule urgent replans',
    variants: [{ id: 'priority', label: 'Priority and background quota' }, { id: 'fifo', label: 'FIFO queue' }],
    run: urgency
  }
]

function display(result: OpsResult): TraversalRun {
  let elapsed = 0
  return {
    step(dt) { elapsed += dt },
    frame() {
      const index = Math.min(Math.floor(elapsed / 1.1), result.frames.length - 1)
      const done = elapsed >= result.frames.length * 1.1
      return {
        ...result.frames[index],
        verdict: done ? result.passed ? 'pass' : 'fail' : 'running',
        detail: result.detail
      }
    }
  }
}

export const creatorOpsRecipes: TraversalScenario[] = creatorOpsDefinitions.map((definition) => ({
  id: definition.id.toLowerCase(),
  label: definition.label,
  cases: [definition.id],
  variants: definition.variants,
  create(variant) {
    return display(definition.run(navcatOpsBackend, variant))
  }
}))
