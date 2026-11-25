import type { Point, Surface } from '../arena'
import type { TraversalScenario, TraversalShape } from '../traversal/types'
import {
  FLOOR, RADIUS, STANDING, distance, makeNavcatRecipeNavigator, marker, pathLength, playback, slab,
  type RecipeNavigatorFactory, type RecipeRun
} from './recipe-runtime-support'

const RAY_START: Point = [1.8, FLOOR, 2.2]
const LOWER_TARGET: Point = [4.9, FLOOR, 2.2]
const UPPER_TARGET: Point = [4.9, 3.2, 2.2]
const RAMP: Surface = {
  vertices: [[7, FLOOR, 1], [7, FLOOR, 3.4], [13, UPPER_TARGET[1], 3.4], [13, UPPER_TARGET[1], 1]],
  triangles: [0, 1, 2, 0, 2, 3]
}
const levels = [
  slab('far landing', 13, 14.8, 1, 5.5, 3.2), slab('upper return', 2.1, 13, 3.7, 5.5, 3.2),
  slab('balcony', 2.1, 6, 1, 3.7, 3.2)
]
const rampDisplay = Array.from({ length: 12 }, (_, i) => ({
  id: 'ramp slice ' + i, kind: 'guide' as const,
  center: [7.25 + i / 2, FLOOR + (i + 0.5) / 4 - 0.06, 2.2] as const, size: [0.5, 0.12, 2.4] as const
}))

function raycastRun(variant: string, makeNavigator: RecipeNavigatorFactory): RecipeRun {
  const blocked = variant === 'wall'
  const lower = blocked
    ? [slab('before wall', 1.1, 3.3, 1, 3.4), slab('after wall', 3.8, 7, 1, 3.4)]
    : [slab('lower floor', 1.1, 7, 1, 3.4)]
  const scene = [...lower, ...levels]
  const geometry = [...scene.map(({ surface }) => surface), RAMP]
  const navigator = makeNavigator(geometry)
  try {
    const toLower = navigator.shortcut(RAY_START, LOWER_TARGET)
    const toUpper = navigator.shortcut(RAY_START, UPPER_TARGET)
    const lowerClear = toLower.horizontalClear && toLower.reachedPolygon
    const upperClear = toUpper.horizontalClear && toUpper.reachedPolygon
    const upstairs = navigator.route(RAY_START, UPPER_TARGET)
    const climbReached = upstairs.status === 'complete' && upstairs.points.some(([x, y]) => x > 12.5 && y > 2.8) &&
      Math.abs((upstairs.points[upstairs.points.length - 1]?.[1] ?? 0) - UPPER_TARGET[1]) < 0.25
    const showUpper = variant === 'upper'
    const wall: TraversalShape = { id: 'wall', kind: 'obstacle', center: [3.55, 1.2, 2.2], size: [0.5, 2, 2.4] }
    const shapes = [...scene.map(({ shape }) => shape), ...rampDisplay, ...(blocked ? [wall] : []),
      marker('lower target', LOWER_TARGET, showUpper ? 'guide' : 'target'),
      marker('balcony target', UPPER_TARGET, showUpper ? 'target' : 'guide')]
    return playback([{
      phase: blocked ? 'wall rejects shortcut' : showUpper ? 'reject shortcut, route via ramp' : 'same-floor shortcut',
      height: STANDING, points: blocked ? [RAY_START] : showUpper
        ? (climbReached ? upstairs.points : [RAY_START])
        : [RAY_START, LOWER_TARGET], ...(blocked && { holdSeconds: 0.9 })
    }], () => shapes,
    blocked ? toLower.visited > 0 && !toLower.horizontalClear && !lowerClear && !upperClear && upstairs.status === 'unreachable'
      : lowerClear && toUpper.horizontalClear && !upperClear && climbReached,
    blocked ? 'Lower wall stops the navmesh ray. This layout has no alternative route.'
      : 'The horizontal ray reaches both XZ targets. The polygon check accepts only the same-floor shortcut.',
    { bakes: 1, shortcutQueries: 2, routeQueries: 1, lowerRayPolygons: toLower.visited, upperRayPolygons: toUpper.visited })
  } finally {
    navigator.dispose?.()
  }
}

