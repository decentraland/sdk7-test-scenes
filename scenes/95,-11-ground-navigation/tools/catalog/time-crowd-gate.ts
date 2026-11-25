import { createFindNearestPolyResult, DEFAULT_QUERY_FILTER, findNearestPoly, type Box3 } from 'navcat'
import { crowd as navcat } from 'navcat/blocks'
import { Crowd, type BoxObstacle, type CrowdAgent } from 'recast-navigation'
import { generateTileCache } from 'recast-navigation/generators'
import type { Point, Surface } from '../../src/arena'
import { createNavcatNavigatorFromMesh, SNAP_EXTENTS, toRecastGeometry, withinSnap, type Navigator } from '../../src/navigation'
import { capsuleHits } from '../../src/traversal/fixtures/mantles-support'
import { createDetourNavigatorFromMesh } from '../../test/detour'
import { floor } from './ground'
import { replaceNavcatObstacleTile } from './live-obstacles'
import { bakeNavcatTiles, CELL_SIZE, detourPoint, nativePoint, TILE_EDGE } from './native-tiles'
import { gap, interpolate, sweptGap } from './time-crowd-support'
import { box, check, type CatalogCase } from './types'

const RADIUS = 0.25
const HEIGHT = 1.2
const MAX_SPEED = 2
const DT = 1 / 30
const ARMS = [floor(0, 8, 9, 11), floor(12, 20, 9, 11), floor(9, 11, 0, 8), floor(9, 11, 12, 20)]
const SURFACES = [...ARMS, floor(8, 12, 8, 12)]
const GATE_BOUNDS = [
  [8, 9.6, 8, 9.6], [10.4, 12, 8, 9.6], [8, 9.6, 10.4, 12], [10.4, 12, 10.4, 12]
] as const
const gate = GATE_BOUNDS.map(([x0, x1, z0, z1], i) => box('insert-' + i, 'obstacle', [x0, -0.3, z0], [x1, 2, z1]))
// Dynamic tile marks operate on walkable agent centres. Allow a body radius
// between the navigable centreline and the independently measured physical gate.
const expandedGate: Box3[] = GATE_BOUNDS.map(([x0, x1, z0, z1]) =>
  [x0 - RADIUS, -0.3, z0 - RADIUS, x1 + RADIUS, 2, z1 + RADIUS])
const common = {
  radius: RADIUS, height: HEIGHT, maxSpeed: MAX_SPEED, maxAcceleration: 8,
  collisionQueryRange: RADIUS * 8, separationWeight: 0, updateFlags: 1 | 2
}

type Entering = { start: Point; goal: Point; release: number; arm: number }
type Motion = { position: Point; velocity: Point }
type LiveCrowd = {
  add(agent: Entering): boolean
  snapshot(): Motion[]
  step(dt: number): void
  replan(): number
  enqueue(closed: boolean): void
  rebuild(): { updated: string[]; settled: boolean }
  navigator: Navigator
  dispose(): void
}

