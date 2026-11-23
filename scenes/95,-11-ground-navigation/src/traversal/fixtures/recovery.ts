import type { Point } from '../../arena'
import type { TraversalScenario, TraversalShape } from '../types'
import { walkPoints } from '../walk'

type Probe = { id: number; revision: number; due: number; supported: boolean }
type Landing = { surface: TraversalShape; feet: Point; time: number }
type Phase = 'approach' | 'airborne' | 'replan' | 'settled'
const radius = 0.24
const height = 0.8
const takeoff: Point = [5, 2, 6.25]
const start: Point = [3.45, takeoff[1], takeoff[2]]
const safeBeforeJump: Point = [3.6, takeoff[1], 5.35]
const followupX = 10.85
const speed = 5
const lift = 4.6
const gravity = 10
const lowerFloor: TraversalShape = { id: 'lower-floor', kind: 'surface', center: [8, 0.075, 6.75], size: [12, 0.15, 5.5] }
const startDeck: TraversalShape = { id: 'start-deck', kind: 'surface', center: [3.75, 1.9, 6.25], size: [3.2, 0.2, 2.7] }
const originalLanding: TraversalShape = { id: 'landing', kind: 'surface', center: [10.25, 1.9, 6.25], size: [3.1, 0.2, 2.7] }
const shiftedLanding: TraversalShape = { ...originalLanding, center: [10.62, 1.9, 6.25] }
const loweredLanding: TraversalShape = { ...originalLanding, center: [10.25, 0.85, 6.25] }

function surfaceY(surface: TraversalShape) {
  return surface.center[1] + surface.size[1] / 2
}

function hasFootprint(feet: Point, surface: TraversalShape) {
  return Math.abs(feet[0] - surface.center[0]) + radius <= surface.size[0] / 2 &&
    Math.abs(feet[2] - surface.center[2]) + radius <= surface.size[2] / 2
}

function flightAt(time: number): Point {
  return [takeoff[0] + speed * time, takeoff[1] + lift * time - gravity * time * time / 2, takeoff[2]]
}

function findLanding(previousTime: number, nextTime: number, surfaces: readonly TraversalShape[]): Landing | undefined {
  let earliest: Landing | undefined
  for (const surface of surfaces) {
    const discriminant = lift * lift + 2 * gravity * (takeoff[1] - surfaceY(surface))
    if (discriminant < 0) continue
    // Only the descending root can be a support contact.
    const time = (lift + Math.sqrt(discriminant)) / gravity
    if (time <= previousTime || time > nextTime || (earliest && time >= earliest.time)) continue
    const [x, , z] = flightAt(time)
    const feet: Point = [x, surfaceY(surface), z]
    if (hasFootprint(feet, surface)) earliest = { surface, feet, time }
  }
  return earliest
}

function moveToward(from: Point, to: Point, maxStep: number): Point {
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
  if (distance <= maxStep) return to
  const ratio = maxStep / distance
  return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio, from[2] + (to[2] - from[2]) * ratio]
}

