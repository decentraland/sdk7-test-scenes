import {
  AssetLoad,
  AudioSource,
  Billboard,
  BillboardMode,
  engine,
  Entity,
  GltfContainer,
  GltfContainerLoadingState,
  LoadingState,
  Material,
  MeshRenderer,
  Transform,
  VideoPlayer,
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { createClickableCube } from './utils'


export function main() {
  // Audio Cube
  handleAudio()

  // Text Cube
  handleTexture()

  // Video Screen
  handleVideo()

  // GLB Model
  handleGLB()
}

function handleAudio(){
  createClickableCube(Vector3.create(0, 1, 0), 'Play/Pause MP3', (cube) => {
    let audioSource = AudioSource.getOrCreateMutable(cube, {
      audioClipUrl: 'assets/scene/Audio/Vexento.mp3',
      playing: false,
      volume: 1.0
    })
    audioSource.playing = !audioSource.playing
  })
}

function handleTexture(){
  const textureCube = engine.addEntity()
  Transform.create(textureCube, {
    position: Vector3.create(2, 1, 2),
    scale: Vector3.create(1.5, 1.5, 1)
  })
  MeshRenderer.setPlane(textureCube)
  Billboard.create(textureCube, {billboardMode: BillboardMode.BM_Y});

  createClickableCube(Vector3.create(2, 1, 0), 'Set texture', (cube) => {
    Material.setPbrMaterial(textureCube, {
      albedoColor: Color4.create(1, 1, 1, 1),
      texture: Material.Texture.Common({
        src: 'assets/scene/Images/Logo.png'
      })
  });
  })
}

function handleVideo(){
  const videoScreen = engine.addEntity()
  Transform.create(videoScreen, {
    position: Vector3.create(4, 1, 2),
    scale: Vector3.create(1.5, 1.5, 1)
  })
  MeshRenderer.setPlane(videoScreen)
  Billboard.create(videoScreen, {billboardMode: BillboardMode.BM_Y});

  const videoTexture = Material.Texture.Video({ videoPlayerEntity: videoScreen })
  Material.setBasicMaterial(videoScreen, {
    texture: videoTexture
  })

  
  createClickableCube(Vector3.create(4, 1, 0), 'Play/Pause Video', (cube) => {
    let video = VideoPlayer.getOrCreateMutable(videoScreen, {
      src: 'assets/scene/Video/video-example.mp4',
      playing: false,
      loop: true,
      volume: 1.0,
      playbackRate: 1.0,
      position: 0  // Start time in seconds
    })
    video.playing = !video.playing
  })
}

function handleGLB(){
  const glbModel = engine.addEntity()
  
  Transform.create(glbModel, {
    position: Vector3.create(6, 1, 2),
    scale: Vector3.create(1, 1, 1)
  })

  createClickableCube(Vector3.create(6, 1, 0), 'Spawn GLB', (cube) => {
    GltfContainer.create(glbModel, {
      src: 'assets/scene/Models/chicken.glb'
    })
  })
}
