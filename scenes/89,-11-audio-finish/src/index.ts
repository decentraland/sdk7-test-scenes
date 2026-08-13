/**
 * Audio Finish Detection Test Scene
 *
 * Validates playback-completion signaling for PBAudioSource:
 *   - The explorer flips AudioSource.playing to false when a non-looping clip
 *     finishes naturally (as opposed to the scene calling stopSound()).
 *   - audioEventsSystem.registerAudioEventsEntity() fires a callback with the
 *     PBAudioEvent (MediaState) whenever the renderer-authored AudioEvent
 *     component changes for the entity.
 *
 * Layout:
 *   One AudioSource entity with a short, non-looping clip, driven by two buttons
 *   (Play / Stop). Two independent detection paths are displayed so a reviewer can
 *   see both react to the same natural-finish event, and see that pressing Stop is
 *   NOT reported as a natural finish (it is a scene-initiated transition).
 */

import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  TextShape,
  Billboard,
  Material,
  AudioSource,
  audioEventsSystem,
  MediaState,
  pointerEventsSystem,
  InputAction
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

const CLIP = 'audio/short.mp3' // short, non-looping clip (~0.5s)
const LONG_CLIP = 'audio/long.mp3' // ~48s clip, long enough to press STOP mid-playback

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function createButton(position: Vector3, color: Color4): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position, scale: Vector3.create(1.2, 1.2, 1.2) })
  MeshRenderer.setBox(entity)
  MeshCollider.setBox(entity)
  Material.setPbrMaterial(entity, { albedoColor: color })
  return entity
}

function createLabel(position: Vector3, fontSize = 2, color: Color4 = Color4.White(), text = ''): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position })
  TextShape.create(entity, {
    text,
    fontSize,
    textColor: color,
    outlineWidth: 0.1,
    outlineColor: Color4.Black()
  })
  Billboard.create(entity, {})
  return entity
}

function setLabel(entity: Entity, text: string): void {
  const ts = TextShape.getMutable(entity)
  ts.text = text
}

// ---------------------------------------------------------------------------
// Audio entity
// ---------------------------------------------------------------------------

const audioEntity = engine.addEntity()
Transform.create(audioEntity, { position: Vector3.create(8, 1, 8) })
AudioSource.create(audioEntity, {
  audioClipUrl: CLIP,
  playing: false,
  loop: false
})

// Bookkeeping for the demo UI only (not ECS state).
let lastPolledPlaying = false
let sceneRequestedStop = false
let naturalFinishLatched = false
const audioEventLog: string[] = []

function mediaStateName(state: MediaState): string {
  switch (state) {
    case MediaState.MS_NONE:
      return 'MS_NONE'
    case MediaState.MS_ERROR:
      return 'MS_ERROR'
    case MediaState.MS_LOADING:
      return 'MS_LOADING'
    case MediaState.MS_READY:
      return 'MS_READY'
    case MediaState.MS_PLAYING:
      return 'MS_PLAYING'
    case MediaState.MS_BUFFERING:
      return 'MS_BUFFERING'
    case MediaState.MS_SEEKING:
      return 'MS_SEEKING'
    case MediaState.MS_PAUSED:
      return 'MS_PAUSED'
    default:
      return `UNKNOWN(${state})`
  }
}

// ---------------------------------------------------------------------------
// Play / Stop buttons
// ---------------------------------------------------------------------------

const btnPlay = createButton(Vector3.create(6, 1, 4), Color4.create(0.2, 0.8, 0.2, 1))
createLabel(Vector3.create(6, 2.3, 4), 2, Color4.White(), 'PLAY')
pointerEventsSystem.onPointerDown(
  { entity: btnPlay, opts: { button: InputAction.IA_POINTER, hoverText: 'Play short clip (non-looping)' } },
  () => {
    sceneRequestedStop = false
    naturalFinishLatched = false
    AudioSource.playSound(audioEntity, CLIP, true)
  }
)


