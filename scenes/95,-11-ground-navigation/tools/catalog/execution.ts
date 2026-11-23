import type { Point } from '../../src/arena'
import { advance, BOT_RADIUS, capsuleHits, interpolate, supports } from '../../src/traversal/fixtures/mantles-support'
import { createTraversalNavigator, traversalSurfaces } from '../sdk-detour-probe/traversal-routing'
import { withNavigator } from './advanced-actions-support'
import { canStepUp, descendingSupport, distance, resolveMotion, worldPoint } from './execution-support'
import { sweptGap } from './time-crowd-support'
import { box, check, type CatalogCase } from './types'

function staleCompletion() {
  type Ticket = { id: number; generation: number; attempt: number }
  type Actor = { ticket: Ticket; slot: string; route: string; x: number }
  const actors = new Map<number, Actor>()
  const ended = new Map<Ticket, 'abort' | 'finish'>()
  const ownership = new Map<string, Ticket>()

  function start(generation: number, attempt: number, slot: string, route: string, x: number) {
    const ticket = { id: 7, generation, attempt }
    actors.set(ticket.id, { ticket, slot, route, x })
    ownership.set(slot, ticket)
    return ticket
  }

  function terminate(ticket: Ticket, state: 'abort' | 'finish') {
    const actor = actors.get(ticket.id)
    if (!actor || actor.ticket.generation !== ticket.generation ||
        actor.ticket.attempt !== ticket.attempt || ended.has(actor.ticket)) return false
    ended.set(actor.ticket, state)
    if (ownership.get(actor.slot) === actor.ticket) ownership.delete(actor.slot)
    if (state === 'finish') actor.x = 5
    return true
  }

  const removed = start(1, 1, 'climb', 'old-goal', 1.25)
  const removeAbort = terminate(removed, 'abort')
  actors.delete(removed.id)
  // The recycled entity takes the same slot, making release by a stale event observable.
  const replacement = start(2, 1, 'climb', 'other-goal', 2.25)
  const oldCompletion = terminate({ ...removed }, 'finish')
  const other = actors.get(replacement.id)
  const replacementIntact = other?.x === 2.25 && other.route === 'other-goal' && ownership.get('climb') === replacement
  const teleportAbort = terminate(replacement, 'abort')
  const teleported = start(2, 2, 'climb', 'teleport-goal', 3.25)
  const oldAttemptCompletion = terminate({ ...replacement }, 'finish')
  const actor = actors.get(teleported.id)
  const teleportIntact = actor?.x === 3.25 && actor.route === 'teleport-goal' && ownership.get('climb') === teleported
  const validCompletion = terminate({ ...teleported }, 'finish')
  const duplicateCompletion = terminate({ ...teleported }, 'finish')

  return check(removeAbort && teleportAbort && !oldCompletion && !oldAttemptCompletion && !duplicateCompletion &&
    replacementIntact && teleportIntact && validCompletion && ownership.size === 0 &&
    [...ended.values()].join(',') === 'abort,abort,finish',
  'Generation and attempt survive ID reuse and teleport. Terminal outcomes are abort, abort, finish.')
}

