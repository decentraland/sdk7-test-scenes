import type { Point } from '../../arena'
import type { TraversalFrame, TraversalRouter, TraversalRun, TraversalScenario, TraversalShape } from '../types'
import { walkPoints } from '../walk'

const radius = 0.24
const standingHeight = 1.65
const crouchingHeight = 1.05
const platformY = 1
const laneX = 8
const gravity = 10
const jumpSpeed = 4
const jumpDuration = 2 * jumpSpeed / gravity
const epsilon = 1e-8

type Flight = {
  start: Point
  speed: number
  acceleration: number
  time: number
}

function makeBox(
  id: string,
  kind: TraversalShape['kind'],
  min: Point,
  max: Point
): TraversalShape {
  return {
    id,
    kind,
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  }
}

function platform(id: string, near: number, far: number) {
  return makeBox(id, 'surface', [6.35, platformY - 0.25, near], [9.65, platformY, far])
}

function lowerDeck() {
  return makeBox('lower-deck', 'surface', [6.2, 0, 2.2], [9.8, 0.2, 13.2])
}

function top(shape: TraversalShape) {
  return shape.center[1] + shape.size[1] / 2
}

function hasFootprint(shape: TraversalShape, [x, , z]: Point) {
  return Math.abs(x - shape.center[0]) + radius <= shape.size[0] / 2 + epsilon &&
    Math.abs(z - shape.center[2]) + radius <= shape.size[2] / 2 + epsilon
}

function overlapsBody(shape: TraversalShape, [x, y, z]: Point, height: number) {
  const dx = Math.max(0, Math.abs(x - shape.center[0]) - shape.size[0] / 2)
  const dz = Math.max(0, Math.abs(z - shape.center[2]) - shape.size[2] / 2)
  return dx * dx + dz * dz < radius * radius &&
    y < top(shape) && y + height > shape.center[1] - shape.size[1] / 2
}

function trajectory({ start, speed, acceleration }: Flight, t: number): Point {
  return [start[0], start[1] + jumpSpeed * t - gravity * t * t / 2, start[2] + speed * t + acceleration * t * t / 2]
}

function heightCrossing(flight: Flight, height: number) {
  const discriminant = jumpSpeed ** 2 - 2 * gravity * (height - flight.start[1])
  return discriminant < 0 ? Infinity : (jumpSpeed + Math.sqrt(discriminant)) / gravity
}

function findLanding(flight: Flight, surfaces: readonly TraversalShape[], until: number) {
  let earliest = until + epsilon
  let result: { point: Point; surface: TraversalShape } | undefined
  for (const surface of surfaces) {
    const time = heightCrossing(flight, top(surface))
    if (time <= flight.time + epsilon || time >= earliest) continue
    const point = trajectory(flight, time)
    if (hasFootprint(surface, point)) {
      earliest = time
      result = { point: [point[0], top(surface), point[2]], surface }
    }
  }
  return result
}

function frame(
  shapes: readonly TraversalShape[],
  feet: Point,
  height: number,
  headingDegrees: number,
  phase: string,
  verdict: TraversalFrame['verdict'],
  detail: string
): TraversalFrame {
  return {
    shapes: shapes.map((shape): TraversalShape => ({ ...shape, center: [...shape.center], size: [...shape.size] })),
    bots: [{ id: 'jumper', feet: [...feet], height, radius, headingDegrees }],
    phase,
    verdict,
    detail
  }
}

const runupSpeed = 3.5
const runupAcceleration = 6
const launchZ = 6.7
const approachZ = 4.72

const runupVariants = [
  { id: 'ready', label: 'Already at speed' },
  { id: 'too-slow', label: 'Too slow at the lip' },
  { id: 'build-speed', label: 'Build speed from rest' },
  { id: 'side-on', label: 'Recover the run-up' },
  { id: 'wall', label: 'Run-up obstructed' },
  { id: 'clear-beam', label: 'Stand before the lip' },
  { id: 'moving-beam', label: 'Beam blocks standing' }
] as const

