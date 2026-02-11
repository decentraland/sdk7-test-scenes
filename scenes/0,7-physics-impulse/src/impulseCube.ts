import {
    engine,
    ColliderLayer,
    Material,
    MeshCollider,
    MeshRenderer,
    Transform,
    TextShape,
    TriggerArea,
    triggerAreaEventsSystem,
    PhysicsImpulse
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

let timestamp = 0

/**
 * A cube with a trigger area around it.
 * When the player enters the trigger, a single impulse at 45° is applied.
 */
export function setupImpulseCube(position: Vector3) {
    // Visible cube
    const cube = engine.addEntity()
    Transform.create(cube, {
        position: Vector3.create(position.x, position.y + 0.5, position.z),
        scale: Vector3.create(2, 1, 2)
    })
    MeshRenderer.setBox(cube)
    MeshCollider.setBox(cube)
    Material.setPbrMaterial(cube, {
        albedoColor: Color4.create(0.2, 0.4, 0.9, 1)
    })

    // Trigger area around the cube
    const trigger = engine.addEntity()
    Transform.create(trigger, {
        position: Vector3.create(position.x, position.y + 1.5, position.z),
        scale: Vector3.create(3, 3, 3)
    })
    MeshRenderer.setBox(trigger)
    Material.setPbrMaterial(trigger, {
        albedoColor: Color4.create(1, 0.2, 0.2, 0.3)
    })
    TriggerArea.setBox(trigger, ColliderLayer.CL_PLAYER)

    // Label
    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(position.x, position.y + 3.5, position.z)
    })
    TextShape.create(label, {
        text: 'Step here\n(single impulse 45\u00B0)',
        fontSize: 2
    })

    // Impulse direction: 45° up, magnitude 20
    const magnitude = 20
    const angle = Math.PI / 4
    const direction = Vector3.create(
        0,
        Math.sin(angle) * magnitude,
        Math.cos(angle) * magnitude
    )

    triggerAreaEventsSystem.onTriggerEnter(trigger, () => {
        console.log('Cube: single impulse at 45°')
        timestamp++
        PhysicsImpulse.createOrReplace(engine.PlayerEntity, {
            direction,
            timestamp
        })
        Material.setPbrMaterial(trigger, {
            albedoColor: Color4.create(0.2, 1, 0.2, 0.3)
        })
    })

    triggerAreaEventsSystem.onTriggerExit(trigger, () => {
        Material.setPbrMaterial(trigger, {
            albedoColor: Color4.create(1, 0.2, 0.2, 0.3)
        })
    })
}
