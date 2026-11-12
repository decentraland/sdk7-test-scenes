import { Schemas, engine } from '@dcl/sdk/ecs'

// group discriminates which audio source drives the visual:
// 0 = AudioSource (local mp3), 1 = VideoPlayer (progressive MP4), 2 = VideoPlayer (HLS stream)
export const VisualAmplitude = engine.defineComponent('amplitude', { group: Schemas.Number })

export const VisualBar = engine.defineComponent('bar', { index: Schemas.Number, group: Schemas.Number })