const HINGE: Point = [4, FLOOR, 2]
const UNSAFE_WAIT: Point = [3.44, FLOOR, 2.56]
const WAIT_POCKET: Point = [3.28, FLOOR, 3.43]
const DOOR_START: Point = [2.1, FLOOR, 2.75]
const DOOR_GOAL: Point = [7.05, FLOOR, 2.75]
const LEAF_LENGTH = 1.1
const LEAF_HALF_WIDTH = 0.05
const SWING_SECONDS = 0.6
const doorRooms = [
  slab('left hall', 1, 2.6, 1.5, 7.3), slab('left entry', 2.6, 4, 1.5, 2.9),
  slab('left bypass approach', 2.6, 4, 4.2, 7.3), slab('right room', 4.45, 8, 1.5, 7.3),
  slab('long bypass', 4, 4.45, 5.6, 7.3)
]
const doorPocket = slab('safe waiting floor', 2.6, 4, 2.9, 4.2)
const doorThreshold = slab('door threshold', 4, 4.45, 2, 3.3)

function distanceToLeaf(point: Point, angle: number) {
  const x = point[0] - HINGE[0]
  const z = point[2] - HINGE[2]
  const vx = -Math.sin(angle)
  const vz = Math.cos(angle)
  const t = Math.max(0, Math.min(LEAF_LENGTH, x * vx + z * vz))
  return Math.hypot(x - t * vx, z - t * vz)
}

// Exact minimum for a stationary footprint over a quarter-turn. Inside the swept
// sector the nearest point is on the leaf at the footprint's bearing, or on its tip.
function swingClearance(point: Point) {
  const x = point[0] - HINGE[0]
  const z = point[2] - HINGE[2]
  const leafDistance = x <= 0 && z >= 0 ? Math.max(0, Math.hypot(x, z) - LEAF_LENGTH)
    : Math.min(distanceToLeaf(point, 0), distanceToLeaf(point, Math.PI / 2))
  return leafDistance - LEAF_HALF_WIDTH - RADIUS
}

function arrivesAt(points: readonly Point[], goal: Point, tolerance = 0.12) {
  const end = points[points.length - 1]
  return end !== undefined && distance(end, goal) <= tolerance
}

function crossingZ(points: readonly Point[], x: number) {
  for (let i = 1; i < points.length; i++) {
    const [ax, , az] = points[i - 1]
    const [bx, , bz] = points[i]
    if (ax < x && bx >= x) return az + (bz - az) * (x - ax) / (bx - ax)
  }
  return undefined
}