function navcatCrossing(faces: readonly Surface[]): LiveCrowd {
  const { navMesh: mesh, intermediates } = bakeNavcatTiles(faces, RADIUS)
  const group = navcat.create(RADIUS)
  const agents: { id: string; goal: Point }[] = []
  const bounds: Box3[] = expandedGate.map(([x0, y0, z0, x1, y1, z1]) => [x0, y0, -z1, x1, y1, -z0])
  const padding = (Math.ceil(RADIUS / CELL_SIZE) + 3) * CELL_SIZE
  const jobs = Object.values(mesh.tiles).flatMap((tile) => {
    const x = mesh.origin[0] + tile.tileX * TILE_EDGE
    const z = mesh.origin[2] + tile.tileY * TILE_EDGE
    const field = intermediates.heightfield.find(({ bounds: baked }) =>
      Math.abs(baked[0] + padding - x) < 1e-6 && Math.abs(baked[2] + padding - z) < 1e-6)
    const overlaps = field && bounds.some(([x0, , z0, x1, , z1]) =>
      x0 < field.bounds[3] && x1 > field.bounds[0] && z0 < field.bounds[5] && z1 > field.bounds[2])
    return field && overlaps ? [{ tile, field }] : []
  })
  if (jobs.length < 4) throw new Error('Crossing has fewer than four affected tiles.')
  let closed = false
  let nextJob = jobs.length
  function request(id: string, goal: Point) {
    const point = nativePoint(goal)
    const target = findNearestPoly(createFindNearestPolyResult(), mesh, point, SNAP_EXTENTS, DEFAULT_QUERY_FILTER)
    return target.success && withinSnap(target.position, point) &&
      navcat.requestMoveTarget(group, id, target.nodeRef, target.position)
  }
  return {
    add({ start, goal }) {
      const id = navcat.addAgent(group, mesh, nativePoint(start), { ...common, queryFilter: DEFAULT_QUERY_FILTER })
      agents.push({ id, goal })
      return group.agents[id].state === navcat.AgentState.WALKING && request(id, goal)
    },
    snapshot: () => agents.map(({ id }) => ({
      position: nativePoint(group.agents[id].position), velocity: nativePoint(group.agents[id].velocity)
    })),
    step: (dt) => navcat.update(group, mesh, dt),
    replan: () => agents.filter(({ id, goal }) => request(id, goal)).length,
    enqueue(value) { closed = value; nextJob = 0 },
    rebuild() {
      const { tile, field } = jobs[nextJob++]
      replaceNavcatObstacleTile(mesh, tile, field, closed ? bounds : [], RADIUS)
      return { updated: [tile.tileX + ',' + tile.tileY], settled: nextJob === jobs.length }
    },
    navigator: createNavcatNavigatorFromMesh(mesh),
    dispose() {}
  }
}

function detourCrossing(faces: readonly Surface[]): LiveCrowd {
  const { positions, indices } = toRecastGeometry(faces)
  const result = generateTileCache(positions, indices, {
    cs: CELL_SIZE, ch: CELL_SIZE, tileSize: TILE_EDGE / CELL_SIZE,
    walkableHeight: 28, walkableRadius: Math.ceil(RADIUS / CELL_SIZE), walkableClimb: 2,
    expectedLayersPerTile: 1, maxObstacles: GATE_BOUNDS.length
  })
  if (!result.success) throw new Error(result.error)
  const { navMesh, tileCache } = result
  const navigator = createDetourNavigatorFromMesh(navMesh)
  const crowd = new Crowd(navMesh, { maxAgents: 32, maxAgentRadius: RADIUS })
  const agents: { agent: CrowdAgent; goal: Point }[] = []
  const tiles = Array.from({ length: navMesh.getMaxTiles() }, (_, i) => navMesh.getTile(i))
    .map((tile) => tile.header()).filter((header) => header !== null).map((header) => [header.x(), header.y()] as const)
  const tileRefs = () => tiles.map(([x, z]) => navMesh.getTileRefAt(x, z, 0))
  const point = ({ x, y, z }: { x: number; y: number; z: number }): Point => [x, y, -z]
  let obstacles: BoxObstacle[] = []
  return {
    add({ start, goal }) {
      const agent = crowd.addAgent(detourPoint(start), common)
      agents.push({ agent, goal })
      return agent.state() === 1 && agent.requestMoveTarget(detourPoint(goal))
    },
    snapshot: () => agents.map(({ agent }) => ({ position: point(agent.position()), velocity: point(agent.velocity()) })),
    step: (dt) => crowd.update(dt),
    replan: () => agents.filter(({ agent, goal }) => agent.requestMoveTarget(detourPoint(goal))).length,
    enqueue(closed) {
      if (closed) {
        obstacles = expandedGate.map(([x0, y0, z0, x1, y1, z1]) => {
          const center: Point = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]
          const result = tileCache.addBoxObstacle(detourPoint(center), { x: (x1 - x0) / 2, y: (y1 - y0) / 2, z: (z1 - z0) / 2 }, 0)
          if (!result.success) throw new Error('Could not queue a crossing obstacle.')
          return result.obstacle
        })
      } else {
        for (const obstacle of obstacles) if (!tileCache.removeObstacle(obstacle).success) throw new Error('Could not reopen the crossing.')
        obstacles = []
      }
    },
    rebuild() {
      const before = tileRefs()
      const update = tileCache.update(navMesh)
      if (!update.success) throw new Error('Detour failed to update the crossing tile cache.')
      return { updated: tileRefs().flatMap((ref, i) => ref === before[i] ? [] : [tiles[i].join(',')]), settled: update.upToDate }
    },
    navigator,
    dispose() {
      crowd.destroy()
      tileCache.destroy()
      navigator.dispose()
    }
  }
}

