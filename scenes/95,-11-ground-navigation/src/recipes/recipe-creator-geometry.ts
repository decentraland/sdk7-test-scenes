import { getSurfaces, type Point, type Surface } from '../arena'
import type { Navigator } from '../navigation'
import type { TraversalScenario, TraversalShape } from '../traversal/types'
import { FLOOR, RADIUS, STANDING, distance, makeNavcatRecipeNavigator, marker, playback, slab } from './recipe-runtime-support'

export const MIRRORED_MODEL = 'models/recipe-creator-geometry/mirrored-ramp.glb'
export const RAMP_PARENT: Point = [6, 0.2, 10]
export const RAMP_YAW = 90
type Rotation = readonly [number, number, number, number]
type Transform = { translation?: Point; rotation?: Rotation; scale?: Point }
export type RampNode = Transform & { children?: readonly number[]; mesh?: number }
type RampAsset = { geometry: Surface; nodes: readonly RampNode[]; roots: readonly number[] }
export type GeometryNavigator = Navigator & { dispose?(): void }
export type GeometryNavigatorFactory = (surfaces: readonly Surface[]) => GeometryNavigator

export const mirroredRampAsset: RampAsset = {
  geometry: {
    vertices: [[0, 0, 0], [0, 0, 1.8], [4, 0.88, 2.02], [4, 0.88, 0.72]],
    triangles: [0, 1, 2, 0, 2, 3]
  },
  roots: [0],
  nodes: [
    { translation: [0.3, 0.12, 0.35], scale: [1.05, 1.12, 1.2], children: [1, 2] },
    { translation: [-4, 0, 1], scale: [-1, 1, 1], mesh: 0 },
    { translation: [4.5, 0.25, -1], scale: [-1, 1, -1], mesh: 0 }
  ]
}

function rotate([x, y, z]: Point, [qx, qy, qz, qw]: Rotation): Point {
  const tx = 2 * (qy * z - qz * y)
  const ty = 2 * (qz * x - qx * z)
  const tz = 2 * (qx * y - qy * x)
  return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx]
}

export function transformPosition(point: Point, transform: Transform): Point {
  const { scale = [1, 1, 1], translation = [0, 0, 0], rotation = [0, 0, 0, 1] } = transform
  const [x, y, z] = rotate([point[0] * scale[0], point[1] * scale[1], point[2] * scale[2]], rotation)
  return [x + translation[0], y + translation[1], z + translation[2]]
}

function mirroredSurfaces(asset: RampAsset, winding: 'correct' | 'ignore-reflection' | 'always-reflect') {
  const yaw = RAMP_YAW * Math.PI / 360
  function toScene([x, y, z]: Point): Point {
    // glTF's +Z forward converts to SDK7 by reflecting X before applying the SDK parent's +90° yaw.
    return transformPosition([-x, y, z], { translation: RAMP_PARENT, rotation: [0, Math.sin(yaw), 0, Math.cos(yaw)] })
  }
  function visit(id: number, parent: (point: Point) => Point, sign: number): Surface[] {
    const node = asset.nodes[id]
    const apply = (point: Point) => parent(transformPosition(point, node))
    const [a, b, c] = node.scale ?? [1, 1, 1]
    const determinantSign = sign * Math.sign(a * b * c)
    const children = (node.children ?? []).flatMap((child) => visit(child, apply, determinantSign))
    if (node.mesh === undefined) return children
    const reverse = winding === 'correct' ? determinantSign < 0 : winding === 'ignore-reflection'
    // "Ignore reflection" applies only the fixed GLTF-to-SDK reflection. "Always reflect"
    // applies one extra reflection even to the mesh with two reflected local axes.
    const triangles = asset.geometry.triangles.map((index, i, indices) =>
      reverse && i % 3 !== 0 ? indices[i % 3 === 1 ? i + 1 : i - 1] : index)
    return [{ vertices: asset.geometry.vertices.map(apply), triangles }, ...children]
  }
  return asset.roots.flatMap((index) => visit(index, toScene, -1))
}

export function rampStations(index: number, positions = [0.6, 1.3, 2, 2.7, 3.4]): Point[] {
  // Independent straight ramp equation and the two authored instances, without walking the node tree.
  return positions.map((u) => {
    const lateral = 0.9 + 0.1175 * u
    return index === 0
      ? [7.55 + 1.2 * lateral, 0.32 + 0.2464 * u, 6.1 - 1.05 * u]
      : [5.15 - 1.2 * lateral, 0.60 + 0.2464 * u, 15.025 - 1.05 * u]
  })
}

