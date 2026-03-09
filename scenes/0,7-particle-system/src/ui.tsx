import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import {
  ParticleSystem,
  PBParticleSystem_BlendMode,
  PBParticleSystem_PlaybackState
} from '@dcl/sdk/ecs'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { getCurrentPsEntry, PsEntry } from './index'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNum(num: number, decimals: number = 1): string {
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
        margin: { bottom: scale * 3 }
      }}
    >
      <Label
        value={label}
        fontSize={scale * 11}
        uiTransform={{ width: scale * 160, margin: { right: scale * 6 } }}
      />
      <Button
        value="-"
        fontSize={scale * 12}
        uiTransform={{ width: scale * 28, height: scale * 24, margin: { right: scale * 3 } }}
        onMouseDown={onDec}
      />
      <Label
        value={value}
        fontSize={scale * 11}
        uiTransform={{ width: scale * 60, margin: { right: scale * 3 } }}
      />
      <Button
        value="+"
        fontSize={scale * 12}
        uiTransform={{ width: scale * 28, height: scale * 24 }}
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
        margin: { bottom: scale * 3 }
      }}
    >
      <Label
        value={label}
        fontSize={scale * 11}
        uiTransform={{ width: scale * 140, margin: { right: scale * 4 } }}
      />
      <Button
        value="-"
        fontSize={scale * 12}
        uiTransform={{ width: scale * 28, height: scale * 24, margin: { right: scale * 2 } }}
        onMouseDown={onDecStart}
      />
      <Label
        value={startVal}
        fontSize={scale * 11}
        uiTransform={{ width: scale * 46, margin: { right: scale * 2 } }}
      />
      <Button
        value="+"
        fontSize={scale * 12}
        uiTransform={{ width: scale * 28, height: scale * 24, margin: { right: scale * 6 } }}
        onMouseDown={onIncStart}
      />
      <Label
        value="→"
        fontSize={scale * 11}
        uiTransform={{ width: scale * 16, margin: { right: scale * 6 } }}
      />
      <Button
        value="-"
        fontSize={scale * 12}
        uiTransform={{ width: scale * 28, height: scale * 24, margin: { right: scale * 2 } }}
        onMouseDown={onDecEnd}
      />
      <Label
        value={endVal}
        fontSize={scale * 11}
        uiTransform={{ width: scale * 46, margin: { right: scale * 2 } }}
      />
      <Button
        value="+"
        fontSize={scale * 12}
        uiTransform={{ width: scale * 28, height: scale * 24 }}
        onMouseDown={onIncEnd}
      />
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
      fontSize={scale * 11}
      variant={active ? 'primary' : 'secondary'}
      uiTransform={{ height: scale * 26, margin: { right: scale * 4, bottom: scale * 3 } }}
      onMouseDown={onToggle}
    />
  )
}

