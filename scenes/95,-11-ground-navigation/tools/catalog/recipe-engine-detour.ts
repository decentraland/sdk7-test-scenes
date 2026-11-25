import { Crowd, Detour, floodFillPruneNavMesh, getRandomSeed, NavMeshQuery, Raw, setRandomSeed,
  statusDetail, statusSucceed, type CrowdAgent, type NavMesh, type OffMeshConnectionParams, type QueryFilter,
  type Vector3 } from 'recast-navigation'
import { generateTiledNavMesh } from 'recast-navigation/generators'
import type { Point } from '../../src/arena'
import { toRecastGeometry } from '../../src/navigation'
import { bakeDetourMesh } from '../../test/detour'
import { readDetourWallSegments, supportsDetourWallSegments } from '../sdk-detour-probe/detour-wall-segments'
import {
  ENGINE_BAKE, SNAP, SPILL_AREA, TILE_EDGE, type EngineFactory, type Policy, type RecipeCrowd
} from '../../src/recipes/recipe-engine-types'

const native = ([x, y, z]: Point): Vector3 => ({ x, y, z: -z })
const local = ({ x, y, z }: Vector3): Point => [x, y, -z]
const snap = { x: SNAP[0], y: SNAP[1], z: SNAP[2] }

function configure(filter: QueryFilter, { flags = 0xffff, spillCost = 1 }: Policy = {}) {
  filter.includeFlags = flags
  filter.setAreaCost(SPILL_AREA, spillCost)
}

function nearest(query: NavMeshQuery, point: Point, filter: QueryFilter) {
  const hit = query.findNearestPoly(native(point), { halfExtents: snap, filter })
  return hit.success && hit.nearestRef !== 0 && Math.abs(hit.nearestPoint.y - point[1]) <= SNAP[1]
    ? { ref: hit.nearestRef, point: local(hit.nearestPoint) } : undefined
}

function makeCrowd(mesh: NavMesh, maxAgents: number): RecipeCrowd {
  const crowd = new Crowd(mesh, { maxAgents, maxAgentRadius: ENGINE_BAKE.radius })
  const agents: CrowdAgent[] = []
  const filterSlots: number[] = []
  const byPolicy = new Map<string, number>()
  function slot(policy: Policy) {
    const key = (policy.flags ?? 0xffff) + '/' + (policy.spillCost ?? 1)
    const existing = byPolicy.get(key)
    if (existing !== undefined) return existing
    const assigned = byPolicy.size
    if (assigned >= 16) throw new Error('No native Detour crowd filter slots left')
    configure(crowd.getFilter(assigned), policy)
    byPolicy.set(key, assigned)
    return assigned
  }
  return {
    add(point, policy = {}) {
      const filter = slot(policy)
      const agent = crowd.addAgent(native(point), {
        radius: ENGINE_BAKE.radius, height: ENGINE_BAKE.height, maxSpeed: 2, maxAcceleration: 8,
        collisionQueryRange: 1.4, separationWeight: 0, updateFlags: 0, queryFilterType: filter
      })
      if (agent.state() === 0) throw new Error('Crowd placement failed')
      filterSlots.push(filter)
      return agents.push(agent) - 1
    },
    setPolicy(index, policy) {
      const agent = agents[index]
      agent.resetMoveTarget()
      filterSlots[index] = slot(policy)
      agent.updateParameters({ queryFilterType: filterSlots[index] })
    },
    goal(index, point) {
      // Pin the target to the agent's own filter before giving the crowd the ref.
      const target = nearest(crowd.navMeshQuery, point, crowd.getFilter(filterSlots[index]))
      if (!target) return false
      const [x, y, z] = target.point
      return crowd.raw.requestMoveTarget(agents[index].agentIndex, target.ref, [x, y, -z])
    },
    velocity: (index, velocity) => agents[index].requestMoveVelocity(native(velocity)),
    reset: (index) => agents[index].resetMoveTarget(),
    position: (index) => local(agents[index].position()),
    step: (dt) => crowd.update(dt),
    dispose() {
      Raw.destroy(crowd.navMeshQuery.defaultFilter.raw)
      crowd.destroy()
    }
  }
}

