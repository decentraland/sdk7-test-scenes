import { engine, Entity, Transform, UiCanvasInformation, VisibilityComponent } from '@dcl/sdk/ecs'
import {
  ParticleSystem,
  PBParticleSystem_BlendMode,
  PBParticleSystem_PlaybackState,
  PBParticleSystem_SimulationSpace
} from '@dcl/sdk/ecs'
import ReactEcs, { Button, Input, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { getCurrentPsEntry, PsEntry } from './index'
// copyToClipboard exists in the Explorer runtime but isn't in the SDK type declarations yet
declare module '~system/RestrictedActions' {
  export function copyToClipboard(body: { text: string }): Promise<{}>
}
import { copyToClipboard } from '~system/RestrictedActions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

let copiedAt = 0

function fmt(num: number, decimals: number = 1): string {
  return num.toFixed(decimals)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getScale(): number {
  const canvas = UiCanvasInformation.getOrNull(engine.RootEntity)
  if (!canvas || canvas.width === 0) return 1
  return Math.min(canvas.width / 1920, canvas.height / 1080)
}

function colorToHex(c: { r: number; g: number; b: number }): string {
  const to255 = (v: number) => Math.round(clamp(v, 0, 1) * 255)
  return '#' + [to255(c.r), to255(c.g), to255(c.b)]
    .map(v => v.toString(16).padStart(2, '0'))
    .join('')
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace(/^#/, '').match(/^([0-9a-fA-F]{6})$/)
  if (!m) return null
  const h = m[1]
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255
  }
}

const INPUT_BG = Color4.create(0.12, 0.12, 0.18, 1)
const INPUT_COLOR = Color4.White()
const INPUT_PH_COLOR = Color4.create(0.6, 0.6, 0.6, 1)


// ─── Sub-components ───────────────────────────────────────────────────────────

function Row(props: {
  label: string
  value: number
  decimals?: number
  onDec: () => void
  onInc: () => void
  onSet: (v: number) => void
  scale: number
}): ReactEcs.JSX.Element {
  const { label, value, decimals, onDec, onInc, onSet, scale } = props
  const dp = decimals ?? 1
  return (
    <UiEntity
      uiTransform={{
        flexDirection: 'row',
        alignItems: 'center',
        margin: { bottom: scale * 2 }
      }}
    >
      <Label
        value={label}
        fontSize={scale * 10}
        uiTransform={{ width: scale * 140, margin: { right: scale * 4 } }}
      />
      <Button
        value="-"
        fontSize={scale * 11}
        uiTransform={{ width: scale * 24, height: scale * 22, margin: { right: scale * 2 } }}
        onMouseDown={onDec}
      />
      <Input
        value=""
        placeholder={fmt(value, dp)}
        onChange={(v) => { const n = parseFloat(v); if (!isNaN(n)) onSet(n) }}
        fontSize={scale * 10}
        font="monospace"
        textAlign="middle-center"
        color={INPUT_COLOR}
        placeholderColor={INPUT_PH_COLOR}
        uiTransform={{ width: scale * 60, height: scale * 22, margin: { right: scale * 2 } }}
        uiBackground={{ color: INPUT_BG }}
      />
      <Button
        value="+"
        fontSize={scale * 11}
        uiTransform={{ width: scale * 24, height: scale * 22 }}
        onMouseDown={onInc}
      />
    </UiEntity>
  )
}

function RangeRow(props: {
  label: string
  startVal: number
  endVal: number
  decimals?: number
  onDecStart: () => void
  onIncStart: () => void
  onSetStart: (v: number) => void
  onDecEnd: () => void
  onIncEnd: () => void
  onSetEnd: (v: number) => void
  scale: number
}): ReactEcs.JSX.Element {
  const { label, startVal, endVal, decimals, onDecStart, onIncStart, onSetStart, onDecEnd, onIncEnd, onSetEnd, scale } = props
  const dp = decimals ?? 1
  return (
    <UiEntity
      uiTransform={{
        flexDirection: 'row',
        alignItems: 'center',
        margin: { bottom: scale * 2 }
      }}
    >
      <Label
        value={label}
        fontSize={scale * 10}
        uiTransform={{ width: scale * 120, margin: { right: scale * 4 } }}
      />
      <Button
        value="-"
        fontSize={scale * 11}
        uiTransform={{ width: scale * 24, height: scale * 22, margin: { right: scale * 2 } }}
        onMouseDown={onDecStart}
      />
      <Input
        value=""
        placeholder={fmt(startVal, dp)}
        onChange={(v) => { const n = parseFloat(v); if (!isNaN(n)) onSetStart(n) }}
        fontSize={scale * 10}
        font="monospace"
        textAlign="middle-center"
        color={INPUT_COLOR}
        placeholderColor={INPUT_PH_COLOR}
        uiTransform={{ width: scale * 50, height: scale * 22, margin: { right: scale * 2 } }}
        uiBackground={{ color: INPUT_BG }}
      />
      <Button
        value="+"
        fontSize={scale * 11}
        uiTransform={{ width: scale * 24, height: scale * 22, margin: { right: scale * 4 } }}
        onMouseDown={onIncStart}
      />
      <Label
        value=">"
        fontSize={scale * 10}
        uiTransform={{ width: scale * 12, margin: { right: scale * 4 } }}
      />
      <Button
        value="-"
        fontSize={scale * 11}
        uiTransform={{ width: scale * 24, height: scale * 22, margin: { right: scale * 2 } }}
        onMouseDown={onDecEnd}
      />
      <Input
        value=""
        placeholder={fmt(endVal, dp)}
        onChange={(v) => { const n = parseFloat(v); if (!isNaN(n)) onSetEnd(n) }}
        fontSize={scale * 10}
        font="monospace"
        textAlign="middle-center"
        color={INPUT_COLOR}
        placeholderColor={INPUT_PH_COLOR}
        uiTransform={{ width: scale * 50, height: scale * 22, margin: { right: scale * 2 } }}
        uiBackground={{ color: INPUT_BG }}
      />
      <Button
        value="+"
        fontSize={scale * 11}
        uiTransform={{ width: scale * 24, height: scale * 22 }}
        onMouseDown={onIncEnd}
      />
    </UiEntity>
  )
}

function HexColorRow(props: {
  label: string
  color: { r: number; g: number; b: number; a: number }
  onSetHex: (hex: string) => void
  onDecAlpha: () => void
  onIncAlpha: () => void
  onSetAlpha: (v: number) => void
  scale: number
}): ReactEcs.JSX.Element {
  const { label, color, onSetHex, onDecAlpha, onIncAlpha, onSetAlpha, scale } = props
  const hex = colorToHex(color)
  return (
    <UiEntity
      uiTransform={{
        flexDirection: 'row',
        alignItems: 'center',
        margin: { bottom: scale * 2 }
      }}
    >
      <Label value={label} fontSize={scale * 10} uiTransform={{ width: scale * 50, margin: { right: scale * 4 } }} />
      <Input
        value=""
        placeholder={hex}
        onChange={(v) => { onSetHex(v) }}
        fontSize={scale * 10}
        font="monospace"
        textAlign="middle-center"
        color={INPUT_COLOR}
        placeholderColor={INPUT_PH_COLOR}
        uiTransform={{ width: scale * 90, height: scale * 22, margin: { right: scale * 6 } }}
        uiBackground={{ color: INPUT_BG }}
      />
      <UiEntity
        uiTransform={{ width: scale * 18, height: scale * 18, margin: { right: scale * 6 } }}
        uiBackground={{ color: Color4.create(color.r, color.g, color.b, 1) }}
      />
      <Label value="A" fontSize={scale * 10} uiTransform={{ width: scale * 14, margin: { right: scale * 2 } }} />
      <Button value="-" fontSize={scale * 11}
        uiTransform={{ width: scale * 22, height: scale * 20, margin: { right: scale * 2 } }}
        onMouseDown={onDecAlpha} />
      <Input
        value=""
        placeholder={fmt(color.a, 2)}
        onChange={(v) => { const n = parseFloat(v); if (!isNaN(n)) onSetAlpha(clamp(n, 0, 1)) }}
        fontSize={scale * 10}
        font="monospace"
        textAlign="middle-center"
        color={INPUT_COLOR}
        placeholderColor={INPUT_PH_COLOR}
        uiTransform={{ width: scale * 45, height: scale * 20, margin: { right: scale * 2 } }}
        uiBackground={{ color: INPUT_BG }}
      />
      <Button value="+" fontSize={scale * 11}
        uiTransform={{ width: scale * 22, height: scale * 20 }}
        onMouseDown={onIncAlpha} />
    </UiEntity>
  )
}

function ToggleBtn(props: {
  label: string
  active: boolean
  onToggle: () => void
  scale: number
}): ReactEcs.JSX.Element {
  const { label, active, onToggle, scale } = props
  return (
    <Button
      value={`${label}: ${active ? 'ON' : 'OFF'}`}
      fontSize={scale * 10}
      variant={active ? 'primary' : 'secondary'}
      uiTransform={{ height: scale * 24, margin: { right: scale * 4, bottom: scale * 2 } }}
      onMouseDown={onToggle}
    />
  )
}

function Divider(props: { scale: number }): ReactEcs.JSX.Element {
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: 1, margin: { top: props.scale * 2, bottom: props.scale * 2 } }}
      uiBackground={{ color: Color4.create(1, 1, 1, 0.15) }}
    />
  )
}

