import {
  ColliderLayer,
  EasingFunction,
  Entity,
  MeshCollider,
  Transform,
  TriggerArea,
  TriggerAreaEventType,
  TriggerAreaResult,
  Tween,
  triggerAreaEventsSystem
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
  AREA_SCALE,
  LAB_Y,
  OTHER_LAYER,
  PROBER_CENTRE,
  PROBER_OUTSIDE,
  PROBER_SCALE_PROBE,
  PROBE_TIMEOUT_MS,
  TRIGGER_LANE_X,
  TRIGGER_LAYER,
  TRIGGER_SETTLE_MS,
  TWEEN_DURATION_MS
} from '../config'
import { EntityScope, entityScope, nextFrame, sampleFor, waitUntil } from '../harness'
import { TestFn } from './types'

// ---------------------------------------------------------------------------
// The TriggerArea half of the suite. The host obligation: given a TriggerArea and a
// collider on a layer it listens for, detect the overlap and record the transition
// into TriggerAreaResult, from which the SDK dispatches onTriggerEnter/Stay/Exit.
//
// A host with no trigger-area system records nothing, so every test here can only end
// on a timeout. Two properties of this component shape the whole file:
//
//   1. TriggerAreaResult is a GROW-ONLY VALUE SET (maxElements 100, keyed by a
//      timestampFunction), not a last-write-wins component. Its .get() has no
//      getOrNull companion and throws when absent, so every read is guarded by
//      .has(). Never count events by set size either — it is capped and cumulative.
//   2. A trigger reports TRANSITIONS ONLY. There is no "still nothing here" tick like
//      a continuous raycast gives you, so a silent area is genuinely ambiguous
//      between "nothing entered" and "this host cannot detect anything". Every test
//      below therefore causes a transition itself rather than waiting for one.
// ---------------------------------------------------------------------------

const AREA_POSITION = Vector3.create(TRIGGER_LANE_X, LAB_Y, 8)

// A trigger area at the lab position. The volume comes from Transform.scale.
function makeArea(scope: EntityScope, shape: 'box' | 'sphere', mask: ColliderLayer = TRIGGER_LAYER): Entity {
  const area = scope.add()
  Transform.create(area, { position: AREA_POSITION, scale: Vector3.create(AREA_SCALE, AREA_SCALE, AREA_SCALE) })
  if (shape === 'sphere') TriggerArea.setSphere(area, mask)
  else TriggerArea.setBox(area, mask)
  return area
}

// A 1 m collider box that can trip an area. It carries a CUSTOM layer, never
// CL_PLAYER/CL_PHYSICS, so it is inert to everything else in the scene. It has no
// MeshRenderer: the suite runs on the client too, and an unexplained box 15 m up
// would be worse than an invisible one.
function makeProber(scope: EntityScope, layer: ColliderLayer, offset: number): Entity {
  const prober = scope.add()
  Transform.create(prober, { position: proberPosition(offset) })
  MeshCollider.setBox(prober, layer)
  return prober
}

function proberPosition(offset: number): Vector3 {
  return Vector3.create(AREA_POSITION.x + offset, AREA_POSITION.y, AREA_POSITION.z)
}

function moveProber(prober: Entity, offset: number): void {
  Transform.getMutable(prober).position = proberPosition(offset)
}

// --- Event capture ------------------------------------------------------------------
type Result = { eventType: TriggerAreaEventType; triggeredEntity: number; trigger?: { entity: number } }

interface Watcher {
  enters: Result[]
  exits: Result[]
  stays: number
}

// Registers the three SDK callbacks and records what arrives. Detached through the
// scope: the callbacks live in an SDK-side map keyed by entity, so leaving them
// attached would keep a dead closure alive into the next test.
function watchArea(scope: EntityScope, area: Entity): Watcher {
  const watcher: Watcher = { enters: [], exits: [], stays: 0 }
  triggerAreaEventsSystem.onTriggerEnter(area, (result) => {
    watcher.enters.push(result as unknown as Result)
  })
  triggerAreaEventsSystem.onTriggerExit(area, (result) => {
    watcher.exits.push(result as unknown as Result)
  })
  triggerAreaEventsSystem.onTriggerStay(area, () => {
    watcher.stays++
  })
  scope.onDispose(() => {
    triggerAreaEventsSystem.removeOnTriggerEnter(area)
    triggerAreaEventsSystem.removeOnTriggerExit(area)
    triggerAreaEventsSystem.removeOnTriggerStay(area)
  })
  return watcher
}

const noResult = `no TriggerAreaResult after ${PROBE_TIMEOUT_MS}ms — this host has no trigger-area system`
const noEnter = `onTriggerEnter never fired within ${TRIGGER_SETTLE_MS}ms`

// Drives one prober into the area and waits for the entry. Used as a PRECONDITION by
// the tests whose real assertion is about something else — the same discipline the
// raycast suite needed: prove the mechanism is live before drawing a conclusion from
// its silence, or an unregistered collider passes a negative test for the wrong reason.
async function proveEntry(prober: Entity, watcher: Watcher, offset = PROBER_CENTRE): Promise<boolean> {
  const before = watcher.enters.length
  moveProber(prober, offset)
  return waitUntil(() => watcher.enters.length > before, TRIGGER_SETTLE_MS)
}

