import type { Point, Surface } from '../arena'
import { FLOOR, distance, marker, pathLength, slab } from './recipe-runtime-support'
import {
  hold, joinMotions, nativePath, pointAt, routeMarks, shape, showRun, walk, type GameplayNavigatorFactory
} from './recipe-gameplay-support'

const pursuitStart: Point = [2, FLOOR, 5.8]
const patrolStart: Point = [14, FLOOR, 5.8]
const meeting: Point = [8, 2.2, 4.1]
const stationaryTarget: Point = [6, FLOOR, 6.4]

function ramp(id: string, west: number, east: number, westY: number, eastY: number) {
  const surface: Surface = {
    vertices: [[west, westY, 3], [west, westY, 5], [east, eastY, 5], [east, eastY, 3]],
    triangles: [0, 1, 2, 0, 2, 3]
  }
  const strips = Array.from({ length: 16 }, (_, i) => {
    const fraction = (i + 0.5) / 16
    return shape(id + ' step ' + i, 'guide',
      [west + (east - west) * fraction, westY + (eastY - westY) * fraction - 0.055, 4],
      [(east - west) / 16, 0.11, 2])
  })
  return { surface, strips }
}

export function interceptRun(variant: string, makeNavigator: GameplayNavigatorFactory) {
  const ground = slab('lower deck', 1, 15, 3, 7.5)
  const balcony = slab('upper gallery', 5.9, 10.1, 3, 5, meeting[1])
  const west = ramp('west ramp', 2.5, 5.9, FLOOR, meeting[1])
  const east = ramp('east ramp', 10.1, 13.5, meeting[1], FLOOR)
  const nav = makeNavigator([ground.surface, balcony.surface, west.surface, east.surface])
  let near: Point[], patrol: Point[], obsolete: Point[], stationary: Point[]
  try {
    near = nativePath(nav, pursuitStart, [2.25, FLOOR, 4.2], meeting)
    patrol = nativePath(nav, patrolStart, [13.75, FLOOR, 4.2], meeting)
    obsolete = nativePath(nav, pursuitStart, patrolStart)
    stationary = nativePath(nav, pursuitStart, stationaryTarget)
  } finally {
    nav.dispose?.()
  }
  const meetingSeconds = 4
  const pursuerSpeed = 3
  const predictive = near.length ? walk(near, pursuerSpeed) : hold(pursuitStart, meetingSeconds)
  const patrolMetres = pathLength(patrol)
  const target = patrolMetres ? walk(patrol, patrolMetres / meetingSeconds) : hold(patrolStart, meetingSeconds)
  const reactive = obsolete.length && patrol.length
    ? joinMotions(walk(obsolete, pursuerSpeed), walk(patrol, pursuerSpeed)) : hold(pursuitStart, 0)
  const direct = stationary.length ? walk(stationary, pursuerSpeed) : hold(pursuitStart, 0)
  const captureRadius = 0.35
  const gapAtMeeting = distance(predictive.at(meetingSeconds), target.at(meetingSeconds))
  const lateGap = distance(reactive.at(4.5), target.at(4.5))
  const crossedNearRamp = near.some(([x, y]) => x < 5.8 && y > 0.7 && y < 2.05)
  const crossedFarRamp = patrol.some(([x, y]) => x > 10.2 && y > 0.7 && y < 2.05)
  const isStill = variant === 'stationary'
  const chasesCurrent = variant === 'reactive'
  const pursuer = isStill ? direct : chasesCurrent ? reactive : predictive
  const chosen = isStill ? stationary : chasesCurrent ? [...obsolete, ...patrol] : near
  const shapes = [
    ground.shape, balcony.shape, ...west.strips, ...east.strips,
    marker('interception goal', isStill ? stationaryTarget : meeting),
    ...routeMarks('pursuer route', chosen)
  ]
  const passed = crossedNearRamp && crossedFarRamp && gapAtMeeting < captureRadius && predictive.seconds < 3 &&
    predictive.at(meetingSeconds)[1] > 2 && lateGap > captureRadius && reactive.seconds > 5 &&
    distance(direct.at(direct.seconds), stationaryTarget) < captureRadius &&
    stationary.every(([, y]) => y < FLOOR + 0.15)
  const detail = isStill ? 'A stationary target stays on the lower deck. Its route uses no ramp.'
    : chasesCurrent ? 'Pursuing the old lower-floor position first misses the meeting deadline.'
      : 'The forecast chooses the near ramp. The pursuer waits on the upper gallery for the other patrol.'
  return showRun(isStill ? direct.seconds + 0.8 : chasesCurrent ? 5.1 : 4.5, passed, detail,
    { predictiveArrivalSeconds: predictive.seconds, reactiveArrivalSeconds: reactive.seconds, meetingSeconds,
      predictedGapAtMeetingMetres: gapAtMeeting, reactiveGapAtDeadlineMetres: lateGap, captureRadiusMetres: captureRadius },
    (time) => ({
      shapes,
      bots: [{ id: 'pursuer', feet: pursuer.at(time), radius: 0.22, height: 0.8 },
        { id: 'patrol', feet: isStill ? stationaryTarget : target.at(time), radius: 0.2, height: 0.75 }],
      phase: isStill ? 'lower-floor control' : chasesCurrent ? 'chase the initial lower position first'
        : time < predictive.seconds ? 'take the near ramp' : time < meetingSeconds ? 'wait upstairs' : 'intercept on the gallery'
    }))
}

