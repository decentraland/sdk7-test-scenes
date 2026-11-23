import type { Point, Surface } from '../../src/arena'
import type { TraversalShape } from '../../src/traversal/types'
import { advance, capsuleHits, supports } from '../../src/traversal/fixtures/mantles-support'
import { box, check, type CatalogCase } from './types'
import { close, flight, floor, top, withNavigator } from './advanced-actions-support'

const noGround: Point = [0, 0, 0]
const controller = (id: string, run: () => ReturnType<typeof check>): CatalogCase => ({ id, layer: 'controller', run })
const integration = (id: string, run: CatalogCase['run']): CatalogCase => ({ id, layer: 'integration', run })

const landingOvershoot = integration('GAME-T02', (backend) => {
  const upper = floor('target', 2.8, 0, 0, 0.65)
  const lower = floor('lower', 5.5, -1.2, 0, 3)
  const supported = flight({ position: noGround, velocity: [3.5, 4, 0], floors: [upper, lower] })
  const overshot = flight({ position: noGround, velocity: [5, 4, 0], floors: [upper, lower] })
  const aboveTarget = overshot.trace.some(({ position: [x, y] }) => x >= 2.7 && x <= 2.9 && y > 0.25)
  const safeExit: Point = [6, top(lower), 0]
  const found = withNavigator(backend, [upper, lower], 0.1, 0.3, [], (route) =>
    route(overshot.contact.position, safeExit).status === 'complete' &&
    route(supported.contact.position, safeExit).status === 'unreachable')
  return check(supported.support === upper.id && overshot.support === lower.id && aboveTarget && found,
    'Only descending foot contact completed the jump. Replan started at the measured lower support.')
})

type Pad = { id: string; x: number; z: number; radius: number }
const firstPad: Pad = { id: 'launch-a', x: 2, z: 0, radius: 0.25 }
const secondPad: Pad = { id: 'launch-b', x: 4.8, z: 0, radius: 0.3 }

function touchesPad([x, y, z]: Point, pad: Pad) {
  return Math.abs(y) <= 0.001 && Math.hypot(x - pad.x, z - pad.z) <= pad.radius
}

function launchGate(pad: Pad) {
  let consumed = false
  let launches = 0
  let pending = true
  return {
    touch(id: string, position: Point) {
      if (consumed || id !== pad.id || !touchesPad(position, pad)) return
      consumed = true
      pending = false
      launches++
      return [3.5, 4, 0] as const
    },
    read: () => ({ launches, pending })
  }
}

const padContact = controller('GAME-T04', () => {
  function approach(z: number, repetitions: number) {
    const pad = launchGate(firstPad)
    let firstTriggerX = Infinity
    let visualArrival = false
    for (let i = 0; i <= 220; i++) {
      const x = i / 100
      const position: Point = [x, 0, z]
      if (Math.hypot(x - firstPad.x, z) <= 0.6) {
        if (!visualArrival && !pad.read().pending) return false
        visualArrival = true
      }
      pad.touch(secondPad.id, position)
      for (let attempt = 0; attempt < repetitions; attempt++) {
        const impulse = pad.touch(firstPad.id, position)
        if (impulse) firstTriggerX = Math.min(firstTriggerX, x)
      }
    }
    if (z > firstPad.radius) return visualArrival && pad.read().pending && pad.read().launches === 0
    return visualArrival && firstTriggerX >= 1.8 && !pad.read().pending && pad.read().launches === 1
  }
  return check(approach(0.35, 1) && approach(0.20, 1) && approach(0.20, 2),
    'A 10 cm miss did not fire. The matching physical pad fired once even with repeated events.')
})

type Step = { id: string; kind: 'waypoint' | 'action' }
function consumeObservedAction(steps: readonly Step[], cursor: number, action: string) {
  const reached = steps.findIndex((step, i) => i >= cursor && step.id === action && step.kind === 'action')
  if (reached < 0 || steps.slice(cursor, reached).some((step) => step.kind === 'action')) return cursor
  return reached + 1
}

const jumpPadSkips = controller('GAME-T05', () => {
  const impulse = launchGate(firstPad).touch('launch-a', [2, 0, 0])
  if (!impulse) return check(false, 'First physical launch did not fire.')
  const destination = floor('launch-b', secondPad.x, 0, 0, 0.9)
  const travel = flight({ position: [firstPad.x, 0, 0], velocity: impulse, floors: [destination] })
  const normal: Step[] = [
    { id: firstPad.id, kind: 'action' }, { id: 'walk-a', kind: 'waypoint' },
    { id: 'walk-b', kind: 'waypoint' }, { id: secondPad.id, kind: 'action' }, { id: 'finish', kind: 'waypoint' }
  ]
  const mandatory = normal.map((item, index): Step => index === 2 ? { id: 'switch', kind: 'action' } : item)
  const consumed = consumeObservedAction(normal, 0, firstPad.id)
  const observed = travel.support ?? ''
  const delivered = consumeObservedAction(normal, consumed, observed)
  const guarded = consumeObservedAction(mandatory, consumed, observed)
  const replan = mandatory.slice(guarded).find((step) => step.kind === 'action')
  return check(touchesPad(travel.contact.position, secondPad) && delivered === 4 && guarded === 1 &&
    replan?.id === 'switch' && consumeObservedAction(mandatory, guarded, firstPad.id) === guarded,
  'Physical arrival can consume the second pad past waypoints. It cannot consume a skipped switch or replay the first pad.')
})