function upFacing(surface: Surface) {
  for (let i = 0; i < surface.triangles.length; i += 3) {
    const [a, b, c] = surface.triangles.slice(i, i + 3).map((index) => surface.vertices[index])
    if ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) <= 0) return false
  }
  return true
}

function routeHeight(points: readonly Point[], atZ: number) {
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1]
    const end = points[i]
    const span = end[2] - start[2]
    const fraction = (atZ - start[2]) / span
    if (span !== 0 && fraction >= 0 && fraction <= 1) return start[1] + (end[1] - start[1]) * fraction
  }
}

export function mirroredRampCheck(asset: RampAsset, makeNavigator: GeometryNavigatorFactory) {
  const cases = (['correct', 'ignore-reflection', 'always-reflect'] as const).map((winding) => {
    const geometry = mirroredSurfaces(asset, winding)
    const facing = geometry.map(upFacing)
    const nav = makeNavigator(geometry)
    try {
      const paths = [0, 1].map((index) => {
        const probes = rampStations(index)
        const route = nav.route(probes[0], probes[4])
        const reverse = nav.route(probes[4], probes[0])
        const endpointHeightError = route.points.length ? Math.abs(route.points[route.points.length - 1][1] - probes[4][1]) : Infinity
        const heights = probes.slice(1, 4).map(([x, y, z]) => {
          const projected = nav.route([x, y + 0.14, z], [x, y, z])
          const traced = routeHeight(route.points, z)
          if (projected.status !== 'complete' || traced === undefined) return Infinity
          return Math.max(Math.abs(projected.points[projected.points.length - 1][1] - y), Math.abs(traced - y))
        })
        return { reached: route.status === 'complete' && reverse.status === 'complete' && endpointHeightError < 0.13 &&
          heights.every((error) => error < 0.13), points: route.points, heightError: Math.max(...heights) }
      })
      return { winding, facing, paths }
    } finally { nav.dispose?.() }
  })
  const [correct, ignored, always] = cases
  const passed = correct.facing.join() === 'true,true' && correct.paths.every(({ reached }) => reached) &&
    ignored.facing.join() === 'false,true' && ignored.paths.map(({ reached }) => reached).join() === 'false,true' &&
    always.facing.join() === 'true,false' && always.paths.map(({ reached }) => reached).join() === 'true,false'
  return { passed, paths: correct.paths.map(({ points }) => points),
    metrics: { meshInstances: 2, crossSections: 6, maxHeightErrorMetres: Math.max(...correct.paths.map(({ heightError }) => heightError)),
      rejectedWindingControls: Number(!ignored.paths[0].reached) + Number(!always.paths[1].reached) },
    detail: 'One and two negative axes need different winding. Correct routes pass three independent height sections per ramp. ' +
      JSON.stringify(cases.map(({ winding, facing, paths }) => ({ winding, facing, reached: paths.map(({ reached }) => reached) }))) }
}

export const PATROL_MARKER_ORDER = ['patrol-a', 'patrol-b', 'gate-entry'] as const
export const PATROL_MARKERS = [
  { name: 'patrol-a', parent: [6, 0, 10], local: [1, 0, 0], expected: [7, 0, 10] },
  { name: 'patrol-b', parent: [6, 3, 10], local: [1, 0, 0], expected: [7, 3, 10] },
  { name: 'gate-entry', parent: [10, 3, 12], local: [1, 0, 0], expected: [11, 3, 12] }
] as const
export const PATROL_GROUP_MOVE: Point = [0.5, 0, 0.45]

export function markerPath(find: (name: string) => Point | undefined, from = [8, 0, 4] as Point, nav?: GeometryNavigator) {
  const points: Point[] = []
  for (const name of PATROL_MARKER_ORDER) {
    const marker = find(name)
    if (!marker) return { missing: name, points: [], arrivals: [] }
    points.push(marker)
  }
  const path = [from]
  const arrivals: Point[] = []
  if (!nav) return { points, arrivals }
  for (const target of points) {
    const segment = nav.route(path[path.length - 1], target)
    const end = segment.points[segment.points.length - 1]
    if (segment.status !== 'complete' || !end || distance(end, target) > 0.18) break
    arrivals.push(end)
    path.push(...segment.points)
  }
  return { points, arrivals, path }
}

