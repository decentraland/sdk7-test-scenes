import {
  addOffMeshConnection, createDefaultQueryFilter, createFindNearestPolyResult, DEFAULT_QUERY_FILTER, findNearestPoly,
  findNodePath, findRandomPointAroundCircle, findStraightPath, FindStraightPathOptions, FindStraightPathResultFlags,
  getNodeByRef, getNodeByTileAndPoly, getPolyWallSegments, getTileAndPolyByRef, isValidNodeRef,
  NodeType, OffMeshConnectionDirection, queryPolygons, removeOffMeshConnection, StraightPathPointFlags,
  type NavMesh, type Vec3
} from 'navcat'
import { crowd, floodFillNavMesh, generateTiledNavMesh } from 'navcat/blocks'
import type { Point } from '../arena'
import { bakeNavcatMesh, toRecastGeometry } from '../navigation'
import {
  ENGINE_BAKE, SNAP, SPILL_AREA, TILE_EDGE, type EngineFactory, type Link, type Policy, type RecipeCrowd
} from './recipe-engine-types'

const native = ([x, y, z]: Point): Vec3 => [x, y, -z]
const local = ([x, y, z]: Vec3): Point => [x, y, -z]

function filterFor({ flags = 0xffff, spillCost = 1 }: Policy = {}) {
  const filter = createDefaultQueryFilter()
  filter.includeFlags = flags
  const baseCost = filter.getCost
  filter.getCost = (a, b, mesh, previous, current, next) =>
    baseCost(a, b, mesh, previous, current, next) * (getNodeByRef(mesh, current).area === SPILL_AREA ? spillCost : 1)
  return filter
}

function attach(mesh: NavMesh, link: Link) {
  return addOffMeshConnection(mesh, {
    start: native(link.from), end: native(link.to), radius: 0.45,
    direction: OffMeshConnectionDirection.START_TO_END, flags: link.flags, area: 0
  })
}

function nearest(mesh: NavMesh, point: Point, policy?: Policy) {
  const hit = findNearestPoly(createFindNearestPolyResult(), mesh, native(point), [...SNAP], filterFor(policy))
  return hit.success && Math.abs(hit.position[1] - point[1]) <= SNAP[1]
    ? { ref: hit.nodeRef, point: local(hit.position) } : undefined
}

function makeCrowd(mesh: NavMesh): RecipeCrowd {
  const group = crowd.create(ENGINE_BAKE.radius)
  const ids: string[] = []
  const policies: Policy[] = []
  return {
    add(point, policy = {}) {
      const id = crowd.addAgent(group, mesh, native(point), {
        radius: ENGINE_BAKE.radius, height: ENGINE_BAKE.height, maxSpeed: 2, maxAcceleration: 8,
        collisionQueryRange: 1.4, separationWeight: 0, updateFlags: 0, queryFilter: filterFor(policy)
      })
      if (group.agents[id].state === crowd.AgentState.INVALID) throw new Error('Crowd placement failed')
      policies.push(policy)
      return ids.push(id) - 1
    },
    setPolicy(agent, policy) {
      crowd.resetMoveTarget(group, ids[agent])
      group.agents[ids[agent]].queryFilter = filterFor(policy)
      policies[agent] = policy
    },
    goal(agent, point) {
      const goal = nearest(mesh, point, policies[agent])
      return goal !== undefined && crowd.requestMoveTarget(group, ids[agent], goal.ref, native(goal.point))
    },
    velocity: (agent, velocity) => crowd.requestMoveVelocity(group, ids[agent], native(velocity)),
    reset: (agent) => { crowd.resetMoveTarget(group, ids[agent]) },
    position: (agent) => local(group.agents[ids[agent]].position),
    step: (dt) => crowd.update(group, mesh, dt),
    dispose() {
      for (const id of ids) crowd.removeAgent(group, id)
    }
  }
}