function doorRun(variant: string, makeNavigator: RecipeNavigatorFactory): RecipeRun {
  const withoutPocket = variant === 'bypass'
  const collisionControl = variant === 'endpoints'
  const rooms = withoutPocket ? doorRooms : [...doorRooms, doorPocket]
  const floor = rooms.map(({ surface }) => surface)
  const closed = makeNavigator(floor)
  try {
    const open = makeNavigator([...floor, doorThreshold.surface])
    try {
      const toPocket = closed.route(DOOR_START, WAIT_POCKET)
      const direct = open.route(WAIT_POCKET, DOOR_GOAL)
      const bypass = closed.route(DOOR_START, DOOR_GOAL)
      const rejectApproach = closed.route(DOOR_START, UNSAFE_WAIT)
      const bypassZ = crossingZ(bypass.points, 4.2)
      const directZ = crossingZ(direct.points, 4.2)
      const safeMinimum = swingClearance(WAIT_POCKET)
      const unsafeMinimum = swingClearance(UNSAFE_WAIT)
      const endpointsClear = [0, Math.PI / 2].every((angle) =>
        distanceToLeaf(UNSAFE_WAIT, angle) > RADIUS + LEAF_HALF_WIDTH)
      const approachClear = toPocket.points.every(([x]) => x < HINGE[0] - RADIUS - LEAF_HALF_WIDTH)
      const openPathClear = direct.points.every(([, , z]) => z > HINGE[2] + RADIUS + LEAF_HALF_WIDTH)
      const alternate = bypass.status === 'complete' && bypassZ !== undefined && bypassZ > 5.6
      const pocketReachable = toPocket.status === 'complete' && arrivesAt(toPocket.points, WAIT_POCKET)
      const canUsePocket = pocketReachable && safeMinimum > 0 && approachClear &&
        direct.status === 'complete' && arrivesAt(direct.points, DOOR_GOAL) && openPathClear &&
        directZ !== undefined && directZ > 2.3 && directZ < 3.3
      const usesPocket = canUsePocket && (!alternate || pathLength(toPocket.points) + pathLength(direct.points) < pathLength(bypass.points))
      const wouldCollide = endpointsClear && unsafeMinimum < 0 && rejectApproach.status === 'complete' &&
        arrivesAt(rejectApproach.points, UNSAFE_WAIT)
      const expected = alternate && (withoutPocket ? !pocketReachable && !usesPocket : usesPocket && wouldCollide)
      const shapes = rooms.map(({ shape }) => shape)
      const wait = collisionControl ? UNSAFE_WAIT : WAIT_POCKET
      const swingPhase = collisionControl ? 'endpoint-only control collides' : 'hold outside swept leaf'
      const crossPhase = 'cross confirmed open door'
      const bypassPhase = 'no safe wait, take bypass'
      let collisionObserved = false
      let crossingObserved = false
      const planned = collisionControl ? [
        { phase: 'approach unsafe marker', height: STANDING, points: rejectApproach.points },
        { phase: swingPhase, height: STANDING, points: [wait], holdSeconds: SWING_SECONDS / 2 }
      ] : usesPocket ? [
        { phase: 'move into safe wait pocket', height: STANDING, points: toPocket.points },
        { phase: swingPhase, height: STANDING, points: [wait], holdSeconds: SWING_SECONDS },
        { phase: crossPhase, height: STANDING, points: direct.points }
      ] : [
        { phase: bypassPhase, height: STANDING, points: bypass.points }
      ]
      const stages = planned.some(({ points }) => points.length === 0)
        ? [{ phase: 'no route', height: STANDING, points: [DOOR_START], holdSeconds: 0.5 }]
        : planned
      const startsAtDoorStart = distance(stages[0].points[0], DOOR_START) <= 0.12
      const run = playback(stages, (phase, fraction) => {
        const angle = phase === swingPhase ? fraction * Math.PI / (collisionControl ? 4 : 2)
          : phase === crossPhase ? Math.PI / 2 : 0
        const segments = Array.from({ length: 11 }, (_, i): TraversalShape => {
          const along = ((i + 0.5) / 11) * LEAF_LENGTH
          return { id: 'door leaf ' + i, kind: 'guide',
            center: [HINGE[0] - along * Math.sin(angle), 1.15, HINGE[2] + along * Math.cos(angle)], size: [0.13, 1.9, 0.13] }
        })
        return [...shapes, doorThreshold.shape, ...segments, marker('wait marker', wait, 'guide'), marker('goal', DOOR_GOAL)]
      }, expected && startsAtDoorStart, expected ?
        collisionControl ? 'The endpoint-only control collides at mid-swing.' :
          usesPocket ? 'The pocket stays clear for the entire swing, then the short route opens.'
            : 'The waiting point has no usable support. The closed mesh selects the verified bypass.'
        : 'Unexpected waiting-floor connectivity or door clearance. ' + JSON.stringify({ pocketReachable, usesPocket, wouldCollide, bypassZ, directZ }),
      { bakes: 2, routeQueries: 4, pocketReachable: Number(pocketReachable), chosePocket: Number(usesPocket && !collisionControl),
        pocketClearanceMetres: safeMinimum, unsafeClearanceMetres: unsafeMinimum },
      {
        move(from, to, phase, _height, fraction) {
          if (phase === swingPhase) {
            if (collisionControl && distanceToLeaf(to, fraction * Math.PI / 4) <= RADIUS + LEAF_HALF_WIDTH) collisionObserved = true
            return distance(to, wait) <= 0.12 && (collisionControl || swingClearance(to) > 0)
          }
          const crossing = crossingZ([from, to], 4.2)
          if (crossing !== undefined) {
            crossingObserved = true
            return phase === bypassPhase ? crossing > 5.6 : phase === crossPhase && crossing > 2.3 && crossing < 3.3
          }
          return true
        },
        finish(feet) { return collisionControl ? collisionObserved : crossingObserved && distance(feet, DOOR_GOAL) <= 0.12 }
      })
      return { ...run, get metrics() {
        return { ...run.metrics, crossingObserved: Number(crossingObserved), collisionObserved: Number(collisionObserved) }
      } }
    } finally {
      open.dispose?.()
    }
  } finally {
    closed.dispose?.()
  }
}

