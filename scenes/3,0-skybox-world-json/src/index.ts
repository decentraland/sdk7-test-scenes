// We define the empty imports so the auto-complete feature works as expected.
import { Color4, Quaternion } from '@dcl/sdk/math'
import {
  engine,
  Transform,
  MeshRenderer,
  Material,
  executeTask,
  TextShape
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { setupUi } from './ui'
import { getSceneInformation } from '~system/Runtime'

const wallText = engine.addEntity()
let sceneJson: any;

export function main() {
  setupScene()
  setupUi()
}

executeTask(async () => {
  const sceneInfo = await getSceneInformation({})

  if (!sceneInfo) return

  sceneJson = JSON.parse(sceneInfo.metadataJson)
  console.log("world config: " + JSON.stringify(sceneJson.worldConfiguration))
  console.log("skybox config: " + JSON.stringify(sceneJson.skyboxConfig))

  const signText = TextShape.getMutable(wallText)
  if (signText) {
    let skyboxTimeFrom = 'Property not found'
    let skyboxRawTime = NaN;

    if (sceneJson) {
      if (sceneJson.worldConfiguration && sceneJson.worldConfiguration.skyboxConfig &&
        sceneJson.worldConfiguration.skyboxConfig.fixedTime) {
        skyboxTimeFrom = "worldConfiguration"
        skyboxRawTime = sceneJson.worldConfiguration.skyboxConfig.fixedTime
      } else if (sceneJson.skyboxConfig && sceneJson.skyboxConfig.fixedTime) {
        skyboxTimeFrom = "skyboxConfig"
        skyboxRawTime = sceneJson.skyboxConfig.fixedTime
      }
    }

    signText.text = `Fixed time from json's ${skyboxTimeFrom}: ${skyboxRawTime}
    Parsed time: ${formatSecondsToTime(skyboxRawTime)}`
  }
})

export function setupScene() {
  // Create a flat platform cube (16x0.2x16) at position 8,0.05,8
  const platform = engine.addEntity()

  Transform.create(platform, {
    position: Vector3.create(8, 0.01, 8),
    scale: Vector3.create(16, 0.2, 16)
  })

  MeshRenderer.setBox(platform)

  Material.setPbrMaterial(platform, {
    albedoColor: Color4.fromHexString("#6B8E23FF"), // Olive green with full alpha
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
  Transform.create(wallText, {
    position: Vector3.create(14.8, 2, 8), // Slightly away from wall towards center
    scale: Vector3.create(1, 1, 1),
    rotation: Quaternion.fromEulerDegrees(0, 90, 0)
  })

  TextShape.create(wallText, {
    text: "json world",
    fontSize: 2,
    textColor: Color4.White()
  })
}

// Function to format seconds into HH:MM:SS
export function formatSecondsToTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)

  // Add leading zeros for formatting
  const hoursStr = hours.toString().padStart(2, '0')
  const minutesStr = minutes.toString().padStart(2, '0')
  const secondsStr = seconds.toString().padStart(2, '0')

  return `${hoursStr}:${minutesStr}:${secondsStr}`
}
