import { readFileSync } from 'node:fs'
import type { Point, Surface } from '../../src/arena'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, type Navigator } from '../../src/navigation'
import { rootAnimationTravel } from '../../scripts/recipe-creator-behavior-model'
import { bakeDetourMesh, createDetourNavigatorFromMesh } from '../../test/detour'
import {
  crossesClosedGate, getLocomotionPath, locomotionAsset, locomotionFloor, locomotionGoal, makeLocomotion,
  makeResumeController, resumeGeometry, resumeGoal, resumeStart
} from '../../src/recipes/recipe-creator-behavior'
import {
  authoredRayHit, makeReplayTrace, readReplayText, replayFingerprint, replayGeometry, replayLogTag, replayNavigation,
  replayTargetXZ, type ReplayEvent, type ReplayFloor
} from '../../src/recipes/recipe-creator-behavior-replay'
import { distance, recipeBake } from '../../src/recipes/recipe-runtime-support'
import { check, type CatalogCase, type CatalogResult } from './types'

type Backend = Parameters<CatalogCase['run']>[0]

function withNavigation(
  backend: Backend, run: (make: (surfaces: readonly Surface[]) => Navigator) => CatalogResult
): CatalogResult {
  const resources: (() => void)[] = []
  let recipeBakeMs = 0
  let recipeQueryMs = 0
  let recipeBakeCount = 0
  let recipeQueryCount = 0
  try {
    const result = run((surfaces) => {
      const begin = performance.now()
      const navigator: Navigator & { dispose?(): void } = backend === 'navcat'
        ? createNavcatNavigatorFromMesh(bakeNavcatMesh(surfaces, recipeBake()))
        : createDetourNavigatorFromMesh(bakeDetourMesh(surfaces, recipeBake()))
      recipeBakeMs += performance.now() - begin
      recipeBakeCount++
      if (navigator.dispose) resources.push(() => navigator.dispose!())
      return {
        route(from, to) {
          const started = performance.now()
          try {
            return navigator.route(from, to)
          } finally {
            recipeQueryMs += performance.now() - started
            recipeQueryCount++
          }
        }
      }
    })
    return { ...result, metrics: { ...result.metrics, recipeBakeMs, recipeQueryMs, recipeBakeCount, recipeQueryCount } }
  } finally {
    for (const dispose of resources) dispose()
  }
}

const dt = 1 / 30

function verifyAnimation(backend: Backend): CatalogResult {
  return withNavigation(backend, (make) => {
    const clips = rootAnimationTravel(readFileSync(new URL('../../' + locomotionAsset, import.meta.url)))
    const route = getLocomotionPath(make([locomotionFloor.surface]))
    const followed = makeLocomotion(route)
    const baseline = makeLocomotion(route)
    let last: ReturnType<typeof followed.step> | undefined
    let maxRootDifference = 0
    let falseIdleTicks = 0
    let realIdleMidroute = false
    let ticks = 0
    while (!last?.finished && ticks < 900) {
      last = followed.step(dt)
      const reference = baseline.step(dt)
      maxRootDifference = Math.max(maxRootDifference, distance(last.position, reference.position))
      falseIdleTicks += Number(last.intent === 0 && last.clip === 'walk')
      realIdleMidroute ||= last.clip === 'idle' && distance(last.position, locomotionGoal) > 1
      ticks++
    }
    const rootTrackIsInPlace = clips.walk === 0 && clips.idle === 0 && clips.drift > 1.3
    const reachedGoal = Boolean(last?.finished && last.clip === 'idle' && distance(last.position, locomotionGoal) < 0.2)
    const passed = rootTrackIsInPlace && reachedGoal && realIdleMidroute && falseIdleTicks > 0 && maxRootDifference < 0.001
    return {
      ...check(passed, 'Native route and speed-based clip policy. Intent-only control idles during braking. The checked-in GLB has a visibly drifting root-motion control. ' +
        JSON.stringify({ clips, maxRootDifference, falseIdleTicks, realIdleMidroute, reachedGoal })),
      metrics: { locomotionTicks: ticks, maxRootDifferenceMetres: maxRootDifference, falseIdleTicks, rootMotionControlMetres: clips.drift ?? 0 }
    }
  })
}

