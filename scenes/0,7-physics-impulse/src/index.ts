import { Vector3 } from '@dcl/sdk/math'
import { setupImpulseCube } from './impulseCube'
import { setupImpulseTunnel } from './impulseTunnel'
import { setupRepulsionCube } from './impulseRepulsionCube'

export function main() {
    // 1. Cube in the center — single impulse at 45° on enter
    setupImpulseCube(Vector3.create(8, 0, 8))

    // 2. Horizontal tunnel on the right — continuous forward impulse (Z+)
    setupImpulseTunnel({
        position: Vector3.create(13, 1.5, 8),
        size: Vector3.create(2, 3, 12),
        impulseDirection: Vector3.create(0, 0, 20),
        label: 'Horizontal tunnel\n(continuous forward)'
    })

    // 3. Vertical tunnel on the left — continuous upward impulse (Y+)
    setupImpulseTunnel({
        position: Vector3.create(3, 5, 8),
        size: Vector3.create(2, 10, 2),
        impulseDirection: Vector3.create(0, 20, 0),
        label: 'Vertical tunnel\n(continuous upward)'
    })

    // 4. Repulsion cube — 4 side triggers + 1 top jump-pad, push along face normals
    setupRepulsionCube(Vector3.create(8, 0, 13))
}
