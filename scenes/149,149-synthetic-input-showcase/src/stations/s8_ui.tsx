import { engine, InputAction, pointerEventsSystem } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button, Input, Dropdown } from '@dcl/sdk/react-ecs'
import * as C from '../constants'
import { createSign, createBox, setBoxColor, COLORS } from '../lib'
import { counters, slog, logEntity, resetAllStations, onReset } from '../state'

const DROPDOWN_OPTIONS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']
const ROW_COUNT = 20

let panelOpen = false
let modalOpen = false
let inputEcho = ''
let dragArmed = false

function setPanelOpen(v: boolean) {
  panelOpen = v
  counters.s8PanelOpen = v
  slog('S8-UI', `panel ${v ? 'opened' : 'closed'}`)
}

export function setupS8Ui() {
  const worldSign = createSign(
    Vector3.create(C.S8_TOGGLE_BUTTON.x, 3.4, C.S8_TOGGLE_BUTTON.z),
    'S8 -- SCENE UI\n(ReactEcsRenderer)',
    COLORS.info
  )
  logEntity('S8 sign', worldSign)

  const toggleButton = createBox(C.S8_TOGGLE_BUTTON, Vector3.create(1.2, 1.2, 1.2), COLORS.info)
  logEntity('S8 world toggle button (opens/closes the UI panel)', toggleButton)
  pointerEventsSystem.onPointerDown(
    { entity: toggleButton, opts: { button: InputAction.IA_POINTER, hoverText: 'Open/close UI panel', maxDistance: 16 } },
    () => {
      setPanelOpen(!panelOpen)
      setBoxColor(toggleButton, panelOpen ? COLORS.active : COLORS.info)
    }
  )

  const resetButton = createBox(C.RESET_BUTTON, Vector3.create(1.2, 1.2, 1.2), COLORS.blocked)
  logEntity('World RESET ALL STATIONS button', resetButton)
  pointerEventsSystem.onPointerDown(
    { entity: resetButton, opts: { button: InputAction.IA_POINTER, hoverText: 'RESET ALL STATIONS', maxDistance: 16 } },
    () => {
      resetAllStations()
      setBoxColor(toggleButton, COLORS.info)
    }
  )

  onReset(() => {
    setPanelOpen(false)
    modalOpen = false
    inputEcho = ''
    dragArmed = false
  })

  ReactEcsRenderer.setUiRenderer(MainUi, { virtualWidth: 1920, virtualHeight: 1080 })
  slog('S8-UI', 'station ready -- click the world button to open the panel; every element is listed via ui_list stack:sdk')
}