const CROUCHING = 1.05
const TUNNEL_START: Point = [2, FLOOR, 2.7]
const TUNNEL_ENTRY: Point = [3.25, FLOOR, 2.7]
const TUNNEL_EXIT: Point = [7.75, FLOOR, 2.7]
const TUNNEL_END: Point = [9, FLOOR, 2.7]
type GroundBounds = readonly [minX: number, maxX: number, minZ: number, maxZ: number]
const tunnelFootprints = [
  { name: 'entrance room', bounds: [1, 4, 1.5, 6] },
  { name: 'tunnel floor', bounds: [4, 7, 2, 3.4] },
  { name: 'exit room', bounds: [7, 10, 1.5, 6] },
  { name: 'standing bypass', bounds: [4, 7, 4.9, 6] }
] as const satisfies readonly { name: string; bounds: GroundBounds }[]
const tunnelFloors = tunnelFootprints.map(({ name, bounds: [minX, maxX, minZ, maxZ] }) =>
  slab(name, minX, maxX, minZ, maxZ))

function segmentInBounds(start: Point, end: Point, [x0, x1, z0, z1]: GroundBounds) {
  let low = 0
  let high = 1
  for (const [axis, min, max] of [[0, x0, x1], [2, z0, z1]] as const) {
    const delta = end[axis] - start[axis]
    if (Math.abs(delta) < 1e-9) {
      if (start[axis] < min || start[axis] > max) return
      continue
    }
    const t0 = (min - start[axis]) / delta
    const t1 = (max - start[axis]) / delta
    low = Math.max(low, Math.min(t0, t1))
    high = Math.min(high, Math.max(t0, t1))
  }
  return low <= high ? [low, high] as const : undefined
}

// The floor segments are tested continuously against the expanded ceiling footprint.
function crossesCeiling(points: readonly Point[]): boolean {
  const ceiling: GroundBounds = [4 - RADIUS, 7 + RADIUS, 2 - RADIUS, 3.4 + RADIUS]
  return points.slice(1).some((end, i) => segmentInBounds(points[i], end, ceiling) !== undefined)
}

function supportedTunnelPath(points: readonly Point[]) {
  return points.length > 1 && points.every(([, y]) => Math.abs(y - FLOOR) <= 0.075) &&
    points.slice(1).every((end, i) => {
      const spans = tunnelFootprints.flatMap(({ bounds }) => {
        const span = segmentInBounds(points[i], end, bounds)
        return span ? [span] : []
      }).sort(([a], [b]) => a - b)
      let supportedThrough = 0
      for (const [enter, leave] of spans) {
        if (enter > supportedThrough + 1e-9) break
        supportedThrough = Math.max(supportedThrough, leave)
      }
      return supportedThrough >= 1 - 1e-9
  })
}

