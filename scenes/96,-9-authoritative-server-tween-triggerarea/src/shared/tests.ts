// ---------------------------------------------------------------------------
// The test registry — the single source of truth shared by the UI, the server
// runner and the client runner. All three iterate TESTS keyed by `index`, so a
// row in the panel, the server slot that fills it and the client slot beside it
// can never drift apart. Adding a test is one entry here plus one function in
// shared/suite/.
// ---------------------------------------------------------------------------

export enum TestGroup {
  Tween = 0,
  Trigger = 1
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

  // --- TriggerArea -----------------------------------------------------------
  {
    index: 9,
    id: 'trigger-result-appears',
    group: TestGroup.Trigger,
    name: 'TriggerAreaResult is written',
    probe: true,
    api: 'TriggerArea → TriggerAreaResult',
    description: 'Slides a collider into a trigger area and waits for the host to record a result.',
    expected: 'TriggerAreaResult appears on the area. A host with no trigger-area system never writes it.'
  },
  {
    index: 10,
    id: 'trigger-enter-event',
    group: TestGroup.Trigger,
    name: 'onTriggerEnter fires',
    api: 'triggerAreaEventsSystem.onTriggerEnter',
    description: 'Registers the SDK callback, then moves a collider into the area.',
    expected: 'The callback fires with TAET_ENTER, trigger.entity = the prober and triggeredEntity = the area.'
  },
  {
    index: 11,
    id: 'trigger-exit-event',
    group: TestGroup.Trigger,
    name: 'onTriggerExit fires',
    api: 'triggerAreaEventsSystem.onTriggerExit',
    description: 'Moves a collider in, waits for the entry, then moves it back out.',
    expected: 'A matching TAET_EXIT arrives — the host tracks leaving, not just arriving.'
  },
  {
    index: 12,
    id: 'trigger-stay-event',
    group: TestGroup.Trigger,
    name: 'onTriggerStay repeats',
    api: 'triggerAreaEventsSystem.onTriggerStay',
    description: 'Parks a collider inside the area and counts stay callbacks for one second.',
    expected: 'Several stay callbacks. NOTE: the SDK synthesizes these from ENTER/EXIT, so this needs the host’s ENTER.'
  },
  {
    index: 13,
    id: 'trigger-collision-mask',
    group: TestGroup.Trigger,
    name: 'collisionMask filtering',
    api: 'ColliderLayer / PBTriggerArea.collisionMask',
    description: 'An area listening on one custom layer, probed by a collider on that layer and then by one on another.',
    expected: 'It fires for its own layer and stays silent for the other. Both halves must hold.'
  },
  {
    index: 14,
    id: 'trigger-volume-from-scale',
    group: TestGroup.Trigger,
    name: 'Volume from Transform.scale',
    api: 'PBTriggerArea + Transform.scale',
    description: 'Moves a prober to a point inside the SCALED box but outside an unscaled default one.',
    expected: 'An entry fires — the host sized the volume from Transform.scale rather than a unit default.'
  },
  {
    index: 15,
    id: 'trigger-sphere-mesh',
    group: TestGroup.Trigger,
    name: 'Sphere area',
    api: 'TriggerArea.setSphere',
    description: 'Repeats the enter/exit cycle against a sphere-shaped area instead of a box.',
    expected: 'Enter and exit both fire — the sphere mesh type is handled, not just the box.'
  },
  {
    index: 16,
    id: 'trigger-tracks-tween',
    group: TestGroup.Trigger,
    name: 'Area sees a tweened box',
    api: 'Tween + TriggerArea',
    description: 'Proves the area fires for a hand-moved collider first, then lets a TWEEN carry the collider in.',
    expected: 'The tween-driven entry fires too. Proves both systems share one scene graph — the live rig in miniature.'
  }
]

export const TEST_COUNT = TESTS.length

export const TWEEN_TESTS = TESTS.filter((t) => t.group === TestGroup.Tween)
export const TRIGGER_TESTS = TESTS.filter((t) => t.group === TestGroup.Trigger)

// The two probe indices, hoisted because the verdict banner keys off them.
export const TWEEN_PROBE_INDEX = TESTS.find((t) => t.group === TestGroup.Tween && t.probe)!.index
export const TRIGGER_PROBE_INDEX = TESTS.find((t) => t.group === TestGroup.Trigger && t.probe)!.index

export function testByIndex(index: number): TestDescriptor | undefined {
  return TESTS[index]
}
