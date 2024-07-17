import { engine, GltfContainer, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// export all the functions required to make the scene work
export * from '@dcl/sdk'

let rose = engine.addEntity()

GltfContainer.create(rose, { src: 'models/Rose.glb' })

Transform.create(rose, {
  position: Vector3.create(3, 0.5, 3),
  scale: Vector3.create(2, 2, 2)
})

let table = engine.addEntity()

Transform.create(table, {
  position: Vector3.create(3, 0.1, 3),
  scale: Vector3.create(3, 0.2, 3)
})

MeshRenderer.setBox(table)