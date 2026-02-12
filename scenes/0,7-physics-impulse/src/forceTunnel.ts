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

export interface ForceTunnelConfig {
    position: Vector3
    size: Vector3
    forceDirection: Vector3
    label: string
    color?: Color4
}

/**
 * A tunnel-shaped trigger area that applies PhysicsForce (continuous).
 * Force is added on enter, removed on exit.
 */
export function setupForceTunnel(config: ForceTunnelConfig) {
    const defaultColor = config.color ?? Color4.create(0.1, 0.4, 0.8, 0.25)
    const activeColor = Color4.create(0.2, 1, 0.2, 0.25)

    const tunnel = engine.addEntity()
    Transform.create(tunnel, {
        position: config.position,
        scale: config.size
    })
    MeshRenderer.setBox(tunnel)
    Material.setPbrMaterial(tunnel, { albedoColor: defaultColor })
    TriggerArea.setBox(tunnel, ColliderLayer.CL_PLAYER)

    // Label
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

    // On enter: apply force
    triggerAreaEventsSystem.onTriggerEnter(tunnel, () => {
        console.log(`Force tunnel "${config.label}": force applied`)
        PhysicsForce.createOrReplace(engine.PlayerEntity, {
            direction: config.forceDirection
        })
        Material.setPbrMaterial(tunnel, { albedoColor: activeColor })
    })

    // On exit: remove force
    triggerAreaEventsSystem.onTriggerExit(tunnel, () => {
        console.log(`Force tunnel "${config.label}": force removed`)
        PhysicsForce.deleteFrom(engine.PlayerEntity)
        Material.setPbrMaterial(tunnel, { albedoColor: defaultColor })
    })
}