export const buildEngineNavcat: EngineFactory = ({ surfaces, tiled, minRegionSize, links = [] }) => {
  const b = { ...ENGINE_BAKE, minRegionSize: minRegionSize ?? ENGINE_BAKE.minRegionSize }
  const radiusVoxels = Math.ceil(b.radius / b.cellSize)
  const mesh = tiled ? generateTiledNavMesh(toRecastGeometry(surfaces), {
    cellSize: b.cellSize, cellHeight: b.cellHeight, tileSizeVoxels: TILE_EDGE / b.cellSize, tileSizeWorld: TILE_EDGE,
    walkableRadiusVoxels: radiusVoxels, walkableRadiusWorld: b.radius, walkableClimbVoxels: Math.round(b.climb / b.cellHeight),
    walkableClimbWorld: b.climb, walkableHeightVoxels: Math.ceil(b.height / b.cellHeight), walkableHeightWorld: b.height,
    walkableSlopeAngleDegrees: b.slope, borderSize: radiusVoxels + 3,
    minRegionArea: b.minRegionSize ** 2, mergeRegionArea: b.mergeRegionSize ** 2,
    maxSimplificationError: b.maxSimplificationError, maxEdgeLength: b.maxEdgeLength, maxVerticesPerPoly: b.maxVerticesPerPoly,
    detailSampleDistance: b.detailSampleDistanceVoxels * b.cellSize,
    detailSampleMaxError: b.detailSampleErrorVoxels * b.cellHeight
  }).navMesh : bakeNavcatMesh(surfaces, b)
  const keys = new Map(links.map((link) => [attach(mesh, link), link.key]))

  function setFlags(ref: number, flags: number) {
    const pair = getTileAndPolyByRef(ref, mesh)
    const node = getNodeByRef(mesh, ref)
    if (pair.success) pair.poly.flags = flags
    node.flags = flags
  }

  return {
    project: (point, policy) => nearest(mesh, point, policy),
    corridor(start, goal, policy) {
      const from = nearest(mesh, start, policy)
      const to = nearest(mesh, goal, policy)
      if (!from || !to) return
      const result = findNodePath(mesh, from.ref, to.ref, native(from.point), native(to.point), filterFor(policy))
      if (result.success && result.path[result.path.length - 1] === to.ref) return { refs: result.path, from, to }
    },
    straight({ from, to, refs }, mode, limit) {
      const options = mode === 'all' ? FindStraightPathOptions.ALL_CROSSINGS : mode === 'areas' ? FindStraightPathOptions.AREA_CROSSINGS : 0
      const result = findStraightPath(mesh, native(from.point), native(to.point), [...refs], limit ?? null, options)
      return {
        points: result.path.map(({ position }) => local(position)),
        success: result.success, end: Boolean((result.path[result.path.length - 1]?.flags ?? 0) & StraightPathPointFlags.END),
        limited: Boolean(result.flags & FindStraightPathResultFlags.MAX_POINTS_REACHED)
      }
    },
    random(center, radius, count, seed) {
      let state = seed
      const rand = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return state / 0x100000000
      }
      const points: Point[] = []
      for (let i = 0; i < count; i++) {
        const hit = findRandomPointAroundCircle(mesh, center.ref, native(center.point), radius, DEFAULT_QUERY_FILTER, rand)
        if (hit.success) points.push(local(hit.position))
      }
      return points
    },
    polygons() {
      return Object.values(mesh.tiles).flatMap((tile) => tile.polys.map((poly, i) => ({
        ref: getNodeByTileAndPoly(mesh, tile, i).ref, flags: poly.flags,
        vertices: poly.vertices.map((v): Point => [tile.vertices[v * 3], tile.vertices[v * 3 + 1], -tile.vertices[v * 3 + 2]])
      })))
    },
    queryBox([x, y, z], [a, b, c]) {
      return { refs: queryPolygons(mesh, [x - a, y - b, -z - c, x + a, y + b, -z + c], DEFAULT_QUERY_FILTER), limited: false }
    },
    setArea(ref, area) {
      const pair = getTileAndPolyByRef(ref, mesh)
      if (!pair.success) throw new Error('Could not assign polygon area')
      pair.poly.area = getNodeByRef(mesh, ref).area = area
    },
    setFlags,
    linkKey(ref) {
      if (!isValidNodeRef(mesh, ref)) return
      const node = getNodeByRef(mesh, ref)
      return node.type === NodeType.OFFMESH ? keys.get(node.offMeshConnectionId) : undefined
    },
    replaceLink(link, nextKey, staleRef) {
      if (!isValidNodeRef(mesh, staleRef)) return false
      const previousId = getNodeByRef(mesh, staleRef).offMeshConnectionId
      removeOffMeshConnection(mesh, previousId)
      keys.delete(previousId)
      const nextId = attach(mesh, link)
      keys.set(nextId, nextKey)
      return nextId === previousId && !isValidNodeRef(mesh, staleRef)
    },
    prune(seeds) {
      for (const ref of floodFillNavMesh(mesh, [...seeds]).unreachable) setFlags(ref, 0)
    },
    walls(ref, policy, includePortals) {
      const result = getPolyWallSegments(mesh, ref, filterFor(policy), includePortals)
      if (!result.success) return []
      return result.segmentRefs.map((segmentRef, i) => {
        const offset = i * 6
        const point = (index: number): Point => [
          result.segmentVerts[index], result.segmentVerts[index + 1], -result.segmentVerts[index + 2]
        ]
        return { ref: segmentRef, a: point(offset), b: point(offset + 3) }
      })
    },
    crowd: () => makeCrowd(mesh),
    dispose() {}
  }
}
