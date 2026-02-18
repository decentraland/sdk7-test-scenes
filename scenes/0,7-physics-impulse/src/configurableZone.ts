import {
    engine,
    ColliderLayer,
    Material,
    MeshRenderer,
    Transform,
    TextShape,
    TriggerArea,
    triggerAreaEventsSystem,
    PhysicsForce
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { showConfigPanel, hideConfigPanel } from './configUi'

const ZONE_COLOR = Color4.create(0.2, 0.8, 0.6, 0.2)
const ZONE_ACTIVE_COLOR = Color4.create(0.4, 1, 0.7, 0.25)

/**
 * A trigger zone that opens the Physics Configurator UI panel
 * when the player enters, and closes it when they leave.
 */
export function setupConfigurableZone(position: Vector3, size: Vector3) {
    const zone = engine.addEntity()
    Transform.create(zone, { position, scale: size })
    MeshRenderer.setBox(zone)
    Material.setPbrMaterial(zone, { albedoColor: ZONE_COLOR })
    TriggerArea.setBox(zone, ColliderLayer.CL_PLAYER)

    // Label above zone
    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(
            position.x,
            position.y + size.y / 2 + 0.5,
            position.z
        )
    })
    TextShape.create(label, {
        text: 'Physics Configurator\n(enter to configure)',
        fontSize: 2
    })

    triggerAreaEventsSystem.onTriggerEnter(zone, () => {
        console.log('Entered configurator zone')
        showConfigPanel()
        Material.setPbrMaterial(zone, { albedoColor: ZONE_ACTIVE_COLOR })
    })

    triggerAreaEventsSystem.onTriggerExit(zone, () => {
        console.log('Left configurator zone')
        hideConfigPanel()

        // Clean up any active force when leaving
        if (PhysicsForce.getOrNull(engine.PlayerEntity)) {
            PhysicsForce.deleteFrom(engine.PlayerEntity)
        }

        Material.setPbrMaterial(zone, { albedoColor: ZONE_COLOR })
    })
}
