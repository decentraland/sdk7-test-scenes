import {
  addTile, buildTile, createFindNearestPolyResult, DEFAULT_QUERY_FILTER, findNearestPoly, findNodePath,
  getTileAndPolyByRef, getTileAt, isValidNodeRef, removeTile, type NavMeshTile, type Vec3
} from 'navcat'
import { generateTiledNavMesh as buildNavcatTiles } from 'navcat/blocks'
import { NavMeshQuery, Raw, UnsignedCharArray, statusSucceed } from 'recast-navigation'
import { generateTiledNavMesh as buildDetourTiles } from 'recast-navigation/generators'
import type { Point, Surface } from '../../src/arena'
import { createNavcatNavigatorFromMesh, toRecastGeometry, type Navigator } from '../../src/navigation'
import { createDetourNavigatorFromMesh } from '../../test/detour'
import type { TraversalBackend } from '../sdk-detour-probe/traversal-routing'
import { floor } from './ground'

export const CELL_SIZE = 0.05
export const TILE_EDGE = 2
const TILE_SIZE = TILE_EDGE / CELL_SIZE

type NativeTileFixture = {
  navigator: Navigator
  cellSize: number
  loaded(): boolean
  evict(): boolean
  refill(kind: 'original' | 'changed'): void
  valid(ref: number): boolean
  path(from: Point, to: Point): { refs: number[]; complete: boolean }
  middleRef(refs: number[]): number | undefined
  dispose?(): void
}

export const nativePoint = ([x, y, z]: Point): Vec3 => [x, y, -z]
export const detourPoint = ([x, y, z]: Point) => ({ x, y, z: -z })

export function navcatTiles(faces: readonly Surface[], radius = 0.16) {
  const radiusVoxels = Math.ceil(radius / CELL_SIZE)
  return buildNavcatTiles(toRecastGeometry(faces), {
    cellSize: CELL_SIZE, cellHeight: CELL_SIZE, tileSizeVoxels: TILE_SIZE, tileSizeWorld: TILE_EDGE,
    walkableRadiusVoxels: radiusVoxels, walkableRadiusWorld: radius, walkableHeightVoxels: 28, walkableHeightWorld: 1.4,
    walkableClimbVoxels: 2, walkableClimbWorld: 0.1, walkableSlopeAngleDegrees: 40,
    borderSize: radiusVoxels + 3, minRegionArea: 1, mergeRegionArea: 1, maxSimplificationError: 0.35,
    maxEdgeLength: 80, maxVerticesPerPoly: 6, detailSampleDistance: 0.25, detailSampleMaxError: 0.05
  }).navMesh
}

export function detourTiles(faces: readonly Surface[], radius = 0.16) {
  const geometry = toRecastGeometry(faces)
  const radiusVoxels = Math.ceil(radius / CELL_SIZE)
  const result = buildDetourTiles(geometry.positions, geometry.indices, {
    cs: CELL_SIZE, ch: CELL_SIZE, tileSize: TILE_SIZE,
    walkableRadius: radiusVoxels, walkableHeight: 28, walkableClimb: 2,
    walkableSlopeAngle: 40, borderSize: radiusVoxels + 3, minRegionArea: 1, mergeRegionArea: 1,
    maxSimplificationError: 0.35, maxEdgeLen: 80, maxVertsPerPoly: 6, detailSampleDist: 5, detailSampleMaxError: 1
  })
  if (!result.success) throw new Error(result.error)
  return result.navMesh
}

