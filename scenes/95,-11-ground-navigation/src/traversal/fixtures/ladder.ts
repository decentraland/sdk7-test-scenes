import type { Point } from '../../arena'
import type { TraversalRouter, TraversalRun, TraversalScenario, TraversalShape } from '../types'
import { walkPoints } from '../walk'
import { capsuleHits } from './mantles-support'

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
const floor: TraversalShape = { id: 'floor', center: [8, 0.075, 7.5], size: [8, 0.15, 8], kind: 'surface' }
const landing: TraversalShape = { id: 'landing', center: [6.3, 2.7, 6.8], size: [3.1, 0.2, 3.8], kind: 'surface' }
const wall: TraversalShape = { id: 'wall', center: [8.46, 1.55, 6.98], size: [1.1, 2.8, 0.22], kind: 'obstacle' }
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

const soleExitVariants = [
  { id: 'blocked-exit', label: 'Crate clears after 800 ms' },
  { id: 'exit-timeout', label: 'Timeout and retreat' },
  { id: 'beam-exit-open', label: 'Side landing below the beam' },
  { id: 'beam-exit-blocked', label: 'Side landing stays blocked' }
]
const sideVariants: Readonly<Record<string, Point>> = {
  'front-approach': [8, floorY, 5.25],
  'side-approach': [9.8, floorY, 6.67],
  'behind-approach': [8, floorY, 8.13]
}

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

function createsSideApproach(start: Point, route?: TraversalRouter): TraversalRun {
  const divider: TraversalShape = { id: 'ladder-divider', center: [8, 1.55, 7.5], size: [3, 2.8, 0.3], kind: 'obstacle' }
  const curbs: TraversalShape[] = [-1, 1].map((side) => ({
    id: 'curb-' + side, center: [8 + side * 1.65, floorY + 0.15, 7.5],
    size: [0.6, 0.3, 1.1], kind: 'obstacle'
  }))
  const front: Point = [8, floorY, 6.95]
  const rear: Point = [8, floorY, 8.05]
  const access: Point = [8, floorY, 6.25]
  const obstacles = [divider, ...curbs]
  const guides = [front, rear].flatMap(([x, , z], side) => Array.from({ length: 8 }, (_, rung): TraversalShape => ({
    id: 'side-' + side + '-rung-' + rung, center: [x, 0.35 + rung * 0.33, z + (side === 0 ? 0.27 : -0.27)],
    size: [0.55, 0.055, 0.08], kind: 'guide'
  })))
  const shapes = [floor, ...obstacles, ...guides]
  const actor = rider('entrant', true, start)
  const behind = start[2] > divider.center[2]
  const canAttach = (side: 'front' | 'rear', point: Point, facing: number) => {
    const reference = side === 'front' ? front : rear
    return distance(point, reference) <= 0.03 && Math.abs(facing - (side === 'front' ? 0 : 180)) <= 1
  }
  let roundedEnd = false
  let attached = false
  let phase = 'Find approach'
  let verdict: 'running' | 'pass' | 'fail' = 'running'
  let detail = 'Only the signed front contact can use the assigned ladder.'

  return {
    step(dt) {
      if (verdict !== 'running') return
      if (actor.stage === 'queued') {
        const path = walkPoints(route, phase, start, access, shapes, radius, height)
        const rejectsWrongSide = !canAttach('front', start, behind ? 180 : 90) &&
          !canAttach('front', front, 180) && !canAttach('front', rear, 180) && canAttach('rear', rear, 180)
        if (!path || !rejectsWrongSide || (behind && distance(start, rear) >= distance(start, front))) {
          verdict = 'fail'
          detail = 'Wrong-side rejection or the legal approach was not exercised.'
          return
        }
        const reference: Point[] = behind
          ? [[start[0], floorY, 8.55], [10.65, floorY, 8.55], [10.65, floorY, 6.25], access]
          : [access]
        actor.waypoints = [...(route ? path : reference), front]
        actor.stage = 'approach'
      }
      const before = actor.feet
      const done = advance(actor, (attached ? 1.8 : 2.7) * dt)
      if (obstacles.some((shape) => capsuleHits(before, actor.feet, shape, radius, height))) {
        verdict = 'fail'
        detail = 'Approach or climb crossed the wall or curb.'
        return
      }
      roundedEnd ||= before[2] >= 7.5 && actor.feet[2] < 7.5 &&
        Math.abs(actor.feet[0] - 8) > 1.95
      if (!done) return
      if (!attached) {
        if (!canAttach('front', actor.feet, actor.heading) || (behind && !roundedEnd) || !supported(actor.feet, floor)) {
          verdict = 'fail'
          detail = 'Approach did not confirm front contact, facing and ground support.'
          return
        }
        attached = true
        actor.waypoints = [[front[0], front[1] + 0.8, front[2]]]
        phase = 'Climb'
        return
      }
      verdict = 'pass'
      phase = 'Attached'
      detail = 'Front-only attachment is supported and oriented' + (roundedEnd ? ' after routing around the end curb.' : '.')
    },
    frame() {
      return { shapes, bots: [{ id: actor.id, feet: actor.feet, radius, height, headingDegrees: actor.heading }], phase, detail, verdict }
    }
  }
}

