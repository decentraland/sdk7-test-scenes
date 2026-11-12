// Small building blocks shared by the debugger views: colours, a button, an absolute rectangle, a text cell, and the
// scrollbar of a windowed list (SDK 7.30.1 cannot read a native scroll view's position, so long lists draw only the
// rows in view and scroll with buttons and a clickable track).
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'

/** sRGB channel (0..1) to linear. */
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

/**
 * A colour for uiBackground / uiText from an sRGB hex. The Explorer reads a UI Color4 as linear and shows it
 * gamma-encoded (Color4(0.18, 0.18, 0.22) shows as #767681), alpha included (a 0.12 tint blended like 0.38), and
 * blends in linear space. So the hex and the alpha are decoded here: the screen shows the hex as written, and `a`
 * is the share of the colour in a linear blend (a bright tint reads stronger than the same alpha on the web).
 * Rich-text <color=#hex> needs no decoding.
 */
export const hex = (h: string, a = 1): Color4 => {
  const n = parseInt(h.slice(1), 16)
  return Color4.create(linear(((n >> 16) & 255) / 255), linear(((n >> 8) & 255) / 255), linear((n & 255) / 255), linear(a))
}

export const C = {
  panel: hex('#0D1117', 1),
  header: hex('#161B22', 1),
  card: hex('#161B22', 1),
  border: hex('#30363D'),
  text: hex('#C9D1D9'),
  dim: hex('#8B949E'),
  guide: hex('#3D444D'),
  hover: hex('#1F6FEB', 0.18),
  selected: hex('#1F6FEB', 0.3),
  button: hex('#21262D'),
  buttonOn: hex('#1F6FEB'),
  edge: hex('#6E7681'),
  back: hex('#FFA657'),
  ok: hex('#5BD075'),
  bad: hex('#FF6B6B'),
  warn: hex('#FFA44D'),
  task: hex('#132F4C'),
  taskBorder: hex('#79C0FF'),
  branch: hex('#1C2128'),
  chip: hex('#1E3A5F'),
  chipText: hex('#99CCFF'),
  prim: hex('#2D2A1F'),
  primBorder: hex('#D29922'),
  // Alpha blends in linear space: a tenth of a bright colour over the dark card already reads clearly.
  added: hex('#2EA043', 0.1),
  removed: hex('#F85149', 0.1),
  changed: hex('#D29922', 0.1),
  group: hex('#21262D', 1),
  toggle: hex('#767681') // the scene menu's button grey
}

export function button(text: string, onClick: () => void, on = false, width: number | 'auto' = 'auto', key?: string, fontSize = 14) {
  return (
    <UiEntity
      key={key ?? text}
      uiTransform={{ width, height: 26, flexShrink: 0, margin: { right: 6 }, padding: { left: 10, right: 10 }, borderRadius: 5, justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: on ? C.buttonOn : C.button }}
      uiText={{ value: text, fontSize, color: Color4.White(), textWrap: 'nowrap' }}
      onMouseDown={onClick}
    />
  )
}

export function rect(key: string | number, x: number, y: number, w: number, h: number, color: Color4) {
  return (
    <UiEntity
      key={key}
      uiTransform={{ positionType: 'absolute', position: { left: x, top: y }, width: w, height: h }}
      uiBackground={{ color }}
    />
  )
}

export function label(value: string, fontSize = 14, color = C.text, width: number | 'auto' = 'auto', key?: string | number) {
  return (
    <UiEntity
      key={key}
      uiTransform={{ width, height: fontSize + 8, flexShrink: 0 }}
      uiText={{ value, fontSize, color, textAlign: 'middle-left', textWrap: 'nowrap' }}
    />
  )
}

/** Rich text that may wrap, its height from the content. */
export function para(value: string, fontSize = 13, key?: string | number, width: number | string = '100%') {
  return (
    <UiEntity
      key={key}
      uiTransform={{ width: width as number, height: 'auto', flexShrink: 0, margin: { bottom: 4 } }}
      uiText={{ value, fontSize, color: C.text, textAlign: 'top-left', textWrap: 'wrap' }}
    />
  )
}

/**
 * The scrollbar of a windowed list: page and line arrows, a track whose segments jump there, a thumb.
 * `go` gets the new offset, clamped.
 */
export function scrollbar(total: number, offset: number, size: number, height: number, go: (offset: number) => void, key = 'scroll') {
  const max = Math.max(0, total - size)
  const to = (o: number) => go(Math.max(0, Math.min(max, Math.round(o))))
  const SEGS = 20
  const arrowH = 24
  const trackH = height - 4 * arrowH
  const thumbH = Math.max(14, (trackH * size) / Math.max(total, size))
  const thumbY = max > 0 ? ((trackH - thumbH) * offset) / max : 0
  const segs = []
  for (let i = 0; i < SEGS; i++)
    segs.push(<UiEntity key={i} uiTransform={{ width: '100%', height: trackH / SEGS }} onMouseDown={() => to((max * i) / (SEGS - 1))} />)
  const arrow = (k: string, text: string, target: number) => (
    <UiEntity
      key={k}
      uiTransform={{ width: 18, height: arrowH, justifyContent: 'center' }}
      uiBackground={{ color: C.button }}
      uiText={{ value: text, fontSize: 9, color: C.text, textWrap: 'nowrap' }}
      onMouseDown={() => to(target)}
    />
  )
  return (
    <UiEntity key={key} uiTransform={{ width: 18, height, flexDirection: 'column', flexShrink: 0 }}>
      {arrow('pu', '▲▲', offset - size + 2)}
      {arrow('u', '▲', offset - 3)}
      <UiEntity key="track" uiTransform={{ width: 18, height: trackH, flexDirection: 'column' }} uiBackground={{ color: C.header }}>
        {max > 0 && rect('thumb', 3, thumbY, 12, thumbH, C.edge)}
        {segs}
      </UiEntity>
      {arrow('d', '▼', offset + 3)}
      {arrow('pd', '▼▼', offset + size - 2)}
    </UiEntity>
  )
}

/** UiEntity elements in an element tree (what the renderer turns into scene entities). */
export function countEntities(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((a: number, n) => a + countEntities(n), 0)
  if (!node || typeof node !== 'object') return 0
  const el = node as { type?: unknown; props?: { children?: unknown } }
  return (el.type === UiEntity ? 1 : 0) + countEntities(el.props?.children)
}
