import { createFindNearestPolyResult, createGetPolyHeightResult, DEFAULT_QUERY_FILTER,
  findNearestPoly, getPolyHeight, getTileAndPolyByRef } from 'navcat'
import type { Point } from '../../src/arena'
import { floor } from './ground'
import { nativePoint, navcatTiles } from './native-tiles'
import { check, unsupported, type CatalogCase } from './types'

const samples: Point[] = [3.98, 4, 4.02].map((x) => [x, 2, 3])
const onDeck = (height: number) => Number.isFinite(height) && Math.abs(height - 2) < 0.15

export const degenerateDetails: CatalogCase['run'] = (backend) => {
  if (backend === 'detour') {
    return unsupported('recast-navigation 0.44 declares setDetailTris but its WASM binding has no set_detailTris. The malformed detail input cannot be injected through this adapter.')
  }
  const surfaces = [floor(0, 4, 0, 6, 2), floor(4, 8, 0, 6, 2)]
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
