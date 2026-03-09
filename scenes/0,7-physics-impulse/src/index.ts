import { Vector3 } from '@dcl/sdk/math'
import { setupImpulseCube } from './impulseCube'
import { setupRepulsionCube } from './impulseRepulsionCube'
import { setupPendulumBridge } from './impulsePendulumBridge'
import { setupCarousel } from './carousel'
import { setupConfigurableTunnels } from './configurableTunnels'

export function main() {
    // === Parcel -1,7 (X: -16–0) — Force vs Impulse tunnels ===
    setupConfigurableTunnels()

    // === Parcel 0,7 (X: 0–16) ===
    setupImpulseCube(Vector3.create(4, 0, 8))
    setupRepulsionCube(Vector3.create(12, 0, 8))

    // === Parcel 1,7 (X: 16–32) — Pendulum bridge ===
    setupPendulumBridge()

    // === Parcel 1,8 (X: 16–32, Z: 16–32) — Chain Carousel ===
    setupCarousel()
}
