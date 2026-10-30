import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, Button, Label } from '@dcl/sdk/react-ecs'

// Minimal repro of a creator report: single Font Awesome Solid icons on a UiText intermittently
// show as tofu, and which icon fails changes between runs (Medal, Compass, then Gift, then Dragon).
// Every icon below is in the font; the creator's element is mirrored as closely as possible.
const solid = 'assets/fonts/duck-font-awesome-solid.ttf'
const icons: [string, number][] = [
  ['gift', 0xF06B], ['dragon', 0xF6D5], ['medal', 0xF5A2], ['compass', 0xF14E],
  ['star', 0xF005], ['heart', 0xF004], ['trophy', 0xF091], ['crown', 0xF521],
  ['ghost', 0xF6E2], ['rocket', 0xF135], ['skull', 0xF54C], ['fish', 0xF578],
  ['bell', 0xF0F3], ['dice', 0xF522], ['key', 0xF084], ['bolt', 0xF0E7]
]
const autoSeconds = 2

let index = 0
let auto = true
let untilNext = autoSeconds
let mounted = true
let remountPending = false
let seen: number[] = [0]

function hex(cp: number) {
  return 'U+' + cp.toString(16).toUpperCase()
}

function show(next: number) {
  index = (next + icons.length) % icons.length
  if (!seen.includes(index)) seen.push(index)
  untilNext = autoSeconds
  const [name, cp] = icons[index]
  console.log('[icon-repro] ' + JSON.stringify({ event: 'icon', index, name, codePoint: hex(cp), seen: seen.length }))
}

function remount() {
  mounted = false
  remountPending = true
  console.log('[icon-repro] ' + JSON.stringify({ event: 'remount', index }))
}

export function setupIconRepro() {
  console.log('[icon-repro] ' + JSON.stringify({ event: 'scene-started', font: solid }))
  show(0)
  engine.addSystem(dt => {
    // Re-add the icon one frame after removing it, so the UiText is really recreated
    if (remountPending && !mounted) {
      mounted = true
      remountPending = false
      return
    }
    if (!auto) return
    untilNext -= dt
    if (untilNext <= 0) show(index + 1)
  })
  ReactEcsRenderer.setUiRenderer(() => {
    const [name, cp] = icons[index]
    return (
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 80, left: 100 }, width: 620, flexDirection: 'column', padding: 12 }}
        uiBackground={{ color: Color4.create(0.06, 0.07, 0.1, 0.95) }}>
        <Label value={'ICON REPRO | Font Awesome Solid on UiText | built-in font for captions'} fontSize={16} textAlign='middle-left' uiTransform={{ height: 28 }} />
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: 110 }}>
          <UiEntity uiTransform={{ width: 110, height: 110 }} uiBackground={{ color: Color4.create(0.15, 0.17, 0.22, 1) }}>
            {mounted && <UiEntity uiTransform={{ width: '100%', height: '100%' }}
              uiText={{ value: String.fromCharCode(cp), fontSize: 72, fontSrc: solid }} />}
          </UiEntity>
          <Label value={(index + 1) + '/' + icons.length + '  ' + name + '  ' + hex(cp) + (mounted ? '' : '  (remounting)')}
            fontSize={26} textAlign='middle-left' uiTransform={{ margin: { left: 16 }, height: 110 }} />
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: 6 } }}>
          <Button value='Prev' fontSize={15} uiTransform={{ width: 110, height: 36, margin: 2 }} onMouseDown={() => { auto = false; show(index - 1) }} />
          <Button value='Next' fontSize={15} uiTransform={{ width: 110, height: 36, margin: 2 }} onMouseDown={() => { auto = false; show(index + 1) }} />
          <Button value={auto ? 'Auto: on' : 'Auto: off'} fontSize={15} uiTransform={{ width: 140, height: 36, margin: 2 }} onMouseDown={() => { auto = !auto; untilNext = autoSeconds }} />
          <Button value='Remount' fontSize={15} uiTransform={{ width: 140, height: 36, margin: 2 }} onMouseDown={remount} />
        </UiEntity>
        <Label value={'Every icon seen this run, each in its own UiText. A box here is a failure; one that was fine and turns into a box is the key case.'}
          fontSize={13} textAlign='middle-left' uiTransform={{ height: 40, margin: { top: 8 } }} />
        <UiEntity uiTransform={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%' }}>
          {seen.map(i => (
            <UiEntity key={'seen-' + i} uiTransform={{ flexDirection: 'column', alignItems: 'center', width: 70, margin: 2 }}>
              <UiEntity uiTransform={{ width: 48, height: 48 }} uiText={{ value: String.fromCharCode(icons[i][1]), fontSize: 36, fontSrc: solid }} />
              <Label value={icons[i][0]} fontSize={11} uiTransform={{ height: 16 }} />
            </UiEntity>
          ))}
        </UiEntity>
      </UiEntity>
    )
  })
}