function lanes(x0: number, x1: number, nearZ: number, farZ: number, hasBypass = true) {
  const lo = x0 + 0.8
  const hi = x1 - 0.8
  const span = 0.65
  const sides = [
    slab('west junction', x0 - 0.65, lo, nearZ - span, (hasBypass ? farZ : nearZ) + span),
    slab('east junction', hi, x1 + 0.65, nearZ - span, (hasBypass ? farZ : nearZ) + span)
  ]
  return [...sides, slab('central lane', lo, hi, nearZ - span, nearZ + span),
    ...(hasBypass ? [slab('alternate lane', lo, hi, farZ - span, farZ + span)] : [])]
}

const eye: Point = [6, 2.4, 1.4]
const fov = Math.tan(Math.PI / 9)
const coverZ = 5.1
const coverWest = 3.3
const coverEast = 8.7
const coverHeight = 2.9
const headOffset = 1.35

function exposureLength(points: readonly Point[], cover: boolean) {
  if (points.length < 2) return 0
  // At the cover plane the entire cone cross section fits inside the authored wall.
  // The wall also extends above and below the ray from the eye to the heads in both lanes.
  const visibleLimits = (point: Point) => {
    const [x, , z] = point
    const along = z - eye[2]
    const side = x - eye[0]
    return [along, along * fov - side, along * fov + side, ...(cover ? [coverZ - z] : [])]
  }
  return points.slice(1).reduce((visible, to, index) => {
    const from = points[index]
    const fromLimits = visibleLimits(from)
    let entry = 0
    let exit = 1
    for (const [i, toLimit] of visibleLimits(to).entries()) {
      const fromLimit = fromLimits[i]
      if (fromLimit < 0 && toLimit < 0) return visible
      if (fromLimit < 0) entry = Math.max(entry, -fromLimit / (toLimit - fromLimit))
      else if (toLimit < 0) exit = Math.min(exit, fromLimit / (fromLimit - toLimit))
    }
    return visible + Math.max(0, exit - entry) * distance(from, to)
  }, 0)
}

function headVisible([x, y, z]: Point, cover: boolean) {
  const dz = z - eye[2]
  if (dz <= 0 || Math.abs(Math.atan2(x - eye[0], dz)) > Math.PI / 9) return false
  if (!cover || z <= coverZ) return true
  const t = (coverZ - eye[2]) / dz
  const hitX = eye[0] + (x - eye[0]) * t
  const hitY = eye[1] + (y + headOffset - eye[1]) * t
  return hitX < coverWest || hitX > coverEast || hitY < FLOOR || hitY > FLOOR + coverHeight
}