function SectionLabel(props: { text: string; scale: number }): ReactEcs.JSX.Element {
  return (
    <Label value={props.text} fontSize={props.scale * 11} uiTransform={{ margin: { bottom: props.scale * 3 } }} />
  )
}

// ─── Color mutation helpers ──────────────────────────────────────────────────

function ensureColorField(
  mutable: NonNullable<ReturnType<typeof ParticleSystem.getMutableOrNull>>,
  field: 'initialColor' | 'colorOverTime'
): void {
  if (!mutable[field]) {
    mutable[field] = {
      start: Color4.create(1, 1, 1, 1),
      end: field === 'colorOverTime' ? Color4.create(1, 1, 1, 0) : Color4.create(1, 1, 1, 1)
    }
  }
}

function setColorHex(
  entity: Entity,
  field: 'initialColor' | 'colorOverTime',
  which: 'start' | 'end',
  hex: string
): void {
  const mutable = ParticleSystem.getMutableOrNull(entity)
  if (!mutable) return
  ensureColorField(mutable, field)
  const rgb = hexToRgb(hex)
  if (!rgb) return
  const old = mutable[field]![which] ?? Color4.create(1, 1, 1, 1)
  mutable[field]![which] = Color4.create(rgb.r, rgb.g, rgb.b, old.a)
}

function changeColorAlpha(
  entity: Entity,
  field: 'initialColor' | 'colorOverTime',
  which: 'start' | 'end',
  delta: number
): void {
  const mutable = ParticleSystem.getMutableOrNull(entity)
  if (!mutable) return
  ensureColorField(mutable, field)
  const old = mutable[field]![which] ?? Color4.create(1, 1, 1, 1)
  mutable[field]![which] = Color4.create(old.r, old.g, old.b, clamp(old.a + delta, 0, 1))
}

function setColorAlpha(
  entity: Entity,
  field: 'initialColor' | 'colorOverTime',
  which: 'start' | 'end',
  alpha: number
): void {
  const mutable = ParticleSystem.getMutableOrNull(entity)
  if (!mutable) return
  ensureColorField(mutable, field)
  const old = mutable[field]![which] ?? Color4.create(1, 1, 1, 1)
  mutable[field]![which] = Color4.create(old.r, old.g, old.b, clamp(alpha, 0, 1))
}

// ─── Serialization for copy-to-clipboard ─────────────────────────────────────

function blendModeStr(mode: PBParticleSystem_BlendMode): string {
  switch (mode) {
    case PBParticleSystem_BlendMode.PSB_ALPHA: return 'PBParticleSystem_BlendMode.PSB_ALPHA'
    case PBParticleSystem_BlendMode.PSB_ADD: return 'PBParticleSystem_BlendMode.PSB_ADD'
    case PBParticleSystem_BlendMode.PSB_MULTIPLY: return 'PBParticleSystem_BlendMode.PSB_MULTIPLY'
    default: return 'PBParticleSystem_BlendMode.PSB_ALPHA'
  }
}

