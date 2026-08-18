import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { engine, PointerLock } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import { state, toggleSpectate } from './spectate'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(() => [statusPanel(), controlsHud()])
}

// --- Top-right status panel ---

function statusPanel() {
  return (
    <UiEntity
      uiTransform={{
        width: 340,
        height: 330,
        positionType: 'absolute',
        position: { right: '2%', top: '3%' },
        flexDirection: 'column',
        padding: 12
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
    >
      <Label value="Spectate Mode" fontSize={18} uiTransform={{ width: '100%', height: 24 }} />

      <Label
        value={`Spectating: ${state.active ? 'ACTIVE' : 'off'}`}
        fontSize={16}
        color={state.active ? Color4.Green() : Color4.Red()}
        uiTransform={{ width: '100%', height: 22 }}
      />

      <Label
        value={`Pointer locked: ${state.isPointerLocked ? 'YES' : 'NO'}`}
        fontSize={14}
        color={state.isPointerLocked ? Color4.Green() : Color4.Red()}
        uiTransform={{ width: '100%', height: 20 }}
      />

      <Label
        value={`Players in scene: ${state.playerCount}`}
        fontSize={14}
        uiTransform={{ width: '100%', height: 20 }}
      />

      <Button
        value={state.active ? 'Exit spectate' : 'Enter spectate'}
        variant="primary"
        fontSize={14}
        uiTransform={{ width: '100%', height: 40, margin: { top: 8 } }}
        onMouseDown={() => toggleSpectate()}
      />

      <Button
        value="Lock pointer (mouse-look)"
        variant="secondary"
        fontSize={14}
        uiTransform={{ width: '100%', height: 40, margin: { top: 4 }, display: state.active ? 'flex' : 'none' }}
        onMouseDown={() => {
          PointerLock.createOrReplace(engine.CameraEntity, { isPointerLocked: true })
        }}
      />

      <Label
        value={
          'Click the green box or the button to toggle.\n' +
          'W/S pitch, A/D yaw; mouse rotates too\n' +
          'while the pointer is locked (Esc unlocks).\n' +
          'E/F zoom (following) or raise/lower (free).\n' +
          '1/2 cycle follow target.'
        }
        fontSize={13}
        textAlign="middle-left"
        uiTransform={{ width: '100%', height: 110, margin: { top: 8 } }}
      />
    </UiEntity>
  )
}

// --- Bottom controls HUD (visible while spectating) ---

const KEYCAP_BG = Color4.fromHexString('#333333EE')
const PANEL_BG = Color4.fromHexString('#88888855')

function keyCap(label: string, transparent: boolean = false) {
  return (
    <UiEntity
      uiTransform={{
        width: 32,
        height: 32,
        borderRadius: 6,
        margin: 2,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={{ color: transparent ? Color4.Clear() : KEYCAP_BG }}
      uiText={{ value: transparent ? '' : label, fontSize: 16, textAlign: 'middle-center', color: Color4.White() }}
    />
  )
}

function keyRow(...caps: ReactEcs.JSX.Element[]) {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 'auto',
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {caps}
    </UiEntity>
  )
}

function keyGroup(label: string, ...rows: ReactEcs.JSX.Element[]) {
  return (
    <UiEntity
      uiTransform={{
        width: '33%',
        height: 'auto',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end'
      }}
    >
      {rows}
      <UiEntity
        uiTransform={{ width: '100%', height: 24, flexShrink: 0 }}
        uiText={{ value: label, fontSize: 16, textAlign: 'middle-center', color: Color4.White() }}
      />
    </UiEntity>
  )
}

function controlsHud() {
  const targetName = state.followTargetId
    ? getPlayer({ userId: state.followTargetId.toLowerCase() })?.name ?? state.followTargetId
    : 'None'

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 'auto',
        positionType: 'absolute',
        position: { bottom: 8 },
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        display: state.active ? 'flex' : 'none'
      }}
    >
      <UiEntity
        uiTransform={{
          width: 440,
          height: 'auto',
          borderRadius: 8,
          flexDirection: 'column',
          alignItems: 'stretch',
          padding: { top: 6, bottom: 6, left: 4, right: 4 }
        }}
        uiBackground={{ color: PANEL_BG }}
      >
        <UiEntity
          uiTransform={{
            width: '100%',
            height: 'auto',
            flexShrink: 0,
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          {keyGroup(state.followTargetId ? 'Zoom' : 'Up / Down', keyRow(keyCap('E'), keyCap('F')))}
          {keyGroup(
            'Move Camera',
            keyRow(keyCap('', true), keyCap('W'), keyCap('', true)),
            keyRow(keyCap('A'), keyCap('S'), keyCap('D'))
          )}
          {keyGroup('Change target', keyRow(keyCap('1'), keyCap('2')))}
        </UiEntity>

        <UiEntity
          uiTransform={{ width: '100%', height: 3, flexShrink: 0, margin: { top: 6, bottom: 6 } }}
          uiBackground={{ color: PANEL_BG }}
        />

        <UiEntity
          uiTransform={{ width: '100%', height: 24, flexShrink: 0 }}
          uiText={{
            value: `Current Target:  ${targetName}`,
            fontSize: 16,
            textAlign: 'middle-center',
            color: Color4.White()
          }}
        />
      </UiEntity>
    </UiEntity>
  )
}
