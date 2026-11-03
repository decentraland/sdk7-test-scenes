import { AvatarNametag, AvatarShape, engine, Entity, MainCamera, Transform, VirtualCamera } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { setupUi } from './ui'

// Spawn is x:[2,4] z:[14,18], looking toward +x. The row sits on z = 16, so each NPC's distance
// from the spawn is roughly its distance from the camera in third person.
const SPAWN_X = 3
const ROW_Z = 16
const ROW_DISTANCES = [10, 30, 60, 100]

const TAGGED_NPC_DISTANCE = 25
const TAG_MAX_DISTANCE = 15

const CAMERA_NAMETAG_MAX_DISTANCE = 200

const CROWD_COLUMNS = 15
const CROWD_ROWS = 8

export type CameraStep = 'regular' | 'topDown' | 'topDownWithDistance'

let topDownCamera: Entity
const crowd: Entity[] = []
let cameraStep: CameraStep = 'regular'

export function main() {
  for (const distance of ROW_DISTANCES) {
    spawnNpc(`NPC ${distance} m`, Vector3.create(SPAWN_X + distance, 0, ROW_Z))
  }

  const taggedNpc = spawnNpc(
    `Tagged ${TAGGED_NPC_DISTANCE} m`,
    Vector3.create(SPAWN_X + TAGGED_NPC_DISTANCE, 0, ROW_Z + 4)
  )
  AvatarNametag.create(taggedNpc, { label: `max ${TAG_MAX_DISTANCE} m`, maxDistance: TAG_MAX_DISTANCE })
  AvatarNametag.create(engine.PlayerEntity, { label: `You: max ${TAG_MAX_DISTANCE} m`, maxDistance: TAG_MAX_DISTANCE })

  // 75 m above the row, looking straight down; stays under the 16-parcel height limit (~81 m).
  // The narrow fov frames the whole row, every nametag is beyond the 40 m default.
  topDownCamera = engine.addEntity()
  Transform.create(topDownCamera, {
    position: Vector3.create(53, 75, ROW_Z),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0)
  })
  VirtualCamera.create(topDownCamera, { fov: 45 })

  setupUi()
}

export function getCameraStep(): CameraStep {
  return cameraStep
}

export function setCameraStep(step: CameraStep) {
  cameraStep = step

  if (step === 'regular') {
    MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: undefined })
    return
  }

  VirtualCamera.getMutable(topDownCamera).nametagMaxDistance =
    step === 'topDownWithDistance' ? CAMERA_NAMETAG_MAX_DISTANCE : undefined
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: topDownCamera })
}

export function isCrowdSpawned(): boolean {
  return crowd.length > 0
}

export function toggleCrowd() {
  if (crowd.length > 0) {
    for (const npc of crowd) engine.removeEntity(npc)
    crowd.length = 0
    return
  }

  // 15 x 8 grid at x:[8,36] z:[1,12.2], between the spawn and the far end of the row.
  for (let column = 0; column < CROWD_COLUMNS; column++) {
    for (let row = 0; row < CROWD_ROWS; row++) {
      const index = column * CROWD_ROWS + row + 1
      crowd.push(spawnNpc(`Crowd ${index}`, Vector3.create(8 + column * 2, 0, 1 + row * 1.6)))
    }
  }
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