function verifyResume(backend: Backend): CatalogResult {
  return withNavigation(backend, (make) => {
    const maps = [true, false].map((open) => make(resumeGeometry(open)))
    const plan = (from: Point, to: Point, revision: number) => maps[revision].route(from, to)
    const safe = makeResumeController(plan)
    const control = makeResumeController(plan, true)
    let holdError = 0
    for (let i = 0; i < 12; i++) {
      const revision = i < 4 ? 0 : 1
      holdError = Math.max(holdError, distance(safe.step(true, revision, dt).position, resumeStart))
      control.step(true, revision, dt)
    }
    const first = safe.step(false, 1, 0.5)
    const staleStep = control.step(false, 1, 0.5)
    let position = first.position
    let maxZ = position[2]
    let collision = crossesClosedGate(first.from, first.position)
    let ticks = 0
    while (distance(position, resumeGoal) > 0.24 && ticks < 900) {
      const move = safe.step(false, 1, dt)
      maxZ = Math.max(maxZ, move.position[2])
      collision ||= crossesClosedGate(move.from, move.position)
      position = move.position
      ticks++
    }
    const caughtStaleCrossing = staleStep.revision === 0 && crossesClosedGate(staleStep.from, staleStep.position)
    const passed = holdError < 0.001 && first.revision === 1 && first.stepSeconds === 0.1 && !collision &&
      maxZ > 7 && distance(position, resumeGoal) < 0.24 && caughtStaleCrossing
    return {
      ...check(passed, 'Injected visibility and revision events, native route replanning. The stale 500 ms control crosses the closed gate. ' +
        JSON.stringify({ holdError, first, staleStep, maxZ, collision, position, caughtStaleCrossing })),
      metrics: { hiddenHoldErrorMetres: holdError, resumeStepMs: first.stepSeconds * 1000, resumeTicks: ticks,
        staleCrossedGate: Number(caughtStaleCrossing), detourMaxZ: maxZ }
    }
  })
}

function recordedTrace(ground: number, bridge: number) {
  const [x, z] = replayTargetXZ
  const bindings = new Map<number, ReplayFloor>([[ground, 'underpass'], [bridge, 'bridge']])
  const hits = [{ entityId: ground, position: { x, y: 0, z } }, { entityId: bridge, position: { x, y: 3, z } }]
  const high = authoredRayHit(hits, bindings, 'bridge')
  const low = authoredRayHit(hits, bindings, 'underpass')
  if (!high || !low) throw new Error('No portable floor ray found.')
  return makeReplayTrace([
    { kind: 'request', tick: 1, request: 1, revision: 0, floor: 'underpass' },
    { kind: 'revision', tick: 2, revision: 1 },
    { kind: 'request', tick: 3, request: 2, revision: 1, floor: 'bridge' },
    { kind: 'result', tick: 5, sourceTick: 4, request: 2, revision: 1, surface: 'bridge', hit: high },
    { kind: 'result', tick: 8, sourceTick: 3, request: 1, revision: 0, surface: 'underpass', hit: low }
  ])
}

function verifyReplay(backend: Backend): CatalogResult {
  return withNavigation(backend, (make) => {
    const nav = make(replayGeometry())
    const issued = recordedTrace(301, 402)
    const reordered = recordedTrace(703, 809)
    const portable = JSON.stringify(issued) === JSON.stringify(reordered)
    const first = replayNavigation(readReplayText('prior line\n' + replayLogTag + JSON.stringify(issued)), nav)
    const second = replayNavigation(reordered, nav)
    const other = replayGeometry()
    other[0] = { ...other[0], vertices: other[0].vertices.map(([x, y, z]) => [x + 0.045, y, z]) }
    const changedGeometry = replayFingerprint(other)
    const swapped: ReplayEvent[] = [...issued.events.slice(0, 3),
      { ...issued.events[4], tick: issued.events[3].tick },
      { ...issued.events[3], tick: issued.events[4].tick }]
    const failures = [
      { trace: { ...issued, version: issued.version + 1 }, reason: 'Incompatible replay format' },
      { trace: { ...issued, geometry: changedGeometry }, reason: 'geometry differs' },
      { trace: { ...issued, events: swapped }, reason: 'accepted and stale responses' }
    ].map(({ trace, reason }) => {
      try {
        replayNavigation(trace, nav)
        return false
      } catch (error) {
        return String(error).includes(reason)
      }
    })
    const passed = portable && distance(first.end, second.end) < 0.001 &&
      first.chosen === 'bridge' && first.routeCalls === 1 && failures.every(Boolean)
    return {
      ...check(passed, 'Reassigned SDK IDs emit the same authored events. Replay requires the current fixture and exact event decisions. ' +
        JSON.stringify({ portable, floor: first.chosen, end: first.end, decisions: first.decisions, failures })),
      metrics: { traceBytes: Buffer.byteLength(JSON.stringify(issued)), traceEvents: issued.events.length, replayedRequests: first.routeCalls,
        rejectedControls: failures.filter(Boolean).length }
    }
  })
}

export const creatorBehaviorCases: CatalogCase[] = [
  { id: 'RECIPE-ANIMATOR', layer: 'integration', run: verifyAnimation },
  { id: 'RECIPE-SCENE-RESUME', layer: 'integration', run: verifyResume },
  { id: 'RECIPE-EXPLORER-REPLAY', layer: 'integration', run: verifyReplay }
]