async function proveExit(prober: Entity, watcher: Watcher): Promise<boolean> {
  const before = watcher.exits.length
  moveProber(prober, PROBER_OUTSIDE)
  return waitUntil(() => watcher.exits.length > before, TRIGGER_SETTLE_MS)
}

// #9 — THE trigger capability probe. Reads the raw component rather than the SDK
// callbacks, so it answers the narrowest possible question: did the host record
// anything at all? Nothing else in this group can pass if this row fails.
const probeTriggerResult: TestFn = async () => {
  const scope = entityScope()
  try {
    const area = makeArea(scope, 'box')
    const prober = makeProber(scope, TRIGGER_LAYER, PROBER_OUTSIDE)
    await nextFrame() // let the area and the collider register before moving

    moveProber(prober, PROBER_CENTRE)
    const written = await waitUntil(() => TriggerAreaResult.has(area), PROBE_TIMEOUT_MS)
    if (!written) return { pass: false, detail: noResult }

    // .get() throws when absent, hence the .has() guard above.
    const events = TriggerAreaResult.get(area)
    return { pass: true, detail: `TriggerAreaResult written — ${events.size} event(s) on the area` }
  } finally {
    scope.dispose()
  }
}

// #10 — onTriggerEnter, and the identity fields. `trigger.entity` is what entered;
// `triggeredEntity` is the AREA. The names invite the opposite reading, and a scene
// that mixes them up silently never filters anything, so both are asserted here.
const enterEvent: TestFn = async () => {
  const scope = entityScope()
  try {
    const area = makeArea(scope, 'box')
    const prober = makeProber(scope, TRIGGER_LAYER, PROBER_OUTSIDE)
    const watcher = watchArea(scope, area)
    await nextFrame()

    if (!(await proveEntry(prober, watcher))) return { pass: false, detail: noEnter }

    const event = watcher.enters[0]
    if (event.eventType !== TriggerAreaEventType.TAET_ENTER) {
      return { pass: false, detail: `eventType was ${event.eventType}, expected TAET_ENTER` }
    }
    if (event.trigger?.entity !== prober) {
      return { pass: false, detail: `trigger.entity was ${event.trigger?.entity}, expected the prober (${prober})` }
    }
    if (event.triggeredEntity !== area) {
      return { pass: false, detail: `triggeredEntity was ${event.triggeredEntity}, expected the area (${area})` }
    }
    return { pass: true, detail: 'TAET_ENTER; trigger.entity = prober, triggeredEntity = area' }
  } finally {
    scope.dispose()
  }
}

// #11 — onTriggerExit. Leaving has to be tracked too; an area that only ever fires
// ENTER leaves every "is the player still in the zone?" scene stuck on.
const exitEvent: TestFn = async () => {
  const scope = entityScope()
  try {
    const area = makeArea(scope, 'box')
    const prober = makeProber(scope, TRIGGER_LAYER, PROBER_OUTSIDE)
    const watcher = watchArea(scope, area)
    await nextFrame()

    if (!(await proveEntry(prober, watcher))) return { pass: false, detail: noEnter }
    if (!(await proveExit(prober, watcher))) {
      return { pass: false, detail: 'entered but onTriggerExit never fired on the way out' }
    }

    const event = watcher.exits[0]
    if (event.eventType !== TriggerAreaEventType.TAET_EXIT) {
      return { pass: false, detail: `eventType was ${event.eventType}, expected TAET_EXIT` }
    }
    return { pass: true, detail: `enter then exit, both reported (${watcher.enters.length}/${watcher.exits.length})` }
  } finally {
    scope.dispose()
  }
}

// #12 — onTriggerStay. NOTE what this actually tests: the SDK synthesizes stay
// callbacks per tick between a wire ENTER and a wire EXIT, so it exercises the host's
// ENTER plus the SDK's state machine, not a host-side stay event. Wire TAET_STAY
// events are ignored by the SDK entirely.
const stayEvent: TestFn = async () => {
  const scope = entityScope()
  try {
    const area = makeArea(scope, 'box')
    const prober = makeProber(scope, TRIGGER_LAYER, PROBER_OUTSIDE)
    const watcher = watchArea(scope, area)
    await nextFrame()

    if (!(await proveEntry(prober, watcher))) return { pass: false, detail: noEnter }

    const before = watcher.stays
    await sampleFor(1000, () => {})
    const during = watcher.stays - before

    if (during < 3) {
      return { pass: false, detail: `${during} stay callback(s) in 1s while parked inside — expected a per-tick stream` }
    }
    return { pass: true, detail: `${during} stay callbacks in 1s while inside` }
  } finally {
    scope.dispose()
  }
}

