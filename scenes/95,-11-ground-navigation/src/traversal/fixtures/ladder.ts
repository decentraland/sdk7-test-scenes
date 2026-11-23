import type { Point } from '../../arena'
import type { TraversalScenario, TraversalShape } from '../types'
import { walkPoints } from '../walk'

type Stage = 'queued' | 'approach' | 'climb' | 'wait' | 'dismount' | 'retreat' | 'done'
type Rider = {
  id: string
  up: boolean
  feet: Point
  heading: number
  stage: Stage
  waypoints: Point[]
}
type Reservation = { rider: Rider }

const radius = 0.24
const height = 0.8
const floorY = 0.15
const landingY = 2.8
const ladderBottom: Point = [8.2, floorY, 6.5]
const ladderTop: Point = [8.2, landingY, 6.5]
const upperEntry: Point = [7.55, landingY, 6.5]
const park: Point = [6.1, floorY, 4.25]
const floor: TraversalShape = { id: 'floor', center: [8, 0.075, 7.5], size: [8, 0.15, 8], kind: 'surface' }
const landing: TraversalShape = { id: 'landing', center: [6.3, 2.7, 6.8], size: [3.1, 0.2, 3.8], kind: 'surface' }
const wall: TraversalShape = { id: 'wall', center: [8.46, 1.55, 6.98], size: [1.1, 2.8, 0.22], kind: 'obstacle' }
const crate: TraversalShape = { id: 'crate', center: [7.5, 3.2, 6.5], size: [0.48, 0.8, 0.68], kind: 'obstacle' }
const ladder: TraversalShape[] = [
  { id: 'rail-left', center: [7.96, 1.59, 6.76], size: [0.075, 2.9, 0.075], kind: 'guide' },
  { id: 'rail-right', center: [8.44, 1.59, 6.76], size: [0.075, 2.9, 0.075], kind: 'guide' },
  ...Array.from({ length: 9 }, (_, index): TraversalShape => ({
    id: 'rung-' + index,
    center: [8.2, 0.32 + index * 0.32, 6.75],
    size: [0.5, 0.05, 0.07],
    kind: 'guide'
  }))
]

function rider(id: string, up: boolean, feet: Point): Rider {
  return { id, up, feet, heading: 0, stage: 'queued', waypoints: [] }
}

function distance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function supported(feet: Point, shape: TraversalShape) {
  const [x, y, z] = feet
  const [cx, cy, cz] = shape.center
  const [sx, sy, sz] = shape.size
  return Math.abs(y - (cy + sy / 2)) < 1e-6 &&
    Math.abs(x - cx) + radius <= sx / 2 && Math.abs(z - cz) + radius <= sz / 2
}

function collides(feet: Point, shape: TraversalShape) {
  const [x, y, z] = feet
  const [cx, cy, cz] = shape.center
  const [sx, sy, sz] = shape.size
  const dx = Math.max(0, Math.abs(x - cx) - sx / 2)
  const dz = Math.max(0, Math.abs(z - cz) - sz / 2)
  return y < cy + sy / 2 && y + height > cy - sy / 2 && Math.hypot(dx, dz) < radius
}

function overlaps(a: Rider, b: Rider) {
  return Math.abs(a.feet[1] - b.feet[1]) < height &&
    Math.hypot(a.feet[0] - b.feet[0], a.feet[2] - b.feet[2]) < radius * 2
}

function advance(actor: Rider, step: number) {
  const next = actor.waypoints[0]
  if (!next) return true
  const [x, y, z] = actor.feet
  const length = distance(actor.feet, next)
  if (next[0] !== x || next[2] !== z) {
    actor.heading = Math.atan2(next[0] - x, next[2] - z) * 180 / Math.PI
  }
  if (length <= step) {
    actor.feet = next
    actor.waypoints.shift()
  } else {
    const ratio = step / length
    actor.feet = [x + (next[0] - x) * ratio, y + (next[1] - y) * ratio, z + (next[2] - z) * ratio]
  }
  return actor.waypoints.length === 0
}

