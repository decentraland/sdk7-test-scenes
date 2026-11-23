import { generateTiledNavMesh as buildNavcatTiles } from 'navcat/blocks'
import { generateTiledNavMesh as buildDetourTiles } from 'recast-navigation/generators'
import type { Point, Surface } from '../../src/arena'
import { getSurfaces } from '../../src/arena'
import { createNavcatNavigatorFromMesh, toRecastGeometry, type Route } from '../../src/navigation'
import type { TraversalShape } from '../../src/traversal/types'
import { createDetourNavigatorFromMesh, type DetourQueryLimits } from '../../test/detour'
import { createTraversalNavigator, traversalSurfaces, type TraversalBackend } from '../sdk-detour-probe/traversal-routing'
import { box, check, type CatalogCase } from './types'

export function floor(x0: number, x1: number, z0: number, z1: number, y = 0, farY = y): Surface {
  return { vertices: [[x0, y, z0], [x0, farY, z1], [x1, farY, z1], [x1, y, z0]], triangles: [0, 1, 2, 0, 2, 3] }
}

export function usingMesh<T>(
  backend: TraversalBackend, faces: readonly Surface[],
  body: (navigator: ReturnType<typeof createTraversalNavigator>) => T,
  args: {
    radius?: number; height?: number; tiled?: boolean; climb?: number; links?: Parameters<typeof createTraversalNavigator>[4]
    detourLimits?: DetourQueryLimits
  } = {}
) {
  const { radius = 0.22, height = 1.4, tiled = false, links = [], climb = 0.1 } = args
  const nav = tiled ? tiledNavigator(backend, faces, radius, height, args.detourLimits)
    : createTraversalNavigator(backend, faces, radius, height, links, true, { climb })
  try {
    return body(nav)
  } finally {
    nav.dispose?.()
  }
}

function tiledNavigator(backend: TraversalBackend, faces: readonly Surface[], radius: number, height: number, detourLimits?: DetourQueryLimits):
ReturnType<typeof createTraversalNavigator> {
  const geometry = toRecastGeometry(faces)
  const radiusVoxels = Math.ceil(radius / 0.05)
  const heightVoxels = Math.ceil(height / 0.05)
  if (backend === 'navcat') {
    return createNavcatNavigatorFromMesh(buildNavcatTiles(geometry, {
      cellSize: 0.05, cellHeight: 0.05, tileSizeVoxels: 40, tileSizeWorld: 2,
      walkableRadiusVoxels: radiusVoxels, walkableRadiusWorld: radius,
      walkableHeightVoxels: heightVoxels, walkableHeightWorld: height,
      walkableClimbVoxels: 2, walkableClimbWorld: 0.1, walkableSlopeAngleDegrees: 40,
      borderSize: radiusVoxels + 3, minRegionArea: 1, mergeRegionArea: 1,
      maxSimplificationError: 0.35, maxEdgeLength: 80, maxVerticesPerPoly: 6,
      detailSampleDistance: 0.25, detailSampleMaxError: 0.05
    }).navMesh)
  }
  const result = buildDetourTiles(geometry.positions, geometry.indices, {
    cs: 0.05, ch: 0.05, tileSize: 40,
    walkableRadius: radiusVoxels, walkableHeight: heightVoxels, walkableClimb: 2,
    walkableSlopeAngle: 40, borderSize: radiusVoxels + 3, minRegionArea: 1, mergeRegionArea: 1,
    maxSimplificationError: 0.35, maxEdgeLen: 80, maxVertsPerPoly: 6, detailSampleDist: 5, detailSampleMaxError: 1
  })
  if (!result.success) throw new Error(result.error)
  return createDetourNavigatorFromMesh(result.navMesh, undefined, detourLimits)
}

export function pathLength({ points }: Route) {
  return points.slice(1).reduce((sum, [x, y, z], index) => {
    const [px, py, pz] = points[index]
    return sum + Math.hypot(x - px, y - py, z - pz)
  }, 0)
}

