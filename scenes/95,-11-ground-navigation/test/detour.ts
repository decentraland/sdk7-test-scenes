import { Crowd, type NavMesh } from 'recast-navigation'
import { OPPOSING_GROUPS, type Surface } from '../src/arena'
import type { CrowdRun, CrowdSettings } from '../src/crowd'
import type { Navigator } from '../src/navmesh/types'
import { bakeDetourMesh } from '../tools/navmesh/bake-detour'

import { createDetourNavigatorFromMesh, fromDetour, toDetour } from '../src/navmesh/detour-query'
export { bakeDetourMesh } from '../tools/navmesh/bake-detour'
export { createDetourNavigatorFromMesh } from '../src/navmesh/detour-query'
export type { DetourQueryLimits } from '../src/navmesh/detour-query'

export function createDetourNavigator(surfaces: readonly Surface[]): Navigator & { dispose(): void } {
  return createDetourNavigatorFromMesh(bakeDetourMesh(surfaces))
}

export function createDetourCrowd(surfaces: readonly Surface[]): CrowdRun & { dispose(): void } {
  return createDetourCrowdFromMesh(bakeDetourMesh(surfaces))
}

// Takes ownership of the mesh, including releasing it on dispose().
export function createDetourCrowdFromMesh(
  mesh: NavMesh, settings: CrowdSettings = OPPOSING_GROUPS
): CrowdRun & { dispose(): void } {
  const { agents, radius, height, maxAcceleration, maxSpeed } = settings
  const crowd = new Crowd(mesh, { maxAgents: agents.length, maxAgentRadius: radius })
  const dispose = () => {
    crowd.destroy()
    mesh.destroy()
  }
  try {
    const controllers = agents.map(({ start, goal }) => {
      const agent = crowd.addAgent(toDetour(start), {
        radius, height, maxAcceleration, maxSpeed,
        collisionQueryRange: radius * 8,
        separationWeight: 0,
        updateFlags: 1 | 2  // DT_CROWD_ANTICIPATE_TURNS | DT_CROWD_OBSTACLE_AVOIDANCE
      })
      if (agent.state() === 0 || !agent.requestMoveTarget(toDetour(goal))) {
        throw new Error('Could not place a Detour crowd agent at ' + start.join(', '))
      }
      return agent
    })
    return {
      step: (dt) => crowd.update(dt),
      positions: () => controllers.map((agent) => fromDetour(agent.position())),
      dispose
    }
  } catch (error) {
    dispose()
    throw error
  }
}