export function markerCases(makeNavigator: GeometryNavigatorFactory) {
  const nav = makeNavigator(getSurfaces(true))
  try {
    const original = new Map<string, Point>(PATROL_MARKERS.map(({ name, expected }) => [name, expected]))
    const reordered = new Map<string, Point>([...PATROL_MARKERS].reverse().map(({ name, parent, local }) => [
      name, transformPosition(local, { translation: transformPosition(PATROL_GROUP_MOVE, { translation: parent }) })
    ]))
    const before = markerPath((name) => original.get(name), undefined, nav)
    const after = markerPath((name) => reordered.get(name), undefined, nav)
    const missing = markerPath((name) => name === 'patrol-b' ? undefined : reordered.get(name), undefined, nav)
    const numericIds = [...reordered.values()]
    const staleIds = markerPath((name) => numericIds[PATROL_MARKER_ORDER.indexOf(name as typeof PATROL_MARKER_ORDER[number])])
    const moved = after.points.every((point, i) =>
      distance(point, transformPosition(before.points[i], { translation: PATROL_GROUP_MOVE })) < 1e-8)
    const passed = before.arrivals.length === 3 && after.arrivals.length === 3 && moved &&
      before.points[0][0] === before.points[1][0] && before.points[0][2] === before.points[1][2] &&
      before.points[0][1] !== before.points[1][1] &&
      missing.missing === 'patrol-b' && missing.arrivals.length === 0 &&
      distance(staleIds.points[0], after.points[0]) > 0.5
    return { passed, before, after, detail: 'Patrol follows authored names on both floors after recreation and the group move. Missing patrol-b prevents any route.',
      metrics: { namedMarkers: 3, reachedMarkers: before.arrivals.length + after.arrivals.length, missingMarkerRejected: Number(missing.missing === 'patrol-b'),
        staleIdRejected: Number(distance(staleIds.points[0], after.points[0]) > 0.5) } }
  } finally { nav.dispose?.() }
}

type Parcel = readonly [number, number]
const PARCEL_METRES = 16
const TILE_DISPLAY_METRES = 4
const sceneOffset: Point = [3, FLOOR, 2]
const parcelRadius = RADIUS
type ParcelLayout = { base: string; parcels: readonly string[] }

function parseParcel(key: string): Parcel {
  const parts = key.split(',')
  const [x, z] = parts.map(Number)
  if (parts.length !== 2 || parts.some((part) => !part.trim()) || !Number.isInteger(x) || !Number.isInteger(z)) {
    throw Error('Invalid scene.json parcel ' + key)
  }
  return [x, z]
}

function parcelBounds({ base, parcels }: ParcelLayout, inset = 0) {
  const [baseX, baseZ] = parseParcel(base)
  const scale = TILE_DISPLAY_METRES / PARCEL_METRES
  return parcels.map((parcel, i) => {
    const [px, pz] = parseParcel(parcel)
    const sceneX = (px - baseX) * PARCEL_METRES * scale + sceneOffset[0]
    const sceneZ = (pz - baseZ) * PARCEL_METRES * scale + sceneOffset[2]
    return slab('parcel ' + i, sceneX + inset, sceneX + TILE_DISPLAY_METRES - inset,
      sceneZ + inset, sceneZ + TILE_DISPLAY_METRES - inset)
  })
}

function layout([x, z]: Parcel): ParcelLayout {
  const base = x + ',' + z
  return { base, parcels: [base, (x + 1) + ',' + z, x + ',' + (z + 1)] }
}

const [left, , bottom] = sceneOffset
const right = left + 2 * TILE_DISPLAY_METRES
const top = bottom + 2 * TILE_DISPLAY_METRES
const innerX = left + TILE_DISPLAY_METRES
const innerZ = bottom + TILE_DISPLAY_METRES
const parcelStart: Point = [left + 3, FLOOR, top - 0.8]
const parcelGoal: Point = [right - 0.8, FLOOR, bottom + 3]
const voidGoal: Point = [innerX + 1.1, FLOOR, innerZ + 1.1]

function holeDistanceSquared([x, , z]: Point) {
  return Math.max(innerX - x, 0) ** 2 + Math.max(innerZ - z, 0) ** 2
}

function supportsDisc(point: Point) {
  const [x, , z] = point
  return x >= left + parcelRadius && x <= right - parcelRadius && z >= bottom + parcelRadius && z <= top - parcelRadius &&
    holeDistanceSquared(point) >= parcelRadius ** 2
}