const sidewaysLanding = integration('GAME-T06', (backend) => {
  const roofs = [
    floor('left', 3.3, -0.35, -1.4, 1.8, 0.98),
    floor('target', 3.84, 0, 0, 2.44, 0.98),
    floor('right', 3.3, -0.35, 1.4, 1.8, 0.98)
  ]
  const slopes: Surface[] = [-1.4, 1.4].map((z) => ({
    vertices: [[4.2, -0.35, z - 0.49], [4.2, -0.35, z + 0.49], [5, 0, z + 0.49], [5, 0, z - 0.49]],
    triangles: [0, 1, 2, 0, 2, 3]
  }))
  const bridge = floor('return-catwalk', 5.4, 0, 0, 0.8, 4)
  const goal: Point = [3.4, 0, 0]
  const runs = [-1, 0, 1].map((direction) => {
    let displaced = false
    return flight({
      position: noGround, velocity: [3.5, 4, 0], floors: roofs,
      beforeStep(state) {
        if (displaced || state.time < 0.15 - 1e-8) return
        displaced = true
        return { velocity: [state.velocity[0], state.velocity[1], direction * 2.1] }
      }
    })
  })
  const ordered = runs.map(({ support }) => support).join(',') === 'left,target,right'
  const maxMovement = Math.max(...runs.flatMap(({ trace }) => trace.slice(1).map(({ position }, i) =>
    Math.hypot(...position.map((n, k) => n - trace[i].position[k])))))
  const recoveryPaths = withNavigator(backend, [...roofs, bridge], 0.12, 0.4, [], (route) =>
    [route(runs[0].contact.position, goal), route(runs[2].contact.position, goal)], slopes)
  const recoverable = recoveryPaths.every((result) =>
    result.status === 'complete' && result.points.some(([x]) => x > 4.8) &&
    (result.points[0]?.[1] ?? 1) < -0.20 && Math.abs(result.points[result.points.length - 1]?.[1] ?? -1) < 0.15)
  const observed = runs.map(({ support }) => support ?? 'miss').join('/') + ', ' +
    recoveryPaths.map(({ status, points }) => status + ':' + points.length).join('/')
  return check(ordered && maxMovement < 0.06 && recoverable,
    'Touchdowns and routes around the gap: ' + observed)
})

const staminaAtLip = controller('GAME-T07', () => {
  const target = floor('jump-goal', 2.8, 0, 0)
  const cost = 0.4
  function attempt(beforeSprint: number, regen: number) {
    let stamina = beforeSprint - 0.3
    let elapsed = 0.3
    let launches = 0
    const waitStates: { time: number; position: Point; goal: string }[] = []
    while (stamina < cost && elapsed < 0.5) {
      waitStates.push({ time: elapsed, position: noGround, goal: target.id })
      stamina += regen / 120
      elapsed += 1 / 120
    }
    if (stamina < cost) return { launches, waitStates, action: 'detour' }
    stamina -= cost
    launches++
    const action = flight({ position: noGround, velocity: [3.5, 4, 0], floors: [target] }).support
    return { launches, waitStates, action, stamina }
  }
  const insufficient = attempt(0.69, 0)
  const enough = attempt(0.71, 0)
  const recovered = attempt(0.69, 0.25)
  return check(insufficient.launches === 0 && insufficient.action === 'detour' &&
    enough.launches === 1 && enough.waitStates.length === 0 && enough.action === target.id &&
    recovered.launches === 1 && recovered.waitStates.length > 1 && recovered.action === target.id &&
    recovered.waitStates.every(({ position, goal }) => position === noGround && goal === target.id),
  'Sprint spent the planned stamina. The takeoff guard rejected, waited on the ledge, or consumed exactly one jump.')
})

function scanMantleExit(
  ledge: TraversalShape, entry: Point, normalY: number, solids: readonly TraversalShape[]
): Point | undefined {
  if (normalY < Math.cos(Math.PI / 5)) return
  for (let offset = 0; offset <= ledge.size[0]; offset += 0.02) {
    const candidate: Point = [entry[0] + offset, top(ledge), entry[2]]
    if (supports(ledge, candidate) && !solids.some((shape) => capsuleHits(candidate, candidate, shape))) {
      return candidate
    }
  }
}

