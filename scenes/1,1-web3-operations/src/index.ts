import { Vector3 } from '@dcl/sdk/math'
import { methods } from './methodRegistry'
import { createMethodCube } from './cubeFactory'

export function main() {
  console.log('[web3-operations] Scene started')

  const startX = 2
  const startZ = 2
  const spacingZ = 3

  methods.forEach((method, index) => {
    const position = Vector3.create(startX, 1.6, startZ + index * spacingZ)
    createMethodCube(method, position)
  })
}
