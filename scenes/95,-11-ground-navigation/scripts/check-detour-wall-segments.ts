import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Detour, init, NavMeshQuery, Raw, statusDetail, statusSucceed, UnsignedCharArray } from 'recast-navigation'
import { FLOOR_Y, STAFF, WALK } from '../src/recipes/recipe-engine-types'
import { slab } from '../src/recipes/recipe-runtime-support'
import { engineRecipeCases } from '../tools/catalog/recipe-engine'
import { detourPoint, detourTiles } from '../tools/catalog/native-tiles'
import { readDetourWallSegments, supportsDetourWallSegments } from '../tools/sdk-detour-probe/detour-wall-segments'

const modulePath = process.argv[2]
if (!modulePath || process.argv.length !== 3) {
  throw new Error('Usage: pnpm exec tsx scripts/check-detour-wall-segments.ts <recast-navigation.wasm-compat.js>')
}
const { default: factory } = await import(pathToFileURL(resolve(modulePath)).href)
await init(factory)
assert(supportsDetourWallSegments())

const recipe = engineRecipeCases.find(({ id }) => id === 'RECIPE-PORTAL-WALL')
assert(recipe)
for (const backend of ['navcat', 'detour'] as const) {
  const result = await recipe.run(backend)
  assert.equal(result.status, 'pass', result.detail)
}

// Bake two compatible images so the wide source edge stays unsplit and a
// narrower replacement neighbour connects only to the middle of that edge.
const mesh = detourTiles([slab('wide floor', 1, 5, 2, 4, FLOOR_Y).surface], 0.08)
const replacementBytes = new UnsignedCharArray()
const query = new NavMeshQuery(mesh)
try {
  const narrow = detourTiles([slab('narrow floor', 1, 5, 2.65, 4, FLOOR_Y).surface], 0.08)
  try {
    const replacement = narrow.getTileAt(1, 0, 0)
    assert(replacement)
    replacementBytes.copy(Uint8Array.from({ length: replacement.dataSize() }, (_, i) => replacement.data(i)))
  } finally {
    narrow.destroy()
  }
  const replaced = mesh.removeTile(mesh.getTileRefAt(1, 0, 0))
  try {
    assert(statusSucceed(replaced.raw.status))
  } finally {
    Raw.destroy(replaced.raw)
  }
  assert(statusSucceed(mesh.addTile(replacementBytes, 0, 0).status))
  const source = query.findNearestPoly(detourPoint([2, FLOOR_Y, 3]))
  const target = query.findNearestPoly(detourPoint([4, FLOOR_Y, 3.3]))
  assert(source.success && source.nearestRef && target.success && target.nearestRef)
  assert.notEqual(source.nearestRef, target.nearestRef)
  assert.equal(mesh.setPolyFlags(target.nearestRef, STAFF), Detour.DT_SUCCESS)
  const atSeam = ({ start, end }: { start: { x: number }; end: { x: number } }) =>
    Math.abs(start.x - 3) < 0.06 && Math.abs(end.x - 3) < 0.06
  const allowed = readDetourWallSegments(query, source.nearestRef, { includePortals: true })
  const seam = allowed.segments.filter(atSeam)
  assert(allowed.success)
  assert(seam.some(({ neighbourRef }) => neighbourRef === target.nearestRef),
    JSON.stringify({ source, target, segments: allowed.segments }))
  assert(seam.some(({ neighbourRef, start, end }) => neighbourRef === 0 && Math.abs(start.z - end.z) > 0.2),
    JSON.stringify(seam))
  const wallsOnly = readDetourWallSegments(query, source.nearestRef)
  assert(wallsOnly.success && wallsOnly.segments.every(({ neighbourRef }) => neighbourRef === 0))
  assert(wallsOnly.segments.filter(atSeam).length < seam.length)

  query.defaultFilter.includeFlags = WALK
  const denied = readDetourWallSegments(query, source.nearestRef, { includePortals: true })
  assert(denied.success && denied.segments.filter(atSeam).every(({ neighbourRef }) => neighbourRef === 0))
  query.defaultFilter.includeFlags = WALK | STAFF
  const small = readDetourWallSegments(query, source.nearestRef, { includePortals: true, maxSegments: 1 })
  assert(small.success && statusDetail(small.status, Detour.DT_BUFFER_TOO_SMALL) && small.segments.length === 1)
  const invalid = readDetourWallSegments(query, 0, { includePortals: true })
  assert(!invalid.success && statusDetail(invalid.status, Detour.DT_INVALID_PARAM) && invalid.segments.length === 0)
  assert.throws(() => readDetourWallSegments(query, source.nearestRef, { maxSegments: 0 }), RangeError)

  const warm = () => readDetourWallSegments(query, source.nearestRef, { includePortals: true, maxSegments: 256 })
  assert.equal(warm().segments.length, allowed.segments.length)
  const capacity = Raw.Module.HEAPU8.byteLength
  for (let i = 0; i < 12000; i++) {
    assert.equal(warm().segments.length, allowed.segments.length)
  }
  assert.equal(Raw.Module.HEAPU8.byteLength, capacity)
  console.log(JSON.stringify({ sharedRecipe: 'pass/pass', partialSeam: seam, smallBuffer: true, invalidRef: true,
    repeatCalls: 12000, wasmCapacityBytes: capacity }, null, 2))
} finally {
  Raw.destroy(query.defaultFilter.raw)
  query.destroy()
  mesh.destroy()
  replacementBytes.destroy()
}
