import {
  ColliderLayer,
  EasingFunction,
  Entity,
  MeshCollider,
  Raycast,
  RaycastQueryType,
  RaycastResult,
  Transform,
  Tween
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
  COLLIDER_SETTLE_MS,
  HIT_LENGTH_EPSILON,
  LAB_Y,
  PROBE_TIMEOUT_MS,
  RAY_LANE_X,
  RAY_MAX_DISTANCE,
  RAY_ORIGIN_Z,
  RAY_SHORT_DISTANCE,
  RAY_TARGET_Z,
  TWEEN_DURATION_MS
} from '../config'
import { distance, entityScope, fmtV3, sampleFor, v3, waitUntil } from '../harness'
import { TestFn } from './types'

// ---------------------------------------------------------------------------
// The Raycast half of the suite. The host obligation here is: given a Raycast
// component, resolve it against the scene's colliders and attach a RaycastResult
// on the same entity — even on a miss, where the result carries an empty hits[].
//
// A host with no raycast system attaches nothing at all, so every test in this
// group can only end on the probe timeout. Note what that means for reading the
// panel: "0 hits" and "no result at all" are completely different findings, and
// each detail string below says which one it saw.
// ---------------------------------------------------------------------------

const ORIGIN = Vector3.create(RAY_LANE_X, LAB_Y, RAY_ORIGIN_Z)

// A default MeshCollider box is 1 m per side, so a box centred at z spans z±0.5
// and a +Z ray from ORIGIN meets its near face at (z - 0.5) - RAY_ORIGIN_Z.
function expectedHitLength(targetZ: number): number {
  return targetZ - 0.5 - RAY_ORIGIN_Z
}

// A collider target in the ray's lane. Carries no MeshRenderer: the suite also runs
// on the client, where an invisible collider 15 m up is harmless but a floating
// white box would be confusing.
function target(scope: { add(): Entity }, targetZ: number, layers?: ColliderLayer | ColliderLayer[]): Entity {
  const entity = scope.add()
  Transform.create(entity, { position: Vector3.create(RAY_LANE_X, LAB_Y, targetZ) })
  MeshCollider.setBox(entity, layers)
  return entity
}

const noResult = `no RaycastResult after ${PROBE_TIMEOUT_MS}ms — this host has no raycast system`

// Casts +Z from ORIGIN, once, and waits for the host to answer.
async function castOnce(
  scope: { add(): Entity },
  opts: { maxDistance: number; queryType: RaycastQueryType; collisionMask?: number; timestamp: number }
): Promise<{ entity: Entity; answered: boolean }> {
  const entity = scope.add()
  Transform.create(entity, { position: ORIGIN })
  Raycast.create(entity, {
    originOffset: Vector3.Zero(),
    direction: { $case: 'globalDirection', globalDirection: Vector3.Forward() },
    maxDistance: opts.maxDistance,
    queryType: opts.queryType,
    continuous: false,
    collisionMask: opts.collisionMask,
    timestamp: opts.timestamp
  })
  const answered = await waitUntil(() => RaycastResult.has(entity), PROBE_TIMEOUT_MS)
  return { entity, answered }
}

// ---------------------------------------------------------------------------
// Colliders do not become raycastable the instant their entity is created — the
// host needs a tick or more to register them, and the headless server needs
// measurably more than the renderer does. Waiting a single frame is NOT enough: it
// produced intermittent "2/3 boxes hit" and "CL_CUSTOM1 ray missed its own layer"
// failures against a server whose raycast was in fact working (observed in-world,
// two consecutive runs disagreeing). A harness that reports a race as a server bug
// is worse than no harness, so:
//
//   * every test that needs a collider waits for PROOF that the host can see it,
//     using ONE continuous caster it then reads its answer from, and
//   * every test whose pass condition is a MISS proves the collider is visible
//     FIRST — otherwise an unregistered collider would make it pass for the wrong
//     reason, which is the more dangerous failure of the two.
// ---------------------------------------------------------------------------
async function casterSeeing(
  scope: { add(): Entity },
  expected: Entity[],
  collisionMask: number | undefined,
  timestamp: number
): Promise<{ caster: Entity; answered: boolean; seen: number; ok: boolean }> {
  const caster = scope.add()
  Transform.create(caster, { position: ORIGIN })
  Raycast.create(caster, {
    originOffset: Vector3.Zero(),
    direction: { $case: 'globalDirection', globalDirection: Vector3.Forward() },
    maxDistance: RAY_MAX_DISTANCE,
    queryType: RaycastQueryType.RQT_QUERY_ALL,
    continuous: true, // re-cast every tick, so the predicate below sees fresh answers
    collisionMask,
    timestamp
  })

  let seen = 0
  let answered = false
  const ok = await waitUntil(() => {
    const result = RaycastResult.getOrNull(caster)
    if (!result) return false
    answered = true
    const ids = new Set(result.hits.map((hit) => hit.entityId))
    seen = expected.filter((entity) => ids.has(entity)).length
    return seen === expected.length
  }, COLLIDER_SETTLE_MS)

  return { caster, answered, seen, ok }
}

