// Map tab: every host of the spawned playground from above (map.ts lays it out): a dot per NPC in its state's colour
// with a nose where it looks, a line to where its running step goes, the selected one's route in cyan with numbered
// points, the props, the tester and the player. Click a dot to select that host (as clicking its body in the scene).
// Rebuilt only when mapKey changes, checked every MAP_PERIOD by the panel (a still or paused scene costs nothing).
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { buildMap, MapInput, MapScene, ROUTE_HEX, stateHex } from '../map'
import { AreaHosts, debugRegistry } from '../registry'
import { clip, colored, escapeRich, HEX } from '../theme'
import { C, hex, rect } from './kit'
import { BODY_H, BODY_W } from './layout'
import { selectHost, state } from './state'

const BAR_H = 30
const VIEW = { w: BODY_W, h: BODY_H - BAR_H - 6 }
const SLACK = 3 // px around a dot that still selects it (map.ts hitTest)
const LEGEND = ['patrol', 'alert', 'investigate', 'chase', 'walk', 'step', 'idle', 'no plan']
const FLOOR = hex('#11161C')
const TESTER = hex('#56A8FF')
const PLAYER = hex('#FFFFFF')

/** The area to show: the one holding the selected host, else the first with someone on it. */
function pickArea(): AreaHosts | undefined {
  const areas = debugRegistry.areas()
  return areas.find(a => a.hosts.some(h => h.id === state.host)) ?? areas.find(a => a.hosts.some(h => h.pose)) ?? areas[0]
}

/** What the map shows now (also the panel's change key, mapKey). */
export function mapInput(): MapInput | null {
  const a = pickArea()
  if (!a) return null
  const hosts = []
  for (const h of a.hosts) {
    const pose = h.pose?.()
    if (!pose) continue
    const s = h.status()
    hosts.push({ id: h.id, label: h.label, state: s.state, current: s.current, pose })
  }
  return {
    label: a.area.label,
    half: a.area.half,
    selected: state.host,
    hosts,
    props: a.area.props?.() ?? [],
    actors: a.area.actors?.() ?? []
  }
}

function legend(input: MapInput | null, m: MapScene | null) {
  const keys = LEGEND.map(s => colored(stateHex(s), `● ${s}`)).join('  ')
  const text = input && m
    ? `<b>${escapeRich(clip(input.label, 34))}</b>  ${colored(HEX.faint, `grid ${m.gridStep} m`)}   ${keys}  ${colored(ROUTE_HEX, '• route')}  ${colored('#56A8FF', '■ tester')}  ${colored('#FFFFFF', '● you')}`
    : colored(HEX.dim, 'No map: spawn a playground.')
  return (
    <UiEntity
      key="legend"
      uiTransform={{ width: '100%', height: BAR_H, flexShrink: 0, margin: { bottom: 6 } }}
      uiText={{ value: text, fontSize: 12, color: C.text, textAlign: 'middle-left', textWrap: 'nowrap' }}
    />
  )
}

function textAt(key: string, x: number, y: number, w: number, value: string, size = 11, align: 'top-center' | 'top-left' = 'top-center') {
  return (
    <UiEntity
      key={key}
      uiTransform={{ positionType: 'absolute', position: { left: align === 'top-center' ? x - w / 2 : x, top: y }, width: w, height: size * 2 + 6 }}
      uiText={{ value, fontSize: size, color: C.text, textAlign: align, textWrap: 'nowrap' }}
    />
  )
}

