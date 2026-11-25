import { createFindNearestPolyResult, DEFAULT_QUERY_FILTER, findNearestPoly, raycast, type Vec3 } from 'navcat'
import type { Point, Surface } from '../arena'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, NAVIGATION_BAKE, withinSnap, type Navigator } from '../navigation'
import type { TraversalRun, TraversalShape } from '../traversal/types'

export const FLOOR = 0.2
export const RADIUS = 0.2
export const STANDING = 1.65
const SPEED = 2.2

export type Shortcut = { horizontalClear: boolean; reachedPolygon: boolean; visited: number }
export type RecipeNavigator = Navigator & {
  shortcut(from: Point, to: Point): Shortcut
  dispose?(): void
}
export type RecipeNavigatorFactory = (surfaces: readonly Surface[], height?: number) => RecipeNavigator

export function recipeBake(height = STANDING) {
  return {
    ...NAVIGATION_BAKE, cellSize: 0.05, cellHeight: 0.05, radius: RADIUS,
    height, minRegionSize: 1, mergeRegionSize: 1, maxSimplificationError: 0.35
  }
}

const reflect = ([x, y, z]: Point): Vec3 => [x, y, -z]
const shortcutExtents: Vec3 = [0.35, 0.3, 0.35]

export const makeNavcatRecipeNavigator: RecipeNavigatorFactory = (surfaces, height) => {
  const mesh = bakeNavcatMesh(surfaces, recipeBake(height))
  const navigator = createNavcatNavigatorFromMesh(mesh)
  function project(point: Point) {
    const position = reflect(point)
    const result = findNearestPoly(createFindNearestPolyResult(), mesh, position, shortcutExtents, DEFAULT_QUERY_FILTER)
    return result.success && withinSnap(result.position, position) ? result : undefined
  }
  return {
    ...navigator,
    shortcut(from, to) {
      const start = project(from)
      const goal = project(to)
      if (!start || !goal) return { horizontalClear: false, reachedPolygon: false, visited: 0 }
      const hit = raycast(mesh, start.nodeRef, start.position, goal.position, DEFAULT_QUERY_FILTER)
      return { horizontalClear: hit.t >= 1, reachedPolygon: hit.path[hit.path.length - 1] === goal.nodeRef, visited: hit.path.length }
    }
  }
}

export function slab(id: string, x0: number, x1: number, z0: number, z1: number, y = FLOOR) {
  return {
    surface: {
      vertices: [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], triangles: [0, 1, 2, 0, 2, 3]
    } satisfies Surface,
    shape: { id, kind: 'surface', center: [(x0 + x1) / 2, y - 0.06, (z0 + z1) / 2], size: [x1 - x0, 0.12, z1 - z0] } satisfies TraversalShape
  }
}

export function marker(id: string, [x, y, z]: Point, kind: 'guide' | 'target' = 'target'): TraversalShape {
  return { id, kind, center: [x, y + 0.025, z], size: [0.22, 0.05, 0.22] }
}

type Stage = { phase: string; height: number; points: readonly Point[]; holdSeconds?: number }
export type RecipeRun = TraversalRun & { metrics: Readonly<Record<string, number>> }
export type PlaybackVerification = {
  move(from: Point, to: Point, phase: string, height: number, fraction: number): boolean
  finish(feet: Point, height: number): boolean
}

export function distance(a: Point, b: Point) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
}

export function pathLength(points: readonly Point[]) {
  return points.slice(1).reduce((sum, point, i) => sum + distance(points[i], point), 0)
}

function positionAt(points: readonly Point[], distanceLeft: number): Point {
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]
    const to = points[i]
    const length = distance(from, to)
    if (length > 0 && distanceLeft < length) {
      const alpha = distanceLeft / length
      return [from[0] + (to[0] - from[0]) * alpha, from[1] + (to[1] - from[1]) * alpha, from[2] + (to[2] - from[2]) * alpha]
    }
    distanceLeft -= length
  }
  return points[points.length - 1]
}

export function playback(
  stages: readonly Stage[], shapes: (phase: string, fraction: number) => readonly TraversalShape[],
  passed: boolean, detail: string, metrics: Readonly<Record<string, number>>,
  verification?: PlaybackVerification
): RecipeRun {
  const waypointDistances = stages.map(({ points }) => {
    const travelled = [0]
    for (let i = 1; i < points.length; i++) travelled.push(travelled[i - 1] + distance(points[i - 1], points[i]))
    return travelled
  })
  const lengths = waypointDistances.map((positions) => positions[positions.length - 1])
  const durations = stages.map(({ holdSeconds }, i) => holdSeconds ?? lengths[i] / SPEED)
  const observed = { ...metrics, travelledMetres: 0, scenarioSeconds: 0, motionViolations: 0 }
  let stage = 0
  let elapsed = 0
  let waypoint = 1
  let feet = stages[0].points[0]
  function move(next: Point, fraction: number) {
    const current = stages[stage]
    observed.travelledMetres += distance(feet, next)
    if (verification && !verification.move(feet, next, current.phase, current.height, fraction)) {
      observed.motionViolations++
    }
    feet = next
  }
  return {
    frame() {
      const current = Math.min(stage, stages.length - 1)
      const { phase, height } = stages[current]
      const done = stage === stages.length
      const fraction = done || durations[current] === 0 ? 1 : Math.min(1, elapsed / durations[current])
      return {
        phase, detail: done && observed.motionViolations ? detail + ' Invalid observed movement.' : detail,
        verdict: done ? (passed && observed.motionViolations === 0 ? 'pass' : 'fail') : 'running',
        shapes: shapes(phase, fraction),
        bots: [{ id: 'recipe-bot', height, radius: RADIUS, feet }]
      }
    },
    step(dt) {
      while (stage < stages.length) {
        const duration = durations[stage]
        const advance = Math.min(dt, Math.max(0, duration - elapsed))
        observed.scenarioSeconds += advance
        elapsed += advance
        const fraction = duration === 0 ? 1 : Math.min(1, elapsed / duration)
        const travelled = lengths[stage] * fraction
        const points = stages[stage].points
        const waypoints = waypointDistances[stage]
        while (waypoint < points.length && waypoints[waypoint] < travelled - 1e-9) {
          const waypointFraction = lengths[stage] === 0 ? 0 : waypoints[waypoint] / lengths[stage]
          move(points[waypoint++], waypointFraction)
        }
        move(positionAt(points, travelled), fraction)
        if (elapsed + 1e-10 < duration) break
        dt -= advance
        stage++
        elapsed = 0
        waypoint = 1
        if (stage < stages.length) {
          if (verification && distance(feet, stages[stage].points[0]) > 0.12) observed.motionViolations++
          move(stages[stage].points[0], 0)
        } else if (verification && !verification.finish(feet, stages[stage - 1].height)) {
          observed.motionViolations++
        }
      }
    },
    metrics: observed
  }
}
