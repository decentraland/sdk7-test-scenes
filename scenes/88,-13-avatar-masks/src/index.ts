import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { engine, InputAction, Material, MeshCollider, MeshRenderer, pointerEventsSystem, Transform, PointerEvents, PointerEventType, inputSystem, GltfContainer, Tween, EasingFunction, ColliderLayer, CameraType, AvatarEmoteMask, AvatarAttach, AvatarAnchorPointType, InteractionType, PBMeshCollider_BoxMesh, PBMeshCollider } from '@dcl/sdk/ecs'
import { setupUi } from './ui'
import { stopEmote, triggerEmote, triggerSceneEmote } from '~system/RestrictedActions'
import { getPlayer, onEnterScene, onLeaveScene } from '@dcl/sdk/src/players'
import { parentEntity, removeParent, syncEntity } from '@dcl/sdk/src/network'

enum SyncId {
    CRATE_ANCHOR = 1,
    CRATE = 2,
}

export function main() {
    // uncomment the line below to initialize UI from ui.tsx
    //setupUi()

    // Trigger scene emote entity
    const triggerSceneEmoteEntity = engine.addEntity()
    MeshRenderer.setBox(triggerSceneEmoteEntity)
    MeshCollider.setBox(triggerSceneEmoteEntity)
    Material.setPbrMaterial(triggerSceneEmoteEntity, {albedoColor: Color4.Green()})
    Transform.create(triggerSceneEmoteEntity, { position: Vector3.create(4, 1, 4)})

    pointerEventsSystem.onPointerDown(
        {
            entity: triggerSceneEmoteEntity,
            opts: {
                button: InputAction.IA_PRIMARY,
                hoverText: 'Press E',
                showHighlight: true,
                showFeedback: true,
                maxDistance: 10,
                maxPlayerDistance: 10,
            },
        },
        function () {
            console.log('Interacted with trigger scene emote entity')   
            //triggerSceneEmote({ src: 'assets/scene/Models/WateringCan_emote.glb', loop: true, mask: AvatarEmoteMask.AEM_FULL_BODY})
            triggerSceneEmote({ src: 'assets/scene/Models/Hanoi_juggler_emote.glb', loop: true, mask: AvatarEmoteMask.AEM_UPPER_BODY})
            //triggerSceneEmote({ src: 'assets/scene/Models/AvatarMasks_Test_emote.glb', loop: true, mask: AvatarEmoteMask.AEM_UPPER_BODY})
        }
    )

    // Trigger emote entity
    const triggerEmoteEntity = engine.addEntity()
    MeshRenderer.setBox(triggerEmoteEntity)
    MeshCollider.setBox(triggerEmoteEntity)
    Material.setPbrMaterial(triggerEmoteEntity, {albedoColor: Color4.Yellow()})
    Transform.create(triggerEmoteEntity, { position: Vector3.create(6, 1, 4)})

    pointerEventsSystem.onPointerDown(
        {
            entity: triggerEmoteEntity,
            opts: {
                button: InputAction.IA_PRIMARY,
                hoverText: 'Press E',
                showHighlight: true,
                showFeedback: true,
                maxDistance: 10,
                maxPlayerDistance: 10,
            },
        },
        function () {
            console.log('Interacted with trigger emote entity')
            triggerEmote({ predefinedEmote: 'money'})
        }
    )

    // Stop emote entity
    const stopEmoteEntity = engine.addEntity()
    MeshRenderer.setBox(stopEmoteEntity)
    MeshCollider.setBox(stopEmoteEntity)
    Material.setPbrMaterial(stopEmoteEntity, {albedoColor: Color4.Red()})
    Transform.create(stopEmoteEntity, { position: Vector3.create(8, 1, 4)})

    pointerEventsSystem.onPointerDown(
        {
            entity: stopEmoteEntity,
            opts: {
                button: InputAction.IA_PRIMARY,
                hoverText: 'Press E',
                showHighlight: true,
                showFeedback: true,
                maxDistance: 10,
                maxPlayerDistance: 10,
            },
        },
        function () {
            console.log('Interacted with stop emote entity')
            stopEmote({})
        }
    )

    // Pickup crate
    // Anchor entity is invisible, attached to the hand. Crate is a child with an offset.
    const crateAnchorEntity = engine.addEntity()
    Transform.create(crateAnchorEntity, {})
    syncEntity(crateAnchorEntity, [AvatarAttach.componentId], SyncId.CRATE_ANCHOR)

    const crateEntity = engine.addEntity()
    const crateInitialPosition = Vector3.create(8, 0, 8)
    const crateScale = Vector3.create(0.9, 0.9, 0.9)
    const cratePositionOffsetWhenHeld = Vector3.create(0.35, 0, 0)
    const crateRotationWhenHeld = Quaternion.fromEulerDegrees(0, 10, 10)
    GltfContainer.create(crateEntity, {
        src: 'assets/asset-packs/closed_wooden_crate/Crate_01/Crate_01.glb',
        invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
	    visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    })
    MeshCollider.setBox(crateEntity)
    Transform.create(crateEntity, { position: crateInitialPosition, scale: crateScale })
    syncEntity(crateEntity, [Transform.componentId], SyncId.CRATE)

    let crateHeld = false

    async function pickUpCrate() {
        if (crateHeld) return
        crateHeld = true

        // Play carry animation
        triggerSceneEmote({ src: 'assets/scene/Models/AvatarMasks_Test_emote.glb', loop: true, mask: AvatarEmoteMask.AEM_UPPER_BODY})

        // Remove collider so it doesn't block interactions while held
        MeshCollider.deleteFrom(crateEntity)
        pointerEventsSystem.removeOnPointerDown(crateEntity)

        // Attach anchor to the local player's left hand, synced so others see it
        const userData = await getPlayer()
        if (!userData) return

        AvatarAttach.createOrReplace(crateAnchorEntity, {
            avatarId: userData.userId,
            anchorPointId: AvatarAnchorPointType.AAPT_LEFT_HAND,
        })

        // Parent crate to anchor using parentEntity() for proper sync
        Transform.createOrReplace(crateEntity, {
            position: cratePositionOffsetWhenHeld,
            scale: crateScale,
            rotation: crateRotationWhenHeld,
        })
        parentEntity(crateEntity, crateAnchorEntity)
    }

    function dropCrate() {
        if (!crateHeld) return
        crateHeld = false

        // Stop carry animation
        stopEmote({})

        // Detach anchor from avatar and unparent crate
        AvatarAttach.deleteFrom(crateAnchorEntity)
        removeParent(crateEntity)

        // Place in front of the player (world position)
        const playerTransform = Transform.get(engine.PlayerEntity)
        const forward = Vector3.rotate(Vector3.Forward(), playerTransform.rotation)
        const dropPosition = Vector3.add(playerTransform.position, forward)
        dropPosition.y = 0

        Transform.createOrReplace(crateEntity, {
            position: dropPosition,
            rotation: playerTransform.rotation,
            scale: crateScale,
        })

        // Re-add collider and interaction
        MeshCollider.setBox(crateEntity)
        pointerEventsSystem.onPointerDown(
            {
                entity: crateEntity,
                opts: {
                    button: InputAction.IA_PRIMARY,
                    hoverText: 'Pick up',
                    showHighlight: false,
                    showFeedback: true,
                    maxDistance: 4,
                    maxPlayerDistance: 4,
                },
            },
            pickUpCrate
        )
    }

    pointerEventsSystem.onPointerDown(
        {
            entity: crateEntity,
            opts: {
                button: InputAction.IA_PRIMARY,
                hoverText: 'Pick up',
                showHighlight: false,
                showFeedback: true,
                maxDistance: 4,
                maxPlayerDistance: 4,
            },
        },
        pickUpCrate
    )

    engine.addSystem(() => {
        if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
            dropCrate()
        }
    })
}