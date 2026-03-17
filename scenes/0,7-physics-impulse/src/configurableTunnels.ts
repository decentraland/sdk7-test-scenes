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
const IMPULSE_COLOR = Color4.create(0.8, 0.15, 0.1, 0.25)

const HORIZONTAL_MAG = 20
const VERTICAL_MAG = 50

export function setupConfigurableTunnels() {
    const labelRot = Quaternion.fromEulerDegrees(0, 180, 0)

    // Horizontal impulse tunnel (red)
    createImpulseTunnel(
        Vector3.create(-10, 1.5, 8), Vector3.create(2, 3, 12),
        Vector3.create(0, 0, HORIZONTAL_MAG), 'Impulse forward', labelRot
    )

    // Horizontal force tunnel (blue)
    createForceTunnel(
        Vector3.create(-6, 1.5, 8), Vector3.create(2, 3, 12),
        Vector3.create(0, 0, HORIZONTAL_MAG), 'Force forward', labelRot
    )

    // Vertical impulse tunnel (red)
    createImpulseTunnel(
        Vector3.create(-10, 5, 2), Vector3.create(2, 10, 2),
        Vector3.create(0, VERTICAL_MAG, 0), 'Impulse up', labelRot
    )

    // Vertical force tunnel (blue)
    createForceTunnel(
        Vector3.create(-6, 5, 2), Vector3.create(2, 10, 2),
        Vector3.create(0, VERTICAL_MAG, 0), 'Force up', labelRot
    )
}

function createLabel(position: Vector3, size: Vector3, text: string, rotation: Quaternion) {
    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(position.x, position.y + size.y / 2 + 0.5, position.z - size.z / 2),
        rotation
    })
    TextShape.create(label, { text, fontSize: 2 })
}

function createForceTunnel(
    position: Vector3, size: Vector3,
    direction: Vector3, label: string, labelRotation: Quaternion
): Entity {
    const tunnel = engine.addEntity()
    Transform.create(tunnel, { position, scale: size })
    MeshRenderer.setBox(tunnel)
    Material.setPbrMaterial(tunnel, { albedoColor: FORCE_COLOR })
    TriggerArea.setBox(tunnel, ColliderLayer.CL_PLAYER)

    createLabel(position, size, label, labelRotation)

    triggerAreaEventsSystem.onTriggerEnter(tunnel, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return
        Physics.applyForceToPlayer(tunnel, direction)
    })

    triggerAreaEventsSystem.onTriggerExit(tunnel, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return
        Physics.removeForceFromPlayer(tunnel)
    })

    return tunnel
}

function createImpulseTunnel(
    position: Vector3, size: Vector3,
    direction: Vector3, label: string, labelRotation: Quaternion
) {
    const tunnel = engine.addEntity()
    Transform.create(tunnel, { position, scale: size })
    MeshRenderer.setBox(tunnel)
    Material.setPbrMaterial(tunnel, { albedoColor: IMPULSE_COLOR })
    TriggerArea.setBox(tunnel, ColliderLayer.CL_PLAYER)

    createLabel(position, size, label, labelRotation)

    triggerAreaEventsSystem.onTriggerStay(tunnel, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return
        Physics.applyImpulseToPlayer(direction)
    })
}
