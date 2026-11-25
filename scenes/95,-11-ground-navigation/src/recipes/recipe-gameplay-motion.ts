import type { Point } from '../arena'
import { FLOOR, distance, marker, slab } from './recipe-runtime-support'
import { hold, nativePath, routeMarks, shape, showRun, walk, type GameplayNavigatorFactory } from './recipe-gameplay-support'

type Bounds = readonly [minX: number, maxX: number, minZ: number, maxZ: number]

// The corridors overlap at each elbow. Their inward rectangles describe known safe poses for the disc.
const turnRadius = 0.15
const course: readonly Bounds[] = [[3.77, 5.23, 2.77, 3.23], [4.77, 5.23, 2.77, 3.83], [4.77, 6.23, 3.37, 3.83]]
const frameStart: Point = [4.75, FLOOR, 3]
const waypoint: readonly Point[] = [[5, FLOOR, 3], [5, FLOOR, 3.6], [6, FLOOR, 3.6]]

function advance(position: Point, next: number, metres: number) {
  const trace = [position]
  while (metres > 1e-9 && next < waypoint.length) {
    const target = waypoint[next]
    const length = distance(position, target)
    if (length <= metres + 1e-9) {
      position = target
      metres -= length
      next++
    } else {
      const fraction = metres / length
      position = [
        position[0] + (target[0] - position[0]) * fraction, FLOOR,
        position[2] + (target[2] - position[2]) * fraction
      ]
      metres = 0
    }
    trace.push(position)
  }
  return { position, next, trace }
}

function sweepInsideCourse(from: Point, to: Point) {
  // Clip the entire swept center line to each safe rectangle, then check that the union covers the step.
  const intervals: [number, number][] = []
  for (const [x0, x1, z0, z1] of course) {
    let entry = 0
    let exit = 1
    for (const [axis, min, max] of [[0, x0 + turnRadius, x1 - turnRadius], [2, z0 + turnRadius, z1 - turnRadius]] as const) {
      const delta = to[axis] - from[axis]
      if (delta === 0) {
        if (from[axis] < min || from[axis] > max) exit = -1
      } else {
        const a = (min - from[axis]) / delta
        const b = (max - from[axis]) / delta
        entry = Math.max(entry, Math.min(a, b))
        exit = Math.min(exit, Math.max(a, b))
      }
    }
    if (entry <= exit) intervals.push([entry, exit])
  }
  let covered = 0
  for (const [entry, exit] of intervals.sort(([a], [b]) => a - b)) {
    if (entry > covered + 1e-9) break
    covered = Math.max(covered, exit)
  }
  return covered >= 1 - 1e-9
}

export function longFrameRun(variant: string) {
  const speed = 3
  const frameSeconds = 0.30
  const long = advance(frameStart, 0, speed * frameSeconds)
  let short = { position: frameStart, next: 0 }
  const shortTrace = [frameStart]
  for (let tick = 0; tick < 9; tick++) {
    const step = advance(short.position, short.next, speed / 30)
    shortTrace.push(...step.trace.slice(1))
    short = step
  }
  const safe = (trace: readonly Point[]) => trace.slice(1).every((point, i) => sweepInsideCourse(trace[i], point))
  const endErrorMetres = distance(short.position, long.position)
  const chord = [frameStart, long.position]
  const chordBlocked = !safe(chord)
  const control = variant === 'chord'
  const shown = control ? chord : long.trace
  const trace = walk(shown, 0.48)
  const expected: Point = [5.05, FLOOR, 3.6]
  const passed = chordBlocked && long.next === 2 && short.next === 2 && safe(long.trace) && safe(shortTrace) &&
    endErrorMetres < 0.02 && distance(long.position, expected) < 0.001
  const shapes = [
    ...course.map((bounds, i) => slab('turn corridor ' + i, ...bounds).shape),
    ...waypoint.slice(0, 2).map((point, i) => marker('turn ' + i, point)),
    ...routeMarks('swept center route', shown)
  ]
  return showRun(trace.seconds + 0.7, passed, control
    ? 'The direct chord reaches the same pose but crosses the boundary between turns. The swept-volume check rejects it.'
    : 'One 300 ms step visits both corners in order and matches nine short steps within 2 cm.',
  { frameSeconds, referenceSteps: 9, turnsTraversed: long.next, endErrorMetres, chordBlocked: Number(chordBlocked) },
  (time) => ({ shapes, bots: [{ id: 'follower', feet: trace.at(time), radius: turnRadius, height: 0.65 }],
    phase: control ? 'negative control · direct chord' : 'substeps · slow motion' }))
}

const robotLength = 1.45
const robotWidth = 0.55
const robotFrom: Point = [4, FLOOR, 3]
const stations = [
  { id: 'narrow', center: [4, FLOOR, 7.5] as const, width: 1.5 },
  { id: 'wide', center: [9, FLOOR, 7.5] as const, width: 1.7 }
]