export function coverRun(variant: string, makeNavigator: GameplayNavigatorFactory) {
  const start: Point = [2, FLOOR, 4]
  const goal: Point = [10, FLOOR, 4]
  const hasCover = variant !== 'no-cover'
  const watched = variant !== 'unobserved'
  const surfaces = lanes(start[0], goal[0], start[2], 6.55)
  const nav = makeNavigator(surfaces.map(({ surface }) => surface))
  let short: Point[], long: Point[]
  try {
    short = nativePath(nav, start, [6, FLOOR, 4], goal)
    long = nativePath(nav, start, [6, FLOOR, 6.55], goal)
  } finally {
    nav.dispose?.()
  }
  const candidates = [short, long].filter((points) => points.length).map((points) => ({
    points, metres: pathLength(points), exposureMetres: watched ? exposureLength(points, hasCover) : 0,
  })).sort((a, b) => a.metres - b.metres)
  const selected = candidates.find(({ exposureMetres }) => exposureMetres < 1e-6)
  const motion = selected ? walk(selected.points, 2.65) : hold(start, 1)
  // Independent ray-to-wall oracle checks selected and rejected candidates throughout their length.
  const sampled = (points: readonly Point[], covered: boolean) => {
    const length = pathLength(points)
    if (!length) return 0
    const samples = Math.ceil(length / 0.025)
    return Array.from({ length: samples }, (_, i) => headVisible(pointAt(points, length * (i + 0.5) / samples), covered))
      .filter(Boolean).length
  }
  const exposedShort = sampled(short, true)
  const exposedLong = sampled(long, true)
  const exposedLongUncovered = sampled(long, false)
  const passed = candidates.length === 2 && pathLength(short) + 1 < pathLength(long) &&
    !headVisible(start, false) && !headVisible(goal, false) &&
    exposedShort > 50 && exposedLong === 0 && exposedLongUncovered > 50 &&
    (variant === 'hidden' ? selected?.points === long
      : variant === 'unobserved' ? selected?.points === short : selected === undefined)
  const shapes = [
    ...surfaces.map(({ shape: surface }) => surface),
    ...(hasCover ? [shape('cover wall', 'obstacle', [(coverWest + coverEast) / 2, FLOOR + coverHeight / 2, coverZ],
      [coverEast - coverWest, coverHeight, 0.12])] : []),
    marker('destination', goal), ...routeMarks('chosen path', selected?.points ?? [])
  ]
  return showRun(motion.seconds + 0.7, passed,
    'Both endpoints are out of view. The short route crosses the sight cone. ' +
      (selected ? 'Selected ' + (selected.points === long ? 'covered detour.' : 'shortest route without surveillance.')
        : 'Both routes are exposed without the wall, so the NPC waits.'),
    { shortMetres: pathLength(short), detourMetres: pathLength(long), shortVisibleMetres: watched ? exposureLength(short, hasCover) : 0,
      detourVisibleMetres: watched ? exposureLength(long, hasCover) : 0, exposedShortSamples: exposedShort,
      exposedCoveredDetourSamples: exposedLong, exposedOpenDetourSamples: exposedLongUncovered },
    (time) => ({
      shapes,
      bots: [
        { id: 'route agent', feet: motion.at(time), radius: 0.18, height: headOffset },
        ...(watched ? [{ id: 'observer', feet: [eye[0], FLOOR, eye[2]] as Point, headingDegrees: 0, height: eye[1] - FLOOR }] : [])
      ],
      phase: !selected ? 'blocked by visibility' : selected.points === long ? 'concealed detour' : 'shortest route'
    }))
}