// #9 — THE raycast capability probe. Casts into empty space, where a working host
// still answers, with hits[] empty. Nothing else in this group can pass if this
// row fails. Deliberately a single non-continuous cast: that is the plain claim.
const probeRaycastResult: TestFn = async () => {
  const scope = entityScope()
  try {
    const { entity, answered } = await castOnce(scope, {
      maxDistance: RAY_MAX_DISTANCE,
      queryType: RaycastQueryType.RQT_HIT_FIRST,
      timestamp: 900
    })
    if (!answered) return { pass: false, detail: noResult }

    const result = RaycastResult.get(entity)
    if (result.hits.length !== 0) {
      return { pass: false, detail: `expected an empty hits[] in open space, got ${result.hits.length} hit(s)` }
    }
    return { pass: true, detail: `answered on tick ${result.tickNumber}, hits: [] (a miss still reports)` }
  } finally {
    scope.dispose()
  }
}

// #10 — Ray geometry. Uses the globalTarget direction mode and checks the ray the
// host reports back: the origin must be the entity's world position and the
// direction the normalized origin→target vector. Needs no colliders.
const rayGeometry: TestFn = async () => {
  const scope = entityScope()
  try {
    const goal = Vector3.create(RAY_LANE_X, LAB_Y + 5, RAY_ORIGIN_Z + 5)
    const entity = scope.add()
    Transform.create(entity, { position: ORIGIN })
    Raycast.create(entity, {
      originOffset: Vector3.Zero(),
      direction: { $case: 'globalTarget', globalTarget: goal },
      maxDistance: RAY_MAX_DISTANCE,
      queryType: RaycastQueryType.RQT_HIT_FIRST,
      continuous: false,
      timestamp: 910
    })

    const answered = await waitUntil(() => RaycastResult.has(entity), PROBE_TIMEOUT_MS)
    if (!answered) return { pass: false, detail: noResult }

    const result = RaycastResult.get(entity)
    const expectedDirection = Vector3.normalize(Vector3.subtract(goal, ORIGIN))
    if (distance(v3(result.globalOrigin), ORIGIN) > 0.01) {
      return { pass: false, detail: `globalOrigin ${fmtV3(result.globalOrigin)}, expected ${fmtV3(ORIGIN)}` }
    }
    if (distance(v3(result.direction), expectedDirection) > 0.01) {
      return { pass: false, detail: `direction ${fmtV3(result.direction)}, expected ${fmtV3(expectedDirection)}` }
    }
    return { pass: true, detail: `origin ${fmtV3(result.globalOrigin)}, dir ${fmtV3(result.direction)}` }
  } finally {
    scope.dispose()
  }
}

// #11 — Hits a MeshCollider. One box, one hit, and the reported entityId and
// distance both have to match — a hit with the wrong entityId would mean the host
// is answering from a different scene graph than the scene's.
const hitsCollider: TestFn = async () => {
  const scope = entityScope()
  try {
    const box = target(scope, RAY_TARGET_Z[0])
    const probe = await casterSeeing(scope, [box], undefined, 920)
    if (!probe.answered) return { pass: false, detail: noResult }
    if (!probe.ok) {
      return { pass: false, detail: `results arrived but the collider was never hit in ${COLLIDER_SETTLE_MS}ms` }
    }

    const hit = RaycastResult.get(probe.caster).hits.find((candidate) => candidate.entityId === box)!
    const expected = expectedHitLength(RAY_TARGET_Z[0])
    if (Math.abs(hit.length - expected) > HIT_LENGTH_EPSILON) {
      return { pass: false, detail: `length ${hit.length.toFixed(2)}m, expected ~${expected.toFixed(2)}m` }
    }
    return { pass: true, detail: `hit the box at ${hit.length.toFixed(2)}m, normal ${fmtV3(hit.normalHit)}` }
  } finally {
    scope.dispose()
  }
}

