import { engine,
    Material,
    MeshRenderer,
    Transform,
    TriggerArea,
    TriggerAreaMeshType,
    ColliderLayer,
    triggerAreaEventsSystem
} from '@dcl/ecs'
// } from '@dcl/sdk/ecs'
import {Color4, Vector3} from '@dcl/sdk/math'

export function main() {
    const triggerAreaEntity = engine.addEntity()
    Transform.create(triggerAreaEntity, {
        position: Vector3.create(8, 2, 8),
        scale: Vector3.create(4, 4, 4),
    })
    MeshRenderer.setBox(triggerAreaEntity)
    Material.setPbrMaterial(triggerAreaEntity, {
        albedoColor: Color4.create(1, 1, 1, 0.5),
    })

    TriggerArea.setSphere(triggerAreaEntity, ColliderLayer.CL_PLAYER)
    // TriggerArea.setBox(triggerAreaEntity, ColliderLayer.CL_PLAYER)

    triggerAreaEventsSystem.onTriggerEnter(triggerAreaEntity,
        function (result) {
            console.log(`pravs - DETECTED OnENTER...`)
            console.log(`result.triggeredEntity: ${result.triggeredEntity}`)
            console.log(`result.triggeredEntityPosition: (${result.triggeredEntityPosition!.x}, ${result.triggeredEntityPosition!.y}, ${result.triggeredEntityPosition!.z})`)
            console.log(`result.triggeredEntityRotation: (${result.triggeredEntityRotation!.x}, ${result.triggeredEntityRotation!.y}, ${result.triggeredEntityRotation!.z}, ${result.triggeredEntityRotation!.w})`)
            console.log(`result.eventType: ${result.eventType}`)
            console.log(`result.timestamp: ${result.timestamp}`)
            console.log(`result.trigger.entity: ${result.trigger!.entity}`)
            console.log(`result.trigger.layer: ${result.trigger!.layer}`)
            console.log(`result.trigger.position: (${result.trigger!.position!.x}, ${result.trigger!.position!.y}, ${result.trigger!.position!.z})`)
            console.log(`result.trigger.rotation: (${result.trigger!.rotation!.x}, ${result.trigger!.rotation!.y}, ${result.trigger!.rotation!.z}, ${result.trigger!.rotation!.w})`)
            console.log(`result.trigger.scale: (${result.trigger!.scale!.x}, ${result.trigger!.scale!.y}, ${result.trigger!.scale!.z})`)

            // console.log(`pravs - TRIGGER IS Entity: ${result.trigger!.entity}`) // WHY IS result.trigger possibly undefined ???
        })

    triggerAreaEventsSystem.onTriggerStay(triggerAreaEntity,
        function (result) {
            console.log(`pravs - DETECTED OnSTAY...`)
            console.log(`result.triggeredEntity: ${result.triggeredEntity}`)
            console.log(`result.triggeredEntityPosition: (${result.triggeredEntityPosition!.x}, ${result.triggeredEntityPosition!.y}, ${result.triggeredEntityPosition!.z})`)
            console.log(`result.triggeredEntityRotation: (${result.triggeredEntityRotation!.x}, ${result.triggeredEntityRotation!.y}, ${result.triggeredEntityRotation!.z}, ${result.triggeredEntityRotation!.w})`)
            console.log(`result.eventType: ${result.eventType}`)
            console.log(`result.timestamp: ${result.timestamp}`)
            console.log(`result.trigger.entity: ${result.trigger!.entity}`)
            console.log(`result.trigger.layer: ${result.trigger!.layer}`)
            console.log(`result.trigger.position: (${result.trigger!.position!.x}, ${result.trigger!.position!.y}, ${result.trigger!.position!.z})`)
            console.log(`result.trigger.rotation: (${result.trigger!.rotation!.x}, ${result.trigger!.rotation!.y}, ${result.trigger!.rotation!.z}, ${result.trigger!.rotation!.w})`)
            console.log(`result.trigger.scale: (${result.trigger!.scale!.x}, ${result.trigger!.scale!.y}, ${result.trigger!.scale!.z})`)
        })

    triggerAreaEventsSystem.onTriggerExit(triggerAreaEntity,
        function (result) {
            console.log(`pravs - DETECTED OnEXIT...`)
            console.log(`result.triggeredEntity: ${result.triggeredEntity}`)
            console.log(`result.triggeredEntityPosition: (${result.triggeredEntityPosition!.x}, ${result.triggeredEntityPosition!.y}, ${result.triggeredEntityPosition!.z})`)
            console.log(`result.triggeredEntityRotation: (${result.triggeredEntityRotation!.x}, ${result.triggeredEntityRotation!.y}, ${result.triggeredEntityRotation!.z}, ${result.triggeredEntityRotation!.w})`)
            console.log(`result.eventType: ${result.eventType}`)
            console.log(`result.timestamp: ${result.timestamp}`)
            console.log(`result.trigger.entity: ${result.trigger!.entity}`)
            console.log(`result.trigger.layer: ${result.trigger!.layer}`)
            console.log(`result.trigger.position: (${result.trigger!.position!.x}, ${result.trigger!.position!.y}, ${result.trigger!.position!.z})`)
            console.log(`result.trigger.rotation: (${result.trigger!.rotation!.x}, ${result.trigger!.rotation!.y}, ${result.trigger!.rotation!.z}, ${result.trigger!.rotation!.w})`)
            console.log(`result.trigger.scale: (${result.trigger!.scale!.x}, ${result.trigger!.scale!.y}, ${result.trigger!.scale!.z})`)
        })
    
    
    
      
    //...................
    
    
    
    /*TriggerArea.create(triggerAreaEntity, {
        mesh: TriggerAreaMeshType.TAMT_SPHERE,
        collisionMask: ColliderLayer.CL_PLAYER
    })
    console.log('pravs - put TriggerArea component on entity...')
    
    function resultSystem() {
        for (const [entity, triggerAreaResult] of engine.getEntitiesWith(TriggerAreaResult)) {
            console.log(`pravs - DETECTED TriggerAreaResult on Entity: ${triggerAreaResult.triggeredEntity}`)
            
            if (triggerAreaResult.triggeredEntity === triggerAreaEntity) {
                console.log('pravs - Triggered Entity is SAME as Area entity! =)')                
                engine.removeSystem(resultSystem)   
            }
        }
    }
    engine.addSystem(resultSystem)*/
    
    //...................
        
    
    
    /*triggerEventsSystem.OnTriggerEnter(
        {
            entity: myTrigger,
            opts: {
                layer: Player
            }
        },
        function (otherEntity) {
            // Do whatever I want
        }
    )*/
    
    //...................
    /*const avatarModifierAreaEntity = engine.addEntity()
    const avatarModifierAreaSize = Vector3.create(4, 4, 4)
    const avatarModifierAreaSize2 = Vector3.create(2, 2, 2)
    Transform.create(avatarModifierAreaEntity, {
        position: Vector3.create(0, 1, 12),
        scale: avatarModifierAreaSize2
    })
    AvatarModifierArea.create(avatarModifierAreaEntity, {
        area: avatarModifierAreaSize,
        modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
        excludeIds: []
    })
    MeshRenderer.setBox(avatarModifierAreaEntity)
    Material.setPbrMaterial(avatarModifierAreaEntity, { albedoColor: Color4.create(0.5, 0.5, 0.5, 0.5) })*/
}
