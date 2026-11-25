import type { Point } from '../arena'
import { marker, slab } from './recipe-runtime-support'
import {
  FLOOR_Y, PUBLIC, SPILL_AREA, STAFF, UPPER_Y, WALK, type EngineDefinition, type EngineMesh, type Polygon
} from './recipe-engine-types'

const lengthXZ = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[2] - a[2])
const samePoint = (a: Point, b: Point) => lengthXZ(a, b) < 0.12 && Math.abs(a[1] - b[1]) < 0.12

export function centroid(poly: Polygon): Point {
  const axis = (i: number) => poly.vertices.reduce((sum, point) => sum + point[i], 0) / poly.vertices.length
  return [axis(0), axis(1), axis(2)]
}

function route(mesh: EngineMesh, from: Point, to: Point, spillCost?: number) {
  const path = mesh.corridor(from, to, { spillCost })
  return path && { refs: path.refs, points: mesh.straight(path, 'all').points }
}

function patrol(makeMesh: Parameters<EngineDefinition['run']>[0], variant: string) {
  const floors = [
    slab('lower patrol strip', 1, 13, 1.5, 4.5, FLOOR_Y),
    slab('upper gallery', 1, 13, 1.5, 4.5, UPPER_Y),
    slab('disconnected lower room', 1, 4, 5.25, 7.25, FLOOR_Y)
  ]
  const mesh = makeMesh({ surfaces: floors.map(({ surface }) => surface) })
  try {
    const anchor = mesh.project([2, FLOOR_Y, 3])
    if (!anchor) throw new Error('Patrol start has no floor')
    const radius = 2
    const attempts = 96
    const seed = 97
    const raw = mesh.random(anchor, radius, attempts, seed)
    const repeat = mesh.random(anchor, radius, attempts, seed)
    const replayMatched = raw.length === repeat.length && raw.every((point, i) => point.every((value, n) => value === repeat[i][n]))
    const onFloor = (point: Point) => Math.abs(point[1] - anchor.point[1]) <= 0.2
    const withinRadius = (point: Point) => lengthXZ(anchor.point, point) <= radius
    const far = raw.filter((point) => onFloor(point) && !withinRadius(point))
    const candidates = raw.filter((point) => onFloor(point) && withinRadius(point)).slice(0, 12)
    const routes = candidates.map((point) => ({
      point, corridor: mesh.corridor(anchor.point, point)
    })).filter(({ corridor }) => corridor !== undefined)
    const control = variant === 'raw'
    const markers = control ? far.slice(0, 9) : routes.map(({ point }) => point)
    const retained = routes[0]?.corridor
    const path = !control && retained ? mesh.straight(retained, 'plain').points : undefined
    const artists = markers.map((point, index) => marker('sample ' + index, point, control ? 'guide' : 'target'))
    return {
      shapes: [...floors.map(({ shape }) => shape), marker('patrol origin', anchor.point), ...artists], path,
      passed: replayMatched && raw.length > 0 && far.length > 0 &&
        (control ? markers.every((point) => !withinRadius(point)) : routes.length === candidates.length && routes.length > 0),
      detail: control ? 'Native sampling returns some positions past the requested radius because it bounds candidate polygons.'
        : 'A bounded seeded sample keeps only positions with the intended Y, XZ radius and a complete corridor.',
      metrics: { radiusMetres: radius, sampleAttempts: 2 * attempts, accepted: routes.length, outsideRadius: far.length,
        checkedCorridors: candidates.length, replayMatched: Number(replayMatched) }
    }
  } finally { mesh.dispose() }
}

function straightWaypoints(makeMesh: Parameters<EngineDefinition['run']>[0], variant: string) {
  const floor = slab('straight tiled corridor', 1, 9, 2, 4, FLOOR_Y)
  const mesh = makeMesh({ surfaces: [floor.surface], tiled: true })
  try {
    for (const poly of mesh.polygons()) {
      const [x] = centroid(poly)
      if (x > 5 && x < 7) mesh.setArea(poly.ref, SPILL_AREA)
    }
    const from: Point = [2, FLOOR_Y, 3]
    const to: Point = [8, FLOOR_Y, 3]
    const corridor = mesh.corridor(from, to)
    if (!corridor) throw new Error('Straight test requires a full polygon corridor')
    const plain = mesh.straight(corridor, 'plain')
    const areas = mesh.straight(corridor, 'areas')
    const all = mesh.straight(corridor, 'all')
    const truncated = mesh.straight(corridor, 'all', Math.max(1, all.points.length - 2))
    const seen = (points: readonly Point[], x: number) => points.some((point) => Math.abs(point[0] - x) < 0.12)
    const last = truncated.points[truncated.points.length - 1]
    const clipped = truncated.limited && !truncated.end && last !== undefined && !samePoint(last, to)
    const ordered = plain.points.length === 2 && plain.end && areas.points.length === 4 && areas.end &&
      seen(areas.points, 5) && seen(areas.points, 7) && !seen(areas.points, 3) &&
      all.points.length > areas.points.length && all.end && seen(all.points, 3) && seen(all.points, 5) && seen(all.points, 7)
    const shown = variant === 'limited' ? truncated : variant === 'areas' ? areas : all
    return {
      shapes: [floor.shape, marker('requested goal', to),
        ...shown.points.map((point, i) => marker('waypoint ' + i, point, 'guide'))],
      path: shown.points,
      passed: ordered && clipped,
      detail: 'The same corridor yields distinct portal and area events. A clipped waypoint list must not complete the route. ' +
        JSON.stringify({ plain: plain.points, areas: areas.points, all: all.points, truncated }),
      metrics: { corridorPolygons: corridor.refs.length, defaultWaypoints: plain.points.length, areaWaypoints: areas.points.length,
        allWaypoints: all.points.length, clippedWaypoints: truncated.points.length, limited: Number(truncated.limited) }
    }
  } finally { mesh.dispose() }
}