function singleMotionWriter() {
  const blocker = box('arrival-blocker', 'obstacle', [2.6, 0, -0.3], [2.7, 1.8, 0.3])
  const deck = box('floor below transition', 'surface', [-1, -0.2, -1], [5, 0, 1])
  const dt = 1 / 30
  function simulate(blocked: boolean, previousAvoidance: boolean) {
    let pose: Point = [0, 0, 0]
    let phase: 'jump' | 'recovery' | 'walk' = 'jump'
    let avoidance = false
    let finish = 0
    let abort = 0
    let avoidedProposals = 0
    let maximumTravel = 0
    let stray = 0
    let safeRecovery = true
    const owners: string[] = []
    for (let tick = 1; tick <= 70; tick++) {
      const t = tick * dt
      const peer: Point = [3 - 3 * t, 0, -0.48]
      const steers = Math.hypot(pose[0] - peer[0], pose[2] - peer[2]) < 0.8
      if (phase !== 'walk' && steers) avoidedProposals++
      const walk: Point = [pose[0] + 2 * dt, pose[1], pose[2] + (steers && previousAvoidance ? 0.1 : 0)]
      const ballistic: Point = [3 * t, Math.max(4 * t * (1 - t), 0), 0]
      const obstructed = phase === 'jump' && blocked && capsuleHits(pose, ballistic, blocker)
      if (obstructed) phase = 'recovery'
      const recovery: Point = [pose[0], Math.max(0, pose[1] - 1.5 * dt), pose[2]]
      const action = phase === 'recovery' ? recovery : ballistic
      const commit = resolveMotion(phase === 'walk' ? 'walk' : 'transition', [
        { owner: 'walk', point: walk }, { owner: 'transition', point: action }
      ])
      maximumTravel = Math.max(maximumTravel, distance(pose, commit.point))
      if (phase !== 'walk' && (commit.point !== action || avoidance)) stray++
      if (phase === 'recovery' && capsuleHits(pose, commit.point, blocker)) safeRecovery = false
      pose = commit.point
      owners.push(commit.owner)
      if (phase === 'walk') break
      if (phase === 'recovery' && pose[1] === 0) {
        safeRecovery &&= supports(deck, pose)
        abort++
        phase = 'walk'
      } else if (phase === 'jump' && tick === 30) {
        safeRecovery &&= supports(deck, pose)
        finish++
        phase = 'walk'
      }
      if (phase === 'walk') {
        avoidance = previousAvoidance
      }
    }
    return { finish, abort, avoidance, stray, owners, safeRecovery, maximumTravel, avoidedProposals }
  }
  const success = simulate(false, true)
  const failure = simulate(true, true)
  const originallyOff = simulate(false, false)
  return check(success.finish === 1 && success.abort === 0 && failure.finish === 0 && failure.abort === 1 &&
    [success, failure, originallyOff].every((run) => run.owners[run.owners.length - 1] === 'walk' &&
      run.owners.slice(0, -1).every((owner) => owner === 'transition') && run.stray === 0 && run.safeRecovery &&
      run.maximumTravel < 0.17 && run.avoidedProposals > 0) &&
    success.avoidance && failure.avoidance && !originallyOff.avoidance,
  'The jump and blocked safe descent are sole motion owners while the peer triggers steering proposals. Walk resumes on support with the previous avoidance setting.')
}

const deferredWaypoint: CatalogCase['run'] = (backend) => {
  const from: Point = [0.75, 0, 1.5]
  const entrance: Point = [2.5, 0, 1.5]
  const exit: Point = [5.5, 2.5, 1.5]
  const goal: Point = [7.2, 2.5, 1.5]
  const floors = [
    box('ladder approach', 'surface', [0, -0.2, 0], [3.5, 0, 3]),
    box('upper target', 'surface', [4.8, 2.3, 0], [8, 2.5, 3])
  ]
  return withNavigator(backend, floors, 0.15, 0.6, [{ from: entrance, to: exit }], (route) => {
    const approach = route(from, entrance)
    if (approach.status !== 'complete') return check(false, 'No native route to the ladder entrance.')
    let feet = from
    for (const point of approach.points) {
      for (let tick = 0; feet !== point && tick < 80; tick++) feet = advance(feet, point, 0.08)
    }
    if (distance(feet, entrance) > 0.12) return check(false, 'Follower did not reach the event trigger.')

    let depth = 0
    let maxDepth = 0
    const queries: { from: Point; path: ReturnType<typeof route> }[] = []
    const committed = new Set<string>()
    const pending: (() => void)[] = []
    const trace: string[] = []

    function process(id: string) {
      if (committed.has(id) || depth > 0) return
      depth++
      maxDepth = Math.max(maxDepth, depth)
      // The listener asks for a new target path while the waypoint is being dispatched.
      pending.push(() => {
        queries.push({ from: feet, path: route(feet, goal) })
        trace.push('query-new')
      })
      process(id)
      committed.add(id)
      trace.push('start ' + id)
      depth--
    }

    function updateSignal(id: string) {
      process(id)
      while (pending.length) pending.shift()?.()
    }

    updateSignal('ladder')
    updateSignal('ladder')
    const nextPath = queries[0]?.path
    return check(maxDepth === 1 && pending.length === 0 && queries.length === 1 && queries[0]?.from === feet &&
      trace.join(',') === 'start ladder,query-new' && nextPath?.status === 'complete' &&
      nextPath.points.some((point) => distance(point, exit) < 0.13) &&
      distance(nextPath.points[nextPath.points.length - 1] ?? from, goal) < 0.12,
    'The follower reached the ladder. Reentrant and next-tick duplicate waypoints issued one real upstairs query after commit.')
  })
}

