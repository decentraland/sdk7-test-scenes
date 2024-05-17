// We define the empty imports so the auto-complete feature works as expected.
import { Color4 } from '@dcl/sdk/math'
import { AvatarAnchorPointType, AvatarAttach, Material, MeshRenderer, Transform, engine } from '@dcl/sdk/ecs'

function addBox(anchor: AvatarAnchorPointType, color: Color4) {
  const box = engine.addEntity()
  Transform.create(box,
    {
      position: { x: 0, y: 0, z: 0 },
      scale: { x: 0.15, y: 0.15, z: 0.15 },
    })

  MeshRenderer.setBox(box)
  AvatarAttach.create(box, {
    anchorPointId: anchor
  })

  Material.setBasicMaterial(box, {
    diffuseColor: color,
  })
}

addBox(AvatarAnchorPointType.AAPT_POSITION, Color4.create(1.0, 0.0, 0.0, 1))
addBox(AvatarAnchorPointType.AAPT_NAME_TAG, Color4.create(0.0, 1.0, 0.0, 1))
addBox(AvatarAnchorPointType.AAPT_HEAD, Color4.create(0.0, 0.0, 1.0, 1))
addBox(AvatarAnchorPointType.AAPT_NECK, Color4.create(1.0, 1.0, 0.0, 1))
addBox(AvatarAnchorPointType.AAPT_SPINE, Color4.create(1.0, 0.0, 1.0, 1))
addBox(AvatarAnchorPointType.AAPT_SPINE1, Color4.create(0.0, 1.0, 1.0, 1))
addBox(AvatarAnchorPointType.AAPT_SPINE2, Color4.create(0.5, 0.0, 0.0, 1))
addBox(AvatarAnchorPointType.AAPT_HIP, Color4.create(0.0, 0.5, 0.0, 1))
addBox(AvatarAnchorPointType.AAPT_LEFT_SHOULDER , Color4.create(0.0, 0.0, 0.5, 1))
addBox(AvatarAnchorPointType.AAPT_LEFT_ARM , Color4.create(0.5, 0.5, 0.0, 1))
addBox(AvatarAnchorPointType.AAPT_LEFT_FOREARM , Color4.create(0.5, 0.0, 0.5, 1))
addBox(AvatarAnchorPointType.AAPT_LEFT_HAND, Color4.create(0.0, 0.5, 0.5, 1))
addBox(AvatarAnchorPointType.AAPT_LEFT_HAND_INDEX , Color4.create(0.75, 0.25, 0.5, 1))
addBox(AvatarAnchorPointType.AAPT_RIGHT_SHOULDER , Color4.create(0.25, 0.75, 0.5, 1))
addBox(AvatarAnchorPointType.AAPT_RIGHT_ARM , Color4.create(0.5, 0.25, 0.75, 1))C
addBox(AvatarAnchorPointType.AAPT_RIGHT_FOREARM , Color4.create(0.25, 0.5, 0.75, 1))
addBox(AvatarAnchorPointType.AAPT_RIGHT_HAND, Color4.create(0.75, 0.5, 0.25, 1))
addBox(AvatarAnchorPointType.AAPT_RIGHT_HAND_INDEX , Color4.create(0.5, 0.75, 0.25, 1))
addBox(AvatarAnchorPointType.AAPT_LEFT_UP_LEG , Color4.create(0.25, 0.5, 0.25, 1))
addBox(AvatarAnchorPointType.AAPT_LEFT_LEG , Color4.create(0.5, 0.25, 0.25, 1))
addBox(AvatarAnchorPointType.AAPT_LEFT_FOOT , Color4.create(0.25, 0.25, 0.5, 1))
addBox(AvatarAnchorPointType.AAPT_LEFT_TOE_BASE , Color4.create(0.5, 0.25, 0.5, 1))
addBox(AvatarAnchorPointType.AAPT_RIGHT_UP_LEG , Color4.create(0.25, 0.5, 0.5, 1))
addBox(AvatarAnchorPointType.AAPT_RIGHT_LEG , Color4.create(0.75, 0.75, 0.0, 1))
addBox(AvatarAnchorPointType.AAPT_RIGHT_FOOT , Color4.create(0.75, 0.0, 0.75, 1))
addBox(AvatarAnchorPointType.AAPT_RIGHT_TOE_BASE, Color4.create(0.3, 0.3, 0.3, 1))