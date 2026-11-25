import {
  Crowd, NavMesh, NavMeshParams, NavMeshQuery, Raw, statusSucceed, UnsignedCharArray
} from 'recast-navigation'
import { generateTiledNavMesh } from 'recast-navigation/generators'
import type { Point } from '../../src/arena'
import { toRecastGeometry } from '../../src/navigation'
import {
  OPS_TILE_BAKE, OPS_TILE_SCHEMA, type OpsBackend, type OpsTile
} from '../../src/recipes/recipe-creator-ops-tiles'
import { bakeDetourMesh, createDetourNavigatorFromMesh } from '../../test/detour'

const tileKey = ({ x, y, layer }: OpsTile) => x + '/' + y + '/' + layer
const native = ([x, y, z]: Point) => ({ x, y, z: -z })

export const detourOpsBackend: OpsBackend = {
  now: () => performance.now(),
  memory: () => {
    const { heapUsed, rss } = process.memoryUsage()
    return { heapUsedBytes: heapUsed, rssBytes: rss, wasmHeapCapacityBytes: Raw.Module.HEAPU8.buffer.byteLength }
  },
  bakeRoute(faces) {
    return createDetourNavigatorFromMesh(bakeDetourMesh(faces, OPS_TILE_BAKE))
  },
  bakeTiles(faces, tileEdge) {
    const b = OPS_TILE_BAKE
    const positionsAndIndices = toRecastGeometry(faces)
    const radius = Math.ceil(b.radius / b.cellSize)
    const baked = generateTiledNavMesh(positionsAndIndices.positions, positionsAndIndices.indices, {
      cs: b.cellSize, ch: b.cellHeight, tileSize: tileEdge / b.cellSize,
      walkableRadius: radius, walkableHeight: Math.ceil(b.height / b.cellHeight), walkableClimb: Math.round(b.climb / b.cellHeight),
      walkableSlopeAngle: b.slope, borderSize: radius + 3,
      minRegionArea: b.minRegionSize, mergeRegionArea: b.mergeRegionSize,
      maxSimplificationError: b.maxSimplificationError, maxEdgeLen: b.maxEdgeLength, maxVertsPerPoly: b.maxVerticesPerPoly,
      detailSampleDist: b.detailSampleDistanceVoxels, detailSampleMaxError: b.detailSampleErrorVoxels
    })
    if (!baked.success) throw new Error('Detour streaming bake failed: ' + baked.error)
    const tiles: OpsTile[] = []
    try {
      for (let i = 0; i < baked.navMesh.getMaxTiles(); i++) {
        const tile = baked.navMesh.getTile(i)
        const header = tile.header()
        if (!header) continue
        tiles.push({
          x: header.x(), y: header.y(), layer: header.layer(), schema: OPS_TILE_SCHEMA,
          payload: Uint8Array.from({ length: tile.dataSize() }, (_, j) => tile.data(j))
        })
      }
    } finally {
      baked.navMesh.destroy()
    }
    const points = faces.flatMap(({ vertices }) => vertices.map(native))
    const origin = {
      x: Math.min(...points.map(({ x }) => x)), y: Math.min(...points.map(({ y }) => y)),
      z: Math.min(...points.map(({ z }) => z))
    }
    return {
      tiles,
      open() {
        const mesh = new NavMesh()
        const params = NavMeshParams.create({
          orig: origin, tileWidth: tileEdge, tileHeight: tileEdge, maxTiles: 16, maxPolys: 256
        })
        try {
          if (!mesh.initTiled(params)) throw new Error('Detour tiled mesh initialization failed')
        } catch (error) {
          mesh.destroy()
          throw error
        } finally {
          Raw.destroy(params.raw)
        }
        const nav = createDetourNavigatorFromMesh(mesh)
        const query = new NavMeshQuery(mesh)
        const buffers = new Map<string, UnsignedCharArray>()
        let group: Crowd | undefined
        return {
          ...nav,
          install(tile) {
            if (tile.schema !== OPS_TILE_SCHEMA || !(tile.payload instanceof Uint8Array)) {
              throw new Error('Incompatible tile schema')
            }
            const bytes = new UnsignedCharArray()
            bytes.copy(tile.payload)
            // Flags zero leaves ownership with this adapter. Dispose after removing the tile.
            const installed = mesh.addTile(bytes, 0, 0)
            if (!statusSucceed(installed.status)) {
              bytes.destroy()
              throw new Error('Detour tile import failed: ' + installed.status)
            }
            buffers.set(tileKey(tile), bytes)
            if (!mesh.getTileRefAt(tile.x, tile.y, tile.layer)) throw new Error('Tile coordinates do not match its package')
          },
          remove(tile) {
            const ref = mesh.getTileRefAt(tile.x, tile.y, tile.layer)
            if (!ref) throw new Error('Cannot evict an unloaded Detour tile')
            const result = mesh.removeTile(ref)
            try {
              if (!statusSucceed(result.raw.status)) throw new Error('Detour tile eviction failed: ' + result.raw.status)
            } finally {
              Raw.destroy(result.raw)
            }
            const key = tileKey(tile)
            buffers.get(key)?.destroy()
            buffers.delete(key)
          },
          has: (tile) => mesh.getTileRefAt(tile.x, tile.y, tile.layer) !== 0,
          project(point) {
            const hit = query.findNearestPoly(native(point), { halfExtents: { x: 0.2, y: 0.3, z: 0.2 } })
            return hit.success && hit.nearestRef ? hit.nearestRef : undefined
          },
          isValid: (ref) => mesh.isValidPolyRef(ref),
          addAgent(point) {
            const crowd = group ??= new Crowd(mesh, { maxAgents: 4, maxAgentRadius: b.radius })
            const agent = crowd.addAgent(native(point), {
              radius: b.radius, height: b.height, maxSpeed: 2, maxAcceleration: 8
            })
            if (agent.state() === 0) {
              crowd.removeAgent(agent)
              throw new Error('Could not add Detour streaming agent')
            }
            return () => crowd.removeAgent(agent)
          },
          dispose() {
            if (group) {
              Raw.destroy(group.navMeshQuery.defaultFilter.raw)
              group.destroy()
            }
            Raw.destroy(query.defaultFilter.raw)
            query.destroy()
            nav.dispose()
            for (const bytes of buffers.values()) bytes.destroy()
          }
        }
      }
    }
  }
}
