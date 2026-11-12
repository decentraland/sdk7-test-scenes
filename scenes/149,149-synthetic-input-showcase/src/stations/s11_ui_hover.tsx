import { InputAction, pointerEventsSystem } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import ReactEcs, { UiEntity, Label, Button } from '@dcl/sdk/react-ecs'
import * as C from '../constants'
import { createSign, createBox, setBoxColor, COLORS } from '../lib'
import { counters, slog, logEntity, onReset } from '../state'

/**
 * S11 -- hovering scene UI with `ui_hover`.
 *
 * `ui_hover` parks the pointer on an element until `ui_hover leave:true`, the next `ui_hover`, or any
 * other `ui_*` gesture ends it. Every tile counts its own enters and leaves, and its "open" count
 * (enters - leaves - dropped) is what paints it: 0 is idle, 1 is HOVERED, anything else is a
 * delivery defect. Five tiles, each isolating one property of a hover:
 *
 *  A, B -- PARKED: a hover stays until ended, and hovering B ends A's.
 *  C    -- HOVER THEN CLICK: also counts down/up and keeps the event sequence, so a click after a
 *          hover must read `enter > leave > enter > down > up > leave` and leave C idle. A leave
 *          lost to the click's enter shows as C stuck HOVERED after the click.
 *  D, E -- SCOPE: E is a child of the container D. Hovering E must not enter D.
 *  F    -- COVERED: a toggleable overlay over F refuses the hover unless `force: true`.
 */

type TileKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

type TileState = { enters: number; leaves: number; dropped: number }

const TILE_KEYS: TileKey[] = ['A', 'B', 'C', 'D', 'E', 'F']
const SEQUENCE_MAX = 8

const IDLE_COLOR = Color4.create(0.25, 0.3, 0.5, 1)
const HOVERED_COLOR = Color4.create(0.2, 0.75, 0.35, 1)
const DEFECT_COLOR = Color4.create(0.85, 0.15, 0.15, 1)

let panelOpen = false
let coverOn = false
let cDowns = 0
let cUps = 0
let cSequence: string[] = []
const tiles = {} as Record<TileKey, TileState>

function clearTiles() {
  for (const key of TILE_KEYS) tiles[key] = { enters: 0, leaves: 0, dropped: 0 }
  cDowns = 0
  cUps = 0
  cSequence = []
}
clearTiles()

function openCount(key: TileKey): number {
  const t = tiles[key]
  return t.enters - t.leaves - t.dropped
}

function tileColor(key: TileKey): Color4 {
  const open = openCount(key)
  return open === 0 ? IDLE_COLOR : open === 1 ? HOVERED_COLOR : DEFECT_COLOR
}

function tileState(key: TileKey): string {
  const open = openCount(key)
  return open === 0 ? 'idle' : open === 1 ? 'HOVERED' : `DEFECT (open ${open})`
}

function tileCounts(key: TileKey): string {
  const t = tiles[key]
  return `enters ${t.enters} / leaves ${t.leaves}` + (t.dropped > 0 ? ` / dropped ${t.dropped}` : '')
}

function pushC(event: string) {
  cSequence.push(event)
  if (cSequence.length > SEQUENCE_MAX) cSequence.shift()
}

function cSequenceText(): string {
  return cSequence.length === 0 ? '(none)' : cSequence.join(' > ')
}

function onEnter(key: TileKey) {
  tiles[key].enters++
  if (key === 'C') pushC('enter')
  slog(
    'S11-HOVER',
    `${key}: enter (#${tiles[key].enters}) -- open ${openCount(key)}` + (key === 'C' ? ` -- sequence: ${cSequenceText()}` : '')
  )
}

function onLeave(key: TileKey) {
  tiles[key].leaves++
  if (key === 'C') pushC('leave')
  slog(
    'S11-HOVER',
    `${key}: leave (#${tiles[key].leaves}) -- open ${openCount(key)}` + (key === 'C' ? ` -- sequence: ${cSequenceText()}` : '')
  )
}

