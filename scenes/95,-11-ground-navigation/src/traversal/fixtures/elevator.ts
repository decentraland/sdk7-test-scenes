import type { Point } from '../../arena'
import type { TraversalRouter, TraversalScenario, TraversalShape } from '../types'
import { walkPoints } from '../walk'
import { advance } from './mantles-support'

const LOW = 0.2
const HIGH = 3.2
const RADIUS = 0.22
const HEIGHT = 1.6
const SPEED = 2.8
const CYCLE = 16
const OPEN_UNTIL = 1.4
const ARRIVE_UPSTAIRS = 3
const DEPART_UPSTAIRS = 14.4
const RISE = 0.2
const TOLERANCE = 1e-5
const SHAFT_X = 5
const SHAFT_Z: readonly [number, number] = [1.3, 3.7]
const start: Point = [4.2, LOW, 2.5]
const cabinCenter: Point = [6.1, LOW, 2.5]
const goal: Point = [4.2, HIGH, 2.5]
const stairBase: Point = [2.15, LOW, 5.45]
const stairTop: Point = [2.15, HIGH, 11.6]
const returnTurn: Point = [4.2, HIGH, 11.6]

function slab(id: string, x0: number, x1: number, z0: number, z1: number, top: number): TraversalShape {
  return { id, kind: 'surface', center: [(x0 + x1) / 2, top - 0.1, (z0 + z1) / 2], size: [x1 - x0, 0.2, z1 - z0] }
}

const lower = slab('lower lobby', 1, SHAFT_X, 0.9, 5.8, LOW)
const upper = slab('upper lobby', 1, SHAFT_X, 0.9, 5.8, HIGH)
const topLanding = slab('top of stairs', 1, SHAFT_X, 11.05, 12.25, HIGH)
const gallery = slab('upper gallery', 3.45, SHAFT_X, 5.8, 11.05, HIGH)
const treads = Array.from({ length: 15 }, (_, i) =>
  slab('tread ' + (i + 1), 1.1, 3.2, 5.8 + 0.35 * i, 5.8 + 0.35 * (i + 1), LOW + RISE * (i + 1)))
const fixedSurfaces = [lower, upper, topLanding, gallery, ...treads]
const stairPoints: Point[] = treads.map(({ center: [, y, z] }) => [2.15, y + 0.1, z])

function cabinHeight(clock: number) {
  const phase = clock % CYCLE
  if (phase <= OPEN_UNTIL) return LOW
  if (phase < ARRIVE_UPSTAIRS) return LOW + (HIGH - LOW) * (phase - OPEN_UNTIL) / (ARRIVE_UPSTAIRS - OPEN_UNTIL)
  if (phase <= DEPART_UPSTAIRS) return HIGH
  return HIGH - (HIGH - LOW) * (phase - DEPART_UPSTAIRS) / (CYCLE - DEPART_UPSTAIRS)
}

function phaseAt(clock: number) {
  const phase = clock % CYCLE
  return phase >= CYCLE - TOLERANCE ? 0 : phase
}

function shaftSupport(feet: Point, deckHeight: number) {
  return feet[0] + RADIUS <= SHAFT_X + TOLERANCE || (
    feet[0] + RADIUS <= 7.4 + TOLERANCE && feet[2] - RADIUS >= SHAFT_Z[0] &&
    feet[2] + RADIUS <= SHAFT_Z[1] && Math.abs(feet[1] - deckHeight) <= TOLERANCE
  )
}

function stairSupport(feet: Point) {
  return fixedSurfaces.some(({ center: [x, y, z], size: [w, h, d] }) =>
    Math.abs(feet[0] - x) <= w / 2 + TOLERANCE && Math.abs(feet[2] - z) <= d / 2 + TOLERANCE &&
    Math.abs(feet[1] - (y + h / 2)) <= RISE + TOLERANCE)
}

const stairDistance = [stairBase, ...stairPoints, stairTop, returnTurn, goal].reduce((distance, point, i, path) => {
  const previous = i === 0 ? start : path[i - 1]
  return distance + Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2])
}, 0)
const stairSeconds = stairDistance / SPEED
const boardSeconds = (cabinCenter[0] - start[0]) / SPEED
const variants = [
  { id: 'ready', label: 'Cabin is docked now', clock: 0, expected: 'board,ride,exit' },
  { id: 'missed', label: 'Cabin has just left', clock: 1.45, expected: 'stairs' },
  { id: 'disabled', label: 'Service stops during the wait', clock: 14.3, disabledAt: 14.8, expected: 'wait,stairs' },
  { id: 'wait', label: 'Wait for the arriving cabin', clock: 14.3, expected: 'wait,board,ride,exit' }
] as const

