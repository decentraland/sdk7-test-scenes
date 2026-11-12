import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { engine, PointerLock } from '@dcl/sdk/ecs'
import { state } from '.'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(hud)
}

function hud() {
  return (
    <UiEntity
      uiTransform={{
        width: 320,
        height: 320,
        positionType: 'absolute',
        position: { right: '2%', top: '3%' },
        flexDirection: 'column',
        padding: 12
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
    >
      <Label value="Virtual Camera Mouse Look" fontSize={18} uiTransform={{ width: '100%', height: 24 }} />

      <Label
        value={`Camera: ${state.cameraActive ? 'ACTIVE' : 'off'}`}
        fontSize={16}
        color={state.cameraActive ? Color4.Green() : Color4.Red()}
        uiTransform={{ width: '100%', height: 22 }}
      />

      <Label
        value={`Pointer locked: ${state.isPointerLocked ? 'YES' : 'NO'}`}
        fontSize={16}
        color={state.isPointerLocked ? Color4.Green() : Color4.Red()}
        uiTransform={{ width: '100%', height: 22 }}
      />

      <Label
        value={`screenDelta: x=${state.screenDelta.x.toFixed(1)} y=${state.screenDelta.y.toFixed(1)}`}
        fontSize={14}
        uiTransform={{ width: '100%', height: 20 }}
      />

      <Label
        value={`yaw=${state.yaw.toFixed(1)}  pitch=${state.pitch.toFixed(1)}`}
        fontSize={14}
        uiTransform={{ width: '100%', height: 20 }}
      />

      <Button
        value={state.isPointerLocked ? 'Unlock pointer' : 'Lock pointer'}
        variant="primary"
        fontSize={14}
        uiTransform={{ width: '100%', height: 40, margin: { top: 8 } }}
        onMouseDown={() => {
          PointerLock.createOrReplace(engine.CameraEntity, { isPointerLocked: !state.isPointerLocked })
        }}
      />

      <Label
        value={
          'Click the green box to toggle the camera.\n' +
          'Lock the pointer to control it.\n' +
          'F / right-click exits.'
        }
        fontSize={13}
        uiTransform={{ width: '100%', height: 80, margin: { top: 8 } }}
      />
    </UiEntity>
  )
}
