// We define the empty imports so the auto-complete feature works as expected.
import { Vector3 } from '@dcl/sdk/math'
import { Billboard, engine, Entity, InputAction, InputModifier, inputSystem, MeshRenderer, PointerEventType, TextShape, Transform } from '@dcl/sdk/ecs'
import { setupUi } from './ui'

let mode = 0
let disableAll = false
let disableWalk = false
let disableJog = false
let disableRun = false
let disableJump = false
let disableEmote = false
let textShape:Entity

function modeName() {
  return `mode ${mode} | disableAll ${disableAll} | disableWalk ${disableWalk} | disableJog ${disableJog} | disableRun ${disableRun} | disableJump ${disableJump} | disableEmote ${disableEmote}`
}

interface Modes {
  disableAllVal?: boolean,
  disableWalkVal?: boolean,
  disableJogVal?: boolean,
  disableRunVal?: boolean,
  disableJumpVal?: boolean,
  disableEmoteVal?: boolean
}

function setModeValues({
  disableAllVal = false,
  disableWalkVal = false,
  disableJogVal = false,
  disableRunVal = false,
  disableJumpVal = false,
  disableEmoteVal = false
}: Modes = {}) {
  disableAll = disableAllVal
  disableWalk = disableWalkVal
  disableJog = disableJogVal
  disableRun = disableRunVal
  disableJump = disableJumpVal
  disableEmote = disableEmoteVal
}

function switchMode(goToNextMode = true) {
  switch (mode) {
    case 0:
      setModeValues({ disableAllVal: true })
      break
    case 1:
      setModeValues({ disableWalkVal: true })
      break
    case 2:
      setModeValues({ disableJogVal: true })
      break
    case 3:
      setModeValues({ disableRunVal: true })
      break
    case 4:
      setModeValues({ disableJumpVal: true })
      break
    case 5:
      setModeValues({ disableEmoteVal: true })
      break
    case 6:
      setModeValues({ disableJumpVal: true, disableJogVal: false, disableAllVal: true })
      break
    case 7:
      setModeValues({ disableJumpVal: true, disableJogVal: true, disableAllVal: false })
      break
    case 8:
      setModeValues()
      break
  }

  if (goToNextMode)
    mode++
  else
    mode--

  if (mode == 9)
    mode = 0
  else if (mode == -1)
    mode = 8
}

function switchInputModifier(goToNextMode: boolean) {
  switchMode(goToNextMode)

  let myEntity = engine.PlayerEntity

  InputModifier.createOrReplace(myEntity, {
    mode: {
      $case: "standard", standard:
      {
        disableAll: disableAll,
        disableWalk: disableWalk,
        disableRun: disableRun,
        disableJog: disableJog,
        disableJump: disableJump,
        disableEmote: disableEmote
      }
    }
  })

  TextShape.getMutable(textShape).text = modeName()
}

function createTextBillboard():Entity {
  const sign = engine.addEntity()

  Transform.create(sign, {
    position: Vector3.create(8, 3, 8),
  })

  TextShape.create(sign, {
    text: modeName(),
    textWrapping: true,
    fontSize: 4,
    height: 2,
    width: 10,
    outlineWidth: 0.1,
    outlineColor: { r: 0, g: 0, b: 1 },
  })

  Billboard.create(sign)
  return sign
}

function createCornerBoxes() {
  let box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(0, 1, 0) })
  MeshRenderer.setBox(box)

  box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(0, 1, 16) })
  MeshRenderer.setBox(box)

  box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(16, 1, 0) })
  MeshRenderer.setBox(box)

  box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(16, 1, 16) })
  MeshRenderer.setBox(box)
}

export function main() {
  createCornerBoxes()

  textShape = createTextBillboard()

  engine.addSystem(() => {
    if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) {
      switchInputModifier(false);
    }
    else if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) {
      switchInputModifier(true);
    }
  })

  setupUi()
}



// import { triggerSceneEmote } from '~system/RestrictedActions'

// const emoter = engine.addEntity()
// Transform.create(emoter, { position: Vector3.create(8, 0, 8) })
// MeshRenderer.setBox(emoter)
// MeshCollider.setBox(emoter)
// pointerEventsSystem.onPointerDown(
//   {
//     entity: emoter,
//     opts: { button: InputAction.IA_POINTER, hoverText: 'Make snowball' },
//   },
//   () => {
//     triggerSceneEmote({ src: 'animations/Snowball_Throw.glb', loop: false })
//   }
// )