const footPlacement = controller('GAME-T09', () => {
  const feet: Point = [0.69, 0, 0]
  const hand: Point = [1.02, 1.23, 0]
  const ledge = floor('shallow-ledge', 1.28, 1.22, 0, 0.56, 0.7)
  const backWall = box('back-wall', 'obstacle', [1.4, 1.22, -0.35], [1.8, 2.9, 0.35])
  const original: Point = [1.12, top(ledge), 0]
  const grip = Math.hypot(hand[0] - feet[0], hand[1] - (feet[1] + 1.2), hand[2] - feet[2]) <= 0.37
  const plain = grip ? scanMantleExit(ledge, original, 1, []) : undefined
  const slope = grip ? scanMantleExit(ledge, original, Math.cos(Math.PI / 3), []) : undefined
  const blocked = grip ? scanMantleExit(ledge, original, 1, [backWall]) : undefined
  const abortPose = (landing: Point | undefined) => landing ?? feet
  return check(grip && !supports(ledge, original) && plain !== undefined && supports(ledge, plain) &&
    plain[0] >= 1.25 && plain[0] <= 1.31 && abortPose(slope) === feet && abortPose(blocked) === feet,
  'The hand pose reached all three profiles. Foot placement corrected onto the narrow flat shelf, then rejected the slope and rear wall.')
})

function grasp(foot: Point, ledge: Point, headingSpeed: number) {
  const hand: Point = [foot[0] + 0.4, foot[1] + 1.23, foot[2]]
  return headingSpeed > 0.25 && Math.hypot(...hand.map((value, i) => value - ledge[i])) < 0.11
}

function plantAfterGrip(foot: Point, ledge: TraversalShape) {
  const exit: Point = [ledge.center[0], top(ledge), ledge.center[2]]
  const raised: Point = [foot[0], top(ledge) + 0.13, foot[2]]
  const above: Point = [exit[0], raised[1], exit[2]]
  return !capsuleHits(foot, raised, ledge) && !capsuleHits(raised, above, ledge) &&
    !capsuleHits(above, exit, ledge) && supports(ledge, exit)
}

const apexMantle = controller('GAME-T10', () => {
  const high = floor('high-ledge', 2.35, 2.02, 0, 0.9)
  const low = floor('low-ledge', 2.35, 1.23, 0, 0.9)
  const highArc = flight({ position: noGround, velocity: [3.75, 4, 0], floors: [], limit: 0.55 }).trace
  function replay(tick: number, slide = false) {
    const states = ['approach', 'takeoff']
    const { position } = highArc[tick]
    if (grasp(position, [1.9, top(high), 0], slide ? 0.1 : 3.75)) {
      states.push('grab', 'mantle')
      if (plantAfterGrip(position, high)) states.push('planted')
    }
    return states.join('/')
  }
  const lowStart: Point = [1.5, 0, 0]
  const lowMantle = grasp(lowStart, [1.9, top(low), 0], 2) && plantAfterGrip(lowStart, low)
  return check(lowMantle && replay(48) === 'approach/takeoff/grab/mantle/planted' &&
    replay(40) === 'approach/takeoff' && replay(56) === 'approach/takeoff' && replay(48, true) === 'approach/takeoff',
  'The low barrier accepted a running grab. The high grab was in range at the apex, outside range two 30 Hz ticks earlier/later.')
})

const vaultSlideJump = controller('GAME-T11', () => {
  const ledge = floor('mantle-over', 1.69, 0.45, 0, 0.82)
  const beam = box('slide-beam', 'obstacle', [2.5, 1.16, -0.6], [3.93, 1.4, 0.6])
  const landing = floor('far-floor', 7.2, 0, 0, 0.65)
  const lip = 4.8
  function execute(brake: boolean) {
    if (!plantAfterGrip([0.8, 0, 0], ledge)) return { moves: [], speed: 0, support: undefined }
    const moves = ['mantle', 'slide']
    let speed = 3
    let standing = false
    for (let x = 2.05; x < lip - 0.001; x += 0.01) {
      const feet: Point = [x, 0, 0]
      const inBeam = Math.abs(x - beam.center[0]) <= beam.size[0] / 2 + 0.25
      if (inBeam && !standing && feet[1] + 0.9 > beam.center[1] - beam.size[1] / 2) {
        return { moves, speed, support: undefined }
      }
      const canStand = !capsuleHits(feet, feet, beam)
      if (!standing && canStand && x > beam.center[0]) {
        standing = true
        moves.push('stand')
      }
      if (brake && x >= 4.30) speed = Math.sqrt(Math.max(0, speed * speed - 8 * 0.01))
    }
    const from: Point = [lip, 0, 0]
    const estimate = flight({ position: from, velocity: [speed, 4, 0], floors: [landing] })
    if (!standing || !estimate.support) return { moves, speed, support: undefined }
    moves.push('jump', 'land')
    return { moves, speed, support: estimate.support }
  }
  const carried = execute(false)
  const slowed = execute(true)
  return check(carried.moves.join('/') === 'mantle/slide/stand/jump/land' && carried.support === landing.id &&
    slowed.moves.join('/') === 'mantle/slide/stand' && slowed.speed < carried.speed && !slowed.support,
  'The low beam delays standing. A late brake preserves standing clearance but leaves too little momentum for the final gap.')
})

