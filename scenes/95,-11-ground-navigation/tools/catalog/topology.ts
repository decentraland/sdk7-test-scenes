import type { Point, Surface } from '../../src/arena'
import { getSurfaces } from '../../src/arena'
import type { Navigator, Route } from '../../src/navigation'
import { capsuleHits } from '../../src/traversal/fixtures/mantles-support'
import { createTraversalNavigator, traversalSurfaces, type AuthoredLink, type TraversalBackend, type TraversalQueryOptions } from '../sdk-detour-probe/traversal-routing'
import { crosses, floor, outsideRect, pathLength, usingMesh } from './ground'
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

function native(
  backend: TraversalBackend, faces: readonly Surface[], links: readonly AuthoredLink[],
  fn: (nav: Navigator) => boolean, options: TraversalQueryOptions = {}, snap = true
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
const via = (nav: Navigator, z: number) => crosses(nav.route(from, to), 0, 6, (point) => Math.abs(point[2] - z) < 0.4)
const near = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

export const topologyCases: CatalogCase[] = [
  planner('E17', (backend) => {
    const oneWay = native(backend, decks, [balcony], (nav) => complete(nav.route(high, low)) && !complete(nav.route(low, high)))
    const returned = native(backend, decks, [{ ...balcony, bidirectional: true }],
      (nav) => complete(nav.route(high, low)) && complete(nav.route(low, high)))
    return check(oneWay && returned, 'Native downward drop is directional until its bidirectional flag is enabled.')
  }),
  planner('E18', (backend) => {
    const ledges = [floor(0, 3, 0, 6), floor(6, 9, 0, 6), floor(6, 9, 0, 6, 3)]
    const connect = (x: number, y: number) => native(backend, ledges, [
      { from: [2, 0, 3], to: [x, y, 3], radius: 0.5 }
    ], (nav) => complete(nav.route([1, 0, 3], [8, 0, 3])) && !complete(nav.route([1, 0, 3], [8, 3, 3])), {}, false)
    return check(connect(5.82, 0) && !connect(5.42, 0) && !connect(6.2, 3),
      'Raw anchor is accepted within horizontal reach, and a nearby upstairs polygon cannot replace the intended floor.')
  }),
  planner('E20', (backend) => {
    const linked = [floor(0, 3, 0, 3), floor(6, 9, 0, 3), floor(11, 14, 0, 3)]
    const edge: AuthoredLink = { from: [2, 0, 1], to: [7, 0, 1], flags: 2 }
    const states = [0xffff, 3, 1].map((includeFlags) => native(backend, linked, [edge], (nav) =>
      complete(nav.route([1, 0, 1], [8, 0, 1])) && !complete(nav.route([1, 0, 1], [12, 0, 1])), { includeFlags }))
    return check(states.join() === 'true,true,false', 'The allowed link survives the mask, the excluded link blocks B, and isolated C stays unreachable.')
  }, 'adapted'),
  planner('E21', (backend) => {
    const altered = [...decks, floor(0, 0.75, 4, 4.8)]
    const query = (r: Navigator) => complete(r.route(high, low)) && !complete(r.route(low, high))
    return check(native(backend, decks, [balcony], query) &&
      native(backend, decks, [balcony], query, { roundTrip: true }) &&
      native(backend, altered, [balcony], query, { roundTrip: true }),
    'Directional link survives export/import and rebuilding geometry beside the link.')
  }, 'adapted'),
  planner('E22', (backend) => {
    const s: Point = [12.5, 1.2, 5.4]
    const g: Point = [8, 3, 11.5]
    const revisions = [true, false, true].map((open) => usingMesh(backend, getSurfaces(open),
      (nav) => nav.route(s, g), { tiled: true }))
    return check(revisions.every(complete) && pathLength(revisions[1]) > pathLength(revisions[0]) + 1 &&
      Math.abs(pathLength(revisions[0]) - pathLength(revisions[2])) < 1e-6,
    'Closing changes the active corridor to a longer route; reopening restores the original route.')
  }, 'adapted'),
  planner('E25', (backend) => {
    const faces = [floor(0, 3, 0, 8), floor(3, 9, 6, 8)]
    return usingMesh(backend, faces, (nav) => {
      const nearRoute = nav.route([2.65, 0, 2.5], [8, 0, 7])
      const outside = nav.route([5, 0, 2.5], [8, 0, 7])
      const repaired = nav.route([2.55, 0, 2.5], [8, 0, 7])
      return check(complete(nearRoute) && !complete(outside) && complete(repaired) &&
        [nearRoute, repaired].every((r) => crosses(r, 0, 3.1, ([, , z]) => z > 6)),
      'Recovery from a measured on-surface pose uses the L bend, and a distant displacement needs reprojection.')
    })
  }, 'adapted'),
  planner('E27', (backend) => {
    const full = native(backend, lanes, [shortLane, longLane], (nav) => via(nav, 3))
    const denied = native(backend, lanes, [shortLane, longLane], (nav) => via(nav, 7), { includeFlags: 5 })
    return check(full && denied, 'Revoking the short action capability on the same endpoints selects the alternate link.')
  }, 'adapted'),
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
    const outcomes = [0.39, 0.41, 0.79, 0.81].map((height) => {
      const a: Point = [2, 0, 2]
      const b: Point = [6, height, 2]
      const links = [...(height <= 0.4 ? [{ from: a, to: b }] : []), ...(height <= 0.8 ? [{ from: b, to: a }] : [])]
      return native(backend, [floor(0, 3, 0, 4), floor(5, 8, 0, 4, height)], links, (nav) =>
        complete(nav.route(a, b)) === (height <= 0.4) && complete(nav.route(b, a)) === (height <= 0.8))
    })
    return check(outcomes.every(Boolean), 'Four authored step/drop heights enforce separate directional thresholds.')
  }, 'adapted'),
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
  planner('GAME-06', (backend) => {
    const query = (cost: number, expected: number) => native(backend, lanes, [shortLane, longLane],
      (nav) => via(nav, expected), { costs: { 1: cost } })
    return check(query(1, 3) && query(2.4, 7), 'The slow-terrain profile selects the longer route at the higher traversal cost.')
  }, 'adapted'),
  planner('GAME-07', (backend) => {
    const strip = [floor(0, 3, 0, 21), floor(4, 7, 0, 21), floor(3, 4, 20, 21)]
    const narrow = [floor(0, 3, 0, 6), floor(4, 7, 0, 6)]
    const from: Point = [2.85, 0, 2]
    const goal: Point = [4.2, 0, 2]
    return check(usingMesh(backend, narrow, (nav) => !complete(nav.route(from, goal))) &&
      usingMesh(backend, strip, (nav) => {
        const route = nav.route(from, goal)
        return complete(route) && pathLength(route) > 35 && crosses(route, 0, 3.5, ([, , z]) => z > 20)
      }), 'The cropped search cannot shortcut the hairpin; the full envelope goes around the wall.')
  }, 'adapted'),
  planner('GAME-08', (backend) => {
    const narrowLaneExposure = 8
    function choice(preferClearance: number, z: number) {
      return native(backend, lanes, [shortLane, longLane], (nav) => via(nav, z),
        { costs: { 1: 1 + preferClearance * narrowLaneExposure } })
    }
    return check(choice(0, 3) && choice(0.5, 7), 'An explicit near-wall cost switches the preferred branch while both routes remain legal.')
  }, 'adapted'),
  planner('GAME-09', (backend) => {
    const left: Point = [1.5, 0, 2]
    const middle: Point = [5.5, 0, 2]
    const right: Point = [9.5, 0, 2]
    const faces = [floor(0, 3, 0, 4), floor(4, 7, 0, 4), floor(8, 11, 0, 4)]
    const cases = [false, true].flatMap((a) => [false, true].map((b) => native(backend, faces, [
      ...(a ? [{ from: [2.5, 0, 2] as Point, to: [4.5, 0, 2] as Point, bidirectional: true }] : []),
      ...(b ? [{ from: [6.5, 0, 2] as Point, to: [8.5, 0, 2] as Point, bidirectional: true }] : [])
    ], (nav) => complete(nav.route(left, middle)) === a && complete(nav.route(right, middle)) === b &&
      complete(nav.route(middle, [6, 0, 2])))))
    return check(cases.every(Boolean), 'All four door states keep the middle navigable and affect only the corresponding branch.')
  }, 'adapted'),
  planner('GAME-10', (backend) => {
    const routeDoor = (capable: boolean, locked: boolean, expected: number) =>
      native(backend, lanes, [shortLane, longLane], (nav) => via(nav, expected),
        { includeFlags: capable && !locked ? 7 : 5 })
    const canRequest = routeDoor(true, false, 3)
    const cannotOpen = routeDoor(false, false, 7)
    const lockedBeforeEntry = routeDoor(true, true, 7)
    return check(canRequest && cannotOpen && lockedBeforeEntry, 'OpenDoor capability permits the actionable link, and a late lock selects the detour.')
  }, 'adapted'),
  planner('GAME-11', (backend) => {
    const links = [{ ...shortLane, flags: 2 }, longLane]
    const choose = (flags: number, z: number) => native(backend, lanes, links, (nav) => via(nav, z), { includeFlags: flags })
    const accessibleBy = (team: 'A' | 'B', owner: 'A' | 'B') => choose(team === owner ? 7 : 5, team === owner ? 3 : 7)
    return check(accessibleBy('A', 'A') && accessibleBy('B', 'A') && accessibleBy('A', 'B') && accessibleBy('B', 'B'),
      'Team access switches when ownership changes without changing geometry.')
  }, 'adapted'),
  planner('GAME-15', (backend) => {
    const start: Point = [2, 3, 3]
    const exit: Point = [7, 3, 3]
    const shapes = [floor(0, 3, 0, 5, 3), floor(5, 9, 0, 5, 3), floor(0, 9, 0, 5)]
    return check(native(backend, shapes, [{ from: start, to: exit }], (nav) =>
      complete(nav.route(start, exit)) && !complete(nav.route(exit, start)) &&
      nav.route(start, exit).points.every((p) => p[1] > 2.8)),
    'One-way escape from an invalidated region does not re-enter it or project onto the floor beneath.')
  }, 'adapted'),
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
  planner('GAME-22', (backend) => {
    const links = [shortLane, longLane]
    const normally = native(backend, lanes, links, (nav) => via(nav, 3))
    const hazard = native(backend, lanes, links, (nav) => via(nav, 7), { costs: { 1: 4 } })
    const unaffected = native(backend, lanes, links, (nav) => via(nav, 3), { costs: { 1: 1 } })
    return check(normally && hazard && unaffected, 'Changing only the area cost selects the safe branch for the risk-sensitive profile.')
  }, 'adapted'),
  planner('GAME-23', (backend) => {
    const y = [0, 3, 6]
    const faces = y.map((height) => floor(0, 9, 0, 9, height))
    const stairs = [{ from: [8, 0, 8] as Point, to: [8, 3, 8] as Point, bidirectional: true },
      { from: [1, 3, 8] as Point, to: [1, 6, 8] as Point, bidirectional: true }]
    let searches = 0
    const cache = new Map<string, Route>()
    const durations: number[] = []
    const run = (stage: number, size: number, goal: Point) => native(backend, faces, stage < 2 ? stairs : stairs.slice(0, 1), (nav) => {
      const query = (i: number) => {
        const from: Point = [2 + i % 5, y[i % 3], 2 + Math.floor(i / 5)]
        const key = JSON.stringify([stage, from, goal])
        let result = cache.get(key)
        if (!result) {
          const start = performance.now()
          result = nav.route(from, goal)
          durations.push(performance.now() - start)
          cache.set(key, result)
          searches++
        }
        return result
      }
      const initial = Array.from({ length: size }, (_, i) => query(i))
      const measured = searches
      const same = initial.every((route, i) => route === query(i))
      return same && searches === measured &&
        initial.every((route, i) => complete(route) === (stage < 2 || i % 3 === 2))
    })
    const consistent = [1, 8, 32].every((size) => run(0, size, [7, 0, 7]) &&
      run(1, size, [7, 6, 7]) && run(2, size, [7, 6, 7]))
    durations.sort((a, b) => a - b)
    return check(consistent && searches === 96, '1/8/32 agents, shared target, changed floor and portal closed; ' +
      searches + ' cached searches; cold p95 ' + durations[Math.ceil(durations.length * 0.95) - 1]?.toFixed(3) + ' ms.')
  }, 'adapted'),
  planner('GAME-24', (backend) => usingMesh(backend, [floor(0, 5, 0, 5), floor(5.8, 8, 0, 5)], (nav) => {
    const result = nav.route([1, 0, 2], [6.3, 0, 2])
    return check(!complete(result) && result.points.length === 0 &&
      complete(nav.route([1, 0, 2], [4.6, 0, 2])),
    'No complete route is reported across the sealed gap; the safe reachable endpoint still works.')
  }, { tiled: true }), 'adapted'),
  planner('GAME-25', (backend) => usingMesh(backend, [floor(0, 5, 0, 5)], (nav) => {
    const goal: Point = [5.4, 0, 2]
    const valid: Point = [4.6, 0, 2]
    function accept(tolerance: number) {
      return near(valid, goal) <= tolerance && complete(nav.route([1, 0, 2], valid))
    }
    return check(!accept(0.7) && accept(0.9), '0.7 m refuses the endpoint while 0.9 m accepts the measured safe candidate.')
  })),
  planner('GAME-26', (backend) => {
    return check(native(backend, lanes, [shortLane, longLane], (nav) => via(nav, 3)) &&
      native(backend, lanes, [shortLane, longLane], (nav) => via(nav, 7), { includeFlags: 5 }),
    'Filtering an avoid tag with no physical collision forces the alternate path.')
  }, 'adapted'),
  planner('P04', (backend) => check(
    native(backend, lanes, [shortLane, longLane], (nav) => via(nav, 3)) &&
    native(backend, lanes, [shortLane, longLane], (nav) => via(nav, 7), { costs: { 1: 3 } }),
  'Native area weights switch between short and cheap branches.'), 'adapted'),
  planner('P05', (backend) => {
    const withReturn = native(backend, decks, [balcony, { from: [0.7, 0, 2], to: [0.7, 3, 2] }], (nav) => {
      const up = nav.route(low, high)
      return complete(up) && up.points.some(([x]) => x < 1)
    })
    const closed = native(backend, decks, [], (nav) => !complete(nav.route(low, high)) && !complete(nav.route(high, low)))
    return check(stacked(backend, 3) && withReturn && closed, 'Stacked floors, gated edge and authored return remain distinct.')
  })
]
