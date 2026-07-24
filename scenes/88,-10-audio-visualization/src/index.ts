import {
  AudioAnalysis,
  AudioSource,
  engine,
  Transform,
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

// Big Buck Bunny — progressive MP4 with a real AAC soundtrack so the
// video-driven visualizer actually reacts.
// NOTE: AudioAnalysis on a VideoPlayer only receives data for a PROGRESSIVE
// video file. HLS (.m3u8) streams play with audible sound but the renderer
// writes zeros to the AudioAnalysis component (its audio decodes on a path the
// analyzer doesn't tap). Keep this a progressive file, not an HLS stream.
const VIDEO_CLIP_URL: string = 'https://www.w3schools.com/html/mov_bbb.mp4'

// One reusable view per group, allocated once and read into every frame.
const analysisByGroup: Record<number, AudioAnalysisView> = {
  [GROUP_AUDIO]: { amplitude: 0, bands: new Array<number>(BANDS) },
  [GROUP_VIDEO]: { amplitude: 0, bands: new Array<number>(BANDS) }
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

  const half = BANDS / 2
  for (let i = 0; i < BANDS; i++) {
    createVisualBar(0, 0, i + half, i, GROUP_AUDIO, Color4.Yellow())
  }
  createVisualAmplitude(5, 1, 5, GROUP_AUDIO, Color4.Purple())
  createLabel(2, 6, 8, 'AudioSource')

  // --- Group 1: video soundtrack (VideoPlayer) ---
  // The VideoPlayer entity is also the AudioAnalysis entity: the renderer taps
  // the video's audio frame buffer exactly like it does for an AudioSource.
  const videoEntity = createVideoScreen(14, 4, 8, VIDEO_CLIP_URL)
  AudioAnalysis.createAudioAnalysis(videoEntity)

  for (let i = 0; i < BANDS; i++) {
    createVisualBar(15, 0, i + half, i, GROUP_VIDEO, Color4.Teal())
  }
  createVisualAmplitude(11, 1, 5, GROUP_VIDEO, Color4.Red())
  createLabel(13, 6, 8, 'VideoPlayer')

  // Read: refresh each group's view from its own AudioAnalysis component.
  engine.addSystem(() => {
    AudioAnalysis.readIntoView(audioEntity, analysisByGroup[GROUP_AUDIO])
    AudioAnalysis.readIntoView(videoEntity, analysisByGroup[GROUP_VIDEO])
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
