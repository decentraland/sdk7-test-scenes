import {
    engine,
    Entity,
    ColliderLayer,
    Material,
    MeshRenderer,
    Transform,
    TextShape,
    TriggerArea,
    triggerAreaEventsSystem,
    Physics
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

const FORCE_COLOR = Color4.create(0.1, 0.4, 0.8, 0.25)
const FORCE_ACTIVE = Color4.create(0.2, 0.7, 1, 0.3)
const IMPULSE_COLOR = Color4.create(0.8, 0.15, 0.1, 0.25)
const IMPULSE_ACTIVE = Color4.create(1, 0.3, 0.2, 0.3)

const HORIZONTAL_MAG = 20
const VERTICAL_MAG = 40

export function setupConfigurableTunnels() {
    const facingBack = Quaternion.fromEulerDegrees(0, 180, 0)

    const forceTunnels: Entity[] = []

    createImpulseTunnel(
        Vector3.create(-10, 1.5, 8), Vector3.create(2, 3, 12),
        Vector3.create(0, 0, HORIZONTAL_MAG),
        'Impulse forward', facingBack
    )

    forceTunnels.push(createForceTunnel(
        Vector3.create(-6, 1.5, 8), Vector3.create(2, 3, 12),
        Vector3.create(0, 0, HORIZONTAL_MAG),
        'Force forward', facingBack
    ))

    createImpulseTunnel(
        Vector3.create(-10, 5, 2), Vector3.create(2, 10, 2),
        Vector3.create(0, VERTICAL_MAG, 0),
        'Impulse up', facingBack
    )

    forceTunnels.push(createForceTunnel(
        Vector3.create(-6, 5, 2), Vector3.create(2, 10, 2),
        Vector3.create(0, VERTICAL_MAG, 0),
        'Force up', facingBack
    ))

    const zone = engine.addEntity()
    Transform.create(zone, {
        position: Vector3.create(-8, 3, 6),
        scale: Vector3.create(12, 8, 14)
    })
    TriggerArea.setBox(zone, ColliderLayer.CL_PLAYER)

    triggerAreaEventsSystem.onTriggerExit(zone, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return;
        for (const t of forceTunnels) {
            Physics.removeForceFromPlayer(t)
        }
    })
}

function createForceTunnel(
    position: Vector3, size: Vector3,
    direction: Vector3, label: string,
    labelRotation: { x: number; y: number; z: number; w: number }
): Entity {
    const tunnel = engine.addEntity()
    Transform.create(tunnel, { position, scale: size })
    MeshRenderer.setBox(tunnel)
    Material.setPbrMaterial(tunnel, { albedoColor: FORCE_COLOR })
    TriggerArea.setBox(tunnel, ColliderLayer.CL_PLAYER)

    const labelEntity = engine.addEntity()
    Transform.create(labelEntity, {
        position: Vector3.create(position.x, position.y + size.y / 2 + 0.5, position.z - size.z / 2),
        rotation: labelRotation
    })
    TextShape.create(labelEntity, { text: label, fontSize: 2 })

    triggerAreaEventsSystem.onTriggerEnter(tunnel, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return;
        Physics.applyForceToPlayer(tunnel, direction)
        Material.setPbrMaterial(tunnel, { albedoColor: FORCE_ACTIVE })
    })

    triggerAreaEventsSystem.onTriggerExit(tunnel, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return;
        Physics.removeForceFromPlayer(tunnel)
        Material.setPbrMaterial(tunnel, { albedoColor: FORCE_COLOR })
    })

    return tunnel
}

function createImpulseTunnel(
    position: Vector3, size: Vector3,
    direction: Vector3, label: string,
    labelRotation: { x: number; y: number; z: number; w: number }
) {
    const tunnel = engine.addEntity()
    Transform.create(tunnel, { position, scale: size })
    MeshRenderer.setBox(tunnel)
    Material.setPbrMaterial(tunnel, { albedoColor: IMPULSE_COLOR })
    TriggerArea.setBox(tunnel, ColliderLayer.CL_PLAYER)

    const labelEntity = engine.addEntity()
    Transform.create(labelEntity, {
        position: Vector3.create(position.x, position.y + size.y / 2 + 0.5, position.z - size.z / 2),
        rotation: labelRotation
    })
    TextShape.create(labelEntity, { text: label, fontSize: 2 })

    triggerAreaEventsSystem.onTriggerStay(tunnel, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return;
        Physics.applyImpulseToPlayer(direction)
    })

    triggerAreaEventsSystem.onTriggerEnter(tunnel, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return;
        Material.setPbrMaterial(tunnel, { albedoColor: IMPULSE_ACTIVE })
    })

    triggerAreaEventsSystem.onTriggerExit(tunnel, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return;
        Material.setPbrMaterial(tunnel, { albedoColor: IMPULSE_COLOR })
    })
}
