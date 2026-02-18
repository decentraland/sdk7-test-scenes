import { Vector3 } from '@dcl/sdk/math'
import {
    engine, ColliderLayer, Transform, TriggerArea, triggerAreaEventsSystem
} from '@dcl/sdk/ecs'
import { setupImpulseCube } from './impulseCube'
import { setupRepulsionCube } from './impulseRepulsionCube'
import { setupPendulumBridge } from './impulsePendulumBridge'
import { setupForceZone, setupImpulseZone } from './configurableZone'
import { setupConfigurableTunnels } from './configurableTunnels'
import {
    setupConfigUi,
    showImpulseCubePanel, hideImpulseCubePanel,
    showRepulsionCubePanel, hideRepulsionCubePanel,
    showPendulumPanel, hidePendulumPanel
} from './configUi'

export function main() {
    // UI renderer (once, before everything else)
    setupConfigUi()

    // === Parcel -1,7 (X: -16–0) — Force vs Impulse comparison ===
    setupConfigurableTunnels()

    // === Parcel 0,7 (X: 0–16) ===

    // Impulse cube — single impulse on enter (left side)
    setupImpulseCube(Vector3.create(4, 0, 8))

    const impulseCubeZone = engine.addEntity()
    Transform.create(impulseCubeZone, {
        position: Vector3.create(4, 2, 8),
        scale: Vector3.create(6, 6, 6)
    })
    TriggerArea.setBox(impulseCubeZone, ColliderLayer.CL_PLAYER)
    triggerAreaEventsSystem.onTriggerEnter(impulseCubeZone, () => { showImpulseCubePanel() })
    triggerAreaEventsSystem.onTriggerExit(impulseCubeZone, () => { hideImpulseCubePanel() })

    // Repulsion cube — push from each face (right side)
    setupRepulsionCube(Vector3.create(12, 0, 8))

    const repulsionCubeZone = engine.addEntity()
    Transform.create(repulsionCubeZone, {
        position: Vector3.create(12, 2, 8),
        scale: Vector3.create(6, 6, 6)
    })
    TriggerArea.setBox(repulsionCubeZone, ColliderLayer.CL_PLAYER)
    triggerAreaEventsSystem.onTriggerEnter(repulsionCubeZone, () => { showRepulsionCubePanel() })
    triggerAreaEventsSystem.onTriggerExit(repulsionCubeZone, () => { hideRepulsionCubePanel() })

    // === Parcel 1,7 (X: 16–32) ===

    // Pendulum bridge — narrow walkway with swinging hammers
    setupPendulumBridge()

    const pendulumZone = engine.addEntity()
    Transform.create(pendulumZone, {
        position: Vector3.create(24, 3, 8),
        scale: Vector3.create(10, 8, 16)
    })
    TriggerArea.setBox(pendulumZone, ColliderLayer.CL_PLAYER)
    triggerAreaEventsSystem.onTriggerEnter(pendulumZone, () => { showPendulumPanel() })
    triggerAreaEventsSystem.onTriggerExit(pendulumZone, () => { hidePendulumPanel() })

    // === Parcel 0,8 (Z: 16–32) — Force vs Impulse sandbox ===

    // Left half: red Force zone (hold button to apply)
    setupForceZone(Vector3.create(4, 2.5, 24), Vector3.create(7, 5, 14))

    // Right half: blue Impulse zone (single fire)
    setupImpulseZone(Vector3.create(12, 2.5, 24), Vector3.create(7, 5, 14))
}
