import type { Point } from '../../src/arena'
import { advance, capsuleHits, supports } from '../../src/traversal/fixtures/mantles-support'
import { createTraversalNavigator, traversalSurfaces } from '../sdk-detour-probe/traversal-routing'
import { canStepUp, descendingSupport, distance, resolveMotion, worldPoint } from './execution-support'
import { box, check, type CatalogCase } from './types'

function staleCompletion() {
  type Ticket = { id: number; generation: number; attempt: number }
  type Actor = { ticket: Ticket; slot: string; route: string; x: number }
  const actors = new Map<number, Actor>()
  const ended = new Map<Ticket, 'abort' | 'finish'>()
  const ownership = new Map<string, Ticket>()

  function start(generation: number, attempt: number, slot: string, route: string) {
    const ticket = { id: 7, generation, attempt }
    actors.set(ticket.id, { ticket, slot, route, x: 0 })
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

  const removed = start(1, 1, 'climb', 'old-goal')
  const removeAbort = terminate(removed, 'abort')
  actors.delete(removed.id)
  const replacement = start(2, 1, 'ladder', 'other-goal')
  const oldCompletion = terminate({ ...removed }, 'finish')
  const other = actors.get(replacement.id)
  const replacementIntact = other?.x === 0 && other.route === 'other-goal' && ownership.get('ladder') === replacement
  const teleportAbort = terminate(replacement, 'abort')
  const teleported = start(2, 2, 'climb', 'teleport-goal')
  const oldAttemptCompletion = terminate({ ...replacement }, 'finish')
  const teleportIntact = actors.get(teleported.id)?.x === 0 && ownership.get('climb') === teleported
  const validCompletion = terminate({ ...teleported }, 'finish')
  const duplicateCompletion = terminate({ ...teleported }, 'finish')

  return check(removeAbort && teleportAbort && !oldCompletion && !oldAttemptCompletion && !duplicateCompletion &&
    replacementIntact && teleportIntact && validCompletion && ownership.size === 0 &&
    [...ended.values()].join(',') === 'abort,abort,finish',
  'Generation and attempt survive ID reuse and teleport. Terminal outcomes are abort, abort, finish.')
}

function singleMotionWriter() {
  const blocker = box('arrival-blocker', 'obstacle', [2.6, 0, -0.3], [2.7, 1.8, 0.3])
  const dt = 1 / 30
  function simulate(blocked: boolean, previousAvoidance: boolean) {
    let pose: Point = [0, 0, 0]
    let transitioning = true
    let avoidance = false
    let finish = 0
    let abort = 0
    let foreignMovement = 0
    let nextTickOwner = ''
    for (let tick = 1; tick <= 31; tick++) {
      const t = tick * dt
      const otherX = 3 - 3 * t
      const walk: Point = [pose[0] + 2 * dt, pose[1], Math.abs(pose[0] - otherX) < 0.6 ? pose[2] + 0.1 : pose[2]]
      const transition: Point = [3 * t, Math.max(4 * t * (1 - t), 0), 0]
      const aborting = transitioning && blocked && capsuleHits(pose, transition, blocker)
      const commit = resolveMotion(transitioning ? 'transition' : 'walk', [
        { owner: 'walk', point: walk }, { owner: 'transition', point: aborting ? pose : transition }
      ])
      pose = commit.point
      if (aborting) {
        transitioning = false
        avoidance = previousAvoidance
        abort++
        continue
      }
      if (!transitioning) {
        nextTickOwner = commit.owner
        break
      }
      if (pose[2] !== 0 || Math.abs(pose[0] - 3 * t) > 1e-8 || avoidance) foreignMovement++
      if (tick === 30) {
        transitioning = false
        avoidance = previousAvoidance
        finish++
      }
    }
    return { finish, abort, avoidance, foreignMovement, nextTickOwner }
  }
  const success = simulate(false, true)
  const failure = simulate(true, true)
  const originallyOff = simulate(false, false)
  return check(success.finish === 1 && success.abort === 0 && failure.finish === 0 && failure.abort === 1 &&
    [success, failure, originallyOff].every((run) => run.nextTickOwner === 'walk' && run.foreignMovement === 0) &&
    success.avoidance && failure.avoidance && !originallyOff.avoidance,
  'The jump owns motion across 30 ticks, including when the nearby follower steers. Walk resumes with the previous avoidance setting on both exits.')
}

function deferredWaypoint() {
  let depth = 0
  let maxDepth = 0
  let pathGoal = 'old'
  const committed = new Set<string>()
  const pending: (() => void)[] = []
  const trace: string[] = []

  function query() {
    trace.push('query ' + pathGoal)
  }

  function process(id: string) {
    if (committed.has(id) || depth > 0) return
    depth++
    maxDepth = Math.max(maxDepth, depth)
    // The listener asks for a new target path while the waypoint is being dispatched.
    pending.push(() => { pathGoal = 'new'; query() })
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
  return check(maxDepth === 1 && pending.length === 0 && pathGoal === 'new' &&
    trace.join(',') === 'start ladder,query new',
  'Repeated and reentrant waypoint signals produced one start and one query after the event committed.')
}

const reversedLadder: CatalogCase['run'] = (backend) => {
  const origin: Point = [8, 0, 8]
  const from = worldPoint([0, 0, 0], origin, 60)
  const to = worldPoint([0, 2, 0.4], origin, 60)
  const lower = box('lower', 'surface', [5, -0.15, 5], [11, 0, 11])
  const upper = box('upper', 'surface', [5, 1.85, 5], [11, 2, 11])
  const surfaces = traversalSurfaces([lower, upper], 1.6)
  const navigator = createTraversalNavigator(backend, surfaces, 0.25, 1.6, [{ from, to, bidirectional: true }], true)
  try {
    const expectedUpper: Point = [8.34641016, 2, 8.2]
    const up = navigator.route(from, to)
    const down = navigator.route(to, from)
    const matches = (path: typeof up, start: Point, end: Point) => path.status === 'complete' &&
      path.points.length >= 2 && distance(path.points[0], start) < 0.16 &&
      distance(path.points[path.points.length - 1], end) < 0.16
    return check(distance(to, expectedUpper) < 1e-6 && matches(up, origin, expectedUpper) &&
      matches(down, expectedUpper, origin),
    'One rotated bidirectional link reports world endpoints in opposite order on ascending and descending routes.')
  } finally {
    navigator.dispose?.()
  }
}

const wideLanes: CatalogCase['run'] = (backend) => {
  const near = box('near lip', 'surface', [3, 0.8, 3], [9, 1, 6])
  const far = box('far lip', 'surface', [3.4, 0.8, 8], [9.4, 1, 11])
  const centre = box('temporary obstacle', 'obstacle', [5.8, 1, 8], [6.9, 2.8, 9])
  const completeBlock = box('all lanes blocked', 'obstacle', [3.4, 1, 8], [9.4, 2.8, 9])
  const samples = [0.2, 0.5, 0.8].map((t) => ({
    from: [4 + 4 * t, 1, 5.6] as Point,
    to: [4.4 + 4 * t, 1, 8.6] as Point
  }))
  const allowed = (block: typeof centre) => samples.filter(({ to }) => !capsuleHits(to, to, block))
  const lanes = allowed(centre)
  const closedLanes = allowed(completeBlock)
  const open = createTraversalNavigator(backend, traversalSurfaces([near, far, centre], 1.8), 0.25, 1.8, lanes, true)
  const closed = createTraversalNavigator(backend, traversalSurfaces([near, far, completeBlock], 1.8), 0.25, 1.8, closedLanes, true)
  try {
    const routeStarts = [[4.8, 1, 4], [7.2, 1, 4]] as const
    const routeGoals = [[5.2, 1, 10], [7.6, 1, 10]] as const
    const crossXs = routeStarts.map((start, i) => {
      const route = open.route(start, routeGoals[i])
      if (route.status !== 'complete') return NaN
      for (let j = 1; j < route.points.length; j++) {
        const [ax, , az] = route.points[j - 1]
        const [bx, , bz] = route.points[j]
        if (az < 7 && bz > 7) return ax + (bx - ax) * (7 - az) / (bz - az)
      }
      return NaN
    })
    return check(lanes.length === 2 && closedLanes.length === 0 && crossXs[0] < 5.6 && crossXs[1] > 7 &&
      crossXs[1] - crossXs[0] > 2 * 0.25 &&
      routeStarts.every((start, i) => closed.route(start, routeGoals[i]).status === 'unreachable'),
    'Segment transition adapter samples matched lanes, rejects the blocked middle and the full-width closure. Native point links provide the two routes.')
  } finally {
    closed.dispose?.()
    open.dispose?.()
  }
}

function rotatingSupport() {
  const pivot: Point = [8, 2, 8]
  const footOffset: Point = [1, 0, 0]
  let feet = worldPoint(footOffset, pivot, 0)
  let snapshotUsed = -1
  let maximumError = 0
  let allTicksSupported = true
  let routeOrigin: Point | undefined
  const localDeck = box('deck in platform space', 'surface', [-2, -0.2, -2], [2, 0, 2])
  for (let tick = 0; tick <= 15; tick++) {
    snapshotUsed = tick
    const yaw = 6 * snapshotUsed
    const world = worldPoint(footOffset, pivot, yaw)
    feet = resolveMotion('platform', [
      { owner: 'platform', point: world },
      { owner: 'walk', point: [feet[0] + 0.03, feet[1], feet[2]] }
    ]).point
    const radiusError = Math.abs(Math.hypot(feet[0] - 8, feet[2] - 8) - 1)
    const headingError = Math.abs(Math.atan2(8 - feet[2], feet[0] - 8) - (Math.PI / 2) * tick / 15)
    maximumError = Math.max(maximumError, radiusError, headingError, Math.abs(feet[1] - 2))
    const relative: Point = [feet[0] - pivot[0], feet[1] - pivot[1], feet[2] - pivot[2]]
    allTicksSupported &&= supports(localDeck, worldPoint(relative, [0, 0, 0], -yaw))
    if (tick === 15) routeOrigin = feet
  }
  return check(snapshotUsed === 15 && allTicksSupported && maximumError < 1e-6 &&
    routeOrigin !== undefined && distance(routeOrigin, [8, 2, 7]) < 1e-6,
  'The local foot anchor keeps its one-metre radius for 15 ticks and the replan starts at the rotated world position.')
}

function sideContact() {
  const wall = box('wall', 'obstacle', [0.25, 0, 0], [0.4, 1.4, 2.8])
  const floor = box('floor', 'surface', [-3, -0.2, -3], [3, 0, 8])
  function jump(hasWall: boolean) {
    let y = 0
    let velocity = 4.905
    let pose: Point = [0, 0, 0]
    let landings = 0
    let extraImpulses = 0
    let blocked = false
    const ascent: number[] = []
    for (let tick = 1; tick <= 35; tick++) {
      const nextZ = tick / 10
      y += velocity / 30 - 4.905 / 900
      velocity -= 9.81 / 30
      const wanted: Point = [hasWall ? 0.01 : 0, y, nextZ]
      const hitWall = hasWall && capsuleHits(pose, wanted, wall)
      blocked ||= hitWall
      const next: Point = [hitWall ? 0 : wanted[0], y, nextZ]
      const support = descendingSupport(pose, next, [floor])
      if (tick === 5 && support) extraImpulses++
      if (velocity >= 0) ascent.push(next[1])
      if (support) {
        landings++
        break
      }
      pose = next
    }
    return { ascent, landings, extraImpulses, blocked }
  }
  const contact = jump(true)
  const clear = jump(false)
  return check(contact.blocked && contact.landings === 1 && clear.landings === 1 && contact.extraImpulses === 0 &&
    contact.ascent.length === clear.ascent.length && contact.ascent.every((height, i) => height === clear.ascent[i]),
  'A lateral obstruction removed horizontal pressure without changing the ascent, resetting the jump or counting a landing.')
}

function edgeLanding() {
  const deck = box('landing deck', 'surface', [2, 0.8, 0], [4, 1, 2])
  const fallback = box('lower deck', 'surface', [-1, -0.2, -2], [6, 0, 4])
  const desired: Point = [2.3, 1, 1]
  const top = [2.28, 1.1, 1] as const
  const edge = [2.11, 1.1, 1] as const
  const stop = (start: Point) => {
    let from = start
    for (let tick = 0; tick < 30; tick++) {
      const to: Point = [from[0], from[1] - 0.05, from[2]]
      const hit = descendingSupport(from, to, [deck, fallback])
      if (hit) return hit
      from = to
    }
    return undefined
  }
  const grounded = stop(top)
  const grazing = stop(edge)
  return check(distance(edge, desired) < 0.35 && capsuleHits([1.8, 0.96, 1], [2.11, 0.96, 1], deck) &&
    grounded?.surface === deck && grazing?.surface === fallback && grazing.contact[1] === 0,
  'The edge is inside waypoint tolerance and touches the capsule, but only a complete foot contact ends the jump on the upper deck.')
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
  { id: 'EXEC-T04', layer: 'controller', run: deferredWaypoint },
  { id: 'EXEC-T05', layer: 'planner', run: reversedLadder },
  { id: 'EXEC-T06', layer: 'planner', run: wideLanes },
  { id: 'EXEC-T09', layer: 'controller', run: rotatingSupport },
  { id: 'EXEC-T10', layer: 'controller', run: sideContact },
  { id: 'EXEC-T11', layer: 'controller', run: edgeLanding },
  { id: 'EXEC-T12', layer: 'controller', run: slideAlongWall },
  { id: 'EXEC-T13', layer: 'controller', run: crampedAutostep },
  { id: 'EXEC-T15', layer: 'controller', run: animationCompletion },
  { id: 'SDK-T02', layer: 'integration', run: lateCollider },
  { id: 'SDK-T03', layer: 'controller', run: remoteAvatarHits }
]
