import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { engine, InputAction, Material, MeshCollider, MeshRenderer, pointerEventsSystem, Transform, PointerEvents, PointerEventType, InteractionType, inputSystem, GltfContainer, Tween, EasingFunction } from '@dcl/sdk/ecs'
import { setupUi } from './ui'


export function main() {
    // uncomment the line below to initialize UI from ui.tsx
    //setupUi()

    // Proximity down entity A
    const proximityDownEntityA = engine.addEntity()
    MeshRenderer.setBox(proximityDownEntityA)
    MeshCollider.setBox(proximityDownEntityA)
    Material.setPbrMaterial(proximityDownEntityA, {albedoColor: Color4.Yellow()})
    Transform.create(proximityDownEntityA, { position: Vector3.create(8, 1, 8)})

    pointerEventsSystem.onProximityDown(
        {
            entity: proximityDownEntityA,
            opts: {
                button: InputAction.IA_SECONDARY,
                hoverText: 'Press F',
                showHighlight: true,
                showFeedback: true,
                maxDistance: 10,
                maxPlayerDistance: 10,
                priority: 1,
            },
        },
        function () {
            console.log('Interacted with proximity down entity A')
            Tween.setScale(proximityDownEntityA, 
                Vector3.create(1, 1, 1), 
                Vector3.create(1.2, 1.2, 1.2), 
                500,
                EasingFunction.EF_EASEOUTBOUNCE
            )
        }
    )

    // Proximity entity B
    const proximityDownEntityB = engine.addEntity()
    MeshRenderer.setBox(proximityDownEntityB)
    MeshCollider.setBox(proximityDownEntityB)
    Material.setPbrMaterial(proximityDownEntityB, {albedoColor: Color4.Green()})
    Transform.create(proximityDownEntityB, { position: Vector3.create(10, 1, 8)})

    pointerEventsSystem.onProximityDown(
        {
            entity: proximityDownEntityB,
            opts: {
                button: InputAction.IA_SECONDARY,
                hoverText: 'Press F',
                showHighlight: true,
                showFeedback: true,
                maxDistance: 10,
                maxPlayerDistance: 10,
                priority: 2,
            },
        },
        function () {
            console.log('Interacted with proximity down entity B')
            Tween.setScale(proximityDownEntityB, 
                Vector3.create(1, 1, 1), 
                Vector3.create(1.2, 1.2, 1.2), 
                500,
                EasingFunction.EF_EASEOUTBOUNCE
            )
        }
    )

    // Cursor down entity
    const cursorDownEntity = engine.addEntity()
    MeshRenderer.setBox(cursorDownEntity)
    MeshCollider.setBox(cursorDownEntity)
    Material.setPbrMaterial(cursorDownEntity, {albedoColor: Color4.Red()})
    Transform.create(cursorDownEntity, { position: Vector3.create(12, 1, 8)})

    pointerEventsSystem.onPointerDown(
        {
            entity: cursorDownEntity,
            opts: {
                button: InputAction.IA_SECONDARY,
                hoverText: 'Press F',
                showHighlight: true,
                showFeedback: true,
                maxDistance: 10,
                maxPlayerDistance: 10,
                priority: 2,
            },
        },
        function () {
            console.log('Interacted with cursor down entity')   
            Tween.setScale(cursorDownEntity, 
                Vector3.create(1, 1, 1), 
                Vector3.create(1.2, 1.2, 1.2), 
                500,
                EasingFunction.EF_EASEOUTBOUNCE
            )
        }
    )

    // Cursor down entity B
    const cursorDownEntityB = engine.addEntity()
    MeshRenderer.setBox(cursorDownEntityB)
    MeshCollider.setBox(cursorDownEntityB)
    Material.setPbrMaterial(cursorDownEntityB, {albedoColor: Color4.Black()})
    Transform.create(cursorDownEntityB, { position: Vector3.create(14, 1, 8)})

    PointerEvents.create(cursorDownEntityB, {
        pointerEvents: [
            {
                eventType: PointerEventType.PET_DOWN,
                eventInfo: {
                    button: InputAction.IA_PRIMARY,
                    hoverText: 'Press E',
                    showHighlight: true,
                    showFeedback: true,
                    maxDistance: 10,
                    maxPlayerDistance: 10,
                    priority: 2,
                },
            },
            {
                eventType: PointerEventType.PET_DOWN,
                eventInfo: {
                    button: InputAction.IA_SECONDARY,
                    hoverText: 'Press F',
                    showHighlight: true,
                    showFeedback: true,
                    maxDistance: 10,
                    maxPlayerDistance: 10,
                    priority: 2,
                },
            },
        ],
    })

    engine.addSystem(() => {
        if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, cursorDownEntityB)) {
            console.log('Pressed primary button on cursor down entity B')
        }
        if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN, cursorDownEntityB)) {
            console.log('Pressed secondary button on cursor down entity B')
        }
    })

    // Proximity enter entity
    const proximityEnterEntity = engine.addEntity()
    MeshRenderer.setBox(proximityEnterEntity)
    MeshCollider.setBox(proximityEnterEntity)
    Material.setPbrMaterial(proximityEnterEntity, {albedoColor: Color4.Blue()})
    Transform.create(proximityEnterEntity, { position: Vector3.create(10, 1, 12)})

    pointerEventsSystem.onProximityEnter(
        {
            entity: proximityEnterEntity,
            opts: {
                button: InputAction.IA_POINTER,
                hoverText: 'Press F',
                showHighlight: true,
                showFeedback: true,
                maxDistance: 10,
                maxPlayerDistance: 10,
                priority: 1,
            },
        },
        function () {
            console.log('Proximity enter on proximity enter entity')
            Tween.setScale(proximityEnterEntity, 
                Vector3.create(1, 1, 1), 
                Vector3.create(1.2, 1.2, 1.2), 
                500,
                EasingFunction.EF_EASEOUTBOUNCE
            )
        }
    )

    // Cursor hover enter entity
    const cursorHoverEnterEntity = engine.addEntity()
    MeshRenderer.setBox(cursorHoverEnterEntity)
    MeshCollider.setBox(cursorHoverEnterEntity)
    Material.setPbrMaterial(cursorHoverEnterEntity, {albedoColor: Color4.Teal()})
    Transform.create(cursorHoverEnterEntity, { position: Vector3.create(8, 1, 12)})

    pointerEventsSystem.onPointerHoverEnter(
        {
            entity: cursorHoverEnterEntity,
            opts: {
                button: InputAction.IA_POINTER,
                hoverText: 'Press F',
                showHighlight: true,
                showFeedback: true,
                maxDistance: 10,
                maxPlayerDistance: 10,
                priority: 1,
            },
        },
        function () {
            console.log('Hover enter on cursor hover enter entity')
            Tween.setScale(cursorHoverEnterEntity, 
                Vector3.create(1, 1, 1), 
                Vector3.create(1.2, 1.2, 1.2), 
                500,
                EasingFunction.EF_EASEOUTBOUNCE
            )
        }
    )

    // Proximity leave entity
    const proximityLeaveEntity = engine.addEntity()
    MeshRenderer.setBox(proximityLeaveEntity)
    MeshCollider.setBox(proximityLeaveEntity)
    Material.setPbrMaterial(proximityLeaveEntity, {albedoColor: Color4.Blue()})
    Transform.create(proximityLeaveEntity, { position: Vector3.create(6, 1, 12)})

    pointerEventsSystem.onProximityLeave(
        {
            entity: proximityLeaveEntity,
            opts: {
                button: InputAction.IA_POINTER,
                hoverText: 'Press F',
                showHighlight: true,
                showFeedback: true,
                maxDistance: 10,
                maxPlayerDistance: 10,
                priority: 1,
            },
        },
        function () {
            console.log('Proximity leave on proximity leave entity')   
            Tween.setScale(proximityLeaveEntity, 
                Vector3.create(1, 1, 1), 
                Vector3.create(1.2, 1.2, 1.2), 
                500,
                EasingFunction.EF_EASEOUTBOUNCE
            )
        }
    )

    // Cursor hover leave entity
    const cursorHoverLeaveEntity = engine.addEntity()
    MeshRenderer.setBox(cursorHoverLeaveEntity)
    MeshCollider.setBox(cursorHoverLeaveEntity)
    Material.setPbrMaterial(cursorHoverLeaveEntity, {albedoColor: Color4.Teal()})
    Transform.create(cursorHoverLeaveEntity, { position: Vector3.create(4, 1, 12)})

    pointerEventsSystem.onPointerHoverLeave(
        {
            entity: cursorHoverLeaveEntity,
            opts: {
                button: InputAction.IA_POINTER,
                hoverText: 'Press F',
                showHighlight: true,
                showFeedback: true,
                maxDistance: 10,
                maxPlayerDistance: 10,
                priority: 1,
            },
        },
        function () {
            console.log('Hover leave on cursor hover leave entity')
            Tween.setScale(cursorHoverLeaveEntity, 
                Vector3.create(1, 1, 1), 
                Vector3.create(1.2, 1.2, 1.2), 
                500,
                EasingFunction.EF_EASEOUTBOUNCE
            )
        }
    )

    // Proximity door
    const doorPivot = engine.addEntity()
    Transform.create(doorPivot, {
        position: Vector3.create(3, 0, 4.34),
    })

    const proximityDoor = engine.addEntity()
    GltfContainer.create(proximityDoor, {
        src: 'assets/asset-packs/wooden_door/Door_Wood_01/Door_Wood_01.glb',
    })
    Transform.create(proximityDoor, { 
        position: Vector3.create(-1,0,0),
        parent: doorPivot
    })

    var isDoorOpen = false;
    var closedDoorRot = Quaternion.fromEulerDegrees(0, 0, 0);
    var openDoorRot = Quaternion.fromEulerDegrees(0, 90, 0);

    pointerEventsSystem.onProximityDown(
        {
            entity: proximityDoor,
            opts: {
                button: InputAction.IA_PRIMARY,
                hoverText: 'Open / Close',
                showHighlight: true,
                showFeedback: true,
                maxDistance: 10,
                maxPlayerDistance: 10,
                priority: 1,
            },
        },
        function () {
            if (isDoorOpen) {
                console.log('Closing door')
                Tween.setRotate(doorPivot, 
                    openDoorRot,
                    closedDoorRot,
                    700
                )
                isDoorOpen = false;
            } else {
                console.log('Opening door')
                Tween.setRotate(doorPivot, 
                    closedDoorRot,
                    openDoorRot,
                    700
                )
                isDoorOpen = true;
            }
        }
    )
}