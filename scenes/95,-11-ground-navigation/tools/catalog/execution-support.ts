import type { Point } from '../../src/arena'
import { capsuleHits, interpolate, supports } from '../../src/traversal/fixtures/mantles-support'
import type { TraversalShape } from '../../src/traversal/types'

export function distance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function worldPoint(local: Point, origin: Point, yaw: number): Point {
  const angle = yaw * Math.PI / 180
  const [x, y, z] = local
  return [
    origin[0] + x * Math.cos(angle) + z * Math.sin(angle),
    origin[1] + y,
    origin[2] - x * Math.sin(angle) + z * Math.cos(angle)
  ]
}

export function descendingSupport(from: Point, to: Point, surfaces: readonly TraversalShape[]) {
  if (to[1] >= from[1]) return undefined
  let first: { surface: TraversalShape; contact: Point } | undefined
  let earliest = Infinity
  for (const surface of surfaces) {
    const height = surface.center[1] + surface.size[1] / 2
    if (from[1] < height || to[1] > height) continue
    const t = (from[1] - height) / (from[1] - to[1])
    if (t >= earliest) continue
    const [x, , z] = interpolate(from, to, t)
    const contact: Point = [x, height, z]
    if (supports(surface, contact)) {
      earliest = t
      first = { surface, contact }
    }
  }
  return first
}

export function canStepUp(feet: Point, direction: Point, rise: number, clearance: number, solids: readonly TraversalShape[]) {
  const lifted: Point = [feet[0], feet[1] + rise, feet[2]]
  const across: Point = [lifted[0] + direction[0] * clearance, lifted[1], lifted[2] + direction[2] * clearance]
  return solids.every((part) => !capsuleHits(feet, lifted, part) && !capsuleHits(lifted, across, part))
}

export type MotionProposal = { owner: 'walk' | 'transition' | 'platform'; point: Point }

export function resolveMotion(owner: MotionProposal['owner'], proposals: readonly MotionProposal[]) {
  const eligible = proposals.filter((proposal) => proposal.owner === owner)
  if (eligible.length !== 1) throw new Error('Each simulation tick needs one movement writer.')
  return eligible[0]
}
