import {
    engine,
    Transform,
    MeshRenderer,
    TriggerArea
} from '@dcl/sdk/ecs'
import { Vector3, Color4, Quaternion } from '@dcl/sdk/math'

export function main() {
    const triggerAreaEntity = engine.addEntity()
    Transform.create(triggerAreaEntity, {
        position: Vector3.create(8, 1, 8),
    })
    MeshRenderer.setBox(triggerAreaEntity)
    TriggerArea.create(triggerAreaEntity)
    console.log('put TriggerArea component on entity...')
}