export const buildEngineDetour: EngineFactory = ({ surfaces, tiled, minRegionSize, links = [] }) => {
  const b = { ...ENGINE_BAKE, minRegionSize: minRegionSize ?? ENGINE_BAKE.minRegionSize }
  function bake(connections: OffMeshConnectionParams[] = []) {
    if (!tiled) return bakeDetourMesh(surfaces, b, connections)
    const { positions, indices } = toRecastGeometry(surfaces)
    const radius = Math.ceil(b.radius / b.cellSize)
    const result = generateTiledNavMesh(positions, indices, {
      cs: b.cellSize, ch: b.cellHeight, tileSize: TILE_EDGE / b.cellSize,
      walkableRadius: radius, walkableHeight: Math.ceil(b.height / b.cellHeight), walkableClimb: Math.round(b.climb / b.cellHeight),
      walkableSlopeAngle: b.slope, borderSize: radius + 3,
      minRegionArea: b.minRegionSize, mergeRegionArea: b.mergeRegionSize,
      maxSimplificationError: b.maxSimplificationError, maxEdgeLen: b.maxEdgeLength, maxVertsPerPoly: b.maxVerticesPerPoly,
      detailSampleDist: b.detailSampleDistanceVoxels, detailSampleMaxError: b.detailSampleErrorVoxels,
      offMeshConnections: connections
    })
    if (!result.success) throw new Error('Detour tiled bake failed: ' + result.error)
    return result.navMesh
  }
  function projectedLinks() {
    const ground = bake()
    const probe = new NavMeshQuery(ground)
    try {
      return links.flatMap((link): OffMeshConnectionParams[] => {
        const from = nearest(probe, link.from, probe.defaultFilter)
        const to = nearest(probe, link.to, probe.defaultFilter)
        // The generated detail surface can sit above the source triangles.
        // Author links against that concrete surface; an eroded anchor stays missing.
        return !from || !to ? [] : [{
          startPosition: native(from.point), endPosition: native(to.point), radius: 0.45,
          bidirectional: false, flags: link.flags, userId: link.key
        }]
      })
    } finally {
      Raw.destroy(probe.defaultFilter.raw)
      probe.destroy()
      ground.destroy()
    }
  }
  const mesh = bake(links.length ? projectedLinks() : [])
  const query = new NavMeshQuery(mesh)
  const filter = query.defaultFilter

  return {
    project(point, policy) {
      configure(filter, policy)
      return nearest(query, point, filter)
    },
    corridor(start, goal, policy) {
      configure(filter, policy)
      const from = nearest(query, start, filter)
      const to = nearest(query, goal, filter)
      if (!from || !to) return
      const path = query.findPath(from.ref, to.ref, native(from.point), native(to.point), { filter })
      try {
        const refs = Array.from(path.polys.toTypedArray())
        if (path.success && refs[refs.length - 1] === to.ref) return { refs, from, to }
      } finally {
        path.polys.destroy()
      }
    },
    straight({ from, to, refs }, mode, limit) {
      const options = mode === 'all' ? Detour.DT_STRAIGHTPATH_ALL_CROSSINGS : mode === 'areas' ? Detour.DT_STRAIGHTPATH_AREA_CROSSINGS : 0
      const result = query.findStraightPath(native(from.point), native(to.point), [...refs], {
        straightPathOptions: options, maxStraightPathPoints: limit
      })
      try {
        return {
          points: Array.from({ length: result.straightPathCount }, (_, i): Point =>
            [result.straightPath.get(i * 3), result.straightPath.get(i * 3 + 1), -result.straightPath.get(i * 3 + 2)]),
          success: result.success,
          end: result.straightPathCount > 0 &&
            Boolean(result.straightPathFlags.get(result.straightPathCount - 1) & Detour.DT_STRAIGHTPATH_END),
          limited: statusDetail(result.status, Detour.DT_BUFFER_TOO_SMALL)
        }
      } finally {
        result.straightPath.destroy()
        result.straightPathFlags.destroy()
        result.straightPathRefs.destroy()
      }
    },
    random(center, radius, count, seed) {
      configure(filter)
      const previous = getRandomSeed()
      const points: Point[] = []
      setRandomSeed(seed)
      try {
        for (let i = 0; i < count; i++) {
          const hit = query.findRandomPointAroundCircle(native(center.point), radius, { startRef: center.ref, filter })
          if (hit.success) points.push(local(hit.randomPoint))
        }
        return points
      } finally {
        setRandomSeed(previous)
      }
    },
    polygons() {
      const polys = []
      for (let i = 0; i < mesh.getMaxTiles(); i++) {
        const tile = mesh.getTile(i)
        const header = tile.header()
        if (!header) continue
        const base = mesh.getPolyRefBase(tile)
        for (let j = 0; j < header.polyCount(); j++) {
          const poly = tile.polys(j)
          if (poly.getType() !== 0) continue
          const vertices = Array.from({ length: poly.vertCount() }, (_, k): Point => {
            const offset = poly.verts(k) * 3
            return [tile.verts(offset), tile.verts(offset + 1), -tile.verts(offset + 2)]
          })
          polys.push({ ref: base + j, vertices, flags: poly.flags() })
        }
      }
      return polys
    },
    queryBox(center, [x, y, z], limit) {
      configure(filter)
      const result = query.queryPolygons(native(center), { x, y, z }, { maxPolys: limit, filter })
      if (!result.success) throw new Error('Detour queryPolygons failed: ' + result.status)
      return { refs: [...new Set(result.polyRefs)], limited: statusDetail(result.status, Detour.DT_BUFFER_TOO_SMALL) }
    },
    setArea(ref, area) {
      if (!statusSucceed(mesh.setPolyArea(ref, area))) throw new Error('Could not set Detour polygon area')
    },
    setFlags(ref, flags) {
      if (!statusSucceed(mesh.setPolyFlags(ref, flags))) throw new Error('Could not set Detour polygon flags')
    },
    linkKey(ref) {
      if (!mesh.isValidPolyRef(ref)) return
      const info = mesh.getTileAndPolyByRef(ref)
      return info.success && info.poly.getType() === 1 ? mesh.getOffMeshConnectionByRef(ref).userId() : undefined
    },
    prune: (refs) => floodFillPruneNavMesh(mesh, [...refs]),
    walls: supportsDetourWallSegments() ? (ref, policy, includePortals) => {
      configure(filter, policy)
      const result = readDetourWallSegments(query, ref, { filter, includePortals })
      if (!result.success || statusDetail(result.status, Detour.DT_BUFFER_TOO_SMALL)) {
        throw new Error('Detour wall-segment query failed or was truncated: ' + result.status)
      }
      return result.segments.map(({ start, end, neighbourRef }) => ({
        ref: neighbourRef || null, a: local(start), b: local(end)
      }))
    } : undefined,
    crowd: (maxAgents) => makeCrowd(mesh, maxAgents),
    dispose() {
      Raw.destroy(filter.raw)
      query.destroy()
      mesh.destroy()
    }
  }
}
