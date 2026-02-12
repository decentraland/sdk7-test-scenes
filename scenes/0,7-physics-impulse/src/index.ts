import { Vector3 } from '@dcl/sdk/math'
import { setupImpulseCube } from './impulseCube'
import { setupImpulseTunnel } from './impulseTunnel'
import { setupRepulsionCube } from './impulseRepulsionCube'
import { setupPendulumBridge } from './impulsePendulumBridge'

export function main() {
    // === Parcel 0,7 (X: 0–16) ===

    // 1. Cube in the center — single impulse at 45° on enter
    setupImpulseCube(Vector3.create(8, 0, 8), 20)

    // 2. Horizontal tunnel on the right — continuous forward impulse (Z+)
    setupImpulseTunnel({
        position: Vector3.create(13, 1.5, 8),
        size: Vector3.create(2, 3, 12),
        impulseDirection: Vector3.create(0, 0, 1),
        label: 'Horizontal tunnel\n(continuous forward)'
    })

    // 3. Vertical tunnel on the left — continuous upward impulse (Y+)
    setupImpulseTunnel({
        position: Vector3.create(3, 5, 8),
        size: Vector3.create(2, 10, 2),
        impulseDirection: Vector3.create(0, 5, 0),
        label: 'Vertical tunnel\n(continuous upward)'
    })

    // 4. Repulsion cube — 4 side triggers + 1 top jump-pad, push along face normals
    setupRepulsionCube(Vector3.create(8, 0, 13), 15)

    // === Parcel 1,7 (X: 16–32) ===

    // 5. Pendulum bridge — narrow walkway with swinging hammers that knock you off
    setupPendulumBridge(18)
}
