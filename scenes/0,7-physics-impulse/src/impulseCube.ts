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
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { getCubeDir } from './configUi'

let timestamp = 0

const LABEL_ROT = Quaternion.fromEulerDegrees(0, 180, 0)

/**
 * A cube with a trigger area around it.
 * When the player enters the trigger, a single impulse is applied.
 * Direction and magnitude are read dynamically from the UI state.
 */
export function setupImpulseCube(position: Vector3) {
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

    const label = engine.addEntity()
    Transform.create(label, {
        position: Vector3.create(position.x, position.y + 3.5, position.z),
        rotation: LABEL_ROT
    })
    TextShape.create(label, {
        text: 'Impulse Cube\n(single impulse on enter)',
        fontSize: 2
    })

    triggerAreaEventsSystem.onTriggerEnter(trigger, () => {
        timestamp++
        PhysicsImpulse.createOrReplace(engine.PlayerEntity, {
            direction: getCubeDir(),
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