const wallRun = integration('GAME-T12', (backend) => {
  const far = floor('far-deck', 7.1, 0, 0, 1.5, 1.5)
  function execute(angle: number, side: number, completeWall: boolean, airborne = true) {
    const phase = { current: 'jump' as 'jump' | 'wall-run' | 'release' | 'missed' }
    const transitions: string[] = []
    const yaw = angle * Math.PI / 180
    const motion = flight({
      position: noGround, velocity: [4 * Math.cos(yaw), airborne ? 4 : 0, side * 4 * Math.sin(yaw)], floors: [far],
      beforeStep({ position: [x, y, z], velocity: [vx, vy, vz] }) {
        if (phase.current === 'jump' && Math.abs(z) >= 0.85) {
          if (x < 1.1 || x > 3.9 || y < 0.25 || Math.abs(vz) > vx) {
            phase.current = 'missed'
            return
          }
          phase.current = 'wall-run'
          transitions.push('contact')
        }
        if (phase.current !== 'wall-run') return
        if (!completeWall && x >= 2.20 && x < 2.8) {
          phase.current = 'missed'
          transitions.push('lost-wall')
          return
        }
        if (x >= 3.9) {
          phase.current = 'release'
          transitions.push('kick')
          return { velocity: [4, 3, -side] }
        }
        return { velocity: [4, 0, 0], gravity: 0 }
      }
    })
    return { transitions: transitions.join('/'), support: motion.support }
  }
  const direct = flight({ position: noGround, velocity: [4, 4, 0], floors: [far] })
  const positive = execute(30, 1, true)
  const mirrored = execute(30, -1, true)
  const broken = execute(30, 1, false)
  const detour = [
    floor('near', 0.30, 0, -1.0, 1.8, 3.2),
    floor('walkaround', 3.5, 0, -2.0, 8.4, 0.95),
    floor('far-path', 7.1, 0, -1.0, 1.45, 3.2),
    far
  ]
  const fallback = withNavigator(backend, detour, 0.12, 0.4, [], (route) => {
    const result = route(noGround, [7.1, 0, 0])
    return result.status === 'complete' && result.points.some(([, , z]) => z < -1.55)
  })
  return check(!direct.support && positive.transitions === 'contact/kick' && positive.support === far.id &&
    mirrored.transitions === positive.transitions && mirrored.support === far.id &&
    broken.transitions === 'contact/lost-wall' && !broken.support && !execute(10, 1, true).support &&
    !execute(50, 1, true).support && !execute(30, 1, true, false).transitions && fallback,
  'Only an airborne oblique contact on a continuous wall reached the deck. With the shortcut rejected, the planner found the walkaround.')
})

const earlyLadder = integration('GAME-T14', (backend) => {
  const ladders = [{ id: 'a', x: 0 }, { id: 'b', x: 1.2 }]
  const exits = ladders.map(({ id, x }) => floor('exit-' + id, x, 0, 0, 0.95))
  function descend(initial: Point, planned: string, speedY: number) {
    const actual = ladders.find(({ x }) => Math.abs(initial[0] - x) <= 0.26 && Math.abs(initial[2]) <= 0.2)
    if (!actual || speedY >= 0) return { phase: 'approach', exit: undefined, replan: false }
    let feet = initial
    while (feet[1] > 0) feet = advance(feet, [actual.x, 0, 0], Math.abs(speedY) / 60)
    const exit = exits.find((surface) => supports(surface, feet, 0.12))
    return { phase: actual.id === planned ? 'descend' : 'safe-exit', exit: exit?.id, replan: actual.id !== planned, feet }
  }
  const match = descend([0, 2.8, 0], 'a', -1.7)
  const unexpected = descend([1.2, 2.8, 0], 'a', -1.7)
  const wrongWay = descend([0, 2.8, 0], 'a', 1.7)
  const recovery = withNavigator(backend, exits, 0.12, 0.4, [], (route) =>
    unexpected.feet !== undefined && route(unexpected.feet, [1.2, 0, 0.25]).status === 'complete' &&
    route(unexpected.feet, [0, 0, 0]).status === 'unreachable')
  return check(match.phase === 'descend' && !match.replan && match.exit === 'exit-a' &&
    unexpected.phase === 'safe-exit' && unexpected.replan && unexpected.exit === 'exit-b' &&
    wrongWay.phase === 'approach' && recovery,
  'Early attachment took over only the matching descending route. A wrong ladder resolved to its own reachable exit.')
})

