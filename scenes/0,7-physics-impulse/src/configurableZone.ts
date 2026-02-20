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
import { showForcePanel, hideForcePanel, showImpulsePanel, hideImpulsePanel } from './configUi'

const FORCE_ZONE_COLOR = Color4.create(0.8, 0.15, 0.1, 0.15)
const IMPULSE_ZONE_COLOR = Color4.create(0.1, 0.3, 0.8, 0.15)

/**
 * Red zone — continuous force. UI appears with a hold-to-apply button.
 */
export function setupForceZone(position: Vector3, size: Vector3) {
    const zone = engine.addEntity()
    Transform.create(zone, { position, scale: size })
    MeshRenderer.setBox(zone)
    Material.setPbrMaterial(zone, { albedoColor: FORCE_ZONE_COLOR })
    TriggerArea.setBox(zone, ColliderLayer.CL_PLAYER)

    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(position.x, position.y + size.y / 2 + 0.5, position.z)
    })
    TextShape.create(label, { text: 'Force Zone\n(hold button to apply)', fontSize: 2 })

    triggerAreaEventsSystem.onTriggerEnter(zone, () => {
        showForcePanel()
    })

    triggerAreaEventsSystem.onTriggerExit(zone, () => {
        hideForcePanel()
        if (PhysicsForce.getOrNull(engine.PlayerEntity)) {
            PhysicsForce.deleteFrom(engine.PlayerEntity)
        }
    })
}

/**
 * Blue zone — single impulse. UI appears with direction/magnitude + Apply.
 */
export function setupImpulseZone(position: Vector3, size: Vector3) {
    const zone = engine.addEntity()
    Transform.create(zone, { position, scale: size })
    MeshRenderer.setBox(zone)
    Material.setPbrMaterial(zone, { albedoColor: IMPULSE_ZONE_COLOR })
    TriggerArea.setBox(zone, ColliderLayer.CL_PLAYER)

    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(position.x, position.y + size.y / 2 + 0.5, position.z)
    })
    TextShape.create(label, { text: 'Impulse Zone\n(configure & fire)', fontSize: 2 })

    triggerAreaEventsSystem.onTriggerEnter(zone, () => {
        showImpulsePanel()
    })

    triggerAreaEventsSystem.onTriggerExit(zone, () => {
        hideImpulsePanel()
    })
}
