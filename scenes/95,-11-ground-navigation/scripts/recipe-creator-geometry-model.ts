import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Point } from '../src/arena'
import { MIRRORED_MODEL, mirroredRampAsset, type RampNode } from '../src/recipes/recipe-creator-geometry'

const MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

export function encodeMirroredRamp() {
  const { geometry, nodes, roots } = mirroredRampAsset
  const vertices = geometry.vertices.flat()
  const indexOffset = vertices.length * 4
  const binary = Buffer.alloc(indexOffset + geometry.triangles.length * 2)
  vertices.forEach((value, i) => binary.writeFloatLE(value, i * 4))
  geometry.triangles.forEach((index, i) => binary.writeUInt16LE(index, indexOffset + 2 * i))
  const asset = {
    asset: { version: '2.0', generator: 'SDK7 Creator recipes' },
    scene: 0,
    scenes: [{ nodes: roots }],
    nodes,
    materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.33, 0.65, 0.8, 1], metallicFactor: 0 } }],
    meshes: [{ name: 'ramp', primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: indexOffset, target: 34962 },
      { buffer: 0, byteOffset: indexOffset, byteLength: binary.length - indexOffset, target: 34963 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: geometry.vertices.length, type: 'VEC3',
        min: [0, 0, 0], max: [4, 0.88, 2.02] },
      { bufferView: 1, componentType: 5123, count: geometry.triangles.length, type: 'SCALAR' }
    ]
  }
  const source = Buffer.from(JSON.stringify(asset))
  const json = Buffer.alloc(Math.ceil(source.length / 4) * 4, 0x20)
  source.copy(json)
  const file = Buffer.alloc(28 + json.length + binary.length)
  file.writeUInt32LE(MAGIC, 0)
  file.writeUInt32LE(2, 4)
  file.writeUInt32LE(file.length, 8)
  file.writeUInt32LE(json.length, 12)
  file.writeUInt32LE(JSON_CHUNK, 16)
  json.copy(file, 20)
  file.writeUInt32LE(binary.length, 20 + json.length)
  file.writeUInt32LE(BIN_CHUNK, 24 + json.length)
  binary.copy(file, 28 + json.length)
  return file
}

export function readMirroredRamp(file: Buffer) {
  if (file.readUInt32LE(0) !== MAGIC || file.readUInt32LE(4) !== 2 || file.readUInt32LE(8) !== file.length ||
      file.readUInt32LE(16) !== JSON_CHUNK) throw new Error('Expected a GLB 2.0 fixture')
  const jsonEnd = 20 + file.readUInt32LE(12)
  if (file.readUInt32LE(jsonEnd + 4) !== BIN_CHUNK) throw new Error('Expected GLB binary data')
  const asset = JSON.parse(file.toString('utf8', 20, jsonEnd)) as {
    scene: number
    scenes: { nodes: number[] }[]
    nodes: RampNode[]
    meshes: { primitives: { attributes: { POSITION: number }; indices: number }[] }[]
    accessors: { bufferView: number; count: number; componentType: number; byteOffset?: number }[]
    bufferViews: { byteOffset?: number }[]
  }
  const [primitive] = asset.meshes[0].primitives
  const position = asset.accessors[primitive.attributes.POSITION]
  const index = asset.accessors[primitive.indices]
  if (position.componentType !== 5126 || index.componentType !== 5123) {
    throw new Error('The fixture uses packed float vertices and 16-bit indices')
  }
  const offset = ({ bufferView, byteOffset = 0 }: typeof position) =>
    jsonEnd + 8 + (asset.bufferViews[bufferView].byteOffset ?? 0) + byteOffset
  const vertices = Array.from({ length: position.count }, (_, i): Point => {
    const start = offset(position) + i * 12
    return [file.readFloatLE(start), file.readFloatLE(start + 4), file.readFloatLE(start + 8)]
  })
  const triangles = Array.from({ length: index.count }, (_, i) => file.readUInt16LE(offset(index) + i * 2))
  return { geometry: { vertices, triangles }, roots: asset.scenes[asset.scene].nodes, nodes: asset.nodes }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const asset = fileURLToPath(new URL('../' + MIRRORED_MODEL, import.meta.url))
  await mkdir(dirname(asset), { recursive: true })
  await writeFile(asset, encodeMirroredRamp())
}