const retryCooldown = controller('GAME-T16', () => {
  const goal = floor('short-jump', 2.8, 0, 0, 0.7)
  const history = new Map<string, { revision: number; failures: number; expires: number }>()
  function attempt(agent: string, revision: number, now: number, vx: number) {
    const key = agent + ':' + goal.id
    const record = history.get(key)
    const active = record?.revision === revision && record.expires > now ? record : { revision, failures: 0, expires: now + 5 }
    if (active.failures >= 3) return 'walk-detour'
    const route = flight({ position: noGround, velocity: [vx, 4, 0], floors: [goal] })
    if (!route.support) {
      history.set(key, { ...active, failures: active.failures + 1 })
      return 'miss'
    }
    history.delete(key)
    return 'arrived'
  }
  const outcomes = [0, 1, 2, 3].map((now) => attempt('a', 1, now, 1.8))
  const second = attempt('b', 1, 3, 3.5)
  const validForRevision = attempt('a', 2, 4, 3.5)
  const retryAfterExpiry = [0, 1, 2].every((_, n) => attempt('c', 1, n, 1.8) === 'miss') &&
    attempt('c', 1, 4, 3.5) === 'walk-detour' && attempt('c', 1, 6, 3.5) === 'arrived'
  return check(outcomes.join('/') === 'miss/miss/miss/walk-detour' && second === 'arrived' &&
    validForRevision === 'arrived' && retryAfterExpiry,
  'Three measured misses vetoed the link for that bot only. Another bot, a new mesh revision and expired cooldown retained access.')
})

const timedRetry = controller('GAME-T17', () => {
  const start = floor('before-fence', 0.95, 0, 0, 3, 2.1)
  const ledge = floor('fence-top', 1.44, 0.6, 0, 0.7, 0.7)
  function execute(contacts: readonly boolean[]) {
    let feet: Point = [0.32, 0, 0]
    let elapsed = 0
    let slips = 0
    for (const frictionSufficient of contacts.slice(0, 2)) {
      const raised: Point = [feet[0], top(ledge) + 0.1, feet[2]]
      elapsed += 0.45
      if (capsuleHits(feet, raised, ledge)) return { valid: false, elapsed, slips }
      if (frictionSufficient && plantAfterGrip(feet, ledge)) {
        feet = [ledge.center[0], top(ledge), ledge.center[2]]
        return { valid: supports(ledge, feet), elapsed, slips, usedDetour: false }
      }
      slips++
      elapsed += 0.25
      if (!supports(start, feet)) return { valid: false, elapsed, slips }
    }
    const around: Point[] = [[0.32, 0, 0.75], [2.20, 0, 0.75]]
    for (const waypoint of around) {
      if (!supports(start, waypoint) || capsuleHits(feet, waypoint, ledge)) return { valid: false, elapsed, slips }
      elapsed += Math.hypot(waypoint[0] - feet[0], waypoint[2] - feet[2]) / 2
      feet = waypoint
    }
    return { valid: true, elapsed, slips, usedDetour: true }
  }
  const success = execute([false, true])
  const fallback = execute([false, false])
  return check(success.valid && success.slips === 1 && !success.usedDetour && close(success.elapsed, 1.15) &&
    fallback.valid && fallback.slips === 2 && fallback.usedDetour === true && close(fallback.elapsed, 2.715),
  'A forced slip consumed movement time on the original support. A finite retry budget forced the verified side passage.')
})

const fasterFall = controller('TALK-T02', () => {
  const shelf = floor('target', 4, 0, 0, 0.8)
  const bottom = floor('below', 3.5, -0.6, 0, 3)
  const shapes = [shelf, bottom]
  const cache = new Map<string, ReturnType<typeof flight>>()
  let queries = 0
  function query(descendingGravity: number, meshRevision: number) {
    const key = meshRevision + ':' + descendingGravity
    let result = cache.get(key)
    if (!result) {
      queries++
      result = flight({ position: noGround, velocity: [4, 4, 0], gravity: 8, descendingGravity, floors: shapes })
      cache.set(key, result)
    }
    return result
  }
  const normal = query(8, 3)
  const fast = query(32, 3)
  const fastCrossAtZero = fast.trace.findIndex(({ time }) => time >= 0.75 - 1e-8)
  return check(normal.support === shelf.id && fast.support === bottom.id && close(normal.contact.position[0], 4) &&
    fastCrossAtZero >= 0 && close(fast.trace[fastCrossAtZero].position[0], 3) &&
    close(normal.contact.peak, 1) && close(fast.contact.peak, 1) && query(8, 3) === normal && queries === 2,
  'The same one-metre apex gave different landing distances. The profile change bypassed the cached connection for the same mesh revision.')
})

const reliableJump = controller('TALK-T03', () => {
  const short = floor('short', 2.4, 0, 0, 0.32)
  const long = floor('long', 2.4, 0, 0, 0.48)
  const from = floor('takeoff', -0.575, 0, 0, 1.55)
  function probability(target: TraversalShape, offsets: readonly number[]) {
    let launched = 0
    const successes = offsets.filter((x) => {
      const position: Point = [x, 0, 0]
      if (!supports(from, position, 0.1)) return false
      launched++
      return flight({ position, velocity: [3, 4, 0], floors: [target] }).support === target.id
    }).length
    return { ratio: successes / offsets.length, launched }
  }
  const deviations = [-0.1, -0.05, 0, 0.05, 0.1]
  const choices = [short, long].map((target) => ({ id: target.id, ...probability(target, deviations) }))
  const reliable = choices.find((candidate) => candidate.ratio >= 0.8)
  const nominal = choices[0]
  const outside = probability(long, [0, 0.12])
  return check(choices[0].ratio === 0.6 && choices[1].ratio === 1 &&
    nominal.id === short.id && reliable?.id === long.id && outside.ratio === 0.5 && outside.launched === 1,
  'Deterministic replay yielded three of five short landings and five of five long landings. Attempts outside takeoff support counted as failures.')
})

