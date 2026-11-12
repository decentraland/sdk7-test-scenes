import { engine, AudioSource, audioEventsSystem, InputAction, pointerEventsSystem, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import * as C from '../constants'
import { createSign, createReadout, createFloorMark, createBox, setBoxColor, COLORS } from '../lib'
import { counters, slog, logEntity, logMark, onReset } from '../state'

/**
 * S12 -- audio, for `get_audio_state`. Three emitters at three different distances from the stand mark,
 * so a nearest-first listing has a fixed order and a fixed set of states:
 *
 *  ONE-SHOT -- a click plays `short.mp3` once; the engine flips `playing` back to false when it ends.
 *  LOOP     -- `global: true`, looping `long.mp3`, playing from scene start at volume 0.5.
 *  SPATIAL  -- a click toggles a spatial (`global: false`) looping `long.mp3` at volume 0.8, off at start.
 *
 * Every emitter is a box with its own `AudioSource`, and every state change is logged, so a driving
 * session can cross-examine the tool's `playing`/`state`/`volume` against the scene's own channel.
 */
export function setupS12Audio() {
  const sign = createSign(C.S12_SIGN, 'S12 -- AUDIO\n(get_audio_state)', COLORS.info)
  logEntity('S12 sign', sign)

  const readout = createReadout(C.S12_READOUT, 'booting...')
  logEntity('S12 readout', readout.entity)

  createFloorMark(C.S12_STAND, 'S12: stand here\n(one-shot 1.5m, loop ~4m, spatial ~4.7m)', COLORS.info)
  logMark('S12 stand mark', C.S12_STAND)

  function refresh() {
    readout.setText(
      `LOOP (global, 0.5): ${loopPlaying ? 'playing' : 'stopped'}\n` +
        `SPATIAL (0.8): ${counters.s12SpatialOn ? 'ON' : 'off'}  toggles: ${counters.s12SpatialToggles}\n` +
        `ONE-SHOT (1.0): plays ${counters.s12OneShotPlays}  finished ${counters.s12OneShotFinishes}`
    )
  }

  // -----------------------------------------------------------------------------------------
  // LOOP -- global, looping, playing from the start. No click handler: it exists to be listed.
  // -----------------------------------------------------------------------------------------
  let loopPlaying = true
  const loop = createBox(C.S12_LOOP, Vector3.create(1, 1, 1), COLORS.active)
  logEntity('S12 LOOP emitter (global, looping long.mp3, playing from start)', loop)
  AudioSource.create(loop, {
    audioClipUrl: C.S12_CLIP_LONG,
    playing: true,
    loop: true,
    global: true,
    volume: C.S12_LOOP_VOLUME
  })
  audioEventsSystem.registerAudioEventsEntity(loop, (event) => {
    slog('S12-AUDIO', `LOOP media state -> ${event.state}`)
  })

  // -----------------------------------------------------------------------------------------
  // SPATIAL -- click toggles a spatial looping clip, off at start.
  // -----------------------------------------------------------------------------------------
  const spatial = createBox(C.S12_SPATIAL, Vector3.create(1, 1, 1), COLORS.idle)
  logEntity('S12 SPATIAL emitter (click toggles a spatial looping long.mp3)', spatial)
  AudioSource.create(spatial, {
    audioClipUrl: C.S12_CLIP_LONG,
    playing: false,
    loop: true,
    global: false,
    volume: C.S12_SPATIAL_VOLUME
  })
  audioEventsSystem.registerAudioEventsEntity(spatial, (event) => {
    slog('S12-AUDIO', `SPATIAL media state -> ${event.state}`)
  })
  pointerEventsSystem.onPointerDown(
    { entity: spatial, opts: { button: InputAction.IA_POINTER, hoverText: 'Toggle spatial loop', maxDistance: 16 } },
    () => {
      counters.s12SpatialToggles++
      counters.s12SpatialOn = !counters.s12SpatialOn
      if (counters.s12SpatialOn) AudioSource.playSound(spatial, C.S12_CLIP_LONG)
      else AudioSource.stopSound(spatial)
      setBoxColor(spatial, counters.s12SpatialOn ? COLORS.active : COLORS.idle)
      slog('S12-AUDIO', `SPATIAL ${counters.s12SpatialOn ? 'ON' : 'off'} (toggle #${counters.s12SpatialToggles})`)
      refresh()
    }
  )

  // -----------------------------------------------------------------------------------------
  // ONE-SHOT -- click plays the short clip once; its natural end flips `playing` back to false.
  // -----------------------------------------------------------------------------------------
  const oneShot = createBox(C.S12_ONESHOT, Vector3.create(1, 1, 1), COLORS.charge)
  logEntity('S12 ONE-SHOT emitter (click plays short.mp3 once)', oneShot)
  AudioSource.create(oneShot, {
    audioClipUrl: C.S12_CLIP_SHORT,
    playing: false,
    loop: false,
    global: false,
    volume: C.S12_ONESHOT_VOLUME
  })
  pointerEventsSystem.onPointerDown(
    { entity: oneShot, opts: { button: InputAction.IA_POINTER, hoverText: 'Play one-shot', maxDistance: 16 } },
    () => {
      counters.s12OneShotPlays++
      AudioSource.playSound(oneShot, C.S12_CLIP_SHORT)
      setBoxColor(oneShot, COLORS.active)
      slog('S12-AUDIO', `ONE-SHOT play #${counters.s12OneShotPlays}`)
      refresh()
    }
  )

  // A non-looping clip that ends on its own flips `playing` to false; the edge is the finish signal.
  let oneShotWasPlaying = false
  engine.addSystem(() => {
    const isPlaying = AudioSource.get(oneShot).playing ?? false
    if (oneShotWasPlaying && !isPlaying) {
      counters.s12OneShotFinishes++
      setBoxColor(oneShot, COLORS.charge)
      slog('S12-AUDIO', `ONE-SHOT finished (#${counters.s12OneShotFinishes})`)
      refresh()
    }
    oneShotWasPlaying = isPlaying
  })

  // Keep the LOOP's readout line honest: the engine never flips a looping clip, but a reset restarts it.
  engine.addSystem(() => {
    const playing = AudioSource.get(loop).playing ?? false
    if (playing !== loopPlaying) {
      loopPlaying = playing
      refresh()
    }
  })

  onReset(() => {
    AudioSource.stopSound(spatial)
    AudioSource.stopSound(oneShot)
    AudioSource.playSound(loop, C.S12_CLIP_LONG)
    setBoxColor(spatial, COLORS.idle)
    setBoxColor(oneShot, COLORS.charge)
    oneShotWasPlaying = false
    refresh()
  })

  refresh()
  slog(
    'S12-AUDIO',
    `station ready -- get_audio_state from the stand mark lists ONE-SHOT, LOOP, SPATIAL nearest-first; LOOP plays from the start (global, loop, volume ${C.S12_LOOP_VOLUME})`
  )
  // The Transform every AudioSource needs is the box's own; stated so the dependency is visible.
  if (!Transform.has(loop)) slog('S12-AUDIO', 'LOOP has no Transform -- the client creates no audio source without one')
}