export const elevator: TraversalScenario = {
  id: 'elevator-boarding',
  label: 'Elevator and empty shaft',
  cases: ['GAME-17'],
  variants,
  create(variantId: string, route?: TraversalRouter) {
    const selected = variants.find(({ id }) => variantId === id)
    if (!selected) throw new Error('Unknown lift test variant ' + variantId)
    const variant = selected
    let clock: number = variant.clock
    let deckHeight = cabinHeight(clock)
    let feet = start
    let phase: 'choose' | 'waiting' | 'boarding' | 'boarded' | 'riding' | 'exiting' | 'stairs' = 'choose'
    let verdict: 'running' | 'pass' | 'fail' = 'running'
    let detail = 'Choose lift versus the measured travel time by stairs.'
    let points: Point[] = []
    const events: string[] = []

    function follow(dt: number) {
      let budget = SPEED * dt
      while (points.length && budget > TOLERANCE) {
        const next = advance(feet, points[0], budget)
        if (!shaftSupport(feet, deckHeight) || !shaftSupport(next, deckHeight) ||
            (phase === 'stairs' && !stairSupport(next))) {
          verdict = 'fail'
          detail = 'Foot sweep left a stair or entered the shaft without a docked cabin.'
          return false
        }
        budget -= Math.hypot(next[0] - feet[0], next[1] - feet[1], next[2] - feet[2])
        feet = next
        if (next === points[0]) points.shift()
      }
      return points.length === 0
    }

    function useStairs() {
      const approach = walkPoints(route, 'Stair approach', feet, stairBase, fixedSurfaces, RADIUS, HEIGHT)
      const upstairs = walkPoints(route, 'Upper gallery', stairTop, goal, fixedSurfaces, RADIUS, HEIGHT)
      if (!approach || !upstairs) {
        verdict = 'fail'
        detail = 'The stair alternative lost its floor approach or upper exit.'
        return
      }
      events.push('stairs')
      points = [...approach, ...stairPoints, stairTop, ...(route ? upstairs : [returnTurn, goal])]
      phase = 'stairs'
    }

    function finish() {
      const elapsed = clock - variant.clock
      const choseStairs = events.includes('stairs')
      const reference = stairSeconds + (variant.id === 'disabled' ? variant.disabledAt - variant.clock : 0)
      const validTime = choseStairs ? Math.abs(elapsed - reference) < 0.45 : elapsed < stairSeconds
      const rejectsEmptyShaft = !shaftSupport([6, LOW, 2.5], HIGH) &&
        !shaftSupport([SHAFT_X - RADIUS / 2, LOW, 2.5], HIGH)
      verdict = feet === goal && events.join() === variant.expected && validTime && rejectsEmptyShaft ? 'pass' : 'fail'
      detail = events.join(' → ') + ' in ' + elapsed.toFixed(2) + ' s; stairs baseline ' + stairSeconds.toFixed(2) + ' s.'
    }

    return {
      frame: () => ({
        shapes: [...fixedSurfaces, slab('cabin deck', SHAFT_X, 7.4, ...SHAFT_Z, deckHeight)],
        bots: [{ id: 'elevator-bot', feet, radius: RADIUS, height: HEIGHT }],
        phase,
        verdict,
        detail
      }),
      step(dt: number) {
        if (verdict !== 'running') return
        if (phase === 'choose') {
          const now = phaseAt(clock)
          const canBoard = now + boardSeconds < OPEN_UNTIL
          const liftSeconds = (canBoard ? ARRIVE_UPSTAIRS - now : CYCLE - now + ARRIVE_UPSTAIRS) + boardSeconds
          if (liftSeconds >= stairSeconds) useStairs()
          else {
            if (!canBoard) events.push('wait')
            phase = 'waiting'
          }
        }
        clock += dt
        deckHeight = cabinHeight(clock)
        if (phase === 'waiting') {
          if ('disabledAt' in variant && clock >= variant.disabledAt) {
            useStairs()
            return
          }
          if (phaseAt(clock) + boardSeconds < OPEN_UNTIL && shaftSupport(cabinCenter, deckHeight)) {
            events.push('board')
            points = [cabinCenter]
            phase = 'boarding'
          }
        }
        if (phase === 'boarding' && follow(dt)) {
          phase = 'boarded'
        } else if (phase === 'boarded' || phase === 'riding') {
          if (phase === 'boarded' && deckHeight > LOW + TOLERANCE) {
            events.push('ride')
            phase = 'riding'
          }
          feet = [cabinCenter[0], deckHeight, cabinCenter[2]]
          if (Math.abs(deckHeight - HIGH) <= TOLERANCE) {
            events.push('exit')
            points = [goal]
            phase = 'exiting'
          }
        } else if ((phase === 'exiting' || phase === 'stairs') && follow(dt)) finish()
      }
    }
  }
}
