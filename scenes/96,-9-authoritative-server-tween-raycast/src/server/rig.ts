import {
  ColliderLayer,
  EasingFunction,
  Entity,
  MeshCollider,
  Raycast,
  RaycastQueryType,
  RaycastResult,
  Transform,
  Tween,
  TweenLoop,
  TweenSequence,
  TweenState,
  engine
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
  BEAM_LENGTH,
  BEAM_X_START,
  BEAM_Z,
  PLATFORM_MS,
  PLATFORM_SCALE,
  PLATFORM_Z_END,
  PLATFORM_Z_START,
  RIG_SAMPLE_HZ,
  RIG_Y,
  SERVER_LANE_X
} from '../shared/config'
import { LiveRig } from '../shared/schemas'

// ---------------------------------------------------------------------------
// The always-on live rig: a platform the SERVER tweens back and forth, and a
// continuous ray the SERVER casts across its path. It is the glanceable half of
// the scene — no clicking, no panel reading. One beam break needs both features
// working at once, so `beamBreaks` climbing is a positive proof and `beamBreaks`
// stuck at 0 is the failure, visible from anywhere in the parcel.
//
// Neither entity is synced. Syncing the platform would hand every client's own
// tween system a synced Transform to write back into (a feedback loop over the
// wire), and it would also defeat the purpose: what clients need to see is the
// server's OWN reading of where its platform is, which is what LiveRig carries.
// ---------------------------------------------------------------------------

const START = Vector3.create(SERVER_LANE_X, RIG_Y, PLATFORM_Z_START)
const END = Vector3.create(SERVER_LANE_X, RIG_Y, PLATFORM_Z_END)

let stateEntity: Entity
let platform: Entity
let beam: Entity

// Distinct RaycastResult ticks seen, and the hit/clear edge detector behind beamBreaks.
let rayTicks = 0
let lastRayTick = -1
let wasHit = false
let beamBreaks = 0

export function initRig(entity: Entity): void {
  stateEntity = entity

  platform = engine.addEntity()
  Transform.create(platform, { position: START, scale: PLATFORM_SCALE })
  MeshCollider.setBox(platform) // default layers include CL_PHYSICS — what the beam looks for
  Tween.setMove(platform, START, END, PLATFORM_MS, EasingFunction.EF_LINEAR)
  // Empty sequence + TL_YOYO makes the base tween itself bounce forever.
  TweenSequence.create(platform, { sequence: [], loop: TweenLoop.TL_YOYO })

  beam = engine.addEntity()
  Transform.create(beam, { position: Vector3.create(BEAM_X_START, RIG_Y, BEAM_Z) })
  Raycast.create(beam, {
    originOffset: Vector3.Zero(),
    direction: { $case: 'globalDirection', globalDirection: Vector3.Right() },
    maxDistance: BEAM_LENGTH,
    queryType: RaycastQueryType.RQT_QUERY_ALL,
    continuous: true,
    collisionMask: ColliderLayer.CL_PHYSICS,
    timestamp: 1
  })

  // Publish one sample immediately so a client joining before the first tick sees
  // the platform's start position rather than an all-zero component.
  publish(-1)
}

// Sampled, not per-frame: this is a status readout, not an animation channel.
// Clients animate their own local twin at full frame rate and only compare it
// against these samples.
let sampleAcc = 0
export function rigSystem(dt: number): void {
  sampleAcc += dt

  // The edge detector has to run EVERY frame, not once per sample: the platform
  // crosses the 2 m-wide beam in a fraction of a second, and an 8 Hz sampler would
  // regularly step straight over the crossing and report zero breaks on a server
  // that is in fact working correctly.
  const result = RaycastResult.getOrNull(beam)
  let hitLength = -1
  if (result) {
    if (result.tickNumber !== lastRayTick) {
      lastRayTick = result.tickNumber
      rayTicks++
    }
    const hit = result.hits.find((candidate) => candidate.entityId === platform)
    if (hit) hitLength = hit.length
  }
  const isHit = hitLength >= 0
  if (isHit && !wasHit) beamBreaks++
  wasHit = isHit

  if (sampleAcc < 1 / RIG_SAMPLE_HZ) return
  sampleAcc = 0
  publish(hitLength)
}

function publish(hitLength: number): void {
  const tweenState = TweenState.getOrNull(platform)
  const rig = LiveRig.getMutable(stateEntity)
  const position = Transform.get(platform).position
  rig.platformPosition = Vector3.create(position.x, position.y, position.z)
  // -1 means "no TweenState component at all", which is a different statement from
  // any of the TweenStateStatus values — the panel renders it as "not written".
  rig.tweenState = tweenState ? tweenState.state : -1
  rig.tweenProgress = tweenState ? tweenState.currentTime : 0
  rig.rayTicks = rayTicks
  rig.beamHitLength = hitLength
  rig.beamBreaks = beamBreaks
  rig.sampledAt = Date.now()
}