export function conveyorRun(variant: string, makeNavigator: GameplayNavigatorFactory) {
  const from: Point = [3, FLOOR, 4]
  const to: Point = [8, FLOOR, 4]
  const beltMs = variant === 'stopped' ? 0 : variant === 'reversed' ? -3 : 3
  const hasBypass = variant !== 'no-bypass'
  const speed = 2
  const surfaces = lanes(from[0], to[0], 4, 6.5, hasBypass)
  const nav = makeNavigator(surfaces.map(({ surface }) => surface))
  const candidates = (start: Point, goal: Point, direction: number) => {
    const direct = nativePath(nav, start, [5.5, FLOOR, 4], goal)
    const bypass = hasBypass ? nativePath(nav, start, [5.5, FLOOR, 6.5], goal) : []
    const worldSpeed = speed + direction * beltMs
    const beltTime = direct.length && worldSpeed > 0 ? pathLength(direct) / worldSpeed : Infinity
    const bypassTime = bypass.length ? pathLength(bypass) / speed : Infinity
    const choice = Number.isFinite(beltTime) && beltTime <= bypassTime ? 'belt' : Number.isFinite(bypassTime) ? 'bypass' : 'blocked'
    const motion = choice === 'belt' ? walk(direct, worldSpeed) : choice === 'bypass' ? walk(bypass, speed) : hold(start, 1)
    return { choice, motion, direct, bypass }
  }
  let east, west
  try {
    east = candidates(from, to, 1)
    west = candidates(to, from, -1)
  } finally {
    nav.dispose?.()
  }
  const expected = variant === 'reversed' ? ['bypass', 'belt']
    : variant === 'stopped' ? ['belt', 'belt'] : ['belt', hasBypass ? 'bypass' : 'blocked']
  const passed = east.choice === expected[0] && west.choice === expected[1] && east.direct.length > 0 && west.direct.length > 0 &&
    (!hasBypass || pathLength(east.bypass) > pathLength(east.direct) + 1.5) &&
    (east.choice === 'blocked' || distance(east.motion.at(east.motion.seconds), to) < 0.2) &&
    (west.choice === 'blocked' || distance(west.motion.at(west.motion.seconds), from) < 0.2)
  const selected = variant === 'stopped' ? east : beltMs < 0 ? east : west
  const trace = selected.choice === 'belt' ? selected.direct : selected.choice === 'bypass' ? selected.bypass : []
  const shapes = [...surfaces.map(({ shape: surface }) => surface), marker('west port', from), marker('east port', to),
    ...routeMarks('selected route', trace)]
  return showRun(selected.motion.seconds + 0.7, passed,
    `The 5 m belt runs at ${beltMs} m/s. Eastbound: ${east.choice}. Westbound: ${west.choice}. The displayed route exercises ${selected.choice}.`,
    { beltMetresPerSecond: beltMs, beltLengthMetres: pathLength(east.direct), bypassLengthMetres: pathLength(east.bypass),
      eastboundSeconds: east.choice === 'blocked' ? 0 : east.motion.seconds, westboundSeconds: west.choice === 'blocked' ? 0 : west.motion.seconds,
      eastboundCanTravel: Number(east.choice !== 'blocked'), westboundCanTravel: Number(west.choice !== 'blocked') },
    (time) => {
      const slats = Array.from({ length: 12 }, (_, i) => {
        const offset = ((i * 0.4 + time * beltMs) % 5 + 5) % 5
        return shape('belt mark ' + i, 'guide', [from[0] + offset, FLOOR + 0.02, 4], [0.07, 0.04, 0.9])
      })
      return {
        shapes: [...shapes, ...slats], bots: [{ id: 'conveyor agent', feet: selected.motion.at(time), radius: 0.2, height: 0.7 }],
        phase: (variant === 'stopped' ? 'eastbound' : beltMs < 0 ? 'eastbound against reversed belt' : 'westbound against belt') +
          ' · ' + selected.choice
      }
    })
}
