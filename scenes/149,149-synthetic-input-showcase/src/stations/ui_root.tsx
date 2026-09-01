import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, Label } from '@dcl/sdk/react-ecs'
import * as C from '../constants'
import { counters, slog } from '../state'
import { S8Panel } from './s8_ui'
import { S9Panel } from './s9_text_entry'

/**
 * `ReactEcsRenderer.setUiRenderer` may only be called once per scene, so both UI stations hang
 * off this single root: S8's panel (centered) and S9's (left-anchored). They are laid out so
 * they never overlap -- an overlap would make `ui_click`'s occlusion pre-check report one
 * station's panel as a cover over the other's element.
 *
 * The status bar is always on screen so a screenshot always says which panels are open, and
 * `ui_list stack:sdk` always returns something even with both panels closed.
 */
export function setupSceneUi() {
  ReactEcsRenderer.setUiRenderer(RootUi, { virtualWidth: 1920, virtualHeight: 1080 })
  slog('UI', 'scene UI root mounted -- S8 panel (centered) + S9 panel (left) + status bar (bottom-left)')
}

function RootUi() {
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}>
      <StatusBar />
      <S8Panel />
      <S9Panel />
    </UiEntity>
  )
}

function StatusBar() {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 20, left: 30 },
        width: 620,
        height: 52,
        padding: 8
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
    >
      <Label
        value={
          `S8 panel: ${counters.s8PanelOpen ? 'OPEN' : `closed -- world button ${C.fmtWorld(C.S8_TOGGLE_BUTTON)}`}  |  ` +
          `S9 panel: ${counters.s9PanelOpen ? 'OPEN' : `closed -- world button ${C.fmtWorld(C.S9_TOGGLE_BUTTON)}`}`
        }
        fontSize={15}
        color={Color4.White()}
        uiTransform={{ width: '100%', height: '100%' }}
      />
    </UiEntity>
  )
}
