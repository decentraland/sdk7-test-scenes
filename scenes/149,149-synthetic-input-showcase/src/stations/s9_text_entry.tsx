import { InputAction, pointerEventsSystem } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity, Label, Button, Input } from '@dcl/sdk/react-ecs'
import * as C from '../constants'
import { createSign, createBox, setBoxColor, COLORS } from '../lib'
import { counters, slog, logEntity, onReset } from '../state'

/**
 * S9 -- writing into a `<Input />`.
 *
 * S8 already proves that `ui_set_text` reaches *an* input; this station is about the text
 * itself surviving the round trip. Five fields, each isolating one property of a write:
 *
 *  1. FREE     -- uncontrolled: the scene never sets `value`, so what you read back is purely
 *                 what the client kept. Exercises `onChange` and `onSubmit` separately.
 *  2. SEEDED   -- controlled (`value={...}`) and pre-filled. A write must REPLACE the seeded
 *                 text, not append to it, and the scene's own re-render must not echo the old
 *                 value back over the new one.
 *  3. SUBMIT   -- only `onSubmit` is wired. `ui_set_text` without `submit: true` must leave its
 *                 counter at 0; with `submit: true` it must fire.
 *  4. DISABLED -- `disabled: true`. The negative case: a write must not land and
 *                 `s9DisabledChanges` must stay 0.
 *  5. FORM     -- two fields plus a SUBMIT button. Proves values written by two SEPARATE
 *                 `ui_set_text` calls are both still there when a later `ui_click` reads them,
 *                 i.e. that a write is state, not a one-shot event.
 */

const SEED_TEXT = 'seeded-value'
const DISABLED_TEXT = 'read-only'

let panelOpen = false
let freeValue = ''
let seededValue = SEED_TEXT
let lastSubmitOnly = ''
let formCallsign = ''
let formCode = ''
let formVerdict = 'not submitted yet'

function setPanelOpen(v: boolean) {
  panelOpen = v
  counters.s9PanelOpen = v
  slog('S9-TEXT', `panel ${v ? 'opened' : 'closed'}`)
}

function clearFields() {
  freeValue = ''
  seededValue = SEED_TEXT
  lastSubmitOnly = ''
  formCallsign = ''
  formCode = ''
  formVerdict = 'not submitted yet'
}

export function setupS9TextEntry() {
  const sign = createSign(C.S9_SIGN, 'S9 -- UI TEXT ENTRY\n<Input /> + ui_set_text', COLORS.info)
  logEntity('S9 sign', sign)

  const toggleButton = createBox(C.S9_TOGGLE_BUTTON, Vector3.create(1.2, 1.2, 1.2), COLORS.info)
  logEntity('S9 world toggle button (opens/closes the text-entry panel)', toggleButton)
  pointerEventsSystem.onPointerDown(
    {
      entity: toggleButton,
      opts: { button: InputAction.IA_POINTER, hoverText: 'Open/close text-entry panel', maxDistance: 16 }
    },
    () => {
      setPanelOpen(!panelOpen)
      setBoxColor(toggleButton, panelOpen ? COLORS.active : COLORS.info)
    }
  )

  onReset(() => {
    setPanelOpen(false)
    setBoxColor(toggleButton, COLORS.info)
    clearFields()
  })

  slog(
    'S9-TEXT',
    'station ready -- open the panel, then ui_list stack:sdk for the five input crdtIds; ui_set_text writes them'
  )
}

/**
 * S9's panel. Rendered by `setupSceneUi()` (`ui_root.tsx`) alongside S8's -- anchored hard to
 * the left so it cannot overlap S8's centered panel (an overlap would make `ui_click`'s
 * occlusion pre-check report one station as a cover over the other).
 */