function setPanelOpen(v: boolean) {
  panelOpen = v
  counters.s11PanelOpen = v
  slog('S11-HOVER', `panel ${v ? 'opened' : 'closed'}`)

  if (v) return

  // A removed element gets no leave, so a hover open at close time would stay painted on the next open.
  for (const key of TILE_KEYS) {
    const open = openCount(key)
    if (open <= 0) continue
    tiles[key].dropped += open
    slog('S11-HOVER', `panel closed while ${key} was hovered (open ${open}) -- a removed element gets no leave; dropped`)
  }
}

export function setupS11UiHover() {
  const sign = createSign(C.S11_SIGN, 'S11 -- UI HOVER\n(ui_hover)', COLORS.info)
  logEntity('S11 sign', sign)

  const toggleButton = createBox(C.S11_TOGGLE_BUTTON, Vector3.create(1.2, 1.2, 1.2), COLORS.info)
  logEntity('S11 world toggle button (opens/closes the UI hover panel)', toggleButton)
  pointerEventsSystem.onPointerDown(
    { entity: toggleButton, opts: { button: InputAction.IA_POINTER, hoverText: 'Open/close UI hover panel', maxDistance: 16 } },
    () => {
      setPanelOpen(!panelOpen)
      setBoxColor(toggleButton, panelOpen ? COLORS.active : COLORS.info)
    }
  )

  onReset(() => {
    setPanelOpen(false)
    setBoxColor(toggleButton, COLORS.info)
    coverOn = false
    clearTiles()
  })

  slog('S11-HOVER', 'station ready -- open the panel, then ui_list stack:sdk; ui_hover parks on a tile until ended')
}

function HoverTile(props: { tileKey: TileKey; title: string; width: number; height: number; marginRight?: number }) {
  const key = props.tileKey
  return (
    <UiEntity
      uiTransform={{
        width: props.width,
        height: props.height,
        flexDirection: 'column',
        padding: 8,
        margin: { right: props.marginRight ?? 0 }
      }}
      uiBackground={{ color: tileColor(key) }}
      onMouseEnter={() => onEnter(key)}
      onMouseLeave={() => onLeave(key)}
    >
      <Label value={props.title} fontSize={18} color={Color4.White()} uiTransform={{ height: 24 }} />
      <Label value={tileState(key)} fontSize={16} color={Color4.Yellow()} uiTransform={{ height: 22 }} />
      <Label value={tileCounts(key)} fontSize={14} color={Color4.White()} uiTransform={{ height: 20 }} />
    </UiEntity>
  )
}

function SectionLabel(props: { value: string }) {
  return <Label value={props.value} fontSize={15} color={Color4.White()} uiTransform={{ height: 22, margin: { top: 10 } }} />
}

/**
 * S11's panel. Rendered by `setupSceneUi()` (`ui_root.tsx`) beside S8's and S9's -- anchored hard
 * to the right so it overlaps neither S8's centered panel nor S9's left one.
 */
