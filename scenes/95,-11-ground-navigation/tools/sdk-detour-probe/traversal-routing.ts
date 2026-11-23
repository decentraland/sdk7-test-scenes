import { addOffMeshConnection, createDefaultQueryFilter, getNodeByRef, OffMeshConnectionDirection } from 'navcat'
import { exportNavMesh, importNavMesh } from 'recast-navigation'
import type { Point, Surface } from '../../src/arena'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, NAVIGATION_BAKE, type Navigator } from '../../src/navigation'
import type { TraversalRouter, TraversalShape, TraversalWalk } from '../../src/traversal/types'
import { bakeDetourMesh, createDetourNavigatorFromMesh } from '../../test/detour'

export type TraversalBackend = 'navcat' | 'detour'
export type AuthoredLink = { from: Point; to: Point; bidirectional?: boolean; flags?: number; area?: number; radius?: number }
export type TraversalQueryOptions = {
  includeFlags?: number; costs?: Readonly<Record<number, number>>; roundTrip?: boolean; climb?: number
}
type Rect = { minX: number; maxX: number; minZ: number; maxZ: number }

function rectangle(shape: TraversalShape): Rect {
  const [x, , z] = shape.center
  const [w, , d] = shape.size
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }
}

function elevation(shape: TraversalShape) {
  return shape.center[1] + shape.size[1] / 2
}

function surface({ minX, maxX, minZ, maxZ }: Rect, y: number): Surface {
  return {
    vertices: [[minX, y, minZ], [minX, y, maxZ], [maxX, y, maxZ], [maxX, y, minZ]],
    triangles: [0, 1, 2, 0, 2, 3]
  }
}

// The fixtures use boxes. Cut blocked rectangles out of their walkable top faces
// before baking, so search sees the same obstacle heights as the controller.
export function traversalSurfaces(shapes: readonly TraversalShape[], height: number, floorY?: number): Surface[] {
  const surfaces: Surface[] = []
  for (const shape of shapes) {
    const y = elevation(shape)
    if (shape.kind !== 'surface' || (floorY !== undefined && Math.abs(y - floorY) > 0.01)) continue
    const area = rectangle(shape)
    const blocks = shapes.filter((other) =>
      (other.kind === 'obstacle' || other.kind === 'surface') &&
      elevation(other) > y + 0.001 && other.center[1] - other.size[1] / 2 < y + height - 0.001
    ).map(rectangle).filter((block) =>
      block.minX < area.maxX && block.maxX > area.minX && block.minZ < area.maxZ && block.maxZ > area.minZ)
    const edges = (min: number, max: number, values: number[]) =>
      [...new Set([min, ...values.filter((v) => min < v && v < max), max])].sort((a, b) => a - b)
    const xs = edges(area.minX, area.maxX, blocks.flatMap(({ minX, maxX }) => [minX, maxX]))
    const zs = edges(area.minZ, area.maxZ, blocks.flatMap(({ minZ, maxZ }) => [minZ, maxZ]))
    for (let i = 1; i < xs.length; i++) {
      for (let j = 1; j < zs.length; j++) {
        const midX = (xs[i - 1] + xs[i]) / 2
        const midZ = (zs[j - 1] + zs[j]) / 2
        if (blocks.some((r) => midX > r.minX && midX < r.maxX && midZ > r.minZ && midZ < r.maxZ)) continue
        surfaces.push(surface({ minX: xs[i - 1], maxX: xs[i], minZ: zs[j - 1], maxZ: zs[j] }, y))
      }
    }
  }
  return surfaces
}

function bake(radius: number, height: number) {
  return {
    ...NAVIGATION_BAKE, radius, height, cellSize: 0.05, cellHeight: 0.05,
    climb: 0.05, minRegionSize: 1, mergeRegionSize: 1, maxEdgeLength: 80, maxSimplificationError: 0.35
  }
}

