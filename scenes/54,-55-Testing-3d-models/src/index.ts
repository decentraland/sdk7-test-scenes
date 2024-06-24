import { engine, GltfContainer, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// export all the functions required to make the scene work
export * from '@dcl/sdk'

let samplescene = engine.addEntity()

GltfContainer.create(samplescene, { src: 'models/Rose.glb' })

Transform.create(samplescene, {
  position: Vector3.create(3, 0.5, 3),
  scale: Vector3.create(2, 2, 2)
})

let sampleCube = engine.addEntity()

Transform.create(sampleCube, {
  position: Vector3.create(3, 0.1, 3),
  scale: Vector3.create(3, 0.2, 3)
})

MeshRenderer.setBox(sampleCube)