function createRunup(variantId: string, route?: TraversalRouter): TraversalRun {
  const start = platform('launch-deck', 2.6, launchZ + radius + 0.06)
  const target = platform('landing-deck', launchZ + 2.65 - radius, launchZ + 2.95 + radius)
  const floor = lowerDeck()
  const surfaces = [start, target, floor]
  const ready = variantId === 'ready'
  const tooSlow = variantId === 'too-slow'
  const retreat = variantId === 'side-on' || variantId === 'wall'
  const startsCrouched = variantId === 'clear-beam' || variantId === 'moving-beam'
  const shouldLand = !tooSlow && variantId !== 'wall' && variantId !== 'moving-beam'
  const beamAt = (far: number) => makeBox('beam', 'obstacle', [6.6, 2.26, far - 1.32], [9.4, 2.57, far])
  const wall = variantId === 'wall'
    ? makeBox('runup-wall', 'obstacle', [6.6, platformY, 5.18], [9.4, 2.8, 5.52])
    : undefined
  const originalBeam = beamAt(launchZ - 0.5)
  let beam = startsCrouched ? originalBeam : undefined
  let feet: Point = ready || tooSlow
    ? [laneX, platformY, launchZ]
    : retreat ? [laneX + 0.85, platformY, 6.53] : [laneX, platformY, 4.94]
  let stance = startsCrouched ? crouchingHeight : standingHeight
  let heading = retreat ? 90 : 0
  let speed = ready ? runupSpeed : tooSlow ? 1 : 0
  let phase = retreat ? 'Find run-up' : 'Approach lip'
  let verdict: TraversalFrame['verdict'] = 'running'
  let detail = 'Check launch speed, stance clearance and actual landing support.'
  let flight: Flight | undefined
  let beamShifted = false
  let tick = 0
  let shiftedTick = 0
  let baselineStandTick = 0
  let standTick = 0
  let launchTick = 0
  let runupChecked = false
  let retreatPoints: Point[] | undefined

  function finish(passed: boolean, message: string, endPhase: string) {
    verdict = passed ? 'pass' : 'fail'
    phase = endPhase
    detail = message
  }

  function step(dt: number) {
    if (verdict !== 'running') return
    tick++

    if (flight) {
      const until = flight.time + dt
      const contact = findLanding(flight, surfaces, until)
      feet = contact?.point ?? trajectory(flight, until)
      flight.time = until
      if (contact) {
        const stoodBeforeLaunch = standTick > 0 && standTick === baselineStandTick && standTick < launchTick
        finish(shouldLand && contact.surface === target && (!startsCrouched || stoodBeforeLaunch),
          'Contact with ' + contact.surface.id, 'Touchdown')
      } else if (until > 1.4) {
        finish(false, 'No valid support found below jumper.', 'Missed landing')
      }
      return
    }

    if (phase === 'Find run-up') {
      if (!retreatPoints) {
        const planned = walkPoints(route, 'Run-up recovery', feet, [laneX, platformY, approachZ],
          [...surfaces, ...(wall ? [wall] : [])], radius, stance)
        if (!planned) {
          finish(!shouldLand && hasFootprint(start, feet), 'No available route to the run-up.', 'Stopped')
          return
        }
        retreatPoints = [...planned]
      }
      const [x, , z] = retreatPoints[0]
      const dx = x - feet[0]
      const dz = z - feet[2]
      const distance = Math.hypot(dx, dz)
      const fraction = Math.min(1, 2.8 * dt / distance)
      const next: Point = [feet[0] + dx * fraction, platformY, feet[2] + dz * fraction]
      if (wall && overlapsBody(wall, next, stance)) {
        finish(!shouldLand && hasFootprint(start, feet), 'Run-up blocked. Bot stops on the launch deck.', 'Stopped')
        return
      }
      heading = Math.atan2(dx, dz) * 180 / Math.PI
      feet = next
      if (fraction === 1) {
        retreatPoints.shift()
        if (!retreatPoints.length) phase = 'Approach lip'
      }
      return
    }

    if (route && !runupChecked) {
      runupChecked = true
      const line = walkPoints(route, 'Launch alignment', feet, [laneX, platformY, launchZ],
        [...surfaces, ...(beam ? [beam] : [])], radius, stance)
      if (!line || line.some(([x]) => Math.abs(x - laneX) > 0.12)) {
        finish(false, 'Planner did not provide a straight run-up to the launch pose.', 'Stopped')
        return
      }
    }
    const remaining = launchZ - feet[2]
    function runupDistance(entrySpeed: number) {
      const acceleratingFor = Math.min(dt, (runupSpeed - entrySpeed) / runupAcceleration)
      const stepSpeed = entrySpeed + runupAcceleration * acceleratingFor
      return (entrySpeed + stepSpeed) * acceleratingFor / 2 + stepSpeed * (dt - acceleratingFor)
    }
    const travel = Math.min(remaining, runupDistance(speed))
    speed = Math.min(runupSpeed, Math.sqrt(speed ** 2 + 2 * runupAcceleration * travel))
    heading = 0
    feet = [laneX, platformY, feet[2] + travel]

    if (startsCrouched && baselineStandTick === 0) {
      const stillBlocked = overlapsBody(originalBeam, feet, standingHeight)
      if (!stillBlocked) baselineStandTick = tick
      const nextFeet: Point = [laneX, platformY, Math.min(launchZ, feet[2] + runupDistance(speed))]
      if (variantId === 'moving-beam' && !beamShifted && stillBlocked &&
          !overlapsBody(originalBeam, nextFeet, standingHeight)) {
        beam = beamAt(launchZ + radius + 0.05)
        shiftedTick = tick
        beamShifted = true
      }
    }
    if (beam && stance === crouchingHeight && !overlapsBody(beam, feet, standingHeight)) {
      stance = standingHeight
      if (feet[2] < launchZ - epsilon) standTick = tick
    }
    if (remaining - travel > epsilon) {
      detail = (stance === standingHeight ? 'Standing' : 'Crouched') + ' · ' + speed.toFixed(2) + ' m/s'
      return
    }

    const candidate = { start: feet, speed, acceleration: 0, time: 0 }
    const predictedLanding = trajectory(candidate, jumpDuration)
    const blockedByStance = stance !== standingHeight || (beam !== undefined && overlapsBody(beam, feet, standingHeight))
    const canReachLanding = hasFootprint(target, predictedLanding)
    const displacement = predictedLanding[2] - launchZ
    const speedOracle = tooSlow ? 0.8 : 2.8
    if (Math.abs(displacement - speedOracle) > epsilon || Math.abs(feet[2] - launchZ) > epsilon ||
        launchZ + radius >= start.center[2] + start.size[2] / 2) {
      finish(false, 'Measured flight or launch pose differs from the independent 0.8 s velocity oracle.', 'Stopped')
      return
    }
    if (blockedByStance || !canReachLanding) {
      const expected = blockedByStance ? variantId === 'moving-beam' && beamShifted &&
        shiftedTick > 0 && baselineStandTick === shiftedTick + 1 && standTick === 0 : tooSlow && !canReachLanding
      finish(expected && hasFootprint(start, feet),
        blockedByStance ? 'No standing clearance at the lip. Bot stays on the launch deck.' :
          speed.toFixed(2) + ' m/s does not reach the landing window.', 'Stopped')
      return
    }
    phase = 'In flight'
    launchTick = tick
    detail = 'Takeoff at ' + speed.toFixed(2) + ' m/s'
    flight = candidate
  }

  return {
    frame: () => frame([...surfaces, ...(beam ? [beam] : []), ...(wall ? [wall] : [])],
      feet, stance, heading, phase, verdict, detail),
    step
  }
}

