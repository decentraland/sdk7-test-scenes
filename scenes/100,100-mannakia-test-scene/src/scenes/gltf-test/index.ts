import { GltfContainer, Transform } from '@dcl/sdk/ecs'
import { sceneEntities } from '../../utils/entity'
import { Vector3 } from '@dcl/sdk/math'

export function main(): void {
  const N = 48
  for (let i = 0; i < N; i++) {
    const gltfEntity = sceneEntities.addEntity()
    Transform.create(gltfEntity, {
      position: Vector3.create(4 + i * (8 / N), 1, 8)
    })
    GltfContainer.create(gltfEntity, {
      src: `assets/wolf/wolf (${i + 1}).gltf`
    })
  }
}
