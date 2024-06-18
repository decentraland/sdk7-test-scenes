// We define the empty imports so the auto-complete feature works as expected.
import { Color4 } from '@dcl/sdk/math'
import { AvatarAnchorPointType, AvatarAttach, ColliderLayer, Entity, GltfContainer, InputAction, Material, MeshRenderer, TextShape, Transform, engine, pointerEventsSystem } from '@dcl/sdk/ecs'

function createConsole():Entity {
  const consoleStool = engine.addEntity()
  Transform.create(consoleStool,
    {
      position: { x: 8, y: 0, z: 8 },
    })

  GltfContainer.create(consoleStool, {
    src: "assets/CommandControl_01.glb"
  })


  pointerEventsSystem.onPointerDown(
    {
    entity: consoleStool,
    opts: {
        button: InputAction.IA_POINTER,
        hoverText: 'Click'
      }
    },
    function(){
      cycleAttachPoints();
    }
      )


const consoleText = engine.addEntity()
Transform.create(consoleText,
  {
    position: { x: 0, y: 3, z: 0 },
    rotation: {x: 0, y: 180, z: 0, w: 0},
    parent: consoleStool
  })

TextShape.create(consoleText,{
  text: "Click me"
})
return consoleText
}


function createParrot() : Entity{
  const parrot = engine.addEntity()
  Transform.create(parrot,
    {
      position: { x: 0, y: 1, z: 0 },
      scale: { x: 0.3, y: 0.3, z: 0.3 },
    })
  GltfContainer.create(parrot, {
    src: "assets/Parrot.glb",
    invisibleMeshesCollisionMask : ColliderLayer.CL_NONE
  })
  return parrot;
}

let attachPoints = [
  AvatarAnchorPointType.AAPT_POSITION,
  AvatarAnchorPointType.AAPT_NAME_TAG,
  AvatarAnchorPointType.AAPT_HEAD,
  AvatarAnchorPointType.AAPT_NECK,
  AvatarAnchorPointType.AAPT_SPINE,
  AvatarAnchorPointType.AAPT_SPINE1,
  AvatarAnchorPointType.AAPT_SPINE2,
  AvatarAnchorPointType.AAPT_HIP,
  AvatarAnchorPointType.AAPT_LEFT_SHOULDER,
  AvatarAnchorPointType.AAPT_LEFT_ARM,
  AvatarAnchorPointType.AAPT_LEFT_FOREARM,
  AvatarAnchorPointType.AAPT_LEFT_HAND,
  AvatarAnchorPointType.AAPT_LEFT_HAND_INDEX,
  AvatarAnchorPointType.AAPT_RIGHT_SHOULDER,
  AvatarAnchorPointType.AAPT_RIGHT_ARM,
  AvatarAnchorPointType.AAPT_RIGHT_FOREARM,
  AvatarAnchorPointType.AAPT_RIGHT_HAND,
  AvatarAnchorPointType.AAPT_RIGHT_HAND_INDEX,
  AvatarAnchorPointType.AAPT_LEFT_UP_LEG,
  AvatarAnchorPointType.AAPT_LEFT_LEG,
  AvatarAnchorPointType.AAPT_LEFT_FOOT,
  AvatarAnchorPointType.AAPT_LEFT_TOE_BASE,
  AvatarAnchorPointType.AAPT_RIGHT_UP_LEG,
  AvatarAnchorPointType.AAPT_RIGHT_LEG,
  AvatarAnchorPointType.AAPT_RIGHT_FOOT,
  AvatarAnchorPointType.AAPT_RIGHT_TOE_BASE,
]

let attachPointsNames = [
  "POSITION",
  "NAME_TAG",
  "HEAD",
  "NECK",
  "SPINE",
  "SPINE1",
  "SPINE2",
  "HIP",
  "LEFT_SHOULDER",
  "LEFT_ARM",
  "LEFT_FOREARM",
  "LEFT_HAND",
  "LEFT_HAND_INDEX",
  "RIGHT_SHOULDER",
  "RIGHT_ARM",
  "RIGHT_FOREARM",
  "RIGHT_HAND",
  "RIGHT_HAND_INDEX",
  "LEFT_UP_LEG",
  "LEFT_LEG",
  "LEFT_FOOT",
  "LEFT_TOE_BASE",
  "RIGHT_UP_LEG",
  "RIGHT_LEG",
  "RIGHT_FOOT",
  "RIGHT_TOE_BASE",
]

let currentAttachPoint = 0;

function cycleAttachPoints():void{

  currentAttachPoint++
  if(currentAttachPoint > attachPoints.length -1)
    currentAttachPoint = 0

  const anchor = attachPoints[currentAttachPoint];

  AvatarAttach.createOrReplace(parrot, {
    anchorPointId: anchor
  })

  TextShape.getMutable(consoleText).text = attachPointsNames[currentAttachPoint];
}


let consoleText = createConsole()
let parrot = createParrot()

