// Test scene for the PBSkybox SDK component (textures + environment overrides) with one LightSource.
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  ColliderLayer,
  engine,
  Entity,
  GltfContainer,
  LightSource,
  Material,
  MeshRenderer,
  Transform,
  VideoPlayer
} from '@dcl/sdk/ecs'
import { initializeUI } from './ui'

export function main() {
  setupScene()
  initializeUI(videoPlayerEntity)
}

function setupScene() {
  createFloor()
  createSpheres()
  createMirror()
  createMaterialCubes()
  createLight()
  createVideoScreen()
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

// A small looping video screen on the west wall, mirroring the mirror plane's placement on the
// east wall (opposite rotation, same room-facing convention). Exported so `ui.tsx` can reference
// `videoPlayerEntity` for the Sky/Reflection/Clouds "Video" buttons via Material.Texture.Video.
export const videoPlayerEntity: Entity = engine.addEntity()

function createVideoScreen() {
  Transform.create(videoPlayerEntity, {
    position: Vector3.create(2, 1.6, 8),
    scale: Vector3.create(2, 1.125, 1),
    rotation: Quaternion.fromEulerDegrees(0, 90, 0)
  })

  MeshRenderer.setPlane(videoPlayerEntity)

  VideoPlayer.create(videoPlayerEntity, {
    src: 'assets/video/video-example.mp4',
    playing: true,
    loop: true,
    volume: 0
  })

  Material.setBasicMaterial(videoPlayerEntity, {
    texture: Material.Texture.Video({ videoPlayerEntity })
  })
}

// A few cubes with contrasting materials, placed around spawn so that in "True darkness" the
// orbiting light reveals how each surface responds when the player walks up to them.
function createMaterialCubes() {
  const cubes: { position: Vector3; material: Parameters<typeof Material.setPbrMaterial>[1] }[] = [
    // matte white: pure diffuse response, shows the light's color and falloff most clearly
    { position: Vector3.create(4, 1, 12), material: { albedoColor: Color4.White(), metallic: 0, roughness: 1 } },
    // glossy red: sharp specular highlight travels with the orbiting light
    { position: Vector3.create(7, 1, 12), material: { albedoColor: Color4.Red(), metallic: 0, roughness: 0.15 } },
    // brushed gold: metallic, reflects the (black) environment and picks up the light as a tinted sheen
    {
      position: Vector3.create(10, 1, 12),
      material: { albedoColor: Color4.create(1, 0.78, 0.35, 1), metallic: 1, roughness: 0.35 }
    },
    // emissive blue: stays visible with no light at all, for comparison
    {
      position: Vector3.create(13, 1, 12),
      material: {
        albedoColor: Color4.create(0.1, 0.2, 0.9, 1),
        emissiveColor: Color4.create(0.1, 0.2, 0.9, 1),
        emissiveIntensity: 2,
        roughness: 0.6
      }
    }
  ]

  for (const cube of cubes) {
    const entity = engine.addEntity()
    Transform.create(entity, { position: cube.position, scale: Vector3.create(1.5, 1.5, 1.5) })
    MeshRenderer.setBox(entity)
    Material.setPbrMaterial(entity, cube.material)
  }
}

// A single point light with a small emissive marker so its position is obvious. It orbits the
// player (see orbitLightSystem), so with the "True darkness" environment preset (black
// sun/sky/ambient/fog, no clouds or stars, sun hidden) it is the only thing illuminating whatever
// the player walks up to.
const lightEntity = engine.addEntity()
const ORBIT_RADIUS = 0.75
const ORBIT_HEIGHT = 2.5
const ORBIT_SPEED = 1 // radians per second
let orbitAngle = 0

function createLight() {
  Transform.create(lightEntity, {
    position: Vector3.create(8, ORBIT_HEIGHT, 8),
    scale: Vector3.create(0.3, 0.3, 0.3)
  })

  LightSource.create(lightEntity, {
    type: LightSource.Type.Point({}),
    color: Color3.create(1, 0.85, 0.6),
    intensity: 8000,
    range: 14,
    shadow: true
  })

  MeshRenderer.setSphere(lightEntity)

  Material.setPbrMaterial(lightEntity, {
    albedoColor: Color4.create(1, 0.85, 0.6, 1),
    emissiveColor: Color4.create(1, 0.85, 0.6, 1),
    emissiveIntensity: 4
  })

  engine.addSystem(orbitLightSystem)
}

// Keeps the light circling the player at a fixed radius and height. The player's Transform is
// engine-owned and read-only; only the light's own Transform is written.
function orbitLightSystem(dt: number) {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!player) return

  orbitAngle = (orbitAngle + ORBIT_SPEED * dt) % (Math.PI * 2)

  const light = Transform.getMutable(lightEntity)
  light.position = Vector3.create(
    player.position.x + Math.cos(orbitAngle) * ORBIT_RADIUS,
    player.position.y + ORBIT_HEIGHT,
    player.position.z + Math.sin(orbitAngle) * ORBIT_RADIUS
  )
}
