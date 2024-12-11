import { Vector3, Color4 } from '@dcl/sdk/math'
import { engine, Transform, MeshRenderer, GltfContainer, GltfNode, MeshCollider, PointerEvents, PointerEventType, pointerEventsSystem, InputAction,
Animator, ColliderLayer } from '@dcl/sdk/ecs'

// GLTF ENTITY
const gltfEntity = engine.addEntity()
Transform.create(gltfEntity, { position: Vector3.create(8, 3, 8), scale: Vector3.create(0.33, 0.33, 0.33) })
GltfContainer.create(gltfEntity, {
  // src: 'models/shark.glb',
  src: 'models/parent_test.glb',
})
Animator.create(gltfEntity, {
  states: [
    {
      clip: 'sunAction',
      playing: false,
      // loop: true,
    },
  ],
})
// Animator.stopAllAnimations(gltfNodeEntity)

// GLTFNode setup cube
const gltfNodeEntity = engine.addEntity()
const createGLTFNodeTrigger = engine.addEntity()
MeshRenderer.setBox(createGLTFNodeTrigger)
MeshCollider.setBox(createGLTFNodeTrigger, ColliderLayer.CL_POINTER)
Transform.create(createGLTFNodeTrigger, { position: Vector3.create(4, 1, 4), scale: Vector3.create(0.5, 0.5, 0.5) })
pointerEventsSystem.onPointerDown(
  { entity: createGLTFNodeTrigger, opts: { button: InputAction.IA_POINTER, hoverText: 'CREATE GLTF-NODE', maxDistance: 5 } },
  () => {
    if (!GltfContainer.has(gltfEntity)) return

    GltfNode.create(gltfNodeEntity, {
      // nodePath: 'Scene_root/shark_skeleton/Sphere.001/Sphere.001_primitive0', // BabylonJS sandbox
      // nodePath: 'Scene_root/shark_skeleton/Sphere/Sphere.001', // Unity (same for AB or RAW)
      // nodePath: 'sun/earth/moon',
      nodePath: 'sun/earth',
      gltfContainerEntity: gltfEntity
    })

    MeshCollider.setBox(gltfNodeEntity)
    pointerEventsSystem.onPointerDown({
      entity: gltfNodeEntity,
      opts: { button: InputAction.IA_POINTER }
    }, function () {
      console.log('NODE CLICKED!')
    })

// GLTF NODE CHILD ENTITY
    /*let attachedChild = false
    engine.addSystem (function (dt) {
      const gltfNodeTransform = Transform.getOrNull(gltfNodeEntity)
      if (attachedChild || !gltfNodeTransform) return

      console.log("PRAVS - ATTACHING SPHERE AS CHILD...")

      const childSphere = engine.addEntity()
      Transform.create(childSphere, {
        position: Vector3.create(0, -1.5, 0),
        parent: gltfNodeEntity
      })
      MeshRenderer.setSphere(childSphere)
      attachedChild = true
    })*/
  }
)

// GLTFNode removal cube
const removeGLTFNodeTrigger = engine.addEntity()
MeshRenderer.setBox(removeGLTFNodeTrigger)
MeshCollider.setBox(removeGLTFNodeTrigger, ColliderLayer.CL_POINTER)
Transform.create(removeGLTFNodeTrigger, { position: Vector3.create(6, 1, 4), scale: Vector3.create(0.5, 0.5, 0.5) })
pointerEventsSystem.onPointerDown(
  { entity: removeGLTFNodeTrigger, opts: { button: InputAction.IA_POINTER, hoverText: 'REMOVE GLTF-NODE', maxDistance: 5 } },
  () => {
    if (!GltfNode.has(gltfNodeEntity)) return

    GltfNode.deleteFrom(gltfNodeEntity)
  }
)

// GLTFContainer removal cube
const removeGLTFContainerTrigger = engine.addEntity()
MeshRenderer.setBox(removeGLTFContainerTrigger)
MeshCollider.setBox(removeGLTFContainerTrigger, ColliderLayer.CL_POINTER)
Transform.create(removeGLTFContainerTrigger, { position: Vector3.create(8, 1, 4), scale: Vector3.create(0.5, 0.5, 0.5) })
pointerEventsSystem.onPointerDown(
  { entity: removeGLTFContainerTrigger, opts: { button: InputAction.IA_POINTER, hoverText: 'REMOVE GLTF-CONTAINER', maxDistance: 5 } },
  () => {
    if (!GltfContainer.has(gltfEntity)) return

    GltfContainer.deleteFrom(gltfEntity)
  }
)