function Divider(props: { scale: number }): ReactEcs.JSX.Element {
  return (
    <Label
      value="──────────────────────────────"
      fontSize={props.scale * 9}
      uiTransform={{ margin: { top: props.scale * 2, bottom: props.scale * 2 } }}
    />
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

function UI(): ReactEcs.JSX.Element {
  const scale = getScale()
  const maybeEntry = getCurrentPsEntry()

  const panelBg = Color4.create(0.04, 0.05, 0.12, 0.92)

  if (!maybeEntry) {
    return (
      <UiEntity uiTransform={{ display: 'none' }} />
    )
  }

  // Capture as non-optional so closures below can use it safely
  const entry: PsEntry = maybeEntry

  const comp = ParticleSystem.getMutableOrNull(entry.entity)
  if (!comp) {
    return (
      <UiEntity uiTransform={{ display: 'none' }} />
    )
  }

  // Resolved values with defaults
  const active = comp.active ?? true
  const loop = comp.loop ?? true
  const prewarm = comp.prewarm ?? false
  const billboard = comp.billboard ?? true
  const rate = comp.rate ?? 20
  const lifetime = comp.lifetime ?? 2
  const maxParticles = comp.maxParticles ?? 100
  const gravity = comp.gravity ?? 0
  const velStart = comp.initialVelocitySpeed?.start ?? 1
  const velEnd = comp.initialVelocitySpeed?.end ?? 2
  const sizeStart = comp.initialSize?.start ?? 0.2
  const sizeEnd = comp.initialSize?.end ?? 0.4
  const sotStart = comp.sizeOverTime?.start ?? 1.0
  const sotEnd = comp.sizeOverTime?.end ?? 0.0
  const blendMode = comp.blendMode ?? PBParticleSystem_BlendMode.PSB_ALPHA
  const hasLimitVel = comp.limitVelocity !== undefined && comp.limitVelocity !== null
  const limitSpeed = comp.limitVelocity?.speed ?? 3
  const limitDampen = comp.limitVelocity?.dampen ?? 1
  const hasAdditionalForce = comp.additionalForce !== undefined && comp.additionalForce !== null
  const forceX = comp.additionalForce?.x ?? 0
  const forceY = comp.additionalForce?.y ?? 0
  const forceZ = comp.additionalForce?.z ?? 0

  // ─── Playback handlers ────────────────────────────────────────────────────

  function onPlay() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.playbackState = PBParticleSystem_PlaybackState.PS_PLAYING
  }

  function onPause() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.playbackState = PBParticleSystem_PlaybackState.PS_PAUSED
  }

  function onStop() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.playbackState = PBParticleSystem_PlaybackState.PS_STOPPED
  }

  function onRestart() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.restartCount = (mutable.restartCount ?? 0) + 1
  }

  // ─── Toggle handlers ──────────────────────────────────────────────────────

  function onToggleActive() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.active = !(mutable.active ?? true)
  }

  function onToggleLoop() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.loop = !(mutable.loop ?? true)
  }

  function onTogglePrewarm() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.prewarm = !(mutable.prewarm ?? false)
  }

  function onToggleBillboard() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.billboard = !(mutable.billboard ?? true)
  }

  // ─── Blend mode handlers ──────────────────────────────────────────────────

  function onBlendAlpha() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.blendMode = PBParticleSystem_BlendMode.PSB_ALPHA
  }

  function onBlendAdd() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.blendMode = PBParticleSystem_BlendMode.PSB_ADD
  }

  function onBlendMultiply() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.blendMode = PBParticleSystem_BlendMode.PSB_MULTIPLY
  }

  // ─── Emission handlers ────────────────────────────────────────────────────

  function onDecRate() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.rate = clamp((mutable.rate ?? 20) - 5, 0, 300)
  }
  function onIncRate() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.rate = clamp((mutable.rate ?? 20) + 5, 0, 300)
  }
  function onDecLifetime() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.lifetime = clamp((mutable.lifetime ?? 2) - 0.5, 0.1, 30)
  }
  function onIncLifetime() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.lifetime = clamp((mutable.lifetime ?? 2) + 0.5, 0.1, 30)
  }
  function onDecMaxParticles() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.maxParticles = clamp((mutable.maxParticles ?? 100) - 25, 1, 2000)
  }
  function onIncMaxParticles() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.maxParticles = clamp((mutable.maxParticles ?? 100) + 25, 1, 2000)
  }

  // ─── Motion handlers ──────────────────────────────────────────────────────

  function onDecGravity() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.gravity = clamp((mutable.gravity ?? 0) - 0.5, -20, 20)
  }
  function onIncGravity() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (mutable) mutable.gravity = clamp((mutable.gravity ?? 0) + 0.5, -20, 20)
  }

  // ─── Velocity handlers ────────────────────────────────────────────────────

  function onDecVelStart() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (!mutable.initialVelocitySpeed) mutable.initialVelocitySpeed = { start: 1, end: 2 }
    mutable.initialVelocitySpeed.start = clamp(mutable.initialVelocitySpeed.start - 0.5, 0, 50)
  }
  function onIncVelStart() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (!mutable.initialVelocitySpeed) mutable.initialVelocitySpeed = { start: 1, end: 2 }
    mutable.initialVelocitySpeed.start = clamp(mutable.initialVelocitySpeed.start + 0.5, 0, 50)
  }
  function onDecVelEnd() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (!mutable.initialVelocitySpeed) mutable.initialVelocitySpeed = { start: 1, end: 2 }
    mutable.initialVelocitySpeed.end = clamp(mutable.initialVelocitySpeed.end - 0.5, 0, 50)
  }
  function onIncVelEnd() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (!mutable.initialVelocitySpeed) mutable.initialVelocitySpeed = { start: 1, end: 2 }
    mutable.initialVelocitySpeed.end = clamp(mutable.initialVelocitySpeed.end + 0.5, 0, 50)
  }

  // ─── InitSize handlers ────────────────────────────────────────────────────

  function onDecSizeStart() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (!mutable.initialSize) mutable.initialSize = { start: 0.2, end: 0.4 }
    mutable.initialSize.start = clamp(mutable.initialSize.start - 0.05, 0, 10)
  }
  function onIncSizeStart() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (!mutable.initialSize) mutable.initialSize = { start: 0.2, end: 0.4 }
    mutable.initialSize.start = clamp(mutable.initialSize.start + 0.05, 0, 10)
  }
  function onDecSizeEnd() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (!mutable.initialSize) mutable.initialSize = { start: 0.2, end: 0.4 }
    mutable.initialSize.end = clamp(mutable.initialSize.end - 0.05, 0, 10)
  }
  function onIncSizeEnd() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (!mutable.initialSize) mutable.initialSize = { start: 0.2, end: 0.4 }
    mutable.initialSize.end = clamp(mutable.initialSize.end + 0.05, 0, 10)
  }

  // ─── SizeOverTime handlers ────────────────────────────────────────────────

  function onDecSotStart() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (!mutable.sizeOverTime) mutable.sizeOverTime = { start: 1.0, end: 0.0 }
    mutable.sizeOverTime.start = clamp(mutable.sizeOverTime.start - 0.1, 0, 5)
  }
  function onIncSotStart() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (!mutable.sizeOverTime) mutable.sizeOverTime = { start: 1.0, end: 0.0 }
    mutable.sizeOverTime.start = clamp(mutable.sizeOverTime.start + 0.1, 0, 5)
  }
  function onDecSotEnd() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (!mutable.sizeOverTime) mutable.sizeOverTime = { start: 1.0, end: 0.0 }
    mutable.sizeOverTime.end = clamp(mutable.sizeOverTime.end - 0.1, 0, 5)
  }
  function onIncSotEnd() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (!mutable.sizeOverTime) mutable.sizeOverTime = { start: 1.0, end: 0.0 }
    mutable.sizeOverTime.end = clamp(mutable.sizeOverTime.end + 0.1, 0, 5)
  }

  // ─── LimitVelocity handlers ───────────────────────────────────────────────

  function onToggleLimitVel() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (mutable.limitVelocity !== undefined && mutable.limitVelocity !== null) {
      mutable.limitVelocity = undefined
    } else {
      mutable.limitVelocity = { speed: 3, dampen: 1 }
    }
  }

  function onDecLimitSpeed() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable || !mutable.limitVelocity) return
    mutable.limitVelocity.speed = clamp(mutable.limitVelocity.speed - 0.5, 0, 50)
  }
  function onIncLimitSpeed() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable || !mutable.limitVelocity) return
    mutable.limitVelocity.speed = clamp(mutable.limitVelocity.speed + 0.5, 0, 50)
  }
  function onDecLimitDampen() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable || !mutable.limitVelocity) return
    const newVal = clamp((mutable.limitVelocity.dampen ?? 1) - 0.05, 0, 1)
    mutable.limitVelocity.dampen = Math.round(newVal * 100) / 100
  }
  function onIncLimitDampen() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable || !mutable.limitVelocity) return
    const newVal = clamp((mutable.limitVelocity.dampen ?? 1) + 0.05, 0, 1)
    mutable.limitVelocity.dampen = Math.round(newVal * 100) / 100
  }

  // ─── AdditionalForce handlers ─────────────────────────────────────────────

  function onToggleAdditionalForce() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable) return
    if (mutable.additionalForce !== undefined && mutable.additionalForce !== null) {
      mutable.additionalForce = undefined
    } else {
      mutable.additionalForce = Vector3.create(0, 0, 0)
    }
  }

  function onDecForceX() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable || !mutable.additionalForce) return
    mutable.additionalForce.x = clamp(mutable.additionalForce.x - 0.5, -20, 20)
  }
  function onIncForceX() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable || !mutable.additionalForce) return
    mutable.additionalForce.x = clamp(mutable.additionalForce.x + 0.5, -20, 20)
  }
  function onDecForceY() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable || !mutable.additionalForce) return
    mutable.additionalForce.y = clamp(mutable.additionalForce.y - 0.5, -20, 20)
  }
  function onIncForceY() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable || !mutable.additionalForce) return
    mutable.additionalForce.y = clamp(mutable.additionalForce.y + 0.5, -20, 20)
  }
  function onDecForceZ() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable || !mutable.additionalForce) return
    mutable.additionalForce.z = clamp(mutable.additionalForce.z - 0.5, -20, 20)
  }
  function onIncForceZ() {
    const mutable = ParticleSystem.getMutableOrNull(entry.entity)
    if (!mutable || !mutable.additionalForce) return
    mutable.additionalForce.z = clamp(mutable.additionalForce.z + 0.5, -20, 20)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: scale * 16, right: scale * 16 },
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: scale * 580,
        padding: { top: scale * 12, bottom: scale * 12, left: scale * 14, right: scale * 14 }
      }}
      uiBackground={{ color: panelBg }}
    >
      {/* Header */}
      <Label
        value={entry.name}
        fontSize={scale * 16}
        uiTransform={{ margin: { bottom: scale * 8 }, alignSelf: 'center' }}
      />

      <Divider scale={scale} />

      {/* Playback */}
      <Label value="Playback" fontSize={scale * 12} uiTransform={{ margin: { bottom: scale * 4 } }} />
      <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: scale * 6 } }}>
        <Button
          value="Play"
          fontSize={scale * 12}
          variant="primary"
          uiTransform={{ height: scale * 26, margin: { right: scale * 4 } }}
          onMouseDown={onPlay}
        />
        <Button
          value="Pause"
          fontSize={scale * 12}
          variant="secondary"
          uiTransform={{ height: scale * 26, margin: { right: scale * 4 } }}
          onMouseDown={onPause}
        />
        <Button
          value="Stop"
          fontSize={scale * 12}
          variant="secondary"
          uiTransform={{ height: scale * 26, margin: { right: scale * 4 } }}
          onMouseDown={onStop}
        />
        <Button
          value="Restart"
          fontSize={scale * 12}
          variant="primary"
          uiTransform={{ height: scale * 26 }}
          onMouseDown={onRestart}
        />
      </UiEntity>

      <Divider scale={scale} />

      {/* Flags */}
      <Label value="Flags" fontSize={scale * 12} uiTransform={{ margin: { bottom: scale * 4 } }} />
      <UiEntity uiTransform={{ flexDirection: 'row', flexWrap: 'wrap', margin: { bottom: scale * 6 } }}>
        <ToggleBtn label="Active" active={active} onToggle={onToggleActive} scale={scale} />
        <ToggleBtn label="Loop" active={loop} onToggle={onToggleLoop} scale={scale} />
        <ToggleBtn label="Prewarm" active={prewarm} onToggle={onTogglePrewarm} scale={scale} />
        <ToggleBtn label="Billboard" active={billboard} onToggle={onToggleBillboard} scale={scale} />
      </UiEntity>

      <Divider scale={scale} />

      {/* Blend Mode */}
      <Label value="Blend Mode" fontSize={scale * 12} uiTransform={{ margin: { bottom: scale * 4 } }} />
      <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: scale * 6 } }}>
        <Button
          value="Alpha"
          fontSize={scale * 12}
          variant={blendMode === PBParticleSystem_BlendMode.PSB_ALPHA ? 'primary' : 'secondary'}
          uiTransform={{ height: scale * 26, margin: { right: scale * 4 } }}
          onMouseDown={onBlendAlpha}
        />
        <Button
          value="Additive"
          fontSize={scale * 12}
          variant={blendMode === PBParticleSystem_BlendMode.PSB_ADD ? 'primary' : 'secondary'}
          uiTransform={{ height: scale * 26, margin: { right: scale * 4 } }}
          onMouseDown={onBlendAdd}
        />
        <Button
          value="Multiply"
          fontSize={scale * 12}
          variant={blendMode === PBParticleSystem_BlendMode.PSB_MULTIPLY ? 'primary' : 'secondary'}
          uiTransform={{ height: scale * 26 }}
          onMouseDown={onBlendMultiply}
        />
      </UiEntity>

      <Divider scale={scale} />

      {/* Emission */}
      <Label value="Emission" fontSize={scale * 12} uiTransform={{ margin: { bottom: scale * 4 } }} />
      <Row label="Rate (particles/s)" value={formatNum(rate, 0)} onDec={onDecRate} onInc={onIncRate} scale={scale} />
      <Row label="Lifetime (s)" value={formatNum(lifetime)} onDec={onDecLifetime} onInc={onIncLifetime} scale={scale} />
      <Row label="Max Particles" value={formatNum(maxParticles, 0)} onDec={onDecMaxParticles} onInc={onIncMaxParticles} scale={scale} />

      <Divider scale={scale} />

      {/* Motion */}
      <Label value="Motion" fontSize={scale * 12} uiTransform={{ margin: { bottom: scale * 4 } }} />
      <Row label="Gravity" value={formatNum(gravity)} onDec={onDecGravity} onInc={onIncGravity} scale={scale} />

      <Divider scale={scale} />

      {/* Velocity & Size */}
      <Label value="Velocity & Size" fontSize={scale * 12} uiTransform={{ margin: { bottom: scale * 4 } }} />
      <RangeRow
        label="Init Vel Speed"
        startVal={formatNum(velStart)}
        endVal={formatNum(velEnd)}
        onDecStart={onDecVelStart}
        onIncStart={onIncVelStart}
        onDecEnd={onDecVelEnd}
        onIncEnd={onIncVelEnd}
        scale={scale}
      />
      <RangeRow
        label="Init Size"
        startVal={formatNum(sizeStart, 2)}
        endVal={formatNum(sizeEnd, 2)}
        onDecStart={onDecSizeStart}
        onIncStart={onIncSizeStart}
        onDecEnd={onDecSizeEnd}
        onIncEnd={onIncSizeEnd}
        scale={scale}
      />
      <RangeRow
        label="Size Over Time"
        startVal={formatNum(sotStart)}
        endVal={formatNum(sotEnd)}
        onDecStart={onDecSotStart}
        onIncStart={onIncSotStart}
        onDecEnd={onDecSotEnd}
        onIncEnd={onIncSotEnd}
        scale={scale}
      />

      <Divider scale={scale} />

      {/* Limit Velocity */}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: scale * 4 } }}>
        <Label value="Limit Velocity" fontSize={scale * 12} uiTransform={{ margin: { right: scale * 8 } }} />
        <Button
          value={hasLimitVel ? 'Limit Vel: ON' : 'Limit Vel: OFF'}
          fontSize={scale * 11}
          variant={hasLimitVel ? 'primary' : 'secondary'}
          uiTransform={{ height: scale * 26 }}
          onMouseDown={onToggleLimitVel}
        />
      </UiEntity>
      {hasLimitVel && (
        <UiEntity uiTransform={{ flexDirection: 'column', margin: { bottom: scale * 4 } }}>
          <Row label="Max Speed" value={formatNum(limitSpeed)} onDec={onDecLimitSpeed} onInc={onIncLimitSpeed} scale={scale} />
          <Row label="Dampen" value={formatNum(limitDampen, 2)} onDec={onDecLimitDampen} onInc={onIncLimitDampen} scale={scale} />
        </UiEntity>
      )}

      <Divider scale={scale} />

      {/* Additional Force */}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: scale * 4 } }}>
        <Label value="Additional Force" fontSize={scale * 12} uiTransform={{ margin: { right: scale * 8 } }} />
        <Button
          value={hasAdditionalForce ? 'Force: ON' : 'Force: OFF'}
          fontSize={scale * 11}
          variant={hasAdditionalForce ? 'primary' : 'secondary'}
          uiTransform={{ height: scale * 26 }}
          onMouseDown={onToggleAdditionalForce}
        />
      </UiEntity>
      {hasAdditionalForce && (
        <UiEntity uiTransform={{ flexDirection: 'column', margin: { bottom: scale * 4 } }}>
          <Row label="Force X" value={formatNum(forceX)} onDec={onDecForceX} onInc={onIncForceX} scale={scale} />
          <Row label="Force Y" value={formatNum(forceY)} onDec={onDecForceY} onInc={onIncForceY} scale={scale} />
          <Row label="Force Z" value={formatNum(forceZ)} onDec={onDecForceZ} onInc={onIncForceZ} scale={scale} />
        </UiEntity>
      )}
    </UiEntity>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function setupUI(): void {
  ReactEcsRenderer.setUiRenderer(UI)
}
