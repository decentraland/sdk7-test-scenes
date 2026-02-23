import {
    engine,
    ColliderLayer,
    Material,
    MeshRenderer,
    Transform,
    TextShape,
    TriggerArea,
    triggerAreaEventsSystem,
    Physics
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

export interface TunnelConfig {
    position: Vector3
    size: Vector3
    impulseDirection: Vector3
    label: string
}

/**
 * A tunnel-shaped trigger area.
 * While the player stays inside, a physics impulse is applied every frame.
 */
export function setupImpulseTunnel(config: TunnelConfig) {
    const tunnel = engine.addEntity()
    Transform.create(tunnel, {
        position: config.position,
        scale: config.size
    })
    MeshRenderer.setBox(tunnel)
    Material.setPbrMaterial(tunnel, {
        albedoColor: Color4.create(0.8, 0.5, 0.1, 0.25)
    })
    TriggerArea.setBox(tunnel, ColliderLayer.CL_PLAYER)

    // Label near the tunnel entrance
    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(
            config.position.x,
            config.position.y + config.size.y / 2 + 0.5,
            config.position.z - config.size.z / 2
        )
    })
    TextShape.create(label, {
        text: config.label,
        fontSize: 2
    })

    // Continuous impulse every frame while inside
    triggerAreaEventsSystem.onTriggerStay(tunnel, () => {
        Physics.applyImpulseToPlayer(config.impulseDirection)
    })

    // Visual feedback
    triggerAreaEventsSystem.onTriggerEnter(tunnel, () => {
        console.log(`Tunnel "${config.label}": impulse started`)
        Material.setPbrMaterial(tunnel, {
            albedoColor: Color4.create(0.2, 1, 0.2, 0.25)
        })
    })

    triggerAreaEventsSystem.onTriggerExit(tunnel, () => {
        console.log(`Tunnel "${config.label}": impulse stopped`)
        Material.setPbrMaterial(tunnel, {
            albedoColor: Color4.create(0.8, 0.5, 0.1, 0.25)
        })
    })
}
