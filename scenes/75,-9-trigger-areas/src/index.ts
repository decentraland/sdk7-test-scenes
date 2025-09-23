import {
    ColliderLayer,
    engine,
    InputAction,
    Material,
    MeshCollider,
    MeshRenderer,
    pointerEventsSystem,
    Transform,
    TriggerArea,
    triggerAreaEventsSystem,
    Entity
} from '@dcl/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'

export function main() {
    const entityTrigger = engine.addEntity()
    Transform.create(entityTrigger, { position: Vector3.create(3, 1, 14.5), scale: Vector3.create(0.25, 0.25, 0.25)})
    MeshRenderer.setBox(entityTrigger)
    MeshCollider.setBox(entityTrigger, ColliderLayer.CL_CUSTOM3)

    const entityTriggerButton = engine.addEntity()
    Transform.create(entityTriggerButton, { position: Vector3.create(1, 1, 14.5)})
    MeshRenderer.setBox(entityTriggerButton)
    MeshCollider.setBox(entityTriggerButton)
    pointerEventsSystem.onPointerDown(
        { entity: entityTriggerButton, opts: { button: InputAction.IA_POINTER, hoverText: 'move trigger' } },
        () => {
            const mutableTransform = Transform.getMutable(entityTrigger)
            if (mutableTransform.position.x == 3)
                mutableTransform.position.x = 5
            else
                mutableTransform.position.x = 3
        }
    )

    const triggerAreaEntity = engine.addEntity()
    Transform.create(triggerAreaEntity, {
        position: Vector3.create(5, 1.5, 14.5),
        scale: Vector3.create(1, 3, 1),
        rotation: Quaternion.fromEulerDegrees(0, 45, 0)
    })    
    setupTriggerArea(triggerAreaEntity, ColliderLayer.CL_PLAYER | ColliderLayer.CL_CUSTOM3)
}

function setupTriggerArea(triggerAreaEntity: Entity, collisionMask: number | undefined, isSphere = false) {
    if (isSphere) {
        MeshRenderer.setSphere(triggerAreaEntity)
        TriggerArea.setSphere(triggerAreaEntity, collisionMask)
    } else {
        MeshRenderer.setBox(triggerAreaEntity)
        TriggerArea.setBox(triggerAreaEntity, collisionMask)
    }

    Material.setPbrMaterial(triggerAreaEntity, {
        albedoColor: Color4.create(1, 1, 1, 0.5),
    })
    
    triggerAreaEventsSystem.onTriggerEnter(triggerAreaEntity,
        function (result) {
            console.log(`${triggerAreaEntity} DETECTED OnEnter from other entity: ${result.trigger!.entity}`)
/*            console.log(`result.triggeredEntity: ${result.triggeredEntity}`)
            console.log(`result.triggeredEntityPosition: (${result.triggeredEntityPosition!.x}, ${result.triggeredEntityPosition!.y}, ${result.triggeredEntityPosition!.z})`)
            console.log(`result.triggeredEntityRotation: (${result.triggeredEntityRotation!.x}, ${result.triggeredEntityRotation!.y}, ${result.triggeredEntityRotation!.z}, ${result.triggeredEntityRotation!.w})`)
            console.log(`result.eventType: ${result.eventType}`)
            console.log(`result.timestamp: ${result.timestamp}`)
            console.log(`result.trigger.entity: ${result.trigger!.entity}`)
            console.log(`result.trigger.layer: ${result.trigger!.layer as ColliderLayer}`)
            console.log(`result.trigger.position: (${result.trigger!.position!.x}, ${result.trigger!.position!.y}, ${result.trigger!.position!.z})`)
            console.log(`result.trigger.rotation: (${result.trigger!.rotation!.x}, ${result.trigger!.rotation!.y}, ${result.trigger!.rotation!.z}, ${result.trigger!.rotation!.w})`)
            console.log(`result.trigger.scale: (${result.trigger!.scale!.x}, ${result.trigger!.scale!.y}, ${result.trigger!.scale!.z})`)*/
        })

    /*triggerAreaEventsSystem.onTriggerStay(triggerAreaEntity,
        function (result) {
            console.log(`${triggerAreaEntity} DETECTED OnStay from other entity: ${result.trigger!.entity}`)
        })*/

    triggerAreaEventsSystem.onTriggerExit(triggerAreaEntity,
        function (result) {
            console.log(`${triggerAreaEntity} DETECTED OnExit from other entity: ${result.trigger!.entity}`)
        })
}
