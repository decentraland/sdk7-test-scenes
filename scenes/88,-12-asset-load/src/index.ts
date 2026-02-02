import {
  AssetLoad,
  Entity,
  LoadingState,
  Material,
  assetLoadLoadingStateSystem
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { createClickableCube, basePosition, mp3Path, texturePath, videoPath, glbPath, getLoadingColor, getAudioCube, getTextureCube, getVideoCube, getGLBCube, errorPath, getErrorCube } from './utils'


let assetLoadCube: Entity
let audioCube: Entity
let textureCube: Entity
let videoCube: Entity
let glbCube: Entity
let errorCube: Entity

export function main() {
  let assetLoadCubeClicks = 0
  assetLoadCube = createClickableCube(Vector3.add(basePosition, Vector3.create(3, 0, -4)), 'Preload Assets', (cube) => {
    assetLoadCubeClicks++

    let assetLoad = AssetLoad.getOrCreateMutable(cube, {assets: [mp3Path, texturePath, videoPath, glbPath]})

    // Add error path at 2nd click
    if (assetLoadCubeClicks === 2) {
      assetLoad.assets.push(errorPath)
    }
  })

  // Audio Cube
  audioCube = getAudioCube()

  // Text Cube
  textureCube = getTextureCube()

  // Video Screen
  videoCube = getVideoCube()

  // GLB Model
  glbCube = getGLBCube()

  // Error Cube (path that does not exist)
  errorCube = getErrorCube()

  assetLoadLoadingStateSystem.registerAssetLoadLoadingStateEntity(assetLoadCube, handleAssetLoadStateChange)
}

function handleAssetLoadStateChange(assetLoadState: { asset: string; currentState: LoadingState }) {
  const cube = getCube(assetLoadState.asset)
  if (!cube) {
    return
  }

  Material.setPbrMaterial(cube, {
    albedoColor: getLoadingColor(assetLoadState.currentState)
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
    case errorPath:
      return errorCube
  }
  return null
}


