import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { CameraStep, getCameraStep, isCrowdSpawned, setCameraStep, toggleCrowd } from './index'

const EXPECTATIONS: Record<CameraStep, string> = {
  regular:
    'Regular camera. Visible: NPC 10 m, NPC 30 m, your "You: max 15 m" plate. ' +
    'Hidden: NPC 60 m, NPC 100 m (beyond 40 m default), "Tagged 25 m" (its max 15 m; walk closer than 15 m to see it).',
  topDown:
    'Top-down camera ~75 m away, no nametagMaxDistance. Every nametag is beyond 40 m (and the two 15 m ' +
    'tags beyond 15 m), so no nametag is visible.',
  topDownWithDistance:
    'Top-down camera with nametagMaxDistance = 200. Every nametag is visible, including the two tags ' +
    'with maxDistance 15: the camera field takes priority over AvatarNametag.maxDistance.'
}

const CROWD_EXPECTATION =
  'Crowd on: 120 NPCs + the row + you. Only the 100 avatars nearest to YOU keep a nametag: ' +
  'the far corner of the crowd loses its tags, and the set follows you as you walk.'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(() => (
    <UiEntity
      uiTransform={{
        width: 420,
        positionType: 'absolute',
        position: { top: 80, left: 20 },
        flexDirection: 'column',
        padding: 12
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.75) }}
    >
      <Label value="<b>Nametag max distance</b>" fontSize={18} uiTransform={{ height: 28 }} />
      <StepButton step="regular" text="1. Regular camera" />
      <StepButton step="topDown" text="2. Top-down camera, no nametagMaxDistance" />
      <StepButton step="topDownWithDistance" text="3. Top-down camera, nametagMaxDistance = 200" />
      <Button
        value={isCrowdSpawned() ? '4. Remove the 120 NPC crowd' : '4. Spawn 120 NPC crowd'}
        fontSize={14}
        uiTransform={{ width: '100%', height: 34, margin: { top: 6 } }}
        uiBackground={{ color: isCrowdSpawned() ? Color4.create(0.6, 0.3, 0, 1) : Color4.create(0.2, 0.2, 0.2, 1) }}
        onMouseDown={toggleCrowd}
      />
      <Label
        value={EXPECTATIONS[getCameraStep()] + (isCrowdSpawned() ? '\n\n' + CROWD_EXPECTATION : '')}
        fontSize={13}
        textAlign="top-left"
        textWrap="wrap"
        uiTransform={{ width: '100%', height: 150, margin: { top: 10 } }}
      />
    </UiEntity>
  ))
}

function StepButton(props: { step: CameraStep; text: string }) {
  const active = getCameraStep() === props.step
  return (
    <Button
      value={props.text}
      fontSize={14}
      uiTransform={{ width: '100%', height: 34, margin: { top: 6 } }}
      uiBackground={{ color: active ? Color4.create(0.1, 0.5, 0.2, 1) : Color4.create(0.2, 0.2, 0.2, 1) }}
      onMouseDown={() => setCameraStep(props.step)}
    />
  )
}
