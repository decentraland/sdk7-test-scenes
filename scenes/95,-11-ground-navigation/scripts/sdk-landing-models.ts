import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function writeLandingModels(scene: string) {
  const models = resolve(scene, 'models')
  await mkdir(models, { recursive: true })
  const positions = [
    -0.9, -0.1, -0.9, 0.9, -0.1, -0.9, 0.9, 0.1, -0.9, -0.9, 0.1, -0.9,
    -0.9, -0.1, 0.9, 0.9, -0.1, 0.9, 0.9, 0.1, 0.9, -0.9, 0.1, 0.9
  ]
  const indices = [
    0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5
  ]
  const positionsBytes = positions.length * 4
  const buffer = Buffer.alloc(positionsBytes + indices.length * 2)
  positions.forEach((value, index) => buffer.writeFloatLE(value, index * 4))
  indices.forEach((value, index) => buffer.writeUInt16LE(value, positionsBytes + index * 2))

  for (const collider of [false, true]) {
    const model = {
      asset: { version: '2.0', generator: 'SDK7 ground navigation fixture' },
      scene: 0,
      scenes: [{ nodes: collider ? [0, 1] : [0] }],
      nodes: [{ name: 'landing', mesh: 0 }, ...(collider ? [{ name: 'landing_collider', mesh: 0 }] : [])],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.19, 0.58, 0.47, 1], metallicFactor: 0 } }],
      buffers: [{ byteLength: buffer.length, uri: 'data:application/octet-stream;base64,' + buffer.toString('base64') }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positionsBytes, target: 34962 },
        { buffer: 0, byteOffset: positionsBytes, byteLength: indices.length * 2, target: 34963 }
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3',
          min: [-0.9, -0.1, -0.9], max: [0.9, 0.1, 0.9] },
        { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' }
      ]
    }
    const filename = collider ? 'landing-with-collider.gltf' : 'landing-decoration.gltf'
    await writeFile(resolve(models, filename), JSON.stringify(model))
  }
}
