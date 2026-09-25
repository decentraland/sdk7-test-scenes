// Probes for unity-explorer branch fix/sdk/ui-tofu-emojis:
//   1) UITK scene-UI text: a variation selector (U+FE0F / U+FE0E) after an emoji used to render
//      as a missing-glyph box; the fix adds zero-width atlas entries for both selectors and maps
//      U+2691 to the black-flag sprite.
//   2) Input.placeholderColor default changes to opaque grey (0.3, 0.3, 0.3, 1).
//   3) Input.textAlign default changes to middle-left (was middle-center).
// Codepoints are built with String.fromCodePoint so the invisible selectors survive editors.
import ReactEcs, { Input, Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

const PANEL_BG = Color4.create(0.08, 0.08, 0.11, 0.94)
const GREY_TEXT = Color4.create(0.75, 0.75, 0.78, 1)
const PANEL_WIDTH = 760

const FE0F = String.fromCodePoint(0xfe0f) // variation selector-16 (emoji presentation)
const FE0E = String.fromCodePoint(0xfe0e) // variation selector-15 (text presentation)
const ZWJ = String.fromCodePoint(0x200d)
const KEYCAP = String.fromCodePoint(0x20e3)

const HEART = String.fromCodePoint(0x2764) + FE0F
const WARNING = String.fromCodePoint(0x26a0) + FE0F
const SUN = String.fromCodePoint(0x2600) + FE0F
const AIRPLANE = String.fromCodePoint(0x2708) + FE0F
const GRINNING = String.fromCodePoint(0x1f600) + FE0F
const KEYCAP_1 = '1' + FE0F + KEYCAP
const KEYCAP_2 = '2' + FE0F + KEYCAP
const KEYCAP_HASH = '#' + FE0F + KEYCAP
const PRIDE_FLAG = String.fromCodePoint(0x1f3f3) + FE0F + ZWJ + String.fromCodePoint(0x1f308)
const BLACK_FLAG = String.fromCodePoint(0x2691)

// Known composition limitations: NOT part of this fix, must not be filed as bugs against it.
const FAMILY_ZWJ =
  String.fromCodePoint(0x1f468) + ZWJ + String.fromCodePoint(0x1f469) + ZWJ + String.fromCodePoint(0x1f467)
const SKIN_TONE = String.fromCodePoint(0x1f44d) + String.fromCodePoint(0x1f3fd)
const REGIONAL_FLAG = String.fromCodePoint(0x1f1fa) + String.fromCodePoint(0x1f1f8)

function heading(text: string) {
  return (
    <Label
      value={text}
      fontSize={22}
      color={Color4.White()}
      textAlign="middle-left"
      uiTransform={{ width: PANEL_WIDTH, height: 32 }}
    />
  )
}

function note(text: string) {
  return (
    <Label
      value={text}
      fontSize={20}
      color={GREY_TEXT}
      textAlign="middle-left"
      uiTransform={{ width: PANEL_WIDTH, height: 28 }}
    />
  )
}

function glyphRow(label: string, glyphs: string) {
  return (
    <UiEntity uiTransform={{ width: PANEL_WIDTH, height: 36, flexDirection: 'row', alignItems: 'center' }}>
      <Label
        value={label}
        fontSize={20}
        color={GREY_TEXT}
        textAlign="middle-left"
        uiTransform={{ width: 300, height: 36 }}
      />
      <Label
        value={glyphs}
        fontSize={28}
        color={Color4.White()}
        textAlign="middle-left"
        uiTransform={{ width: PANEL_WIDTH - 300, height: 36 }}
      />
    </UiEntity>
  )
}

function spacer(height: number) {
  return <UiEntity uiTransform={{ width: PANEL_WIDTH, height }} />
}

export function fixProbesPanel() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{ width: PANEL_WIDTH + 40, flexDirection: 'column', padding: 20 }}
        uiBackground={{ color: PANEL_BG }}
      >
        {heading('Fix probe: emoji tofu (fix/sdk/ui-tofu-emojis)')}
        {note('PASS = no missing-glyph box after any glyph below.')}
        {glyphRow('VS16 on non-emoji default', `${HEART} ${WARNING} ${SUN} ${AIRPLANE}`)}
        {glyphRow('repeated VS16 spacing', `${GRINNING}${GRINNING}${GRINNING} (must space like plain emoji)`)}
        {glyphRow('keycap sequences', `${KEYCAP_1} ${KEYCAP_2} ${KEYCAP_HASH} (digit + frame, no extra box)`)}
        {glyphRow('ZWJ sequence, box only', `${PRIDE_FLAG} (no box; full flag merge not required)`)}
        {glyphRow('U+2691 mapped to sprite', `${BLACK_FLAG} (must render as a flag)`)}
        {spacer(12)}
        {heading('Known limitation - NOT part of this fix, do not file bugs')}
        {glyphRow('ZWJ merging', `${FAMILY_ZWJ} (rendered as separate glyphs is expected)`)}
        {glyphRow('skin tone modifiers', `${SKIN_TONE} (modifier not composited is expected)`)}
        {glyphRow('regional indicator flags', `${REGIONAL_FLAG} (two letters instead of a flag is expected)`)}
        {spacer(12)}
        {heading('Fix probe: Input placeholder + textAlign defaults')}
        {note('PASS = placeholder text is opaque grey (0.3, 0.3, 0.3) on all three fields below.')}
        <UiEntity uiTransform={{ width: PANEL_WIDTH, height: 40, flexDirection: 'row', alignItems: 'center' }}>
          <Label
            value="default textAlign"
            fontSize={20}
            color={GREY_TEXT}
            textAlign="middle-left"
            uiTransform={{ width: 220, height: 40 }}
          />
          <Input
            placeholder="type here (starts left)"
            fontSize={20}
            uiTransform={{ width: PANEL_WIDTH - 220, height: 40 }}
          />
        </UiEntity>
        {note('PASS = no textAlign set -> caret/text start at the left edge (middle-left default).')}
        <UiEntity uiTransform={{ width: PANEL_WIDTH, height: 40, flexDirection: 'row', alignItems: 'center' }}>
          <Label
            value="middle-center"
            fontSize={20}
            color={GREY_TEXT}
            textAlign="middle-left"
            uiTransform={{ width: 220, height: 40 }}
          />
          <Input
            placeholder="centered placeholder"
            textAlign="middle-center"
            fontSize={20}
            uiTransform={{ width: PANEL_WIDTH - 220, height: 40 }}
          />
        </UiEntity>
        {note('PASS = explicit middle-center is honoured (text/placeholder centered).')}
        <UiEntity uiTransform={{ width: PANEL_WIDTH, height: 40, flexDirection: 'row', alignItems: 'center' }}>
          <Label
            value="top-right"
            fontSize={20}
            color={GREY_TEXT}
            textAlign="middle-left"
            uiTransform={{ width: 220, height: 40 }}
          />
          <Input
            placeholder="top-right placeholder"
            textAlign="top-right"
            fontSize={20}
            uiTransform={{ width: PANEL_WIDTH - 220, height: 40 }}
          />
        </UiEntity>
        {note('PASS = explicit top-right is honoured (text/placeholder top-right).')}
      </UiEntity>
    </UiEntity>
  )
}
