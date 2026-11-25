import type { Point, Surface } from '../../src/arena'
import type { TraversalShape } from '../../src/traversal/types'
import { supports } from '../../src/traversal/fixtures/mantles-support'
import { createTraversalNavigator, traversalSurfaces, type AuthoredLink, type TraversalBackend } from '../sdk-detour-probe/traversal-routing'
import { box } from './types'

const DT = 1 / 120
const EPSILON = 1e-8
const ZERO: Point = [0, 0, 0]

export type FlightState = { position: Point; velocity: Point; time: number; peak: number }
type FlightOptions = {
  position: Point
  velocity: Point
  gravity?: number
  descendingGravity?: number
  radius?: number
  floors: readonly TraversalShape[]
  limit?: number
  beforeStep?(state: FlightState): { velocity?: Point; acceleration?: Point; gravity?: number } | undefined
}

export function flight({
  position, velocity, gravity = 10, descendingGravity = gravity, radius = 0.1,
  floors, limit = 3, beforeStep
}: FlightOptions) {
  let state: FlightState = { position, velocity, time: 0, peak: position[1] }
  const trace = [state]
  while (state.time < limit - EPSILON) {
    const control = beforeStep?.(state)
    const speed = control?.velocity ?? state.velocity
    const motion = control?.acceleration ?? ZERO
    const gravityNow = control?.gravity ?? (speed[1] > EPSILON ? gravity : descendingGravity)
    const rate: Point = [motion[0], motion[1] - gravityNow, motion[2]]
    const dt = Math.min(DT, limit - state.time)
    const integrate = (elapsed: number): FlightState => {
      const axis = (index: 0 | 1 | 2) => state.position[index] + speed[index] * elapsed + rate[index] * elapsed ** 2 / 2
      const next: Point = [axis(0), axis(1), axis(2)]
      const nextSpeed: Point = [speed[0] + rate[0] * elapsed, speed[1] + rate[1] * elapsed, speed[2] + rate[2] * elapsed]
      return { position: next, velocity: nextSpeed, peak: Math.max(state.peak, next[1]), time: state.time + elapsed }
    }
    const next = integrate(dt)
    if (next.velocity[1] < 0 && next.position[1] < state.position[1]) {
      const byHeight = floors.slice().sort((a, b) => top(b) - top(a))
      for (const surface of byHeight) {
        const height = top(surface)
        if (height > state.position[1] + EPSILON || height < next.position[1] - EPSILON) continue
        let lo = 0
        let hi = dt
        for (let i = 0; i < 24; i++) {
          const middle = (lo + hi) / 2
          if (integrate(middle).position[1] > height) lo = middle
          else hi = middle
        }
        const hit = integrate((lo + hi) / 2)
        const feet: Point = [hit.position[0], height, hit.position[2]]
        if (supports(surface, feet, radius)) {
          const contact = { ...hit, position: feet }
          return { contact, support: surface.id, trace: [...trace, contact] }
        }
      }
    }
    state = next
    trace.push(state)
  }
  return { contact: state, support: undefined, trace }
}

export function top(shape: TraversalShape) {
  return shape.center[1] + shape.size[1] / 2
}

export function floor(id: string, x: number, y: number, z: number, xSize = 1, zSize = 1) {
  return box(id, 'surface', [x - xSize / 2, y - 0.2, z - zSize / 2], [x + xSize / 2, y, z + zSize / 2])
}

export function close(a: number, b: number, tolerance = 0.001) {
  return Math.abs(a - b) <= tolerance
}

export function withNavigator<T>(
  backend: TraversalBackend, shapes: readonly TraversalShape[],
  radius: number, height: number, links: readonly AuthoredLink[],
  run: (route: ReturnType<typeof createTraversalNavigator>['route']) => T,
  additionalSurfaces: readonly Surface[] = []
) {
  const surfaces = [...traversalSurfaces(shapes, height), ...additionalSurfaces]
  const navigator = createTraversalNavigator(backend, surfaces, radius, height, links, true)
  try {
    return run((from, to) => navigator.route(from, to))
  } finally {
    navigator.dispose?.()
  }
}