export const runupJump: TraversalScenario = {
  id: 'run-up-jump',
  label: 'Run-up and crouch jump',
  cases: ['GAME-T01', 'TALK-T01', 'GAME-T03'],
  variants: runupVariants,
  create: createRunup
}

const chainVariants = [
  { id: 'room-to-brake', label: 'Room to brake' },
  { id: 'short-landing', label: 'Landing too short' },
  { id: 'close-waypoints', label: 'Close waypoints at 30 Hz' },
  { id: 'close-waypoints-60hz', label: 'Close waypoints at 60 Hz' }
] as const

const brakingAcceleration = 4
const secondJumpAcceleration = 8
const intermediateZ = 7.8
const waypointTolerance = 0.35

function createChainedJumps(variantId: string, route?: TraversalRouter): TraversalRun {
  const doubleStep = variantId === 'close-waypoints-60hz'
  const closeWaypoints = variantId === 'close-waypoints' || doubleStep
  const expectedRejection = variantId === 'short-landing'
  const firstSpeed = closeWaypoints ? 1.2 : 3.5
  const launchAt = intermediateZ - firstSpeed * jumpDuration
  const usableLandingLength = expectedRejection ? 0.5 : closeWaypoints ? 0.54 : 1.7
  const start = platform('first-launch-deck', 2.65, launchAt + radius + 0.05)
  const middle = platform('intermediate-deck', 7.48, intermediateZ + usableLandingLength + radius)
  const target = platform('final-deck', 10.1, 12.6)
  const surfaces = [start, middle, target, lowerDeck()]
  const firstFlight = { start: [laneX, platformY, launchAt] as Point, speed: firstSpeed, acceleration: 0, time: 0 }
  const firstContact = findLanding(firstFlight, surfaces, 1.4)
  const firstLandingZ = firstContact?.point[2] ?? intermediateZ
  const stoppingDistance = firstSpeed ** 2 / (2 * brakingAcceleration)
  const secondLaunchZ = firstLandingZ + stoppingDistance
  const secondMarker = makeBox('second-takeoff', 'guide',
    [laneX - 0.3, platformY, secondLaunchZ - 0.06], [laneX + 0.3, platformY + 0.035, secondLaunchZ + 0.06])
  const shapes = [...surfaces, secondMarker]

  let feet: Point = firstFlight.start
  let speed = firstSpeed
  let flight = firstFlight
  let phase: 'Plan chain' | 'First jump' | 'Brake on deck' | 'Second takeoff' | 'Second jump' | 'Stopped' | 'Touchdown' = 'Plan chain'
  let verdict: TraversalFrame['verdict'] = 'running'
  let detail = 'Check intermediate landing before committing to a second jump.'
  let tick = 0
  let firstTakeoffTick = 0
  let middleContactTick = 0
  let secondTakeoffTick = 0
  let nearWaypointBeforeContact = false

  function finish(passed: boolean, message: string, endPhase: 'Stopped' | 'Touchdown') {
    verdict = passed ? 'pass' : 'fail'
    phase = endPhase
    detail = message
  }

  function startSecond(at: Point): Flight {
    return { start: at, speed: 0, acceleration: secondJumpAcceleration, time: 0 }
  }

  function step(dt: number) {
    if (verdict !== 'running') return
    tick++
    switch (phase) {
      case 'Plan chain': {
        const isolatedSecond = findLanding(startSecond([laneX, platformY, firstLandingZ]), surfaces, 1.4)
        if (firstContact?.surface !== middle || isolatedSecond?.surface !== target) {
          finish(false, 'Both jumps must work independently for this fixture.', 'Stopped')
          return
        }
        const available = middle.center[2] + middle.size[2] / 2 - radius - firstLandingZ
        if (stoppingDistance > available + epsilon) {
          finish(expectedRejection && hasFootprint(start, feet),
            'Need ' + stoppingDistance.toFixed(2) + ' m to brake. Deck gives ' + available.toFixed(2) + ' m.', 'Stopped')
          return
        }
        if (expectedRejection) {
          finish(false, 'Plan accepted a landing that should be too short.', 'Stopped')
          return
        }
        if (route) {
          const brakingLane = walkPoints(route, 'Braking lane', [laneX, platformY, firstLandingZ],
            [laneX, platformY, secondLaunchZ], surfaces, radius, standingHeight)
          if (!brakingLane || brakingLane.some(([x]) => Math.abs(x - laneX) > 0.12)) {
            finish(false, 'Planner could not keep braking on the intermediate deck.', 'Stopped')
            return
          }
        }
        phase = 'First jump'
        firstTakeoffTick = tick
        detail = 'First takeoff. Second jump requires confirmed contact and zero speed.'
        return
      }
      case 'First jump':
      case 'Second jump': {
        const until = flight.time + dt
        const contact = findLanding(flight, surfaces, until)
        feet = contact?.point ?? trajectory(flight, until)
        flight.time = until
        if (!contact) {
          if (phase === 'First jump' && Math.hypot(feet[1] - platformY, feet[2] - secondLaunchZ) <= waypointTolerance) {
            nearWaypointBeforeContact = true
          }
          if (until > 1.4) finish(false, 'No support below jumper.', 'Stopped')
          return
        }
        if (phase === 'First jump') {
          if (contact.surface !== middle) {
            finish(false, 'First jump contacted ' + contact.surface.id + '.', 'Stopped')
            return
          }
          middleContactTick = tick
          phase = 'Brake on deck'
          detail = 'Intermediate contact confirmed. Braking from ' + speed.toFixed(2) + ' m/s.'
          return
        }
        const inOrder = firstTakeoffTick > 0 && firstTakeoffTick < middleContactTick &&
          middleContactTick < secondTakeoffTick && secondTakeoffTick < tick
        const checkedCloseWaypoint = !closeWaypoints || nearWaypointBeforeContact
        finish(contact.surface === target && inOrder && checkedCloseWaypoint,
          'Contact with ' + contact.surface.id + ' · ' + (doubleStep ? 60 : 30) + ' Hz · action ticks ' +
          [firstTakeoffTick, middleContactTick, secondTakeoffTick, tick].join('/') +
            (nearWaypointBeforeContact ? ' · waypoint was in range before intermediate contact.' : ''),
          'Touchdown')
        return
      }
      case 'Brake on deck': {
        const elapsed = Math.min(dt, speed / brakingAcceleration)
        const distance = speed * elapsed - brakingAcceleration * elapsed ** 2 / 2
        const next: Point = [feet[0], platformY, feet[2] + distance]
        if (!hasFootprint(middle, next)) {
          finish(false, 'Braking left the intermediate support.', 'Stopped')
          return
        }
        feet = next
        speed = Math.max(0, speed - brakingAcceleration * elapsed)
        if (speed <= epsilon) phase = 'Second takeoff'
        return
      }
      case 'Second takeoff': {
        if (middleContactTick === 0 || !hasFootprint(middle, feet) || speed > epsilon) {
          finish(false, 'Second jump attempted without confirmed support at rest.', 'Stopped')
          return
        }
        secondTakeoffTick = tick
        flight = startSecond(feet)
        phase = 'Second jump'
        detail = 'Second takeoff, after a real landing and full stop.'
        return
      }
    }
  }

  return {
    frame: () => frame(shapes, feet, standingHeight, 0, phase, verdict, detail),
    step(dt) {
      if (doubleStep) {
        step(dt / 2)
        step(dt / 2)
      } else step(dt)
    }
  }
}

export const chainedJumps: TraversalScenario = {
  id: 'chained-jumps',
  label: 'Chained jumps',
  cases: ['TALK-T04', 'EXEC-T16'],
  variants: chainVariants,
  create: createChainedJumps
}