export const interruptedJump: TraversalScenario = {
  id: 'interrupted-jump',
  label: 'Interrupted jump',
  cases: ['EXEC-T01', 'EXEC-T14', 'SDK-T01'],
  variants: [
    { id: 'clear', label: 'Clean landing' },
    { id: 'cancel-before', label: 'Cancel before takeoff' },
    { id: 'cancel-airborne', label: 'Cancel in the air' },
    { id: 'remove-landing', label: 'Landing disappears' },
    { id: 'stale-probe', label: 'Delayed landing probe' }
  ],
  create(variantId, route) {
    if (!interruptedJump.variants.some(({ id }) => id === variantId)) throw new Error('Unknown jump variant: ' + variantId)
    let landing: TraversalShape | undefined = originalLanding
    let feet = start
    let target: Point = [9.6, 2, 6.25]
    let heading = 90
    let phase: Phase = 'approach'
    let detail = 'Approaching the takeoff marker.'
    let verdict: 'running' | 'pass' | 'fail' = 'running'
    let flightTime = 0
    let elapsed = 0
    let revision = 0
    let latestProbe = 0
    let ignoredRevisionHints = 0
    let ignoredSupersededHints = 0
    let acceptedHints = 0
    let cancelRequested = false
    let tookOff = false
    let contact: Landing | undefined
    let replanSurface: TraversalShape | undefined
    let replans = 0
    let previousPlanCompleted = false
    const pending: Probe[] = []
    let stepsToTakeoff: Point[] | undefined
    let recoveryPoints: Point[] = []

    function fail(reason: string) {
      detail = reason
      verdict = 'fail'
    }

    function surfaces() {
      return [lowerFloor, startDeck, ...(landing ? [landing] : [])]
    }

    function setLanding(next: TraversalShape | undefined) {
      landing = next
      revision++
    }

    function requestProbe(sample: Point, now: number, latency: number) {
      latestProbe++
      pending.push({
        id: latestProbe,
        revision,
        due: now + latency,
        supported: landing !== undefined && surfaceY(landing) === sample[1] && hasFootprint(sample, landing)
      })
    }

    function resolveProbes(now: number) {
      while (pending.length > 0 && pending[0].due <= now) {
        const result = pending.shift()!
        if (!result.supported) continue
        if (result.revision !== revision) {
          ignoredRevisionHints++
          detail = 'Ignored a successful reply from an earlier landing revision.'
        } else if (result.id !== latestProbe) {
          ignoredSupersededHints++
          detail = 'Ignored a successful reply for a superseded landing point.'
        } else if (phase === 'airborne') {
          acceptedHints++
          // A current probe confirms the candidate. Only a descending contact can settle the bot.
          detail = 'New probe confirms the updated deck. Still waiting for contact.'
        }
      }
    }

    function startReplan(support: TraversalShape, nextGoal: Point) {
      if (Math.abs(feet[1] - surfaceY(support)) > 1e-6 || !hasFootprint(feet, support) || !hasFootprint(nextGoal, support)) {
        return fail('Replan did not start and end on the measured support.')
      }
      const points = walkPoints(route, 'Recovery from ' + support.id, feet, nextGoal, surfaces(), radius, height)
      if (!points) return fail('Planner did not route from the measured support.')
      recoveryPoints = [...points]
      replanSurface = support
      replans++
      phase = 'replan'
      target = nextGoal
      detail = 'Replanning from ' + support.id + ' after checking actual support.'
    }

    function onContact(hit: Landing) {
      contact = hit
      feet = hit.feet
      previousPlanCompleted = !cancelRequested && hit.surface.id === 'landing'
      if (previousPlanCompleted) {
        phase = 'settled'
        return
      }
      startReplan(hit.surface, [followupX, surfaceY(hit.surface), 7.15])
    }

    function finish() {
      const landedOn = contact?.surface.id
      const expected = {
        clear: tookOff && landedOn === 'landing' && previousPlanCompleted && replans === 0,
        'cancel-before': cancelRequested && !tookOff && !contact && !previousPlanCompleted && replanSurface === startDeck && replans === 1,
        'cancel-airborne': cancelRequested && tookOff && landedOn === 'landing' && !previousPlanCompleted && replanSurface?.id === 'landing' && replans === 1,
        'remove-landing': tookOff && landedOn === 'lower-floor' && !previousPlanCompleted && replanSurface === lowerFloor && replans === 1,
        'stale-probe': tookOff && landedOn === 'landing' && previousPlanCompleted &&
          ignoredRevisionHints === 1 && ignoredSupersededHints === 1 && acceptedHints === 1 && replans === 0
      }
      if (!expected[variantId as keyof typeof expected]) {
        return fail('Contact, stale results or recovery did not match the expected outcome.')
      }
      verdict = 'pass'
      detail = (landedOn ? 'Contact: ' + landedOn : 'Takeoff suppressed') +
        ' · ' + replans + ' replans · ' + (ignoredRevisionHints + ignoredSupersededHints) + ' stale replies ignored.'
    }

    function advanceFlight(dt: number) {
      const next = flightTime + dt
      const reached = (time: number) => flightTime < time && next >= time
      if (variantId === 'cancel-airborne' && reached(lift / gravity)) {
        cancelRequested = true
        detail = 'Goal changed at the apex. Finishing the airborne motion before replanning.'
      }
      if (variantId === 'remove-landing' && reached(0.36)) {
        setLanding(undefined)
        detail = 'The upper landing disappeared after takeoff.'
      }
      if (variantId === 'stale-probe') {
        if (reached(0.25)) requestProbe(target, 0.25, 0.12)
        if (reached(0.32)) setLanding(loweredLanding)
        if (reached(0.42)) {
          setLanding(shiftedLanding)
          target = [9.65, 2, 6.25]
          requestProbe(target, 0.42, 0.16)
        }
        if (reached(0.5)) {
          target = [9.75, 2, 6.25]
          requestProbe(target, 0.5, 0.12)
        }
        resolveProbes(next)
      }
      const hit = findLanding(flightTime, next, surfaces())
      if (hit) onContact(hit)
      else {
        flightTime = next
        feet = flightAt(next)
        if (feet[1] < surfaceY(lowerFloor)) fail('The capsule passed below the lowest floor without valid support.')
      }
    }

    return {
      step(dt) {
        if (verdict !== 'running') return
        elapsed += dt
        if (elapsed > 6) return fail('No landing or recovery within six simulated seconds.')
        switch (phase) {
          case 'approach': {
            if (!stepsToTakeoff) {
              const points = walkPoints(route, 'Jump approach', feet, takeoff, surfaces(), radius, height)
              if (!points) return fail('Planner did not find the initial route to takeoff.')
              stepsToTakeoff = [...points]
            }
            const waypoint = stepsToTakeoff[0]
            const next = moveToward(feet, waypoint, 2.8 * dt)
            if (variantId === 'cancel-before' && stepsToTakeoff.length === 1 && next === takeoff) {
              cancelRequested = true
              startReplan(startDeck, safeBeforeJump)
            } else {
              feet = next
              if (next === waypoint) stepsToTakeoff.shift()
              if (stepsToTakeoff.length === 0) {
                if (!hasFootprint(feet, startDeck)) return fail('The bot cannot take off without support.')
                tookOff = true
                phase = 'airborne'
                detail = 'Jump committed. Landing requires actual contact.'
              }
            }
            break
          }
          case 'airborne':
            advanceFlight(dt)
            break
          case 'replan': {
            const waypoint = recoveryPoints[0]
            const next = moveToward(feet, waypoint, 2.1 * dt)
            if (!replanSurface || !hasFootprint(next, replanSurface)) return fail('Recovery left the measured support.')
            heading = Math.atan2(next[0] - feet[0], next[2] - feet[2]) * 180 / Math.PI
            feet = next
            if (next === waypoint) recoveryPoints.shift()
            if (recoveryPoints.length === 0) phase = 'settled'
            break
          }
          case 'settled':
            finish()
            break
        }
      },
      frame() {
        return {
          shapes: [
            ...surfaces(),
            { id: 'takeoff-marker', center: [takeoff[0], takeoff[1] + 0.025, takeoff[2]], size: [0.38, 0.045, 0.5], kind: 'guide' },
            { id: 'goal', center: [target[0], target[1] + 0.025, target[2]], size: [0.53, 0.045, 0.53], kind: 'target' }
          ],
          bots: [{ id: 'jumper', feet, height, radius, headingDegrees: heading }],
          phase,
          verdict,
          detail
        }
      }
    }
  }
}
