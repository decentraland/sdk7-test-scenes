import type { Point } from '../arena'
import { marker, slab } from './recipe-runtime-support'
import { centroid } from './recipe-engine-query'
import {
  ENGINE_BAKE, FLOOR_Y, PUBLIC, STAFF, UPPER_Y, WALK, type EngineDefinition, type Link, type WallSegment
} from './recipe-engine-types'

function samePosition(a: Point, b: Point) {
  return a.every((coordinate, i) => Math.abs(coordinate - b[i]) < 0.02)
}

function semanticLinks(makeMesh: Parameters<EngineDefinition['run']>[0], variant: string) {
  const decks = [slab('agent side', 1, 4.2, 1.8, 4.2, FLOOR_Y), slab('other side', 5.2, 9, 1.8, 4.2, FLOOR_Y)]
  const from: Point = [2, FLOOR_Y, 3]
  const to: Point = [8, FLOOR_Y, 3]
  const links = [STAFF, PUBLIC].map((flags, index): Link =>
    ({ from: [3.65, FLOOR_Y, 3], to: [5.75, FLOOR_Y, 3], flags, key: index ? 17 : 13 }))
  const ordered = variant === 'reversed' ? [...links].reverse() : links
  const mesh = makeMesh({ surfaces: decks.map(({ surface }) => surface), links: ordered })
  try {
    const controls = links.map(({ flags }) => {
      const corridor = mesh.corridor(from, to, { flags: WALK | flags })
      if (!corridor) return { key: undefined, ref: undefined, points: [] }
      const ref = corridor.refs.find((value) => mesh.linkKey(value) !== undefined)
      return { ref, key: ref === undefined ? undefined : mesh.linkKey(ref), points: mesh.straight(corridor, 'all').points }
    })
    const [staff, publicAccess] = controls
    const sameGeometry = staff.points.length !== 0 && staff.points.length === publicAccess.points.length &&
      staff.points.every((point, i) => samePosition(point, publicAccess.points[i]))
    const coordinateOnly = staff.points.length === 0 || publicAccess.points.length === 0 ? undefined : links[0].key
    const denied = mesh.corridor(from, to, { flags: WALK }) === undefined
    const staleValid = staff.ref !== undefined && mesh.replaceLink
      ? mesh.replaceLink(links[0], 23, staff.ref) && mesh.linkKey(staff.ref) === undefined &&
        mesh.corridor(from, to, { flags: WALK | STAFF })?.refs.some((ref) => mesh.linkKey(ref) === 23) === true
      : undefined
    return {
      shapes: [...decks.map(({ shape }) => shape), marker('start of both actions', links[0].from), marker('end of both actions', links[0].to)],
      path: variant === 'reversed' ? publicAccess.points : staff.points,
      passed: staff.key === 13 && publicAccess.key === 17 && coordinateOnly !== publicAccess.key && sameGeometry && denied &&
        staleValid !== false,
      detail: 'Coincident geometry cannot identify the action. The corridor’s chosen link key alone tells the executor whether to climb or vault. ' +
        JSON.stringify({ staff: staff.key, public: publicAccess.key, coordinateOnly, staleRejectedAfterReuse: staleValid, denied, sameGeometry }),
      metrics: { distinctActions: new Set(controls.map(({ key }) => key)).size, waypointCount: staff.points.length,
        staleRefCheckAvailable: Number(staleValid !== undefined), staleRefRejected: Number(staleValid === true) }
    }
  } finally { mesh.dispose() }
}

