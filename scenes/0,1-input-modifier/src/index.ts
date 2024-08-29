// We define the empty imports so the auto-complete feature works as expected.
import { Vector3 } from '@dcl/sdk/math'
import { Billboard, engine, Entity, InputAction, InputModifier, MeshCollider, MeshRenderer, pointerEventsSystem, TextShape, Transform } from '@dcl/sdk/ecs'
import { setupUi } from './ui'
import { triggerSceneEmote } from '~system/RestrictedActions'

let disableAll = false
let disableWalk = false
let disableJog = false
let disableRun = false
let disableJump = false
let disableEmote = false
let textShape: Entity

function modeName() {
  return `disableAll ${disableAll} | disableWalk ${disableWalk} | disableJog ${disableJog} | disableRun ${disableRun} | disableJump ${disableJump} | disableEmote ${disableEmote}`
}

interface Modes {
  disableAllVal?: boolean,
  disableWalkVal?: boolean,
  disableJogVal?: boolean,
  disableRunVal?: boolean,
  disableJumpVal?: boolean,
  disableEmoteVal?: boolean
}


export function toggleModeValues({
  disableAllVal = undefined,
  disableWalkVal = undefined,
  disableJogVal = undefined,
  disableRunVal = undefined,
  disableJumpVal = undefined,
  disableEmoteVal = undefined
}: Modes = {}) {
  disableAll = disableAllVal ?? disableAll
  disableWalk = disableWalkVal ?? disableWalk
  disableJog = disableJogVal ?? disableJog
  disableRun = disableRunVal ?? disableRun
  disableJump = disableJumpVal ?? disableJump
  disableEmote = disableEmoteVal ?? disableEmote

  updateInputModifier()
}

function updateInputModifier() {
  TextShape.getMutable(textShape).text = modeName()

  InputModifier.createOrReplace(engine.PlayerEntity, {
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
}

function createTextBillboard(): Entity {
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

function createSceneLimits() {
  let box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(0, 0, 8), scale: Vector3.create(.1, .1, 16) })
  MeshRenderer.setBox(box)

  box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(16, 0, 8), scale: Vector3.create(.1, .1, 16) })
  MeshRenderer.setBox(box)

  box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(8, 0, 16), scale: Vector3.create(16, .1, .1) })
  MeshRenderer.setBox(box)

  box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(8, 0, 0), scale: Vector3.create(16, .1, .1) })
  MeshRenderer.setBox(box)
}

export function main() {
  createSceneLimits()

  textShape = createTextBillboard()

  createEmoteTrigger()

  setupUi()
}

function createEmoteTrigger() {
  const emoter = engine.addEntity()
  Transform.create(emoter, { position: Vector3.create(8, 0, 8) })
  MeshRenderer.setBox(emoter)
  MeshCollider.setBox(emoter)

  pointerEventsSystem.onPointerDown(
      {
        entity: emoter,
        opts: { button: InputAction.IA_POINTER, hoverText: 'Make snowball' },
      },
      () => {
        triggerSceneEmote({ src: 'animations/Snowball_Throw.glb', loop: false })
      }
    )
}

