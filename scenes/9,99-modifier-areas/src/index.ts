import {
    engine,
    InputAction,
    MeshCollider,
    MeshRenderer,
    pointerEventsSystem,
    Transform,
    CameraMode,
    CameraType,
    Material,
    TextShape,
    AvatarModifierType,
    AvatarModifierArea,
    CameraModeArea,
    Entity
} from '@dcl/sdk/ecs'

import { Quaternion, Vector3, Color4 } from '@dcl/sdk/math'

// AVATAR MODIFIER AREA
const excludedUser1 = 'USER-WALLET-ADDRESS-GOES-HERE'
const excludedUser2 = 'USER-WALLET-ADDRESS-GOES-HERE'
const avatarModifierAreaEntity = engine.addEntity()
const avatarModifierAreaSize = Vector3.create(4, 4, 4)
Transform.create(avatarModifierAreaEntity, {
    position: Vector3.create(0, 1, 12),
    scale: avatarModifierAreaSize
})
AvatarModifierArea.create(avatarModifierAreaEntity, {
    area: avatarModifierAreaSize,
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
    // modifiers: [AvatarModifierType.AMT_DISABLE_PASSPORTS],
    excludeIds: []
})
MeshRenderer.setBox(avatarModifierAreaEntity)
Material.setPbrMaterial(avatarModifierAreaEntity, { albedoColor: Color4.create(0.5, 0.5, 0.5, 0.5) })
const avatarModifierAreaCube = createCube(1, 1, 15, false)
MeshCollider.setBox(avatarModifierAreaCube)
pointerEventsSystem.onPointerDown(
    { entity: avatarModifierAreaCube, opts: { button: InputAction.IA_POINTER, hoverText: 'toggle excluded id' } },
    () => {
        // TODO: Detect user id on click and add/remove from excluded, instead of hardcoded ones...
        
        const mutable = AvatarModifierArea.getMutable(avatarModifierAreaEntity)
        if (mutable.excludeIds.includes(excludedUser1) && mutable.excludeIds.includes(excludedUser2)) {
            mutable.excludeIds = []
            console.log(`REMOVED excluded users`)
        }
        else {
            mutable.excludeIds = [excludedUser1, excludedUser2]
            console.log(`ADDED excluded users`)
        }
    }
)

const avatarModifierAreaText = engine.addEntity()
Transform.create(avatarModifierAreaText, {
    parent: avatarModifierAreaEntity,
    position: Vector3.create(0.25, 0.65, 0),
    rotation: Quaternion.fromEulerDegrees(0, -90, 0)
})
TextShape.create(avatarModifierAreaText, {
    text: "AVATAR MODIFIER AREA",
    fontSize: 1.25,
    textColor: Color4.Black()
})

// CAMERA MODE AREA
const cameraModeAreaEntity = engine.addEntity()
const areaSize = Vector3.create(4, 4, 4)
Transform.create(cameraModeAreaEntity, {
    position: Vector3.create(5.5, 1, 8),
    scale: areaSize,
    rotation: Quaternion.fromEulerDegrees(0, 45, 0)
})
CameraModeArea.create(cameraModeAreaEntity, {
    area: areaSize,
    mode: CameraType.CT_FIRST_PERSON
})
MeshRenderer.setBox(cameraModeAreaEntity)
Material.setPbrMaterial(cameraModeAreaEntity, { albedoColor: Color4.create(0.5, 0.5, 0.5, 0.5) })

const cube = createCube(8, 1, 12, false)
MeshCollider.setBox(cube)
pointerEventsSystem.onPointerDown(
    { entity: cube, opts: { button: InputAction.IA_POINTER, hoverText: 'reposition area' } },
    () => {
        // const mutable = CameraModeArea.getMutable(cameraModeAreaEntity)
        // if (mutable.mode == CameraType.CT_FIRST_PERSON) {
        //     mutable.mode = CameraType.CT_THIRD_PERSON
        //     console.log(`Camera mode changed to THIRD PERSON`)
        // } else {
        //     mutable.mode = CameraType.CT_FIRST_PERSON
        //     console.log(`Camera mode changed to FIRST PERSON`)
        // }
        
        const mutable = Transform.getMutable(cameraModeAreaEntity)
        mutable.position = Vector3.create(mutable.position.x === 16 ? 5.5 : 16, mutable.position.y, mutable.position.z)
    }
)

const cameraModeAreaEntity2 = engine.addEntity()
Transform.create(cameraModeAreaEntity2, {
    position: Vector3.create(8.5, 1, 8),
    scale: areaSize,
})
CameraModeArea.create(cameraModeAreaEntity2, {
    area: areaSize,
    mode: CameraType.CT_THIRD_PERSON
})
MeshRenderer.setBox(cameraModeAreaEntity2)
Material.setPbrMaterial(cameraModeAreaEntity2, { albedoColor: Color4.create(0.5, 0.5, 0.5, 0.5) })

const cameraModAreaText = engine.addEntity()
Transform.create(cameraModAreaText, {
    position: Vector3.create(7, 3.5, 8)
})
TextShape.create(cameraModAreaText, {
    text: "CAMERA MODE AREA",
    fontSize: 5,
    textColor: Color4.Black()
})

function createCube(x: number, y: number, z: number, spawner = true): Entity {
    const entity = engine.addEntity()
    Transform.create(entity, { position: { x, y, z } })
    MeshRenderer.setBox(entity)
    MeshCollider.setBox(entity)
    Material.setPbrMaterial(entity, { albedoColor: Color4.fromHexString(getRandomHexColor()) })
    return entity
}

function getRandomHexColor(): string {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}