function removeLanding(makeMesh: Parameters<EngineDefinition['run']>[0], variant: string) {
  const decks = [
    slab('takeoff', 1, 3.9, 1.5, 4.5, FLOOR_Y),
    slab('intermediate landing', 4.45, 5.55, 2.35, 3.65, FLOOR_Y),
    slab('destination', 6.0, 9, 1.5, 4.5, FLOOR_Y)
  ]
  const links: Link[] = [
    { from: [3.55, FLOOR_Y, 3], to: [4.95, FLOOR_Y, 3], key: 3, flags: STAFF },
    { from: [5.05, FLOOR_Y, 3], to: [6.45, FLOOR_Y, 3], key: 5, flags: STAFF }
  ]
  const size = variant === 'removed' ? 10 : 2
  const mesh = makeMesh({
    surfaces: decks.map(({ surface }) => surface),
    minRegionSize: size, links: variant === 'no-links' ? [] : links
  })
  try {
    const from: Point = [2.1, FLOOR_Y, 3]
    const to: Point = [8, FLOOR_Y, 3]
    const landingPresent = mesh.project([5, FLOOR_Y, 3]) !== undefined
    const largeIslandsPresent = mesh.project(from) !== undefined && mesh.project(to) !== undefined
    const corridor = mesh.corridor(from, to)
    const linkIds = corridor?.refs.flatMap((ref) => {
      const key = mesh.linkKey(ref)
      return key === undefined ? [] : [key]
    })
    const path = corridor && mesh.straight(corridor, 'all').points
    const shape = decks.map(({ shape }, i) => i === 1 && !landingPresent ? { ...shape, kind: 'guide' as const } : shape)
    const minArea = size ** 2
    const interiorWidthCells = Math.floor((1.1 - 2 * ENGINE_BAKE.radius) / ENGINE_BAKE.cellSize)
    const interiorLengthCells = Math.floor((1.3 - 2 * ENGINE_BAKE.radius) / ENGINE_BAKE.cellSize)
    return {
      shapes: [...shape, marker('goal platform', to)], path,
      passed: largeIslandsPresent && (variant === 'removed' ? !landingPresent && !corridor
        : landingPresent && (variant === 'no-links' ? corridor === undefined : linkIds?.join(',') === '3,5')),
      detail: 'The same authored landing is navigable only when the minimum region area preserves it. Links independently control connectivity. ' +
        JSON.stringify({ landingPresent, largeIslandsPresent, linkIds, minArea }),
      metrics: { minRegionCells: minArea, estimatedLandingInteriorCells: interiorWidthCells * interiorLengthCells,
        hasLanding: Number(landingPresent), corridorLinks: linkIds?.length ?? 0 }
    }
  } finally { mesh.dispose() }
}

function segmentMatch(a: WallSegment, b: WallSegment) {
  return samePosition(a.a, b.a) && samePosition(a.b, b.b) || samePosition(a.a, b.b) && samePosition(a.b, b.a)
}

function portalWall(makeMesh: Parameters<EngineDefinition['run']>[0], variant: string) {
  const floor = slab('tiled hall', 1, 5, 2, 4, FLOOR_Y)
  const mesh = makeMesh({ surfaces: [floor.surface], tiled: true })
  try {
    const segmentFn = mesh.walls
    if (!segmentFn) throw new Error('This backend has no segment binding')
    const from = mesh.project([2, FLOOR_Y, 3])
    if (!from) throw new Error('Portal source polygon unavailable')
    for (const poly of mesh.polygons()) {
      const [x] = centroid(poly)
      if (x > 3.1) mesh.setFlags(poly.ref, STAFF)
    }
    const enabled = segmentFn(from.ref, { flags: WALK | STAFF }, true)
    const disabled = segmentFn(from.ref, { flags: WALK }, true)
    const wallOnly = segmentFn(from.ref, { flags: WALK }, false)
    const openWalls = segmentFn(from.ref, { flags: WALK | STAFF }, false)
    const portal = enabled.find(({ ref, a, b }) => ref !== null && Math.abs(a[0] - 3) < 0.1 && Math.abs(b[0] - 3) < 0.1)
    const asWall = portal !== undefined && disabled.some((line) => line.ref === null && segmentMatch(portal, line))
    const shown = variant === 'allowed' ? enabled : disabled
    const debugLines = shown.map(({ a, b, ref }, i) => ({
      id: 'nav boundary ' + i, kind: ref === null ? 'obstacle' as const : 'guide' as const,
      center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.035, (a[2] + b[2]) / 2] as const,
      size: [Math.max(0.06, Math.abs(b[0] - a[0])), 0.06, Math.max(0.06, Math.abs(b[2] - a[2]))] as const
    }))
    return {
      shapes: [floor.shape, ...debugLines, marker('source polygon', from.point)],
      passed: asWall && wallOnly.some((line) => segmentMatch(portal, line)) &&
        !openWalls.some((line) => segmentMatch(portal, line)) &&
        // A globally permissive filter would mislabel the identical denied segment as a portal.
        enabled.some((line) => line.ref !== null && segmentMatch(portal, line)),
      detail: 'The identical line is a portal with the staff filter and a wall with the visitor filter. An unfiltered overlay misleads visitor diagnostics. ' +
        JSON.stringify({ enabled, disabled, wallOnly }),
      metrics: { visiblePortals: shown.filter(({ ref }) => ref !== null).length, drawnSegments: shown.length,
        deniedPortalIsWall: Number(asWall) }
    }
  } finally { mesh.dispose() }
}

