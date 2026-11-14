import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Input, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

// Built from codepoints so the invisible selectors survive editors.
const cp = (...codes: number[]) => String.fromCodePoint(...codes)
const VS16 = 0xfe0f
const VS15 = 0xfe0e
const ZWJ = 0x200d

const PANEL = Color4.create(0.08, 0.08, 0.11, 0.95)
const MUTED = Color4.create(0.7, 0.7, 0.75, 1)
const EXPECT = Color4.create(0.55, 0.9, 0.6, 1)

const W = 1100
const NAME_W = 220
const GLYPH_W = 400
const EXPECT_W = W - NAME_W - GLYPH_W

type Row = { name: string; glyphs: string; expect: string }

const FIXED: Row[] = [
  { name: 'Emoji + VS16', glyphs: cp(0x2764, VS16, 0x20, 0x26a0, VS16, 0x20, 0x2600, VS16, 0x20, 0x2708, VS16), expect: 'no box after any of them' },
  { name: 'Spacing', glyphs: '|' + cp(0x1f600, 0x1f600, 0x1f600) + '|', expect: 'reference width' },
  { name: 'Spacing + VS16', glyphs: '|' + cp(0x1f600, VS16, 0x1f600, VS16, 0x1f600, VS16) + '|', expect: 'same width as the row above' },
  { name: 'Text + VS15', glyphs: cp(0x2764, VS15, 0x20, 0x26a0, VS15), expect: 'no box' },
  { name: 'Keycaps', glyphs: cp(0x31, VS16, 0x20e3, 0x20, 0x32, VS16, 0x20e3, 0x20, 0x23, VS16, 0x20e3), expect: 'digit + frame, no extra box' },
  { name: 'Pride flag', glyphs: cp(0x1f3f3, VS16, ZWJ, 0x1f308), expect: 'no box between flag and rainbow' },
  { name: 'U+2691', glyphs: cp(0x2691), expect: 'a flag, not a box' }
]

const LIMITATIONS: Row[] = [
  { name: 'ZWJ family', glyphs: cp(0x1f468, ZWJ, 0x1f469, ZWJ, 0x1f467), expect: 'separate faces' },
  { name: 'Skin tone', glyphs: cp(0x1f44d, 0x1f3fd), expect: 'thumb + swatch' },
  { name: 'Flag letters', glyphs: cp(0x1f1fa, 0x1f1f8), expect: 'U S tiles' }
]

const heading = (text: string, note: string) => (
  <UiEntity uiTransform={{ width: W, flexDirection: 'column', margin: { top: 8, bottom: 4 } }}>
    <Label value={text} fontSize={24} color={Color4.White()} textAlign="middle-left" uiTransform={{ width: W, height: 30 }} />
    <Label value={note} fontSize={18} color={MUTED} textAlign="middle-left" uiTransform={{ width: W, height: 22 }} />
  </UiEntity>
)

const row = (r: Row) => (
  <UiEntity key={r.name} uiTransform={{ width: W, height: 42, flexDirection: 'row', alignItems: 'center' }}>
    <Label value={r.name} fontSize={20} color={MUTED} textAlign="middle-left" uiTransform={{ width: NAME_W, height: 40 }} />
    <Label value={r.glyphs} fontSize={30} color={Color4.White()} textAlign="middle-left" textWrap="nowrap" uiTransform={{ width: GLYPH_W, height: 40 }} />
    <Label value={r.expect} fontSize={18} color={EXPECT} textAlign="middle-left" uiTransform={{ width: EXPECT_W, height: 40 }} />
  </UiEntity>
)

const input = (placeholder: string, expect: string, textAlign?: 'middle-center' | 'top-right') => (
  <UiEntity key={placeholder} uiTransform={{ width: W, height: 56, flexDirection: 'row', alignItems: 'center' }}>
    <Label value={textAlign ?? 'unset'} fontSize={20} color={MUTED} textAlign="middle-left" uiTransform={{ width: NAME_W, height: 48 }} />
    <Input
      placeholder={placeholder}
      textAlign={textAlign}
      fontSize={22}
      uiTransform={{ width: GLYPH_W, height: 48 }}
    />
    <Label value={expect} fontSize={18} color={EXPECT} textAlign="middle-left" uiTransform={{ width: EXPECT_W, height: 56, margin: { left: 16 } }} />
  </UiEntity>
)

const uiComponent = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
    <UiEntity uiTransform={{ width: W + 48, flexDirection: 'column', padding: 20 }} uiBackground={{ color: PANEL }}>
      {heading('Emoji', 'Check on a player build, not the Editor. Green column = expected.')}
      {FIXED.map(row)}
      {heading('Known limitation', 'Clusters do not compose yet. Expected as shown, do not file.')}
      {LIMITATIONS.map(row)}
      {heading('UiInput', 'Placeholders opaque grey. Click and type in each.')}
      {input('type here', 'caret and text start at the left')}
      {input('centered', 'text stays centered', 'middle-center')}
      {input('top right', 'text at the top-right', 'top-right')}
    </UiEntity>
  </UiEntity>
)

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}
