import {
  EasingFunction,
  Entity,
  MeshCollider,
  Transform,
  TriggerArea,
  Tween,
  TweenLoop,
  TweenSequence,
  TweenState,
  engine,
  triggerAreaEventsSystem
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
  CANARY_PERIOD_MS,
  CANARY_SCALE,
  CANARY_X,
  CANARY_Z,
  PLATFORM_MS,
  PLATFORM_SCALE,
  PLATFORM_Z_END,
  PLATFORM_Z_START,
  RIG_SAMPLE_HZ,
  RIG_Y,
  SERVER_LANE_X,
  TRIGGER_LAYER,
  ZONE_SCALE,
  ZONE_Z
} from '../shared/config'
import { LiveRig } from '../shared/schemas'

// ---------------------------------------------------------------------------
// The always-on live rig: a platform the SERVER tweens back and forth, and a trigger
// zone the SERVER owns sitting across its path. It is the glanceable half of the
// scene — no clicking, no panel reading. One zone entry needs both features working
// at once, so `zoneEntries` climbing is positive proof and `zoneEntries` stuck at 0
// is the failure, visible from anywhere in the parcel.
//
// THE CANARY. A trigger area reports transitions only — there is no per-tick "still
// empty" answer the way a continuous raycast gives one. So a silent zone cannot, by
// itself, tell "the platform never arrived" from "this host has no trigger system",
// and those are the two cases the whole scene exists to separate. The canary closes
// that gap: a second area with a prober the server slides in and out on a timer using
// DIRECT Transform writes rather than a tween.
//
// To be clear about WHY, because the reason is not what it looks like: a tweened
// collider trips a trigger area perfectly well — that is exactly what the zone above
// measures, and what suite row #16 asserts. The canary avoids a tween because it must
// be INDEPENDENT of the tween system, not because a tween would fail to trip it. A
// tween-driven canary would sit motionless on a tween-less host, report zero events,
// and leave "no triggers" indistinguishable from "no tweens" — going silent on
// precisely the server it exists to speak up about.
//
// The three signals are therefore deliberately separable:
//   zoneEntries  needs tween AND trigger — the two working together
//   canaryEvents needs trigger only      — the trigger system alone
//   tweenState   needs tween only        — the tween system alone
// Any single failure stays attributable to the feature that caused it.
//
// Nothing here is synced. Syncing the platform would hand every client's own tween
// system a synced Transform to write back into (a feedback loop over the wire), and it
// would defeat the purpose: what clients need is the server's OWN reading, which is
// what LiveRig carries.
// ---------------------------------------------------------------------------

const START = Vector3.create(SERVER_LANE_X, RIG_Y, PLATFORM_Z_START)
const END = Vector3.create(SERVER_LANE_X, RIG_Y, PLATFORM_Z_END)

let stateEntity: Entity
let platform: Entity
let zone: Entity
let canaryProber: Entity

let zoneEntries = 0
let zoneOccupied = false
let canaryEvents = 0

export function initRig(entity: Entity): void {
  stateEntity = entity

  // --- The platform: tweened by the server, carrying a trigger-visible collider ---
  platform = engine.addEntity()
  Transform.create(platform, { position: START, scale: PLATFORM_SCALE })
  // A CUSTOM layer, not CL_PHYSICS: the zone must react to this platform and to
  // nothing else, and the platform must not become a surface anything else collides with.
  MeshCollider.setBox(platform, TRIGGER_LAYER)
  Tween.setMove(platform, START, END, PLATFORM_MS, EasingFunction.EF_LINEAR)
  // Empty sequence + TL_YOYO makes the base tween itself bounce forever.
  TweenSequence.create(platform, { sequence: [], loop: TweenLoop.TL_YOYO })

  // --- The zone: the headline. Needs the tween to deliver the platform. ---
  zone = engine.addEntity()
  Transform.create(zone, { position: Vector3.create(SERVER_LANE_X, RIG_Y, ZONE_Z), scale: ZONE_SCALE })
  TriggerArea.setBox(zone, TRIGGER_LAYER)
  triggerAreaEventsSystem.onTriggerEnter(zone, (result) => {
    if (result.trigger?.entity !== platform) return
    zoneEntries++
    zoneOccupied = true
  })
  triggerAreaEventsSystem.onTriggerExit(zone, (result) => {
    if (result.trigger?.entity !== platform) return
    zoneOccupied = false
  })

  // --- The canary: trigger liveness, independent of tweens. ---
  const canaryArea = engine.addEntity()
  Transform.create(canaryArea, {
    position: Vector3.create(CANARY_X, RIG_Y, CANARY_Z),
    scale: Vector3.create(CANARY_SCALE, CANARY_SCALE, CANARY_SCALE)
  })
  TriggerArea.setBox(canaryArea, TRIGGER_LAYER)
  triggerAreaEventsSystem.onTriggerEnter(canaryArea, () => {
    canaryEvents++
  })
  triggerAreaEventsSystem.onTriggerExit(canaryArea, () => {
    canaryEvents++
  })

  canaryProber = engine.addEntity()
  Transform.create(canaryProber, { position: canaryPosition(false) })
  MeshCollider.setBox(canaryProber, TRIGGER_LAYER)

  // Publish one sample immediately so a client joining before the first tick sees the
  // platform's start position rather than an all-zero component.
  publish()
}

// The canary prober's two parking spots: inside the canary area, and clear of it.
function canaryPosition(inside: boolean): Vector3 {
  return Vector3.create(CANARY_X + (inside ? 0 : CANARY_SCALE + 2), RIG_Y, CANARY_Z)
}

let canaryAcc = 0
let canaryInside = false
let sampleAcc = 0

export function rigSystem(dt: number): void {
  // --- Drive the canary on its own timer, with plain Transform writes. ---
  canaryAcc += dt
  if (canaryAcc >= CANARY_PERIOD_MS / 1000) {
    canaryAcc = 0
    canaryInside = !canaryInside
    Transform.getMutable(canaryProber).position = canaryPosition(canaryInside)
  }

  // --- Sample the rig into the synced component. ---
  // Unlike the raycast rig this needs no per-frame edge detector: the zone's own
  // enter/exit callbacks already fire on the exact tick of each transition, so a
  // crossing cannot be missed between samples the way a sampled hit test would miss it.
  sampleAcc += dt
  if (sampleAcc < 1 / RIG_SAMPLE_HZ) return
  sampleAcc = 0
  publish()
}

function publish(): void {
  const tweenState = TweenState.getOrNull(platform)
  const rig = LiveRig.getMutable(stateEntity)
  const position = Transform.get(platform).position
  rig.platformPosition = Vector3.create(position.x, position.y, position.z)
  // -1 means "no TweenState component at all", a different statement from any of the
  // TweenStateStatus values — the panel renders it as "not written".
  rig.tweenState = tweenState ? tweenState.state : -1
  rig.tweenProgress = tweenState ? tweenState.currentTime : 0
  rig.canaryEvents = canaryEvents
  rig.zoneOccupied = zoneOccupied
  rig.zoneEntries = zoneEntries
  rig.sampledAt = Date.now()
}
