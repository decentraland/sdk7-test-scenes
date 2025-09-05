import {
    engine,
    Transform,
    MeshRenderer,
    Material,
    TriggerArea,
    TriggerAreaResult,
    AvatarModifierArea,
    AvatarModifierType
} from '@dcl/ecs'
// } from '@dcl/sdk/ecs'
import { Vector3, Color4, Quaternion } from '@dcl/sdk/math'

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
    TriggerArea.create(triggerAreaEntity)
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
    engine.addSystem(resultSystem)
    
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
