import {
    engine,
    Material,
    MeshRenderer,
    TextShape,
    Transform,
    AvatarModifierArea,
    AvatarModifierType
} from '@dcl/sdk/ecs'

import { Color4, Vector3 } from '@dcl/sdk/math'

// AVATAR MODIFIER AREA - HIDE NAMETAGS
const areaSize = Vector3.create(4, 4, 4)
const hideNametagsAreaEntity = engine.addEntity()
Transform.create(hideNametagsAreaEntity, {
    position: Vector3.create(8, 1, 8),
    scale: areaSize
})
AvatarModifierArea.create(hideNametagsAreaEntity, {
    area: areaSize,
    modifiers: [AvatarModifierType.AMT_HIDE_NAMETAGS],
    excludeIds: []
})

// Transparent cube representing the area
MeshRenderer.setBox(hideNametagsAreaEntity)
Material.setPbrMaterial(hideNametagsAreaEntity, { albedoColor: Color4.create(0.5, 0.5, 0.5, 0.5) })

const labelEntity = engine.addEntity()
Transform.create(labelEntity, {
    position: Vector3.create(8, 3.5, 8)
})
TextShape.create(labelEntity, {
    text: 'HIDE NAMETAGS AREA',
    fontSize: 3,
    textColor: Color4.Black()
})
