import {
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  TextAlignMode,
  TextShape,
  Transform,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { isMobile } from '@dcl/sdk/platform'
import { feedback } from './playtest-feedback'

// Static mode: three ways to let the player choose to give feedback. Each calls
// feedback.leaveFeedback(batch, trigger): the Intro, then this batch as one Group.
// The trigger tells the three apart in the CSV.

// The batch prepared for it: Questions that make sense out of context, at any time.
const LEAVE_FEEDBACK_BATCH = ['worthIt', 'playMore', 'coinSpotting'] as const

// --- 2D: a button, top-right ---------------------------------------------------------
// In the panel's primary button style. Its own renderer, kept inside the area the
// explorer's HUD leaves free ('interactable'), at the 1920x1080 scale the panel uses.
// 16 from the top, as the scene's round counter (game.tsx).
function LeaveFeedbackButton() {
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 16, right: 16 },
          height: 46,
          padding: { left: 29, right: 29 },
          borderRadius: 12,
          justifyContent: 'center',
          alignItems: 'center'
        }}
        uiBackground={{ color: Color4.fromHexString('#e84c59ff') }}
        onMouseDown={() => void feedback.leaveFeedback(LEAVE_FEEDBACK_BATCH, 'ui-button')}
      >
        <Label value="<b>LEAVE FEEDBACK</b>" fontSize={14} color={Color4.fromHexString('#fcfcfcff')} />
      </UiEntity>
    </UiEntity>
  )
}

export function setupLeaveFeedback(): void {
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), LeaveFeedbackButton, {
    screenInset: 'interactable',
    virtualWidth: isMobile() ? 1600 : 1920,
    virtualHeight: isMobile() ? 720 : 1080
  })
  setupKiosk()
  setupArea()
}

// --- 3D: a clickable kiosk ------------------------------------------------------------
function setupKiosk(): void {
  const kiosk = engine.addEntity()
  Transform.create(kiosk, { position: Vector3.create(2, 0.75, 14.5), scale: Vector3.create(1, 1.5, 0.5) })
  MeshRenderer.setBox(kiosk)
  MeshCollider.setBox(kiosk)
  Material.setPbrMaterial(kiosk, { albedoColor: Color4.fromHexString('#3a6df0ff') })
  pointerEventsSystem.onPointerDown(
    { entity: kiosk, opts: { button: InputAction.IA_POINTER, hoverText: 'Leave feedback' } },
    () => void feedback.leaveFeedback(LEAVE_FEEDBACK_BATCH, 'kiosk')
  )
  label('CLICK TO\nLEAVE FEEDBACK', Vector3.create(2, 2, 14.5))
}

// --- An area: walking into it asks ---------------------------------------------------
const AREA_CENTER = Vector3.create(14, 0, 14.5)
const AREA_RADIUS = 1.2
let wasInside = false

function setupArea(): void {
  const pad = engine.addEntity()
  Transform.create(pad, {
    position: Vector3.create(AREA_CENTER.x, 0.06, AREA_CENTER.z),
    scale: Vector3.create(AREA_RADIUS * 2, 0.02, AREA_RADIUS * 2)
  })
  MeshRenderer.setCylinder(pad)
  Material.setPbrMaterial(pad, { albedoColor: Color4.fromHexString('#3ad08aff'), emissiveColor: Color4.fromHexString('#1a6a45ff') })
  label('STEP HERE TO\nLEAVE FEEDBACK', Vector3.create(AREA_CENTER.x, 1.2, AREA_CENTER.z))

  // Asks on entering, not while standing inside: walk out and back in to ask again.
  engine.addSystem(() => {
    const player = Transform.getOrNull(engine.PlayerEntity)
    if (!player) return
    const dx = player.position.x - AREA_CENTER.x
    const dz = player.position.z - AREA_CENTER.z
    const inside = dx * dx + dz * dz < AREA_RADIUS * AREA_RADIUS
    if (inside && !wasInside) void feedback.leaveFeedback(LEAVE_FEEDBACK_BATCH, 'feedback-area')
    wasInside = inside
  })
}

function label(text: string, position: Vector3): void {
  const entity = engine.addEntity()
  // Same facing as the COIN HUNT sign in game.tsx.
  Transform.create(entity, { position })
  TextShape.create(entity, {
    text,
    fontSize: 2,
    textColor: Color4.White(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
}
