import { exportNavMesh, type OffMeshConnectionParams } from 'recast-navigation'
import { generateSoloNavMesh } from 'recast-navigation/generators'
import { initializeDetour } from '../../src/navmesh/detour-runtime'
import { NAVIGATION_BAKE, toRecastGeometry, type NavigationBake } from '../../src/navmesh/geometry'
import type { PreparedMesh, Surface } from '../../src/navmesh/types'

export function bakeDetourMesh(
  surfaces: readonly Surface[], bake: NavigationBake = NAVIGATION_BAKE, offMeshConnections?: OffMeshConnectionParams[]
) {
  const { positions, indices } = toRecastGeometry(surfaces)
  const result = generateSoloNavMesh(positions, indices, {
    cs: bake.cellSize,
    ch: bake.cellHeight,
    walkableSlopeAngle: bake.slope,
    walkableRadius: Math.ceil(bake.radius / bake.cellSize),
    walkableHeight: Math.ceil(bake.height / bake.cellHeight),
    walkableClimb: Math.round(bake.climb / bake.cellHeight),
    maxEdgeLen: bake.maxEdgeLength,
    maxSimplificationError: bake.maxSimplificationError,
    minRegionArea: bake.minRegionSize,
    mergeRegionArea: bake.mergeRegionSize,
    maxVertsPerPoly: bake.maxVerticesPerPoly,
    detailSampleDist: bake.detailSampleDistanceVoxels,
    detailSampleMaxError: bake.detailSampleErrorVoxels,
    offMeshConnections,
  })
  if (!result.success) throw new Error(`Detour bake failed: ${result.error}`)
  return result.navMesh
}

export async function prepareMesh(surfaces: readonly Surface[], settings?: NavigationBake): Promise<PreparedMesh> {
  await initializeDetour()
  const mesh = bakeDetourMesh(surfaces, settings)
  try {
    return { format: 1, backend: 'detour', mesh: Array.from(exportNavMesh(mesh)) }
  } finally {
    mesh.destroy()
  }
}
