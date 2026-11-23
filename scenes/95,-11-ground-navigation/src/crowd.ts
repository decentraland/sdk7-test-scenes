import { DEFAULT_QUERY_FILTER, createFindNearestPolyResult, findNearestPoly, type NavMesh, type Vec3 } from 'navcat'
import { crowd } from 'navcat/blocks'
import { OPPOSING_GROUPS, type Point } from './arena'
import { SNAP_EXTENTS, withinSnap } from './navigation'

export type CrowdMetrics = { total: number; arrived: number; minCenterDistance: number; overlapSteps: number }
export type CrowdRun = { step(dt: number): void; positions(): Point[] }

const { agents, radius, height, maxSpeed, maxAcceleration, arrivalRadius } = OPPOSING_GROUPS

function reflect([x, y, z]: Point): Vec3 {
  return [x, y, -z]
}

export function createNavcatCrowd(mesh: NavMesh): CrowdRun {
  const group = crowd.create(radius)
  const ids = agents.map(({ start, goal }) => {
    const id = crowd.addAgent(group, mesh, reflect(start), {
      radius, height, maxSpeed, maxAcceleration,
      collisionQueryRange: radius * 8,
      separationWeight: 0,
      updateFlags: crowd.CrowdUpdateFlags.ANTICIPATE_TURNS | crowd.CrowdUpdateFlags.OBSTACLE_AVOIDANCE,
      queryFilter: DEFAULT_QUERY_FILTER
    })
    const target = findNearestPoly(createFindNearestPolyResult(), mesh, reflect(goal), SNAP_EXTENTS, DEFAULT_QUERY_FILTER)
    if (group.agents[id].state === crowd.AgentState.INVALID ||
        !target.success || !withinSnap(target.position, reflect(goal)) ||
        !crowd.requestMoveTarget(group, id, target.nodeRef, target.position)) {
      throw new Error('Could not place a navcat crowd agent on the upper deck')
    }
    return id
  })
  return {
    step: (dt) => crowd.update(group, mesh, dt),
    positions: () => ids.map((id) => reflect(group.agents[id].position))
  }
}

export function createCrowdObserver() {
  const arrived = new Set<number>()
  let minCenterDistance = Infinity
  let overlapSteps = 0
  return {
    observe(positions: readonly Point[]) {
      let overlapping = false
      positions.forEach(([x, y, z], i) => {
        const [gx, gy, gz] = agents[i].goal
        if (Math.hypot(x - gx, y - gy, z - gz) <= arrivalRadius) arrived.add(i)
        for (let j = 0; j < i; j++) {
          const [px, , pz] = positions[j]
          const distance = Math.hypot(x - px, z - pz)
          minCenterDistance = Math.min(minCenterDistance, distance)
          overlapping ||= distance < 2 * radius - 0.02
        }
      })
      if (overlapping) overlapSteps++
    },
    metrics(): CrowdMetrics {
      return { total: agents.length, arrived: arrived.size, minCenterDistance, overlapSteps }
    }
  }
}
