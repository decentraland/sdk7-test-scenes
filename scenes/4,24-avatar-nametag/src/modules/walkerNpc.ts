import { AvatarNametag, AvatarShape, engine, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

// Walking NPC that patrols a short line, keeping its AvatarNametag plate present the whole time,
// so the plate can be observed following a moving avatar -- the two static NPCs in index.ts only
// exercise the plate at rest. Confined to x=2, z:[4,14]: clear of the spawn area (x:[0,3]
// z:[0,3]), both static NPCs (x:6/9, z:6) and the walk-in modifier zone (x:[11,15] z:[11,15]).
const PATROL_FROM = Vector3.create(2, 0, 4)
const PATROL_TO = Vector3.create(2, 0, 14)
const PATROL_LENGTH = Vector3.distance(PATROL_FROM, PATROL_TO)
// Slow enough to walk alongside without sprinting.
const SPEED = 2

const FORWARD_ROTATION = Quaternion.lookRotation(Vector3.subtract(PATROL_TO, PATROL_FROM))
const BACKWARD_ROTATION = Quaternion.lookRotation(Vector3.subtract(PATROL_FROM, PATROL_TO))

const walker = engine.addEntity()

let progress = 0
let forward = true

export function setupWalkerNpc() {
  Transform.create(walker, { position: PATROL_FROM, rotation: FORWARD_ROTATION })
  AvatarShape.create(walker, {
    id: 'npc-walker',
    name: 'Walker',
    bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale',
    wearables: [],
    emotes: []
  })
  AvatarNametag.create(walker, { label: 'PATROL' })

  engine.addSystem(walkerPatrolSystem)
}

function walkerPatrolSystem(dt: number) {
  progress += ((forward ? 1 : -1) * SPEED * dt) / PATROL_LENGTH

  if (progress >= 1) {
    progress = 1
    forward = false
  } else if (progress <= 0) {
    progress = 0
    forward = true
  }

  const transform = Transform.getMutable(walker)
  transform.position = Vector3.lerp(PATROL_FROM, PATROL_TO, progress)
  transform.rotation = forward ? FORWARD_ROTATION : BACKWARD_ROTATION
}
