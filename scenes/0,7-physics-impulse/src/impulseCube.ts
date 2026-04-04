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
    Physics
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

const IMPULSE_MAGNITUDE = 20
const IMPULSE_DIRECTION = Vector3.create(0, 1, 1)
const LABEL_ROT = Quaternion.fromEulerDegrees(0, 180, 0)

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
        text: `Impulse Cube\n(magnitude=${IMPULSE_MAGNITUDE})`,
        fontSize: 2
    })

    triggerAreaEventsSystem.onTriggerEnter(trigger, (result) => {
        if (result.trigger?.entity !== engine.PlayerEntity) return;
        Physics.applyImpulseToPlayer(IMPULSE_DIRECTION, IMPULSE_MAGNITUDE)
    })
}
