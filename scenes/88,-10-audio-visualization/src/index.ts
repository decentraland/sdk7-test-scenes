import {
  AudioAnalysis,
  AudioSource,
  engine,
  Entity,
  pointerEventsSystem,
  Transform,
  VideoPlayer,
  AudioAnalysisView
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

import { VisualAmplitude, VisualBar } from './components'
import { createVisualBar, createVisualAmplitude, createVideoScreen, createLabel } from './factory'

const BANDS: number = 8

const BARS_HEIGHT: number = 12

const AMPLITUDE_VISUAL_BASE: number = 1
const AMPLITUDE_VISUAL_SCALE: number = 10

// One visualizer group per audio-emitting source. AudioAnalysis works the same
// way on an AudioSource and on a VideoPlayer, so each source drives its own set
// of equalizer bars + amplitude sphere from its own analysis view.
const GROUP_AUDIO: number = 0
const GROUP_VIDEO: number = 1
const GROUP_HLS: number = 2

// Big Buck Bunny — progressive MP4 with a real AAC soundtrack.
const VIDEO_CLIP_URL: string = 'https://www.w3schools.com/html/mov_bbb.mp4'

// Mux test stream — HLS (.m3u8) with a muxed AAC soundtrack.
const HLS_STREAM_URL: string = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

// Groups are laid out side by side along X inside the single parcel.
const BARS_Z_OFFSET: number = BANDS / 2
const SPHERE_Z: number = 1.5
const SCREEN_Z: number = 13
const LABEL_Z: number = 13

// One reusable view per group, allocated once and read into every frame.
const analysisByGroup: Record<number, AudioAnalysisView> = {
  [GROUP_AUDIO]: { amplitude: 0, bands: new Array<number>(BANDS) },
  [GROUP_VIDEO]: { amplitude: 0, bands: new Array<number>(BANDS) },
  [GROUP_HLS]: { amplitude: 0, bands: new Array<number>(BANDS) }
}

export function main() {
  console.log('Init')

  // --- Group 0: local audio file (AudioSource) ---
  const audioEntity = engine.addEntity()
  AudioSource.create(audioEntity, {
    audioClipUrl: 'assets/scene/Audio/Vexento.mp3',
    playing: true,
    loop: true
  })
  AudioAnalysis.createAudioAnalysis(audioEntity)
  Transform.create(audioEntity)

  for (let i = 0; i < BANDS; i++) {
    createVisualBar(1, 0, i + BARS_Z_OFFSET, i, GROUP_AUDIO, Color4.Yellow())
  }
  const audioSphere = createVisualAmplitude(3.5, 1, SPHERE_Z, GROUP_AUDIO, Color4.Purple())
  createLabel(3.5, 6.5, LABEL_Z, 'AudioSource')
  makePlayPauseToggle(audioSphere, 'AudioSource', () => {
    const audioSource = AudioSource.getMutable(audioEntity)
    audioSource.playing = !audioSource.playing
  })

  // --- Group 1: progressive video soundtrack (VideoPlayer) ---
  // The VideoPlayer entity is also the AudioAnalysis entity: the renderer taps
  // the video's audio frame buffer exactly like it does for an AudioSource.
  const videoEntity = createVideoScreen(8.5, 4, SCREEN_Z, VIDEO_CLIP_URL)
  AudioAnalysis.createAudioAnalysis(videoEntity)

  for (let i = 0; i < BANDS; i++) {
    createVisualBar(6, 0, i + BARS_Z_OFFSET, i, GROUP_VIDEO, Color4.Teal())
  }
  const videoSphere = createVisualAmplitude(8.5, 1, SPHERE_Z, GROUP_VIDEO, Color4.Red())
  createLabel(8.5, 6.5, LABEL_Z, 'VideoPlayer (MP4)')
  makePlayPauseToggle(videoSphere, 'MP4 video', () => toggleVideo(videoEntity))

  // --- Group 2: HLS stream soundtrack (VideoPlayer) ---
  const hlsEntity = createVideoScreen(13.5, 4, SCREEN_Z, HLS_STREAM_URL)
  AudioAnalysis.createAudioAnalysis(hlsEntity)

  for (let i = 0; i < BANDS; i++) {
    createVisualBar(11, 0, i + BARS_Z_OFFSET, i, GROUP_HLS, Color4.Green())
  }
  const hlsSphere = createVisualAmplitude(13.5, 1, SPHERE_Z, GROUP_HLS, Color4.Blue())
  createLabel(13.5, 6.5, LABEL_Z, 'VideoPlayer (HLS)')
  makePlayPauseToggle(hlsSphere, 'HLS stream', () => toggleVideo(hlsEntity))

  // Read: refresh each group's view from its own AudioAnalysis component.
  engine.addSystem(() => {
    AudioAnalysis.readIntoView(audioEntity, analysisByGroup[GROUP_AUDIO])
    AudioAnalysis.readIntoView(videoEntity, analysisByGroup[GROUP_VIDEO])
    AudioAnalysis.readIntoView(hlsEntity, analysisByGroup[GROUP_HLS])
  })

  // Bands: scale each bar on Y by its group's matching band value.
  engine.addSystem(() => {
    const entities = engine.getEntitiesWith(VisualBar, Transform)
    for (const [entity] of entities) {
      const mutableTransform = Transform.getMutable(entity)
      const { index, group } = VisualBar.get(entity)

      const current = Vector3.One()
      current.y = analysisByGroup[group].bands[index] * BARS_HEIGHT
      mutableTransform.scale = current
    }
  })

  // Amplitude: scale each sphere uniformly by its group's amplitude.
  engine.addSystem(() => {
    const entities = engine.getEntitiesWith(VisualAmplitude, Transform)
    for (const [entity] of entities) {
      const mutableTransform = Transform.getMutable(entity)
      const { group } = VisualAmplitude.get(entity)

      const value = AMPLITUDE_VISUAL_BASE + analysisByGroup[group].amplitude * AMPLITUDE_VISUAL_SCALE
      mutableTransform.scale = Vector3.create(value, value, value)
    }
  })
}

// Clicking a group's amplitude sphere plays/pauses the source that drives it.
function makePlayPauseToggle(sphere: Entity, sourceName: string, toggle: () => void) {
  pointerEventsSystem.onPointerDown(
    { entity: sphere, opts: { hoverText: `Play / Pause ${sourceName}` } },
    toggle
  )
}

function toggleVideo(videoEntity: Entity) {
  const videoPlayer = VideoPlayer.getMutable(videoEntity)
  videoPlayer.playing = !videoPlayer.playing
}