// #13 — collisionMask filtering. The POSITIVE half runs first: if the negative half
// ran first it would pass on a host that detects nothing at all, which is precisely
// the host this scene exists to catch.
const collisionMaskFiltering: TestFn = async () => {
  const scope = entityScope()
  try {
    const area = makeArea(scope, 'box', TRIGGER_LAYER)
    const matching = makeProber(scope, TRIGGER_LAYER, PROBER_OUTSIDE)
    const other = makeProber(scope, OTHER_LAYER, PROBER_OUTSIDE)
    const watcher = watchArea(scope, area)
    await nextFrame()

    if (!(await proveEntry(matching, watcher))) {
      return { pass: false, detail: `the area never fired for its OWN layer — ${noEnter}` }
    }
    if (!(await proveExit(matching, watcher))) {
      return { pass: false, detail: 'matching prober entered but never exited — cannot test the other layer cleanly' }
    }

    // Now the off-layer prober. Its entry must produce nothing.
    const before = watcher.enters.length
    moveProber(other, PROBER_CENTRE)
    const fired = await waitUntil(() => watcher.enters.length > before, TRIGGER_SETTLE_MS)
    if (fired) {
      return { pass: false, detail: 'the area fired for a collider on a layer it does not listen for' }
    }
    return { pass: true, detail: 'fired for its own layer, silent for the other' }
  } finally {
    scope.dispose()
  }
}

// #14 — the volume comes from Transform.scale. The prober stops at a point that lies
// inside the SCALED box but outside a unit-sized default one, so a host that ignored
// scale reports nothing and fails here rather than passing by accident.
const volumeFromScale: TestFn = async () => {
  const scope = entityScope()
  try {
    const area = makeArea(scope, 'box')
    const prober = makeProber(scope, TRIGGER_LAYER, PROBER_OUTSIDE)
    const watcher = watchArea(scope, area)
    await nextFrame()

    if (!(await proveEntry(prober, watcher, PROBER_SCALE_PROBE))) {
      return {
        pass: false,
        detail: `nothing at ${PROBER_SCALE_PROBE}m — inside a scale-${AREA_SCALE} box, outside an unscaled one`
      }
    }
    return { pass: true, detail: `entered at ${PROBER_SCALE_PROBE}m out — the scale-${AREA_SCALE} volume was honoured` }
  } finally {
    scope.dispose()
  }
}

// #15 — the sphere mesh type. Asserts only that a sphere area completes an
// enter/exit cycle: the exact radius-from-scale convention is not something the
// protocol pins down, so asserting a boundary would test the host against a rule it
// never agreed to (the same reason the raycast suite never asserted hit order).
const sphereArea: TestFn = async () => {
  const scope = entityScope()
  try {
    const area = makeArea(scope, 'sphere')
    const prober = makeProber(scope, TRIGGER_LAYER, PROBER_OUTSIDE)
    const watcher = watchArea(scope, area)
    await nextFrame()

    if (!(await proveEntry(prober, watcher))) return { pass: false, detail: `sphere area: ${noEnter}` }
    if (!(await proveExit(prober, watcher))) return { pass: false, detail: 'sphere area entered but never exited' }
    return { pass: true, detail: 'sphere area reported both enter and exit' }
  } finally {
    scope.dispose()
  }
}

// #16 — The interop test, and the live rig in miniature. The area is proven live with a
// hand-moved collider FIRST; only then does a tween carry the collider in. That
// ordering is what makes the result attributable: after the area has demonstrably
// fired, a missing second entry can only mean the tween failed to move anything.
const areaTracksTween: TestFn = async () => {
  const scope = entityScope()
  try {
    const area = makeArea(scope, 'box')
    const prober = makeProber(scope, TRIGGER_LAYER, PROBER_OUTSIDE)
    const watcher = watchArea(scope, area)
    await nextFrame()

    if (!(await proveEntry(prober, watcher))) {
      return { pass: false, detail: `the area never fired even for a hand-moved collider — ${noEnter}` }
    }
    if (!(await proveExit(prober, watcher))) {
      return { pass: false, detail: 'could not get the prober back out to set up the tween leg' }
    }

    // The only new variable from here on is the tween.
    const before = watcher.enters.length
    Tween.setMove(
      prober,
      proberPosition(PROBER_OUTSIDE),
      proberPosition(PROBER_CENTRE),
      TWEEN_DURATION_MS,
      EasingFunction.EF_LINEAR
    )
    const fired = await waitUntil(() => watcher.enters.length > before, TWEEN_DURATION_MS + TRIGGER_SETTLE_MS)
    if (!fired) {
      return { pass: false, detail: 'the tween never carried the collider into the area' }
    }
    return { pass: true, detail: 'a tween carried the collider in, and the area noticed' }
  } finally {
    scope.dispose()
  }
}

export const TRIGGER_SUITE: Record<string, TestFn> = {
  'trigger-result-appears': probeTriggerResult,
  'trigger-enter-event': enterEvent,
  'trigger-exit-event': exitEvent,
  'trigger-stay-event': stayEvent,
  'trigger-collision-mask': collisionMaskFiltering,
  'trigger-volume-from-scale': volumeFromScale,
  'trigger-sphere-mesh': sphereArea,
  'trigger-tracks-tween': areaTracksTween
}