function crouchRun(variant: string, makeNavigator: RecipeNavigatorFactory): RecipeRun {
  const clearance = variant === 'too-low' ? 1 : 1.25
  const roofBottom = FLOOR + clearance
  const onRoof = variant === 'wrong-floor'
  const bottom = slab('roof underside', 4, 7, 2, 3.4, roofBottom).surface
  const roof = slab('roof', 4, 7, 2, 3.4, roofBottom + 0.12)
  const geometry: Surface[] = [...tunnelFloors.map(({ surface }) => surface), roof.surface,
    { vertices: bottom.vertices, triangles: [0, 2, 1, 0, 3, 2] }]
  const standing = makeNavigator(geometry)
  try {
    const crouching = variant === 'disabled' ? undefined : makeNavigator(geometry, CROUCHING)
    try {
      const bypass = standing.route(TUNNEL_START, TUNNEL_END)
      const approach = standing.route(TUNNEL_START, TUNNEL_ENTRY)
      const crouchRoute = crouching?.route(TUNNEL_ENTRY, TUNNEL_EXIT)
      const roofPoints = [TUNNEL_ENTRY, [5.5, roofBottom + 0.12, 2.7], TUNNEL_EXIT] satisfies Point[]
      const crouch = onRoof ? { status: 'complete', points: roofPoints } as const : crouchRoute
      const finish = standing.route(TUNNEL_EXIT, TUNNEL_END)
      const throughZ = crouch && crossingZ(crouch.points, 5.5)
      const bypassZ = crossingZ(bypass.points, 5.5)
      const bypassSafe = bypass.status === 'complete' && supportedTunnelPath(bypass.points) &&
        bypassZ !== undefined && bypassZ > 4.9 && !crossesCeiling(bypass.points)
      const shorterInPlan = crouch?.status === 'complete' && throughZ !== undefined && throughZ > 2 && throughZ < 3.4 &&
        approach.status === 'complete' && finish.status === 'complete' &&
        pathLength(approach.points) + pathLength(crouch.points) + pathLength(finish.points) < pathLength(bypass.points)
      const affordable = shorterInPlan && crouch !== undefined && supportedTunnelPath(crouch.points) &&
        supportedTunnelPath(approach.points) && supportedTunnelPath(finish.points) && arrivesAt(crouch.points, TUNNEL_EXIT)
      const standingPhasesClear = !crossesCeiling(approach.points) && !crossesCeiling(finish.points)
      const earlyRise: Point = [6.95, FLOOR, 2.7]
      const earlyRiseBlocked = crossesCeiling([earlyRise, TUNNEL_EXIT]) && STANDING > clearance
      const tunnelAllowed = clearance >= CROUCHING && affordable && standingPhasesClear
      const useTunnel = variant === 'crouch'
      const safeMotion = (from: Point, to: Point, height: number) =>
        supportedTunnelPath([from, to]) && (!crossesCeiling([from, to]) ||
          Math.max(from[1], to[1]) + height <= roofBottom)
      // Feed an otherwise favorable path through the follower directly. Its runtime
      // oracle must fail even if the planning check is removed.
      let roofRejectedInMotion = false
      if (onRoof) {
        const acceptance = playback([{ phase: 'poisoned roof route', height: CROUCHING, points: roofPoints }],
          () => [], true, 'Inferred arrival', {}, {
            move: (from, to, _phase, height) => safeMotion(from, to, height),
            finish: (feet) => distance(feet, TUNNEL_EXIT) <= 0.12
          })
        acceptance.step(8)
        roofRejectedInMotion = acceptance.frame().verdict === 'fail' && acceptance.metrics.motionViolations > 0
      }
      const expected = bypassSafe && earlyRiseBlocked && (useTunnel ? tunnelAllowed : !affordable) &&
        (!onRoof || shorterInPlan && roofRejectedInMotion)
      const stages = tunnelAllowed && crouch ? [
        { phase: 'approach standing', height: STANDING, points: approach.points },
        { phase: 'lower profile before entering tunnel', height: CROUCHING, points: crouch.points },
        { phase: 'stand once the full body clears', height: STANDING, points: finish.points }
      ] : [
        { phase: 'standing bypass', height: STANDING,
          points: bypass.points.length ? bypass.points : [TUNNEL_START] }
      ]
      const shapes = [...tunnelFloors.map(({ shape }) => shape), { ...roof.shape, kind: 'obstacle' as const },
        marker('crouch marker', TUNNEL_ENTRY, 'guide'), marker('stand marker', TUNNEL_EXIT, 'guide'),
        marker('unsafe stand marker', earlyRise, 'guide'), marker('goal', TUNNEL_END)]
      let stance = STANDING
      let observedStanceChanges = 0
      const startsAtTunnelStart = distance(stages[0].points[0], TUNNEL_START) <= 0.12
      const run = playback(stages, () => shapes, expected && startsAtTunnelStart, expected ?
        useTunnel ? 'Stand, crouch, stand. The early-rise reference intersects the ceiling footprint.'
          : onRoof ? 'A short route with a roof waypoint fails the ground-support check. The standing route takes the bypass.'
            : 'The crouch profile cannot use this tunnel, so the standing route takes the bypass.'
        : 'Unexpected corridor or stance clearance.',
      {
        bakes: crouching ? 2 : 1, routeQueries: crouching ? 4 : 3, ceilingMetres: clearance,
        crouchClearanceMetres: clearance - CROUCHING, roofRejectedInMotion: Number(roofRejectedInMotion)
      }, {
        move(from, to, _phase, height) {
          if (height !== stance) observedStanceChanges++
          stance = height
          return safeMotion(from, to, height)
        },
        finish(feet, height) {
          return distance(feet, TUNNEL_END) <= 0.12 && height === STANDING &&
            observedStanceChanges === (tunnelAllowed ? 2 : 0)
        }
      })
      return { ...run, get metrics() { return { ...run.metrics, stanceChanges: observedStanceChanges } } }
    } finally {
      crouching?.dispose?.()
    }
  } finally {
    standing.dispose?.()
  }
}