export function createTraversalNavigator(
  backend: TraversalBackend, surfaces: readonly Surface[], radius: number, height: number,
  links: readonly AuthoredLink[] = [], snapLinks = false, options: TraversalQueryOptions = {}
): Navigator & { dispose?(): void } {
  const settings = { ...bake(radius, height), ...(options.climb !== undefined && { climb: options.climb }) }
  const aligned = (navigator: Navigator) => {
    if (!snapLinks) return links
    function project(point: Point) {
      const projected = navigator.route(point, point).points[0]
      return projected && Math.hypot(projected[0] - point[0], projected[2] - point[2]) <= 0.22 ? projected : point
    }
    return links.map((link) => ({ ...link, from: project(link.from), to: project(link.to) }))
  }
  if (backend === 'navcat') {
    const mesh = bakeNavcatMesh(surfaces, settings)
    const unlinked = createNavcatNavigatorFromMesh(mesh)
    for (const { from, to, bidirectional, flags = 1, area = 0, radius: endpointRadius = 0.45 } of aligned(unlinked)) {
      addOffMeshConnection(mesh, {
        start: [from[0], from[1], -from[2]], end: [to[0], to[1], -to[2]],
        radius: endpointRadius, flags, area, direction: bidirectional
          ? OffMeshConnectionDirection.BIDIRECTIONAL : OffMeshConnectionDirection.START_TO_END
      })
    }
    const filter = createDefaultQueryFilter()
    if (options.includeFlags !== undefined) filter.includeFlags = options.includeFlags
    if (options.costs) {
      const getDistance = filter.getCost
      filter.getCost = (a, b, navMesh, previous, current, next) =>
        getDistance(a, b, navMesh, previous, current, next) * (options.costs?.[getNodeByRef(navMesh, current).area] ?? 1)
    }
    return createNavcatNavigatorFromMesh(options.roundTrip ? JSON.parse(JSON.stringify(mesh)) as typeof mesh : mesh, filter)
  }
  let detourLinks = links
  if (snapLinks && links.length) {
    const unlinked = createDetourNavigatorFromMesh(bakeDetourMesh(surfaces, settings))
    try {
      detourLinks = aligned(unlinked)
    } finally {
      unlinked.dispose()
    }
  }
  const detourPoint = ([x, y, z]: Point) => ({ x, y, z: -z })
  let mesh = bakeDetourMesh(surfaces, settings, detourLinks.map(({ from, to, bidirectional, flags = 1, area = 0, radius: endpointRadius = 0.45 }, i) => ({
    startPosition: detourPoint(from), endPosition: detourPoint(to),
    radius: endpointRadius, bidirectional: bidirectional ?? false, flags, area, userId: i + 1
  })))
  if (options.roundTrip) {
    const image = exportNavMesh(mesh)
    mesh.destroy()
    mesh = importNavMesh(image).navMesh
  }
  return createDetourNavigatorFromMesh(mesh, (filter) => {
    if (options.includeFlags !== undefined) filter.includeFlags = options.includeFlags
    for (const [area, cost] of Object.entries(options.costs ?? {})) filter.setAreaCost(Number(area), cost)
  })
}

export function createTraversalRouter(backend: TraversalBackend, now: () => number) {
  const probes: { phase: string; reachable: boolean; corners: number; queryMs: number; bakeMs: number }[] = []
  const cache = new Map<string, ReturnType<typeof createTraversalNavigator>>()
  const route: TraversalRouter = ({ phase, from, to, shapes, radius, height }: TraversalWalk) => {
    const surfaces = traversalSurfaces(shapes, height, from[1])
    const key = JSON.stringify([radius, height, surfaces])
    let bakeMs = 0
    let navigator = cache.get(key)
    if (!navigator && surfaces.length) {
      const start = now()
      // The continuous controller checks the original radius. Reserve one raster cell
      // at corners so contour simplification cannot hand it a grazing waypoint.
      navigator = createTraversalNavigator(backend, surfaces, radius + 0.05, height)
      bakeMs = now() - start
      cache.set(key, navigator)
    }
    const start = now()
    const found = navigator?.route(from, to)
    const queryMs = now() - start
    const projected = found?.points[found.points.length - 1]
    const reachable = found?.status === 'complete' && projected !== undefined &&
      Math.hypot(projected[0] - to[0], projected[2] - to[2]) <= 0.22
    probes.push({ phase, reachable, corners: found?.points.length ?? 0, queryMs, bakeMs })
    if (!reachable) return undefined
    return [...found.points.slice(1, -1).map(([x, , z]): Point => [x, to[1], z]), to]
  }
  return {
    route, probes,
    dispose() {
      for (const navigator of cache.values()) navigator.dispose?.()
      cache.clear()
    }
  }
}
