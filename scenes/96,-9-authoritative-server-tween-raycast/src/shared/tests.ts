// ---------------------------------------------------------------------------
// The test registry — the single source of truth shared by the UI, the server
// runner and the client runner. All three iterate TESTS keyed by `index`, so a
// row in the panel, the server slot that fills it and the client slot beside it
// can never drift apart. Adding a test is one entry here plus one function in
// shared/suite/.
// ---------------------------------------------------------------------------

export enum TestGroup {
  Tween = 0,
  Raycast = 1
}

export interface TestDescriptor {
  id: string // stable key, also the key into the suite function table
  index: number // 0..N — the compact array slot used by every synced component
  group: TestGroup
  name: string // short human label for the UI row
  // True for the two capability probes. A probe answers the only question that
  // matters first — "does this host write the component at all?" — so the UI can
  // render the headline verdict from two rows instead of seventeen.
  probe?: boolean
  api: string // the SDK surface under test, shown under the row name
  description: string // one line: what the suite does
  expected: string // the pass criterion
}

// Order matters: the UI renders in this order, Tween group then Raycast group.
export const TESTS: TestDescriptor[] = [
  // --- Tween ----------------------------------------------------------------
  {
    id: 'tween-state-appears',
    index: 0,
    group: TestGroup.Tween,
    name: 'TweenState is written',
    probe: true,
    api: 'Tween.setMove → TweenState',
    description: 'Starts a move tween and waits for the host to attach TweenState.',
    expected: 'TweenState appears within the probe timeout. A host with no tween system never writes it.'
  },
  {
    index: 1,
    id: 'tween-transform-writeback',
    group: TestGroup.Tween,
    name: 'Transform write-back',
    api: 'Transform.get() mid-tween',
    description: 'Samples Transform.position while the tween is in flight.',
    expected: 'At least one sample sits strictly between start and end (host is interpolating, not teleporting).'
  },
  {
    index: 2,
    id: 'tween-completes',
    group: TestGroup.Tween,
    name: 'Tween completes',
    api: 'TweenState.state === TS_COMPLETED',
    description: 'Waits out a move tween, then reads state and final position.',
    expected: 'State reaches TS_COMPLETED and the Transform landed on the end value.'
  },
  {
    index: 3,
    id: 'tween-linear-curve',
    group: TestGroup.Tween,
    name: 'EF_LINEAR curve',
    api: 'EasingFunction.EF_LINEAR',
    description: 'Compares every mid-flight sample against the ideal linear curve.',
    expected: 'Max deviation stays inside the linearity tolerance — the host is honouring the easing function.'
  },
  {
    index: 4,
    id: 'tween-rotate',
    group: TestGroup.Tween,
    name: 'Rotate mode',
    api: 'Tween.setRotate',
    description: 'Rotates an entity 180° around Y and reads the final rotation.',
    expected: 'Final Transform.rotation matches the end quaternion.'
  },
  {
    index: 5,
    id: 'tween-scale',
    group: TestGroup.Tween,
    name: 'Scale mode',
    api: 'Tween.setScale',
    description: 'Scales an entity from 1 to 3 and reads the final scale.',
    expected: 'Final Transform.scale matches the end value.'
  },
  {
    index: 6,
    id: 'tween-completed-helper',
    group: TestGroup.Tween,
    name: 'tweenCompleted() helper',
    api: 'tweenSystem.tweenCompleted',
    description: 'Polls the SDK helper every frame for the one-shot completion signal.',
    expected: 'The helper fires exactly once. It is derived from TweenState, so an unsupported host never fires it.'
  },
  {
    index: 7,
    id: 'tween-sequence',
    group: TestGroup.Tween,
    name: 'TweenSequence chaining',
    api: 'TweenSequence.sequence[]',
    description: 'A two-leg sequence: the base tween, then a second leg continuing from its end.',
    expected: 'The entity ends at the SECOND leg’s end — the chain advanced, not just the first tween.'
  },
  {
    index: 8,
    id: 'tween-yoyo-loop',
    group: TestGroup.Tween,
    name: 'TL_YOYO looping',
    api: 'TweenSequence.loop',
    description: 'An empty sequence with TL_YOYO on a move tween, sampled past one full leg.',
    expected: 'The entity reaches the end and then travels back toward the start.'
  },

  // --- Raycast ---------------------------------------------------------------
  {
    index: 9,
    id: 'raycast-result-appears',
    group: TestGroup.Raycast,
    name: 'RaycastResult is written',
    probe: true,
    api: 'Raycast → RaycastResult',
    description: 'Casts into empty space and waits for the host to attach RaycastResult.',
    expected: 'RaycastResult appears with an empty hits[] — a miss still produces a result. A host with no raycast system writes nothing.'
  },
  {
    index: 10,
    id: 'raycast-ray-geometry',
    group: TestGroup.Raycast,
    name: 'Ray origin & direction',
    api: 'globalTarget direction mode',
    description: 'Casts at a global target from a positioned entity and checks the reported ray.',
    expected: 'globalOrigin equals the entity position and direction is the normalized origin→target vector.'
  },
  {
    index: 11,
    id: 'raycast-hits-collider',
    group: TestGroup.Raycast,
    name: 'Hits a MeshCollider',
    api: 'RQT_HIT_FIRST + hits[]',
    description: 'Casts at a single 1 m collider box 3 m away.',
    expected: 'One hit, entityId is the box, and length matches the distance to its near face.'
  },
  {
    index: 12,
    id: 'raycast-query-all',
    group: TestGroup.Raycast,
    name: 'RQT_QUERY_ALL',
    api: 'RaycastQueryType.RQT_QUERY_ALL',
    description: 'Casts through three collider boxes lined up along the ray.',
    expected: 'All three boxes appear in hits[] (order is not guaranteed by the protocol, so only membership is asserted).'
  },
  {
    index: 13,
    id: 'raycast-max-distance',
    group: TestGroup.Raycast,
    name: 'maxDistance clipping',
    api: 'PBRaycast.maxDistance',
    description: 'Casts a ray deliberately too short to reach the nearest box.',
    expected: 'A result arrives with zero hits — the ray was clipped, not silently extended.'
  },
  {
    index: 14,
    id: 'raycast-collision-mask',
    group: TestGroup.Raycast,
    name: 'collisionMask filtering',
    api: 'ColliderLayer / PBRaycast.collisionMask',
    description: 'One box on CL_CUSTOM1 only, probed twice: once with a CL_PHYSICS ray, once with CL_CUSTOM1.',
    expected: 'The CL_PHYSICS ray misses it and the CL_CUSTOM1 ray hits it. Both halves must hold.'
  },
  {
    index: 15,
    id: 'raycast-continuous',
    group: TestGroup.Raycast,
    name: 'continuous re-casting',
    api: 'PBRaycast.continuous',
    description: 'Sets continuous: true and watches RaycastResult.tickNumber across frames.',
    expected: 'tickNumber advances repeatedly — the host is re-casting every tick, not once.'
  },
  {
    index: 16,
    id: 'raycast-tracks-tween',
    group: TestGroup.Raycast,
    name: 'Ray sees a tweened box',
    api: 'Tween + continuous Raycast',
    description: 'A continuous ray watches a box, proven visible first, that a tween then carries out of its path.',
    expected: 'The ray loses sight of the box. Proves the two systems share one scene graph — the live rig in miniature.'
  }
]

export const TEST_COUNT = TESTS.length

export const TWEEN_TESTS = TESTS.filter((t) => t.group === TestGroup.Tween)
export const RAYCAST_TESTS = TESTS.filter((t) => t.group === TestGroup.Raycast)

// The two probe indices, hoisted because the verdict banner keys off them.
export const TWEEN_PROBE_INDEX = TESTS.find((t) => t.group === TestGroup.Tween && t.probe)!.index
export const RAYCAST_PROBE_INDEX = TESTS.find((t) => t.group === TestGroup.Raycast && t.probe)!.index

export function testByIndex(index: number): TestDescriptor | undefined {
  return TESTS[index]
}
