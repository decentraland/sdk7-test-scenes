import type { Point, Surface } from '../../src/arena'
import type { Navigator, Route } from '../../src/navigation'
import { capsuleHits } from '../../src/traversal/fixtures/mantles-support'
import { createTraversalNavigator, traversalSurfaces, type AuthoredLink, type TraversalBackend, type TraversalQueryOptions } from '../sdk-detour-probe/traversal-routing'
import { crosses, floor, outsideRect, pathLength, usingMesh } from './ground'
import { avoidTerrain, clearanceWeights, hazardTerrain, occupiedRegionEscape, regionalFilters, slowTerrain, weightedGround } from './ground-areas'
import { displacedCorridor } from './ground-corridor'
import { actionableDoor, lateDoor } from './ground-door'
import { independentDoors } from './ground-door-pair'
import { groundFollower, pointDistance } from './ground-motion'
import { followPartial, tolerantGoal } from './ground-partial'
import { budgetedHairpin } from './ground-search'
import { box, check, type CatalogCase } from './types'

function planner(id: string, run: CatalogCase['run'], coverage?: CatalogCase['coverage']): CatalogCase {
  return { id, run, layer: 'planner', coverage }
}

const low: Point = [2, 0, 2]
const high: Point = [2, 3, 2]
const lowEdge: Point = [7, 0, 2]
const highEdge: Point = [7, 3, 2]
const decks = [floor(0, 8, 0, 4), floor(0, 8, 0, 4, 3)]
const balcony = { from: highEdge, to: lowEdge }
const forward: AuthoredLink = { from: lowEdge, to: highEdge, bidirectional: true }
const complete = (route: Route) => route.status === 'complete'

function native<T>(
  backend: TraversalBackend, faces: readonly Surface[], links: readonly AuthoredLink[],
  fn: (nav: Navigator) => T, options: TraversalQueryOptions = {}, snap = true
) {
  const nav = createTraversalNavigator(backend, faces, 0.2, 1.3, links, snap, options)
  try {
    return fn(nav)
  } finally {
    nav.dispose?.()
  }
}

function stacked(backend: TraversalBackend, difference: number) {
  const faces = [floor(0, 8, 0, 4), floor(0, 8, 0, 4, difference)]
  const upperStart: Point = [2, difference, 2]
  return native(backend, faces, [{ from: [7, difference, 2], to: lowEdge }], (nav) => {
    const down = nav.route(upperStart, low)
    return complete(down) && !complete(nav.route(low, upperStart)) &&
      down.points[0][1] > difference - 0.12 && down.points[down.points.length - 1][1] < 0.12 &&
      down.points.some(([x]) => x > 6.7)
  })
}

const from: Point = [1.25, 0, 3]
const to: Point = [10.75, 0, 3]
const lanes = [floor(0, 3, 0, 10), floor(9, 12, 0, 10)]
const shortLane: AuthoredLink = { from: [2.6, 0, 3], to: [9.4, 0, 3], flags: 2, area: 1, bidirectional: true }
const longLane: AuthoredLink = { from: [2.6, 0, 7], to: [9.4, 0, 7], flags: 4, area: 2, bidirectional: true }
const near = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

const rampBottom: Point = [2.2, 0, 8]
const rampTop: Point = [2.2, 3, 8]
const rampDecks = [floor(0, 10, 0, 9), floor(0, 10, 7, 9, 3), floor(7, 10, 2, 7, 0, 3)]
const rampDrop: AuthoredLink = { from: [1.5, 3, 8], to: [1.5, 0, 8], flags: 2 }
const rampCross = (route: Route) => route.points.slice(1).some((end, i) => {
  const start = route.points[i]
  return Math.min(start[1], end[1]) < 1.5 && Math.max(start[1], end[1]) >= 1.5 &&
    start[0] > 6.9 && end[0] > 6.9
})

