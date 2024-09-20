import { Animator, Billboard, engine, GltfContainer, InputAction, MeshCollider, MeshRenderer, PBTextShape, pointerEventsSystem, TextShape, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// export all the functions required to make the scene work
export * from '@dcl/sdk'

let avatar = engine.addEntity()

GltfContainer.create(avatar, { src: 'models/DG_RUN_1.glb' })

Transform.create(avatar, {
  position: Vector3.create(5, 0, 5),
  scale: Vector3.create(1, 1, 1)
})

// introAnim01
// mainAnim02
// midAnim01
// midAnim03
// walkCycle01
Animator.create(avatar, {
  states: [
    {
      clip: 'walkCycle01',
      playing: true,
      loop: true,
      weight: 0.5,
    },
    {
      clip: 'midAnim01',
      playing: true,
      loop: true,
      weight: 0.5,
    }
  ]
})

let walkCycle01Weight:number = 0.5
let midAnim01Weight:number = 0.5

let buttonXpos = 2
let buttonYpos = 2

let walkMutableText = createBillboard("walkCycle01", walkCycle01Weight)
let midMutableText = createBillboard("walkCycle01", midAnim01Weight)


createButton(Vector3.create(buttonXpos, 0, buttonYpos+2), "walkCycle01", 0.25,walkMutableText)
createButton(Vector3.create(buttonXpos, 0, buttonYpos+3), "walkCycle01", 0.5,walkMutableText)
createButton(Vector3.create(buttonXpos, 0, buttonYpos+4), "walkCycle01", 0.75,walkMutableText)
createButton(Vector3.create(buttonXpos, 0, buttonYpos+5), "walkCycle01", 1,walkMutableText)
createButton(Vector3.create(buttonXpos, 0, buttonYpos+6), "midAnim01", 0,midMutableText)
createButton(Vector3.create(buttonXpos, 0, buttonYpos+7), "midAnim01", 0.25,midMutableText)
createButton(Vector3.create(buttonXpos, 0, buttonYpos+8), "midAnim01", 0.5,midMutableText)
createButton(Vector3.create(buttonXpos, 0, buttonYpos+9), "midAnim01", 0.75,midMutableText)
createButton(Vector3.create(buttonXpos, 0, buttonYpos+10), "midAnim01", 1,midMutableText)

function createButton(buttonPos:Vector3, animName:string, weight:number, animMutableText:PBTextShape) {
  let buttonEntity = engine.addEntity()
  Transform.create(buttonEntity, {
    position: buttonPos,
    scale: Vector3.create(.5, 1, .5)
  })

  MeshRenderer.setBox(buttonEntity)
  MeshCollider.setBox(buttonEntity)

  pointerEventsSystem.onPointerDown(
    {
      entity: buttonEntity,
      opts: { button: InputAction.IA_PRIMARY, hoverText: `Set ${animName} weight ${weight}` },
    },
    function () {
      const swimAnim = Animator.getClip(avatar, animName)
      swimAnim.weight = weight
      animMutableText.text = `${animName} weight ${weight}`
    }
  )
}

function createBillboard(animName:String, initialWeight:number) {
  let animTextEntity = engine.addEntity()
  Transform.create(animTextEntity, {
    position: Vector3.create(10, 2, 5)
  })
  TextShape.create(animTextEntity, {
    text: `${animName} weight ${initialWeight}`,
    fontSize: 2,
    textWrapping: true
  })
  Billboard.create(animTextEntity)
  return TextShape.getMutable(animTextEntity)
}