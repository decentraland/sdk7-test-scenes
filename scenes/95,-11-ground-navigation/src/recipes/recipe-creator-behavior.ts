import type { Point, Surface } from '../arena'
import type { Navigator, Route } from '../navigation'
import { pointAt } from './recipe-gameplay-support'
import { distance, FLOOR, pathLength, slab } from './recipe-runtime-support'

export const locomotionFloor = slab('locomotion floor', 1, 13, 2, 9)
export const locomotionStart: Point = [2, FLOOR, 3.5]
export const locomotionTurn: Point = [7, FLOOR, 3.5]
export const locomotionGoal: Point = [7, FLOOR, 7]
export const locomotionAsset = 'models/recipe-creator-behavior.glb'
export type Clip = 'idle' | 'walk'

export function getLocomotionPath(nav: Navigator): Point[] {
  const first = nav.route(locomotionStart, locomotionTurn)
  const second = nav.route(locomotionTurn, locomotionGoal)
  if (first.status !== 'complete' || second.status !== 'complete') {
    throw new Error('Locomotion fixture could not route through its turn.')
  }
  return [...first.points, ...second.points]
}

export function makeLocomotion(points: readonly Point[]) {
  if (points.length < 2) throw new Error('Locomotion requires a path.')
  const length = pathLength(points)
  let travelled = 0
  let elapsed = 0
  let speed = 0
  let position = points[0]

  return {
    step(dt: number) {
      if (!(dt > 0)) throw new Error('Locomotion expects a positive fixed step.')
      elapsed += dt
      const intent = travelled >= length || (elapsed >= 1 && elapsed < 1.8) ? 0 : 2
      const delta = intent - speed
      speed += Math.sign(delta) * Math.min(Math.abs(delta), 4 * dt)
      travelled = Math.min(length, travelled + speed * dt)
      const next = pointAt(points, travelled)
      const speedMetresPerSecond = distance(position, next) / dt
      position = next
      const clip: Clip = speedMetresPerSecond > 0.025 ? 'walk' : 'idle'
      return { position, clip, intent, speedMetresPerSecond, finished: travelled === length && clip === 'idle' }
    }
  }
}

export const resumeStart: Point = [5.35, FLOOR, 4]
export const resumeGoal: Point = [11, FLOOR, 4]
export const resumeGateX = 6
export const resumeGateZ = 4
const gateGap = 0.8
const laneLeft = slab('main lane west', 1, resumeGateX, 3, 5)
const laneRight = slab('main lane east', resumeGateX + gateGap, 13, 3, 5)
const gateSurface = slab('removable gate surface', resumeGateX, resumeGateX + gateGap, 3, 5)
export const resumeSlabs = [
  laneLeft, laneRight,
  slab('alternate lane', 1, 13, 7, 9),
  slab('west connector', 1, 3, 5, 7),
  slab('east connector', 11, 13, 5, 7)
]
export function resumeGeometry(open: boolean): Surface[] {
  return [...resumeSlabs, ...(open ? [gateSurface] : [])].map(({ surface }) => surface)
}

export function crossesClosedGate(from: Point, to: Point) {
  if (Math.min(from[0], to[0]) > resumeGateX || Math.max(from[0], to[0]) < resumeGateX || to[0] === from[0]) return false
  const z = from[2] + (to[2] - from[2]) * (resumeGateX - from[0]) / (to[0] - from[0])
  return Math.abs(z - resumeGateZ) < 1
}

export function makeResumeController(route: (from: Point, to: Point, revision: number) => Route, unsafe = false) {
  let position = resumeStart
  let revision = 0
  let travelled = 0
  let previousHidden = false
  let points = route(position, resumeGoal, revision).points
  if (points.length < 2) throw new Error('Resume fixture requires a valid open route.')
  let length = pathLength(points)

  return {
    position: () => position,
    step(hidden: boolean, nextRevision: number, dt: number) {
      const from = position
      if (hidden) {
        previousHidden = true
        return { from, position, revision, stepSeconds: 0 }
      }
      if (!unsafe && revision !== nextRevision) {
        revision = nextRevision
        const next = route(position, resumeGoal, revision)
        if (next.status !== 'complete') throw new Error('No route for current gate revision.')
        points = [position, ...next.points]
        length = pathLength(points)
        travelled = 0
      }
      const stepSeconds = !unsafe && previousHidden ? Math.min(dt, 0.1) : dt
      previousHidden = false
      travelled = Math.min(length, travelled + Math.max(stepSeconds, 0) * 3)
      position = pointAt(points, travelled)
      return { from, position, revision, stepSeconds }
    }
  }
}