function createsTimedExit(variant: string, route?: TraversalRouter): TraversalRun {
  const beamCase = variant.startsWith('beam-')
  const timedOut = variant.endsWith('blocked') || variant === 'exit-timeout'
  const waitSeconds = beamCase ? 1 : 0.8
  const timeout = 1.4
  const top: Point = [ladderTop[0], landingY + 0.1, ladderTop[2]]
  const overLanding: Point = [7.32, top[1], top[2]]
  const feetOnLanding: Point = [overLanding[0], landingY, overLanding[2]]
  const approach: Point = [ladderBottom[0], floorY, 5.85]
  const beam: TraversalShape = { id: 'overhang', center: [8.2, 3.86, 6.5], size: [0.75, 0.14, 0.85], kind: 'obstacle' }
  const ceiling = beamCase ? [beam] : []
  const actor = rider('climber', true, [8.2, floorY, 4.7])
  const obstacles = [wall, ...ceiling]
  // The block is in the middle of the horizontal exit, clear of both endpoints.
  // A controller that checks only its feet or the final contact misses this case.
  let cratePosition = 5.4
  const block = (): TraversalShape => ({ id: 'moving-crate', center: [7.75, 3.25, cratePosition], size: [0.22, 0.8, 0.36], kind: 'obstacle' })
  const clear = () => ![...obstacles, block()].some((shape) =>
    capsuleHits(top, overLanding, shape, radius, height) || capsuleHits(overLanding, feetOnLanding, shape, radius, height))
  let attached = false
  let detached = false
  let waited = 0
  let phase = 'Approach'
  let verdict: 'running' | 'pass' | 'fail' = 'running'
  let detail = 'The upper rung is not a completed traversal.'

  function fail(message: string) { verdict = 'fail'; detail = message }
  return {
    step(dt) {
      if (verdict !== 'running') return
      if (actor.stage === 'queued') {
        const path = walkPoints(route, 'Timed ladder approach', actor.feet, approach, [floor, landing, ...obstacles], radius, height)
        if (!path) return fail('No valid approach to the ladder.')
        actor.stage = 'approach'
        actor.waypoints = [...path, ladderBottom]
      }
      if (actor.stage === 'climb') {
        // Slide the crate across the exit before the mover reaches the top.
        if (actor.feet[1] > top[1] - 0.55) cratePosition = Math.min(6.5, cratePosition + 5 * dt)
      }
      if (actor.stage === 'wait') {
        if (!attached || detached || distance(top, actor.feet) > 1e-6 || supported(actor.feet, landing)) {
          return fail('A blocked climber left its held rung or announced ground contact.')
        }
        waited += dt
        if (!timedOut) {
          const slideDuration = 0.2
          const slide = Math.min(1, Math.max(0, (waited - (waitSeconds - slideDuration)) / slideDuration))
          cratePosition = 6.5 - (block().size[2] / 2 + radius + 0.02) * slide
        }
        if (waited + 1e-7 < waitSeconds && clear()) return fail('The obstacle cleared its exit before the configured tick.')
        if (!timedOut && waited + 1e-7 >= waitSeconds) {
          if (!clear()) return fail('The complete attachment-to-landing sweep remains blocked.')
          actor.stage = 'dismount'
          actor.waypoints = [overLanding, feetOnLanding]
        } else if (timedOut && waited + 1e-7 >= timeout) {
          if (clear()) return fail('The timeout branch must still have a blocked exit.')
          actor.stage = 'retreat'
          actor.waypoints = [ladderBottom, approach]
        }
      }
      if (actor.stage === 'dismount') cratePosition = Math.max(5.4, cratePosition - 2.2 * dt)
      const before = actor.feet
      const done = advance(actor, (actor.stage === 'climb' || actor.stage === 'retreat' ? 1.8 : 2.7) * dt)
      if ([...obstacles, block()].some((shape) => capsuleHits(before, actor.feet, shape, radius, height))) {
        return fail('Capsule hit the wall, beam or moving box.')
      }
      phase = actor.stage
      if (!done) return
      switch (actor.stage) {
        case 'approach':
          if (Math.abs(actor.heading) > 1 || !supported(actor.feet, floor)) return fail('Approach lacks contact and orientation.')
          attached = true
          actor.stage = 'climb'
          actor.waypoints = [top]
          break
        case 'climb':
          if (!attached || clear() || capsuleHits(top, top, block(), radius, height) ||
              capsuleHits(feetOnLanding, feetOnLanding, block(), radius, height)) return fail('Block must intersect the sweep only.')
          if (beamCase && !capsuleHits(top, [top[0], top[1] + 0.2, top[2]], beam, radius, height)) {
            return fail('Beam does not block the straight ascent control.')
          }
          actor.stage = 'wait'
          break
        case 'retreat':
        case 'dismount': {
          const retreated = actor.stage === 'retreat'
          const target = retreated ? floor : landing
          const supportPoint = retreated ? approach : feetOnLanding
          if (!attached || detached || retreated !== timedOut || !supported(actor.feet, target) ||
              distance(actor.feet, supportPoint) > 1e-6 || Math.abs(waited - (timedOut ? timeout : waitSeconds)) > dt / 2) {
            return fail('Resource release did not follow its timed support contact.')
          }
          detached = true
          attached = false
          phase = 'Released'
          verdict = 'pass'
          detail = 'Held rung for ' + waited.toFixed(2) + ' s, then ' + (retreated ? 'retreated safely to floor.' : 'detached and grounded on the lower side landing.')
          break
        }
      }
    },
    frame() {
      return { shapes: [floor, landing, ...obstacles, ...ladder, block()],
        bots: [{ id: actor.id, feet: actor.feet, radius, height, headingDegrees: actor.heading }], phase, detail, verdict }
    }
  }
}

