import { writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { locomotionAsset } from '../src/recipes/recipe-creator-behavior'

function createLocomotionModel() {
  const parts: Buffer[] = []
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number; target?: number }[] = []
  const accessors: {
    bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[]
  }[] = []
  let byteOffset = 0
  function add(data: number[], type: 'SCALAR' | 'VEC3', indices = false, target?: number, min?: number[], max?: number[]) {
    const bytes = Buffer.alloc(indices ? data.length * 2 : data.length * 4)
    for (let i = 0; i < data.length; i++) {
      if (indices) bytes.writeUInt16LE(data[i], i * 2)
      else bytes.writeFloatLE(data[i], i * 4)
    }
    parts.push(bytes)
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, ...(target && { target }) })
    byteOffset += bytes.length
    accessors.push({ bufferView: bufferViews.length - 1, componentType: indices ? 5123 : 5126,
      count: type === 'SCALAR' ? data.length : data.length / 3, type, ...(min && { min }), ...(max && { max }) })
    return accessors.length - 1
  }
  const position = add([
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5
  ], 'VEC3', false, 34962, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5])
  const triangles = add([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2], 'SCALAR', true, 34963)
  const time = add([0, 0.3, 0.6, 0.9, 1.2], 'SCALAR', false, undefined, [0], [1.2])
  const animations = [
    clip('idle', [[1, [0, 0.52, 0, 0, 0.55, 0, 0, 0.52, 0, 0, 0.49, 0, 0, 0.52, 0]]]),
    clip('walk', [[2, [-0.12, 0.14, 0, -0.12, 0.18, 0.16, -0.12, 0.14, 0, -0.12, 0.14, -0.16, -0.12, 0.14, 0]],
      [3, [0.12, 0.14, 0, 0.12, 0.14, -0.16, 0.12, 0.14, 0, 0.12, 0.18, 0.16, 0.12, 0.14, 0]]]),
    clip('drift', [[0, [0, 0, 0, 0.35, 0, 0, 0.7, 0, 0, 1.05, 0, 0, 1.4, 0, 0]]])
  ]
  function clip(name: string, tracks: readonly [number, number[]][]) {
    return {
      name,
      samplers: tracks.map(([, data]) => ({ input: time, output: add(data, 'VEC3'), interpolation: 'LINEAR' })),
      channels: tracks.map(([node], sampler) => ({ sampler, target: { node, path: 'translation' } }))
    }
  }
  const nodes = [
    { name: 'visual-root', children: [1, 2, 3, 4] },
    { name: 'body', mesh: 0, translation: [0, 0.52, 0], scale: [0.44, 0.52, 0.34] },
    { name: 'left-foot', mesh: 1, translation: [-0.12, 0.14, 0], scale: [0.18, 0.28, 0.22] },
    { name: 'right-foot', mesh: 1, translation: [0.12, 0.14, 0], scale: [0.18, 0.28, 0.22] },
    { name: 'head', mesh: 1, translation: [0, 0.86, 0], scale: [0.24, 0.22, 0.22] }
  ]
  const model = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes,
    animations, accessors, bufferViews, buffers: [{ byteLength: byteOffset }],
    materials: [[0.16, 0.72, 0.68, 1], [0.95, 0.57, 0.18, 1]].map((baseColorFactor) => ({
      pbrMetallicRoughness: { baseColorFactor, metallicFactor: 0, roughnessFactor: 0.75 }
    })),
    meshes: [0, 1].map((material) => ({ primitives: [{ attributes: { POSITION: position }, indices: triangles, material }] }))
  }
  const document = Buffer.from(JSON.stringify(model), 'utf8')
  const json = Buffer.concat([document, Buffer.alloc((4 - document.length % 4) % 4, 0x20)])
  const bin = Buffer.concat(parts)
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + json.length + bin.length, 8)
  header.writeUInt32LE(json.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(bin.length, 0)
  binHeader.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, json, binHeader, bin])
}

export function rootAnimationTravel(file: Buffer) {
  const jsonLength = file.readUInt32LE(12)
  if (file.readUInt32LE(0) !== 0x46546c67 || file.readUInt32LE(4) !== 2 || file.readUInt32LE(8) !== file.length) {
    throw new Error('Invalid locomotion GLB.')
  }
  const { nodes, animations, accessors, bufferViews } = JSON.parse(file.toString('utf8', 20, 20 + jsonLength))
  const root = nodes.findIndex(({ name }: { name: string }) => name === 'visual-root')
  if (root < 0) throw new Error('Locomotion GLB has no visual root.')
  const displacement: Record<string, number> = {}
  for (const animation of animations) {
    const track = animation.channels.find(({ target }: { target: { node: number; path: string } }) =>
      target.node === root && target.path === 'translation')
    if (!track) {
      displacement[animation.name] = 0
      continue
    }
    const accessor = accessors[animation.samplers[track.sampler].output]
    const begin = 28 + jsonLength + bufferViews[accessor.bufferView].byteOffset + (accessor.byteOffset ?? 0)
    const [x, y, z] = nodes[root].translation ?? [0, 0, 0]
    let max = 0
    for (let i = 0; i < accessor.count; i++) {
      const offset = begin + i * 12
      max = Math.max(max, Math.hypot(file.readFloatLE(offset) - x, file.readFloatLE(offset + 4) - y, file.readFloatLE(offset + 8) - z))
    }
    displacement[animation.name] = max
  }
  return displacement
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile(fileURLToPath(new URL('../' + locomotionAsset, import.meta.url)), createLocomotionModel())
}
