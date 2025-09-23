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
    Transform.create(entityTrigger, { position: Vector3.create(4, 1, 8), scale: Vector3.create(0.25, 0.25, 0.25)})
    MeshRenderer.setBox(entityTrigger)
    MeshCollider.setBox(entityTrigger, ColliderLayer.CL_CUSTOM3)

    const entityTriggerButton = engine.addEntity()
    Transform.create(entityTriggerButton, { position: Vector3.create(2, 1, 2)})
    MeshRenderer.setBox(entityTriggerButton)
    MeshCollider.setBox(entityTriggerButton)
    pointerEventsSystem.onPointerDown(
        { entity: entityTriggerButton, opts: { button: InputAction.IA_POINTER, hoverText: 'move trigger' } },
        () => {
            const mutableTransform = Transform.getMutable(entityTrigger)
            if (mutableTransform.position.x == 4)
                mutableTransform.position.x = 8
            else
                mutableTransform.position.x = 4
        }
    )

    const triggerAreaEntity = engine.addEntity()
    Transform.create(triggerAreaEntity, {
        position: Vector3.create(8, 2, 8),
        scale: Vector3.create(4, 4, 4),
        rotation: Quaternion.fromEulerDegrees(0, 45, 0)
    })
    Material.setPbrMaterial(triggerAreaEntity, {
        albedoColor: Color4.create(1, 1, 1, 0.5),
    })
    MeshRenderer.setBox(triggerAreaEntity)
    
    setupTriggerAreaComponent(triggerAreaEntity)
}

function setupTriggerAreaComponent(triggerAreaEntity: Entity) {
    // TriggerArea.setSphere(triggerAreaEntity, ColliderLayer.CL_PLAYER)
    // MeshRenderer.setSphere(triggerAreaEntity)
    // TriggerArea.setBox(triggerAreaEntity)
    // TriggerArea.setBox(triggerAreaEntity, ColliderLayer.CL_PLAYER)
    // TriggerArea.setBox(triggerAreaEntity, ColliderLayer.CL_CUSTOM4 | ColliderLayer.CL_CUSTOM3)
    // TriggerArea.setBox(triggerAreaEntity, ColliderLayer.CL_CUSTOM1 | ColliderLayer.CL_CUSTOM5)
    TriggerArea.setBox(triggerAreaEntity, ColliderLayer.CL_PLAYER | ColliderLayer.CL_CUSTOM3)
    
    triggerAreaEventsSystem.onTriggerEnter(triggerAreaEntity,
        function (result) {
            console.log(`DETECTED OnEnter...`)
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
            console.log(`DETECTED OnStay...`)
        })*/

    triggerAreaEventsSystem.onTriggerExit(triggerAreaEntity,
        function (result) {
            console.log(`DETECTED OnExit...`)
        })
}
