import { Vector3 } from '@dcl/sdk/math'
import { methods } from './methodRegistry'
import { createMethodCube } from './cubeFactory'

export function main() {
  console.log('[web3-operations] Scene started')

  const startX = 8
  const startZ = 8
  const spacingZ = 3

  methods.forEach((method, index) => {
    const position = Vector3.create(startX, 1, startZ + index * spacingZ)
    createMethodCube(method, position)
  })
}
