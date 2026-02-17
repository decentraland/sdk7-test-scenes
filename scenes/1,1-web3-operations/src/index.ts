import { Vector3 } from '@dcl/sdk/math'
import { readSimpleMethods } from './methodRegistry'
import { createMethodCube, createSectionHeader } from './cubeFactory'

export function main() {
  console.log('[web3-operations] Scene started')

  // Non-parameterized read-only methods along the left border
  const rowX = 2
  const startZ = 2
  const spacingZ = 2.2

  readSimpleMethods.forEach((method, index) => {
    const position = Vector3.create(rowX, 1.1, startZ + index * spacingZ)
    createMethodCube(method, position, spacingZ)
  })

  // Section header above the row
  const lastZ = startZ + (readSimpleMethods.length - 1) * spacingZ
  const centerZ = (startZ + lastZ) / 2
  createSectionHeader('Read-only methods (no params)', Vector3.create(rowX, 4, centerZ))
}
