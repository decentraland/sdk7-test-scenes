import { engine, Transform, TextShape, Billboard } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, Button, Label } from '@dcl/sdk/react-ecs'

// Repro of the scene font atlas cap (creator report: "Fresh launch with a page of 50 icons: 34 render
// and 16 are tofu. Every page after that is tofu"). The Explorer gives each scene font one 1024x1024
// atlas page per component type (TextShape/TMP and UI Toolkit); the converter's pre-fill already uses
// about 45% of it, so only ~34 new Solid icons fit. The fix allows up to 4 atlas pages per font.
// Pages 1-3 (150 icons) must render fully on the fixed client; the later pages are there to show
// the 4-page cap being reached (tofu is expected near the end, even with the fix).
const solid = 'assets/fonts/duck-font-awesome-solid.ttf'
const perPage = 50
const perLine = 10

// The first 400 distinct Solid glyphs in the Private Use Area, sorted by code point, excluding glyphs
// also mapped from ASCII/Latin-1 (those are pre-filled by the converter). Extracted with fontTools.
const codePoints = [
  0xE005, 0xE006, 0xE00D, 0xE012, 0xE03F, 0xE040, 0xE041, 0xE059, 0xE05A, 0xE05B,
  0xE05C, 0xE05D, 0xE05E, 0xE05F, 0xE060, 0xE061, 0xE062, 0xE063, 0xE064, 0xE065,
  0xE066, 0xE067, 0xE068, 0xE069, 0xE06A, 0xE06B, 0xE06C, 0xE06D, 0xE06E, 0xE06F,
  0xE070, 0xE071, 0xE072, 0xE073, 0xE074, 0xE075, 0xE076, 0xE085, 0xE086, 0xE097,
  0xE098, 0xE09A, 0xE0A9, 0xE0AC, 0xE0B4, 0xE0B7, 0xE0BB, 0xE0CF, 0xE0D8, 0xE0DF,
  0xE0E3, 0xE0E4, 0xE131, 0xE139, 0xE13A, 0xE13B, 0xE13C, 0xE140, 0xE152, 0xE163,
  0xE169, 0xE16D, 0xE17B, 0xE184, 0xE185, 0xE18F, 0xE19A, 0xE19B, 0xE1A8, 0xE1B0,
  0xE1BC, 0xE1C4, 0xE1C8, 0xE1D3, 0xE1D5, 0xE1D7, 0xE1ED, 0xE1F3, 0xE1F6, 0xE1FE,
  0xE209, 0xE221, 0xE222, 0xE22D, 0xE23D, 0xE289, 0xE29C, 0xE2B7, 0xE2BB, 0xE2C5,
  0xE2CA, 0xE2CD, 0xE2CE, 0xE2E6, 0xE2EB, 0xE31E, 0xE3AF, 0xE3B1, 0xE3B2, 0xE3F5,
  0xE43C, 0xE445, 0xE447, 0xE448, 0xE46C, 0xE473, 0xE476, 0xE477, 0xE47A, 0xE47B,
  0xE490, 0xE494, 0xE4A5, 0xE4A8, 0xE4A9, 0xE4AA, 0xE4AB, 0xE4AC, 0xE4AD, 0xE4AF,
  0xE4B0, 0xE4B3, 0xE4B5, 0xE4B6, 0xE4B7, 0xE4B8, 0xE4B9, 0xE4BA, 0xE4BB, 0xE4BC,
  0xE4BD, 0xE4BE, 0xE4BF, 0xE4C0, 0xE4C1, 0xE4C2, 0xE4C3, 0xE4C4, 0xE4C5, 0xE4C6,
  0xE4C7, 0xE4C8, 0xE4C9, 0xE4CA, 0xE4CB, 0xE4CC, 0xE4CE, 0xE4CF, 0xE4D0, 0xE4D1,
  0xE4D2, 0xE4D3, 0xE4D4, 0xE4D5, 0xE4D6, 0xE4D7, 0xE4D8, 0xE4D9, 0xE4DA, 0xE4DB,
  0xE4DC, 0xE4DD, 0xE4DE, 0xE4E0, 0xE4E1, 0xE4E2, 0xE4E3, 0xE4E4, 0xE4E5, 0xE4E6,
  0xE4E8, 0xE4E9, 0xE4EA, 0xE4EB, 0xE4ED, 0xE4EF, 0xE4F0, 0xE4F1, 0xE4F2, 0xE4F3,
  0xE4F4, 0xE4F5, 0xE4F6, 0xE4F7, 0xE4F8, 0xE4F9, 0xE4FA, 0xE4FB, 0xE4FC, 0xE4FD,
  0xE4FE, 0xE4FF, 0xE500, 0xE501, 0xE502, 0xE503, 0xE507, 0xE508, 0xE509, 0xE50A,
  0xE50B, 0xE50C, 0xE50D, 0xE50E, 0xE50F, 0xE510, 0xE511, 0xE512, 0xE513, 0xE514,
  0xE515, 0xE516, 0xE517, 0xE518, 0xE519, 0xE51A, 0xE51B, 0xE51C, 0xE51D, 0xE51E,
  0xE51F, 0xE520, 0xE521, 0xE522, 0xE523, 0xE524, 0xE525, 0xE527, 0xE528, 0xE529,
  0xE52A, 0xE52B, 0xE52C, 0xE52D, 0xE52E, 0xE52F, 0xE532, 0xE533, 0xE534, 0xE535,
  0xE536, 0xE537, 0xE538, 0xE539, 0xE53A, 0xE53B, 0xE53C, 0xE53D, 0xE53E, 0xE53F,
  0xE540, 0xE541, 0xE542, 0xE543, 0xE544, 0xE545, 0xE546, 0xE547, 0xE548, 0xE549,
  0xE54A, 0xE54B, 0xE54C, 0xE54D, 0xE54E, 0xE54F, 0xE551, 0xE552, 0xE553, 0xE554,
  0xE555, 0xE556, 0xE557, 0xE558, 0xE55A, 0xE55B, 0xE55C, 0xE55D, 0xE55E, 0xE55F,
  0xE560, 0xE561, 0xE562, 0xE563, 0xE564, 0xE565, 0xE566, 0xE567, 0xE568, 0xE569,
  0xE56A, 0xE56B, 0xE56C, 0xE56D, 0xE56E, 0xE56F, 0xE571, 0xE572, 0xE573, 0xE574,
  0xE576, 0xE577, 0xE578, 0xE579, 0xE57A, 0xE57B, 0xE57C, 0xE57D, 0xE57E, 0xE57F,
  0xE580, 0xE581, 0xE582, 0xE583, 0xE584, 0xE585, 0xE586, 0xE587, 0xE589, 0xE58A,
  0xE58B, 0xE58C, 0xE58D, 0xE58E, 0xE58F, 0xE591, 0xE592, 0xE593, 0xE594, 0xE595,
  0xE596, 0xE597, 0xE598, 0xE599, 0xE59A, 0xE59C, 0xE59D, 0xE5A0, 0xE5A1, 0xE5A9,
  0xE5AA, 0xE5AF, 0xE5B4, 0xE678, 0xE67A, 0xE682, 0xE68F, 0xE691, 0xE695, 0xE696,
  0xE697, 0xE698, 0xE699, 0xE69A, 0xE69B, 0xF000, 0xF001, 0xF002, 0xF003, 0xF004,
  0xF005, 0xF007, 0xF008, 0xF009, 0xF00A, 0xF00B, 0xF00C, 0xF00E, 0xF010, 0xF011,
  0xF012, 0xF013, 0xF014, 0xF015, 0xF016, 0xF017, 0xF018, 0xF019, 0xF01A, 0xF01B,
  0xF01C, 0xF01D, 0xF01E, 0xF021, 0xF022, 0xF023, 0xF024, 0xF025, 0xF026, 0xF027,
  0xF028, 0xF029, 0xF02A, 0xF02B, 0xF02C, 0xF02D, 0xF02E, 0xF02F, 0xF030, 0xF031
]
const pageCount = Math.ceil(codePoints.length / perPage)

