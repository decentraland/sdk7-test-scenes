import {
  AvatarModifierArea,
  AvatarModifierType,
  AvatarNametag,
  AvatarShape,
  engine,
  Entity,
  MainCamera,
  Transform,
  VirtualCamera
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { setupUi } from './ui'

// Scene is 128 m x 32 m (parcels 6,24 to 13,25). Spawn is x:[2,4] z:[14,18], looking toward +x.
const SPAWN_X = 3
const ROW_Z = 16
const ROW_DISTANCES = [10, 30, 60, 100]

const PLATE_NPC_POSITION = Vector3.create(SPAWN_X + 30, 0, 24)
const HIDDEN_WINS_POSITION = Vector3.create(SPAWN_X + 60, 0, 26)

let topDownCamera: Entity
let sceneArea: Entity
let hiddenWinsArea: Entity
let topDownActive = false

export function main() {
  for (const distance of ROW_DISTANCES) {
    spawnNpc(`NPC ${distance} m`, Vector3.create(SPAWN_X + distance, 0, ROW_Z))
  }

  // Plate NPC: its name comes from the AvatarNametag plate, it is also covered by the area.
  const plateNpc = spawnNpc('Plate NPC', PLATE_NPC_POSITION)
  AvatarNametag.create(plateNpc, { label: 'Plate 30 m' })

  // Hide wins NPC: sits inside a sub-area with HIDE_NAMETAGS + DISABLE_NAMETAG_CULLING.
  spawnNpc('Hide wins', HIDDEN_WINS_POSITION)
  hiddenWinsArea = engine.addEntity()
  Transform.create(hiddenWinsArea, { position: Vector3.create(HIDDEN_WINS_POSITION.x, 5, HIDDEN_WINS_POSITION.z) })
  AvatarModifierArea.create(hiddenWinsArea, {
    area: Vector3.create(8, 10, 8),
    excludeIds: [],
    modifiers: [AvatarModifierType.AMT_HIDE_NAMETAGS, AvatarModifierType.AMT_DISABLE_NAMETAG_CULLING]
  })

  // Whole-scene area, toggled at runtime. Starts removed.
  sceneArea = engine.addEntity()
  Transform.create(sceneArea, { position: Vector3.create(64, 25, 16) })

  // 75 m above the row, looking straight down; stays under the 16-parcel height limit (~81 m).
  topDownCamera = engine.addEntity()
  Transform.create(topDownCamera, {
    position: Vector3.create(60, 75, ROW_Z),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0)
  })
  VirtualCamera.create(topDownCamera, { fov: 45 })

  setupUi()
}

export function isTopDownActive(): boolean {
  return topDownActive
}

export function toggleTopDown() {
  topDownActive = !topDownActive
  MainCamera.createOrReplace(engine.CameraEntity, {
    virtualCameraEntity: topDownActive ? topDownCamera : undefined
  })
}

export function isCullingDisabled(): boolean {
  return AvatarModifierArea.has(sceneArea)
}

export function toggleCullingDisabled() {
  if (AvatarModifierArea.has(sceneArea)) {
    AvatarModifierArea.deleteFrom(sceneArea)
    return
  }
  AvatarModifierArea.create(sceneArea, {
    area: Vector3.create(128, 50, 32),
    excludeIds: [],
    modifiers: [AvatarModifierType.AMT_DISABLE_NAMETAG_CULLING]
  })
}

function spawnNpc(name: string, position: Vector3): Entity {
  const npc = engine.addEntity()
  Transform.create(npc, { position, rotation: Quaternion.fromEulerDegrees(0, -90, 0) })
  AvatarShape.create(npc, {
    id: `npc-${name}`,
    name,
    bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale',
    wearables: [],
    emotes: []
  })
  return npc
}
