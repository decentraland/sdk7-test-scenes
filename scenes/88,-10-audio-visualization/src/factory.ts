import {
  Entity,
  engine,
  Transform,
  MeshRenderer,
  Material,
  VideoPlayer,
  TextShape,
  Billboard,
  BillboardMode
} from '@dcl/sdk/ecs'
import { VisualAmplitude, VisualBar } from './components'
import { Color4, Vector3 } from '@dcl/sdk/math'

export function createVisualBar(
  x: number,
  y: number,
  z: number,
  index: number,
  group: number,
  color: Color4
): Entity {
  const entity = engine.addEntity()

  // Used to react to audio bands
  VisualBar.create(entity, { index, group })

  Transform.create(entity, { position: { x, y, z } })

  MeshRenderer.setBox(entity)
  Material.setPbrMaterial(entity, { albedoColor: color })

  return entity
}

export function createVisualAmplitude(
  x: number,
  y: number,
  z: number,
  group: number,
  color: Color4
): Entity {
  const entity = engine.addEntity()

  // Used to react to audio amplitude
  VisualAmplitude.create(entity, { group })

  Transform.create(entity, { position: { x, y, z } })

  MeshRenderer.setSphere(entity)
  Material.setPbrMaterial(entity, { albedoColor: color })

  return entity
}

// A plane displaying the video, whose soundtrack is fed into AudioAnalysis.
// The VideoPlayer must live on the same entity that gets the AudioAnalysis
// component (the renderer taps this component's audio frame buffer).
export function createVideoScreen(
  x: number,
  y: number,
  z: number,
  videoClipUrl: string
): Entity {
  const entity = engine.addEntity()

  Transform.create(entity, { position: { x, y, z }, scale: Vector3.create(4, 2.25, 1) })
  MeshRenderer.setPlane(entity)
  Billboard.create(entity, { billboardMode: BillboardMode.BM_Y })

  VideoPlayer.create(entity, {
    src: videoClipUrl,
    playing: true,
    loop: true,
    volume: 1.0
  })

  const videoTexture = Material.Texture.Video({ videoPlayerEntity: entity })
  Material.setBasicMaterial(entity, { texture: videoTexture })

  return entity
}

export function createLabel(x: number, y: number, z: number, text: string): Entity {
  const entity = engine.addEntity()

  Transform.create(entity, { position: { x, y, z } })
  Billboard.create(entity, { billboardMode: BillboardMode.BM_Y })
  TextShape.create(entity, { text, fontSize: 4, textColor: Color4.White() })

  return entity
}