function traversalEvents(route: Route) {
  return route.points.slice(1).flatMap((end, i) => {
    const start = route.points[i]
    const change = end[1] - start[1]
    return Math.abs(change) > 2.7 && Math.hypot(end[0] - start[0], end[2] - start[2]) < 0.15
      ? [change > 0 ? 'climb' : 'drop'] : []
  })
}

export const topologyCases: CatalogCase[] = [
  planner('E17', (backend) => {
    const plans = (links: AuthoredLink[]) => native(backend, rampDecks, links, (nav) => ({
      down: nav.route(rampTop, rampBottom), up: nav.route(rampBottom, rampTop)
    }), { climb: 0.1 })
    const oneWay = plans([rampDrop])
    const bidirectional = plans([{ ...rampDrop, bidirectional: true }])
    const noDrop = plans([])
    const describe = ({ up, down }: typeof oneWay) => ({
      complete: complete(up) && complete(down), up: traversalEvents(up), down: traversalEvents(down),
      upRamp: rampCross(up), downRamp: rampCross(down)
    })
    return check([oneWay, bidirectional, noDrop].every(({ up, down }) => complete(up) && complete(down)) &&
      traversalEvents(oneWay.down).join() === 'drop' && traversalEvents(oneWay.up).length === 0 && rampCross(oneWay.up) &&
      traversalEvents(bidirectional.down).join() === 'drop' && traversalEvents(bidirectional.up).join() === 'climb' &&
      traversalEvents(noDrop.up).length === 0 && traversalEvents(noDrop.down).length === 0 &&
      rampCross(noDrop.up) && rampCross(noDrop.down),
    'Native routes over the ramp and directional link drive different traversal events: ' +
      JSON.stringify({ oneWay: describe(oneWay), bidirectional: describe(bidirectional), noDrop: describe(noDrop) }))
  }),
  planner('E18', (backend) => {
    const ledges = [floor(0, 3, 0, 6), floor(6, 9, 0, 6), floor(6, 9, 0, 6, 3)]
    const start: Point = [2, 0, 3]
    // Isolate the landing test. Detour attaches the takeoff within walkableClimb
    // of the baked surface, whose height can differ from the source triangles.
    const takeoff = native(backend, ledges, [], (nav) => nav.route(start, start).points[0])
    if (!takeoff) return check(false, 'The takeoff cannot be projected onto its own floor.')
    const connect = (x: number, y: number, faces = ledges) => native(backend, faces, [
      { from: [start[0], takeoff[1], start[2]], to: [x, y, 3], radius: 0.5 }
    ], (nav) => [nav.route([1, 0, 3], [8, 0, 3]).status, nav.route([1, 0, 3], [8, 3, 3]).status], {}, false)
    const inside = connect(5.82, 0)
    const outside = connect(5.42, 0)
    const floorRemoved = connect(5.82, 0, [ledges[0], ledges[2]])
    const intentionalUpper = connect(6.24, 3)
    return check(inside.join() === 'complete,unreachable' && outside.join() === 'unreachable,unreachable' &&
      floorRemoved.join() === 'unreachable,unreachable' && intentionalUpper.join() === 'unreachable,complete',
    'Raw landing anchor radius and wrong-floor rejection, with a positive upper-anchor control: ' +
      JSON.stringify({ inside, outside, floorRemoved, intentionalUpper }))
  }),
  planner('E20', regionalFilters),
  { id: 'E22', layer: 'integration', run: lateDoor },
  planner('E25', displacedCorridor),
  planner('E27', (backend) => {
    const link = [{ ...rampDrop, bidirectional: true }]
    const position = groundFollower(rampBottom)
    const optedIn = native(backend, rampDecks, link, (nav) => nav.route(rampBottom, rampTop), { climb: 0.1 })
    const neverAllowed = native(backend, rampDecks, link, (nav) => nav.route(rampBottom, rampTop), { includeFlags: 1, climb: 0.1 })
    position.assign(optedIn.points)
    position.step(0.22, () => true)
    const moved = pointDistance(position.position(), rampBottom) > 0.1 && position.position()[1] < 0.12
    const revoked = native(backend, rampDecks, link, (nav) => nav.route(position.position(), rampTop), { includeFlags: 1, climb: 0.1 })
    position.assign(revoked.points)
    for (let tick = 0; tick < 180 && !position.finished(); tick++) position.step(0.22, () => true)
    const arrived = position.finished() && pointDistance(position.position(), rampTop) < 0.12
    return check(complete(optedIn) && traversalEvents(optedIn).join() === 'climb' && moved && arrived &&
      [neverAllowed, revoked].every((route) => complete(route) && rampCross(route) && traversalEvents(route).length === 0),
    'Eligible agent plans the short animation link. The other chooses the ramp. The first loses access before using the link, replans from its moved position, and arrives via the ramp.')
  }),
  planner('GAME-01', (backend) => check(stacked(backend, 4), 'Same-XZ balconies 4 m apart cannot shortcut the authored far-edge drop.')),
  planner('GAME-02', (backend) => {
    const ledges = [floor(0, 3, 0, 4), floor(6, 10, 0, 4), floor(5, 10, 0, 4, 3)]
    const anchor = [{ from: [2, 0, 2], to: [6.25, 0, 2] }] as const
    const correct = native(backend, ledges, anchor, (nav) => complete(nav.route([1, 0, 2], [8, 0, 2])) &&
      !complete(nav.route([1, 0, 2], [8, 3, 2])))
    const removed = native(backend, [ledges[0], ledges[2]], anchor,
      (nav) => !complete(nav.route([1, 0, 2], [8, 3, 2])))
    return check(correct && removed, 'Deleting the intended landing never attaches a lower endpoint to the upstairs polygon.')
  }),
  planner('GAME-03', (backend) => {
    const base = box('floor', 'surface', [0, -0.2, 0], [12, 0, 10])
    const shapes = [base, box('divider', 'obstacle', [4, 0, 2.2], [8, 2, 4.5]),
      box('divider2', 'obstacle', [4, 0, 5.1], [8, 2, 8]),
      box('low vent', 'obstacle', [4, 1.1, 0], [8, 2.4, 2.2])]
    const probes = [[0.33, 1.7], [0.33, 0.9], [0.15, 1.7]].map(([radius, height]) => usingMesh(backend,
      traversalSurfaces(shapes, height), (nav) => nav.route([2, 0, 2.5], [10, 0, 2.5]), { radius, height }))
    return check(probes.every(complete) && crosses(probes[0], 0, 6, ([, , z]) => z > 8) &&
      crosses(probes[1], 0, 6, ([, , z]) => z < 2.2) && crosses(probes[2], 0, 6, ([, , z]) => z > 4.5 && z < 5.1),
    'Standing, crouching and narrow profiles select three different legal passages.')
  }),
  planner('GAME-04', (backend) => {
    const ledges = [
      { height: 0.39, upward: true, downward: true },
      { height: 0.41, upward: false, downward: true },
      { height: 0.79, upward: false, downward: true },
      { height: 0.81, upward: false, downward: false }
    ]
    const outcomes = ledges.map(({ height, upward, downward }) => {
      const a: Point = [2, 0, 2]
      const b: Point = [6, height, 2]
      const links = [...(height <= 0.4 ? [{ from: a, to: b }] : []), ...(height <= 0.8 ? [{ from: b, to: a }] : [])]
      return native(backend, [floor(0, 3, 0, 4), floor(5, 8, 0, 4, height)], links, (nav) => {
        const up = nav.route(a, b)
        const down = nav.route(b, a)
        const upValid = complete(up) && crosses(up, 0, 4, ([, y]) => Math.abs(y - height / 2) < 0.1)
        const downValid = complete(down) && crosses(down, 0, 4, ([, y]) => Math.abs(y - height / 2) < 0.1)
        return upValid === upward && downValid === downward &&
          (upward || !complete(up)) && (downward || !complete(down))
      })
    })
    return check(outcomes.every(Boolean), 'Four isolated ledges check independent fixed climb/drop expectations in both directions.')
  }),
  {
    id: 'GAME-05', layer: 'controller',
    run: () => {
      const start: Point = [2, 0, 3]
      const raised: Point = [2.5, 0.25, 3]
      const goal: Point = [3, 0.25, 3]
      const lowBeam = box('low', 'obstacle', [2.4, 1.98, 2.5], [2.6, 2.05, 3.5])
      const highBeam = box('high', 'obstacle', [2.4, 2.08, 2.5], [2.6, 2.16, 3.5])
      const legs: [Point, Point][] = [[start, raised], [raised, goal]]
      const intersects = (beam: typeof lowBeam) => legs.some(([a, b]) => capsuleHits(a, b, beam))
      return check(!capsuleHits(start, start, lowBeam) && !capsuleHits(goal, goal, lowBeam) &&
        intersects(lowBeam) && !intersects(highBeam),
      'Both standing poses have headroom; only the low beam clips the moving capsule.')
    }
  },
  planner('GAME-06', slowTerrain),
  planner('GAME-07', budgetedHairpin),
  planner('GAME-08', clearanceWeights),
  { id: 'GAME-09', layer: 'integration', run: independentDoors },
  { id: 'GAME-10', layer: 'integration', run: actionableDoor },
  planner('GAME-11', (backend) => {
    const links = [{ ...shortLane, flags: 2 }, longLane]
    return native(backend, lanes, links, (ownerView) => native(backend, lanes, links, (guestView) => {
      type Team = 'A' | 'B'
      let owner: Team = 'A'
      let epoch = 0
      let misses = 0
      const cache = new Map<string, Route>()
      const query = (team: Team) => {
        const key = team + ':' + epoch
        const existing = cache.get(key)
        if (existing) return existing
        const route = (team === owner ? ownerView : guestView).route(from, to)
        cache.set(key, route)
        misses++
        return route
      }
      const lane = (route: Route, z: number) => complete(route) && crosses(route, 0, 6, (point) => Math.abs(point[2] - z) < 0.4)
      const firstA = query('A')
      const firstB = query('B')
      const initially = lane(firstA, 3) && lane(firstB, 7) && query('A') === firstA && query('B') === firstB
      owner = 'B'
      epoch++
      const secondB = query('B')
      const secondA = query('A')
      return check(initially && lane(secondA, 7) && lane(secondB, 3) &&
        secondA !== firstA && secondB !== firstB && query('A') === secondA && query('B') === secondB && misses === 4,
      'Both teams share identical endpoints and geometry. Transfer swaps their route privileges and fences each team’s cached route by ownership revision.')
    }, { includeFlags: 5 }))
  }),
  { id: 'GAME-15', layer: 'integration', run: occupiedRegionEscape },
  planner('GAME-18', (backend) => {
    const shapes = [box('floor', 'surface', [0, -0.2, 0], [10, 0, 10]),
      box('wall', 'obstacle', [4.8, 0, 4.4], [5.2, 3, 5.6])]
    const object: Point = [5.9, 1.0, 5]
    const left: Point = [4, 0, 5]
    const right: Point = [7.1, 0, 5]
    const from: Point = [2, 0, 5]
    return usingMesh(backend, traversalSurfaces(shapes, 1.4), (nav) => {
      function choose(candidates: readonly Point[], visible: boolean) {
        return candidates.filter((p) => near(p, object) <= 2.4 &&
          (!visible || outsideRect({ status: 'complete', points: [p, object] }, [4.8, 5.2, 4.4, 5.6])))
          .map((p) => ({ p, route: nav.route(from, p) })).filter(({ route }) => complete(route))
          .sort((a, b) => pathLength(a.route) - pathLength(b.route))[0]?.p
      }
      return check(choose([left, right], true) === right && choose([left], true) === undefined && choose([left, right], false) === left,
        'Visibility filtering selects the clear approach or refuses it when only the occluded pose remains.')
    })
  }),
  planner('GAME-19', (backend) => {
    const faces = [floor(0, 8, 0, 6), floor(0, 8, 0, 6, 3), floor(9, 12, 0, 6)]
    const start: Point = [7, 0, 2]
    const isolated: Point = [9.5, 0, 2]
    const upstairs: Point = [7, 3, 2]
    const cheap: Point = [3, 0, 4]
    const stairs: AuthoredLink[] = [{ from: [1, 0, 5], to: [1, 3, 5] }]
    return check(native(backend, faces, stairs, (nav) => {
      function choose(points: readonly Point[]) {
        return points.map((p) => ({ p, route: nav.route(start, p) })).filter(({ route }) => complete(route))
          .sort((a, b) => pathLength(a.route) - pathLength(b.route))[0]?.p
      }
      return choose([isolated, upstairs, cheap]) === cheap && choose([cheap, upstairs, isolated]) === cheap
    }), 'The farther ground candidate beats an isolated candidate and an upstairs detour in either order.')
  }),
  planner('GAME-20', (backend) => {
    const old = usingMesh(backend, decks, (nav) => nav.route(low, lowEdge), { links: [forward] })
    const upstairs = usingMesh(backend, decks, (nav) => nav.route(low, high), { links: [forward] })
    const blocked = usingMesh(backend, decks, (nav) => nav.route(low, high))
    const lateTarget = { revision: 1, query: 1, path: old }
    const currentTarget = { revision: 1, query: 2, path: upstairs }
    const currentMap = { revision: 2, query: 2, path: blocked }
    let accepted: typeof currentTarget | undefined
    let revision = 1
    function receive(result: typeof currentTarget) {
      if (result.query !== currentTarget.query || result.revision !== revision) return
      accepted = result
    }
    receive(currentTarget)
    receive(lateTarget)
    const staysUpstairs = accepted === currentTarget && complete(upstairs) &&
      upstairs.points.some((point) => point[1] > 2.8)
    revision = 2
    accepted = undefined
    receive(currentTarget)
    const ignoresBlockedSegment = accepted === undefined
    receive(currentMap)
    return check(complete(old) && staysUpstairs && ignoresBlockedSegment &&
      accepted === currentMap && !complete(blocked),
    'Late downstairs result cannot replace the upstairs route. Removing its only link invalidates the old map result with the same query ID.')
  }),
  planner('GAME-22', hazardTerrain),
  planner('GAME-23', (backend) => {
    const heights = [0, 3, 6]
    const faces = heights.map((height) => floor(0, 9, 0, 9, height))
    const stairs = [{ from: [8, 0, 8] as Point, to: [8, 3, 8] as Point, bidirectional: true },
      { from: [1, 3, 8] as Point, to: [1, 6, 8] as Point, bidirectional: true }]
    const perTick = 4
    const singletonBudget = 9
    type Request = { ordinal: number; source: Point; target: Point; revision: number; queued: number; singleton?: true }
    const q = (durations: number[]) => {
      const ordered = durations.slice().sort((a, b) => a - b)
      return [0.5, 0.95, 0.99].map((p) => Number(ordered[Math.ceil(ordered.length * p) - 1].toFixed(4)))
    }
    return native(backend, faces, stairs, (open) => native(backend, faces, stairs.slice(0, 1), (closed) => {
      const trials = [1, 8, 32].map((size) => {
        const cache = new Map<string, { revision: number; route: Route }>()
        const begins: Point[] = Array.from({ length: size }, (_, i) => [2 + i % 5, heights[i % 3], 2 + Math.floor(i / 5)])
        const queue: Request[] = []
        let serial = 0
        let tick = 0
        let staleRejected = 0
        let staleReturned = 0
        let previousOrder = -1
        let fifo = true
        let valid = true
        const enqueue = (source: Point, target: Point, revision: number, singleton?: true) => {
          queue.push({ ordinal: serial++, source, target, revision, queued: tick, singleton })
        }
        const stages = ([
          { goal: [7, 0, 7], nav: open }, { goal: [7, 6, 7], nav: open }, { goal: [7, 6, 7], nav: closed }
        ] as const).map(({ goal, nav }, revision) => {
          const cold: number[] = []
          const warm: number[] = []
          const nativeQueriesPerTick: number[] = []
          let singletonTicks = Infinity
          const coldRoutes = new Map<string, Route>()
          function finish(layer: 'cold' | 'warm') {
            while (queue.length) {
              tick++
              let queries = 0
              for (let slot = 0; slot < perTick && queue.length; slot++) {
                const request = queue.shift()!
                fifo &&= request.ordinal > previousOrder
                previousOrder = request.ordinal
                if (request.revision !== revision) { staleRejected++; continue }
                const key = JSON.stringify([request.source, request.target])
                const entered = performance.now()
                let result = cache.get(key)
                const cacheHit = result?.revision === revision
                if (!result || !cacheHit) {
                  result = { revision, route: nav.route(request.source, request.target) }
                  cache.set(key, result)
                  queries++
                }
                const elapsed = performance.now() - entered
                if (result.revision !== revision) staleReturned++
                if ((layer === 'warm') !== cacheHit) valid = false
                const reachable = revision < 2 || request.source[1] === 6
                const endpoint = result.route.points[result.route.points.length - 1]
                valid &&= complete(result.route) === reachable &&
                  (!reachable || near(endpoint, request.target) < 0.15)
                if (request.singleton) singletonTicks = tick - request.queued
                else if (layer === 'cold') {
                  coldRoutes.set(key, result.route)
                  cold.push(elapsed)
                } else {
                  valid &&= coldRoutes.get(key) === result.route
                  warm.push(elapsed)
                }
              }
              nativeQueriesPerTick.push(queries)
            }
          }
          begins.forEach((source) => enqueue(source, goal, revision))
          enqueue([6.8, 6, 5.5], goal, revision, true)
          finish('cold')
          begins.forEach((source) => enqueue(source, goal, revision))
          finish('warm')
          if (revision < 2) enqueue(begins[0], goal, revision)
          valid &&= cold.length === size && warm.length === size && singletonTicks <= singletonBudget &&
            Math.max(...nativeQueriesPerTick) <= perTick && nativeQueriesPerTick.reduce((sum, count) => sum + count, 0) === size + 1
          return { coldMs: q(cold), warmMs: q(warm), nativeQueriesPerTick, singletonTicks }
        })
        return { size, valid: valid && fifo && staleRejected === 2 && staleReturned === 0, staleRejected, staleReturned, stages }
      })
      return check(trials.every(({ valid }) => valid),
        'Cold/warm p50/p95/p99 ms by group and event. FIFO allows four requests per tick. An independent request must finish within nine ticks; superseded routes cannot escape. ' +
        JSON.stringify(trials))
    }))
  }),
  { id: 'GAME-24', layer: 'integration', run: followPartial },
  { id: 'GAME-25', layer: 'integration', run: tolerantGoal },
  planner('GAME-26', avoidTerrain),
  planner('P04', weightedGround),
  planner('P05', (backend) => {
    const withReturn = native(backend, decks, [balcony, { from: [0.7, 0, 2], to: [0.7, 3, 2] }], (nav) => {
      const up = nav.route(low, high)
      return complete(up) && up.points.some(([x]) => x < 1)
    })
    const closed = native(backend, decks, [], (nav) => !complete(nav.route(low, high)) && !complete(nav.route(high, low)))
    return check(stacked(backend, 3) && withReturn && closed, 'Stacked floors, gated edge and authored return remain distinct.')
  })
]
