import { Vector3 } from '@dcl/sdk/math'
import { Color4 } from '@dcl/sdk/math'
import { setupImpulseCube } from './impulseCube'
import { setupImpulseTunnel } from './impulseTunnel'
import { setupForceTunnel } from './forceTunnel'
import { setupRepulsionCube } from './impulseRepulsionCube'
import { setupPendulumBridge } from './impulsePendulumBridge'

export function main() {
    // === Parcel -1,7 (X: -16–0) — Force vs Impulse comparison ===

    // Horizontal tunnels (along Z, side by side)
    setupForceTunnel({
        position: Vector3.create(-12, 1.5, 8),
        size: Vector3.create(2, 3, 12),
        forceDirection: Vector3.create(0, 0, 10),
        label: 'Force forward\n(strength 10)',
        color: Color4.create(0.1, 0.4, 0.8, 0.25)
    })

    setupForceTunnel({
        position: Vector3.create(-8, 1.5, 8),
        size: Vector3.create(2, 3, 12),
        forceDirection: Vector3.create(0, 0, 25),
        label: 'Force forward\n(strength 25)',
        color: Color4.create(0.1, 0.2, 0.9, 0.25)
    })

    setupImpulseTunnel({
        position: Vector3.create(-4, 1.5, 8),
        size: Vector3.create(2, 3, 12),
        impulseDirection: Vector3.create(0, 0, 10),
        label: 'Impulse forward\n(for comparison)'
    })

    // Vertical tunnels (pipes going up, side by side)
    setupForceTunnel({
        position: Vector3.create(-12, 5, 2),
        size: Vector3.create(2, 10, 2),
        forceDirection: Vector3.create(0, 10, 0),
        label: 'Force up\n(strength 10)',
        color: Color4.create(0.1, 0.4, 0.8, 0.25)
    })

    setupForceTunnel({
        position: Vector3.create(-8, 5, 2),
        size: Vector3.create(2, 10, 2),
        forceDirection: Vector3.create(0, 25, 0),
        label: 'Force up\n(strength 25)',
        color: Color4.create(0.1, 0.2, 0.9, 0.25)
    })

    setupImpulseTunnel({
        position: Vector3.create(-4, 5, 2),
        size: Vector3.create(2, 10, 2),
        impulseDirection: Vector3.create(0, 10, 0),
        label: 'Impulse up\n(for comparison)'
    })

    // === Parcel 0,7 (X: 0–16) ===

    // Cube in the center — single impulse at 45° on enter
    setupImpulseCube(Vector3.create(8, 0, 8), 10)

    // Horizontal tunnel — continuous forward impulse (Z+)
    setupImpulseTunnel({
        position: Vector3.create(13, 1.5, 8),
        size: Vector3.create(2, 3, 12),
        impulseDirection: Vector3.create(0, 0, 1),
        label: 'Horizontal tunnel\n(continuous forward)'
    })

    // Vertical tunnel — continuous upward impulse (Y+)
    setupImpulseTunnel({
        position: Vector3.create(3, 5, 8),
        size: Vector3.create(2, 10, 2),
        impulseDirection: Vector3.create(0, 1, 0),
        label: 'Vertical tunnel\n(continuous upward)'
    })

    // Repulsion cube — 4 side triggers + 1 top jump-pad
    setupRepulsionCube(Vector3.create(8, 0, 13), 10)

    // === Parcel 1,7 (X: 16–32) ===

    // Pendulum bridge — narrow walkway with swinging hammers
    setupPendulumBridge(18)
}