export const contestedLadder: TraversalScenario = {
  id: 'contested-ladder',
  label: 'Contested ladder',
  cases: ['GAME-T13', 'EXEC-T07', 'EXEC-T08', 'GAME-T15'],
  variants: [
    { id: 'clear', label: 'Two per end' },
    { id: 'blocked-exit', label: 'Blocked upper exit' },
    { id: 'exit-timeout', label: 'Timeout and retreat' },
    { id: 'cancel-reservation', label: 'Cancel queued claim' }
  ],
  create(variantId, route) {
    if (!contestedLadder.variants.some(({ id }) => id === variantId)) throw new Error('Unknown ladder variant: ' + variantId)
    const requests = [
      rider('a', true, [8.2, floorY, 4.7]),
      rider('b', true, [8.2, floorY, 8.1]),
      rider('c', false, [5.45, landingY, 5.55]),
      rider('d', false, [5.45, landingY, 8.05])
    ]
    // Both directions request the same tick. Storage order deliberately changes in the cancellation run.
    const actors = variantId === 'cancel-reservation' ? requests.slice().reverse() : requests
    const pending = actors.slice().sort((a, b) => a.id.localeCompare(b.id))
    const crossed: string[] = []
    const rejected: string[] = []
    const retreated: string[] = []
    let current: Reservation | undefined
    let cancelled: Reservation | undefined
    let cratePresent = variantId === 'blocked-exit' || variantId === 'exit-timeout'
    let routedAroundWall = false
    let staleClaimRejected = false
    let wait = 0
    let waitObserved = 0
    let elapsed = 0
    let phase = 'Queueing'
    let detail = 'Both ends requested the only ladder slot.'
    let verdict: 'running' | 'pass' | 'fail' = 'running'

    function fail(message: string) {
      verdict = 'fail'
      detail = message
    }

    function claim(actor: Rider): Reservation | undefined {
      actor.stage = 'approach'
      const behindWall = actor.up && actor.feet[2] > wall.center[2]
      if (route) {
        const entrance: Point = actor.up ? [8.2, floorY, 5.85] : upperEntry
        const occupied: TraversalShape[] = actors.filter((other) => other !== actor).map((other) => ({
          id: 'waiting-' + other.id, kind: 'obstacle',
          center: [other.feet[0], other.feet[1] + height / 2, other.feet[2]],
          size: [radius * 2, height, radius * 2]
        }))
        const points = walkPoints(route, 'Ladder approach ' + actor.id, actor.feet, entrance,
          [floor, landing, wall, ...(cratePresent ? [crate] : []), ...occupied], radius, height)
        if (!points) {
          fail('Planner did not find the approach to the ladder for ' + actor.id + '.')
          return undefined
        }
        actor.waypoints = [...points, actor.up ? ladderBottom : ladderTop]
        routedAroundWall ||= behindWall
        return { rider: actor }
      }
      if (!actor.up) {
        actor.waypoints = [[actor.feet[0], landingY, ladderTop[2]], upperEntry, ladderTop]
      } else if (behindWall) {
        routedAroundWall = true
        actor.waypoints = [[9.55, floorY, actor.feet[2]], [9.55, floorY, 5.3], [8.2, floorY, 5.3], ladderBottom]
      } else {
        actor.waypoints = [ladderBottom]
      }
      return { rider: actor }
    }

    function attach(claimed: Reservation, feet = claimed.rider.feet, heading = claimed.rider.heading) {
      if (claimed !== current) return false
      const actor = claimed.rider
      const anchor = actor.up ? ladderBottom : ladderTop
      const expectedHeading = actor.up ? 0 : 90
      if (distance(feet, anchor) > 1e-6 || Math.abs(heading - expectedHeading) > 1) return false
      actor.stage = 'climb'
      actor.waypoints = [actor.up ? ladderTop : ladderBottom]
      return true
    }

    function release(actor: Rider, outcome: 'cross' | 'retreat') {
      const endsAbove = outcome === 'cross' && actor.up
      if (!supported(actor.feet, endsAbove ? landing : floor)) return fail('Released the ladder before stepping onto safe ground.')
      if (distance(actor.feet, endsAbove ? ladderTop : ladderBottom) <= radius * 2) {
        return fail('Released the ladder while its exit was occupied.')
      }
      actor.stage = 'done'
      current = undefined
      if (outcome === 'cross') crossed.push(actor.id)
      else retreated.push(actor.id)
      if (outcome === 'retreat') cratePresent = false
    }

    function checkMotion() {
      for (const actor of actors) {
        if (collides(actor.feet, wall) || (cratePresent && collides(actor.feet, crate))) {
          fail(actor.id + ' intersected an obstacle at ' + actor.feet.map((n) => n.toFixed(3)).join(', ') + '.')
          return
        }
        const atAnchor = Math.abs(actor.feet[0] - ladderBottom[0]) < radius &&
          Math.abs(actor.feet[2] - ladderBottom[2]) < radius
        if (atAnchor && current?.rider !== actor) {
          fail(actor.id + ' entered the ladder volume without a reservation.')
          return
        }
      }
      for (let first = 0; first < actors.length; first++) {
        if (actors.slice(first + 1).some((other) => overlaps(actors[first], other))) {
          fail('Two riders shared a capsule volume.')
          return
        }
      }
    }

    function finish() {
      const expectedCrossings = variantId === 'exit-timeout' || variantId === 'cancel-reservation' ? 'bcd' : 'abcd'
      const waitMatches = variantId === 'blocked-exit' ? waitObserved >= 0.8 : variantId === 'exit-timeout' ? waitObserved >= 1.4 : waitObserved === 0
      if (crossed.join('') !== expectedCrossings || !routedAroundWall || !waitMatches ||
          retreated.length !== (variantId === 'exit-timeout' ? 1 : 0) ||
          rejected.length !== (variantId === 'cancel-reservation' ? 1 : 0) ||
          (cancelled !== undefined && !staleClaimRejected)) {
        fail('FIFO, approach side, exit wait, or release did not match the expected outcome.')
        return
      }
      phase = 'Complete'
      verdict = 'pass'
      detail = crossed.length + ' crossed · ' + (retreated.length || rejected.length) +
        ' rejected · ' + waitObserved.toFixed(2) + ' s exit wait.'
    }

    return {
      step(dt) {
        if (verdict !== 'running') return
        elapsed += dt
        if (elapsed > 30) return fail('A rider remained queued after 30 simulated seconds.')
        if (!current) {
          const actor = pending.shift()
          if (!actor) return finish()
          current = claim(actor)
          if (!current) return
          // Inject a delayed activation with a valid contact pose from the previous claim.
          if (cancelled && !staleClaimRejected) {
            if (attach(cancelled, ladderBottom, 0)) return fail('A cancelled claim could still attach to the ladder.')
            staleClaimRejected = true
          }
          if (actor.id === 'a' && variantId === 'cancel-reservation') {
            cancelled = current
            current = undefined
            actor.stage = 'done'
            rejected.push(actor.id)
            detail = 'Cancelled the first claim before anyone entered the ladder.'
            return
          }
        }
        const claimed = current
        const actor = claimed.rider
        phase = actor.id.toUpperCase() + ' · ' + actor.stage
        detail = crossed.length + ' crossed · ' + actors.filter((entry) => entry.stage === 'queued').length + ' queued'

        if (actor.stage === 'wait') {
          if (cratePresent && collides(upperEntry, crate)) {
            wait += dt
            waitObserved = Math.max(wait, waitObserved)
            if (variantId === 'blocked-exit' && wait >= 0.8) cratePresent = false
          }
          if (!cratePresent || !collides(upperEntry, crate)) {
            actor.stage = 'dismount'
            actor.waypoints = [upperEntry, [6.85, landingY, 6.5], [6.85, landingY, actor.id === 'a' ? 5.5 : 8.1]]
          } else if (wait >= 1.4) {
            actor.stage = 'retreat'
            actor.waypoints = [ladderBottom, [8.2, floorY, 5.35], park]
          }
        } else if (advance(actor, (actor.stage === 'climb' || actor.stage === 'retreat' ? 1.8 : 2.7) * dt)) {
          switch (actor.stage) {
            case 'approach':
              if (!attach(claimed)) fail('Rider reached the ladder from the wrong pose or without a claim.')
              break
            case 'climb':
              if (actor.up) {
                wait = 0
                actor.stage = 'wait'
              } else {
                actor.stage = 'dismount'
                actor.waypoints = [[8.2, floorY, 5.35], [actor.id === 'c' ? 9.55 : 6.8, floorY, 4.5]]
              }
              break
            case 'dismount':
              release(actor, 'cross')
              break
            case 'retreat':
              release(actor, 'retreat')
              break
          }
        }
        if (verdict === 'running') checkMotion()
      },
      frame() {
        return {
          shapes: [floor, landing, wall, ...ladder, ...(cratePresent ? [crate] : [])],
          bots: actors.map(({ id, feet, heading }) => ({ id, feet, radius, height, headingDegrees: heading })),
          phase,
          verdict,
          detail
        }
      }
    }
  }
}