let page = 0
const requested = new Set<number>()
const worldText = engine.addEntity()

function hex(cp: number) {
  return cp.toString(16).toUpperCase()
}

function pageIcons() {
  return codePoints.slice(page * perPage, (page + 1) * perPage)
}

function show(next: number) {
  page = Math.max(0, Math.min(pageCount - 1, next))
  const icons = pageIcons()
  icons.forEach(cp => requested.add(cp))
  let text = ''
  icons.forEach((cp, i) => { text += (i > 0 && i % perLine === 0 ? '\n' : '') + String.fromCharCode(cp) })
  TextShape.getMutable(worldText).text = text
  console.log('[icon-repro] ' + JSON.stringify({
    event: 'page', page: page + 1, pages: pageCount, icons: icons.length,
    first: 'U+' + hex(icons[0]), last: 'U+' + hex(icons[icons.length - 1]), requested: requested.size
  }))
}

export function setupIconRepro() {
  console.log('[icon-repro] ' + JSON.stringify({ event: 'scene-started', font: solid, icons: codePoints.length, pages: pageCount }))
  Transform.create(worldText, { position: Vector3.create(52, 3, 58) })
  Billboard.create(worldText)
  TextShape.create(worldText, { text: '', fontSize: 2, textColor: Color4.White(), fontSrc: solid })
  show(0)
  ReactEcsRenderer.setUiRenderer(() => {
    const first = page * perPage
    return (
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 60, left: 100 }, width: 660, flexDirection: 'column', padding: 12 }}
        uiBackground={{ color: Color4.create(0.06, 0.07, 0.1, 0.95) }}>
        <Label value={'ICON ATLAS REPRO | Font Awesome Solid | page ' + (page + 1) + '/' + pageCount + ' | icons ' + (first + 1) + '-' + (first + pageIcons().length)}
          fontSize={16} textAlign='middle-left' uiTransform={{ height: 26 }} />
        <Label value={'Distinct icons requested this session of the scene: ' + requested.size}
          fontSize={13} textAlign='middle-left' uiTransform={{ height: 20 }} />
        <Label value={'Current client: about 34 icons render on page 1, the rest are boxes (tofu), and later pages are tofu. Fixed client: pages 1-3 render fully; tofu near the last pages is the expected 4-page cap. Page 1 only counts on a fresh Explorer launch.'}
          fontSize={12} textAlign='middle-left' textWrap='wrap' uiTransform={{ width: '100%', height: 48 }} />
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { top: 4, bottom: 4 } }}>
          <Button value='Prev page' fontSize={15} uiTransform={{ width: 130, height: 36, margin: 2 }} onMouseDown={() => show(page - 1)} />
          <Button value='Next page' fontSize={15} uiTransform={{ width: 130, height: 36, margin: 2 }} onMouseDown={() => show(page + 1)} />
          <Label value={'The 3D TextShape copy of this page is in front of the spawn point.'} fontSize={12} textAlign='middle-left' uiTransform={{ height: 36, margin: { left: 8 } }} />
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%' }}>
          {pageIcons().map((cp, i) => (
            <UiEntity key={'cell-' + i} uiTransform={{ flexDirection: 'column', alignItems: 'center', width: 60, margin: 2 }}
              uiBackground={{ color: Color4.create(0.15, 0.17, 0.22, 1) }}>
              <UiEntity uiTransform={{ width: 44, height: 40 }} uiText={{ value: String.fromCharCode(cp), fontSize: 28, fontSrc: solid }} />
              <Label value={(first + i + 1) + ' ' + hex(cp)} fontSize={10} uiTransform={{ height: 14 }} />
            </UiEntity>
          ))}
        </UiEntity>
      </UiEntity>
    )
  })
}