const reversedLadder: CatalogCase['run'] = (backend) => {
  const ladderId = 'tilted-ladder'
  const origin: Point = [8, 0, 8]
  const from = worldPoint([0, 0, 0], origin, 60)
  const to = worldPoint([0, 2, 0.4], origin, 60)
  const lower = box('lower', 'surface', [5, -0.15, 5], [11, 0, 11])
  const upper = box('upper', 'surface', [5, 1.85, 5], [11, 2, 11])
  const surfaces = traversalSurfaces([lower, upper], 1.6)
  const navigator = createTraversalNavigator(backend, surfaces, 0.25, 1.6, [{ from, to, bidirectional: true }], true)
  const reserved = new Set<string>()
  const events: { phase: 'enter' | 'exit'; id: string; at: Point }[] = []
  let feet: Point = [to[0], 0, to[2]]
  const lowerGoal: Point = feet
  const upperGoal: Point = [from[0], 2, from[2]]

  function follow(entry: Point, exit: Point, goal: Point) {
    const path = navigator.route(feet, goal)
    if (path.status !== 'complete' || distance(path.points[0], feet) >= 0.16 ||
        distance(path.points[path.points.length - 1], goal) >= 0.16) return false
    const linkStart = path.points.findIndex((point, i) =>
      i + 1 < path.points.length && Math.abs(point[1] - path.points[i + 1][1]) > 1)
    if (linkStart < 0 || distance(path.points[linkStart], entry) >= 0.16 ||
        distance(path.points[linkStart + 1], exit) >= 0.16 || reserved.has(ladderId)) return false

    function walk(points: readonly Point[], deck: typeof lower, height: number) {
      for (const point of points) {
        const target: Point = [point[0], height, point[2]]
        for (let tick = 0; feet !== target; tick++) {
          if (tick === 300) return false
          feet = advance(feet, target, 0.05)
          if (!supports(deck, feet)) return false
        }
      }
      return true
    }

    const ascending = entry[1] < exit[1]
    if (!walk([...path.points.slice(0, linkStart), entry], ascending ? lower : upper, entry[1])) return false
    reserved.add(ladderId)
    events.push({ phase: 'enter', id: ladderId, at: feet })
    for (let tick = 1; tick <= 40; tick++) {
      feet = interpolate(entry, exit, tick / 40)
      if (!reserved.has(ladderId) || distance(feet, entry) > distance(entry, exit) + 1e-6) return false
    }
    if (!supports(ascending ? upper : lower, feet)) return false
    events.push({ phase: 'exit', id: ladderId, at: feet })
    reserved.delete(ladderId)
    return walk([...path.points.slice(linkStart + 2), goal], ascending ? upper : lower, exit[1])
  }

  try {
    const expectedUpper: Point = [8.34641016, 2, 8.2]
    const travelled = follow(from, to, upperGoal) && follow(to, from, lowerGoal)
    const expected = [origin, expectedUpper, expectedUpper, origin]
    return check(travelled && supports(lower, feet) && reserved.size === 0 && events.length === expected.length &&
      events.every(({ phase, id, at }, i) =>
        id === ladderId && phase === (i % 2 ? 'exit' : 'enter') && distance(at, expected[i]) < 1e-6),
    'One reserved ladder ID climbs and descends from the opposite endpoints in XZ. World events: ' +
      events.map(({ phase, at }) => phase + ' ' + at.map((value) => value.toFixed(2)).join('/')).join(', ') + '.')
  } finally {
    navigator.dispose?.()
  }
}