function islandPruning(makeMesh: Parameters<EngineDefinition['run']>[0], variant: string) {
  const floors = [
    slab('spawn A', 1, 4, 1.5, 4.5, FLOOR_Y), slab('spawn B', 1, 4, 6, 8.5, FLOOR_Y),
    slab('reachable landing', 4.8, 7.2, 1.5, 4.5, FLOOR_Y),
    slab('one-way decoration', 8, 10.8, 1.5, 4.5, FLOOR_Y), slab('false upper floor', 1, 4, 1.5, 4.5, UPPER_Y)
  ]
  const links: Link[] = [
    { from: [3.5, FLOOR_Y, 3], to: [5.3, FLOOR_Y, 3], key: 1, flags: STAFF },
    { from: [8.6, FLOOR_Y, 3], to: [3.4, FLOOR_Y, 3], key: 2, flags: STAFF }
  ]
  const places: Point[] = [
    [2, FLOOR_Y, 3], [2, FLOOR_Y, 7.1], [6, FLOOR_Y, 3], [9.4, FLOOR_Y, 3], [2, UPPER_Y, 3]
  ]
  const mesh = makeMesh({ surfaces: floors.map(({ surface }) => surface), links })
  try {
    const before = places.map((point) => mesh.project(point))
    const towardSpawn = mesh.corridor(places[3], places[0])
    const awayFromSpawn = mesh.corridor(places[0], places[3])
    if (!before[0] || !before[1]) throw new Error('Both authored spawns must project before pruning')
    const withB = variant === 'two-spawns'
    mesh.prune(withB ? [before[0].ref, before[1].ref] : [before[0].ref])
    const retained = places.map((point) => mesh.project(point) !== undefined)
    const landingCorridor = mesh.corridor(places[0], places[2])
    return {
      shapes: floors.map(({ shape }, i) => retained[i] ? shape : { ...shape, kind: 'guide' as const }),
      path: landingCorridor && mesh.straight(landingCorridor, 'all').points,
      passed: before.every((projection) => projection !== undefined) && towardSpawn !== undefined && awayFromSpawn === undefined &&
        retained.join(',') === [true, withB, true, false, false].join(',') && landingCorridor !== undefined,
      detail: 'Directed flood fill keeps legal spawn regions and the outward landing. Reverse-only decoration is rejected. ' +
        JSON.stringify({ towardSpawn: Boolean(towardSpawn), awayFromSpawn: Boolean(awayFromSpawn), retained }),
      metrics: { seedCount: withB ? 2 : 1, retainedLocations: retained.filter(Boolean).length, prunedLocations: retained.filter((ok) => !ok).length }
    }
  } finally { mesh.dispose() }
}

export const engineTopologyDefinitions: EngineDefinition[] = [
  { caseId: 'RECIPE-LINK-DISPATCH', label: 'Coincident off-mesh actions', run: semanticLinks,
    variants: [{ id: 'normal', label: 'Climb from its link identity' }, { id: 'reversed', label: 'Register links in reverse order' }] },
  { caseId: 'RECIPE-BAKE-LANDING', label: 'Keep the intermediate landing', run: removeLanding,
    variants: [{ id: 'kept', label: 'Keep region and both links' }, { id: 'removed', label: 'Cull the small region' },
      { id: 'no-links', label: 'Keep terrain with no action links' }] },
  { caseId: 'RECIPE-PORTAL-WALL', label: 'Portal or wall by NPC', run: portalWall,
    variants: [{ id: 'allowed', label: 'Staff sees a portal' }, { id: 'denied', label: 'Visitor sees a wall' }] },
  { caseId: 'RECIPE-PRUNE-ISLANDS', label: 'Prune islands from two spawns', run: islandPruning,
    variants: [{ id: 'two-spawns', label: 'Keep both legal spawns' }, { id: 'one-spawn', label: 'Missing seed deletes a valid room' }] }
]
