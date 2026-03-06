import { engine } from '@dcl/sdk/ecs'
import {
  ParticleSystem,
  PBParticleSystem_PlaybackState
} from '@dcl/sdk/ecs'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { controlEntity } from './index'

function getControlPS() {
  return ParticleSystem.getMutableOrNull(controlEntity)
}

function onPlay() {
  const ps = getControlPS()
  if (ps) ps.playbackState = PBParticleSystem_PlaybackState.PS_PLAYING
}

function onPause() {
  const ps = getControlPS()
  if (ps) ps.playbackState = PBParticleSystem_PlaybackState.PS_PAUSED
}

function onStop() {
  const ps = getControlPS()
  if (ps) ps.playbackState = PBParticleSystem_PlaybackState.PS_STOPPED
}

function onRestart() {
  const ps = getControlPS()
  if (ps) ps.restartCount = (ps.restartCount ?? 0) + 1
}

function UI() {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { right: 16, bottom: 16 },
        flexDirection: 'column',
        width: 160,
        alignItems: 'center'
      }}
    >
      <Label
        value="ParticleSystem Controls"
        fontSize={14}
        uiTransform={{ margin: { bottom: 8 } }}
      />
      <Button
        value="Play"
        variant="primary"
        uiTransform={{ width: '100%', margin: { bottom: 4 } }}
        onMouseDown={onPlay}
      />
      <Button
        value="Pause"
        variant="secondary"
        uiTransform={{ width: '100%', margin: { bottom: 4 } }}
        onMouseDown={onPause}
      />
      <Button
        value="Stop"
        variant="secondary"
        uiTransform={{ width: '100%', margin: { bottom: 4 } }}
        onMouseDown={onStop}
      />
      <Button
        value="Restart"
        variant="primary"
        uiTransform={{ width: '100%' }}
        onMouseDown={onRestart}
      />
    </UiEntity>
  )
}

export function setupUI() {
  ReactEcsRenderer.setUiRenderer(UI)
}