const wideLanes: CatalogCase['run'] = (backend) => {
  const near = box('near lip', 'surface', [3, 0.8, 3], [9, 1, 6])
  const far = box('far lip', 'surface', [3.4, 0.8, 8], [9.4, 1, 11])
  const centre = box('temporary obstacle', 'obstacle', [5.8, 1, 8], [6.9, 2.8, 9])
  const completeBlock = box('all lanes blocked', 'obstacle', [3.4, 1, 8], [9.4, 2.8, 9])
  const segment = { start: [[4, 1, 5.6], [8, 1, 5.6]], end: [[4.4, 1, 8.6], [8.4, 1, 8.6]] } as const
  const span = segment.end[1][0] - segment.end[0][0]
  const routeStarts = [[4.8, 1, 4], [7.2, 1, 4]] as const
  const routeGoals = [[5.2, 1, 10], [7.6, 1, 10]] as const

  function openIntervals(block: typeof centre) {
    // Shrink the traversable interval by the capsule radius at both sides of the blocker.
    const [x] = block.center
    const halfWidth = block.size[0] / 2 + BOT_RADIUS
    const leftEnd = (x - halfWidth - segment.end[0][0]) / span
    const rightStart = (x + halfWidth - segment.end[0][0]) / span
    if (rightStart <= 0 || leftEnd >= 1) return [[0, 1]]
    return [[0, Math.min(leftEnd, 1)], [Math.max(rightStart, 0), 1]].filter(([low, high]) => high > low)
  }

  const intervals = openIntervals(centre)
  const closedIntervals = openIntervals(completeBlock)
  if (intervals.length !== 2 || closedIntervals.length !== 0) return check(false, 'Incorrect interval clipping.')
  const lanes = intervals.map(([low, high]) => {
    const t = (low + high) / 2
    return { t, from: interpolate(...segment.start, t), to: interpolate(...segment.end, t) }
  })
  const open = createTraversalNavigator(backend, traversalSurfaces([near, far, centre], 1.8), BOT_RADIUS, 1.8, lanes, true)
  const closed = createTraversalNavigator(backend, traversalSurfaces([near, far, completeBlock], 1.8), BOT_RADIUS, 1.8)
  try {
    const crossings = routeStarts.map((start, i) => {
      const route = open.route(start, routeGoals[i])
      if (route.status !== 'complete') return undefined
      for (let j = 1; j < route.points.length; j++) {
        if (route.points[j - 1][2] < 6 && route.points[j][2] > 8) {
          return { from: route.points[j - 1], to: route.points[j] }
        }
      }
    })
    const nativeMatches = crossings.every((crossing, i) => crossing !== undefined &&
      distance(crossing.from, lanes[i].from) < 0.18 && distance(crossing.to, lanes[i].to) < 0.18)
    const pose = (i: number, tick: number): Point => {
      const { from, to } = lanes[i]
      if (tick <= 20) return interpolate(routeStarts[i], from, tick / 20)
      if (tick >= 50) return interpolate(to, routeGoals[i], (tick - 50) / 20)
      const t = (tick - 20) / 30
      const [x, y, z] = interpolate(from, to, t)
      return [x, y + 2.4 * t * (1 - t), z]
    }
    let minGap = Infinity
    let hits = 0
    for (let tick = 1; tick <= 70; tick++) {
      const before = [pose(0, tick - 1), pose(1, tick - 1)]
      const after = [pose(0, tick), pose(1, tick)]
      minGap = Math.min(minGap, sweptGap(before[0], after[0], before[1], after[1]).distance)
      hits += after.filter((next, i) => capsuleHits(before[i], next, centre)).length
    }
    const expectedLanes = lanes.every(({ from, to }) =>
      Math.abs(to[0] - from[0] - 0.4) < 1e-6 && supports(near, from) && supports(far, to))
    const blockedMiddle = capsuleHits(interpolate(...segment.end, 0.5), interpolate(...segment.end, 0.5), centre)
    return check(expectedLanes && nativeMatches && blockedMiddle && minGap >= 2 * BOT_RADIUS && hits === 0 &&
      routeStarts.every((start, i) => supports(far, routeGoals[i]) &&
        closed.route(start, routeGoals[i]).status === 'unreachable'),
    'One segment action clipped to ' + intervals.map(([lo, hi]) => lo.toFixed(2) + '–' + hi.toFixed(2)).join(' and ') +
      '; native matched slots ' + nativeMatches + '; swept capsule gap ' + (minGap - 2 * BOT_RADIUS).toFixed(3) +
      ' m; obstacle contacts ' + hits + '; closure leaves no slot.')
  } finally {
    closed.dispose?.()
    open.dispose?.()
  }
}

