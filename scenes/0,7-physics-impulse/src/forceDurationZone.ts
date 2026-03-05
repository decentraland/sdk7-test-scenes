import {
    engine,
    ColliderLayer,
    Material,
    MeshRenderer,
    TextShape,
    Transform,
    TriggerArea,
    triggerAreaEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { hideForceDurationPanel, showForceDurationPanel } from './configUi'

const FORCE_DURATION_ZONE_COLOR = Color4.create(0.45, 0.2, 0.9, 0.16)

/**
 * Violet zone — apply force for a limited duration with configurable direction/magnitude/time.
 */
export function setupForceDurationZone(position: Vector3, size: Vector3) {
    const zone = engine.addEntity()
    Transform.create(zone, { position, scale: size })
    MeshRenderer.setBox(zone)
    Material.setPbrMaterial(zone, { albedoColor: FORCE_DURATION_ZONE_COLOR })
    TriggerArea.setBox(zone, ColliderLayer.CL_PLAYER)

    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(position.x, position.y + size.y / 2 + 0.5, position.z)
    })
    TextShape.create(label, {
        text: 'Force For Duration Zone\n(configure & start timer)',
        fontSize: 2
    })

    triggerAreaEventsSystem.onTriggerEnter(zone, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return
        showForceDurationPanel()
    })

    triggerAreaEventsSystem.onTriggerExit(zone, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return
        hideForceDurationPanel()
    })
}
