import {
  Detour, Raw, UnsignedIntArray, statusInProgress, statusSucceed, type NavMeshQuery, type QueryFilter, type Vector3
} from 'recast-navigation'

type SlicedMethods = {
  initSlicedFindPath(startRef: number, endRef: number, start: number[], end: number[], filter: QueryFilter['raw'], options: number): number
  updateSlicedFindPath(maxIterations: number, done: InstanceType<typeof Raw.IntRef>): number
  finalizeSlicedFindPath(path: UnsignedIntArray['raw'], count: InstanceType<typeof Raw.IntRef>, maxPath: number): number
}

export function supportsDetourSlicedPath() {
  const query = Raw.Module.NavMeshQuery.prototype as Partial<SlicedMethods>
  return typeof query.initSlicedFindPath === 'function' && typeof query.updateSlicedFindPath === 'function' &&
    typeof query.finalizeSlicedFindPath === 'function'
}

type End = { ref: number; position: Vector3 }

/** The query and its filter belong to this search until the result has been collected. */
export function findDetourSlicedPath(
  query: NavMeshQuery, start: End, end: End,
  { anyAngle = false, iterationsPerBatch = 8, maxIterations = 4096, maxPathPolys = 256 } = {}
) {
  if (!supportsDetourSlicedPath()) throw new Error('The loaded Detour WASM has no sliced path binding.')
  if (![iterationsPerBatch, maxIterations, maxPathPolys].every((value) => Number.isInteger(value) && value > 0 && value <= 65535)) {
    throw new RangeError('Sliced search limits must be integers between 1 and 65535.')
  }
  const native = query.raw as typeof query.raw & SlicedMethods
  const array = ({ x, y, z }: Vector3) => [x, y, z]
  const count = new Raw.IntRef()
  const path = new UnsignedIntArray()
  let iterations = 0
  let batches = 0
  try {
    let status = native.initSlicedFindPath(start.ref, end.ref, array(start.position), array(end.position),
      query.defaultFilter.raw, anyAngle ? Detour.DT_FINDPATH_ANY_ANGLE : 0)
    while (statusInProgress(status) && iterations < maxIterations) {
      const budget = Math.min(iterationsPerBatch, maxIterations - iterations)
      status = native.updateSlicedFindPath(budget, count)
      if (count.value < 0 || count.value > budget || (count.value === 0 && statusInProgress(status))) {
        throw new Error('Sliced Detour update did not obey its iteration budget.')
      }
      iterations += count.value
      batches++
    }
    const exhausted = statusInProgress(status)
    if (!statusSucceed(status) && !exhausted) return { status, iterations, batches, refs: [] }
    path.resize(maxPathPolys)
    const finalStatus = native.finalizeSlicedFindPath(path.raw, count, maxPathPolys)
    // Finalize clears the active native query. Preserve the budget outcome
    // without handing a caller an unfinished corridor.
    if (exhausted) return { status, iterations, batches, refs: [] }
    if (count.value < 0 || count.value > maxPathPolys) throw new Error('Invalid Detour corridor result size.')
    return { status: finalStatus, iterations, batches, refs: Array.from(path.getHeapView().subarray(0, count.value)) }
  } finally {
    path.destroy()
    Raw.destroy(count)
  }
}
