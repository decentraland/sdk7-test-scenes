import { Vector3 } from '@dcl/sdk/math'
import { setupImpulseCube } from './impulseCube'
import { setupImpulseTunnel } from './impulseTunnel'
import { setupRepulsionCube } from './impulseRepulsionCube'
import { setupPendulumBridge } from './impulsePendulumBridge'
import { setupForceZone, setupImpulseZone } from './configurableZone'
import { setupConfigurableTunnels } from './configurableTunnels'
import { setupConfigUi } from './configUi'

export function main() {
    // UI renderer (once, before everything else)
    setupConfigUi()

    // === Parcel -1,7 (X: -16–0) — Force vs Impulse comparison ===
    // 2 horizontal (Force + Impulse) + 2 vertical (Force + Impulse)
    // Trigger zone around them opens the magnitude UI
    setupConfigurableTunnels()

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

    // === Parcel 0,8 (Z: 16–32) — Force vs Impulse sandbox ===

    // Left half: red Force zone (hold button to apply)
    setupForceZone(Vector3.create(4, 2.5, 24), Vector3.create(7, 5, 14))

    // Right half: blue Impulse zone (single fire)
    setupImpulseZone(Vector3.create(12, 2.5, 24), Vector3.create(7, 5, 14))
}