function serializeParticleSystem(entity: Entity): string {
  const ps = ParticleSystem.getOrNull(entity)
  if (!ps) return '// No ParticleSystem component found'

  const lines: string[] = []
  const ind = '  '

  lines.push('ParticleSystem.create(entity, {')

  // Basic properties
  lines.push(`${ind}active: ${ps.active ?? true},`)
  lines.push(`${ind}loop: ${ps.loop ?? true},`)
  lines.push(`${ind}prewarm: ${ps.prewarm ?? false},`)
  lines.push(`${ind}billboard: ${ps.billboard ?? true},`)
  lines.push(`${ind}rate: ${ps.rate ?? 20},`)
  lines.push(`${ind}lifetime: ${ps.lifetime ?? 2},`)
  lines.push(`${ind}maxParticles: ${ps.maxParticles ?? 100},`)
  lines.push(`${ind}gravity: ${ps.gravity ?? 0},`)
  lines.push(`${ind}blendMode: ${blendModeStr(ps.blendMode ?? PBParticleSystem_BlendMode.PSB_ALPHA)},`)

  // Simulation space
  if (ps.simulationSpace !== undefined && ps.simulationSpace !== null) {
    const ssStr = ps.simulationSpace === PBParticleSystem_SimulationSpace.PSS_WORLD
      ? 'PBParticleSystem_SimulationSpace.PSS_WORLD'
      : 'PBParticleSystem_SimulationSpace.PSS_LOCAL'
    lines.push(`${ind}simulationSpace: ${ssStr},`)
  }

  // Shape
  const shape = ps.shape
  if (!shape || shape.$case === 'point') {
    lines.push(`${ind}shape: ParticleSystem.Shape.Point(),`)
  } else if (shape.$case === 'sphere') {
    lines.push(`${ind}shape: ParticleSystem.Shape.Sphere({ radius: ${shape.sphere.radius ?? 1} }),`)
  } else if (shape.$case === 'cone') {
    lines.push(`${ind}shape: ParticleSystem.Shape.Cone({ angle: ${shape.cone.angle ?? 25}, radius: ${shape.cone.radius ?? 1} }),`)
  } else if (shape.$case === 'box') {
    const s = shape.box.size ?? { x: 1, y: 1, z: 1 }
    lines.push(`${ind}shape: ParticleSystem.Shape.Box({ size: Vector3.create(${s.x}, ${s.y}, ${s.z}) }),`)
  }

  // Texture
  if (ps.texture) {
    lines.push(`${ind}texture: { src: '${ps.texture.src}' },`)
  }

  // Float ranges
  const velSpeed = ps.initialVelocitySpeed
  if (velSpeed) {
    lines.push(`${ind}initialVelocitySpeed: { start: ${velSpeed.start}, end: ${velSpeed.end} },`)
  }

  const initSize = ps.initialSize
  if (initSize) {
    lines.push(`${ind}initialSize: { start: ${initSize.start}, end: ${initSize.end} },`)
  }

  const sot = ps.sizeOverTime
  if (sot) {
    lines.push(`${ind}sizeOverTime: { start: ${sot.start}, end: ${sot.end} },`)
  }

  const rot = ps.rotationOverTime
  if (rot) {
    lines.push(`${ind}rotationOverTime: { start: ${rot.start}, end: ${rot.end} },`)
  }

  // Color ranges
  function fmtColor(c: { r: number; g: number; b: number; a: number }): string {
    return `Color4.create(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)}, ${c.a.toFixed(3)})`
  }

  const ic = ps.initialColor
  if (ic) {
    const s = ic.start ?? { r: 1, g: 1, b: 1, a: 1 }
    const e = ic.end ?? { r: 1, g: 1, b: 1, a: 1 }
    lines.push(`${ind}initialColor: { start: ${fmtColor(s)}, end: ${fmtColor(e)} },`)
  }

  const cot = ps.colorOverTime
  if (cot) {
    const s = cot.start ?? { r: 1, g: 1, b: 1, a: 1 }
    const e = cot.end ?? { r: 1, g: 1, b: 1, a: 0 }
    lines.push(`${ind}colorOverTime: { start: ${fmtColor(s)}, end: ${fmtColor(e)} },`)
  }

  // Limit velocity
  if (ps.limitVelocity) {
    lines.push(`${ind}limitVelocity: { speed: ${ps.limitVelocity.speed}, dampen: ${ps.limitVelocity.dampen} },`)
  }

  // Additional force
  if (ps.additionalForce) {
    lines.push(`${ind}additionalForce: Vector3.create(${ps.additionalForce.x}, ${ps.additionalForce.y}, ${ps.additionalForce.z}),`)
  }

  // Sprite sheet
  if (ps.spriteSheet) {
    const ss = ps.spriteSheet
    lines.push(`${ind}spriteSheet: {`)
    lines.push(`${ind}${ind}tilesX: ${ss.tilesX},`)
    lines.push(`${ind}${ind}tilesY: ${ss.tilesY},`)
    lines.push(`${ind}${ind}startFrame: ${ss.startFrame},`)
    lines.push(`${ind}${ind}endFrame: ${ss.endFrame},`)
    lines.push(`${ind}${ind}framesPerSecond: ${ss.framesPerSecond ?? 30},`)
    lines.push(`${ind}},`)
  }

  lines.push('})')

  return lines.join('\n')
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

function UI(): ReactEcs.JSX.Element {
  const scale = getScale()
  const maybeEntry = getCurrentPsEntry()

  const panelBg = Color4.create(0.04, 0.05, 0.12, 0.92)

  if (!maybeEntry) {
    return (<UiEntity uiTransform={{ display: 'none' }} />)
  }

  const entry: PsEntry = maybeEntry
  const comp = ParticleSystem.getMutableOrNull(entry.entity)
  if (!comp) {
    return (<UiEntity uiTransform={{ display: 'none' }} />)
  }

  // ─── Resolved values ─────────────────────────────────────────────────────

  const vizVisible = VisibilityComponent.getOrNull(entry.vizEntity)?.visible ?? true
  const active = comp.active ?? true
  const loop = comp.loop ?? true
  const prewarm = comp.prewarm ?? false
  const billboard = comp.billboard ?? true
  const simSpaceWorld = (comp.simulationSpace ?? PBParticleSystem_SimulationSpace.PSS_LOCAL) === PBParticleSystem_SimulationSpace.PSS_WORLD
  const rate = comp.rate ?? 20
  const lifetime = comp.lifetime ?? 2
  const maxParticles = comp.maxParticles ?? 100
  const gravity = comp.gravity ?? 0
  const blendMode = comp.blendMode ?? PBParticleSystem_BlendMode.PSB_ALPHA

  const velStart = comp.initialVelocitySpeed?.start ?? 1
  const velEnd = comp.initialVelocitySpeed?.end ?? 2
  const sizeStart = comp.initialSize?.start ?? 0.2
  const sizeEnd = comp.initialSize?.end ?? 0.4
  const sotStart = comp.sizeOverTime?.start ?? 1.0
  const sotEnd = comp.sizeOverTime?.end ?? 0.0
  const rotStart = comp.rotationOverTime?.start ?? 0
  const rotEnd = comp.rotationOverTime?.end ?? 0

  const icStart = comp.initialColor?.start ?? Color4.create(1, 1, 1, 1)
  const icEnd = comp.initialColor?.end ?? Color4.create(1, 1, 1, 1)
  const cotStart = comp.colorOverTime?.start ?? Color4.create(1, 1, 1, 1)
  const cotEnd = comp.colorOverTime?.end ?? Color4.create(1, 1, 1, 0)

  const hasLimitVel = comp.limitVelocity !== undefined && comp.limitVelocity !== null
  const limitSpeed = comp.limitVelocity?.speed ?? 3
  const limitDampen = comp.limitVelocity?.dampen ?? 1
  const hasAdditionalForce = comp.additionalForce !== undefined && comp.additionalForce !== null
  const forceX = comp.additionalForce?.x ?? 0
  const forceY = comp.additionalForce?.y ?? 0
  const forceZ = comp.additionalForce?.z ?? 0

  const hasSpriteSheet = comp.spriteSheet !== undefined && comp.spriteSheet !== null
  const sheetTilesX = comp.spriteSheet?.tilesX ?? 2
  const sheetTilesY = comp.spriteSheet?.tilesY ?? 2
  const sheetStartFrame = comp.spriteSheet?.startFrame ?? 0
  const sheetEndFrame = comp.spriteSheet?.endFrame ?? 3
  const sheetFps = comp.spriteSheet?.framesPerSecond ?? 30

  const shapeCase = comp.shape?.$case ?? 'point'
  const sphereRadius = (comp.shape?.$case === 'sphere' ? comp.shape.sphere.radius : undefined) ?? 1
  const coneAngle = (comp.shape?.$case === 'cone' ? comp.shape.cone.angle : undefined) ?? 25
  const coneRadius = (comp.shape?.$case === 'cone' ? comp.shape.cone.radius : undefined) ?? 1
  const boxSizeX = (comp.shape?.$case === 'box' ? comp.shape.box.size?.x : undefined) ?? 1
  const boxSizeY = (comp.shape?.$case === 'box' ? comp.shape.box.size?.y : undefined) ?? 1
  const boxSizeZ = (comp.shape?.$case === 'box' ? comp.shape.box.size?.z : undefined) ?? 1

  // Entity transform euler angles
  const tform = Transform.getOrNull(entry.entity)
  const quat = tform?.rotation ?? Quaternion.Identity()
  const euler = Quaternion.toEulerAngles(quat)
  const eulerX = Math.round(euler.x * (180 / Math.PI) * 10) / 10
  const eulerY = Math.round(euler.y * (180 / Math.PI) * 10) / 10
  const eulerZ = Math.round(euler.z * (180 / Math.PI) * 10) / 10

  // ─── Playback handlers ──────────────────────────────────────────────────

  function onPlay() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.playbackState = PBParticleSystem_PlaybackState.PS_PLAYING
  }
  function onPause() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.playbackState = PBParticleSystem_PlaybackState.PS_PAUSED
  }
  function onStop() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.playbackState = PBParticleSystem_PlaybackState.PS_STOPPED
  }
  function onRestart() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.restartCount = (m.restartCount ?? 0) + 1
  }

  // ─── Toggle handlers ────────────────────────────────────────────────────

  function onToggleActive() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.active = !(m.active ?? true)
  }
  function onToggleLoop() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.loop = !(m.loop ?? true)
  }
  function onTogglePrewarm() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.prewarm = !(m.prewarm ?? false)
  }
  function onToggleBillboard() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.billboard = !(m.billboard ?? true)
  }
  function onToggleSimSpace() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return
    const isWorld = (m.simulationSpace ?? PBParticleSystem_SimulationSpace.PSS_LOCAL) === PBParticleSystem_SimulationSpace.PSS_WORLD
    m.simulationSpace = isWorld ? PBParticleSystem_SimulationSpace.PSS_LOCAL : PBParticleSystem_SimulationSpace.PSS_WORLD
  }
  function onToggleVizVisible() {
    const current = VisibilityComponent.getOrNull(entry.vizEntity)?.visible ?? true
    VisibilityComponent.createOrReplace(entry.vizEntity, { visible: !current })
  }
  function onCopyToClipboard() {
    const code = serializeParticleSystem(entry.entity)
    copyToClipboard({ text: code })
    copiedAt = Date.now()
  }

  // ─── Blend mode handlers ────────────────────────────────────────────────

  function onBlendAlpha() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.blendMode = PBParticleSystem_BlendMode.PSB_ALPHA
  }
  function onBlendAdd() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.blendMode = PBParticleSystem_BlendMode.PSB_ADD
  }
  function onBlendMultiply() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.blendMode = PBParticleSystem_BlendMode.PSB_MULTIPLY
  }

  // ─── Emission handlers ──────────────────────────────────────────────────

  function onDecRate() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.rate = clamp((m.rate ?? 20) - 5, 0, 300)
  }
  function onIncRate() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.rate = clamp((m.rate ?? 20) + 5, 0, 300)
  }
  function onSetRate(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.rate = clamp(v, 0, 300)
  }
  function onDecLifetime() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.lifetime = clamp((m.lifetime ?? 2) - 0.5, 0.1, 30)
  }
  function onIncLifetime() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.lifetime = clamp((m.lifetime ?? 2) + 0.5, 0.1, 30)
  }
  function onSetLifetime(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.lifetime = clamp(v, 0.1, 30)
  }
  function onDecMaxParticles() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.maxParticles = clamp((m.maxParticles ?? 100) - 25, 1, 2000)
  }
  function onIncMaxParticles() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.maxParticles = clamp((m.maxParticles ?? 100) + 25, 1, 2000)
  }
  function onSetMaxParticles(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.maxParticles = clamp(Math.round(v), 1, 2000)
  }

  // ─── Motion handler ─────────────────────────────────────────────────────

  function onDecGravity() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.gravity = clamp((m.gravity ?? 0) - 0.5, -20, 20)
  }
  function onIncGravity() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.gravity = clamp((m.gravity ?? 0) + 0.5, -20, 20)
  }
  function onSetGravity(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.gravity = clamp(v, -20, 20)
  }

  // ─── Velocity handlers ──────────────────────────────────────────────────

  function ensureVel(m: any) { if (!m.initialVelocitySpeed) m.initialVelocitySpeed = { start: 1, end: 2 } }
  function onDecVelStart() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureVel(m)
    m.initialVelocitySpeed!.start = clamp(m.initialVelocitySpeed!.start - 0.5, 0, 50)
  }
  function onIncVelStart() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureVel(m)
    m.initialVelocitySpeed!.start = clamp(m.initialVelocitySpeed!.start + 0.5, 0, 50)
  }
  function onDecVelEnd() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureVel(m)
    m.initialVelocitySpeed!.end = clamp(m.initialVelocitySpeed!.end - 0.5, 0, 50)
  }
  function onIncVelEnd() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureVel(m)
    m.initialVelocitySpeed!.end = clamp(m.initialVelocitySpeed!.end + 0.5, 0, 50)
  }
  function onSetVelStart(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureVel(m)
    m.initialVelocitySpeed!.start = clamp(v, 0, 50)
  }
  function onSetVelEnd(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureVel(m)
    m.initialVelocitySpeed!.end = clamp(v, 0, 50)
  }

  // ─── InitSize handlers ──────────────────────────────────────────────────

  function ensureSize(m: any) { if (!m.initialSize) m.initialSize = { start: 0.2, end: 0.4 } }
  function onDecSizeStart() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSize(m)
    m.initialSize!.start = clamp(m.initialSize!.start - 0.05, 0, 10)
  }
  function onIncSizeStart() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSize(m)
    m.initialSize!.start = clamp(m.initialSize!.start + 0.05, 0, 10)
  }
  function onDecSizeEnd() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSize(m)
    m.initialSize!.end = clamp(m.initialSize!.end - 0.05, 0, 10)
  }
  function onIncSizeEnd() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSize(m)
    m.initialSize!.end = clamp(m.initialSize!.end + 0.05, 0, 10)
  }
  function onSetSizeStart(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSize(m)
    m.initialSize!.start = clamp(v, 0, 10)
  }
  function onSetSizeEnd(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSize(m)
    m.initialSize!.end = clamp(v, 0, 10)
  }

  // ─── SizeOverTime handlers ──────────────────────────────────────────────

  function ensureSot(m: any) { if (!m.sizeOverTime) m.sizeOverTime = { start: 1.0, end: 0.0 } }
  function onDecSotStart() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSot(m)
    m.sizeOverTime!.start = clamp(m.sizeOverTime!.start - 0.1, 0, 5)
  }
  function onIncSotStart() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSot(m)
    m.sizeOverTime!.start = clamp(m.sizeOverTime!.start + 0.1, 0, 5)
  }
  function onDecSotEnd() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSot(m)
    m.sizeOverTime!.end = clamp(m.sizeOverTime!.end - 0.1, 0, 5)
  }
  function onIncSotEnd() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSot(m)
    m.sizeOverTime!.end = clamp(m.sizeOverTime!.end + 0.1, 0, 5)
  }
  function onSetSotStart(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSot(m)
    m.sizeOverTime!.start = clamp(v, 0, 5)
  }
  function onSetSotEnd(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSot(m)
    m.sizeOverTime!.end = clamp(v, 0, 5)
  }

  // ─── RotationOverTime handlers ──────────────────────────────────────────

  function ensureRot(m: any) { if (!m.rotationOverTime) m.rotationOverTime = { start: 0, end: 0 } }
  function onDecRotStart() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureRot(m)
    m.rotationOverTime!.start = clamp(m.rotationOverTime!.start - 5, -360, 360)
  }
  function onIncRotStart() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureRot(m)
    m.rotationOverTime!.start = clamp(m.rotationOverTime!.start + 5, -360, 360)
  }
  function onDecRotEnd() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureRot(m)
    m.rotationOverTime!.end = clamp(m.rotationOverTime!.end - 5, -360, 360)
  }
  function onIncRotEnd() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureRot(m)
    m.rotationOverTime!.end = clamp(m.rotationOverTime!.end + 5, -360, 360)
  }
  function onSetRotStart(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureRot(m)
    m.rotationOverTime!.start = clamp(v, -360, 360)
  }
  function onSetRotEnd(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureRot(m)
    m.rotationOverTime!.end = clamp(v, -360, 360)
  }

  // ─── Color handlers (hex + alpha) ─────────────────────────────────────

  const ent = entry.entity
  function icStartHex(hex: string) { setColorHex(ent, 'initialColor', 'start', hex) }
  function icEndHex(hex: string) { setColorHex(ent, 'initialColor', 'end', hex) }
  function cotStartHex(hex: string) { setColorHex(ent, 'colorOverTime', 'start', hex) }
  function cotEndHex(hex: string) { setColorHex(ent, 'colorOverTime', 'end', hex) }
  function icStartADec() { changeColorAlpha(ent, 'initialColor', 'start', -0.05) }
  function icStartAInc() { changeColorAlpha(ent, 'initialColor', 'start', 0.05) }
  function icStartASet(v: number) { setColorAlpha(ent, 'initialColor', 'start', v) }
  function icEndADec() { changeColorAlpha(ent, 'initialColor', 'end', -0.05) }
  function icEndAInc() { changeColorAlpha(ent, 'initialColor', 'end', 0.05) }
  function icEndASet(v: number) { setColorAlpha(ent, 'initialColor', 'end', v) }
  function cotStartADec() { changeColorAlpha(ent, 'colorOverTime', 'start', -0.05) }
  function cotStartAInc() { changeColorAlpha(ent, 'colorOverTime', 'start', 0.05) }
  function cotStartASet(v: number) { setColorAlpha(ent, 'colorOverTime', 'start', v) }
  function cotEndADec() { changeColorAlpha(ent, 'colorOverTime', 'end', -0.05) }
  function cotEndAInc() { changeColorAlpha(ent, 'colorOverTime', 'end', 0.05) }
  function cotEndASet(v: number) { setColorAlpha(ent, 'colorOverTime', 'end', v) }

  // ─── LimitVelocity handlers ─────────────────────────────────────────────

  function onToggleLimitVel() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return
    if (m.limitVelocity !== undefined && m.limitVelocity !== null) {
      m.limitVelocity = undefined
    } else {
      m.limitVelocity = { speed: 3, dampen: 1 }
    }
  }
  function onDecLimitSpeed() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.limitVelocity) return
    m.limitVelocity.speed = clamp(m.limitVelocity.speed - 0.5, 0, 50)
  }
  function onIncLimitSpeed() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.limitVelocity) return
    m.limitVelocity.speed = clamp(m.limitVelocity.speed + 0.5, 0, 50)
  }
  function onDecLimitDampen() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.limitVelocity) return
    m.limitVelocity.dampen = Math.round(clamp((m.limitVelocity.dampen ?? 1) - 0.05, 0, 1) * 100) / 100
  }
  function onIncLimitDampen() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.limitVelocity) return
    m.limitVelocity.dampen = Math.round(clamp((m.limitVelocity.dampen ?? 1) + 0.05, 0, 1) * 100) / 100
  }
  function onSetLimitSpeed(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.limitVelocity) return
    m.limitVelocity.speed = clamp(v, 0, 50)
  }
  function onSetLimitDampen(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.limitVelocity) return
    m.limitVelocity.dampen = Math.round(clamp(v, 0, 1) * 100) / 100
  }

  // ─── AdditionalForce handlers ───────────────────────────────────────────

  function onToggleAdditionalForce() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return
    if (m.additionalForce !== undefined && m.additionalForce !== null) {
      m.additionalForce = undefined
    } else {
      m.additionalForce = Vector3.create(0, 0, 0)
    }
  }
  function onDecForceX() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.additionalForce) return
    m.additionalForce.x = clamp(m.additionalForce.x - 0.5, -20, 20)
  }
  function onIncForceX() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.additionalForce) return
    m.additionalForce.x = clamp(m.additionalForce.x + 0.5, -20, 20)
  }
  function onDecForceY() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.additionalForce) return
    m.additionalForce.y = clamp(m.additionalForce.y - 0.5, -20, 20)
  }
  function onIncForceY() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.additionalForce) return
    m.additionalForce.y = clamp(m.additionalForce.y + 0.5, -20, 20)
  }
  function onDecForceZ() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.additionalForce) return
    m.additionalForce.z = clamp(m.additionalForce.z - 0.5, -20, 20)
  }
  function onIncForceZ() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.additionalForce) return
    m.additionalForce.z = clamp(m.additionalForce.z + 0.5, -20, 20)
  }
  function onSetForceX(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.additionalForce) return
    m.additionalForce.x = clamp(v, -20, 20)
  }
  function onSetForceY(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.additionalForce) return
    m.additionalForce.y = clamp(v, -20, 20)
  }
  function onSetForceZ(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || !m.additionalForce) return
    m.additionalForce.z = clamp(v, -20, 20)
  }

  // ─── SpriteSheet handlers ───────────────────────────────────────────────

  function onToggleSpriteSheet() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return
    if (m.spriteSheet !== undefined && m.spriteSheet !== null) {
      m.spriteSheet = undefined
    } else {
      m.spriteSheet = { tilesX: 2, tilesY: 2, startFrame: 0, endFrame: 3, framesPerSecond: 30 }
    }
  }
  function ensureSheet(m: any) {
    if (!m.spriteSheet) m.spriteSheet = { tilesX: 2, tilesY: 2, startFrame: 0, endFrame: 3, framesPerSecond: 30 }
  }
  function onDecTilesX() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.tilesX = clamp(m.spriteSheet!.tilesX - 1, 1, 16)
  }
  function onIncTilesX() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.tilesX = clamp(m.spriteSheet!.tilesX + 1, 1, 16)
  }
  function onDecTilesY() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.tilesY = clamp(m.spriteSheet!.tilesY - 1, 1, 32)
  }
  function onIncTilesY() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.tilesY = clamp(m.spriteSheet!.tilesY + 1, 1, 32)
  }
  function onDecStartFrame() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.startFrame = clamp(m.spriteSheet!.startFrame - 1, 0, 512)
  }
  function onIncStartFrame() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.startFrame = clamp(m.spriteSheet!.startFrame + 1, 0, 512)
  }
  function onDecEndFrame() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.endFrame = clamp(m.spriteSheet!.endFrame - 1, 0, 512)
  }
  function onIncEndFrame() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.endFrame = clamp(m.spriteSheet!.endFrame + 1, 0, 512)
  }
  function onDecFps() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.framesPerSecond = clamp((m.spriteSheet!.framesPerSecond ?? 30) - 1, 1, 60)
  }
  function onIncFps() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.framesPerSecond = clamp((m.spriteSheet!.framesPerSecond ?? 30) + 1, 1, 60)
  }
  function onSetTilesX(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.tilesX = clamp(Math.round(v), 1, 16)
  }
  function onSetTilesY(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.tilesY = clamp(Math.round(v), 1, 32)
  }
  function onSetStartFrame(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.startFrame = clamp(Math.round(v), 0, 512)
  }
  function onSetEndFrame(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.endFrame = clamp(Math.round(v), 0, 512)
  }
  function onSetFps(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.framesPerSecond = clamp(Math.round(v), 1, 60)
  }

  // ─── Shape handlers ──────────────────────────────────────────────────

  function onShapePoint() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.shape = ParticleSystem.Shape.Point()
  }
  function onShapeSphere() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.shape = ParticleSystem.Shape.Sphere({ radius: 1 })
  }
  function onShapeCone() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.shape = ParticleSystem.Shape.Cone({ angle: 25, radius: 1 })
  }
  function onShapeBox() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.shape = ParticleSystem.Shape.Box({ size: Vector3.create(1, 1, 1) })
  }

  function onDecSphereRadius() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'sphere') return
    const r = clamp((m.shape.sphere.radius ?? 1) - 0.1, 0.1, 20)
    m.shape = ParticleSystem.Shape.Sphere({ radius: r })
  }
  function onIncSphereRadius() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'sphere') return
    const r = clamp((m.shape.sphere.radius ?? 1) + 0.1, 0.1, 20)
    m.shape = ParticleSystem.Shape.Sphere({ radius: r })
  }
  function onDecConeAngle() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'cone') return
    const a = clamp((m.shape.cone.angle ?? 25) - 5, 1, 90)
    m.shape = ParticleSystem.Shape.Cone({ angle: a, radius: m.shape.cone.radius })
  }
  function onIncConeAngle() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'cone') return
    const a = clamp((m.shape.cone.angle ?? 25) + 5, 1, 90)
    m.shape = ParticleSystem.Shape.Cone({ angle: a, radius: m.shape.cone.radius })
  }
  function onDecConeRadius() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'cone') return
    const r = clamp((m.shape.cone.radius ?? 1) - 0.1, 0.1, 20)
    m.shape = ParticleSystem.Shape.Cone({ angle: m.shape.cone.angle, radius: r })
  }
  function onIncConeRadius() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'cone') return
    const r = clamp((m.shape.cone.radius ?? 1) + 0.1, 0.1, 20)
    m.shape = ParticleSystem.Shape.Cone({ angle: m.shape.cone.angle, radius: r })
  }
  function onDecBoxX() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'box') return
    const s = m.shape.box.size ?? Vector3.create(1, 1, 1)
    m.shape = ParticleSystem.Shape.Box({ size: Vector3.create(clamp(s.x - 0.5, 0.1, 50), s.y, s.z) })
  }
  function onIncBoxX() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'box') return
    const s = m.shape.box.size ?? Vector3.create(1, 1, 1)
    m.shape = ParticleSystem.Shape.Box({ size: Vector3.create(clamp(s.x + 0.5, 0.1, 50), s.y, s.z) })
  }
  function onDecBoxY() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'box') return
    const s = m.shape.box.size ?? Vector3.create(1, 1, 1)
    m.shape = ParticleSystem.Shape.Box({ size: Vector3.create(s.x, clamp(s.y - 0.5, 0.1, 50), s.z) })
  }
  function onIncBoxY() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'box') return
    const s = m.shape.box.size ?? Vector3.create(1, 1, 1)
    m.shape = ParticleSystem.Shape.Box({ size: Vector3.create(s.x, clamp(s.y + 0.5, 0.1, 50), s.z) })
  }
  function onDecBoxZ() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'box') return
    const s = m.shape.box.size ?? Vector3.create(1, 1, 1)
    m.shape = ParticleSystem.Shape.Box({ size: Vector3.create(s.x, s.y, clamp(s.z - 0.5, 0.1, 50)) })
  }
  function onIncBoxZ() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'box') return
    const s = m.shape.box.size ?? Vector3.create(1, 1, 1)
    m.shape = ParticleSystem.Shape.Box({ size: Vector3.create(s.x, s.y, clamp(s.z + 0.5, 0.1, 50)) })
  }
  function onSetSphereRadius(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'sphere') return
    m.shape = ParticleSystem.Shape.Sphere({ radius: clamp(v, 0.1, 20) })
  }
  function onSetConeAngle(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'cone') return
    m.shape = ParticleSystem.Shape.Cone({ angle: clamp(v, 1, 90), radius: m.shape.cone.radius })
  }
  function onSetConeRadius(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'cone') return
    m.shape = ParticleSystem.Shape.Cone({ angle: m.shape.cone.angle, radius: clamp(v, 0.1, 20) })
  }
  function onSetBoxX(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'box') return
    const s = m.shape.box.size ?? Vector3.create(1, 1, 1)
    m.shape = ParticleSystem.Shape.Box({ size: Vector3.create(clamp(v, 0.1, 50), s.y, s.z) })
  }
  function onSetBoxY(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'box') return
    const s = m.shape.box.size ?? Vector3.create(1, 1, 1)
    m.shape = ParticleSystem.Shape.Box({ size: Vector3.create(s.x, clamp(v, 0.1, 50), s.z) })
  }
  function onSetBoxZ(v: number) {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m || m.shape?.$case !== 'box') return
    const s = m.shape.box.size ?? Vector3.create(1, 1, 1)
    m.shape = ParticleSystem.Shape.Box({ size: Vector3.create(s.x, s.y, clamp(v, 0.1, 50)) })
  }

  // ─── Euler angle handlers ──────────────────────────────────────────────

  function setEuler(x: number, y: number, z: number) {
    const t = Transform.getMutableOrNull(entry.entity)
    if (t) t.rotation = Quaternion.fromEulerDegrees(x, y, z)
  }
  function onDecEulerX() { setEuler(eulerX - 5, eulerY, eulerZ) }
  function onIncEulerX() { setEuler(eulerX + 5, eulerY, eulerZ) }
  function onSetEulerX(v: number) { setEuler(v, eulerY, eulerZ) }
  function onDecEulerY() { setEuler(eulerX, eulerY - 5, eulerZ) }
  function onIncEulerY() { setEuler(eulerX, eulerY + 5, eulerZ) }
  function onSetEulerY(v: number) { setEuler(eulerX, v, eulerZ) }
  function onDecEulerZ() { setEuler(eulerX, eulerY, eulerZ - 5) }
  function onIncEulerZ() { setEuler(eulerX, eulerY, eulerZ + 5) }
  function onSetEulerZ(v: number) { setEuler(eulerX, eulerY, v) }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: scale * 12, right: scale * 12 },
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: scale * 620,
        maxHeight: scale * 1020,
        overflow: 'scroll',
        padding: { top: scale * 10, bottom: scale * 10, left: scale * 12, right: scale * 12 }
      }}
      uiBackground={{ color: panelBg }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', margin: { bottom: scale * 6 } }}>
          <Label
            value={entry.name}
            fontSize={scale * 15}
            uiTransform={{ margin: { right: scale * 8 } }}
          />
          <Button
            value={Date.now() - copiedAt < 2000 ? 'Copied!' : 'Copy'}
            fontSize={scale * 10}
            variant={Date.now() - copiedAt < 2000 ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 24 }}
            onMouseDown={onCopyToClipboard}
          />
        </UiEntity>
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Playback ─────────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <SectionLabel text="Playback" scale={scale} />
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: scale * 4 } }}>
          <Button value="Play" fontSize={scale * 11} variant="primary"
            uiTransform={{ height: scale * 24, margin: { right: scale * 4 } }} onMouseDown={onPlay} />
          <Button value="Pause" fontSize={scale * 11} variant="secondary"
            uiTransform={{ height: scale * 24, margin: { right: scale * 4 } }} onMouseDown={onPause} />
          <Button value="Stop" fontSize={scale * 11} variant="secondary"
            uiTransform={{ height: scale * 24, margin: { right: scale * 4 } }} onMouseDown={onStop} />
          <Button value="Restart" fontSize={scale * 11} variant="primary"
            uiTransform={{ height: scale * 24 }} onMouseDown={onRestart} />
        </UiEntity>
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Flags ────────────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <SectionLabel text="Flags" scale={scale} />
        <UiEntity uiTransform={{ flexDirection: 'row', flexWrap: 'wrap', margin: { bottom: scale * 4 } }}>
          <ToggleBtn label="Active" active={active} onToggle={onToggleActive} scale={scale} />
          <ToggleBtn label="Loop" active={loop} onToggle={onToggleLoop} scale={scale} />
          <ToggleBtn label="Prewarm" active={prewarm} onToggle={onTogglePrewarm} scale={scale} />
          <ToggleBtn label="Billboard" active={billboard} onToggle={onToggleBillboard} scale={scale} />
        </UiEntity>
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Simulation Space ─────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <SectionLabel text="Simulation Space" scale={scale} />
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: scale * 4 } }}>
          <Button value="Local" fontSize={scale * 11}
            variant={!simSpaceWorld ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 24, margin: { right: scale * 4 } }} onMouseDown={() => { if (simSpaceWorld) onToggleSimSpace() }} />
          <Button value="World" fontSize={scale * 11}
            variant={simSpaceWorld ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 24 }} onMouseDown={() => { if (!simSpaceWorld) onToggleSimSpace() }} />
        </UiEntity>
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Blend Mode ───────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <SectionLabel text="Blend Mode" scale={scale} />
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: scale * 4 } }}>
          <Button value="Alpha" fontSize={scale * 11}
            variant={blendMode === PBParticleSystem_BlendMode.PSB_ALPHA ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 24, margin: { right: scale * 4 } }} onMouseDown={onBlendAlpha} />
          <Button value="Additive" fontSize={scale * 11}
            variant={blendMode === PBParticleSystem_BlendMode.PSB_ADD ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 24, margin: { right: scale * 4 } }} onMouseDown={onBlendAdd} />
          <Button value="Multiply" fontSize={scale * 11}
            variant={blendMode === PBParticleSystem_BlendMode.PSB_MULTIPLY ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 24 }} onMouseDown={onBlendMultiply} />
        </UiEntity>
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Emitter Shape ────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: scale * 3 } }}>
          <SectionLabel text="Emitter Shape" scale={scale} />
          <ToggleBtn label="Shape Viz" active={vizVisible} onToggle={onToggleVizVisible} scale={scale} />
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', flexWrap: 'wrap', margin: { bottom: scale * 3 } }}>
          <Button value="Point" fontSize={scale * 10}
            variant={shapeCase === 'point' ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 24, margin: { right: scale * 4, bottom: scale * 2 } }} onMouseDown={onShapePoint} />
          <Button value="Sphere" fontSize={scale * 10}
            variant={shapeCase === 'sphere' ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 24, margin: { right: scale * 4, bottom: scale * 2 } }} onMouseDown={onShapeSphere} />
          <Button value="Cone" fontSize={scale * 10}
            variant={shapeCase === 'cone' ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 24, margin: { right: scale * 4, bottom: scale * 2 } }} onMouseDown={onShapeCone} />
          <Button value="Box" fontSize={scale * 10}
            variant={shapeCase === 'box' ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 24, margin: { right: scale * 4, bottom: scale * 2 } }} onMouseDown={onShapeBox} />
        </UiEntity>
        <UiEntity uiTransform={{ display: shapeCase === 'sphere' ? 'flex' : 'none', flexDirection: 'column' }}>
          <Row label="Radius" value={sphereRadius} onDec={onDecSphereRadius} onInc={onIncSphereRadius} onSet={onSetSphereRadius} scale={scale} />
        </UiEntity>
        <UiEntity uiTransform={{ display: shapeCase === 'cone' ? 'flex' : 'none', flexDirection: 'column' }}>
          <Row label="Angle" value={coneAngle} decimals={0} onDec={onDecConeAngle} onInc={onIncConeAngle} onSet={onSetConeAngle} scale={scale} />
          <Row label="Radius" value={coneRadius} onDec={onDecConeRadius} onInc={onIncConeRadius} onSet={onSetConeRadius} scale={scale} />
        </UiEntity>
        <UiEntity uiTransform={{ display: shapeCase === 'box' ? 'flex' : 'none', flexDirection: 'column' }}>
          <Row label="Size X" value={boxSizeX} onDec={onDecBoxX} onInc={onIncBoxX} onSet={onSetBoxX} scale={scale} />
          <Row label="Size Y" value={boxSizeY} onDec={onDecBoxY} onInc={onIncBoxY} onSet={onSetBoxY} scale={scale} />
          <Row label="Size Z" value={boxSizeZ} onDec={onDecBoxZ} onInc={onIncBoxZ} onSet={onSetBoxZ} scale={scale} />
        </UiEntity>
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Emission ─────────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <SectionLabel text="Emission" scale={scale} />
        <Row label="Rate (p/s)" value={rate} decimals={0} onDec={onDecRate} onInc={onIncRate} onSet={onSetRate} scale={scale} />
        <Row label="Lifetime (s)" value={lifetime} onDec={onDecLifetime} onInc={onIncLifetime} onSet={onSetLifetime} scale={scale} />
        <Row label="Max Particles" value={maxParticles} decimals={0} onDec={onDecMaxParticles} onInc={onIncMaxParticles} onSet={onSetMaxParticles} scale={scale} />
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Motion ───────────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <SectionLabel text="Motion" scale={scale} />
        <Row label="Gravity" value={gravity} onDec={onDecGravity} onInc={onIncGravity} onSet={onSetGravity} scale={scale} />
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Velocity ─────────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <SectionLabel text="Velocity" scale={scale} />
        <RangeRow label="Init Vel Speed" startVal={velStart} endVal={velEnd}
          onDecStart={onDecVelStart} onIncStart={onIncVelStart} onSetStart={onSetVelStart}
          onDecEnd={onDecVelEnd} onIncEnd={onIncVelEnd} onSetEnd={onSetVelEnd} scale={scale} />
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Size ─────────────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <SectionLabel text="Size" scale={scale} />
        <RangeRow label="Init Size" startVal={sizeStart} endVal={sizeEnd} decimals={2}
          onDecStart={onDecSizeStart} onIncStart={onIncSizeStart} onSetStart={onSetSizeStart}
          onDecEnd={onDecSizeEnd} onIncEnd={onIncSizeEnd} onSetEnd={onSetSizeEnd} scale={scale} />
        <RangeRow label="Size Over Time" startVal={sotStart} endVal={sotEnd}
          onDecStart={onDecSotStart} onIncStart={onIncSotStart} onSetStart={onSetSotStart}
          onDecEnd={onDecSotEnd} onIncEnd={onIncSotEnd} onSetEnd={onSetSotEnd} scale={scale} />
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Rotation ─────────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <SectionLabel text="Rotation" scale={scale} />
        <Row label="Euler X" value={eulerX} decimals={0} onDec={onDecEulerX} onInc={onIncEulerX} onSet={onSetEulerX} scale={scale} />
        <Row label="Euler Y" value={eulerY} decimals={0} onDec={onDecEulerY} onInc={onIncEulerY} onSet={onSetEulerY} scale={scale} />
        <Row label="Euler Z" value={eulerZ} decimals={0} onDec={onDecEulerZ} onInc={onIncEulerZ} onSet={onSetEulerZ} scale={scale} />
        <RangeRow label="Rot Over Time" startVal={rotStart} endVal={rotEnd} decimals={0}
          onDecStart={onDecRotStart} onIncStart={onIncRotStart} onSetStart={onSetRotStart}
          onDecEnd={onDecRotEnd} onIncEnd={onIncRotEnd} onSetEnd={onSetRotEnd} scale={scale} />
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Initial Color ────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <SectionLabel text="Initial Color" scale={scale} />
        <HexColorRow label="Start" color={icStart}
          onSetHex={icStartHex} onDecAlpha={icStartADec} onIncAlpha={icStartAInc} onSetAlpha={icStartASet} scale={scale} />
        <HexColorRow label="End" color={icEnd}
          onSetHex={icEndHex} onDecAlpha={icEndADec} onIncAlpha={icEndAInc} onSetAlpha={icEndASet} scale={scale} />
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Color Over Time ──────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <SectionLabel text="Color Over Time" scale={scale} />
        <HexColorRow label="Start" color={cotStart}
          onSetHex={cotStartHex} onDecAlpha={cotStartADec} onIncAlpha={cotStartAInc} onSetAlpha={cotStartASet} scale={scale} />
        <HexColorRow label="End" color={cotEnd}
          onSetHex={cotEndHex} onDecAlpha={cotEndADec} onIncAlpha={cotEndAInc} onSetAlpha={cotEndASet} scale={scale} />
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Limit Velocity ───────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: scale * 3 } }}>
          <SectionLabel text="Limit Velocity" scale={scale} />
          <Button value={hasLimitVel ? 'ON' : 'OFF'} fontSize={scale * 10}
            variant={hasLimitVel ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 22, margin: { left: scale * 6 } }} onMouseDown={onToggleLimitVel} />
        </UiEntity>
        <Row label="Max Speed" value={limitSpeed} onDec={onDecLimitSpeed} onInc={onIncLimitSpeed} onSet={onSetLimitSpeed} scale={scale} />
        <Row label="Dampen" value={limitDampen} decimals={2} onDec={onDecLimitDampen} onInc={onIncLimitDampen} onSet={onSetLimitDampen} scale={scale} />
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Additional Force ─────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: scale * 3 } }}>
          <SectionLabel text="Additional Force" scale={scale} />
          <Button value={hasAdditionalForce ? 'ON' : 'OFF'} fontSize={scale * 10}
            variant={hasAdditionalForce ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 22, margin: { left: scale * 6 } }} onMouseDown={onToggleAdditionalForce} />
        </UiEntity>
        <Row label="Force X" value={forceX} onDec={onDecForceX} onInc={onIncForceX} onSet={onSetForceX} scale={scale} />
        <Row label="Force Y" value={forceY} onDec={onDecForceY} onInc={onIncForceY} onSet={onSetForceY} scale={scale} />
        <Row label="Force Z" value={forceZ} onDec={onDecForceZ} onInc={onIncForceZ} onSet={onSetForceZ} scale={scale} />
        <Divider scale={scale} />
      </UiEntity>

      {/* ── Sprite Sheet ─────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: scale * 3 } }}>
          <SectionLabel text="Sprite Sheet" scale={scale} />
          <Button value={hasSpriteSheet ? 'ON' : 'OFF'} fontSize={scale * 10}
            variant={hasSpriteSheet ? 'primary' : 'secondary'}
            uiTransform={{ height: scale * 22, margin: { left: scale * 6 } }} onMouseDown={onToggleSpriteSheet} />
        </UiEntity>
        <Row label="Tiles X" value={sheetTilesX} decimals={0} onDec={onDecTilesX} onInc={onIncTilesX} onSet={onSetTilesX} scale={scale} />
        <Row label="Tiles Y" value={sheetTilesY} decimals={0} onDec={onDecTilesY} onInc={onIncTilesY} onSet={onSetTilesY} scale={scale} />
        <Row label="Start Frame" value={sheetStartFrame} decimals={0} onDec={onDecStartFrame} onInc={onIncStartFrame} onSet={onSetStartFrame} scale={scale} />
        <Row label="End Frame" value={sheetEndFrame} decimals={0} onDec={onDecEndFrame} onInc={onIncEndFrame} onSet={onSetEndFrame} scale={scale} />
        <Row label="FPS" value={sheetFps} decimals={0} onDec={onDecFps} onInc={onIncFps} onSet={onSetFps} scale={scale} />
      </UiEntity>

      {/* Bottom spacer */}
      <UiEntity uiTransform={{ height: scale * 10 }} />
    </UiEntity>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function setupUI(): void {
  ReactEcsRenderer.setUiRenderer(UI)
}