export function robotTurnRun(variant: string, makeNavigator: GameplayNavigatorFactory) {
  const circular = variant === 'circle'
  const available = variant === 'narrow-only' ? stations.slice(0, 1) : stations
  const surfaces = [slab('shared approach', 2.5, 11.5, 2.2, 4.2)]
  const walls = []
  for (const { id, center: [x, y, z], width } of available) {
    const half = width / 2
    surfaces.push(slab(id + ' approach', x - 0.55, x + 0.55, 4.2, z - half),
      slab(id + ' station', x - half, x + half, z - half, z + half))
    for (const side of [-1, 1]) {
      walls.push(shape(id + ' side ' + side, 'obstacle', [x + side * (half + 0.04), y + 0.21, z], [0.08, 0.42, width]))
    }
    walls.push(shape(id + ' back', 'obstacle', [x, y + 0.21, z + half + 0.04], [width + 0.16, 0.42, 0.08]))
  }

  // For a centered quarter-turn the widest axis projection is the footprint diagonal.
  const requiredWidth = circular ? robotWidth : Math.hypot(robotLength, robotWidth)
  const nav = makeNavigator(surfaces.map(({ surface }) => surface))
  let options
  try {
    options = available.map((station) => ({
      ...station, route: nativePath(nav, robotFrom, [station.center[0], FLOOR, 4.7], station.center),
      fits: station.width >= requiredWidth
    }))
  } finally {
    nav.dispose?.()
  }
  const chosen = options.find(({ route, fits }) => route.length > 0 && fits)
  const rejectedRoute = options[0].route
  const diagnosticPath = chosen?.route ?? rejectedRoute
  const center = chosen?.center ?? options[0].center
  const approach = diagnosticPath.length ? walk(diagnosticPath, 2.4) : hold(robotFrom, 0)
  const sampled = Array.from({ length: 901 }, (_, i) => {
    const radians = i * Math.PI / 1800
    return circular ? robotWidth : Math.max(
      robotLength * Math.sin(radians) + robotWidth * Math.cos(radians),
      robotLength * Math.cos(radians) + robotWidth * Math.sin(radians))
  })
  const sampledWidth = Math.max(...sampled)
  const narrowEndpointsFit = Math.max(robotLength, robotWidth) <= stations[0].width
  const passed = options.every(({ route }) => route.length > 0) && narrowEndpointsFit &&
    Math.abs(sampledWidth - requiredWidth) < 1e-5 &&
    (variant === 'narrow-only' ? !chosen && sampledWidth > stations[0].width
      : chosen?.id === (circular ? 'narrow' : 'wide') && sampledWidth <= chosen.width)
  const which = chosen?.id ?? 'none'
  const shapes = [...surfaces.map(({ shape: surface }) => surface), ...walls, ...routeMarks('approach', diagnosticPath)]
  return showRun(approach.seconds + 2, passed,
    `Station selected: ${which}. End poses fit a 1.50 m bay. The centered turn needs ${requiredWidth.toFixed(3)} m.`,
    { requiredWidthMetres: requiredWidth, sampledWidthMetres: sampledWidth, narrowWidthMetres: stations[0].width,
      selectedWidthMetres: chosen?.width ?? 0, candidates: options.length },
    (time) => {
      const turn = time >= approach.seconds
      const feet = turn && diagnosticPath.length ? center : approach.at(time)
      const angle = Math.min(1, Math.max(0, (time - approach.seconds) / 1.6)) * Math.PI / 2
      const footprint = circular ? [] : robotFootprint(feet, angle)
      return {
        shapes: [...shapes, ...footprint],
        bots: circular ? [{ id: 'round robot', feet, radius: robotWidth / 2, height: 0.6, headingDegrees: angle * 180 / Math.PI }] : [],
        phase: turn ? chosen ? 'rotate in selected bay' : 'diagnostic rotation · narrow bay rejected' : 'native route to bay'
      }
    })
}

function robotFootprint([x, y, z]: Point, radians: number) {
  // Small markers render the actual oriented rectangle using the playground's existing box primitives.
  const edges: [number, number][] = []
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 16; i++) edges.push([side * robotWidth / 2, (i / 16 - 0.5) * robotLength])
    for (let i = 1; i < 6; i++) edges.push([(i / 6 - 0.5) * robotWidth, side * robotLength / 2])
  }
  const sin = Math.sin(radians)
  const cos = Math.cos(radians)
  return edges.map(([u, v], i) => shape('robot perimeter ' + i, 'guide',
    [x + u * cos + v * sin, y + 0.23, z - u * sin + v * cos], [0.08, 0.43, 0.08]))
}
