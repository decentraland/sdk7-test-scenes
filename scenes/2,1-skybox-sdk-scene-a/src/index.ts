// We define the empty imports so the auto-complete feature works as expected.
import { Color4, Quaternion } from '@dcl/sdk/math'
import {
  engine,
  Transform,
  MeshRenderer,
  Material,
  TextShape,
  SkyboxTime,
  PBSkyboxTime,
  Entity
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { initializeUI } from './ui'

export function main() {
  setupScene()
  initializeUI()
}

export function setupScene() {
  // Create a flat platform cube (16x0.2x16) at position 8,0.05,8
  const platform = engine.addEntity()

  Transform.create(platform, {
    position: Vector3.create(8, 0.01, 8),
    scale: Vector3.create(16, 0.2, 16)
  })

  MeshRenderer.setBox(platform)

  Material.setPbrMaterial(platform, {
    albedoColor: Color4.fromHexString("#00FF7FFF"), // Spring green with full alpha
    roughness: 0.8,
    metallic: 0.1
  })

  // Create a wall on one side (60% coverage, 4m tall, 0.5m wide)
  const wall = engine.addEntity()
  
  Transform.create(wall, {
    position: Vector3.create(15.5, 2, 8), // Right side, centered vertically and along Z
    scale: Vector3.create(0.5, 4, 9.6) // 0.5m wide, 4m tall, 9.6m long (60% of 16m)
  })
  
  MeshRenderer.setBox(wall)
  
  Material.setPbrMaterial(wall, {
    albedoColor: Color4.fromHexString("#FFA366FF"), // Light orange color
    roughness: 0.7,
    metallic: 0.2
  })

  // Create text aligned with the wall (on inner face, slightly away from wall)
  const wallText = engine.addEntity()
  
  Transform.create(wallText, {
    position: Vector3.create(14.8, 2, 8), // Slightly away from wall towards center
    scale: Vector3.create(1, 1, 1),
    rotation: Quaternion.fromEulerDegrees(0, 90, 0)
  })
  
  TextShape.create(wallText, {
    text: "This scene uses the SkyboxTime sdk component, use the UI to tweak the settings.",
    fontSize: 2,
    textColor: Color4.White()
  })
}


