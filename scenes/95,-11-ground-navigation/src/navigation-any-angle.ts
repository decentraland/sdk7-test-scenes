import {
  findNodePath, findStraightPath, FindStraightPathOptions, FindStraightPathResultFlags,
  raycastWithCosts, StraightPathPointFlags, type NavMesh, type NodeRef, type QueryFilter, type Vec3
} from 'navcat'

type Endpoint = { nodeRef: NodeRef; position: Vec3 }

// The ray supplies every crossed polygon. A detached any-angle search link
// alone cannot be passed to the funnel as a corridor.
export function findNavcatPathWithShortcut(
  mesh: NavMesh, from: Endpoint, to: Endpoint, filter: QueryFilter, maxShortcutDistance: number
) {
  function follow(corridor: NodeRef[]) {
    if (corridor[corridor.length - 1] !== to.nodeRef) return
    const straight = findStraightPath(mesh, from.position, to.position, corridor, null, FindStraightPathOptions.ALL_CROSSINGS)
    const last = straight.path[straight.path.length - 1]
    if (!straight.success || straight.flags & FindStraightPathResultFlags.PARTIAL_PATH ||
        !last || !(last.flags & StraightPathPointFlags.END) ||
        Math.hypot(...last.position.map((value, axis) => value - to.position[axis])) > 1e-4) return

    let cost = 0
    for (let i = 1; i < straight.path.length; i++) {
      const source = straight.path[i - 1]
      const target = straight.path[i]
      if (source.nodeRef === null) return
      cost += filter.getCost(source.position, target.position, mesh,
        straight.path[i - 2]?.nodeRef ?? undefined, source.nodeRef, target.nodeRef ?? undefined)
    }
    return { path: straight.path, cost }
  }

  const ordinary = findNodePath(mesh, from.nodeRef, to.nodeRef, from.position, to.position, filter)
  const baseline = ordinary.success ? follow(ordinary.path) : undefined
  if (maxShortcutDistance <= 0 ||
      Math.hypot(...from.position.map((value, axis) => value - to.position[axis])) > maxShortcutDistance) {
    return baseline
  }

  const ray = raycastWithCosts(mesh, from.nodeRef, from.position, to.position, filter, from.nodeRef)
  // Raycasts are planar. The last polygon must be the requested goal polygon.
  const candidate = ray.t >= 1 ? follow(ray.path) : undefined
  return candidate && (!baseline || candidate.cost <= baseline.cost) ? candidate : baseline
}
