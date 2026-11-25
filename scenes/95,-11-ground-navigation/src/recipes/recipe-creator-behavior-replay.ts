import { getSurfaces, type Point } from '../arena'
import type { Navigator } from '../navigation'
import { recipeBake } from './recipe-runtime-support'

export const replayLogTag = '[ground-nav-replay] '
export const replayStart: Point = [8, 0, 7]
export const replayTargetXZ = [8, 11.5] as const
export const replayVersion = 1
const replaySeed = 51973
const engineVersion = '7.30.1'
const id = 'sdk7-ground-nav-stacked-targets'
const floorHeight = { underpass: 0, bridge: 3 }
export type ReplayFloor = keyof typeof floorHeight
export type ReplayEvent = {
  tick: number
  revision: number
} & ({ kind: 'revision' } |
  { kind: 'request'; request: number; floor: ReplayFloor } |
  { kind: 'result'; request: number; surface: ReplayFloor; hit: Point; sourceTick: number })
export type ReplayTrace = {
  version: number
  fixture: string
  sdk: string
  seed: number
  geometry: string
  start: Point
  profile: { radiusMetres: number; heightMetres: number }
  events: ReplayEvent[]
}

export const replayBakeSettings = () => recipeBake()
export const replayGeometry = () => getSurfaces(false)

export function authoredRayHit<Key>(
  hits: readonly { entityId?: Key; position?: { x: number; y: number; z: number } }[],
  bindings: ReadonlyMap<Key, ReplayFloor>,
  floor: ReplayFloor
): Point | undefined {
  const hit = hits.find(({ entityId, position }) => position && entityId !== undefined && bindings.get(entityId) === floor)?.position
  return hit && [hit.x, hit.y, hit.z]
}

export function replayFingerprint(surfaces = replayGeometry()) {
  const input = JSON.stringify([getSurfaces(true), surfaces, replayBakeSettings()])
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function makeReplayTrace(events: ReplayEvent[]): ReplayTrace {
  const { radius, height } = replayBakeSettings()
  return {
    version: replayVersion, fixture: id, sdk: engineVersion, seed: replaySeed, geometry: replayFingerprint(),
    start: replayStart, profile: { radiusMetres: radius, heightMetres: height }, events
  }
}

function asFloor(input: unknown): ReplayFloor {
  if (input !== 'underpass' && input !== 'bridge') throw new Error('Unknown author floor key.')
  return input
}

function isPoint(input: unknown): input is Point {
  return Array.isArray(input) && input.length === 3 && input.every((value) => typeof value === 'number' && Number.isFinite(value))
}

function spatialDistance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function replayNavigation(input: unknown, nav: Navigator) {
  if (typeof input !== 'object' || input === null) throw new Error('Expected a replay object.')
  const trace = input as ReplayTrace
  const expected = makeReplayTrace([])
  if (trace.version !== expected.version || trace.sdk !== expected.sdk) throw new Error('Incompatible replay format or SDK version.')
  if (trace.fixture !== expected.fixture || trace.seed !== expected.seed || trace.geometry !== expected.geometry) {
    throw new Error('Replay fixture seed or navigation geometry differs.')
  }
  if (!isPoint(trace.start) || spatialDistance(trace.start, expected.start) > 0.001 ||
      trace.profile?.radiusMetres !== expected.profile.radiusMetres ||
      trace.profile?.heightMetres !== expected.profile.heightMetres ||
      !Array.isArray(trace.events) || trace.events.length !== 5) {
    throw new Error('Replay start, agent profile or events are invalid.')
  }

  let previousTick = -1
  let active = 0
  let revision = 0
  let routeCalls = 0
  let chosen: ReplayFloor | undefined
  let end: Point | undefined
  const requests = new Map<number, { floor: ReplayFloor; revision: number }>()
  const answered = new Set<number>()
  const decisions: string[] = []

  for (const event of trace.events) {
    if (!event || !Number.isSafeInteger(event.tick) || event.tick <= previousTick ||
        !Number.isSafeInteger(event.revision) || event.revision < 0) throw new Error('Events are out of tick or revision order.')
    previousTick = event.tick
    if (event.kind === 'revision') {
      if (event.revision !== revision + 1) throw new Error('Revisions must advance by one.')
      revision = event.revision
      decisions.push('navmesh:' + revision)
      continue
    }
    if (!Number.isSafeInteger(event.request) || event.request < 1) throw new Error('Events require a request serial.')
    if (event.kind === 'request') {
      if (event.request !== active + 1 || event.revision !== revision) throw new Error('A request serial or revision is out of order.')
      const floor = asFloor(event.floor)
      active = event.request
      requests.set(active, { floor, revision })
      decisions.push('request:' + floor)
      continue
    }
    if (event.kind !== 'result' || !requests.has(event.request) || answered.has(event.request) ||
        !Number.isSafeInteger(event.sourceTick) || event.sourceTick < 0) throw new Error('Unmatched or repeated replay response.')
    answered.add(event.request)
    const floor = asFloor(event.surface)
    const hit: Point = [replayTargetXZ[0], floorHeight[floor], replayTargetXZ[1]]
    const request = requests.get(event.request)
    if (!isPoint(event.hit) || request?.floor !== floor || request.revision !== event.revision || spatialDistance(event.hit, hit) > 0.16) {
      throw new Error('A ray hit does not match its authored target surface.')
    }
    if (event.request !== active || event.revision !== revision) {
      decisions.push('stale:' + floor)
      continue
    }
    const route = nav.route(trace.start, event.hit)
    routeCalls++
    const candidate = route.points[route.points.length - 1]
    if (route.status !== 'complete' || !candidate || spatialDistance(candidate, hit) > 0.2) {
      throw new Error('Navigation reached the wrong floor or lost the target.')
    }
    end = candidate
    chosen = floor
    decisions.push('accepted:' + floor)
  }

  if (decisions.join(',') !== 'request:underpass,navmesh:1,request:bridge,accepted:bridge,stale:underpass' || routeCalls !== 1 ||
      chosen !== 'bridge' || !end) throw new Error('Replay did not reproduce the accepted and stale responses.')
  return { decisions, chosen, end, routeCalls }
}

export function readReplayText(input: string): unknown {
  const line = input.split(/\r?\n/).filter((value) => value.includes(replayLogTag)).pop()
  return JSON.parse(line ? line.slice(line.indexOf(replayLogTag) + replayLogTag.length) : input)
}