function canvas(m: MapScene) {
  const els: ReactEcs.JSX.Element[] = []
  const b = m.bounds
  els.push(rect('floor', b.x, b.y, b.w, b.h, FLOOR))
  m.grid.forEach((g, i) => els.push(rect(`g${i}`, g.x, g.y, g.w, g.h, C.guide)))
  m.rects.forEach((r, i) =>
    els.push(
      <UiEntity
        key={`r${i}`}
        uiTransform={{ positionType: 'absolute', position: { left: r.x, top: r.y }, width: r.w, height: r.h, borderRadius: r.round ? Math.min(r.w, r.h) / 2 : 1 }}
        uiBackground={{ color: hex(r.color, r.solid ? 0.95 : 0.55) }}
      />
    )
  )
  m.rects.forEach((r, i) => {
    if (r.label && r.w >= 60) els.push(textAt(`rl${i}`, r.x + 4, r.y + 2, r.w - 8, colored(HEX.dim, escapeRich(clip(r.label, 40))), 11, 'top-left'))
    else if (r.label && r.label.length <= 3) els.push(textAt(`rl${i}`, r.x + r.w / 2, r.y + r.h + 1, 24, colored(HEX.dim, escapeRich(r.label)), 10))
  })
  m.marks.forEach((k, i) => els.push(rect(`k${i}`, k.x - k.size / 2, k.y - k.size / 2, k.size, k.size, hex(k.color, k.kind === 'route' ? 1 : 0.8))))
  m.waypoints.forEach((w, i) => {
    els.push(
      <UiEntity
        key={`w${i}`}
        uiTransform={{ positionType: 'absolute', position: { left: w.x - 9, top: w.y - 9 }, width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: hex(ROUTE_HEX), justifyContent: 'center', alignItems: 'center' }}
        uiText={{ value: `${w.i}`, fontSize: 10, color: hex(ROUTE_HEX), textWrap: 'nowrap' }}
      />
    )
  })
  m.actors.forEach((a, i) => {
    const tester = a.kind === 'tester'
    els.push(
      <UiEntity
        key={`a${i}`}
        uiTransform={{ positionType: 'absolute', position: { left: a.x - 6, top: a.y - 6 }, width: 12, height: 12, borderRadius: tester ? 2 : 6 }}
        uiBackground={{ color: tester ? TESTER : PLAYER }}
      />
    )
    els.push(textAt(`al${i}`, a.x, a.y + 8, 80, colored(tester ? '#56A8FF' : '#FFFFFF', a.label), 11))
  })
  for (const d of m.dots) {
    const size = 2 * (d.r + SLACK)
    els.push(
      <UiEntity
        key={`d-${d.id}`}
        uiTransform={{ positionType: 'absolute', position: { left: d.x - d.r - SLACK, top: d.y - d.r - SLACK }, width: size, height: size, justifyContent: 'center', alignItems: 'center' }}
        onMouseDown={() => selectHost(d.id, true)}
      >
        <UiEntity
          key="body"
          uiTransform={{ width: 2 * d.r, height: 2 * d.r, borderRadius: d.r, borderWidth: d.selected ? 2 : 1, borderColor: d.selected ? Color4.White() : hex('#0D1117') }}
          uiBackground={{ color: hex(d.color) }}
        />
      </UiEntity>
    )
    els.push(rect(`n-${d.id}`, d.nose.x - 2, d.nose.y - 2, 4, 4, d.selected ? Color4.White() : hex(d.color)))
    const step = d.current ? `\n${colored(d.selected ? '#FFFFFF' : HEX.dim, escapeRich(clip(d.current, 26)))}` : ''
    els.push(textAt(`l-${d.id}`, d.x, d.y + d.r + 2, 170, `<b>${escapeRich(clip(d.label, 22))}</b>${step}`, 11))
  }
  return (
    <UiEntity key="canvas" uiTransform={{ width: VIEW.w, height: VIEW.h, flexShrink: 0, overflow: 'hidden' }} uiBackground={{ color: C.header }}>
      {els}
    </UiEntity>
  )
}

export function mapTab() {
  const input = mapInput()
  const m = input ? buildMap(input, VIEW) : null
  return (
    <UiEntity key="map" uiTransform={{ width: BODY_W, height: BODY_H, flexDirection: 'column', flexShrink: 0 }}>
      {legend(input, m)}
      {m && canvas(m)}
    </UiEntity>
  )
}
