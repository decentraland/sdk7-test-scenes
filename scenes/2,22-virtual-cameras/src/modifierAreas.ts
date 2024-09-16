import { Quaternion, Vector3, Color4 } from '@dcl/sdk/math'
import {
    engine,
    MeshRenderer,
    Material,
    Transform,
    CameraType,
    AvatarModifierType,
    AvatarModifierArea,
    CameraModeArea,
    TextShape
} from '@dcl/sdk/ecs'

export function InstantiateModifierAreas() {
    // AVATAR MODIFIER AREA
    const avatarModifierAreaEntity = engine.addEntity()
    const avatarModifierAreaSize = Vector3.create(2, 3, 2)
    Transform.create(avatarModifierAreaEntity, { 
    position: Vector3.create(14.5, 1, 14.5),
    scale: avatarModifierAreaSize
    })
    AvatarModifierArea.create(avatarModifierAreaEntity, {
    area: avatarModifierAreaSize,
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
    excludeIds: []
    })
    MeshRenderer.setBox(avatarModifierAreaEntity)
    Material.setPbrMaterial(avatarModifierAreaEntity, { albedoColor: Color4.create(0.5, 0.5, 0.5, 0.5) })
    
    const avatarModifierAreaText = engine.addEntity()
    Transform.create(avatarModifierAreaText, {
        parent: avatarModifierAreaEntity,
        position: Vector3.create(0, 0.65, 0),
        rotation: Quaternion.fromEulerDegrees(0, 45, 0)
    })
    TextShape.create(avatarModifierAreaText, {
        text: "AVATAR MODIFIER AREA",
        fontSize: 1.25,
        textColor: Color4.Black()
    })

    // CAMERA MODE AREA
    const cameraModeAreaEntity = engine.addEntity()
    const areaSize = Vector3.create(2, 3, 2)
    Transform.create(cameraModeAreaEntity, {
        position: Vector3.create(14.5, 1, 1.5),
        scale: areaSize
    })
    CameraModeArea.create(cameraModeAreaEntity, {
        area: areaSize,
        mode: CameraType.CT_FIRST_PERSON
    })
    MeshRenderer.setBox(cameraModeAreaEntity)
    Material.setPbrMaterial(cameraModeAreaEntity, { albedoColor: Color4.create(0.5, 0.5, 0.5, 0.5) })
    
    const cameraModAreaText = engine.addEntity()
    Transform.create(cameraModAreaText, {
        parent: cameraModeAreaEntity,
        position: Vector3.create(0, 0.65, 0),
        rotation: Quaternion.fromEulerDegrees(0, 135, 0)
    })
    TextShape.create(cameraModAreaText, {
        text: "CAMERA MODE AREA",
        fontSize: 1.25,
        textColor: Color4.Black()
    })   
}
