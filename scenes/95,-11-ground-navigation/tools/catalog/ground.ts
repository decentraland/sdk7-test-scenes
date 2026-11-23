import { generateTiledNavMesh as buildNavcatTiles } from 'navcat/blocks'
import { generateTiledNavMesh as buildDetourTiles } from 'recast-navigation/generators'
import type { Point, Surface } from '../../src/arena'
import { getSurfaces } from '../../src/arena'
import { createNavcatNavigatorFromMesh, toRecastGeometry, type Route } from '../../src/navigation'
import type { TraversalShape } from '../../src/traversal/types'
import { createDetourNavigatorFromMesh, type DetourQueryLimits } from '../../test/detour'
import { createTraversalNavigator, traversalSurfaces, type TraversalBackend } from '../sdk-detour-probe/traversal-routing'
import { groundClearance, groundFollower, pointDistance, type GroundEdge } from './ground-motion'
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
    const wrongStart = nav.route([8, 1.5, 11], [9, 0, 11])
    const wrongGoal = nav.route([8, 0, 11], [9, 1.5, 11])
    return check(first.status === 'complete' && [wrongStart, wrongGoal].every((route) =>
      route.status === 'unreachable' && route.points.length === 0),
    'Vertical misses for start and goal between decks return no points after a successful lower-floor query.')
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
  ground('E04', (backend) => {
    const cell = 0.05
    const height = 1.4
    // Rasterizing the flat floor raises the walkable span top by one cell.
    const start: Point = [2, cell, 5]
    const goal: Point = [10, cell, 5]
    const outcomes = [-1, 0, 1].map((offset) => {
      const roofY = height + (offset + 1) * cell
      const roof = floor(5, 7, 0, 10, roofY)
      const faces = [floor(0, 12, 0, 10), { ...roof, triangles: [0, 2, 1, 0, 3, 2] }]
      const route = usingMesh(backend, faces, (nav) => nav.route(start, goal), { height })
      const follower = groundFollower(start)
      follower.assign(route.status === 'complete' ? route.points : [goal])
      let safe = true
      for (let tick = 0; tick < 80 && !follower.finished() && safe; tick++) {
        safe = follower.step(0.2, (a, b) => Math.max(a[0], b[0]) + 0.22 <= 5 ||
          Math.min(a[0], b[0]) - 0.22 >= 7 ||
          Math.max(a[1], b[1]) + height <= roofY + 0.001)
      }
      return { status: route.status, swept: safe && follower.finished() && pointDistance(follower.position(), goal) < 0.02 }
    })
    return check(outcomes.every(({ status, swept }, i) => status === (i === 0 ? 'unreachable' : 'complete') && swept === (i > 0)),
      'Native ceiling triangles and the swept capsule agree at H−1, H, H+1: ' + JSON.stringify(outcomes))
  }),
  ground('E05', (backend) => {
    const start: Point = [2, 0, 3]
    const goal: Point = [10, 0, 3]
    const outcomes = [0, 0.023].flatMap((shift) => {
      const low = 2.7 + shift
      const high = 3.3 + shift
      const faces = [floor(0, 4, 0, 8), floor(8, 12, 0, 8), floor(4, 8, low, high), floor(4, 8, 6, 8)]
      const edge = (x0: number, z0: number, x1: number, z1: number): GroundEdge => [[x0, 0, z0], [x1, 0, z1]]
      const boundaries = [
        edge(0, 0, 0, 8), edge(12, 0, 12, 8), edge(0, 8, 12, 8),
        edge(0, 0, 4, 0), edge(8, 0, 12, 0), edge(4, low, 8, low), edge(4, high, 8, high),
        edge(4, 6, 8, 6), ...[4, 8].flatMap((x) => [edge(x, 0, x, low), edge(x, high, x, 6)])
      ]
      return [0.18, 0.36].map((radius) => {
        const route = usingMesh(backend, faces, (nav) => nav.route(start, goal), { radius })
        const clearance = groundClearance(route.points, boundaries)
        const throughExpectedLane = crosses(route, 0, 6, ([, , z]) =>
          radius === 0.18 ? z >= low && z <= high : z >= 6 && z <= 8)
        // The contour simplifier can move vertices by less than half a 5 cm cell.
        const last = route.points[route.points.length - 1]
        const legal = route.status === 'complete' && throughExpectedLane && clearance >= radius - 0.025 &&
          last !== undefined && pointDistance(last, goal) < 0.12
        return { radius, clearance: clearance.toFixed(3), status: route.status, legal }
      })
    })
    return check(outcomes.every(({ legal }) => legal),
      'Each bot must reach its route through the expected branch with a safe swept disc: ' + JSON.stringify(outcomes))
  }),
  ground('E06', (backend) => {
    const slopes = [1.7, 2.45, 3.5].map((y) => usingMesh(backend,
      [floor(0, 3, 0, 2), floor(0, 3, 2, 5, 0, y), floor(0, 3, 5, 8, y)],
      (nav) => nav.route([1.5, 0, 1], [1.5, y, 6]).status))
    const steps = [0, 0.05, 0.30].map((y) => usingMesh(backend,
      [floor(0, 3, 0, 3), floor(0, 3, 3, 7, y)], (nav) => nav.route([1.5, 0, 1], [1.5, y, 6]).status))
    return check(slopes[0] === 'complete' && slopes[1] === 'complete' && slopes[2] === 'unreachable' &&
      steps[0] === 'complete' && steps[1] === 'complete' && steps[2] === 'unreachable',
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
  { ...ground('E11', (backend) => {
    const faces = [floor(0, 10, 0, 2), floor(0, 10, 2.65, 5), floor(8, 10, 2, 2.65)]
    const route = (links: Parameters<typeof createTraversalNavigator>[4] = []) =>
      usingMesh(backend, faces, (nav) => nav.route([1, 0, 1], [1, 0, 4]), { links })
    const legalPortal = (path: Route) => path.status === 'complete' &&
      crosses(path, 2, 2.3, ([x]) => x >= 8 && x <= 10) &&
      !crosses(path, 2, 2.3, ([x]) => x < 8 || x > 10)
    const valid = route()
    // A bad seam weld is represented as one false adjacency. These adapters do not
    // expose Godot's edge-connection margin directly.
    const faulty = route([{ from: [1, 0, 1.6], to: [1, 0, 3.1] }])
    return check(legalPortal(valid) && faulty.status === 'complete' &&
      crosses(faulty, 2, 2.3, ([x]) => x < 8) && !legalPortal(faulty),
    'The portal oracle accepts the remote bridge and rejects an injected false connection across the gap.')
  }), coverage: 'adapted' },
  ground('E13', (backend) => {
    const a = floor(0, 3, 0, 3)
    const b = floor(3, 6, 0, 3)
    const extra = floor(2.99, 3.01, 0, 3)
    const route = (faces: readonly Surface[]) => usingMesh(backend, faces, (nav) => nav.route([1, 0, 1], [5, 0, 1]))
    // Exterior edges should have one incident triangle and interior edges two.
    // The weld uses the same cell spacing as the baked input.
    function conflicts(faces: readonly Surface[]) {
      const edges = new Map<string, number>()
      for (const face of faces) {
        const vertices = face.vertices.map((point) => point.map((value) => Math.round(value / 0.05)).join(','))
        for (let i = 0; i < face.triangles.length; i += 3) {
          const triangle = face.triangles.slice(i, i + 3).map((index) => vertices[index])
          for (let j = 0; j < 3; j++) {
            const key = [triangle[j], triangle[(j + 1) % 3]].sort().join(' → ')
            edges.set(key, (edges.get(key) ?? 0) + 1)
          }
        }
      }
      return [...edges].filter(([edge, count]) => count > 2 || edge.split(' → ')[0] === edge.split(' → ')[1])
    }
    const clean = route([a, b])
    const malformed = [[a, b, b], [a, b, extra]].map((input) => {
      const result = route(input)
      const diagnostics = conflicts(input)
      const safe = result.status === 'unreachable' || (pathLength(result) >= 3.99 &&
        result.points.every(([x, y, z]) => x >= 0 && x <= 6 && y >= -0.05 && y <= 0.15 && z >= 0 && z <= 3))
      return { conflicts: diagnostics.length, status: result.status, safe }
    })
    return check(conflicts([a, b]).length === 0 && clean.status === 'complete' &&
      malformed.every(({ conflicts, safe }) => conflicts > 0 && safe),
    'After welding to the bake grid, both the duplicate polygon edge and the thin wedge are diagnosed. ' +
      'The clean maps connect and malformed inputs give a safe route or refusal: ' + JSON.stringify(malformed))
  }),
]