export const contestedLadder: TraversalScenario = {
  id: 'contested-ladder',
  label: 'Contested ladder',
  cases: ['GAME-T13', 'EXEC-T07', 'EXEC-T08', 'GAME-T15'],
  variants: [
    { id: 'clear', label: 'Two per end' },
    { id: 'clear-reversed', label: 'Two per end, reversed update order' },
    { id: 'solo', label: 'Single rider' },
    { id: 'cancel-reservation', label: 'Cancel queued claim' },
    ...soleExitVariants,
    { id: 'front-approach', label: 'Front approach' },
    { id: 'side-approach', label: 'Side approach' },
    { id: 'behind-approach', label: 'Round the wall from behind' }
  ],
  create(variantId, route) {
    if (!contestedLadder.variants.some(({ id }) => id === variantId)) throw new Error('Unknown ladder variant: ' + variantId)
    if (sideVariants[variantId]) return createsSideApproach(sideVariants[variantId], route)
    if (soleExitVariants.some(({ id }) => id === variantId)) return createsTimedExit(variantId, route)
    const requests = [
      rider('a', true, [8.2, floorY, 4.7]),
      rider('b', true, [8.2, floorY, 8.1]),
      rider('c', false, [5.45, landingY, 5.55]),
      rider('d', false, [5.45, landingY, 8.05])
    ]
    // Both directions request the same tick. Storage order deliberately changes in the cancellation run.
    const actors = variantId === 'solo' ? requests.slice(0, 1)
      : variantId === 'cancel-reservation' || variantId === 'clear-reversed' ? requests.slice().reverse() : requests
    const pending = actors.slice().sort((a, b) => a.id.localeCompare(b.id))
    const crossed: string[] = []
    const rejected: string[] = []
    let current: Reservation | undefined
    let cancelled: Reservation | undefined
    let routedAroundWall = false
    let staleClaimRejected = false
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
          [floor, landing, wall, ...occupied], radius, height)
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

    function release(actor: Rider) {
      const endsAbove = actor.up
      if (!supported(actor.feet, endsAbove ? landing : floor)) return fail('Released the ladder before stepping onto safe ground.')
      if (distance(actor.feet, endsAbove ? ladderTop : ladderBottom) <= radius * 2) {
        return fail('Released the ladder while its exit was occupied.')
      }
      actor.stage = 'done'
      current = undefined
      crossed.push(actor.id)
    }

    function checkMotion() {
      for (const actor of actors) {
        if (collides(actor.feet, wall)) {
          fail(actor.id + ' intersected an obstacle at ' + actor.feet.map((n) => n.toFixed(3)).join(', ') + '.')
          return
        }
        const atAnchor = Math.abs(actor.feet[0] - ladderBottom[0]) < radius &&
          Math.abs(actor.feet[2] - ladderBottom[2]) < radius
        if (atAnchor && current?.rider !== actor) {
          fail(actor.id + ' entered the ladder volume without a reservation.')
          return
        }
        if (actor.stage === 'queued') {
          const [x, y, z] = actor.feet
          const nearLowerExit = Math.abs(y - floorY) < height && Math.hypot(x - 8.2, z - Math.max(5.35, Math.min(6.5, z))) < 2 * radius
          const nearUpperExit = Math.abs(y - landingY) < height && Math.hypot(x - Math.max(7.55, Math.min(8.2, x)), z - 6.5) < 2 * radius
          if (nearLowerExit || nearUpperExit) return fail('A waiting rider occupied the exit volume.')
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
      const expectedCrossings = variantId === 'solo' ? 'a' : variantId === 'cancel-reservation' ? 'bcd' : 'abcd'
      if (crossed.join('') !== expectedCrossings || (variantId !== 'solo' && !routedAroundWall) ||
          rejected.length !== (variantId === 'cancel-reservation' ? 1 : 0) ||
          (cancelled !== undefined && !staleClaimRejected)) {
        fail('FIFO, approach side, exit wait, or release did not match the expected outcome.')
        return
      }
      phase = 'Complete'
      verdict = 'pass'
      detail = crossed.join(' → ') + ' crossed · ' + rejected.length + ' cancelled · ' + elapsed.toFixed(2) + ' s.'
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

        if (advance(actor, (actor.stage === 'climb' ? 1.8 : 2.7) * dt)) {
          switch (actor.stage) {
            case 'approach':
              if (!attach(claimed)) fail('Rider reached the ladder from the wrong pose or without a claim.')
              break
            case 'climb':
              actor.stage = 'dismount'
              if (actor.up) {
                actor.waypoints = [upperEntry, [6.85, landingY, 6.5], [6.85, landingY, actor.id === 'a' ? 5.5 : 8.1]]
              } else {
                actor.waypoints = [[8.2, floorY, 5.35], [actor.id === 'c' ? 9.55 : 6.8, floorY, 4.5]]
              }
              break
            case 'dismount':
              release(actor)
              break
          }
        }
        if (verdict === 'running') checkMotion()
      },
      frame() {
        return {
          shapes: [floor, landing, wall, ...ladder],
          bots: actors.map(({ id, feet, heading }) => ({ id, feet, radius, height, headingDegrees: heading })),
          phase,
          verdict,
          detail
        }
      }
    }
  }
}
