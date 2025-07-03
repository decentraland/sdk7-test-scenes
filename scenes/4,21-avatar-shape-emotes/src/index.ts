import { Vector3, Color4, Quaternion } from '@dcl/sdk/math'
import { engine, ColliderLayer, AvatarShape, Transform, MeshRenderer, MeshCollider, pointerEventsSystem, InputAction, Entity } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/src/players'

let loadedPlayerData = false
let currentNpcEmoteIndex = -1
engine.addSystem((dt) => {
    if (loadedPlayerData) return

    let userData = getPlayer()
    
    if (!userData || !userData.emotes || userData.emotes.length == 0) return
    loadedPlayerData = true
    
    // Spawn copied avatar
    const avatarEntity = engine.addEntity()
    Transform.create(avatarEntity, {
        position: Vector3.create(8, 0.1, 8),
        rotation: Quaternion.fromEulerDegrees(0, 180, 0)
    })
    AvatarShape.create(avatarEntity, {
        // id: " ",
        id: "MyAvatarId",
        name: "MyAvatar",
        bodyShape: "urn:decentraland:off-chain:base-avatars:BaseMale",
        skinColor: {
            "r": 0.9882353,
            "g": 0.8862745,
            "b": 0.768627465
        },
        hairColor: {
            "r": 0.596078455,
            "g": 0.372549027,
            "b": 0.215686277
        },
        eyeColor: {
            "r": 0.372549027,
            "g": 0.223529413,
            "b": 0.196078435
        },
        expressionTriggerId: 'robot',
        wearables: userData.wearables,
        emotes: userData.emotes
    })

    // Spawn emotes trigger cube
    const avatarShapeEmoteTrigger = engine.addEntity()
    MeshRenderer.setBox(avatarShapeEmoteTrigger)
    MeshCollider.setBox(avatarShapeEmoteTrigger, ColliderLayer.CL_POINTER)
    Transform.create(avatarShapeEmoteTrigger, { position: Vector3.create(7, 1, 4), scale: Vector3.create(0.5, 0.5, 0.5) })
    pointerEventsSystem.onPointerDown(
        { entity: avatarShapeEmoteTrigger, opts: { button: InputAction.IA_POINTER, hoverText: 'play next emote', maxDistance: 5 } },
        () => {
            const component = AvatarShape.getMutableOrNull(avatarEntity)
            if (!component) return

            currentNpcEmoteIndex++
            if (currentNpcEmoteIndex == userData.emotes.length)
                currentNpcEmoteIndex = 0
            
            component.expressionTriggerId = userData.emotes[currentNpcEmoteIndex]
        }
    )
})