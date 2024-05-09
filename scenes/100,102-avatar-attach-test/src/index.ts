import { Color4, Quaternion, Vector3 } from '@dcl/ecs-math'
import { AvatarAnchorPointType, AvatarAttach, Entity, Material, MeshCollider, MeshRenderer, PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'

function createBlock(position: Vector3): Entity {
  const block = engine.addEntity()
  Transform.create(block, { position, scale: Vector3.create(3, 2, 3) })

  MeshCollider.setBox(block)
  MeshRenderer.setBox(block)
  Material.setPbrMaterial(block, { albedoColor: Color4.create(1.0, 0.0, 0.0, 0.2) , castShadows: false})

  const face = engine.addEntity()
  Transform.create(face, { position:Vector3.create(0, 0.501, 0), parent: block, rotation: Quaternion.fromEulerDegrees(90,0,0)})
  MeshRenderer.setPlane(face)
  Material.setPbrMaterial(face, { albedoColor: Color4.create(1.0, 1.0, 1.0, 0.8), castShadows: false})

  return block
}

const WithAttached = engine.defineComponent("WithAttached", {})

function createAttached(avatarId: string, anchorPointId: AvatarAnchorPointType, color: Color4, scale: number = 1.0): Entity {
  const parent = engine.addEntity()
  const entity = engine.addEntity()
  Transform.create(entity, { scale: Vector3.create(scale,scale,scale), rotation: Quaternion.fromEulerDegrees(90,0,0), parent})

  MeshRenderer.setPlane(entity)
  Material.setPbrMaterial(entity, { albedoColor: color , castShadows: false})
  
  AvatarAttach.create(parent, { avatarId, anchorPointId })

  return entity
}

function avatarAttachTest() {
  createBlock(Vector3.create(1.5, 0, 1.5))
  createBlock(Vector3.create(2 + 1.5, 1, 1.5))

  engine.addSystem(function() {

    for (const [entity, player] of engine.getEntitiesWith(PlayerIdentityData)) {
      if (WithAttached.has(entity)) continue
      
      createAttached(player.address,  AvatarAnchorPointType.AAPT_POSITION, Color4.Yellow())
      createAttached(player.address,  AvatarAnchorPointType.AAPT_NAME_TAG, Color4.Green())
      WithAttached.create(entity)

      const sphere = engine.addEntity()
      Transform.create(sphere, { scale: Vector3.create(.2,.2,.2), parent: entity})
      MeshRenderer.setSphere(sphere)
      Material.setPbrMaterial(sphere, { albedoColor: Color4.Blue() , castShadows: false})
    }
  })

}

export function main() {
  avatarAttachTest()
}
