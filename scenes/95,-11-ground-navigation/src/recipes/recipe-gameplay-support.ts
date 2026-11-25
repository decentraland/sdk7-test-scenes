import type { Point, Surface } from '../arena'
import type { Navigator } from '../navigation'
import type { TraversalBot, TraversalShape } from '../traversal/types'
import { distance, pathLength, type RecipeRun } from './recipe-runtime-support'

export type GameplayNavigator = Navigator & { dispose?(): void }
export type GameplayNavigatorFactory = (surfaces: readonly Surface[]) => GameplayNavigator

export type Motion = {
  seconds: number
  at: (time: number) => Point
}

export function pointAt(points: readonly Point[], metres: number): Point {
  for (let i = 1; i < points.length; i++) {
    const length = distance(points[i - 1], points[i])
    if (length > 0 && metres < length) {
      const from = points[i - 1]
      const to = points[i]
      const t = Math.max(0, metres) / length
      return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]
    }
    metres -= length
  }
  return points[points.length - 1]
}

export function walk(points: readonly Point[], speed: number): Motion {
  return { seconds: pathLength(points) / speed, at: (time) => pointAt(points, time * speed) }
}

export function hold(point: Point, seconds: number): Motion {
  return { seconds, at: () => point }
}

export function joinMotions(...motions: readonly Motion[]): Motion {
  return {
    seconds: motions.reduce((total, motion) => total + motion.seconds, 0),
    at(time) {
      for (const motion of motions) {
        if (time <= motion.seconds) return motion.at(time)
        time -= motion.seconds
      }
      const last = motions[motions.length - 1]
      return last.at(last.seconds)
    }
  }
}

export function nativePath(nav: GameplayNavigator, ...anchors: readonly Point[]): Point[] {
  const points = [anchors[0]]
  for (let i = 1; i < anchors.length; i++) {
    const route = nav.route(anchors[i - 1], anchors[i])
    const end = route.points[route.points.length - 1]
    if (route.status !== 'complete' || !end || distance(end, anchors[i]) > 0.2) return []
    points.push(...route.points)
  }
  return points
}

export function shape(id: string, kind: TraversalShape['kind'], center: Point, size: Point): TraversalShape {
  return { id, kind, center, size }
}

export function routeMarks(id: string, points: readonly Point[]): TraversalShape[] {
  const length = pathLength(points)
  if (!points.length || !length) return []
  return Array.from({ length: Math.ceil(length / 0.32) }, (_, i) => {
    const [x, y, z] = pointAt(points, i * 0.32)
    return shape(id + '-' + i, 'guide', [x, y + 0.07, z], [0.1, 0.03, 0.1])
  })
}

export function showRun(
  seconds: number, passed: boolean, detail: string, metrics: Readonly<Record<string, number>>,
  display: (time: number) => { shapes: readonly TraversalShape[]; bots: readonly TraversalBot[]; phase: string }
): RecipeRun {
  let time = 0
  return {
    frame() {
      return {
        ...display(Math.min(time, seconds)), detail,
        verdict: time + 1e-9 < seconds ? 'running' : passed ? 'pass' : 'fail'
      }
    },
    step(dt) { time += dt },
    metrics
  }
}
