import { Vector3 } from '@dcl/sdk/math'
import { readSimpleMethods } from './methodRegistry'
import { createMethodCube } from './cubeFactory'

export function main() {
  console.log('[web3-operations] Scene started')

  // Non-parameterized read-only methods along the left border
  const rowX = 2
  const startZ = 2
  const spacingZ = 2.2

  readSimpleMethods.forEach((method, index) => {
    const position = Vector3.create(rowX, 1.1, startZ + index * spacingZ)
    createMethodCube(method, position)
  })
}
