import { parentPort, workerData } from 'node:worker_threads'
import {
  BuildContext, buildCompactHeightfield, buildContours, buildDistanceField, buildPolyMesh, buildPolyMeshDetail,
  buildRegions, buildTile, ContourBuildFlags, createHeightfield, erodeWalkableArea, filterLedgeSpans,
  filterLowHangingWalkableObstacles, filterWalkableLowHeightSpans, markWalkableTriangles, polyMeshDetailToTileDetailMesh,
  polyMeshToTilePolys, rasterizeTriangles, WALKABLE_AREA, type NavMeshTile
} from 'navcat'
import {
  FloatArray, init, IntArray, Raw, RecastChunkyTriMesh
} from 'recast-navigation'
import { buildTiledNavMeshRcConfig, generateTileNavMeshData, tiledNavMeshGeneratorConfigDefaults } from 'recast-navigation/generators'
import { CELL_SIZE, TILE_EDGE } from './native-tiles'
import type { TraversalBackend } from '../sdk-detour-probe/traversal-routing'

export type TileCoordinate = readonly [x: number, y: number]
export type WorldBounds = [[number, number, number], [number, number, number]]
export type TileJob = {
  id: number
  coordinates: TileCoordinate
  bounds: WorldBounds
  positions: Float32Array
  indices: Uint32Array
  progress: SharedArrayBuffer
}
export type TilePatch =
  | { backend: 'navcat'; coordinates: TileCoordinate; tile?: NavMeshTile }
  | { backend: 'detour'; coordinates: TileCoordinate; bytes?: Uint8Array }

const REVISION_RADIUS = 0.18
const cellHeight = 0.05
const tileVoxels = Math.round(TILE_EDGE / CELL_SIZE)
const radiusVoxels = Math.ceil(REVISION_RADIUS / CELL_SIZE)
const border = radiusVoxels + 3
const climbVoxels = 2
const heightVoxels = 28

function buildNavcat(job: TileJob): TilePatch {
  const [x, y] = job.coordinates
  const [min, max] = job.bounds
  const startX = min[0] + x * TILE_EDGE
  const startZ = min[2] + y * TILE_EDGE
  const padding = border * CELL_SIZE
  const bounds: [number, number, number, number, number, number] = [
    startX - padding, min[1], startZ - padding, startX + TILE_EDGE + padding, max[1], startZ + TILE_EDGE + padding
  ]
  const { positions, indices } = job
  const context = BuildContext.create()
  const size = tileVoxels + 2 * border
  const heightfield = createHeightfield(size, size, bounds, CELL_SIZE, cellHeight)
  const areas = new Uint8Array(indices.length / 3)
  markWalkableTriangles(positions, indices, areas, 40)
  rasterizeTriangles(context, heightfield, positions, indices, areas, climbVoxels)
  filterLowHangingWalkableObstacles(heightfield, climbVoxels)
  filterLedgeSpans(heightfield, heightVoxels, climbVoxels)
  filterWalkableLowHeightSpans(heightfield, heightVoxels)
  const compact = buildCompactHeightfield(context, heightVoxels, climbVoxels, heightfield)
  erodeWalkableArea(radiusVoxels, compact)
  buildDistanceField(compact)
  buildRegions(context, compact, border, 1, 1)
  const contours = buildContours(context, compact, 0.35, 80, ContourBuildFlags.CONTOUR_TESS_WALL_EDGES)
  const polygons = buildPolyMesh(context, contours, 6)
  if (!polygons.nPolys) return { backend: 'navcat', coordinates: job.coordinates }
  for (let i = 0; i < polygons.nPolys; i++) {
    if (polygons.areas[i] === WALKABLE_AREA) polygons.areas[i] = 0
    if (polygons.areas[i] === 0) polygons.flags[i] = 1
  }
  const detail = buildPolyMeshDetail(context, polygons, compact, 0.25, cellHeight)
  const polyData = polyMeshToTilePolys(polygons)
  const tile = buildTile({
    ...polyData, ...polyMeshDetailToTileDetailMesh(polyData.polys, detail),
    bounds: polygons.bounds, tileX: x, tileY: y, tileLayer: 0,
    cellSize: CELL_SIZE, cellHeight, walkableHeight: 1.4, walkableClimb: 0.1, walkableRadius: REVISION_RADIUS
  })
  return { backend: 'navcat', coordinates: job.coordinates, tile }
}

function buildDetour(job: TileJob): TilePatch {
  const { config } = buildTiledNavMeshRcConfig({
    recastConfig: {
      ...tiledNavMeshGeneratorConfigDefaults,
      cs: CELL_SIZE, ch: cellHeight, tileSize: tileVoxels, borderSize: border,
      walkableHeight: heightVoxels, walkableClimb: climbVoxels, walkableRadius: radiusVoxels,
      walkableSlopeAngle: 40, minRegionArea: 1, mergeRegionArea: 1,
      maxSimplificationError: 0.35, maxEdgeLen: 80, maxVertsPerPoly: 6, detailSampleDist: 5, detailSampleMaxError: 1
    },
    navMeshBounds: job.bounds
  })
  const positions = new FloatArray()
  const indices = new IntArray()
  const tree = new RecastChunkyTriMesh()
  try {
    positions.copy(job.positions)
    indices.copy(Int32Array.from(job.indices))
    if (!tree.init(positions, indices, job.indices.length / 3, 128)) throw new Error('Could not build worker triangle index.')
    const [x, y] = job.coordinates
    const [min, max] = job.bounds
    const result = generateTileNavMeshData(positions, indices, config, tree, {
      x, y,
      bmin: [min[0] + x * TILE_EDGE, min[1], min[2] + y * TILE_EDGE],
      bmax: [min[0] + (x + 1) * TILE_EDGE, max[1], min[2] + (y + 1) * TILE_EDGE]
    }, { buildBvTree: true })
    if (!result.success) throw new Error(result.error)
    try {
      return { backend: 'detour', coordinates: job.coordinates, bytes: result.data?.toTypedArray() }
    } finally {
      result.data?.destroy()
    }
  } finally {
    tree.destroy()
    positions.destroy()
    indices.destroy()
    Raw.destroy(config)
  }
}

const { backend } = workerData as { backend: TraversalBackend }
if (backend === 'detour') await init()
if (!parentPort) throw new Error('A revision tile builder needs a worker port.')
const port = parentPort
port.on('message', (job: TileJob) => {
  const progress = new Int32Array(job.progress)
  Atomics.store(progress, 0, 1)
  try {
    const patch = backend === 'navcat' ? buildNavcat(job) : buildDetour(job)
    Atomics.store(progress, 0, 2)
    port.postMessage({ id: job.id, patch })
  } catch (error) {
    Atomics.store(progress, 0, 2)
    port.postMessage({ id: job.id, error: String(error) })
  }
})
port.postMessage({ ready: true })