function floorSpill(makeMesh: Parameters<EngineDefinition['run']>[0], variant: string) {
  const floors = [FLOOR_Y, UPPER_Y].map((y) => slab('floor ' + y, 1, 11, 1, 9, y))
  const mesh = makeMesh({ surfaces: floors.map(({ surface }) => surface), tiled: true })
  try {
    const lowerStart: Point = [2, FLOOR_Y, 4]
    const lowerGoal: Point = [10, FLOOR_Y, 4]
    const upperStart: Point = [2, UPPER_Y, 4]
    const upperGoal: Point = [10, UPPER_Y, 4]
    const center: Point = [7, FLOOR_Y, 4]
    const extents: Point = [2.05, 0.2, 1.05]
    const polygons = mesh.polygons()
    const expected = (floor: number) => polygons.filter(({ vertices }) => vertices.every(([x, y, z]) =>
      x >= 4.93 && x <= 9.07 && z >= 2.93 && z <= 5.07 && Math.abs(y - floor) <= 0.2)).map(({ ref }) => ref)
    const lower = expected(FLOOR_Y)
    const upper = expected(UPPER_Y)
    const targeted = new Set(lower)
    const baselineLower = route(mesh, lowerStart, lowerGoal)
    const baselineUpper = route(mesh, upperStart, upperGoal)
    // Detour returns a partial candidate list when its buffer fills. Publish no labels until complete.
    const small = mesh.queryBox(center, extents, 1)
    let capacity = 1
    let bounded = small
    while (bounded.limited && capacity < 4 * polygons.length) {
      capacity *= 2
      bounded = mesh.queryBox(center, extents, capacity)
    }
    const narrow = bounded.refs.filter((ref) => targeted.has(ref))
    const wide = new Set(mesh.queryBox([7, 1.7, 4], [2.05, 1.7, 1.05]).refs)
    const wideControl = variant === 'wide'
    const areaRefs = wideControl ? [...lower, ...upper].filter((ref) => wide.has(ref)) : narrow
    for (const ref of areaRefs) mesh.setArea(ref, SPILL_AREA)
    const low = route(mesh, lowerStart, lowerGoal, 40)
    const high = route(mesh, upperStart, upperGoal, 40)
    const uses = (path: typeof low, refs: readonly number[]) => path?.refs.some((ref) => refs.includes(ref)) === true
    const broadLeaks = upper.length > 0 && upper.every((ref) => wide.has(ref))
    const applied = new Set(areaRefs)
    const shapes = polygons.filter(({ ref }) => applied.has(ref)).map((poly, i) =>
      marker('marked polygon ' + i, centroid(poly), 'guide'))
    return {
      shapes: [...floors.map(({ shape }) => shape), ...shapes, marker('upper goal', upperGoal), marker('lower goal', lowerGoal)],
      path: wideControl ? high?.points : low?.points,
      passed: lower.length >= 2 && upper.length >= 2 && !bounded.limited && narrow.length === lower.length &&
        (!small.limited || small.refs.length === 1) && broadLeaks &&
        uses(baselineLower, lower) && uses(baselineUpper, upper) && low !== undefined && high !== undefined &&
        !uses(low, lower) && (wideControl ? !uses(high, upper) : uses(high, upper)),
      detail: wideControl ? 'The broad Y window marks both aligned decks in the negative control, so the upper route also detours.'
        : 'Exact polygon containment and floor scope prevent a lower spill from altering the upper route.' +
          ' ' + JSON.stringify({ low: low?.refs, high: high?.refs, tagged: areaRefs, narrow, baselineLower: baselineLower?.refs,
            baselineUpper: baselineUpper?.refs, truncatedProbe: small.limited }),
      metrics: { taggedPolygons: areaRefs.length, lowerPolygons: lower.length, upperPolygons: upper.length,
        queryCandidates: bounded.refs.length, truncatedProbe: Number(small.limited), upperStillDirect: Number(uses(high, upper)) }
    }
  } finally { mesh.dispose() }
}

export const engineQueryDefinitions: EngineDefinition[] = [
  { caseId: 'RECIPE-PATROL', label: 'Patrol on one floor', run: patrol,
    variants: [{ id: 'checked', label: 'Keep only legal points' }, { id: 'raw', label: 'Raw sample escapes radius' }] },
  { caseId: 'RECIPE-AREA-WAYPOINTS', label: 'Area and portal crossings', run: straightWaypoints,
    variants: [{ id: 'areas', label: 'Area boundary events' }, { id: 'all', label: 'Every portal crossing' },
      { id: 'limited', label: 'Clip the waypoint buffer' }] },
  { caseId: 'RECIPE-SPILL', label: 'Spill on the lower floor', run: floorSpill,
    variants: [{ id: 'lower', label: 'Lower floor only' }, { id: 'wide', label: 'Broad window marks both floors' }] }
]
