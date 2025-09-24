import {
    ColliderLayer,
    engine,
    Entity,
    InputAction,
    Material,
    MeshCollider,
    MeshRenderer,
    pointerEventsSystem,
    Transform,
    TriggerArea,
    triggerAreaEventsSystem,
    GltfContainer
} from '@dcl/ecs'
import {Color4, Quaternion, Vector3} from '@dcl/sdk/math'
import * as CANNON from 'cannon'

// Cannon.js physics world setup
const world = new CANNON.World()
world.gravity.set(0, -9.82, 0)

const physicsBodies = new Map<Entity, CANNON.Body>()
const fixedTimeStep = 1 / 60
let physicsAccumulator = 0

export function main() {
    // Box Trigger Area detecting Entity and Player
    const movingCube = engine.addEntity()
    Transform.create(movingCube, { position: Vector3.create(3, 1, 14.5), scale: Vector3.create(0.25, 0.25, 0.25)})
    MeshRenderer.setBox(movingCube)
    MeshCollider.setBox(movingCube, ColliderLayer.CL_CUSTOM3)

    const cubeMovementEntity = engine.addEntity()
    Transform.create(cubeMovementEntity, { position: Vector3.create(1, 1, 14.5)})
    MeshRenderer.setBox(cubeMovementEntity)
    MeshCollider.setBox(cubeMovementEntity)
    pointerEventsSystem.onPointerDown(
        { entity: cubeMovementEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'move trigger' } },
        () => {
            const mutableTransform = Transform.getMutable(movingCube)
            if (mutableTransform.position.x == 3)
                mutableTransform.position.x = 5
            else
                mutableTransform.position.x = 3
        }
    )

    const movingGltfContainer = engine.addEntity()
    Transform.create(movingGltfContainer, { position: Vector3.create(8, 2, 14.5)})
    GltfContainer.create(movingGltfContainer, {
        src: 'models/Monster.glb',
        visibleMeshesCollisionMask: ColliderLayer.CL_CUSTOM4
    })

    const gltfMovementEntity = engine.addEntity()
    Transform.create(gltfMovementEntity, { position: Vector3.create(10, 1, 14.5)})
    MeshRenderer.setBox(gltfMovementEntity)
    MeshCollider.setBox(gltfMovementEntity)
    pointerEventsSystem.onPointerDown(
        { entity: gltfMovementEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'move trigger' } },
        () => {
            const mutableTransform = Transform.getMutable(movingGltfContainer)
            if (mutableTransform.position.x == 8)
                mutableTransform.position.x = 5
            else
                mutableTransform.position.x = 8
        }
    )

    const triggerAreaEntity = engine.addEntity()
    Transform.create(triggerAreaEntity, {
        position: Vector3.create(5, 1.5, 14.5),
        scale: Vector3.create(1, 3, 1),
        rotation: Quaternion.fromEulerDegrees(0, 45, 0)
    })
    setupTriggerArea(triggerAreaEntity, ColliderLayer.CL_PLAYER | ColliderLayer.CL_CUSTOM4)
    
    // Spawn falling sphere with physics that gets removed on trigger enter
    const sphereSpawnButton = engine.addEntity()
    Transform.create(sphereSpawnButton, { position: Vector3.create(8, 1, 10.5) })
    MeshRenderer.setSphere(sphereSpawnButton)
    MeshCollider.setSphere(sphereSpawnButton)
    addSpherePhysics(sphereSpawnButton, 0.5, 0)
    pointerEventsSystem.onPointerDown(
        { entity: sphereSpawnButton, opts: { button: InputAction.IA_POINTER, hoverText: 'spawn sphere' } },
        () => {
            const buttonTransform = Transform.get(sphereSpawnButton)

            const spawnedSphere = engine.addEntity()
            Transform.create(spawnedSphere, {
                position: Vector3.create(
                    buttonTransform.position.x,
                    buttonTransform.position.y + 2,
                    buttonTransform.position.z
                ),
                scale: Vector3.create(1, 1, 1)
            })

            MeshRenderer.setSphere(spawnedSphere)
            MeshCollider.setSphere(spawnedSphere, ColliderLayer.CL_PHYSICS)
            Material.setPbrMaterial(spawnedSphere, {
                albedoColor: Color4.create(1, 1, 1, 0.5)
            })

            TriggerArea.setSphere(spawnedSphere, ColliderLayer.CL_POINTER)

            // Add physics so it falls with gravity
            addSpherePhysics(spawnedSphere, 0.5, 1)

            // Remove sphere on first OnEnter trigger
            triggerAreaEventsSystem.onTriggerEnter(spawnedSphere, () => {
                const body = physicsBodies.get(spawnedSphere)
                if (body) {
                    world.remove(body)
                    physicsBodies.delete(spawnedSphere)
                }
                engine.removeEntity(spawnedSphere)
            })
        }
    )

    // Physics stepping and syncing system
    engine.addSystem((dt: number) => {
        physicsAccumulator += dt
        while (physicsAccumulator >= fixedTimeStep) {
            world.step(fixedTimeStep)
            physicsAccumulator -= fixedTimeStep
        }

        physicsBodies.forEach((body, entity) => {
            const mutableTransform = Transform.getMutable(entity)
            mutableTransform.position.x = body.position.x
            mutableTransform.position.y = body.position.y
            mutableTransform.position.z = body.position.z
        })
    })

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
            const randomColor = Color4.fromHexString(getRandomHexColor())
            randomColor.a = 0.5
            Material.setPbrMaterial(triggerAreaEntity, {
                albedoColor: randomColor,
            })
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
            const randomColor = Color4.fromHexString(getRandomHexColor())
            randomColor.a = 0.5
            Material.setPbrMaterial(triggerAreaEntity, {
                albedoColor: randomColor,
            })
        })
}

function addSpherePhysics(entity: Entity, radius: number, mass = 1) {
    const transform = Transform.get(entity)
    const shape = new CANNON.Sphere(radius)
    const body = new CANNON.Body({ mass, shape })
    body.position.set(transform.position.x, transform.position.y, transform.position.z)
    world.addBody(body)
    physicsBodies.set(entity, body)
}

export function getRandomHexColor(): string {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}