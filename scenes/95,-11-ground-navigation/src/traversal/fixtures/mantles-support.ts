import type { Point } from '../../arena'
import type { TraversalShape } from '../types'

export const BOT_RADIUS = 0.25
export const BOT_HEIGHT = 1.8
const EPSILON = 1e-6

export function interpolate(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function advance(a: Point, b: Point, remaining: number): Point {
  const distance = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  if (distance <= remaining) return b
  return interpolate(a, b, remaining / distance)
}

function surfaceHeight(shape: TraversalShape) {
  return shape.center[1] + shape.size[1] / 2
}

export function supports(shape: TraversalShape, feet: Point, radius = BOT_RADIUS): boolean {
  return shape.kind === 'surface' &&
    Math.abs(feet[1] - surfaceHeight(shape)) < EPSILON &&
    Math.abs(feet[0] - shape.center[0]) + radius <= shape.size[0] / 2 + EPSILON &&
    Math.abs(feet[2] - shape.center[2]) + radius <= shape.size[2] / 2 + EPSILON
}

export function touchesGrip(point: Point, shape: TraversalShape) {
  return point.every((value, axis) => Math.abs(value - shape.center[axis]) <= shape.size[axis] / 2 + EPSILON)
}

function distanceToInterval(value: number, min: number, max: number) {
  return Math.max(min - value, value - max, 0)
}

export function capsuleHits(start: Point, end: Point, shape: TraversalShape) {
  const [x, y, z] = shape.center
  const [w, h, d] = shape.size
  // The capsule axis spans [feet.y + radius, feet.y + height - radius].
  // This extends the box vertically so the axis-to-box distance uses only the feet position.
  function distanceSquared(feet: Point) {
    const dx = distanceToInterval(feet[0], x - w / 2, x + w / 2)
    const dy = distanceToInterval(feet[1], y - h / 2 - (BOT_HEIGHT - BOT_RADIUS), y + h / 2 - BOT_RADIUS)
    const dz = distanceToInterval(feet[2], z - d / 2, z + d / 2)
    return dx * dx + dy * dy + dz * dz
  }

  // Squared distance to a box is convex over a segment. Search the whole sweep
  // and allow tangency, including when a bot stands on a floor.
  let lo = 0
  let hi = 1
  for (let iteration = 0; iteration < 24; iteration++) {
    const left = (2 * lo + hi) / 3
    const right = (lo + 2 * hi) / 3
    if (distanceSquared(interpolate(start, end, left)) <= distanceSquared(interpolate(start, end, right))) {
      hi = right
    } else {
      lo = left
    }
  }
  const minimum = Math.min(
    distanceSquared(start),
    distanceSquared(end),
    distanceSquared(interpolate(start, end, (lo + hi) / 2))
  )
  return minimum < BOT_RADIUS * BOT_RADIUS - EPSILON
}