function rotate([x, y, z]: Point, arm: number): Point {
  return arm === 0 ? [x, y, z] : arm === 1 ? [20 - x, y, 20 - z]
    : arm === 2 ? [z, y, x] : [20 - z, y, 20 - x]
}

function sweptGate(a: Point, b: Point) {
  return gate.some((shape) => capsuleHits(a, b, shape, RADIUS, HEIGHT))
}

function controlledCrossing(mesh: LiveCrowd): LiveCrowd {
  const phases = [0, 2, 1, 3]
  const admission = 2
  const parking = 7
  const centreLane = 9.96
  const inboundLane = 9.35
  const leftBay = 9.415
  const rightBay = 20 - leftBay
  const agents: { arm: number; motion: Motion; waypoints: Point[]; next: number; haveRoute: boolean }[] = []
  let phase = 0
  let closed = false

  function checkLegs(start: Point, waypoints: readonly Point[], next: number) {
    // These are authored straight lanes. Check that each lane still exists on
    // the current native mesh, including the pending leg from the live pose.
    for (let i = next; i < waypoints.length; i++) {
      const from = i === next ? start : waypoints[i - 1]
      const to = waypoints[i]
      if (gap(from, to) < 1e-4) continue
      const route = mesh.navigator.route(from, to)
      const length = route.points.slice(1).reduce((total, point, j) => total + gap(route.points[j], point), 0)
      if (route.status !== 'complete' || route.points.length === 0 || gap(route.points[0], from) > 1e-3 ||
          gap(route.points[route.points.length - 1], to) > 1e-3 || length > gap(from, to) + 1e-3) return false
    }
    return true
  }

  return {
    ...mesh,
    add({ start, goal, arm }) {
      const [first] = rotate(start, arm)
      const [last, , lane] = rotate(goal, arm)
      const farSide = lane > 10
      // Stage both exit lanes on the left until opposing traffic clears. The
      // parked centres still occupy their original goal discs (25 cm radius).
      const bayX = last + (farSide ? 0.58 : 0)
      const guides: Point[] = [
        [first + 0.85, 0, inboundLane], [7.15, 0, inboundLane],
        [7.7, 0, 10], [12.3, 0, 10], [12.65, 0, centreLane],
        [bayX, 0, centreLane], [bayX, 0, leftBay], [last, 0, farSide ? rightBay : leftBay]
      ]
      const waypoints = guides.map((point) => rotate(point, arm))
      const haveRoute = checkLegs(start, waypoints, 0)
      agents.push({ arm, waypoints, next: 0, haveRoute, motion: { position: start, velocity: [0, 0, 0] } })
      return haveRoute
    },
    snapshot: () => agents.map(({ motion }) => motion),
    enqueue(value) { closed = value; mesh.enqueue(value) },
    replan() {
      let replanned = 0
      for (const agent of agents) {
        agent.haveRoute = checkLegs(agent.motion.position, agent.waypoints, agent.next)
        if (agent.haveRoute) replanned++
      }
      return replanned
    },
    step(dt) {
      const before = agents.map(({ motion }) => motion.position)
      const progress = agents.map(({ arm }, i) => rotate(before[i], arm)[0])
      if (phase < phases.length) {
        const active = agents.filter(({ arm }) => arm === phases[phase])
        const nextArm = phases[phase + 1]
        const exit = nextArm === undefined || (phases[phase] ^ 1) === nextArm ? 12.6 : 10.7
        if (active.length === 8 && active.every(({ arm, motion }) => rotate(motion.position, arm)[0] > exit)) phase++
      }
      const settledArms = phases.map((arm) => {
        const cohort = agents.filter((agent) => agent.arm === arm)
        return cohort.length === 8 && cohort.every(({ next }) => next >= parking)
      })
      const accepted = [...before]
      const frontToBack = agents.map((_, i) => i).sort((a, b) => progress[b] - progress[a])
      for (const i of frontToBack) {
        const agent = agents[i]
        const { arm, next } = agent
        const target = agent.waypoints[next]
        if (!agent.haveRoute || !target || (next === admission && arm !== phases[phase])) continue
        if (next === parking && (phase <= phases.indexOf(arm ^ 1) || !settledArms[phases.indexOf(arm)])) continue
        const start = before[i]
        const distance = gap(start, target)
        const proposed = distance <= dt * MAX_SPEED ? target : interpolate(start, target, dt * MAX_SPEED / distance)
        if (closed && sweptGate(start, proposed)) continue
        // Accepted proposals and stationary bodies share the same continuous
        // step. A move rejected by this reservation holds its previous position.
        if (before.some((position, j) => i !== j &&
            sweptGap(start, proposed, position, accepted[j]).distance < 2 * RADIUS + 0.002)) continue
        accepted[i] = proposed
        if (proposed === target) agent.next++
      }
      for (let i = 0; i < agents.length; i++) {
        const [x, y, z] = accepted[i]
        const [px, py, pz] = before[i]
        agents[i].motion = { position: accepted[i], velocity: [(x - px) / dt, (y - py) / dt, (z - pz) / dt] }
      }
    }
  }
}