export function S11Panel() {
  if (!panelOpen) return null

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 40, right: 30 },
        width: 520,
        height: 760,
        flexDirection: 'column',
        padding: 16
      }}
      uiBackground={{ color: Color4.create(0.08, 0.05, 0.08, 0.92) }}
    >
      <Label value="S11 -- UI HOVER (ui_hover)" fontSize={24} color={Color4.Yellow()} uiTransform={{ height: 36 }} />

      {/* A, B -- a parked hover, and a second hover ending the first */}
      <SectionLabel value="1. PARKED -- hover A, then B (ends A)" />
      <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 96 }}>
        <HoverTile tileKey="A" title="HOVER A" width={236} height={96} marginRight={16} />
        <HoverTile tileKey="B" title="HOVER B" width={236} height={96} />
      </UiEntity>

      {/* C -- hover then click: the sequence is the assertion */}
      <SectionLabel value="2. HOVER THEN CLICK -- C" />
      <UiEntity
        uiTransform={{ width: '100%', height: 96, flexDirection: 'column', padding: 8 }}
        uiBackground={{ color: tileColor('C') }}
        onMouseEnter={() => onEnter('C')}
        onMouseLeave={() => onLeave('C')}
        onMouseDown={() => {
          cDowns++
          pushC('down')
          slog('S11-HOVER', `C: down (#${cDowns}) -- sequence: ${cSequenceText()}`)
        }}
        onMouseUp={() => {
          cUps++
          pushC('up')
          slog('S11-HOVER', `C: up (#${cUps}) -- sequence: ${cSequenceText()}`)
        }}
      >
        <Label value="HOVER + CLICK C" fontSize={18} color={Color4.White()} uiTransform={{ height: 24 }} />
        <Label value={tileState('C')} fontSize={16} color={Color4.Yellow()} uiTransform={{ height: 22 }} />
        <Label value={`${tileCounts('C')} / downs ${cDowns} / ups ${cUps}`} fontSize={14} color={Color4.White()} uiTransform={{ height: 20 }} />
      </UiEntity>
      <Label value={`C sequence: ${cSequenceText()}`} fontSize={15} color={Color4.Green()} uiTransform={{ height: 22 }} />

      {/* D, E -- the container is not entered when its child is hovered */}
      <SectionLabel value="3. SCOPE -- E sits inside container D" />
      <UiEntity
        uiTransform={{ width: '100%', height: 116, flexDirection: 'row', alignItems: 'center', padding: 8 }}
        uiBackground={{ color: tileColor('D') }}
        onMouseEnter={() => onEnter('D')}
        onMouseLeave={() => onLeave('D')}
      >
        <UiEntity uiTransform={{ width: 280, height: '100%', flexDirection: 'column' }}>
          <Label value="CONTAINER D" fontSize={18} color={Color4.White()} uiTransform={{ height: 24 }} />
          <Label value={tileState('D')} fontSize={16} color={Color4.Yellow()} uiTransform={{ height: 22 }} />
          <Label value={tileCounts('D')} fontSize={14} color={Color4.White()} uiTransform={{ height: 20 }} />
        </UiEntity>
        <HoverTile tileKey="E" title="CHILD E" width={180} height={92} />
      </UiEntity>

      {/* F -- a cover refuses the hover */}
      <SectionLabel value="4. COVERED -- F under a toggleable cover" />
      <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', height: 96, alignItems: 'center' }}>
        <UiEntity uiTransform={{ width: 236, height: 96, margin: { right: 16 } }}>
          <HoverTile tileKey="F" title="HOVER F" width={236} height={96} />
          {coverOn && (
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { top: 0, left: 0 },
                width: '100%',
                height: '100%',
                pointerFilter: 'block'
              }}
              uiBackground={{ color: Color4.create(0, 0, 0, 0.8) }}
            >
              <Label value="COVER" fontSize={20} color={Color4.Red()} uiTransform={{ width: '100%', height: '100%' }} />
            </UiEntity>
          )}
        </UiEntity>
        <Button
          value={coverOn ? 'Cover F: ON' : 'Cover F: OFF'}
          variant="secondary"
          uiTransform={{ width: 236, height: 60 }}
          onMouseDown={() => {
            coverOn = !coverOn
            slog('S11-HOVER', `cover over F ${coverOn ? 'ON' : 'OFF'}`)
          }}
        />
      </UiEntity>

      <Button
        value="CLEAR S11 COUNTS"
        variant="secondary"
        uiTransform={{ width: 236, height: 50, margin: { top: 16 } }}
        onMouseDown={() => {
          clearTiles()
          slog('S11-HOVER', 'counts and C sequence cleared (the cover and the panel are untouched)')
        }}
      />
    </UiEntity>
  )
}
