import {
  addTile, BuildContext, buildCompactHeightfield, buildContours, buildDistanceField, buildPolyMesh,
  buildPolyMeshDetail, buildRegions, buildTile, ContourBuildFlags, erodeWalkableArea, markBoxArea,
  NULL_AREA, polyMeshDetailToTileDetailMesh, polyMeshToTilePolys, removeTile, WALKABLE_AREA,
  type Box3, type Heightfield, type NavMesh, type NavMeshTile
} from 'navcat'
import { CELL_SIZE } from './native-tiles'

export function replaceNavcatObstacleTile(
  mesh: NavMesh, tile: NavMeshTile, heightfield: Heightfield, obstacles: readonly Box3[], radius: number
) {
  const ctx = BuildContext.create()
  const radiusVoxels = Math.ceil(radius / CELL_SIZE)
  const compact = buildCompactHeightfield(ctx, 28, 2, heightfield)
  erodeWalkableArea(radiusVoxels, compact)
  for (const bounds of obstacles) markBoxArea(bounds, NULL_AREA, compact)
  buildDistanceField(compact)
  buildRegions(ctx, compact, radiusVoxels + 3, 1, 1)
  const contours = buildContours(ctx, compact, 0.35, 80, ContourBuildFlags.CONTOUR_TESS_WALL_EDGES)
  const polygons = buildPolyMesh(ctx, contours, 6)
  for (let i = 0; i < polygons.nPolys; i++) {
    if (polygons.areas[i] === WALKABLE_AREA) polygons.areas[i] = 0
    if (polygons.areas[i] === 0) polygons.flags[i] = 1
  }
  const detail = buildPolyMeshDetail(ctx, polygons, compact, 0.25, 0.05)
  const data = polyMeshToTilePolys(polygons)
  const fullTile = buildTile({ ...tile, bounds: polygons.bounds, ...data, ...polyMeshDetailToTileDetailMesh(data.polys, detail) })
  if (!removeTile(mesh, tile.tileX, tile.tileY, tile.tileLayer)) throw new Error('Could not remove a live obstacle tile.')
  addTile(mesh, fullTile)
}
