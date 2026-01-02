// We define the empty imports so the auto-complete feature works as expected.
import { Vector3 } from '@dcl/sdk/math'
import {
  Billboard,
  EasingFunction,
  engine,
  Entity,
  InputAction,
  InputModifier,
  inputSystem,
  MeshCollider,
  MeshRenderer,
  pointerEventsSystem,
  PointerEventType,
  TextShape,
  Transform,
  Tween,
  TweenLoop,
  TweenSequence
} from '@dcl/sdk/ecs'
import { setupUi } from './ui'
import { triggerEmote } from '~system/RestrictedActions'

let disableAll = false
let disableWalk = false
let disableJog = false
let disableRun = false
let disableJump = false
let disableEmote = false
let textShape: Entity

function modeName() {
  let billBoardText = ''
  switch (keyPressed) {
    case InputAction.IA_FORWARD:
      billBoardText = 'W'
      break
    case InputAction.IA_BACKWARD:
      billBoardText = 'S'
      break
    case InputAction.IA_LEFT:
      billBoardText = 'A'
      break
    case InputAction.IA_RIGHT:
      billBoardText = 'D'
      break
    case InputAction.IA_JUMP:
      billBoardText = 'Space'
      break
    default:
      billBoardText = 'No key'
      break
  }

  return billBoardText + ' pressed!'
}

interface Modes {
  disableAllVal?: boolean
  disableWalkVal?: boolean
  disableJogVal?: boolean
  disableRunVal?: boolean
  disableJumpVal?: boolean
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

export function removeComponent() {
  InputModifier.deleteFrom(engine.PlayerEntity)

  disableAll = false
  disableWalk = false
  disableJog = false
  disableRun = false
  disableJump = false
  disableEmote = false
}

function updateInputModifier() {
  TextShape.getMutable(textShape).text = modeName()

  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: {
      $case: 'standard',
      standard: {
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
    position: Vector3.create(8, 1.5, 8)
  })

  TextShape.create(sign, {
    text: modeName(),
    textWrapping: true,
    fontSize: 4,
    height: 2,
    width: 10,
    outlineWidth: 0.1,
    outlineColor: { r: 0, g: 0, b: 1 }
  })

  Billboard.create(sign)
  return sign
}

function createSceneLimits() {
  let box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(0, 0, 8), scale: Vector3.create(0.1, 0.1, 16) })
  MeshRenderer.setBox(box)

  box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(16, 0, 8), scale: Vector3.create(0.1, 0.1, 16) })
  MeshRenderer.setBox(box)

  box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(8, 0, 16), scale: Vector3.create(16, 0.1, 0.1) })
  MeshRenderer.setBox(box)

  box = engine.addEntity()
  Transform.create(box, { position: Vector3.create(8, 0, 0), scale: Vector3.create(16, 0.1, 0.1) })
  MeshRenderer.setBox(box)
}

function createEmoteTrigger() {
  const emoter1 = engine.addEntity()
  Transform.create(emoter1, { position: Vector3.create(8, 0, 8) })
  MeshRenderer.setBox(emoter1)
  MeshCollider.setBox(emoter1)

  pointerEventsSystem.onPointerDown(
    {
      entity: emoter1,
      opts: { button: InputAction.IA_POINTER, hoverText: 'Dance!' }
    },
    () => {
      triggerEmote({ predefinedEmote: 'robot' })
    }
  )
}

let keyPressed: InputAction | null

export function main() {
  createSceneLimits()

  textShape = createTextBillboard()

  createEmoteTrigger()

  setupUi()

  engine.addSystem(() => {
    TextShape.getMutable(textShape).text = modeName()
    const cmd = inputSystem.getInputCommand(InputAction.IA_ANY, PointerEventType.PET_DOWN)
    if (cmd) {
      keyPressed = cmd.button
    }
  })

  const platform = engine.addEntity()
  Transform.create(platform, {
    position: Vector3.create(4, 1, 4)
  })
  MeshRenderer.setBox(platform)
  MeshCollider.setBox(platform)

  Tween.create(platform, {
    mode: Tween.Mode.Move({
      start: Vector3.create(1, 0, 1),
      end: Vector3.create(1, 0, 15)
    }),
    duration: 5000,
    easingFunction: EasingFunction.EF_LINEAR
  })
  TweenSequence.create(platform, { sequence: [], loop: TweenLoop.TL_YOYO })
}
