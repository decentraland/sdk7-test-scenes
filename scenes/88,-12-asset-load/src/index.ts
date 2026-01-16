import {
  AssetLoad,
  AssetLoadLoadingState,
  engine,
  Entity,
  Material,
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { createClickableCube, handleAudio, handleTexture, handleVideo, handleGLB, basePosition, mp3Path, texturePath, videoPath, glbPath, getLoadingColor } from './utils'


let assetLoadCube: Entity
let audioCube: Entity
let textureCube: Entity
let videoCube: Entity
let glbCube: Entity

let lastLoadingStateLength = 0

export function main() {
  assetLoadCube = createClickableCube(Vector3.add(basePosition, Vector3.create(3, 0, -4)), 'Preload Assets', (cube) => {
    AssetLoad.getOrCreateMutable(cube, {assets: [mp3Path, texturePath, videoPath, glbPath]})
  })

  // Audio Cube
  audioCube = handleAudio()

  // Text Cube
  textureCube = handleTexture()

  // Video Screen
  videoCube = handleVideo()

  // GLB Model
  glbCube = handleGLB()

  engine.addSystem(assetLoadingStateSystem)
}

function assetLoadingStateSystem(dt: number){

  const loadingState = AssetLoadLoadingState.get(assetLoadCube)
  
  if (loadingState.size === 0 || loadingState.size === lastLoadingStateLength){
      return
  }
  
  const values = Array.from(loadingState.values())
  const lastValues = values.slice(lastLoadingStateLength)

  console.log(`lastLoadingStateLength: ${lastLoadingStateLength} - loadingState.size: ${loadingState.size}`)

  lastLoadingStateLength = loadingState.size


  lastValues.forEach(value => {
    console.log(`lastValue.currentState: ${value.currentState} - lastValue.asset: ${value.asset}`)

    const cube = getCube(value.asset)
    if (!cube){
      return
    }
  
    Material.setPbrMaterial(cube, {
      albedoColor: getLoadingColor(value.currentState)
    })
  })
}

function getCube(assetPath: string): Entity | null {
  switch (assetPath) {
    case mp3Path:
      return audioCube
    case texturePath:
      return textureCube
    case videoPath:
      return videoCube
    case glbPath:
      return glbCube
  }
  return null
}