function MainUi() {
  if (!panelOpen) {
    return (
      <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
        <UiEntity
          uiTransform={{ width: 340, height: 60 }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
        >
          <Label
            value="S8 panel closed -- click the world toggle button to open it"
            fontSize={16}
            color={Color4.White()}
            uiTransform={{ width: '100%', height: '100%' }}
          />
        </UiEntity>
      </UiEntity>
    )
  }

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          width: 760,
          height: 820,
          flexDirection: 'column',
          padding: 16
        }}
        uiBackground={{ color: Color4.create(0.05, 0.05, 0.08, 0.92) }}
      >
        <Label value="S8 -- SCENE UI PANEL" fontSize={26} color={Color4.Yellow()} uiTransform={{ height: 40 }} />

        {/* Row of three counter buttons -- button 2 gets covered by the modal */}
        <UiEntity uiTransform={{ flexDirection: 'row', height: 70, margin: { top: 12 } }}>
          <Button
            value={`Button 1 (${counters.s8Button1})`}
            variant={counters.s8Button1 % 2 === 0 ? 'primary' : 'secondary'}
            uiTransform={{ width: 220, height: 60, margin: { right: 12 } }}
            onMouseDown={() => {
              counters.s8Button1++
              slog('S8-UI', `button 1 clicked -- count ${counters.s8Button1}`)
            }}
          />
          <Button
            value={`Button 2 (${counters.s8Button2}) [coverable]`}
            variant={counters.s8Button2 % 2 === 0 ? 'primary' : 'secondary'}
            uiTransform={{ width: 260, height: 60, margin: { right: 12 } }}
            onMouseDown={() => {
              counters.s8Button2++
              slog('S8-UI', `button 2 clicked -- count ${counters.s8Button2}`)
            }}
          />
          <Button
            value={modalOpen ? 'Close modal' : 'Open modal (covers btn 2)'}
            variant="secondary"
            uiTransform={{ width: 240, height: 60 }}
            onMouseDown={() => {
              modalOpen = !modalOpen
              slog('S8-UI', `modal overlay ${modalOpen ? 'opened (covers button 2)' : 'closed'}`)
            }}
          />
        </UiEntity>

        {/* Text input */}
        <Label value="Text input (onChange + onSubmit):" fontSize={16} color={Color4.White()} uiTransform={{ height: 24, margin: { top: 16 } }} />
        <Input
          placeholder="type here..."
          fontSize={16}
          uiTransform={{ width: 400, height: 50 }}
          onChange={(v) => {
            inputEcho = v
            counters.s8InputChanges++
            slog('S8-UI', `input changed -> "${v}" (change #${counters.s8InputChanges})`)
          }}
          onSubmit={(v) => {
            inputEcho = v
            counters.s8InputSubmits++
            slog('S8-UI', `input submitted -> "${v}" (submit #${counters.s8InputSubmits})`)
          }}
        />
        <Label value={`echo: "${inputEcho}"`} fontSize={16} color={Color4.Green()} uiTransform={{ height: 24 }} />

        {/* Dropdown */}
        <Label value="Dropdown:" fontSize={16} color={Color4.White()} uiTransform={{ height: 24, margin: { top: 12 } }} />
        <Dropdown
          options={DROPDOWN_OPTIONS}
          selectedIndex={counters.s8DropdownIndex >= 0 ? counters.s8DropdownIndex : undefined}
          fontSize={16}
          uiTransform={{ width: 300, height: 50 }}
          onChange={(index) => {
            counters.s8DropdownIndex = index
            slog('S8-UI', `dropdown selected index ${index} ("${DROPDOWN_OPTIONS[index]}")`)
          }}
        />

        {/* Scrollable list */}
        <Label value="Scrollable list (20 rows):" fontSize={16} color={Color4.White()} uiTransform={{ height: 24, margin: { top: 12 } }} />
        <UiEntity
          uiTransform={{ width: '100%', height: 180, overflow: 'scroll', flexDirection: 'column' }}
          uiBackground={{ color: Color4.create(0.15, 0.15, 0.2, 1) }}
        >
          {Array.from({ length: ROW_COUNT }, (_, i) => (
            <Label
              key={`row-${i}`}
              value={`ROW ${i + 1}`}
              fontSize={22}
              color={Color4.White()}
              uiTransform={{ height: 34 }}
            />
          ))}
        </UiEntity>

        {/* Drag surface */}
        <Label value="Drag surface (left mousedown -> right mouseup):" fontSize={16} color={Color4.White()} uiTransform={{ height: 24, margin: { top: 12 } }} />
        <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 80 }}>
          <UiEntity
            uiTransform={{ width: '50%', height: '100%', margin: { right: 4 } }}
            uiBackground={{ color: dragArmed ? Color4.create(1, 0.85, 0.2, 1) : Color4.create(0.3, 0.3, 0.5, 1) }}
            onMouseDown={() => {
              dragArmed = true
              slog('S8-UI', 'drag surface: LEFT down (armed)')
            }}
            onMouseUp={() => {
              dragArmed = false
            }}
          >
            <Label value="START" fontSize={18} color={Color4.White()} uiTransform={{ width: '100%', height: '100%' }} />
          </UiEntity>
          <UiEntity
            uiTransform={{ width: '50%', height: '100%', margin: { left: 4 } }}
            uiBackground={{ color: Color4.create(0.3, 0.5, 0.3, 1) }}
            onMouseUp={() => {
              if (dragArmed) {
                dragArmed = false
                counters.s8Drags++
                slog('S8-UI', `drag surface: RIGHT up while armed -- drag #${counters.s8Drags} completed`)
              }
            }}
          >
            <Label value="END" fontSize={18} color={Color4.White()} uiTransform={{ width: '100%', height: '100%' }} />
          </UiEntity>
        </UiEntity>

        <Button
          value="RESET ALL (UI)"
          variant="secondary"
          uiTransform={{ width: 220, height: 50, margin: { top: 16 } }}
          onMouseDown={() => resetAllStations()}
        />
      {modalOpen && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: 500,
            height: 130,
            pointerFilter: 'block',
            flexDirection: 'column',
            padding: 8
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.75) }}
          onMouseDown={() => {
            modalOpen = false
            slog('S8-UI', 'modal overlay closed (clicked the overlay itself)')
          }}
        >
          <Label value="MODAL OVERLAY -- covers Button 2 below" fontSize={18} color={Color4.Red()} uiTransform={{ height: 30 }} />
          <Label
            value="ui_click on Button 2 fails (blockedBy) unless force:true"
            fontSize={14}
            color={Color4.White()}
            uiTransform={{ height: 24 }}
          />
        </UiEntity>
      )}
      </UiEntity>

    </UiEntity>
  )
}
