import { engine, GltfContainer, MeshRenderer, Transform, Material } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'

// export all the functions required to make the scene work
export * from '@dcl/sdk'

// Table (primitive)
let table = engine.addEntity()
Transform.create(table, {
  position: Vector3.create(8, 0.1, 5),
  scale: Vector3.create(3, 0.2, 3)
})
MeshRenderer.setBox(table)

// Rose (GLB + internal tex)
let roseEntity = engine.addEntity()
Transform.create(roseEntity, {
  position: Vector3.create(9, 0.5, 5),
  scale: Vector3.create(6, 6, 6)
})
GltfContainer.create(roseEntity, { src: 'models/Rose.glb' })

// Book (GLB + external tex)
let bookEntity = engine.addEntity()
Transform.create(bookEntity, {
  position: Vector3.create(7, 0.5, 4)
})
GltfContainer.create(bookEntity, { src: 'models/Book_05.glb' })

// Deformed cube with texture (primitive + tex)
const deformedCubeEntity = engine.addEntity()
Transform.create(deformedCubeEntity, {
  position: Vector3.create(12, 2, 5),
  rotation: Quaternion.fromEulerDegrees(32.5, 55, 78.69),
  scale: Vector3.create(0.75, 1.25, 0.75)
})
MeshRenderer.setBox(deformedCubeEntity)
Material.setBasicMaterial(deformedCubeEntity, {
  texture: Material.Texture.Common({
    src: 'images/scene-thumbnail.png',
  }),
})

// Monster (GLB + internal tex)
const monsterEntity = engine.addEntity()
Transform.create(monsterEntity, {
  position: Vector3.create(4, 3, 8),
  rotation: Quaternion.fromEulerDegrees(0, 180, 0),
})
GltfContainer.create(monsterEntity, { src: "models/Monster.glb" })

// Tree (GLTF + external tex)
const underwaterEntity = engine.addEntity()
Transform.create(underwaterEntity, {
  position: Vector3.create(8, 1, 10)
})
GltfContainer.create(underwaterEntity, { src: "models/Tree.gltf" })