export function S9Panel() {
  if (!panelOpen) return null

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 40, left: 30 },
        width: 540,
        height: 800,
        flexDirection: 'column',
        padding: 16
      }}
      uiBackground={{ color: Color4.create(0.05, 0.08, 0.05, 0.92) }}
    >
      <Label value="S9 -- UI TEXT ENTRY" fontSize={24} color={Color4.Yellow()} uiTransform={{ height: 36 }} />

      {/* 1 -- uncontrolled field: change and submit counted separately */}
      <Label
        value={`1. FREE (uncontrolled) -- changes ${counters.s9ChangesFree} / submits ${counters.s9SubmitsFree}`}
        fontSize={15}
        color={Color4.White()}
        uiTransform={{ height: 22, margin: { top: 10 } }}
      />
      <Input
        placeholder="write anything here..."
        fontSize={16}
        uiTransform={{ width: '100%', height: 46 }}
        onChange={(v) => {
          freeValue = v
          counters.s9ChangesFree++
          slog('S9-TEXT', `FREE changed -> "${v}" (${v.length} chars, change #${counters.s9ChangesFree})`)
        }}
        onSubmit={(v) => {
          freeValue = v
          counters.s9SubmitsFree++
          slog('S9-TEXT', `FREE submitted -> "${v}" (submit #${counters.s9SubmitsFree})`)
        }}
      />
      <Label value={`read back: "${freeValue}"`} fontSize={15} color={Color4.Green()} uiTransform={{ height: 22 }} />

      {/* 2 -- controlled field seeded with text a write has to replace */}
      <Label
        value={`2. SEEDED (controlled value) -- changes ${counters.s9ChangesSeeded}`}
        fontSize={15}
        color={Color4.White()}
        uiTransform={{ height: 22, margin: { top: 10 } }}
      />
      <Input
        placeholder="(seeded)"
        value={seededValue}
        fontSize={16}
        uiTransform={{ width: '100%', height: 46 }}
        onChange={(v) => {
          seededValue = v
          counters.s9ChangesSeeded++
          slog('S9-TEXT', `SEEDED changed -> "${v}" (was "${SEED_TEXT}" at start, change #${counters.s9ChangesSeeded})`)
        }}
      />
      <Label
        value={seededValue === SEED_TEXT ? 'still the seed value' : `replaced: "${seededValue}"`}
        fontSize={15}
        color={seededValue === SEED_TEXT ? Color4.Gray() : Color4.Green()}
        uiTransform={{ height: 22 }}
      />

      {/* 3 -- submit-only field: proves `submit: true` is what fires onSubmit */}
      <Label
        value={`3. SUBMIT-ONLY (no onChange) -- submits ${counters.s9SubmitsSubmitOnly}`}
        fontSize={15}
        color={Color4.White()}
        uiTransform={{ height: 22, margin: { top: 10 } }}
      />
      <Input
        placeholder="needs submit:true to register"
        fontSize={16}
        uiTransform={{ width: '100%', height: 46 }}
        onSubmit={(v) => {
          lastSubmitOnly = v
          counters.s9SubmitsSubmitOnly++
          slog('S9-TEXT', `SUBMIT-ONLY submitted -> "${v}" (submit #${counters.s9SubmitsSubmitOnly})`)
        }}
      />
      <Label
        value={`last submitted: "${lastSubmitOnly}"`}
        fontSize={15}
        color={Color4.Green()}
        uiTransform={{ height: 22 }}
      />

      {/* 4 -- disabled field: the negative case */}
      <Label
        value={`4. DISABLED -- rejected writes must keep this at 0: ${counters.s9DisabledChanges}`}
        fontSize={15}
        color={counters.s9DisabledChanges === 0 ? Color4.White() : Color4.Red()}
        uiTransform={{ height: 22, margin: { top: 10 } }}
      />
      <Input
        placeholder="disabled"
        value={DISABLED_TEXT}
        disabled={true}
        fontSize={16}
        uiTransform={{ width: '100%', height: 46 }}
        onChange={(v) => {
          // Must never run. If it does, a disabled <Input /> accepted a synthetic write.
          counters.s9DisabledChanges++
          slog('S9-TEXT', `DISABLED FIELD ACCEPTED A WRITE -> "${v}" -- this is a defect, not an expected result`)
        }}
      />

      {/* 5 -- two-field form: proves two separate writes both persist until read */}
      <Label
        value={`5. FORM (two writes, then click SUBMIT) -- submits ${counters.s9FormSubmits} / accepted ${counters.s9FormAccepted}`}
        fontSize={15}
        color={Color4.White()}
        uiTransform={{ height: 22, margin: { top: 10 } }}
      />
      <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 46 }}>
        <Input
          placeholder="callsign"
          fontSize={16}
          uiTransform={{ width: '48%', height: 46, margin: { right: '4%' } }}
          onChange={(v) => {
            formCallsign = v
            slog('S9-TEXT', `FORM callsign -> "${v}"`)
          }}
        />
        <Input
          placeholder="code"
          fontSize={16}
          uiTransform={{ width: '48%', height: 46 }}
          onChange={(v) => {
            formCode = v
            slog('S9-TEXT', `FORM code -> "${v}"`)
          }}
        />
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 54, margin: { top: 8 } }}>
        <Button
          value="SUBMIT FORM"
          variant="primary"
          uiTransform={{ width: 200, height: 46, margin: { right: 12 } }}
          onMouseDown={() => {
            counters.s9FormSubmits++
            const ok = formCallsign.length > 0 && formCode.length > 0
            if (ok) counters.s9FormAccepted++
            formVerdict = ok
              ? `ACCEPTED callsign="${formCallsign}" code="${formCode}"`
              : `REJECTED callsign="${formCallsign}" code="${formCode}"`
            slog('S9-TEXT', `FORM submit #${counters.s9FormSubmits} -- ${formVerdict}`)
          }}
        />
        <Button
          value="CLEAR FIELDS"
          variant="secondary"
          uiTransform={{ width: 200, height: 46 }}
          onMouseDown={() => {
            clearFields()
            slog('S9-TEXT', 'fields cleared (counters are untouched -- use RESET ALL for those)')
          }}
        />
      </UiEntity>
      <Label
        value={formVerdict}
        fontSize={15}
        color={counters.s9FormAccepted > 0 ? Color4.Green() : Color4.Gray()}
        uiTransform={{ height: 22, margin: { top: 6 } }}
      />
    </UiEntity>
  )
}
