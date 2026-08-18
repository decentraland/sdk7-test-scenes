import {
  EasingFunction,
  Transform,
  Tween,
  TweenLoop,
  TweenSequence,
  TweenState,
  TweenStateStatus,
  tweenSystem
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  LAB_Y,
  LINEARITY_TOLERANCE,
  POS_EPSILON,
  PROBE_TIMEOUT_MS,
  ROT_DOT_EPSILON,
  SCALE_EPSILON,
  TWEEN_DURATION_MS,
  TWEEN_LANE_X,
  TWEEN_SLACK_MS,
  TWEEN_TRAVEL
} from '../config'
import {
  distance,
  entityScope,
  fmtV3,
  pollInSystem,
  progressAlong,
  quaternionError,
  sampleFor,
  v3,
  waitUntil
} from '../harness'
import { TestFn } from './types'

// ---------------------------------------------------------------------------
// The Tween half of the suite. Every test here rests on one host obligation:
// while a Tween is active the host must interpolate the entity's Transform and
// write it back to the scene, and must attach a TweenState reporting progress.
// A host with no tween system leaves both untouched — the entity simply sits at
// whatever the scene last wrote — so each test below ends on a timeout or on a
// zero-progress reading rather than on an error. That is why none of them throw:
// "nothing happened" IS the result being measured.
// ---------------------------------------------------------------------------

// The travel lane, laid out along +Z so the whole move fits inside the parcel.
const START = Vector3.create(TWEEN_LANE_X, LAB_Y, 2)
const END = Vector3.create(TWEEN_LANE_X, LAB_Y, 2 + TWEEN_TRAVEL)

// TweenStateStatus is a const enum, so there is no runtime reverse lookup — the
// name has to come from a switch.
function statusName(state: TweenStateStatus | undefined): string {
  switch (state) {
    case TweenStateStatus.TS_ACTIVE:
      return 'TS_ACTIVE'
    case TweenStateStatus.TS_COMPLETED:
      return 'TS_COMPLETED'
    case TweenStateStatus.TS_PAUSED:
      return 'TS_PAUSED'
    default:
      return 'none'
  }
}

// #0 — THE tween capability probe. Nothing else in this group can pass if the
// host does not attach TweenState, so this is the row to read first.
const probeTweenState: TestFn = async () => {
  const scope = entityScope()
  try {
    const entity = scope.add()
    Transform.create(entity, { position: START })
    Tween.setMove(entity, START, END, TWEEN_DURATION_MS, EasingFunction.EF_LINEAR)

    const attached = await waitUntil(() => TweenState.has(entity), PROBE_TIMEOUT_MS)
    if (!attached) {
      return {
        pass: false,
        detail: `no TweenState after ${PROBE_TIMEOUT_MS}ms — this host has no tween system`
      }
    }

    const state = TweenState.get(entity)
    return { pass: true, detail: `TweenState attached — ${statusName(state.state)}, t=${state.currentTime.toFixed(2)}` }
  } finally {
    scope.dispose()
  }
}

// #1 — Transform write-back. The host must publish the INTERPOLATED position back
// to the scene while the tween runs; a mid-flight sample strictly between the two
// endpoints is the proof. (A host that only snapped to the end value would show
// progress 0 for the whole flight and then 1 — no intermediate sample.)
const transformWriteback: TestFn = async () => {
  const scope = entityScope()
  try {
    const entity = scope.add()
    Transform.create(entity, { position: START })
    Tween.setMove(entity, START, END, TWEEN_DURATION_MS, EasingFunction.EF_LINEAR)

    let samples = 0
    let midFlight = 0
    let maxProgress = 0
    await sampleFor(TWEEN_DURATION_MS, () => {
      const progress = progressAlong(START, END, v3(Transform.get(entity).position))
      samples++
      maxProgress = Math.max(maxProgress, progress)
      if (progress > 0.05 && progress < 0.95) midFlight++
    })

    if (midFlight === 0) {
      return {
        pass: false,
        detail: `no interpolated sample in ${samples} reads — max progress ${maxProgress.toFixed(2)}, position never moved`
      }
    }
    return { pass: true, detail: `${midFlight}/${samples} samples mid-flight, max progress ${maxProgress.toFixed(2)}` }
  } finally {
    scope.dispose()
  }
}

