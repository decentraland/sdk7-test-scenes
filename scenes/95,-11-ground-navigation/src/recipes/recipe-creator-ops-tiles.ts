import {
  addTile, buildTile, createNavMesh, createFindNearestPolyResult, DEFAULT_QUERY_FILTER, findNearestPoly,
  getTileAt, isValidNodeRef, removeTile, type NavMeshTileParams, type Vec3
} from 'navcat'
import { crowd, generateTiledNavMesh } from 'navcat/blocks'
import type { Point, Surface } from '../arena'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, toRecastGeometry, type Navigator } from '../navigation'
import { recipeBake } from './recipe-runtime-support'

export type OpsNavigator = Navigator & { dispose(): void }

export type OpsTile = {
  x: number
  y: number
  layer: number
  schema: number
  payload: string | Uint8Array
}

export type OpsTileMesh = OpsNavigator & {
  install(tile: OpsTile): void
  remove(tile: OpsTile): void
  has(tile: OpsTile): boolean
  project(point: Point): number | undefined
  isValid(ref: number): boolean
  addAgent(point: Point): () => void
}

export type BakedOpsTiles = {
  tiles: OpsTile[]
  open(): OpsTileMesh
}

export type OpsMemory = { heapUsedBytes: number; rssBytes: number; wasmHeapCapacityBytes?: number }

export type OpsBackend = {
  bakeTiles(faces: readonly Surface[], tileEdge: number): BakedOpsTiles
  bakeRoute(faces: readonly Surface[]): OpsNavigator
  now: () => number
  memory?: () => OpsMemory
}

export const OPS_TILE_SCHEMA = 1
export const OPS_TILE_BAKE = {
  ...recipeBake(),
  cellSize: 0.1, cellHeight: 0.05, radius: 0.2, climb: 0.1, maxEdgeLength: 40
}

function native([x, y, z]: Point): Vec3 {
  return [x, y, -z]
}

export const navcatOpsBackend: OpsBackend = {
  now: () => Date.now(),
  bakeRoute(faces) {
    const nav = createNavcatNavigatorFromMesh(bakeNavcatMesh(faces, OPS_TILE_BAKE))
    return { ...nav, dispose() {} }
  },
  bakeTiles(faces, tileEdge) {
    const b = OPS_TILE_BAKE
    const radius = Math.ceil(b.radius / b.cellSize)
    const { navMesh: baked } = generateTiledNavMesh(toRecastGeometry(faces), {
      cellSize: b.cellSize,
      cellHeight: b.cellHeight,
      tileSizeWorld: tileEdge,
      tileSizeVoxels: tileEdge / b.cellSize,
      walkableRadiusVoxels: radius,
      walkableRadiusWorld: b.radius,
      walkableClimbVoxels: Math.round(b.climb / b.cellHeight),
      walkableClimbWorld: b.climb,
      walkableHeightVoxels: Math.ceil(b.height / b.cellHeight),
      walkableHeightWorld: b.height,
      walkableSlopeAngleDegrees: b.slope,
      borderSize: radius + 3,
      minRegionArea: b.minRegionSize ** 2,
      mergeRegionArea: b.mergeRegionSize ** 2,
      maxSimplificationError: b.maxSimplificationError,
      maxEdgeLength: b.maxEdgeLength,
      maxVerticesPerPoly: b.maxVerticesPerPoly,
      detailSampleDistance: b.detailSampleDistanceVoxels * b.cellSize,
      detailSampleMaxError: b.detailSampleErrorVoxels * b.cellHeight
    })
    const tiles = Object.values(baked.tiles).map((tile) => ({
      x: tile.tileX, y: tile.tileY, layer: tile.tileLayer, schema: OPS_TILE_SCHEMA, payload: JSON.stringify(tile)
    }))
    const origin: Vec3 = [...baked.origin]
    return {
      tiles,
      open() {
        const mesh = createNavMesh()
        mesh.origin = [...origin]
        mesh.tileWidth = mesh.tileHeight = tileEdge
        const nav = createNavcatNavigatorFromMesh(mesh)
        const group = crowd.create(b.radius)
        const agents = new Set<string>()
        return {
          ...nav,
          install(tile) {
            if (tile.schema !== OPS_TILE_SCHEMA || typeof tile.payload !== 'string') throw new Error('Incompatible tile schema')
            const payload = JSON.parse(tile.payload) as NavMeshTileParams
            if (payload.tileX !== tile.x || payload.tileY !== tile.y || payload.tileLayer !== tile.layer) {
              throw new Error('Tile coordinates do not match its package')
            }
            addTile(mesh, buildTile(payload))
            if (!getTileAt(mesh, tile.x, tile.y, tile.layer)) throw new Error('Native navcat tile install failed')
          },
          remove(tile) {
            if (!removeTile(mesh, tile.x, tile.y, tile.layer)) throw new Error('Native navcat tile eviction failed')
          },
          has: (tile) => getTileAt(mesh, tile.x, tile.y, tile.layer) !== undefined,
          project(point) {
            const result = findNearestPoly(createFindNearestPolyResult(), mesh, native(point), [0.2, 0.3, 0.2], DEFAULT_QUERY_FILTER)
            return result.success ? result.nodeRef : undefined
          },
          isValid: (ref) => isValidNodeRef(mesh, ref),
          addAgent(point) {
            const id = crowd.addAgent(group, mesh, native(point), {
              radius: b.radius, height: b.height, maxSpeed: 2, maxAcceleration: 8,
              collisionQueryRange: 1.4, separationWeight: 0, updateFlags: 0, queryFilter: DEFAULT_QUERY_FILTER
            })
            if (group.agents[id].state === crowd.AgentState.INVALID) {
              crowd.removeAgent(group, id)
              throw new Error('Could not add navcat streaming agent')
            }
            agents.add(id)
            return () => {
              crowd.removeAgent(group, id)
              agents.delete(id)
            }
          },
          dispose() {
            for (const agent of agents) crowd.removeAgent(group, agent)
            agents.clear()
          }
        }
      }
    }
  }
}
