import {
    engine,
    MeshRenderer,
    Transform,
    MeshCollider,
    pointerEventsSystem,
    InputAction,
    Entity,
    Material,
    AudioSource,
    Billboard,
    BillboardMode,
    VideoPlayer,
    GltfContainer,
    LoadingState
  } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from "@dcl/sdk/math"

const unloadedColor = Color4.create(1, 1, 1, 1);
const loadedColor = Color4.create(0, 1, 0, 1);
const loadingColor = Color4.create(1, 1, 0, 1);
const loadingErrorColor = Color4.create(1, 0, 0, 1);
const notFoundColor = Color4.create(0.96, 0.58, 0.26, 1);
const unknownColor = Color4.create(0.5, 0.5, 0.5, 1);

export const basePosition = Vector3.create(4, 1, 8);

export const mp3Path = 'assets/scene/Audio/Vexento.mp3';
export const texturePath = 'assets/scene/Images/Logo.png';
export const videoPath = 'assets/scene/Video/video-example.mp4';
export const glbPath = 'assets/scene/Models/chicken.glb';
export const errorPath = 'i-do-not-exist.glb';

export function getLoadingColor(loadingState: LoadingState): Color4 {
  switch (loadingState) {
    case LoadingState.FINISHED:
      return loadedColor
    case LoadingState.LOADING:
      return loadingColor
    case LoadingState.FINISHED_WITH_ERROR:
      return loadingErrorColor
    case LoadingState.NOT_FOUND:
      return notFoundColor
    default:
      return unknownColor
  }
}

export function createClickableCube(
    position: Vector3,
    hoverText: string,
    onClick: (entity: Entity) => void
) {
  const cube = engine.addEntity()
  Transform.create(cube, { position: position })
  MeshRenderer.setBox(cube)
  MeshCollider.setBox(cube)

  Material.setPbrMaterial(cube, {
    albedoColor: unloadedColor
  })
  
  pointerEventsSystem.onPointerDown({ entity: cube, opts: { button: InputAction.IA_POINTER, hoverText: hoverText, maxDistance:7 } }, () => {
    onClick(cube)
  });

  return cube
}

export function getAudioCube(){
    let cube = createClickableCube(basePosition, 'Play/Pause MP3', (cube) => {
      let audioSource = AudioSource.getOrCreateMutable(cube, {
        audioClipUrl: mp3Path,
        playing: false,
        volume: 1.0
      })
      audioSource.playing = !audioSource.playing
    })
    return cube
  }
  
  export function getTextureCube(){
    const textureCube = engine.addEntity()
    Transform.create(textureCube, {
      position: Vector3.add(basePosition, Vector3.create(2, 1, 2)),
      scale: Vector3.create(1.5, 1.5, 1)
    })
    MeshRenderer.setPlane(textureCube)
    Billboard.create(textureCube, {billboardMode: BillboardMode.BM_Y});
  
    let cube = createClickableCube(Vector3.add(basePosition, Vector3.create(2, 0, 0)), 'Set texture', (cube) => {
      Material.setPbrMaterial(textureCube, {
        albedoColor: Color4.create(1, 1, 1, 1),
        texture: Material.Texture.Common({
          src: texturePath
        })
    });
    })
  
    return cube
  }
  
  export function getVideoCube(){
    const videoScreen = engine.addEntity()
    Transform.create(videoScreen, {
      position: Vector3.add(basePosition, Vector3.create(4, 1, 2)),
      scale: Vector3.create(1.5, 1.5, 1)
    })
    MeshRenderer.setPlane(videoScreen)
    Billboard.create(videoScreen, {billboardMode: BillboardMode.BM_Y});
  
    const videoTexture = Material.Texture.Video({ videoPlayerEntity: videoScreen })
    Material.setBasicMaterial(videoScreen, {
      texture: videoTexture
    })
  
    
    let cube = createClickableCube(Vector3.add(basePosition, Vector3.create(4, 0, 0)), 'Play/Pause Video', (cube) => {
      let video = VideoPlayer.getOrCreateMutable(videoScreen, {
        src: videoPath,
        playing: false,
        loop: true,
        volume: 1.0,
        playbackRate: 1.0,
        position: 0  // Start time in seconds
      })
      video.playing = !video.playing
    })
  
    return cube
  }
  
  export function getGLBCube(){
    const glbModel = engine.addEntity()
    
    Transform.create(glbModel, {
      position: Vector3.add(basePosition, Vector3.create(6, 1, 2)),
      scale: Vector3.create(1, 1, 1)
    })
  
    let cube = createClickableCube(Vector3.add(basePosition, Vector3.create(6, 0, 0)), 'Spawn GLB', (cube) => {
      GltfContainer.getOrCreateMutable(glbModel, {
        src: glbPath
      })
    })
  
    return cube
  }

  export function getErrorCube(){
    const glbModel = engine.addEntity()
    
    Transform.create(glbModel, {
      position: Vector3.add(basePosition, Vector3.create(8, 1, 2)),
      scale: Vector3.create(1, 1, 1)
    })
  
    let cube = createClickableCube(Vector3.add(basePosition, Vector3.create(8, 0, 0)), 'Spawn Error GLB', (cube) => {
      GltfContainer.getOrCreateMutable(glbModel, {
        src: errorPath
      })
    })
  
    return cube
  }