// #2 — Completion. Owns the TS_COMPLETED claim for the whole group: the state must
// flip AND the Transform must be sitting on the end value when it does.
const tweenCompletes: TestFn = async () => {
  const scope = entityScope()
  try {
    const entity = scope.add()
    Transform.create(entity, { position: START })
    Tween.setMove(entity, START, END, TWEEN_DURATION_MS, EasingFunction.EF_LINEAR)

    const completed = await waitUntil(
      () => TweenState.getOrNull(entity)?.state === TweenStateStatus.TS_COMPLETED,
      TWEEN_DURATION_MS + TWEEN_SLACK_MS
    )
    const finalPosition = v3(Transform.get(entity).position)
    const error = distance(finalPosition, END)

    if (!completed) {
      const state = TweenState.getOrNull(entity)
      return {
        pass: false,
        detail: `never reached TS_COMPLETED (state=${statusName(state?.state)}), ended at ${fmtV3(finalPosition)}`
      }
    }
    if (error > POS_EPSILON) {
      return { pass: false, detail: `completed but landed ${error.toFixed(2)}m off — at ${fmtV3(finalPosition)}` }
    }
    return { pass: true, detail: `TS_COMPLETED, landed on ${fmtV3(finalPosition)} (${error.toFixed(3)}m off)` }
  } finally {
    scope.dispose()
  }
}

// #3 — Easing. Compares every mid-flight sample against the ideal linear curve at
// that same instant. Only the 0.15–0.85 window counts: the write-back trails the
// true position by a frame or two, which is proportionally largest at the ends.
const linearCurve: TestFn = async () => {
  const scope = entityScope()
  try {
    const entity = scope.add()
    Transform.create(entity, { position: START })
    Tween.setMove(entity, START, END, TWEEN_DURATION_MS, EasingFunction.EF_LINEAR)

    let counted = 0
    let maxError = 0
    await sampleFor(TWEEN_DURATION_MS, (elapsed) => {
      const expected = elapsed / TWEEN_DURATION_MS
      if (expected < 0.15 || expected > 0.85) return
      const actual = progressAlong(START, END, v3(Transform.get(entity).position))
      counted++
      maxError = Math.max(maxError, Math.abs(actual - expected))
    })

    if (counted < 3) {
      return { pass: false, detail: `only ${counted} usable samples — engine ticking too slowly to judge the curve` }
    }
    if (maxError > LINEARITY_TOLERANCE) {
      return {
        pass: false,
        detail: `max deviation ${maxError.toFixed(2)} over ${counted} samples (tolerance ${LINEARITY_TOLERANCE})`
      }
    }
    return { pass: true, detail: `max deviation ${maxError.toFixed(3)} over ${counted} samples` }
  } finally {
    scope.dispose()
  }
}

// #4 — Rotate mode. Asserts the end ROTATION only; TS_COMPLETED is test #2's job,
// so a host that lands the rotation but skips the state still passes here and the
// detail says so. Quaternions are double-covered, hence the |dot| comparison.
const rotateMode: TestFn = async () => {
  const scope = entityScope()
  try {
    const entity = scope.add()
    const from = Quaternion.fromEulerDegrees(0, 0, 0)
    const to = Quaternion.fromEulerDegrees(0, 180, 0)
    Transform.create(entity, { position: START, rotation: from })
    Tween.setRotate(entity, from, to, TWEEN_DURATION_MS, EasingFunction.EF_LINEAR)

    const completed = await waitUntil(
      () => TweenState.getOrNull(entity)?.state === TweenStateStatus.TS_COMPLETED,
      TWEEN_DURATION_MS + TWEEN_SLACK_MS
    )
    const final = Transform.get(entity).rotation
    const error = quaternionError(Quaternion.create(final.x, final.y, final.z, final.w), to)

    if (error > ROT_DOT_EPSILON) {
      return {
        pass: false,
        detail: `rotation off by ${error.toFixed(4)} (1-|dot|)${completed ? '' : ', and never reached TS_COMPLETED'}`
      }
    }
    return {
      pass: true,
      detail: `rotated to the end quaternion (err ${error.toFixed(5)})${completed ? '' : ' — but no TS_COMPLETED'}`
    }
  } finally {
    scope.dispose()
  }
}

// #5 — Scale mode. Same shape as #4, on Transform.scale.
const scaleMode: TestFn = async () => {
  const scope = entityScope()
  try {
    const entity = scope.add()
    const from = Vector3.One()
    const to = Vector3.create(3, 3, 3)
    Transform.create(entity, { position: START, scale: from })
    Tween.setScale(entity, from, to, TWEEN_DURATION_MS, EasingFunction.EF_LINEAR)

    const completed = await waitUntil(
      () => TweenState.getOrNull(entity)?.state === TweenStateStatus.TS_COMPLETED,
      TWEEN_DURATION_MS + TWEEN_SLACK_MS
    )
    const final = v3(Transform.get(entity).scale)
    const error = distance(final, to)

    if (error > SCALE_EPSILON) {
      return {
        pass: false,
        detail: `scale ${fmtV3(final)}, ${error.toFixed(2)} off the end value${completed ? '' : ', no TS_COMPLETED'}`
      }
    }
    return { pass: true, detail: `scaled to ${fmtV3(final)}${completed ? '' : ' — but no TS_COMPLETED'}` }
  } finally {
    scope.dispose()
  }
}