const rotatingSupport: CatalogCase['run'] = (backend) => {
  const pivot: Point = [8, 2, 8]
  const footOffset: Point = [1, 0, 0]
  const localDeck = box('deck in platform space', 'surface', [-2, -0.2, -2], [2, 0, 2])
  // Both the whole orbit and the exit lie in the part of the deck walkable at every angle.
  const stableSurface = box('common walkable area', 'surface', [6.6, 1.8, 6.6], [9.4, 2, 9.4])
  const exit: Point = [7, 2, 8]
  return withNavigator(backend, [stableSurface], 0.12, 0.6, [], (route) => {
    let feet = worldPoint(footOffset, pivot, 0)
    const snapshots: number[] = []
    let maximumError = 0
    let allTicksSupported = true
    for (let tick = 1; tick <= 15; tick++) {
      const followerRoute = route(feet, exit)
      const followerPoint = followerRoute.points[1]
      if (followerRoute.status !== 'complete' || !followerPoint) {
        return check(false, 'The concurrent walk update had no usable proposal.')
      }
      const yaw = 6 * tick
      const platformPoint = worldPoint(footOffset, pivot, yaw)
      feet = resolveMotion('platform', [
        { owner: 'platform', point: platformPoint },
        { owner: 'walk', point: advance(feet, followerPoint, 0.03) }
      ]).point
      snapshots.push(tick)
      const radians = Math.PI * tick / 30
      const expected: Point = [pivot[0] + Math.cos(radians), pivot[1], pivot[2] - Math.sin(radians)]
      maximumError = Math.max(maximumError, distance(feet, expected))
      const relative: Point = [feet[0] - pivot[0], feet[1] - pivot[1], feet[2] - pivot[2]]
      allTicksSupported &&= supports(localDeck, worldPoint(relative, [0, 0, 0], -yaw))
    }
    const final = route(feet, exit)
    const first = final.points[0]
    const last = final.points[final.points.length - 1]
    return check(allTicksSupported && maximumError < 1e-6 && final.status === 'complete' && first && last &&
      distance(first, [8, 2, 7]) <= 0.08 && distance(last, exit) <= 0.08,
    'All 15 moving-support snapshots were used despite concurrent native walk queries (' + snapshots.join(',') +
      '). The final route originates at the measured world contact.')
  })
}