const boostDoubleJump = controller('TALK-T05', () => {
  const roof = floor('roof', 2.57, 2.2, 0, 0.30)
  const courtyard = floor('yard', 2.2, 0, 0, 7)
  function execute(boost: boolean, double: boolean, charged: boolean) {
    let used = 0
    const apex = boost ? 0.6 : 0.4
    const result = flight({
      position: noGround, velocity: [2, boost ? 6 : 4, 0], floors: [roof, courtyard],
      beforeStep(state) {
        if (state.time < apex - 1e-8 || !charged || !double || used) return
        used++
        return { velocity: [state.velocity[0], 4, state.velocity[2]] }
      }
    })
    return { ...result, used, ready: (charged && !used) || result.support !== undefined }
  }
  const successful = execute(true, true, true)
  const boostOnly = execute(true, false, true)
  const doubleOnly = execute(false, true, true)
  const exhausted = execute(true, true, false)
  const afterLanding = execute(true, true, exhausted.ready)
  const sameApex = successful.trace.find(({ time }) => close(time, 0.6))?.position
  const exhaustedApex = exhausted.trace.find(({ time }) => close(time, 0.6))?.position
  return check(successful.support === roof.id && successful.used === 1 && close(successful.contact.time, 1.283, 0.002) &&
    close(successful.contact.position[0], 2.566, 0.004) && close(successful.contact.peak, 2.6) &&
    boostOnly.support === courtyard.id && close(boostOnly.contact.peak, 1.8) &&
    doubleOnly.support === courtyard.id && close(doubleOnly.contact.peak, 1.6) &&
    exhausted.used === 0 && exhausted.support === courtyard.id && afterLanding.used === 1 && afterLanding.support === roof.id &&
    sameApex !== undefined && exhaustedApex !== undefined && sameApex.every((n, i) => close(n, exhaustedApex[i])),
  'Only the boost and one available midair impulse reached the roof near 1.283 seconds. Ground contact restored the spent action.')
})

const generatedChain = integration('TALK-T06', (backend) => {
  let seed = 1897
  function sample() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
  const launch: Point = [2.5, 0.25, 2]
  const middle: Point = [5.4 + sample() * 0.36, 0.5, 3.2 + sample() * 0.28]
  const goal: Point = [2.6 + sample() * 0.32, 0.8, 5.8 + sample() * 0.33]
  const routeNodes = [launch, middle, goal]
  const shapes = routeNodes.map(([x, y, z], i) => floor('seeded-' + i, x, y, z, 1.4, 1.4))
  const links = [{ from: launch, to: middle }, { from: middle, to: goal }]
  let runway: Point = [launch[0] - 0.42, launch[1], launch[2]]
  let steps = 0
  while (runway !== launch && supports(shapes[0], runway, 0.12)) {
    runway = advance(runway, launch, (1.4 + steps++ * 0.1) / 120)
  }
  function replay(from: Point, to: Point, floors: readonly TraversalShape[]) {
    const time = (4 + Math.sqrt(16 - 20 * (to[1] - from[1]))) / 10
    return flight({ position: from, velocity: [(to[0] - from[0]) / time, 4, (to[2] - from[2]) / time],
      floors, limit: 1.2 })
  }
  const first = replay(launch, middle, shapes)
  const second = replay(first.contact.position, goal, shapes)
  const missing = replay(launch, middle, [shapes[0], shapes[2]])
  const connected = withNavigator(backend, shapes, 0.12, 0.6, links, (route) => {
    const result = route(launch, goal)
    return result.status === 'complete' && result.points.some((p) => Math.hypot(p[0] - middle[0], p[2] - middle[2]) < 0.4)
  })
  const disconnected = withNavigator(backend, [shapes[0], shapes[2]], 0.12, 0.6, [], (route) =>
    route(launch, goal).status === 'unreachable')
  return check(runway === launch && steps > 1 && first.support === 'seeded-1' && second.support === 'seeded-2' && !missing.support &&
    second.contact.position[0] < first.contact.position[0] && connected && disconnected,
  'The fixed-seed waypoint sequence replayed two grounded launches, including movement back along X. Removing the only middle support broke the first landing and native reachability.')
})

