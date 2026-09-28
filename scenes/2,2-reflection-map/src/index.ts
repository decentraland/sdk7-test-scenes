// Test scene for the PBSkybox SDK component (skyboxTexture + reflectionMap).
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  ColliderLayer,
  engine,
  GltfContainer,
  Material,
  MeshRenderer,
  Transform,
  TextShape
} from '@dcl/sdk/ecs'
import { initializeUI } from './ui'

export function main() {
  setupScene()
  initializeUI()
}

function setupScene() {
  createFloor()
  createSpheres()
  createMirror()
  createSign()
}

// Reuses the glossy floor asset pack from `0,6-ui-zindex-and-opacity` so reflections
// (both the derived skybox reflection and the explicit reflectionMap) are visible on
// a real reflective surface, not just on the test spheres/mirror.
function createFloor() {
  const floor = engine.addEntity()

  Transform.create(floor, {
    position: Vector3.create(8, 0, 8)
  })

  GltfContainer.create(floor, {
    src: 'assets/asset-packs/glossy_aetherea_tiles/CityTile.glb',
    visibleMeshesCollisionMask: ColliderLayer.CL_POINTER,
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
  })
}

// A row of four metallic spheres with increasing roughness, so the reflection map
// (or the skybox-derived reflection) is visible at different levels of blur.
const roughnessSteps = [0, 0.25, 0.5, 0.75]

function createSpheres() {
  roughnessSteps.forEach((roughness, index) => {
    const sphere = engine.addEntity()

    Transform.create(sphere, {
      position: Vector3.create(4 + index * 2.5, 1.5, 4),
      scale: Vector3.create(1.2, 1.2, 1.2)
    })

    MeshRenderer.setSphere(sphere)

    Material.setPbrMaterial(sphere, {
      metallic: 1,
      roughness,
      albedoColor: Color4.White()
    })
  })
}

// A large vertical mirror-like plane so the reflection is easy to read from a distance.
function createMirror() {
  const mirror = engine.addEntity()

  Transform.create(mirror, {
    position: Vector3.create(15.7, 3, 8),
    scale: Vector3.create(6, 6, 1),
    rotation: Quaternion.fromEulerDegrees(0, -90, 0)
  })

  MeshRenderer.setPlane(mirror)

  Material.setPbrMaterial(mirror, {
    metallic: 1,
    roughness: 0,
    albedoColor: Color4.White()
  })
}

function createSign() {
  const sign = engine.addEntity()

  Transform.create(sign, {
    position: Vector3.create(8, 3, 15.6),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0)
  })

  TextShape.create(sign, {
    text:
      'Skybox component: skyboxTexture replaces the visible sky, reflectionMap replaces the reflection cubemap.\n' +
      'If reflectionMap is unset but skyboxTexture is set, reflections are derived from the skybox.\n' +
      'Use the panel to combine Sky A/B/None with Reflection A/B/None, or try an invalid reflection src.\n' +
      'Orientation check (sky-a.png only): the red N marker faces spawn, E/W/S markers are 90 degrees apart.',
    fontSize: 1.6,
    textColor: Color4.White(),
    textWrapping: true,
    width: 12,
    height: 4
  })
}