function sideContact() {
  const wall = box('wall', 'obstacle', [0.25, 0, -0.6], [0.4, 1.4, 2.8])
  const floor = box('floor', 'surface', [-3, -0.2, -3], [3, 0, 8])
  function jump(hasWall: boolean) {
    let y = 0
    let velocity = 4.905
    let pose: Point = [0, 0, -0.6]
    let drivenByEdge = false
    for (let step = 1; step <= 6; step++) {
      const walk: Point = [0.01, 0, -0.6 + step / 10]
      if (hasWall && capsuleHits(pose, walk, wall)) drivenByEdge = true
      pose = [0, walk[1], walk[2]]
    }
    const validTakeoff = supports(floor, pose)
    let landings = 0
    let retriggerRequests = 0
    let extraImpulses = 0
    let ascentWallContacts = 0
    const ascent: number[] = []
    for (let tick = 1; tick <= 35; tick++) {
      // Request a second impulse after the first side contact while ascending.
      if (tick === 2) {
        retriggerRequests++
        if (supports(floor, pose)) {
          velocity = 4.905
          extraImpulses++
        }
      }
      const nextZ = tick / 10
      y += velocity / 30 - 4.905 / 900
      velocity -= 9.81 / 30
      const wanted: Point = [hasWall ? 0.01 : 0, y, nextZ]
      const hitWall = hasWall && capsuleHits(pose, wanted, wall)
      if (hitWall && velocity > 0) ascentWallContacts++
      const next: Point = [hitWall ? 0 : wanted[0], y, nextZ]
      const support = descendingSupport(pose, next, [floor])
      if (velocity >= 0) ascent.push(next[1])
      if (support) {
        landings++
        break
      }
      pose = next
    }
    return { ascent, landings, extraImpulses, ascentWallContacts, drivenByEdge, validTakeoff, retriggerRequests }
  }
  const contact = jump(true)
  const clear = jump(false)
  return check(contact.drivenByEdge && contact.ascentWallContacts > 0 && clear.ascentWallContacts === 0 &&
    [contact, clear].every((run) => run.validTakeoff && run.landings === 1 && run.retriggerRequests === 1 && run.extraImpulses === 0) &&
    contact.ascent.length === clear.ascent.length && contact.ascent.every((height, i) => {
      const t = (i + 1) / 30
      return height === clear.ascent[i] && Math.abs(height - (4.905 * t - 4.905 * t * t)) < 1e-7
    }),
  'The grounded run-up and upward sweep hit the wall. Midair retrigger was refused, the ascent matched independent ballistics, and exactly one genuine landing fired.')
}

function edgeLanding() {
  const deck = box('landing deck', 'surface', [2, 0.8, 0], [4, 1, 2])
  const fallback = box('lower deck', 'surface', [-1, -0.2, -2], [6, 0, 4])
  const desired: Point = [2.08, 1, 1]
  const top = [2.28, 1.1, 1] as const
  const edge = [1.80, 1.1, 1] as const
  const stop = (start: Point) => {
    let from = start
    let sideContacts = 0
    let nearTargetInAir = false
    for (let tick = 0; tick < 30; tick++) {
      const to: Point = [from[0], from[1] - 0.05, from[2]]
      const hit = descendingSupport(from, to, [deck, fallback])
      if (hit) return { ...hit, sideContacts, nearTargetInAir }
      nearTargetInAir ||= distance(to, desired) <= 0.35
      if (capsuleHits(from, to, deck)) {
        sideContacts++
        const slide: Point = [Math.min(from[0], 2 - BOT_RADIUS - 0.001), from[1], from[2]]
        if (distance(from, slide) > 0.06 || capsuleHits(from, slide, deck)) return undefined
        from = slide
        continue
      }
      from = to
    }
    return undefined
  }
  const grounded = stop(top)
  const grazing = stop(edge)
  return check(grounded?.surface === deck && grounded.nearTargetInAir && grounded.sideContacts === 0 && grazing?.surface === fallback &&
    grazing.sideContacts === 1 && grazing.nearTargetInAir && grazing.contact[1] === 0,
  'Both enter waypoint tolerance. The supported descent lands on the deck, while the observed side hit slides out and lands on the lower floor.')
}

function slideAlongWall() {
  const wall = box('side wall', 'obstacle', [0.25, 0, -2], [0.6, 2.4, 8])
  const direction: Point = [1 / Math.sqrt(26), 0, 5 / Math.sqrt(26)]
  const samples = [30, 60, 120].map((hz) => {
    let feet: Point = [0, 0, 0]
    let stepCount = 0
    let wallTicks = 0
    for (let i = 0; i < hz; i++) {
      const destination: Point = [feet[0] + 1 / hz, feet[1], feet[2] + 5 / hz]
      if (!capsuleHits(feet, destination, wall)) {
        feet = destination
      } else if (canStepUp(feet, direction, 0.3, 0.4, [wall])) {
        stepCount++
        feet = [destination[0], 0.3, destination[2]]
      } else {
        wallTicks++
        const slide: Point = [feet[0], feet[1], destination[2]]
        if (!capsuleHits(feet, slide, wall)) feet = slide
      }
    }
    return { feet, stepCount, wallTicks, hz }
  })
  return check(samples.every(({ feet, stepCount, wallTicks, hz }) =>
    wallTicks === hz && stepCount === 0 && distance(feet, [0, 0, 5]) <= 0.01),
  'At 30, 60 and 120 Hz, persistent side contact preserves 5 m of tangential displacement and never starts an autostep.')
}

