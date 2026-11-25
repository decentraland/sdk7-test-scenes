import type { Point } from '../../arena'
import type { TraversalFrame, TraversalRouter, TraversalRun, TraversalShape } from '../types'
import { walkPoints } from '../walk'
import { advance, BOT_HEIGHT, BOT_RADIUS, capsuleHits, supports } from './mantles-support'

export function createWindowClearance(high: boolean, router?: TraversalRouter): TraversalRun {
  const floorY = 0.35
  const lintelY = floorY + (high ? 2 : 1.2)
  const wallZ = 6.5
  const start: Point = [8, floorY, 4.8]
  const goal: Point = [8, floorY, 8.5]
  const floor: TraversalShape = { id: 'room-floor', kind: 'surface', center: [8, 0.15, 6.6], size: [4, 0.4, 6] }
  const walls: TraversalShape[] = [
    { id: 'left-wall', kind: 'obstacle', center: [6.75, 1.85, wallZ], size: [1.5, 3, 0.2] },
    { id: 'right-wall', kind: 'obstacle', center: [9.25, 1.85, wallZ], size: [1.5, 3, 0.2] },
    { id: 'lintel', kind: 'obstacle', center: [8, (lintelY + 3.35) / 2, wallZ], size: [1, 3.35 - lintelY, 0.2] }
  ]
  const rayY = floorY + 0.95
  const shapes: TraversalShape[] = [
    floor,
    ...walls,
    { id: 'probe', kind: 'guide', center: [8, rayY, (start[2] + goal[2]) / 2], size: [0.025, 0.025, goal[2] - start[2]] },
    { id: 'goal', kind: 'target', center: [8, floorY + 0.045, goal[2]], size: [0.25, 0.09, 0.25] }
  ]
  let feet = start
  let verdict: TraversalFrame['verdict'] = 'running'
  let phase = 'Probe the room'
  let detail = 'The same narrow probe looks through each opening.'
  let points: Point[] | undefined

  function finish(passed: boolean, reason: string) {
    verdict = passed ? 'pass' : 'fail'
    detail = reason
    phase = 'Finished'
  }

  return {
    frame: () => ({ shapes, bots: [{ id: 'bot', feet, radius: BOT_RADIUS, height: BOT_HEIGHT }], phase, verdict, detail }),
    step(dt) {
      if (verdict !== 'running') return
      if (!points) {
        const rayBlocked = walls.some(({ center: [x, y, z], size: [w, h, d] }) =>
          Math.abs(start[0] - x) <= w / 2 && Math.abs(rayY - y) <= h / 2 &&
          z + d / 2 >= start[2] && z - d / 2 <= goal[2])
        const sweepBlocked = walls.some((part) => capsuleHits(start, goal, part))
        if (rayBlocked || sweepBlocked === high) return finish(false, 'Ray and capsule disagreed with the authored window dimensions.')
        if (sweepBlocked) return finish(feet === start && supports(floor, feet),
          'The ray reaches the target behind the 1.2 m window. The capsule stays at the start.')

        const path = walkPoints(router, 'Traverse the 2 m opening', feet, goal, [floor, ...walls], BOT_RADIUS, BOT_HEIGHT)
        if (!path?.length) return finish(false, 'No route through the clear 2 m opening.')
        points = [...path]
        phase = 'Walk through the opening'
      }

      const next = advance(feet, points[0], 2.5 * dt)
      if (walls.some((part) => capsuleHits(feet, next, part)) || !supports(floor, next)) {
        return finish(false, 'The executing capsule clipped the wall or lost support.')
      }
      feet = next
      if (next === points[0]) points.shift()
      if (!points.length) finish(feet === goal, 'The same ray sees the target. The capsule walks through the 2 m window.')
    }
  }
}
