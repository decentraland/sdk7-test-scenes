import { engine, Entity, UiCanvasInformation } from '@dcl/sdk/ecs'
import {
  ParticleSystem,
  PBParticleSystem_BlendMode,
  PBParticleSystem_PlaybackState
} from '@dcl/sdk/ecs'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { getCurrentPsEntry, PsEntry } from './index'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row(props: {
  label: string
  value: string
  onDec: () => void
  onInc: () => void
  scale: number
}): ReactEcs.JSX.Element {
  const { label, value, onDec, onInc, scale } = props
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
      <Label
        value={value}
        fontSize={scale * 10}
        uiTransform={{ width: scale * 50, margin: { right: scale * 2 } }}
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
  startVal: string
  endVal: string
  onDecStart: () => void
  onIncStart: () => void
  onDecEnd: () => void
  onIncEnd: () => void
  scale: number
}): ReactEcs.JSX.Element {
  const { label, startVal, endVal, onDecStart, onIncStart, onDecEnd, onIncEnd, scale } = props
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
      <Label
        value={startVal}
        fontSize={scale * 10}
        uiTransform={{ width: scale * 40, margin: { right: scale * 2 } }}
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
      <Label
        value={endVal}
        fontSize={scale * 10}
        uiTransform={{ width: scale * 40, margin: { right: scale * 2 } }}
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

function ColorChannelRow(props: {
  label: string
  r: number
  g: number
  b: number
  a: number
  onChangeR: (d: number) => void
  onChangeG: (d: number) => void
  onChangeB: (d: number) => void
  onChangeA: (d: number) => void
  scale: number
}): ReactEcs.JSX.Element {
  const { label, r, g, b, a, onChangeR, onChangeG, onChangeB, onChangeA, scale } = props
  const bw = scale * 20
  const bh = scale * 20
  const vw = scale * 30
  const fs = scale * 9
  const bf = scale * 10
  return (
    <UiEntity
      uiTransform={{
        flexDirection: 'row',
        alignItems: 'center',
        margin: { bottom: scale * 2 }
      }}
    >
      <Label value={label} fontSize={fs} uiTransform={{ width: scale * 50, margin: { right: scale * 2 } }} />

      <Label value="R" fontSize={fs} uiTransform={{ width: scale * 10 }} />
      <Button value="-" fontSize={bf} uiTransform={{ width: bw, height: bh }} onMouseDown={() => onChangeR(-0.05)} />
      <Label value={fmt(r, 2)} fontSize={fs} uiTransform={{ width: vw }} />
      <Button value="+" fontSize={bf} uiTransform={{ width: bw, height: bh, margin: { right: scale * 3 } }} onMouseDown={() => onChangeR(0.05)} />

      <Label value="G" fontSize={fs} uiTransform={{ width: scale * 10 }} />
      <Button value="-" fontSize={bf} uiTransform={{ width: bw, height: bh }} onMouseDown={() => onChangeG(-0.05)} />
      <Label value={fmt(g, 2)} fontSize={fs} uiTransform={{ width: vw }} />
      <Button value="+" fontSize={bf} uiTransform={{ width: bw, height: bh, margin: { right: scale * 3 } }} onMouseDown={() => onChangeG(0.05)} />

      <Label value="B" fontSize={fs} uiTransform={{ width: scale * 10 }} />
      <Button value="-" fontSize={bf} uiTransform={{ width: bw, height: bh }} onMouseDown={() => onChangeB(-0.05)} />
      <Label value={fmt(b, 2)} fontSize={fs} uiTransform={{ width: vw }} />
      <Button value="+" fontSize={bf} uiTransform={{ width: bw, height: bh, margin: { right: scale * 3 } }} onMouseDown={() => onChangeB(0.05)} />

      <Label value="A" fontSize={fs} uiTransform={{ width: scale * 10 }} />
      <Button value="-" fontSize={bf} uiTransform={{ width: bw, height: bh }} onMouseDown={() => onChangeA(-0.05)} />
      <Label value={fmt(a, 2)} fontSize={fs} uiTransform={{ width: vw }} />
      <Button value="+" fontSize={bf} uiTransform={{ width: bw, height: bh }} onMouseDown={() => onChangeA(0.05)} />
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

// ─── Color mutation helper ───────────────────────────────────────────────────

function changeColor(
  entity: Entity,
  field: 'initialColor' | 'colorOverTime',
  which: 'start' | 'end',
  channel: 'r' | 'g' | 'b' | 'a',
  delta: number
): void {
  const mutable = ParticleSystem.getMutableOrNull(entity)
  if (!mutable) return
  if (!mutable[field]) {
    mutable[field] = {
      start: Color4.create(1, 1, 1, 1),
      end: Color4.create(1, 1, 1, 1)
    }
  }
  const range = mutable[field]!
  const old = range[which] ?? Color4.create(1, 1, 1, 1)
  const nr = channel === 'r' ? clamp(old.r + delta, 0, 1) : old.r
  const ng = channel === 'g' ? clamp(old.g + delta, 0, 1) : old.g
  const nb = channel === 'b' ? clamp(old.b + delta, 0, 1) : old.b
  const na = channel === 'a' ? clamp(old.a + delta, 0, 1) : old.a
  range[which] = Color4.create(nr, ng, nb, na)
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

  const active = comp.active ?? true
  const loop = comp.loop ?? true
  const prewarm = comp.prewarm ?? false
  const billboard = comp.billboard ?? true
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
  const sheetCycles = comp.spriteSheet?.cyclesPerLifetime ?? 1

  const shapeCase = comp.shape?.$case ?? 'point'
  const sphereRadius = (comp.shape?.$case === 'sphere' ? comp.shape.sphere.radius : undefined) ?? 1
  const coneAngle = (comp.shape?.$case === 'cone' ? comp.shape.cone.angle : undefined) ?? 25
  const coneRadius = (comp.shape?.$case === 'cone' ? comp.shape.cone.radius : undefined) ?? 1
  const boxSizeX = (comp.shape?.$case === 'box' ? comp.shape.box.size?.x : undefined) ?? 1
  const boxSizeY = (comp.shape?.$case === 'box' ? comp.shape.box.size?.y : undefined) ?? 1
  const boxSizeZ = (comp.shape?.$case === 'box' ? comp.shape.box.size?.z : undefined) ?? 1

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
  function onDecLifetime() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.lifetime = clamp((m.lifetime ?? 2) - 0.5, 0.1, 30)
  }
  function onIncLifetime() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.lifetime = clamp((m.lifetime ?? 2) + 0.5, 0.1, 30)
  }
  function onDecMaxParticles() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.maxParticles = clamp((m.maxParticles ?? 100) - 25, 1, 2000)
  }
  function onIncMaxParticles() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (m) m.maxParticles = clamp((m.maxParticles ?? 100) + 25, 1, 2000)
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

  // ─── Color handlers (use shared helper) ─────────────────────────────────

  const ent = entry.entity
  function icStartR(d: number) { changeColor(ent, 'initialColor', 'start', 'r', d) }
  function icStartG(d: number) { changeColor(ent, 'initialColor', 'start', 'g', d) }
  function icStartB(d: number) { changeColor(ent, 'initialColor', 'start', 'b', d) }
  function icStartA(d: number) { changeColor(ent, 'initialColor', 'start', 'a', d) }
  function icEndR(d: number) { changeColor(ent, 'initialColor', 'end', 'r', d) }
  function icEndG(d: number) { changeColor(ent, 'initialColor', 'end', 'g', d) }
  function icEndB(d: number) { changeColor(ent, 'initialColor', 'end', 'b', d) }
  function icEndA(d: number) { changeColor(ent, 'initialColor', 'end', 'a', d) }

  function cotStartR(d: number) { changeColor(ent, 'colorOverTime', 'start', 'r', d) }
  function cotStartG(d: number) { changeColor(ent, 'colorOverTime', 'start', 'g', d) }
  function cotStartB(d: number) { changeColor(ent, 'colorOverTime', 'start', 'b', d) }
  function cotStartA(d: number) { changeColor(ent, 'colorOverTime', 'start', 'a', d) }
  function cotEndR(d: number) { changeColor(ent, 'colorOverTime', 'end', 'r', d) }
  function cotEndG(d: number) { changeColor(ent, 'colorOverTime', 'end', 'g', d) }
  function cotEndB(d: number) { changeColor(ent, 'colorOverTime', 'end', 'b', d) }
  function cotEndA(d: number) { changeColor(ent, 'colorOverTime', 'end', 'a', d) }

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

  // ─── SpriteSheet handlers ───────────────────────────────────────────────

  function onToggleSpriteSheet() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return
    if (m.spriteSheet !== undefined && m.spriteSheet !== null) {
      m.spriteSheet = undefined
    } else {
      m.spriteSheet = { tilesX: 2, tilesY: 2, startFrame: 0, endFrame: 3, cyclesPerLifetime: 1 }
    }
  }
  function ensureSheet(m: any) {
    if (!m.spriteSheet) m.spriteSheet = { tilesX: 2, tilesY: 2, startFrame: 0, endFrame: 3, cyclesPerLifetime: 1 }
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
  function onDecCycles() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.cyclesPerLifetime = clamp((m.spriteSheet!.cyclesPerLifetime ?? 1) - 1, 1, 20)
  }
  function onIncCycles() {
    const m = ParticleSystem.getMutableOrNull(entry.entity)
    if (!m) return; ensureSheet(m)
    m.spriteSheet!.cyclesPerLifetime = clamp((m.spriteSheet!.cyclesPerLifetime ?? 1) + 1, 1, 20)
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
      {/* Header */}
      <Label
        value={entry.name}
        fontSize={scale * 15}
        uiTransform={{ margin: { bottom: scale * 6 }, alignSelf: 'center' }}
      />

      <Divider scale={scale} />

      {/* ── Playback ─────────────────────────────────────────────────────── */}
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

      {/* ── Flags ────────────────────────────────────────────────────────── */}
      <SectionLabel text="Flags" scale={scale} />
      <UiEntity uiTransform={{ flexDirection: 'row', flexWrap: 'wrap', margin: { bottom: scale * 4 } }}>
        <ToggleBtn label="Active" active={active} onToggle={onToggleActive} scale={scale} />
        <ToggleBtn label="Loop" active={loop} onToggle={onToggleLoop} scale={scale} />
        <ToggleBtn label="Prewarm" active={prewarm} onToggle={onTogglePrewarm} scale={scale} />
        <ToggleBtn label="Billboard" active={billboard} onToggle={onToggleBillboard} scale={scale} />
      </UiEntity>

      <Divider scale={scale} />

      {/* ── Blend Mode ───────────────────────────────────────────────────── */}
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

      {/* ── Emitter Shape ────────────────────────────────────────────────── */}
      <SectionLabel text="Emitter Shape" scale={scale} />
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
      {/* Sphere params — always rendered, visibility toggled */}
      <UiEntity uiTransform={{ display: shapeCase === 'sphere' ? 'flex' : 'none', flexDirection: 'column' }}>
        <Row label="Radius" value={fmt(sphereRadius, 1)} onDec={onDecSphereRadius} onInc={onIncSphereRadius} scale={scale} />
      </UiEntity>
      {/* Cone params */}
      <UiEntity uiTransform={{ display: shapeCase === 'cone' ? 'flex' : 'none', flexDirection: 'column' }}>
        <Row label="Angle" value={fmt(coneAngle, 0)} onDec={onDecConeAngle} onInc={onIncConeAngle} scale={scale} />
        <Row label="Radius" value={fmt(coneRadius, 1)} onDec={onDecConeRadius} onInc={onIncConeRadius} scale={scale} />
      </UiEntity>
      {/* Box params */}
      <UiEntity uiTransform={{ display: shapeCase === 'box' ? 'flex' : 'none', flexDirection: 'column' }}>
        <Row label="Size X" value={fmt(boxSizeX, 1)} onDec={onDecBoxX} onInc={onIncBoxX} scale={scale} />
        <Row label="Size Y" value={fmt(boxSizeY, 1)} onDec={onDecBoxY} onInc={onIncBoxY} scale={scale} />
        <Row label="Size Z" value={fmt(boxSizeZ, 1)} onDec={onDecBoxZ} onInc={onIncBoxZ} scale={scale} />
      </UiEntity>

      <Divider scale={scale} />

      {/* ── Emission ─────────────────────────────────────────────────────── */}
      <SectionLabel text="Emission" scale={scale} />
      <Row label="Rate (p/s)" value={fmt(rate, 0)} onDec={onDecRate} onInc={onIncRate} scale={scale} />
      <Row label="Lifetime (s)" value={fmt(lifetime)} onDec={onDecLifetime} onInc={onIncLifetime} scale={scale} />
      <Row label="Max Particles" value={fmt(maxParticles, 0)} onDec={onDecMaxParticles} onInc={onIncMaxParticles} scale={scale} />

      <Divider scale={scale} />

      {/* ── Motion ───────────────────────────────────────────────────────── */}
      <SectionLabel text="Motion" scale={scale} />
      <Row label="Gravity" value={fmt(gravity)} onDec={onDecGravity} onInc={onIncGravity} scale={scale} />

      <Divider scale={scale} />

      {/* ── Velocity ─────────────────────────────────────────────────────── */}
      <SectionLabel text="Velocity" scale={scale} />
      <RangeRow label="Init Vel Speed" startVal={fmt(velStart)} endVal={fmt(velEnd)}
        onDecStart={onDecVelStart} onIncStart={onIncVelStart}
        onDecEnd={onDecVelEnd} onIncEnd={onIncVelEnd} scale={scale} />

      <Divider scale={scale} />

      {/* ── Size ─────────────────────────────────────────────────────────── */}
      <SectionLabel text="Size" scale={scale} />
      <RangeRow label="Init Size" startVal={fmt(sizeStart, 2)} endVal={fmt(sizeEnd, 2)}
        onDecStart={onDecSizeStart} onIncStart={onIncSizeStart}
        onDecEnd={onDecSizeEnd} onIncEnd={onIncSizeEnd} scale={scale} />
      <RangeRow label="Size Over Time" startVal={fmt(sotStart)} endVal={fmt(sotEnd)}
        onDecStart={onDecSotStart} onIncStart={onIncSotStart}
        onDecEnd={onDecSotEnd} onIncEnd={onIncSotEnd} scale={scale} />

      <Divider scale={scale} />

      {/* ── Rotation ─────────────────────────────────────────────────────── */}
      <SectionLabel text="Rotation" scale={scale} />
      <RangeRow label="Rot Over Time" startVal={fmt(rotStart, 0)} endVal={fmt(rotEnd, 0)}
        onDecStart={onDecRotStart} onIncStart={onIncRotStart}
        onDecEnd={onDecRotEnd} onIncEnd={onIncRotEnd} scale={scale} />

      <Divider scale={scale} />

      {/* ── Initial Color ────────────────────────────────────────────────── */}
      <SectionLabel text="Initial Color" scale={scale} />
      <ColorChannelRow label="Start" r={icStart.r} g={icStart.g} b={icStart.b} a={icStart.a}
        onChangeR={icStartR} onChangeG={icStartG} onChangeB={icStartB} onChangeA={icStartA} scale={scale} />
      <ColorChannelRow label="End" r={icEnd.r} g={icEnd.g} b={icEnd.b} a={icEnd.a}
        onChangeR={icEndR} onChangeG={icEndG} onChangeB={icEndB} onChangeA={icEndA} scale={scale} />

      <Divider scale={scale} />

      {/* ── Color Over Time ──────────────────────────────────────────────── */}
      <SectionLabel text="Color Over Time" scale={scale} />
      <ColorChannelRow label="Start" r={cotStart.r} g={cotStart.g} b={cotStart.b} a={cotStart.a}
        onChangeR={cotStartR} onChangeG={cotStartG} onChangeB={cotStartB} onChangeA={cotStartA} scale={scale} />
      <ColorChannelRow label="End" r={cotEnd.r} g={cotEnd.g} b={cotEnd.b} a={cotEnd.a}
        onChangeR={cotEndR} onChangeG={cotEndG} onChangeB={cotEndB} onChangeA={cotEndA} scale={scale} />

      <Divider scale={scale} />

      {/* ── Limit Velocity ───────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: scale * 3 } }}>
        <SectionLabel text="Limit Velocity" scale={scale} />
        <Button value={hasLimitVel ? 'ON' : 'OFF'} fontSize={scale * 10}
          variant={hasLimitVel ? 'primary' : 'secondary'}
          uiTransform={{ height: scale * 22, margin: { left: scale * 6 } }} onMouseDown={onToggleLimitVel} />
      </UiEntity>
      <Row label="Max Speed" value={fmt(limitSpeed)} onDec={onDecLimitSpeed} onInc={onIncLimitSpeed} scale={scale} />
      <Row label="Dampen" value={fmt(limitDampen, 2)} onDec={onDecLimitDampen} onInc={onIncLimitDampen} scale={scale} />

      <Divider scale={scale} />

      {/* ── Additional Force ─────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: scale * 3 } }}>
        <SectionLabel text="Additional Force" scale={scale} />
        <Button value={hasAdditionalForce ? 'ON' : 'OFF'} fontSize={scale * 10}
          variant={hasAdditionalForce ? 'primary' : 'secondary'}
          uiTransform={{ height: scale * 22, margin: { left: scale * 6 } }} onMouseDown={onToggleAdditionalForce} />
      </UiEntity>
      <Row label="Force X" value={fmt(forceX)} onDec={onDecForceX} onInc={onIncForceX} scale={scale} />
      <Row label="Force Y" value={fmt(forceY)} onDec={onDecForceY} onInc={onIncForceY} scale={scale} />
      <Row label="Force Z" value={fmt(forceZ)} onDec={onDecForceZ} onInc={onIncForceZ} scale={scale} />

      <Divider scale={scale} />

      {/* ── Sprite Sheet ─────────────────────────────────────────────────── */}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: scale * 3 } }}>
        <SectionLabel text="Sprite Sheet" scale={scale} />
        <Button value={hasSpriteSheet ? 'ON' : 'OFF'} fontSize={scale * 10}
          variant={hasSpriteSheet ? 'primary' : 'secondary'}
          uiTransform={{ height: scale * 22, margin: { left: scale * 6 } }} onMouseDown={onToggleSpriteSheet} />
      </UiEntity>
      <Row label="Tiles X" value={fmt(sheetTilesX, 0)} onDec={onDecTilesX} onInc={onIncTilesX} scale={scale} />
      <Row label="Tiles Y" value={fmt(sheetTilesY, 0)} onDec={onDecTilesY} onInc={onIncTilesY} scale={scale} />
      <Row label="Start Frame" value={fmt(sheetStartFrame, 0)} onDec={onDecStartFrame} onInc={onIncStartFrame} scale={scale} />
      <Row label="End Frame" value={fmt(sheetEndFrame, 0)} onDec={onDecEndFrame} onInc={onIncEndFrame} scale={scale} />
      <Row label="Cycles/Life" value={fmt(sheetCycles, 0)} onDec={onDecCycles} onInc={onIncCycles} scale={scale} />
    </UiEntity>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function setupUI(): void {
  ReactEcsRenderer.setUiRenderer(UI)
}