export const recipeRuntimeDefinitions = [
  {
    id: 'recipe-raycast', caseId: 'RECIPE-RAYCAST', label: 'Navmesh ray on two floors', run: raycastRun,
    variants: [{ id: 'upper', label: 'Balcony needs the ramp' }, { id: 'lower', label: 'Same floor shortcut' }, { id: 'wall', label: 'Lower floor wall' }]
  },
  {
    id: 'recipe-swing-door', caseId: 'RECIPE-SWING-DOOR', label: 'Door sweeps the waiting point', run: doorRun,
    variants: [{ id: 'pocket', label: 'Wait in the safe pocket' }, { id: 'bypass', label: 'No pocket, take bypass' },
      { id: 'endpoints', label: 'Endpoint-only collision' }]
  },
  {
    id: 'recipe-crouch', caseId: 'RECIPE-CROUCH', label: 'Stand, crouch, stand', run: crouchRun,
    variants: [{ id: 'crouch', label: 'Crouch under the beam' }, { id: 'disabled', label: 'Standing only' },
      { id: 'too-low', label: 'Even crouch cannot fit' }, { id: 'wrong-floor', label: 'Wrong-floor route takes bypass' }]
  }
] as const

export const recipeRuntimeScenarios: readonly TraversalScenario[] = recipeRuntimeDefinitions.map((definition) => ({
  id: definition.id, label: definition.label, cases: [definition.caseId], variants: definition.variants,
  create(variantId) {
    if (!definition.variants.some(({ id }) => id === variantId)) {
      throw new Error('Unknown variant ' + variantId + ' for ' + definition.label)
    }
    return definition.run(variantId, makeNavcatRecipeNavigator)
  }
}))