function crampedAutostep() {
  const step = box('same step height', 'surface', [2, 0, -1], [3, 0.25, 1])
  const wallFor = (x: number) => box('barrier', 'obstacle', [x, 0.25, -1], [4, 2, 1])
  const from: Point = [1.75, 0, 0]
  const advanced: Point = [2.4, 0.25, 0]
  const attempt = (barrierX: number) => {
    // A full radius enters the step, then the controller requires 0.40 m of clear advance.
    const solids = [step, wallFor(barrierX)]
    return canStepUp(from, [1, 0, 0], 0.25, 0.25 + 0.4, solids) && supports(step, advanced)
      ? advanced : from
  }
  const cramped = attempt(2.45)
  const clear = attempt(2.95)
  return check(capsuleHits(from, [1.85, 0, 0], step) && distance(cramped, from) < 1e-8 &&
    distance(clear, advanced) < 1e-8,
  'Identical step heights. The short top refuses atomically; moving the barrier back admits a supported autostep.')
}

function animationCompletion() {
  const from: Point = [0.55, 0, 0]
  const raised: Point = [0.55, 1.45, 0]
  const aboveExit: Point = [2, raised[1], 0]
  const target: Point = [2, 1.2, 0]
  const lower = box('lower', 'surface', [-1, -0.2, -2], [1, 0, 2])
  const upper = box('upper', 'surface', [1.1, 1, -2], [4, 1.2, 2])
  const blocker = box('late obstacle', 'obstacle', [1.09, 1.2, -0.5], [1.32, 3.2, 0.5])
  function simulate(blocked: boolean, animationTick: number, orientationStalled = false) {
    let pose = from
    let animationDone = false
    let phase: 'moving' | 'returning' | 'finished' = 'moving'
    let finishedTick = 0
    let abortTick = 0
    let destinations = [raised, aboveExit, target]
    let maximumMovement = 0
    let yaw = 0
    const maxStep = 0.05
    for (let tick = 1; tick <= 150; tick++) {
      if (tick === animationTick) animationDone = true
      if (!orientationStalled && phase === 'moving') yaw = Math.min(90, yaw + 3)
      const destination = destinations[0]
      if (destination) {
        const next = advance(pose, destination, maxStep)
        const blockedNow = blocked && tick > 4
        if ([lower, upper, ...(blockedNow ? [blocker] : [])].some((shape) => capsuleHits(pose, next, shape))) {
          phase = 'returning'
          destinations = [raised, from]
          abortTick = tick
          continue
        }
        maximumMovement = Math.max(maximumMovement, distance(pose, next))
        pose = next
        if (next === destination) destinations.shift()
      } else if (phase === 'moving' && animationDone && supports(upper, pose) &&
          distance(target, pose) < 0.02 && Math.abs(yaw - 90) <= 1) {
        finishedTick = tick
        phase = 'finished'
        break
      } else if (phase === 'returning' && supports(lower, pose)) break
    }
    return { pose, maximumMovement, phase, finishedTick, abortTick }
  }
  const early = simulate(false, 3)
  const late = simulate(false, 100)
  const blocked = simulate(true, 3)
  const badDirection = simulate(false, 3, true)
  return check(early.phase === 'finished' && early.finishedTick > 3 && late.phase === 'finished' &&
    late.finishedTick >= 100 && blocked.phase === 'returning' && blocked.finishedTick === 0 &&
    blocked.abortTick > 3 && supports(lower, blocked.pose) &&
    badDirection.finishedTick === 0 && supports(upper, badDirection.pose) &&
    [early, late, blocked].every((run) => run.maximumMovement <= 0.050001),
  'Early/late clips cannot settle a mantle before position, facing and support match. A post-grab obstruction returns to safe ground without a snap.')
}

