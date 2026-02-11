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

let impulseTimestamp = 0

export function main() {
    // --- Ground cube (visual reference) ---
    const cube = engine.addEntity()
    Transform.create(cube, {
        position: Vector3.create(8, 0.5, 8),
        scale: Vector3.create(2, 1, 2)
    })
    MeshRenderer.setBox(cube)
    MeshCollider.setBox(cube)
    Material.setPbrMaterial(cube, {
        albedoColor: Color4.create(0.2, 0.4, 0.9, 1)
    })

    // --- Label above the cube ---
    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(8, 2.5, 8)
    })
    TextShape.create(label, {
        text: 'Step on the trigger\nto get launched!',
        fontSize: 3
    })

    // --- Trigger area (semi-transparent box around the cube) ---
    const triggerEntity = engine.addEntity()
    Transform.create(triggerEntity, {
        position: Vector3.create(8, 1.5, 8),
        scale: Vector3.create(3, 3, 3)
    })
    MeshRenderer.setBox(triggerEntity)
    Material.setPbrMaterial(triggerEntity, {
        albedoColor: Color4.create(1, 0.2, 0.2, 0.3)
    })
    TriggerArea.setBox(triggerEntity, ColliderLayer.CL_PLAYER)

    // 45 degrees up, magnitude ~20
    // direction = (0, sin45, cos45) * 20 = (0, 14.14, 14.14)
    // Using forward (Z+) direction for horizontal component
    const impulseMagnitude = 20
    const angle = Math.PI / 4 // 45 degrees
    const impulseDirection = Vector3.create(
        0,
        Math.sin(angle) * impulseMagnitude,
        Math.cos(angle) * impulseMagnitude
    )

    // --- React to trigger enter: apply impulse to the PLAYER entity ---
    triggerAreaEventsSystem.onTriggerEnter(triggerEntity, (result) => {
        console.log(`Player entered trigger area! Applying impulse...`)
        impulseTimestamp++

        PhysicsImpulse.createOrReplace(engine.PlayerEntity, {
            direction: impulseDirection,
            timestamp: impulseTimestamp
        })

        // Change trigger color to green when activated
        Material.setPbrMaterial(triggerEntity, {
            albedoColor: Color4.create(0.2, 1, 0.2, 0.3)
        })
    })

    // --- React to trigger exit: reset color ---
    triggerAreaEventsSystem.onTriggerExit(triggerEntity, (result) => {
        console.log(`Player exited trigger area`)

        // Reset trigger color back to red
        Material.setPbrMaterial(triggerEntity, {
            albedoColor: Color4.create(1, 0.2, 0.2, 0.3)
        })
    })
}
