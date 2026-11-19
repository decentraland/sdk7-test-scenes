import { engine, InputAction, inputSystem, PointerEventType, Transform } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { SPAWN } from './layout'

// Key 1 shows or hides the readout, key 2 resets peak speed and distance. The readout samples the player every
// SAMPLE_SECONDS, so the UI changes at most 10 times a second however fast the explorer renders.
const TOGGLE = InputAction.IA_ACTION_3
const RESET = InputAction.IA_ACTION_4
const SAMPLE_SECONDS = 0.1

const state = {
  visible: true,
  x: 0,
  y: 0,
  z: 0,
  yawDeg: 0,
  speed: 0,
  peak: 0,
  distance: 0
}

let elapsed = 0
let lastX: number | undefined
let lastZ: number | undefined

function yawOf(q: { x: number; y: number; z: number; w: number }): number {
  // Heading of the rotated +z axis: 0 = north, 90 = east.
  const fx = 2 * (q.x * q.z + q.w * q.y)
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y)
  const deg = (Math.atan2(fx, fz) * 180) / Math.PI
  return deg < 0 ? deg + 360 : deg
}

function hudSystem(dt: number) {
  if (inputSystem.isTriggered(TOGGLE, PointerEventType.PET_DOWN)) state.visible = !state.visible
  if (inputSystem.isTriggered(RESET, PointerEventType.PET_DOWN)) {
    state.peak = 0
    state.distance = 0
  }
  if (!state.visible) {
    lastX = undefined
    return
  }

  elapsed += dt
  if (elapsed < SAMPLE_SECONDS) return

  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!player) return
  const { position, rotation } = player

  if (lastX !== undefined && lastZ !== undefined) {
    const step = Math.hypot(position.x - lastX, position.z - lastZ)
    state.speed = step / elapsed
    state.peak = Math.max(state.peak, state.speed)
    state.distance += step
  }
  lastX = position.x
  lastZ = position.z
  elapsed = 0

  state.x = position.x
  state.y = position.y
  state.z = position.z
  state.yawDeg = yawOf(rotation)
}

const f = (n: number, digits = 2) => n.toFixed(digits)

function Row(props: { text: string; color?: Color4 }) {
  return (
    <Label
      value={props.text}
      fontSize={14}
      color={props.color ?? Color4.White()}
      textAlign="middle-left"
      uiTransform={{ height: 20, width: '100%' }}
    />
  )
}

function Hud() {
  if (!state.visible) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { right: 16, top: 200 },
        width: 250,
        flexDirection: 'column',
        padding: 8
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
    >
      <Row text={`scene x ${f(state.x)}  z ${f(state.z)}  y ${f(state.y)}`} />
      <Row text={`from spawn E ${f(state.x - SPAWN.x)}  N ${f(state.z - SPAWN.z)}`} />
      <Row text={`speed ${f(state.speed)} m/s  peak ${f(state.peak)}`} color={Color4.Yellow()} />
      <Row text={`heading ${f(state.yawDeg, 0)} deg  walked ${f(state.distance, 1)} m`} />
      <Row text="[1] hide  [2] reset peak/distance" color={Color4.Gray()} />
    </UiEntity>
  )
}

export function createHud() {
  engine.addSystem(hudSystem)
  ReactEcsRenderer.setUiRenderer(Hud)
}
