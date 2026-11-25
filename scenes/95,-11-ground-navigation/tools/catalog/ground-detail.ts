import { createFindNearestPolyResult, createGetPolyHeightResult, DEFAULT_QUERY_FILTER,
  findNearestPoly, getPolyHeight, getTileAndPolyByRef } from 'navcat'
import { NavMeshQuery, Raw } from 'recast-navigation'
import type { Point, Surface } from '../../src/arena'
import { floor } from './ground'
import { detourPoint, detourTiles, nativePoint, navcatTiles } from './native-tiles'
import { check, type CatalogCase } from './types'

const samples: Point[] = [3.98, 4, 4.02].map((x) => [x, 2, 3])
const onDeck = (height: number) => Number.isFinite(height) && Math.abs(height - 2) < 0.15

function detourDegenerateDetails(surfaces: Surface[]) {
  const mesh = detourTiles(surfaces)
  const query = new NavMeshQuery(mesh)
  try {
    const halfExtents = { x: 0.3, y: 0.3, z: 0.3 }
    const anchors = samples.map(detourPoint).map((position) => ({
      position, ref: query.findNearestPoly(position, { halfExtents }).nearestRef
    }))
    if (anchors.some(({ ref }) => !ref)) return check(false, 'The clean fixture must hit all three deck samples.')
    const sample = () => anchors.map(({ ref, position }) => query.getPolyHeight(ref, position))
    const initial = sample()
    let triangles = 0
    for (const ref of new Set(anchors.map(({ ref }) => ref))) {
      const { tile, poly, success } = mesh.getTileAndPolyByRef(ref)
      const header = tile.header()
      if (!success || !header) return check(false, 'Projection did not return a live tile and polygon.')
      const detail = tile.detailMeshes(ref - mesh.getPolyRefBase(tile))
      if (!detail.triCount()) return check(false, 'The fixture polygon has no detail triangles to replace.')
      for (let i = 0; i < detail.triCount(); i++) {
        const at = 4 * (detail.triBase() + i)
        if (at + 3 >= 4 * header.detailTriCount()) return check(false, 'Detail triangle index lies outside its tile.')
        const vertex = tile.detailTris(at)
        if (vertex >= poly.vertCount() + detail.vertCount()) return check(false, 'Detail vertex index lies outside its polygon.')
        // Duplicate an existing vertex to force zero area while preserving the edge flags.
        tile.raw.set_detailTris(at + 1, vertex)
        tile.raw.set_detailTris(at + 2, vertex)
        if (tile.detailTris(at + 1) !== vertex || tile.detailTris(at + 2) !== vertex) {
          return check(false, 'The native detail-triangle fixture was not modified.')
        }
        triangles++
      }
    }
    const malformed = sample()
    return check(triangles > 0 && [...initial, ...malformed].every(({ success, height }) => success && onDeck(height)),
      'Native height queries before and after all sampled detail triangles were collapsed: ' +
      JSON.stringify({ triangles, initial, malformed }))
  } finally {
    Raw.destroy(query.defaultFilter.raw)
    query.destroy()
    mesh.destroy()
  }
}

export const degenerateDetails: CatalogCase['run'] = (backend) => {
  const surfaces = [floor(0, 4, 0, 6, 2), floor(4, 8, 0, 6, 2)]
  if (backend === 'detour') return detourDegenerateDetails(surfaces)
  const mesh = navcatTiles(surfaces)
  const anchors = samples.map((point) => {
    const position = nativePoint(point)
    const nearest = findNearestPoly(createFindNearestPolyResult(), mesh, position, [0.3, 0.3, 0.3], DEFAULT_QUERY_FILTER)
    return { position, polyRef: nearest.success ? getTileAndPolyByRef(nearest.nodeRef, mesh) : undefined }
  })
  const sample = () => anchors.map(({ position, polyRef }) => polyRef?.success
    ? getPolyHeight(createGetPolyHeightResult(), polyRef.tile, polyRef.poly, polyRef.polyIndex, position) : undefined)
  const initial = sample()
  let triangles = 0
  for (const { position, polyRef } of anchors) {
    if (!polyRef?.success) continue
    const { tile, poly, polyIndex } = polyRef
    const detail = tile.detailMeshes[polyIndex]
    detail.verticesBase = tile.detailVertices.length / 3
    detail.verticesCount = 3
    const [x, y, z] = position
    tile.detailVertices.push(x, y + 0.05, z, x + 1e-7, y + 0.05, z, x, y + 0.05, z + 1e-8)
    // Replace every tested triangle so a good triangle cannot hide failure of the fallback.
    for (let i = 0; i < detail.trianglesCount; i++) {
      const at = 4 * (detail.trianglesBase + i)
      tile.detailTriangles[at] = poly.vertices.length
      tile.detailTriangles[at + 1] = poly.vertices.length + 1
      tile.detailTriangles[at + 2] = poly.vertices.length + 2
      triangles++
    }
  }
  const malformed = sample()
  return check(triangles > 0 && initial.every((value) => value !== undefined && (!value.success || onDeck(value.height))) &&
    initial.filter((value) => value?.success).length >= 2 &&
    malformed.every((value) => value !== undefined && (!value.success || onDeck(value.height))),
  'Direct height reads after replacing baked detail triangles with near-coincident vertices: ' +
    JSON.stringify({ triangles, initial, malformed }))
}