// #12 — RQT_QUERY_ALL. Three boxes in the ray's path must all come back. Only
// MEMBERSHIP is asserted, not order: the protocol guarantees no ordering (and
// RQT_HIT_FIRST is explicitly "first, not necessarily closest"), so asserting a
// sort here would fail a compliant host.
const queryAll: TestFn = async () => {
  const scope = entityScope()
  try {
    const boxes = RAY_TARGET_Z.map((z) => target(scope, z))
    const probe = await casterSeeing(scope, boxes, undefined, 930)
    if (!probe.answered) return { pass: false, detail: noResult }
    if (!probe.ok) {
      return { pass: false, detail: `${probe.seen}/${boxes.length} boxes hit after ${COLLIDER_SETTLE_MS}ms` }
    }

    const lengths = RaycastResult.get(probe.caster)
      .hits.map((hit) => hit.length.toFixed(1))
      .join(', ')
    return { pass: true, detail: `all ${boxes.length} boxes hit at [${lengths}] m` }
  } finally {
    scope.dispose()
  }
}

// #13 — maxDistance clipping. The nearest box sits 2.5 m out and the ray is 2 m
// long, so a host that honours maxDistance answers with an empty hits[].
// The collider is proven visible with a long ray FIRST: without that, an
// unregistered collider would make the short ray report zero hits and this test
// would pass for entirely the wrong reason.
const maxDistanceClipping: TestFn = async () => {
  const scope = entityScope()
  try {
    const box = target(scope, RAY_TARGET_Z[0])
    const probe = await casterSeeing(scope, [box], undefined, 940)
    if (!probe.answered) return { pass: false, detail: noResult }
    if (!probe.ok) {
      return { pass: false, detail: 'collider never became raycastable — cannot judge clipping' }
    }

    const short = await castOnce(scope, {
      maxDistance: RAY_SHORT_DISTANCE,
      queryType: RaycastQueryType.RQT_QUERY_ALL,
      timestamp: 941
    })
    if (!short.answered) return { pass: false, detail: noResult }

    const hits = RaycastResult.get(short.entity).hits
    if (hits.length > 0) {
      return {
        pass: false,
        detail: `${hits.length} hit(s) at ${hits[0].length.toFixed(2)}m through a ${RAY_SHORT_DISTANCE}m ray`
      }
    }
    return {
      pass: true,
      detail: `${RAY_SHORT_DISTANCE}m ray stopped short of the ${expectedHitLength(RAY_TARGET_Z[0]).toFixed(1)}m box`
    }
  } finally {
    scope.dispose()
  }
}

// #14 — collisionMask filtering. One box registered on CL_CUSTOM1 only, probed
// twice. Both halves must hold, and the POSITIVE half runs first so the negative
// half cannot pass merely because the collider had not registered yet: a mask that
// filters nothing and a mask that filters everything would each pass only one half.
const collisionMaskFiltering: TestFn = async () => {
  const scope = entityScope()
  try {
    const box = target(scope, RAY_TARGET_Z[0], ColliderLayer.CL_CUSTOM1)
    const custom = await casterSeeing(scope, [box], ColliderLayer.CL_CUSTOM1, 950)
    if (!custom.answered) return { pass: false, detail: noResult }
    if (!custom.ok) {
      return { pass: false, detail: `CL_CUSTOM1 ray never hit its own layer in ${COLLIDER_SETTLE_MS}ms` }
    }

    const physics = await castOnce(scope, {
      maxDistance: RAY_MAX_DISTANCE,
      queryType: RaycastQueryType.RQT_QUERY_ALL,
      collisionMask: ColliderLayer.CL_PHYSICS,
      timestamp: 951
    })
    if (!physics.answered) return { pass: false, detail: noResult }

    const physicsHits = RaycastResult.get(physics.entity).hits.length
    if (physicsHits > 0) {
      return { pass: false, detail: `CL_PHYSICS ray saw a CL_CUSTOM1-only collider (${physicsHits} hit(s))` }
    }
    return { pass: true, detail: 'CL_CUSTOM1 ray hit it, CL_PHYSICS ray missed it' }
  } finally {
    scope.dispose()
  }
}