const shelfBetweenSamples = controller('TALK-T08', () => {
  const radius = 0.25
  const start: Point = [0, 0, 0.9]
  const post = { x: 2, z: 0, radius: 0.42 }
  function clear(to: Point) {
    const dx = to[0] - start[0]
    const dz = to[2] - start[2]
    const t = Math.min(1, Math.max(0, ((post.x - start[0]) * dx + (post.z - start[2]) * dz) / (dx ** 2 + dz ** 2)))
    return Math.hypot(start[0] + dx * t - post.x, start[2] + dz * t - post.z) >= post.radius + radius
  }
  function find(shape: TraversalShape) {
    const startZ = shape.center[2] - shape.size[2] / 2 + radius
    const endZ = shape.center[2] + shape.size[2] / 2 - radius
    const point: Point = [shape.center[0], top(shape), startZ]
    return startZ <= endZ && supports(shape, point) && clear(point) ? point : undefined
  }
  const phases = Array.from({ length: 8 }, (_, n) => 0.918 + n * 0.025)
  const cases = phases.map((z) => {
    const valid = floor('thin', 3, 0, z, 0.85, 0.54)
    const narrow = floor('too-thin', 3, 0, z, 0.85, 0.42)
    const fixedProbe = Array.from({ length: 7 }, (_, i): Point => [3, 0, i * 0.2]).some((p) => supports(valid, p))
    const found = find(valid)
    return { fixedProbe, valid: found !== undefined && close(found[2], z - 0.02) && !find(narrow) &&
      supports(narrow, [3, 0, z], 0) }
  })
  return check(cases.every(({ valid }) => valid) && cases.some(({ fixedProbe }) => !fixedProbe) &&
    cases.some(({ fixedProbe }) => fixedProbe) && !clear([3, 0, -0.9]),
  'The swept approach found the first fitting centre across eight shelf phases. Fixed probes missed some valid phases, and narrow supports were rejected.')
})

const ascendingGrab = controller('TALK-T09', () => {
  const ledge = floor('side-ledge', 2.4, 1.78, 0, 0.99)
  const goal = floor('intended-jump', 4.25, 0, 0, 1.4)
  const position: Point = [1.5, 0.55, 0]
  function continueJump(vy: number, requested: boolean) {
    if (vy <= 0 && requested && grasp(position, [1.9, top(ledge), 0], 4.8) && plantAfterGrip(position, ledge)) {
      return 'grabbed'
    }
    return flight({ position, velocity: [4.8, vy, 0], floors: [goal] }).support ?? 'fell'
  }
  return check(grasp(position, [1.9, top(ledge), 0], 4.8) &&
    continueJump(2, false) === goal.id && continueJump(2, true) === goal.id &&
    continueJump(-2, true) === 'grabbed' && continueJump(-2, false) !== 'grabbed',
  'The same reachable hand pose preserved an ascending jump and allowed a requested grab on descent.')
})

const entryOrientation = controller('TALK-T12', () => {
  const zones = [
    { yaw: 0, clip: 'lower', x: 0.05, z: 0 },
    { yaw: 90, clip: 'side', x: 0.18, z: 0 }
  ]
  const wall = box('turn-obstruction', 'obstacle', [0.22, 0.1, 0.41], [0.8, 1.7, 0.85])
  const at: Point = [0, 0, 0]
  function shoulder(yaw: number): Point {
    const radians = yaw * Math.PI / 180
    return [at[0] + Math.sin(radians) * 0.35, at[1], at[2] + Math.cos(radians) * 0.35]
  }
  function canAlign(from: number, to: number) {
    return Array.from({ length: 10 }, (_, i) => shoulder(from + (to - from) * i / 9))
      .every((point) => !capsuleHits(point, point, wall))
  }
  function find(yaw: number) {
    const entry = zones
      .filter((zone) => Math.hypot(at[0] - zone.x, at[2] - zone.z) < 0.3 &&
        Math.abs(yaw - zone.yaw) <= 15 && canAlign(yaw, zone.yaw))
      .sort((a, b) => a.x - b.x)[0]
    return entry && { clip: entry.clip, yaw: entry.yaw }
  }
  const selected = find(90)
  const near = find(76)
  return check(!canAlign(90, 0) && selected?.clip === 'side' && selected.yaw === 90 &&
    near?.clip === 'side' && near.yaw === 90 && !find(74),
  'Overlapping zones resolved by the valid pose and clip. A 14° correction fit, a 16° correction failed, and turning toward the nearer zone hit the wall.')
})

type Edge = { id: string; from: number; to: number; cost: number; gate?: boolean; traversal?: boolean }
function shortest(edges: readonly Edge[], from: number, to: number) {
  const distance = new Map([[from, 0]])
  const open = new Set([from])
  while (open.size) {
    const at = [...open].reduce((a, b) => distance.get(a)! < distance.get(b)! ? a : b)
    open.delete(at)
    if (at === to) return distance.get(at)!
    for (const edge of edges) {
      if (edge.from !== at) continue
      const candidate = distance.get(at)! + edge.cost
      if (candidate >= (distance.get(edge.to) ?? Infinity)) continue
      distance.set(edge.to, candidate)
      open.add(edge.to)
    }
  }
  return Infinity
}