const lateCollider: CatalogCase['run'] = (backend) => {
  const from: Point = [4.5, 0.2, 5]
  const to: Point = [7, 0.2, 5]
  const floor = box('start', 'surface', [2, 0, 3], [5, 0.2, 7])
  const bakedTarget = box('landing', 'surface', [6.5, 0, 3], [9, 0.2, 7])
  const wrongHeight = box('wrong-height', 'surface', [6.5, 0, 3], [9, 0.5, 7])
  const mesh = createTraversalNavigator(backend, traversalSurfaces([floor, bakedTarget], 1.8), 0.25, 1.8,
    [{ from, to }], true)
  try {
    const routeAvailable = mesh.route(from, to).status === 'complete'
    const choose = (state: 'loading' | 'ready' | 'error', physicalCollider?: typeof bakedTarget) =>
      routeAvailable && state === 'ready' && physicalCollider !== undefined && supports(physicalCollider, to)
        ? 'jump' : 'wait-at-start'
    return check(routeAvailable && choose('loading') === 'wait-at-start' &&
      choose('error', bakedTarget) === 'wait-at-start' && choose('ready') === 'wait-at-start' &&
      choose('ready', wrongHeight) === 'wait-at-start' && choose('ready', bakedTarget) === 'jump',
    'A real pre-baked route exists. Synthetic SDK asset and collider signals independently gate launch; Explorer asset loading is outside this test.')
  } finally {
    mesh.dispose?.()
  }
}

function remoteAvatarHits() {
  type Hit = { id: number; layer: 'avatar' | 'world'; point: Point }
  type Probe = { sequence: number; hits: readonly Hit[] }
  const locations: readonly Point[] = [[4, 1, 5], [7, 1, 5]]
  const avatars: readonly Hit[] = locations.map((point) => ({ id: 0, layer: 'avatar', point }))
  const floor: Hit = { id: 12, layer: 'world', point: locations[0] }
  let newest: Probe = { sequence: 0, hits: [] }
  function receive(probe: Probe) {
    if (probe.sequence > newest.sequence) newest = probe
  }
  function blocked(mask: 'all' | 'world') {
    const visible = newest.hits.filter((hit) => mask === 'all' || hit.layer === 'world')
    return locations.map((location) =>
      visible.some((hit) => hit.layer === 'avatar' && distance(location, hit.point) < 0.4))
  }
  receive({ sequence: 1, hits: [...avatars, floor] })
  const initially = blocked('all')
  const geometryOnly = blocked('world')
  receive({ sequence: 3, hits: [avatars[1], floor] })
  receive({ sequence: 2, hits: [avatars[0], floor] })
  const latest = blocked('all')
  return check(initially.every(Boolean) && geometryOnly.every((value) => !value) &&
    newest.sequence === 3 && !latest[0] && latest[1],
  'Synthetic ray results use sample position and current sequence: duplicate remote-avatar ID 0 does not release the wrong landing zone.')
}

export const executionCases: CatalogCase[] = [
  { id: 'EXEC-T02', layer: 'controller', run: staleCompletion },
  { id: 'EXEC-T03', layer: 'controller', run: singleMotionWriter },
  { id: 'EXEC-T04', layer: 'integration', run: deferredWaypoint },
  { id: 'EXEC-T05', layer: 'integration', run: reversedLadder },
  { id: 'EXEC-T06', layer: 'integration', run: wideLanes },
  { id: 'EXEC-T09', layer: 'integration', run: rotatingSupport },
  { id: 'EXEC-T10', layer: 'controller', run: sideContact },
  { id: 'EXEC-T11', layer: 'controller', run: edgeLanding },
  { id: 'EXEC-T12', layer: 'controller', run: slideAlongWall },
  { id: 'EXEC-T13', layer: 'controller', run: crampedAutostep },
  { id: 'EXEC-T15', layer: 'controller', run: animationCompletion },
  { id: 'SDK-T02', layer: 'integration', coverage: 'adapted', run: lateCollider },
  { id: 'SDK-T03', layer: 'controller', coverage: 'adapted', run: remoteAvatarHits }
]
