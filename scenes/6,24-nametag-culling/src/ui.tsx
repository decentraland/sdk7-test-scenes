import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { isCullingDisabled, isTopDownActive, toggleCullingDisabled, toggleTopDown } from './index'

const ON = Color4.create(0.1, 0.5, 0.2, 1)
const OFF = Color4.create(0.2, 0.2, 0.2, 1)

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
      <Label value="<b>Nametag culling</b>" fontSize={18} uiTransform={{ height: 28 }} />
      <Button
        value={isTopDownActive() ? '1. Top-down camera: ON' : '1. Top-down camera: OFF'}
        fontSize={14}
        uiTransform={{ width: '100%', height: 34, margin: { top: 6 } }}
        uiBackground={{ color: isTopDownActive() ? ON : OFF }}
        onMouseDown={toggleTopDown}
      />
      <Button
        value={
          isCullingDisabled()
            ? '2. AMT_DISABLE_NAMETAG_CULLING area: ON'
            : '2. AMT_DISABLE_NAMETAG_CULLING area: OFF'
        }
        fontSize={14}
        uiTransform={{ width: '100%', height: 34, margin: { top: 6 } }}
        uiBackground={{ color: isCullingDisabled() ? ON : OFF }}
        onMouseDown={toggleCullingDisabled}
      />
      <Label
        value={
          'Top-down + area OFF: no tag visible (all beyond 40 m).\n' +
          'Top-down + area ON: NPC 10/30/60/100 m and "Plate 30 m" visible, no fade. ' +
          '"Hide wins" never shows a tag (HIDE_NAMETAGS wins).\n' +
          'Toggle the area at runtime: tags appear and disappear.'
        }
        fontSize={13}
        textAlign="top-left"
        textWrap="wrap"
        uiTransform={{ width: '100%', height: 130, margin: { top: 10 } }}
      />
    </UiEntity>
  ))
}