const pruneRedundant = controller('TALK-T13', () => {
  const edges: Edge[] = []
  for (let i = 0; i < 26; i++) {
    edges.push({ id: 'vault-' + i, from: i, to: i + 1, cost: 1, traversal: true })
    if (i < 24) {
      edges.push({ id: 'bypass-in-' + i, from: i, to: i + 27, cost: 0.54 })
      edges.push({ id: 'bypass-out-' + i, from: i + 27, to: i + 1, cost: 0.54 })
    }
  }
  edges.push({ id: 'door', from: 25, to: 26, cost: 0.98, gate: true })
  let kept = edges
  for (const edge of edges.filter((item) => item.traversal)) {
    const candidate = kept.filter(({ id, gate }) => id !== edge.id && !gate)
    if (shortest(candidate, edge.from, edge.to) <= edge.cost * 1.1) {
      kept = kept.filter(({ id }) => id !== edge.id)
    }
  }
  const open = shortest(kept, 0, 26)
  const closed = shortest(kept.filter(({ gate }) => !gate), 0, 26)
  const baseline = shortest(edges.filter(({ gate }) => !gate), 0, 26)
  return check(kept.filter(({ traversal }) => traversal).map(({ id }) => id).join(',') === 'vault-24,vault-25' &&
    Number.isFinite(open) && Number.isFinite(closed) && closed / baseline <= 1.1 &&
    !Number.isFinite(shortest(kept.filter(({ gate, id }) => !gate && id !== 'vault-25'), 0, 26)),
  'Twenty-four redundant links were pruned with a cost bound. The gap and conditional-door backup remained necessary and reachable.')
})

const vaultMomentum = controller('TALK-T14', () => {
  const deck = floor('deck', 1.0, 0, 0, 1.45, 1.2)
  const nextDeck = floor('next', 4, 0, 0.25, 1.0, 1.0)
  function execute(drop: number) {
    const landing = flight({ position: [0, drop, 0], velocity: [3.5, 0, 0.25], floors: [deck] })
    const [vx, , vz] = landing.contact.velocity
    const velocity: Point = landing.support && drop - landing.contact.position[1] <= 0.6 ? [vx, 4, vz] : [0, 4, 0]
    const lip: Point = [1.42, 0, landing.contact.position[2]]
    const next = supports(deck, lip, 0.1) ? flight({ position: lip, velocity, floors: [nextDeck] }) : undefined
    return { ...landing, velocity, next }
  }
  const shallow = execute(0.59)
  const deep = execute(0.61)
  return check(shallow.support === deck.id && deep.support === deck.id &&
    close(shallow.velocity[0], 3.5) && close(shallow.velocity[2], 0.25) &&
    deep.velocity[0] === 0 && deep.velocity[2] === 0 && shallow.next?.support === nextDeck.id && !deep.next?.support,
  'The measured landing drop retained horizontal motion on the shallow vault and reset it on the deep vault, changing the next jump outcome.')
})

const correctInFlight = controller('TALK-T15', () => {
  const desired = floor('desired', 2.0, 0, 0, 0.3)
  const fallback = floor('below', 2.5, -0.75, 0, 2.7)
  const maxAcceleration = 1.5
  function execute(observeAt: number) {
    return flight({
      position: noGround, velocity: [1.8, 5, 0], floors: [desired, fallback],
      beforeStep(state) {
        const remaining = 1 - state.time
        if (state.time < observeAt - 1e-8 || remaining <= 1e-6) return
        const correction = 2 * (2 - (state.position[0] + state.velocity[0] * remaining)) / remaining ** 2
        return { acceleration: [Math.min(maxAcceleration, Math.max(-maxAcceleration, correction)), 0, 0] }
      }
    })
  }
  const early = execute(0.2)
  const late = execute(0.8)
  function withinLimit(run: ReturnType<typeof flight>) {
    return run.trace.slice(1).every((event, i) => {
      const previous = run.trace[i]
      const dt = event.time - previous.time
      const dv = event.velocity[0] - previous.velocity[0]
      const dx = event.position[0] - previous.position[0]
      return Math.abs(dv) <= maxAcceleration * dt + 1e-6 && close(dx, (event.velocity[0] + previous.velocity[0]) * dt / 2, 1e-7)
    })
  }
  return check(early.support === desired.id && close(early.contact.position[0], 2) &&
    late.support === fallback.id && late.trace.some(({ time, position }) => close(time, 1) && position[0] < 1.95) &&
    withinLimit(early) && withinLimit(late),
  'Early observation corrected the target approach. The later observation remained outside the landing interval and landed below without teleportation.')
})

export const advancedActionCases: CatalogCase[] = [
  landingOvershoot, padContact, jumpPadSkips, sidewaysLanding, staminaAtLip, footPlacement, apexMantle,
  vaultSlideJump, wallRun, earlyLadder, retryCooldown, timedRetry, fasterFall, reliableJump, boostDoubleJump,
  generatedChain, shelfBetweenSamples, ascendingGrab, entryOrientation, pruneRedundant, vaultMomentum, correctInFlight
]
