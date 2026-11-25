import {
  FloatArray, Raw, UnsignedIntArray, statusSucceed, type NavMeshQuery, type QueryFilter, type Vector3
} from 'recast-navigation'

type GetSegments = (
  ref: number, filter: QueryFilter['raw'], vertices: FloatArray['raw'], neighbours: UnsignedIntArray['raw'],
  count: InstanceType<typeof Raw.IntRef>, maxSegments: number, includePortals: boolean
) => number

export function supportsDetourWallSegments() {
  const query = Raw.Module.NavMeshQuery.prototype as { getPolyWallSegments?: GetSegments }
  return typeof query.getPolyWallSegments === 'function'
}

export function readDetourWallSegments(
  query: NavMeshQuery, ref: number,
  { filter = query.defaultFilter, includePortals = false, maxSegments = 64 }:
    { filter?: QueryFilter; includePortals?: boolean; maxSegments?: number } = {}
) {
  if (!Number.isInteger(maxSegments) || maxSegments < 1 || maxSegments > 0x7fffffff / 6) {
    throw new RangeError('maxSegments must be a positive integer within the segment buffer limit')
  }
  // This adapter also works with the stock 0.44.0 TypeScript package when its WASM is replaced.
  const native = query.raw as typeof query.raw & { getPolyWallSegments?: GetSegments }
  if (!native.getPolyWallSegments) throw new Error('The loaded Detour WASM has no wall-segment binding.')
  const vertices = new FloatArray()
  const neighbours = new UnsignedIntArray()
  const count = new Raw.IntRef()
  try {
    vertices.resize(maxSegments * 6)
    if (includePortals) neighbours.resize(maxSegments)
    const status = native.getPolyWallSegments(ref, filter.raw, vertices.raw, neighbours.raw, count, maxSegments, includePortals)
    const coordinates = vertices.getHeapView()
    const refs = includePortals ? neighbours.getHeapView() : undefined
    const point = (offset: number): Vector3 => ({ x: coordinates[offset], y: coordinates[offset + 1], z: coordinates[offset + 2] })
    const segments = Array.from({ length: count.value }, (_, i) => ({
      start: point(i * 6), end: point(i * 6 + 3), neighbourRef: refs?.[i] ?? 0
    }))
    return { success: statusSucceed(status), status, segments }
  } finally {
    Raw.destroy(count)
    neighbours.destroy()
    vertices.destroy()
  }
}