function runCrossingFlow(backend: Parameters<CatalogCase['run']>[0], managed: boolean) {
  const native = backend === 'navcat' ? navcatCrossing(SURFACES) : detourCrossing(SURFACES)
  const crowd = managed ? controlledCrossing(native) : native
  const template = Array.from({ length: 32 }, (_, i): Entering => {
    const index = i % 8
    const arm = Math.floor(i / 8)
    const z = 9.65 + index % 2 * 0.7
    return {
      start: rotate([5 - Math.floor(index / 2) * 1.2, 0, z], arm),
      goal: rotate([15 + Math.floor(index / 2) * 1.2, 0, z], arm),
      release: index * 6, arm
    }
  })
  const active: Entering[] = []
  const completed = [0, 0, 0, 0]
  const waiting = [0, 0, 0, 0]
  const byOriginalLane = [0, 0]
  const events: {
    closed: boolean; request: number; ready: number; replanned: number; active: number;
    movingAtRequest: number; completedQueries: number; tiles: Set<string>
  }[] = []
  let current: (typeof events)[number] | undefined
  let contactTicks = 0
  let gateTicks = 0
  let gateTicksWhileUpdating = 0
  let min = Infinity
  let maxBacklog = 0
  let resume = Infinity
  let previousArrived = 0
  let stalledTicks = 0
  let peakStall = 0
  let noArrivals = 0
  let peakNoArrivals = 0
  let drift = 0
  let velocityReset = 0
  let wrongComplete = 0
  let rejectedRequests = 0
  let probeStates = ''
  const closeTick = Math.max(...template.map(({ release }) => release)) + 1
  const openTick = closeTick + 300
  const corner: Point = [8.55, 0, 8.55]
  const cornerReachable = () => crowd.navigator.route(corner, corner).status === 'complete'

  try {
    probeStates += Number(cornerReachable())
    for (let tick = 0; tick <= 25 * 30; tick++) {
      const releases = template.filter(({ release }) => release === tick)
      active.push(...releases)
      for (const release of releases) if (!crowd.add(release)) rejectedRequests++
      const before = crowd.snapshot()
      if (before.length !== active.length) return check(false, 'Crowd lost an agent before movement.')
      if (tick === closeTick || tick === openTick) {
        if (current) return check(false, 'Prior topology update did not settle before the next event.')
        const closed = tick === closeTick
        crowd.enqueue(closed)
        const movingAtRequest = before.filter(({ velocity: [x, y, z] }) => Math.hypot(x, y, z) > 0.05).length
        current = { closed, request: tick, ready: -1, replanned: 0, active: 0, movingAtRequest,
          completedQueries: 0, tiles: new Set() }
        events.push(current)
      }
      if (current) {
        const { updated, settled } = crowd.rebuild()
        for (const key of updated) current.tiles.add(key)
        if (settled) {
          current.ready = tick
          probeStates += Number(cornerReachable())
          const centralRoute = crowd.navigator.route([5, 0, 10], [15, 0, 10])
          if (centralRoute.status !== 'complete' || (current.closed &&
              centralRoute.points.slice(1).some((to, i) => sweptGate(centralRoute.points[i], to)))) {
            return check(false, 'The edited mesh did not preserve a safe central crossing.')
          }
          for (let i = 0; i < active.length; i++) {
            const plan = crowd.navigator.route(before[i].position, active[i].goal)
            if (plan.status === 'complete') {
              current.completedQueries++
              if (gap(plan.points[plan.points.length - 1], active[i].goal) > 0.25) wrongComplete++
            }
          }
          current.active = active.length
          current.replanned = crowd.replan()
          current = undefined
        }
        const after = crowd.snapshot()
        for (let i = 0; i < before.length; i++) {
          const [x, y, z] = before[i].position
          const [vx, vy, vz] = before[i].velocity
          const a = after[i]
          drift = Math.max(drift, Math.hypot(x - a.position[0], y - a.position[1], z - a.position[2]))
          velocityReset = Math.max(velocityReset, Math.hypot(vx - a.velocity[0], vy - a.velocity[1], vz - a.velocity[2]))
        }
      }
      crowd.step(DT)
      const next = crowd.snapshot()
      if (next.length !== active.length) return check(false, 'Crowd lost an agent during movement.')
      let pairHit = false
      let gateHit = false
      let moving = 0
      completed.fill(0)
      byOriginalLane.fill(0)
      for (let i = 0; i < next.length; i++) {
        const a = before[i].position
        const b = next[i].position
        if (!b.every(Number.isFinite)) return check(false, 'Non-finite crowd position.')
        if (tick >= closeTick && tick < openTick) gateHit ||= sweptGate(a, b)
        const motion = gap(a, b)
        moving += motion
        if (gap(b, active[i].goal) <= 0.25) {
          completed[active[i].arm]++
          byOriginalLane[Math.round((rotate(active[i].start, active[i].arm)[2] - 9.65) / 0.7)]++
        } else if (motion < 0.003) waiting[active[i].arm] += DT
        for (let j = 0; j < i; j++) {
          const distance = sweptGap(a, b, before[j].position, next[j].position).distance
          min = Math.min(min, distance)
          pairHit ||= distance < RADIUS * 2 - 1e-6
        }
      }
      if (pairHit) contactTicks++
      if (gateHit) {
        gateTicks++
        if (current) gateTicksWhileUpdating++
      }
      const done = completed.reduce((sum, count) => sum + count, 0)
      if (done > previousArrived && tick >= openTick) resume = Math.min(resume, (tick - openTick) * DT)
      if (active.length > done && moving < 0.02 && done <= previousArrived) stalledTicks++
      else stalledTicks = 0
      peakStall = Math.max(peakStall, stalledTicks)
      if (active.length > done && done <= previousArrived) noArrivals++
      else noArrivals = 0
      peakNoArrivals = Math.max(peakNoArrivals, noArrivals)
      previousArrived = done
      maxBacklog = Math.max(maxBacklog, active.length - done)
    }
    const settled = events.length === 2 && events[0].movingAtRequest > 0 &&
      events.every(({ request, ready, tiles, replanned, active, completedQueries }) =>
      ready > request && tiles.size >= 4 && replanned === active && completedQueries > 0)
    const safety = contactTicks === 0 && gateTicks === 0 && drift < 1e-6 && velocityReset < 1e-6
    const progress = completed.every((count) => count === 8) && wrongComplete === 0 && rejectedRequests === 0
    const details = JSON.stringify({
      settled, probeStates, motionRetained: { drift, velocityReset },
      events: events.map(({ closed, request, ready, tiles, replanned, completedQueries, movingAtRequest }) => ({
        closed, requestedAt: request * DT, rebuiltAfterSeconds: ready < 0 ? null : (ready - request) * DT,
        tiles: tiles.size, replanned, completedQueries, movingAtRequest
      })),
      safety, contactTicks, gateTicks, gateTicksWhileUpdating, minDistance: min,
      progress, completed, byOriginalLane, waitSecondsPerArm: waiting, maxBacklog,
      longestStallSeconds: peakStall * DT, longestNoArrivalSeconds: peakNoArrivals * DT,
      recoverySeconds: Number.isFinite(resume) ? resume : null,
      wrongComplete, rejectedRequests
    })
    return check(settled && probeStates === '101' && safety && progress, details)
  } finally {
    crowd.dispose()
  }
}

export const liveCrossingFlow: CatalogCase['run'] = (backend) => {
  const managed = runCrossingFlow(backend, true)
  const native = runCrossingFlow(backend, false)
  return check(managed.status === 'pass',
    'Native incremental rebuild with controlled entry and parking: ' + managed.detail +
    '. Native crowd-only baseline (' + native.status + '): ' + native.detail)
}
