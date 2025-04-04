import { Vector3 } from '@dcl/sdk/math'
import { ColliderLayer, engine, GltfContainer, raycastSystem, Transform, pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'

const DELAY = 3000
const BOOK_GLTF_SRC = "models/Book_05.glb"
const MONSTER_GLTF_SRC = "models/Monster.glb"

export function main() {
    // Update GltfContainer 'visibleMeshesCollisionMask' prop
    
    let plane = engine.addEntity()
    GltfContainer.create(plane, {src: 'models/test.glb'})
    Transform.create(plane, {position: Vector3.create(8, 0, 8)})

    let timestamp = Date.now()
    engine.addSystem(() => {
        if (GltfContainer.get(plane).visibleMeshesCollisionMask != ColliderLayer.CL_CUSTOM1) {
            if (Date.now() < timestamp + DELAY) return
            GltfContainer.getMutable(plane).visibleMeshesCollisionMask = ColliderLayer.CL_CUSTOM1
            console.log("Set collision mask")
        }
        if (Date.now() < timestamp + 1000) return
        timestamp = Date.now()
        raycastSystem.registerGlobalDirectionRaycast(
            {
                entity: engine.PlayerEntity,
                opts: { direction: Vector3.Down(), collisionMask: ColliderLayer.CL_CUSTOM1 },
            },
            function (raycastResult) {
                console.log(`Ray hit: ${raycastResult.hits[0]?.position?.y}`)
            }
        )
    })
    
    // Update GltfContainer 'src' prop

    const swappingGltfEntity = engine.addEntity()
    GltfContainer.create(swappingGltfEntity, { src: BOOK_GLTF_SRC, visibleMeshesCollisionMask: ColliderLayer.CL_POINTER })
    Transform.create(swappingGltfEntity, { position: Vector3.create(10, 1, 8) })

    pointerEventsSystem.onPointerDown(
        {
            entity: swappingGltfEntity,
            opts: { button: InputAction.IA_POINTER, hoverText: 'SWAP MESH' },
        },
        function () {
            const gltfComponent = GltfContainer.getMutable(swappingGltfEntity)
            gltfComponent.src = gltfComponent.src === BOOK_GLTF_SRC ? MONSTER_GLTF_SRC : BOOK_GLTF_SRC
        }
    )
}