export function crosses(route: Route, axis: 0 | 2, coordinate: number, accept: (crossing: Point) => boolean) {
  return route.points.slice(1).some((b, i) => {
    const a = route.points[i]
    if ((a[axis] < coordinate) === (b[axis] < coordinate)) return false
    const t = (coordinate - a[axis]) / (b[axis] - a[axis])
    return accept([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
  })
}

export function outsideRect(route: Route, [x0, x1, z0, z1]: readonly number[]) {
  return route.points.slice(1).every((b, index) => {
    const a = route.points[index]
    let enter = 0
    let leave = 1
    for (const [axis, min, max] of [[0, x0, x1], [2, z0, z1]] as const) {
      const delta = b[axis] - a[axis]
      if (delta === 0) {
        if (a[axis] <= min || a[axis] >= max) return true
        continue
      }
      const t0 = (min - a[axis]) / delta
      const t1 = (max - a[axis]) / delta
      enter = Math.max(enter, Math.min(t0, t1))
      leave = Math.min(leave, Math.max(t0, t1))
    }
    return enter >= leave - 1e-7
  })
}

function compareFloors(backend: TraversalBackend) {
  return usingMesh(backend, getSurfaces(true), (nav) => {
    const at = [8, 0, 11] as const
    const above = [8, 3, 11] as const
    const pairs: readonly [Point, Point][] = [[at, above], [[7, 0.08, 12], [7, 2.92, 12]], [[3, 0, 12], [3, 3, 12]]]
    const routes = pairs.map(([a, b]) => nav.route(a, b))
    return check(routes.every((route) => route.status === 'complete' &&
      route.points[0][1] < 0.2 && route.points[route.points.length - 1][1] > 2.8 &&
      route.points.some(([x, y, z]) => y > 0.5 && y < 2.5 && z < 9 && (x < 5 || x > 11))),
    'Three coincident XZ pairs with height noise and a real ramp: ' + routes.map((route) => route.status).join(', '))
  })
}

function narrowVertical(backend: TraversalBackend) {
  return usingMesh(backend, getSurfaces(true), (nav) => {
    const first = nav.route([8, 0, 11], [9, 0, 11])
    const miss = nav.route([8, 1.5, 11], [9, 0, 11])
    return check(first.status === 'complete' && miss.status === 'unreachable' && miss.points.length === 0,
      'A vertical miss between decks returns no points after a successful query.')
  })
}

const ground = (id: string, run: CatalogCase['run']): CatalogCase => ({ id, layer: 'planner', run })
const openFloor = box('floor', 'surface', [0, -0.2, 0], [12, 0, 10])

export const groundCases: CatalogCase[] = [
  ground('E01', compareFloors),
  ground('E02', narrowVertical),
  ground('E03', (backend) => {
    const faces = [floor(0, 4, 0, 2), floor(0, 4, 2, 7, 0, 3), floor(0, 4, 7, 10, 3), floor(0.5, 3.5, 5.5, 9, -2)]
    const matches = [false, true].every((tiled) => usingMesh(backend, faces, (nav) =>
      nav.route([2, 0, 1], [2, 3, 9]).status === 'complete' &&
      nav.route([2, -2, 8], [2, 3, 9]).status === 'unreachable', { tiled }))
    return check(matches, 'Solo and 2 m tiles both connect the sloped decks and isolate the floor beneath.')
  }),
  { ...ground('E04', (backend) => {
    const outcomes = [1.35, 1.4, 1.45].map((gap) => {
      const shapes = [openFloor, box('ceiling', 'obstacle', [5, gap, 0], [7, gap + 0.2, 10])]
      return usingMesh(backend, traversalSurfaces(shapes, 1.4), (nav) => nav.route([2, 0, 5], [10, 0, 5]).status)
    })
    return check(outcomes.join() === 'unreachable,complete,complete', 'Ground clearance cuts at H−1, H, H+1: ' + outcomes.join(', '))
  }), coverage: 'adapted' },
  ground('E05', (backend) => {
    const direct = (radius: number, shift: number) => usingMesh(backend, [
      floor(0, 4, 0, 8), floor(8, 12, 0, 8), floor(4, 8, 2.7 + shift, 3.3 + shift), floor(4, 8, 6, 8)
    ], (nav) => {
      const route = nav.route([2, 0, 3], [10, 0, 3])
      return route.status === 'complete' && crosses(route, 0, 6, ([, , z]) => z < 4)
    }, { radius })
    return check([0, 0.023].every((shift) => direct(0.18, shift) && !direct(0.36, shift)),
      'Small agent uses the 0.6 m shortcut, larger agent is routed away from it at two voxel offsets.')
  }),
  ground('E06', (backend) => {
    const slopes = [1.7, 2.45, 3.5].map((y) => usingMesh(backend,
      [floor(0, 3, 0, 2), floor(0, 3, 2, 5, 0, y), floor(0, 3, 5, 8, y)],
      (nav) => nav.route([1.5, 0, 1], [1.5, y, 6]).status))
    const steps = [0, 0.05, 0.30].map((y) => usingMesh(backend,
      [floor(0, 3, 0, 3), floor(0, 3, 3, 7, y)], (nav) => nav.route([1.5, 0, 1], [1.5, y, 6]).status))
    return check(slopes[0] === 'complete' && slopes[1] === 'complete' && slopes[2] === 'unreachable' &&
      steps[0] === 'complete' && steps[2] === 'unreachable',
    'Slope limit and steps: slopes ' + slopes.join(', ') + '; steps ' + steps.join(', '))
  }),
  ground('E07', (backend) => {
    function routes(offset: number, mirror: number) {
      const faces = [floor(0, 2, 0, 3), floor(0, 5, 3, 4.6), floor(3.4, 5, 4.6, 8)]
      const transform = ([x, y, z]: Point): Point => [x * mirror + offset, y, z + offset]
      return [false, true].map((tiled) => usingMesh(backend, faces.map((face) => ({
        vertices: face.vertices.map(transform), triangles: mirror === 1 ? face.triangles : [0, 2, 1, 0, 3, 2]
      })), (nav) => {
        const path = nav.route(transform([1, 0, 1]), transform([4.2, 0, 7]))
        return path.status === 'complete' && crosses(path, 2, 3.8 + offset, ([x]) => (x - offset) * mirror > 0)
      }, { tiled })).every(Boolean)
    }
    return check(routes(0, 1) && routes(0.05, 1) && routes(-10, -1), 'S corridor across tile edges, one-cell offset and reflected negative coordinates.')
  }),
  ground('E08', (backend) => {
    const shapes = [box('floor', 'surface', [0, -0.2, 0], [8, 0, 7]),
      box('wall', 'obstacle', [2.025, 0, 1.2], [2.35, 1.8, 5.8])]
    const runs = [0.18, 0.3].flatMap((radius) => [false, true].map((tiled) => usingMesh(backend,
      traversalSurfaces(shapes, 1.4), (nav) => nav.route([1, 0, 2], [6, 0, 2]), { radius, tiled })))
    return check(runs.every((r) => r.status === 'complete' && outsideRect(r, [2.02, 2.35, 1.2, 5.8])),
      'Both radii and both rebuilds keep the route out of the wall immediately across a tile boundary.')
  }),
  ground('E09', (backend) => {
    const shapes: TraversalShape[] = [openFloor, box('shaft', 'obstacle', [4, 0, 2.6], [7, 2, 7.1]),
      box('column', 'obstacle', [8, 0, 4], [9.1, 2, 5.3]), box('notch', 'obstacle', [0, 0, 4], [2, 2, 6])]
    return usingMesh(backend, traversalSurfaces(shapes, 1.4), (nav) => {
      const routes = [[1, 0, 1], [2.8, 0, 5], [3, 0, 8.5]].map((p) => nav.route(p as unknown as Point, [10.8, 0, 5]))
      return check(routes.every((r) => r.status === 'complete' &&
        outsideRect(r, [4, 7, 2.6, 7.1]) && outsideRect(r, [8, 9.1, 4, 5.3])),
      'Three approaches retain connectivity without clipping either hole.')
    })
  }),
  ground('E10', (backend) => {
    const faces = [floor(0, 4, 0, 6, 2), floor(4, 8, 0, 6, 2),
      { vertices: [[4, 2, 3], [4.00001, 2, 3], [4, 2, 3.00001]], triangles: [0, 1, 2] } satisfies Surface]
    return usingMesh(backend, faces, (nav) => {
      const routes = [3.98, 4, 4.02].map((x) => nav.route([x, 2, 3], [6, 2, 3]))
      return check(routes.every((r) => r.status === 'complete' && r.points.every((p) =>
        p.every(Number.isFinite) && Math.abs(p[1] - 2) < 0.15)), 'Three edge queries stay finite and on the authored deck.')
    })
  }),
  ground('E11', (backend) => usingMesh(backend, [floor(0, 10, 0, 2), floor(0, 10, 2.65, 5), floor(8, 10, 2, 2.65)], (nav) => {
    const path = nav.route([1, 0, 1], [1, 0, 4])
    return check(path.status === 'complete' && crosses(path, 2, 2.3, ([x]) => x >= 8 && x <= 10),
      'Parallel corridors connect only through the remote portal.')
  })),
  { ...ground('E13', (backend) => {
    const a = floor(0, 3, 0, 3)
    const b = floor(3, 6, 0, 3)
    const extra = floor(2.99, 3.01, 0, 3)
    const route = (faces: readonly Surface[]) => usingMesh(backend, faces, (nav) => nav.route([1, 0, 1], [5, 0, 1]))
    const clean = route([a, b])
    const withDuplicate = route([a, b, b, extra])
    return check(clean.status === 'complete' && withDuplicate.points.every((p) => p.every(Number.isFinite)) &&
      (withDuplicate.status === 'unreachable' || pathLength(withDuplicate) >= 3.99),
    'A third coplanar edge yields a finite valid route or a safe refusal; the clean mesh connects.')
  }), coverage: 'adapted' },
  { ...ground('E16', (backend) => {
    const paths = [true, false].map((connected) => usingMesh(backend, [
      ...Array.from({ length: 12 }, (_, i) => floor(i * 2, i * 2 + 2, 0, 2)),
      floor(connected ? 24 : 25, 28, 0, 2)
    ], (nav) => nav.route([1, 0, 1], [26, 0, 1]), { tiled: true }))
    return check(paths[0].status === 'complete' && paths[1].status === 'unreachable' && paths[1].points.length === 0,
      'A truncated corridor is never promoted to a complete route by the SDK7 adapter.')
  }), coverage: 'adapted' }
]
