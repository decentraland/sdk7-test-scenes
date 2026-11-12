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

function createAttached(avatarId: string, anchorPointId: AvatarAnchorPointType, color: Color4, rotation: Quaternion, visible: boolean = true): Entity {
  const parent = engine.addEntity()
  const entity = engine.addEntity()
  Transform.create(entity, { rotation, parent })

  if (visible) {
    MeshRenderer.setPlane(entity)
    Material.setPbrMaterial(entity, { albedoColor: color , castShadows: false})
  }
  
  Transform.create(parent, { position: Vector3.create(8, 4, 8) })
  AvatarAttach.create(parent, { avatarId, anchorPointId })

  return parent
}

function createHandAttachedWithFollowingEntity(playerAddress: string) {
  // 1. Attach an entity to the Avatar  
  const attachedEntity = createAttached(playerAddress,  AvatarAnchorPointType.AAPT_LEFT_HAND, Color4.Purple(), Quaternion.Identity(), false)
  
  // 2. Create a "follower entity" that uses the attached entity Transform information to
  // check that it's being updated correctly, relative to the player transform
  const followerEntity = engine.addEntity()
  MeshRenderer.setBox(followerEntity)
  engine.addSystem(() => {
    const attachedEntTransform = Transform.get(attachedEntity)
    const playerTransform = Transform.get(engine.PlayerEntity)
    const desiredPos = Vector3.add(playerTransform.position, attachedEntTransform.position)
    const desiredRot = Quaternion.add(playerTransform.rotation, attachedEntTransform.rotation)
    Transform.createOrReplace(followerEntity, { position: desiredPos, rotation: desiredRot, scale: Vector3.create(0.15, 0.15, 0.15) })
  })
}

function avatarAttachTest() {
  createBlock(Vector3.create(1.5, 0, 1.5))
  createBlock(Vector3.create(2 + 1.5, 1, 1.5))

  engine.addSystem(function() {
    for (const [entity, player] of engine.getEntitiesWith(PlayerIdentityData)) {
      if (WithAttached.has(entity)) continue
      WithAttached.create(entity)
      
      createAttached(player.address,  AvatarAnchorPointType.AAPT_POSITION, Color4.Yellow(), Quaternion.fromEulerDegrees(90,0,0))
      createAttached(player.address,  AvatarAnchorPointType.AAPT_NAME_TAG, Color4.Green(), Quaternion.fromEulerDegrees(90,0,0))
      createHandAttachedWithFollowingEntity(player.address)

      const sphere = engine.addEntity()
      Transform.create(sphere, { scale: Vector3.create(.2,.2,.2), parent: entity})
      MeshRenderer.setSphere(sphere)
      Material.setPbrMaterial(sphere, { albedoColor: Color4.Blue() , castShadows: false})
    }
  })

  /*const waitTime = 5
  let timer = waitTime
  engine.addSystem((dt) => {
    timer -= dt 
    if (timer <= 0) {
      timer = waitTime
      for (const [entity, avatarAttach, transform] of engine.getEntitiesWith(AvatarAttach, Transform)) {
        console.log(`Entity: ${entity}; Position: [${transform.position.x}, ${transform.position.y}, ${transform.position.z}]`)
      }
    }
  })*/
}

export function main() {
  avatarAttachTest()
}