// Play-long button — a ~48s clip so the STOP (scene-initiated) path can actually be
// exercised: the short clip finishes naturally faster than a human (or agent) can
// press STOP after PLAY.
const btnPlayLong = createButton(Vector3.create(8, 1, 4), Color4.create(0.2, 0.4, 0.9, 1))
createLabel(Vector3.create(8, 2.3, 4), 2, Color4.White(), 'PLAY LONG')
pointerEventsSystem.onPointerDown(
  { entity: btnPlayLong, opts: { button: InputAction.IA_POINTER, hoverText: 'Play long clip (non-looping, ~48s)' } },
  () => {
    sceneRequestedStop = false
    naturalFinishLatched = false
    AudioSource.playSound(audioEntity, LONG_CLIP, true)
  }
)

// Stop button — explicitly scene-initiated. We flag sceneRequestedStop here so the
// polling system below can tell this apart from a natural true->false transition.
const btnStop = createButton(Vector3.create(10, 1, 4), Color4.create(0.8, 0.2, 0.2, 1))
createLabel(Vector3.create(10, 2.3, 4), 2, Color4.White(), 'STOP')
pointerEventsSystem.onPointerDown(
  { entity: btnStop, opts: { button: InputAction.IA_POINTER, hoverText: 'Stop (scene-initiated)' } },
  () => {
    sceneRequestedStop = true
    AudioSource.stopSound(audioEntity)
  }
)

// ---------------------------------------------------------------------------
// Detection path (a) — poll AudioSource.get(entity).playing (READ-ONLY)
// ---------------------------------------------------------------------------
// IMPORTANT: uses AudioSource.get() (read-only), never getMutable/getMutableOrNull.
// Calling a mutable getter here would mark the component dirty every frame and
// cause unnecessary CRDT re-sync traffic on every tick, even when nothing changed.

const livePlayingLabel = createLabel(Vector3.create(8, 4.6, 4), 2.5, Color4.Yellow())
const latchLabel = createLabel(Vector3.create(8, 3.8, 4), 2.2, Color4.create(1, 0.5, 0.2, 1), 'Waiting for playback...')

engine.addSystem(() => {
  const audio = AudioSource.get(audioEntity)
  const currentlyPlaying = audio.playing ?? false

  setLabel(livePlayingLabel, `AudioSource.get().playing = ${currentlyPlaying}`)

  // Detect a true -> false transition. If the scene requested it via Stop, label it
  // as a scene-stop; otherwise it's a natural finish and we latch the FINISHED state.
  if (lastPolledPlaying && !currentlyPlaying) {
    if (sceneRequestedStop) {
      setLabel(latchLabel, 'Stopped by scene (Stop button pressed)')
    } else {
      naturalFinishLatched = true
    }
  }

  if (naturalFinishLatched) {
    setLabel(latchLabel, 'FINISHED (playing flipped false — natural completion)')
  }

  lastPolledPlaying = currentlyPlaying
})

// ---------------------------------------------------------------------------
// Detection path (b) — audioEventsSystem.registerAudioEventsEntity
// ---------------------------------------------------------------------------

const eventLogLabel = createLabel(Vector3.create(8, 2.6, 6), 1.8, Color4.create(0.5, 0.9, 1, 1), 'audioEventsSystem log:\n(none yet)')

audioEventsSystem.registerAudioEventsEntity(audioEntity, (event) => {
  const line = `${mediaStateName(event.state)} @${event.timestamp}`
  audioEventLog.push(line)
  if (audioEventLog.length > 6) audioEventLog.shift()
  setLabel(eventLogLabel, `audioEventsSystem log:\n${audioEventLog.join('\n')}`)
})

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------

function addGround(): void {
  const ground = engine.addEntity()
  Transform.create(ground, { position: Vector3.create(8, -0.05, 8), scale: Vector3.create(16, 0.1, 16) })
  MeshRenderer.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: Color4.create(0.15, 0.15, 0.15, 1) })
}

function addTitle(): void {
  createLabel(
    Vector3.create(8, 5.8, 8),
    3,
    Color4.White(),
    'Audio Finish Detection Test\nPress PLAY and let the clip finish naturally (do not press STOP)\nto see the FINISHED latch and audioEventsSystem log react.'
  )
}

addGround()
addTitle()