function sweepWithinParcels(start: Point, end: Point) {
  if (!supportsDisc(start) || !supportsDisc(end)) return false
  const dx = end[0] - start[0]
  const dz = end[2] - start[2]
  const xCross = (innerX - start[0]) / dx
  const zCross = (innerZ - start[2]) / dz
  const boundaries = [0, ...[xCross, zCross].filter((t) => t > 0 && t < 1).sort((a, b) => a - b), 1]
  const point = (t: number): Point => [start[0] + dx * t, FLOOR, start[2] + dz * t]
  for (let i = 1; i < boundaries.length; i++) {
    const a = boundaries[i - 1]
    const b = boundaries[i]
    const [x, , z] = point((a + b) / 2)
    const vx = x < innerX ? dx : 0
    const vz = z < innerZ ? dz : 0
    const squared = vx * vx + vz * vz
    const t = squared ? ((innerX - start[0]) * vx + (innerZ - start[2]) * vz) / squared : a
    const minimum = Math.max(a, Math.min(b, t))
    if (Math.min(holeDistanceSquared(point(a)), holeDistanceSquared(point(b)), holeDistanceSquared(point(minimum))) <
      parcelRadius ** 2 - 1e-6) return false
  }
  return true
}

export function parcelCheck(makeNavigator: GeometryNavigatorFactory) {
  const main = parcelBounds(layout([-95, -11]))
  const relocated = parcelBounds(layout([21, -13]))
  const shrinkEach = parcelBounds(layout([-95, -11]), parcelRadius + 0.15)
  const aabb = slab('whole-AABB control', left, right, bottom, top)
  const variants = [main, relocated, [aabb], shrinkEach].map((pieces) => {
    const nav = makeNavigator(pieces.map(({ surface }) => surface))
    try {
      const route = nav.route(parcelStart, parcelGoal)
      const path = [parcelStart, ...route.points]
      const end = path[path.length - 1]
      return { path, complete: route.status === 'complete' && distance(end, parcelGoal) < 0.15,
        reachesCutout: nav.route(parcelStart, voidGoal).status === 'complete',
        supported: path.slice(1).every((point, i) => sweepWithinParcels(path[i], point)) }
    } finally { nav.dispose?.() }
  })
  const [combined, moved, aabbControl, seamsControl] = variants
  const matchesMoved = combined.path.length === moved.path.length &&
    combined.path.every((point, i) => distance(point, moved.path[i]) < 1e-8)
  function crossed(axis: number, boundary: number) {
    return combined.path.slice(1).some((point, i) =>
      (point[axis] <= boundary && combined.path[i][axis] > boundary) ||
      (point[axis] > boundary && combined.path[i][axis] <= boundary))
  }
  const seams = Number(crossed(0, innerX)) + Number(crossed(2, innerZ))
  const passed = combined.complete && moved.complete && combined.supported && !combined.reachesCutout &&
    !supportsDisc(voidGoal) && seams === 2 && matchesMoved && aabbControl.complete && aabbControl.reachesCutout &&
    !aabbControl.supported && !seamsControl.complete
  return { passed, variants, main, aabb, shrinkEach, detail:
    'Logical 4 m display parcels. Union erosion keeps both seams and protects the cutout. The AABB cuts across the hole. Per-parcel erosion breaks the seams.',
    metrics: { crossedSeams: seams, rejectedCutout: Number(!combined.reachesCutout), relocatedMatches: Number(matchesMoved),
      rawAabbCrossesCutout: Number(!aabbControl.supported), perParcelBreaksSeams: Number(!seamsControl.complete) } }
}

const cutoutGuide: TraversalShape = {
  id: 'visual-only floor across the missing parcel', kind: 'guide',
  center: [innerX + 2, FLOOR - 0.07, innerZ + 2], size: [4, 0.04, 4]
}

export const creatorGeometryRecipes: readonly TraversalScenario[] = [{
  id: 'recipe-l-parcels', label: 'L-shaped parcel bounds', cases: ['RECIPE-L-PARCELS'],
  variants: [
    { id: 'union', label: 'Union keeps both parcel seams' },
    { id: 'aabb', label: 'AABB spills into the cutout' },
    { id: 'per-parcel', label: 'Per-parcel erosion breaks seams' }
  ],
  create(variant) {
    const result = parcelCheck(makeNavcatRecipeNavigator)
    const route = result.variants[variant === 'aabb' ? 2 : variant === 'per-parcel' ? 3 : 0]
    const pieces = variant === 'per-parcel' ? result.shrinkEach : result.main
    const points = route.complete ? route.path : [parcelStart]
    const shapes = [...pieces.map(({ shape }) => shape), cutoutGuide, marker('accepted goal', parcelGoal), marker('void target', voidGoal, 'guide')]
    return playback([{ phase: variant, height: STANDING, points, ...(route.complete ? {} : { holdSeconds: 0.5 }) }],
      () => shapes, result.passed, result.detail, result.metrics)
  }
}]