// #6 — tweenSystem.tweenCompleted(). The helper scene authors actually reach for.
// It is a one-shot derived from TweenState, so it has to be polled from a real
// system (see pollInSystem) — and it can only ever fire on a host that writes
// TweenState in the first place.
const completedHelper: TestFn = async () => {
  const scope = entityScope()
  try {
    const entity = scope.add()
    Transform.create(entity, { position: START })
    Tween.setMove(entity, START, END, TWEEN_DURATION_MS, EasingFunction.EF_LINEAR)

    let fires = 0
    await pollInSystem(TWEEN_DURATION_MS + TWEEN_SLACK_MS, () => {
      if (tweenSystem.tweenCompleted(entity)) fires++
    })

    if (fires === 0) return { pass: false, detail: 'tweenCompleted() never fired — no TweenState to derive it from' }
    if (fires > 1) return { pass: false, detail: `tweenCompleted() fired ${fires}× — it must be one-shot` }
    return { pass: true, detail: 'tweenCompleted() fired exactly once' }
  } finally {
    scope.dispose()
  }
}

// #7 — TweenSequence chaining. Two legs; passing means the entity ended at the
// SECOND leg's end, i.e. the chain advanced rather than stopping after the base
// tween. NOTE: the SDK drives sequences scene-side off TweenState reaching
// TS_COMPLETED, so this exercises the host's TweenState writes as much as the
// sequence logic itself.
const sequenceChaining: TestFn = async () => {
  const scope = entityScope()
  try {
    const entity = scope.add()
    const mid = Vector3.lerp(START, END, 0.5)
    Transform.create(entity, { position: START })
    Tween.setMove(entity, START, mid, TWEEN_DURATION_MS, EasingFunction.EF_LINEAR)
    TweenSequence.create(entity, {
      sequence: [
        {
          duration: TWEEN_DURATION_MS,
          easingFunction: EasingFunction.EF_LINEAR,
          mode: Tween.Mode.Move({ start: mid, end: END })
        }
      ]
    })

    const arrived = await waitUntil(
      () => distance(v3(Transform.get(entity).position), END) <= POS_EPSILON,
      TWEEN_DURATION_MS * 2 + TWEEN_SLACK_MS
    )
    const final = v3(Transform.get(entity).position)
    if (!arrived) {
      const progress = progressAlong(START, END, final)
      return {
        pass: false,
        detail: `stalled at ${fmtV3(final)} (${(progress * 100).toFixed(0)}% of the 2-leg path)`
      }
    }
    return { pass: true, detail: `chained through both legs to ${fmtV3(final)}` }
  } finally {
    scope.dispose()
  }
}

// #8 — TL_YOYO looping. An empty sequence with TL_YOYO makes the base tween itself
// bounce. Passing needs BOTH halves observed: it reached the far end, and it then
// travelled a good way back — the same mechanism the live rig relies on.
const yoyoLoop: TestFn = async () => {
  const scope = entityScope()
  try {
    const entity = scope.add()
    Transform.create(entity, { position: START })
    Tween.setMove(entity, START, END, TWEEN_DURATION_MS, EasingFunction.EF_LINEAR)
    TweenSequence.create(entity, { sequence: [], loop: TweenLoop.TL_YOYO })

    let maxProgress = 0
    let returnedTo = 1
    await sampleFor(TWEEN_DURATION_MS * 1.8, () => {
      const progress = progressAlong(START, END, v3(Transform.get(entity).position))
      maxProgress = Math.max(maxProgress, progress)
      // Only start looking for the return leg once the far end was actually reached.
      if (maxProgress > 0.9) returnedTo = Math.min(returnedTo, progress)
    })

    if (maxProgress <= 0.9) {
      return { pass: false, detail: `never reached the far end — max progress ${maxProgress.toFixed(2)}` }
    }
    if (returnedTo >= 0.7) {
      return { pass: false, detail: `reached the end but did not come back (closest return ${returnedTo.toFixed(2)})` }
    }
    return { pass: true, detail: `out to ${maxProgress.toFixed(2)} and back to ${returnedTo.toFixed(2)}` }
  } finally {
    scope.dispose()
  }
}

export const TWEEN_SUITE: Record<string, TestFn> = {
  'tween-state-appears': probeTweenState,
  'tween-transform-writeback': transformWriteback,
  'tween-completes': tweenCompletes,
  'tween-linear-curve': linearCurve,
  'tween-rotate': rotateMode,
  'tween-scale': scaleMode,
  'tween-completed-helper': completedHelper,
  'tween-sequence': sequenceChaining,
  'tween-yoyo-loop': yoyoLoop
}