// #15 — continuous re-casting. With continuous: true the host must re-resolve the
// ray every tick, which shows up as an advancing tickNumber. A host that answers
// once and stops would leave the number frozen — and a scene relying on a
// continuous ray (like the live rig's beam) would read stale hits forever.
const continuousRecasting: TestFn = async () => {
  const scope = entityScope()
  try {
    const entity = scope.add()
    Transform.create(entity, { position: ORIGIN })
    Raycast.create(entity, {
      originOffset: Vector3.Zero(),
      direction: { $case: 'globalDirection', globalDirection: Vector3.Forward() },
      maxDistance: RAY_MAX_DISTANCE,
      queryType: RaycastQueryType.RQT_HIT_FIRST,
      continuous: true,
      timestamp: 960
    })

    const answered = await waitUntil(() => RaycastResult.has(entity), PROBE_TIMEOUT_MS)
    if (!answered) return { pass: false, detail: noResult }

    const ticks = new Set<number>()
    await sampleFor(1500, () => {
      const result = RaycastResult.getOrNull(entity)
      if (result) ticks.add(result.tickNumber)
    })

    if (ticks.size < 3) {
      return { pass: false, detail: `tickNumber took only ${ticks.size} distinct value(s) in 1.5s` }
    }
    return { pass: true, detail: `re-cast across ${ticks.size} distinct ticks in 1.5s` }
  } finally {
    scope.dispose()
  }
}

// #16 — The interop test, and the live rig in miniature. A continuous ray watches a
// box that a TWEEN carries out of its path: passing requires the tween to move the
// box's Transform AND the raycast to resolve against that moved Transform.
//
// The box starts ON the ray and is only tweened once the host has confirmed it can
// see it. That ordering is what makes the result attributable: after the collider is
// proven visible, "the ray stopped seeing it" can only mean the tween moved it.
const rayTracksTween: TestFn = async () => {
  const scope = entityScope()
  try {
    const crossZ = RAY_TARGET_Z[0]
    const onPath = Vector3.create(RAY_LANE_X, LAB_Y, crossZ)
    const offPath = Vector3.create(RAY_LANE_X + 4, LAB_Y, crossZ)

    const box = scope.add()
    Transform.create(box, { position: onPath })
    MeshCollider.setBox(box)

    const probe = await casterSeeing(scope, [box], undefined, 970)
    if (!probe.answered) return { pass: false, detail: noResult }
    if (!probe.ok) {
      return { pass: false, detail: 'collider never became raycastable — cannot judge the interop' }
    }

    // Now carry it out of the beam and watch the ray lose it.
    Tween.setMove(box, onPath, offPath, TWEEN_DURATION_MS, EasingFunction.EF_LINEAR)

    let sawClear = false
    await sampleFor(TWEEN_DURATION_MS, () => {
      const result = RaycastResult.getOrNull(probe.caster)
      if (!result) return
      if (!result.hits.some((hit) => hit.entityId === box)) sawClear = true
    })

    if (!sawClear) {
      return { pass: false, detail: 'the ray still sees the box — the tween never moved it out of the path' }
    }
    return { pass: true, detail: 'the tween carried the box out of the ray, and the ray noticed' }
  } finally {
    scope.dispose()
  }
}

export const RAYCAST_SUITE: Record<string, TestFn> = {
  'raycast-result-appears': probeRaycastResult,
  'raycast-ray-geometry': rayGeometry,
  'raycast-hits-collider': hitsCollider,
  'raycast-query-all': queryAll,
  'raycast-max-distance': maxDistanceClipping,
  'raycast-collision-mask': collisionMaskFiltering,
  'raycast-continuous': continuousRecasting,
  'raycast-tracks-tween': rayTracksTween
}
