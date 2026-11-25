import type { Point, Surface } from './types'
export type { Navigator, Route } from './types'

export const NAVIGATION_BAKE = {
  cellSize: 0.15,
  cellHeight: 0.1,
  radius: 0.3,
  height: 1.6,
  climb: 0.3,
  slope: 40,
  minRegionSize: 4,
  mergeRegionSize: 12,
  maxSimplificationError: 1.3,
  maxEdgeLength: 12,
  maxVerticesPerPoly: 6,
  detailSampleDistanceVoxels: 6,
  detailSampleErrorVoxels: 1,
}
export type NavigationBake = typeof NAVIGATION_BAKE

export const SNAP_EXTENTS: [number, number, number] = [0.55, 0.35, 0.55]

export function withinSnap(point: Point, requested: Point): boolean {
  return (
    Math.abs(point[0] - requested[0]) <= SNAP_EXTENTS[0] &&
    Math.abs(point[1] - requested[1]) <= SNAP_EXTENTS[1] &&
    Math.abs(point[2] - requested[2]) <= SNAP_EXTENTS[2]
  )
}

export function reflectZ(point: Point): [number, number, number] {
  return [point[0], point[1], -point[2]]
}

export function toRecastGeometry(surfaces: readonly Surface[]) {
  const positions: number[] = []
  const indices: number[] = []
  for (const { vertices, triangles } of surfaces) {
    const base = positions.length / 3
    for (const vertex of vertices) positions.push(...reflectZ(vertex))
    // Reflection changes handedness. Reverse winding so floor triangles still face up.
    for (let i = 0; i < triangles.length; i += 3) {
      indices.push(base + triangles[i], base + triangles[i + 2], base + triangles[i + 1])
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
}