function navcatNativeTiles(open: readonly Surface[], reroute: readonly Surface[]): NativeTileFixture {
  const nav = navcatTiles(open)
  const replacement = navcatTiles(reroute)
  const navigator = createNavcatNavigatorFromMesh(nav)
  const linked = () => getTileAt(nav, 1, 0, 0)
  const original = linked()
  const changed = getTileAt(replacement, 1, 0, 0)
  if (!original || !changed) throw new Error('Native navcat fixture is missing its centre tile.')
  const copy = (tile: NavMeshTile) => JSON.parse(JSON.stringify(tile)) as NavMeshTile
  const tiles = { original: copy(original), changed: copy(changed) }
  function nearest(point: Point) {
    return findNearestPoly(createFindNearestPolyResult(), nav, nativePoint(point), [0.2, 0.3, 0.2], DEFAULT_QUERY_FILTER)
  }
  return {
    navigator,
    cellSize: original.cellSize,
    loaded: () => Boolean(linked()),
    evict: () => removeTile(nav, 1, 0, 0),
    refill(kind: 'original' | 'changed') {
      addTile(nav, buildTile(copy(tiles[kind])))
    },
    valid: (ref: number) => isValidNodeRef(nav, ref),
    path(from: Point, to: Point) {
      const start = nearest(from)
      const end = nearest(to)
      if (!start.success || !end.success) return { refs: [], complete: false }
      const result = findNodePath(nav, start.nodeRef, end.nodeRef, start.position, end.position, DEFAULT_QUERY_FILTER)
      return { refs: result.path, complete: result.success && result.path[result.path.length - 1] === end.nodeRef }
    },
    middleRef(refs: number[]) {
      return refs.find((ref) => getTileAndPolyByRef(ref, nav).tile?.tileX === 1)
    }
  }
}

function detourNativeTiles(open: readonly Surface[], reroute: readonly Surface[]): NativeTileFixture {
  const nav = detourTiles(open)
  const replacement = detourTiles(reroute)
  const linked = () => nav.getTileRefAt(1, 0, 0)
  const original = nav.getTileAt(1, 0, 0)
  const changed = replacement.getTileAt(1, 0, 0)
  const header = original?.header()
  if (!original || !header || !changed || !changed.header()) {
    replacement.destroy()
    nav.destroy()
    throw new Error('Native Detour fixture is missing its centre tile.')
  }
  const cellSize = 1 / header.bvQuantFactor()
  const buffers = {
    original: Array.from({ length: original.dataSize() }, (_, i) => original.data(i)),
    changed: Array.from({ length: changed.dataSize() }, (_, i) => changed.data(i))
  }
  replacement.destroy()
  const navigator = createDetourNavigatorFromMesh(nav)
  const query = new NavMeshQuery(nav)
  const allocated: UnsignedCharArray[] = []
  return {
    navigator,
    cellSize,
    loaded: () => linked() !== 0,
    evict() {
      const ref = linked()
      if (!ref) return false
      Raw.destroy(nav.removeTile(ref).raw)
      return !linked()
    },
    refill(kind: 'original' | 'changed') {
      const bytes = new UnsignedCharArray()
      bytes.copy(buffers[kind])
      const result = nav.addTile(bytes, 0, 0)
      if (!statusSucceed(result.status)) {
        bytes.destroy()
        throw new Error('Could not insert the replacement Detour tile.')
      }
      allocated.push(bytes)
    },
    valid: (ref: number) => nav.isValidPolyRef(ref),
    path(from: Point, to: Point) {
      const halfExtents = { x: 0.2, y: 0.3, z: 0.2 }
      const start = query.findNearestPoly(detourPoint(from), { halfExtents })
      const end = query.findNearestPoly(detourPoint(to), { halfExtents })
      if (!start.nearestRef || !end.nearestRef) return { refs: [], complete: false }
      const result = query.findPath(start.nearestRef, end.nearestRef, start.nearestPoint, end.nearestPoint)
      try {
        const refs = Array.from(result.polys.toTypedArray())
        return { refs, complete: result.success && refs[refs.length - 1] === end.nearestRef }
      } finally {
        result.polys.destroy()
      }
    },
    middleRef(refs: number[]) {
      return refs.find((ref) => nav.getTileAndPolyByRef(ref).tile.header()?.x() === 1)
    },
    dispose() {
      Raw.destroy(query.defaultFilter.raw)
      query.destroy()
      navigator.dispose()
      for (const bytes of allocated) bytes.destroy()
    }
  }
}

export function usingNativeTiles<T>(
  backend: TraversalBackend, body: (scene: NativeTileFixture) => T,
  faces = [floor(0, 6, 0, 1.8)],
  reroute = [floor(0, 2.55, 0, 1.8), floor(2.55, 3.45, 1.14, 1.8), floor(3.45, 6, 0, 1.8)]
) {
  const fixture = backend === 'navcat' ? navcatNativeTiles(faces, reroute) : detourNativeTiles(faces, reroute)
  try {
    return body(fixture)
  } finally {
    fixture.dispose?.()
  }
}
