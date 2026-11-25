import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Point, Surface } from '../src/arena'
import {
  GLASS_PANEL_HALF_DEPTH, GLASS_PANEL_OFFSET, GLASS_WALL_COLLIDER, GLASS_WALL_HALF_DEPTH, GLASS_WALL_MESH,
  GLASS_WALL_MODEL, glassWallSurface, moveSurface
} from '../src/recipes/recipe-authoring'

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

export type Tint = readonly [number, number, number, number]
const GLASS_TINT: Tint = [0.11, 0.63, 0.83, 0.48]

// The Explorer importer reflects X between glTF and SDK scene coordinates.
function reflectX([x, y, z]: Point): Point { return [-x, y, z] }

function reverseWinding(indices: readonly number[]): number[] {
  const reversed = indices.slice()
  for (let i = 0; i < reversed.length; i += 3) {
    ;[reversed[i + 1], reversed[i + 2]] = [reversed[i + 2], reversed[i + 1]]
  }
  return reversed
}

export function encodeAuthoringWall(halfDepth = GLASS_WALL_HALF_DEPTH, tint: Tint = GLASS_TINT): Buffer {
  const surfaces = [moveSurface(glassWallSurface(GLASS_PANEL_HALF_DEPTH), GLASS_PANEL_OFFSET), glassWallSurface(halfDepth)]
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number; target: number }[] = []
  const accessors: { bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }[] = []
  let byteOffset = 0
  const binary = Buffer.concat(surfaces.flatMap((surface) => {
    const points = surface.vertices.map(reflectX)
    const positions = points.flat()
    const indices = reverseWinding(surface.triangles)
    const vertexBuffer = Buffer.alloc(positions.length * 4)
    const indexBuffer = Buffer.alloc(indices.length * 2)
    positions.forEach((value, i) => vertexBuffer.writeFloatLE(value, i * 4))
    indices.forEach((value, i) => indexBuffer.writeUInt16LE(value, i * 2))
    bufferViews.push({ buffer: 0, byteOffset, byteLength: vertexBuffer.length, target: 34962 })
    byteOffset += vertexBuffer.length
    bufferViews.push({ buffer: 0, byteOffset, byteLength: indexBuffer.length, target: 34963 })
    byteOffset += indexBuffer.length
    accessors.push({
      bufferView: accessors.length, componentType: 5126, count: points.length, type: 'VEC3',
      min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]))),
      max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])))
    }, { bufferView: accessors.length + 1, componentType: 5123, count: indices.length, type: 'SCALAR' })
    return [vertexBuffer, indexBuffer]
  }))

  const document = {
    asset: { version: '2.0', generator: 'SDK7 navigation creator recipes' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: GLASS_WALL_MESH, mesh: 0 },
      { name: GLASS_WALL_COLLIDER, mesh: 1 }
    ],
    meshes: [GLASS_WALL_MESH, GLASS_WALL_COLLIDER].map((name, i) => ({
      name, primitives: [{ attributes: { POSITION: i * 2 }, indices: i * 2 + 1, material: 0 }]
    })),
    materials: [{ alphaMode: 'BLEND', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: tint, metallicFactor: 0 } }],
    buffers: [{ byteLength: binary.length }],
    bufferViews,
    accessors
  }
  const json = Buffer.from(JSON.stringify(document))
  const jsonLength = Math.ceil(json.length / 4) * 4
  const header = Buffer.alloc(20)
  const jsonPadding = Buffer.alloc(jsonLength - json.length, 0x20)
  const binaryHeader = Buffer.alloc(8)
  header.writeUInt32LE(GLB_MAGIC, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(header.length + jsonLength + binaryHeader.length + binary.length, 8)
  header.writeUInt32LE(jsonLength, 12)
  header.writeUInt32LE(JSON_CHUNK, 16)
  binaryHeader.writeUInt32LE(binary.length, 0)
  binaryHeader.writeUInt32LE(BIN_CHUNK, 4)
  return Buffer.concat([header, json, jsonPadding, binaryHeader, binary])
}

type FixtureDocument = {
  scene: number
  scenes: { nodes: number[] }[]
  nodes: { name: string; mesh: number }[]
  meshes: { primitives: { attributes: { POSITION: number }; indices: number }[] }[]
  accessors: { bufferView: number; count: number }[]
  bufferViews: { byteOffset: number }[]
}

// Only the generator's tightly packed untransformed box layout is decoded here.
// General GLBs should go through the creator's glTF importer before this mask-selection step.
export function readAuthoringWall(input: Buffer, position: Point): { name: string; surface: Surface }[] {
  const binaryHeader = 20 + input.readUInt32LE(12)
  if (input.readUInt32LE(0) !== GLB_MAGIC || input.readUInt32LE(4) !== 2 ||
      input.readUInt32LE(8) !== input.length || input.readUInt32LE(16) !== JSON_CHUNK ||
      input.readUInt32LE(binaryHeader + 4) !== BIN_CHUNK) {
    throw new Error('Expected the checked-in authoring GLB fixture format.')
  }
  const document: FixtureDocument = JSON.parse(input.toString('utf8', 20, binaryHeader))
  const origin = binaryHeader + 8
  return document.scenes[document.scene].nodes.flatMap((nodeId) => {
    const node = document.nodes[nodeId]
    return document.meshes[node.mesh].primitives.map((primitive) => {
      const vertices = document.accessors[primitive.attributes.POSITION]
      const triangles = document.accessors[primitive.indices]
      const vertexOffset = origin + document.bufferViews[vertices.bufferView].byteOffset
      const indexOffset = origin + document.bufferViews[triangles.bufferView].byteOffset
      const surface = {
        vertices: Array.from({ length: vertices.count }, (_, i) => {
          const offset = vertexOffset + i * 12
          return reflectX([input.readFloatLE(offset), input.readFloatLE(offset + 4), input.readFloatLE(offset + 8)])
        }),
        triangles: reverseWinding(Array.from({ length: triangles.count }, (_, i) => input.readUInt16LE(indexOffset + i * 2)))
      }
      return { name: node.name, surface: moveSurface(surface, position) }
    })
  })
}

export async function writeAuthoringModels(sceneDir: string) {
  const path = resolve(sceneDir, GLASS_WALL_MODEL)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, encodeAuthoringWall())
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await writeAuthoringModels(fileURLToPath(new URL('../', import.meta.url)))
}
