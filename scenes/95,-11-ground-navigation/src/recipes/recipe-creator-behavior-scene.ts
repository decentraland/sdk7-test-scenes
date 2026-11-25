import {
  Animator, ColliderLayer, engine, ExplorerUi, ExplorerUiEventsResult, GltfContainer, GltfContainerLoadingState, LoadingState,
  TextShape, Transform
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { openExplorerUi, OpenExplorerUiResult } from '~system/RestrictedActions'
import type { Point } from '../arena'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh } from '../navigation'
import { createProbeWorld, requireCheck, until, type ProbeWorld } from '../../tools/sdk-detour-probe/sdk-collision-probes'
import { distance, recipeBake } from './recipe-runtime-support'
import {
  getLocomotionPath, locomotionAsset, locomotionFloor, locomotionGoal, locomotionStart, makeLocomotion,
  crossesClosedGate, makeResumeController, resumeGateX, resumeGateZ, resumeGeometry, resumeGoal, resumeSlabs, resumeStart,
  type Clip
} from './recipe-creator-behavior'
import {
  authoredRayHit, makeReplayTrace, replayBakeSettings, replayGeometry, replayLogTag, replayNavigation,
  replayStart, replayTargetXZ, type ReplayFloor
} from './recipe-creator-behavior-replay'
import type { LiveRecipe, LiveRecipeResult } from './types'

const vector = (point: Point) => Vector3.create(...point)
const rgb = (r: number, g: number, b: number) => Color4.create(r, g, b, 1)
const floorColor = rgb(0.22, 0.34, 0.45)
const guide = rgb(0.86, 0.65, 0.18)
const success = rgb(0.14, 0.8, 0.5)
const blocked = rgb(0.84, 0.22, 0.28)
type Tick = { dt: number; tick: number }
type RecipeRun = (world: ProbeWorld, setAction: Parameters<LiveRecipe['mount']>[1]) =>
  Generator<void, LiveRecipeResult, Tick>
let nextMapRequestId = 0

function mounted(run: RecipeRun): LiveRecipe['mount'] {
  return (onResult, setAction) => {
    const world = createProbeWorld()
    let tick = 0
    let active = true
    const steps = run(world, (action) => { if (active) setAction(action) })
    function stop() {
      if (!active) return
      active = false
      engine.removeSystem(step)
    }
    function step(dt: number) {
      tick++
      try {
        const result = steps.next({ tick, dt })
        if (result.done) {
          stop()
          onResult({ ...result.value, metrics: { ...result.value.metrics, elapsedSceneTicks: tick } })
        }
      } catch (error) {
        stop()
        onResult({ status: 'fail', detail: String(error), metrics: { elapsedSceneTicks: tick } })
      }
    }
    engine.addSystem(step)
    return () => {
      stop()
      world.dispose()
    }
  }
}

function* animate(world: ProbeWorld): ReturnType<RecipeRun> {
  world.box(vector(locomotionFloor.shape.center), vector(locomotionFloor.shape.size), floorColor)
  world.marker(vector(locomotionGoal), success)
  const started = Date.now()
  const nav = createNavcatNavigatorFromMesh(bakeNavcatMesh([locomotionFloor.surface], recipeBake()))
  const recipeBakeMs = Date.now() - started
  const queryStart = Date.now()
  const route = getLocomotionPath(nav)
  const recipeQueryMs = Date.now() - queryStart
  const animated = world.entity(vector(locomotionStart))
  const baseline = world.entity(vector([locomotionStart[0], locomotionStart[1], locomotionStart[2] + 0.8]))
  const drift = world.entity(vector([10, 0.2, 5.2]))
  world.marker(vector([10, 0.3, 5.2]), blocked)
  const visuals = [animated, baseline, drift].map((root) => {
    const child = world.entity(Vector3.Zero(), root)
    GltfContainer.create(child, { src: locomotionAsset, visibleMeshesCollisionMask: ColliderLayer.CL_NONE, invisibleMeshesCollisionMask: ColliderLayer.CL_NONE })
    Animator.create(child, { states: ['idle', 'walk', 'drift'].map((clip) => ({ clip, playing: false, loop: clip !== 'drift' })) })
    return child
  })
  yield* until(() => visuals.every((entity) => GltfContainerLoadingState.getOrNull(entity)?.currentState === LoadingState.FINISHED),
    'Explorer did not load all locomotion GLBs.')
  requireCheck(Animator.playSingleAnimation(visuals[2], 'drift', true), 'The drift control clip was not requested.')
  const follower = makeLocomotion(route)
  const reference = makeLocomotion(route)
  let clip: Clip | undefined
  let switches = 0
  let brakingWalkTicks = 0
  let finished = false
  let maxDrift = 0
  for (let frames = 0; frames < 900 && !finished; frames++) {
    const { dt } = yield
    if (dt <= 0) continue
    const delta = Math.min(dt, 0.1)
    const next = follower.step(delta)
    const withoutAnimator = reference.step(delta)
    Transform.getMutable(animated).position = vector(next.position)
    Transform.getMutable(baseline).position = vector([withoutAnimator.position[0], withoutAnimator.position[1], withoutAnimator.position[2] + 0.8])
    if (clip !== next.clip) {
      clip = next.clip
      requireCheck(Animator.playSingleAnimation(visuals[0], clip, true), 'An animation request was rejected.')
      switches++
    }
    const actual = Transform.get(animated).position
    const expected = Transform.get(baseline).position
    maxDrift = Math.max(maxDrift, distance([actual.x, actual.y, actual.z], [expected.x, expected.y, expected.z - 0.8]))
    brakingWalkTicks += Number(next.intent === 0 && next.clip === 'walk')
    finished = next.finished
  }
  requireCheck(finished && clip === 'idle' && switches >= 4 && brakingWalkTicks > 0 && maxDrift < 0.001,
    'The animated logic root diverged, or the clip did not follow measured speed.')
  return {
    status: 'pass',
    detail: 'Walk and idle commands followed measured speed. Both logic roots matched. The marked red control plays a root-motion clip for visual comparison.',
    metrics: { switches, brakingWalkTicks, maxRootDriftMetres: maxDrift, recipeBakeMs, recipeQueryMs }
  }
}

function* resume(world: ProbeWorld, setAction: Parameters<LiveRecipe['mount']>[1]): ReturnType<RecipeRun> {
  for (const item of resumeSlabs) world.box(vector(item.shape.center), vector(item.shape.size), floorColor)
  const marker = world.marker(vector(resumeGoal), success)
  const gate = world.box(vector([resumeGateX + 0.4, 0.14, resumeGateZ]), vector([0.8, 0.12, 2]), guide)
  const bot = world.marker(vector(resumeStart), guide)
  const instructions = world.entity(vector([5, 2.1, 4]))
  TextShape.create(instructions, { text: 'Click Open Explorer map in the recipe panel.', fontSize: 2 })
  const begin = Date.now()
  const maps = [true, false].map((open) => createNavcatNavigatorFromMesh(bakeNavcatMesh(resumeGeometry(open), recipeBake())))
  const recipeBakeMs = Date.now() - begin
  let recipeQueryMs = 0
  const controller = makeResumeController((from, to, revision) => {
    const started = Date.now()
    const result = maps[revision].route(from, to)
    recipeQueryMs += Date.now() - started
    return result
  })
  const ui = ExplorerUi.EU_MAP
  let requestId = 0
  let opening = false
  let accepted = false
  let rejection: string | undefined
  const logMap = (stage: string, fields = {}) =>
    console.log('[ground-resume-map] ' + JSON.stringify({ stage, requestId, ...fields }))
  function openMap() {
    if (opening) return
    opening = true
    setAction(undefined)
    requestId = ++nextMapRequestId
    void openExplorerUi({ ui, requestId }).then(({ openResult }) => {
      logMap('open-result', { openResult })
      if (openResult === OpenExplorerUiResult.WAS_ALREADY_OPEN) {
        opening = false
        setAction({ label: 'Retry when map slot is free', run: openMap })
      } else if (openResult === OpenExplorerUiResult.OPENED) {
        accepted = true
      } else {
        rejection = 'Explorer rejected the map request (' + openResult + ').'
      }
    }, (error: unknown) => { rejection = String(error) })
  }
  function mapEvent(kind: 'opened' | 'closed') {
    for (const event of ExplorerUiEventsResult.get(engine.RootEntity).values()) {
      if (event.ui === ui && event.requestId === requestId && event.event?.$case === kind) return event
    }
  }
  setAction({ label: 'Open Explorer map', run: openMap })
  logMap('ready')
  const visibilityWaitTicks = 10_800
  yield* until(() => Boolean(rejection || (accepted && mapEvent('opened'))),
    'Expected a correlated opened event after clicking Open Explorer map.', visibilityWaitTicks)
  requireCheck(!rejection, rejection ?? '')
  logMap('opened', { timestamp: mapEvent('opened')?.timestamp })
  world.remove(gate)
  world.box(vector([resumeGateX + 0.09, 1, resumeGateZ]), vector([0.18, 1.6, 2]), blocked)
  let hiddenTicks = 0
  for (; !mapEvent('closed') && hiddenTicks < visibilityWaitTicks; hiddenTicks++) {
    const { dt } = yield
    const held = controller.step(true, 1, dt)
    requireCheck(distance(held.position, resumeStart) < 0.001 && held.stepSeconds === 0, 'The hidden NPC advanced.')
  }
  const closed = mapEvent('closed')
  requireCheck(closed, 'Expected a correlated closed event from Explorer.')
  logMap('closed', { timestamp: closed.timestamp })
  requireCheck(hiddenTicks >= 1, 'No hidden scene tick was observed.')
  const first = controller.step(false, 1, 0.5)
  requireCheck(first.revision === 1 && first.stepSeconds <= 0.1 && !crossesClosedGate(first.from, first.position),
    'The first visible step used stale navigation or caught up across the closed gate.')
  Transform.getMutable(bot).position = vector(first.position)
  TextShape.getMutable(instructions).text = 'Resumed. The NPC replans around the closed gate.'
  let reached = false
  let maxZ = first.position[2]
  for (let i = 0; i < 900 && !reached; i++) {
    const { dt } = yield
    const next = controller.step(false, 1, Math.min(0.1, dt))
    requireCheck(!crossesClosedGate(next.from, next.position), 'The NPC crossed the closed gate.')
    Transform.getMutable(bot).position = vector(next.position)
    maxZ = Math.max(maxZ, next.position[2])
    reached = distance(next.position, resumeGoal) < 0.24
  }
  requireCheck(reached && maxZ > 7, 'The NPC did not reach the original target by the alternate lane.')
  TextShape.getMutable(instructions).text = 'Reached the original target by the alternate lane.'
  Transform.getMutable(marker).position = vector(resumeGoal)
  return { status: 'pass', detail: 'Observed matching Explorer map open and close events. Held the NPC, then replanned and capped its first step.',
    metrics: { requestId, hiddenTicks, resumeStepMs: first.stepSeconds * 1000, maxZ, recipeBakeMs, recipeQueryMs } }
}

function* record(world: ProbeWorld): ReturnType<RecipeRun> {
  const [x, z] = replayTargetXZ
  const lower = world.box(vector([x, -0.06, z]), vector([3, 0.12, 2]), floorColor)
  const upper = world.box(vector([x, 2.94, z]), vector([3, 0.12, 2]), floorColor)
  const bindings = new Map<typeof lower, ReplayFloor>([[lower, 'underpass'], [upper, 'bridge']])
  world.marker(vector(replayStart), guide)
  const launch = yield
  const old = world.issueRay(vector([x, 0.85, z]), Vector3.Down(), 1.4)
  const gateClosed = yield
  const newRequest = yield
  const latest = world.issueRay(vector([x, 3.85, z]), Vector3.Down(), 1.4)
  const first = yield* world.readRay(latest)
  const high = authoredRayHit(first.hits, bindings, 'bridge')
  const accepted = yield
  const second = yield* world.readRay(old)
  const low = authoredRayHit(second.hits, bindings, 'underpass')
  const stale = yield
  requireCheck(high && low, 'The two Explorer rays did not hit their matching floors.')
  const trace = makeReplayTrace([
    { kind: 'request', tick: launch.tick, request: 1, revision: 0, floor: 'underpass' },
    { kind: 'revision', tick: gateClosed.tick, revision: 1 },
    { kind: 'request', tick: newRequest.tick, request: 2, revision: 1, floor: 'bridge' },
    { kind: 'result', tick: accepted.tick, sourceTick: first.tick, request: 2, revision: 1, surface: 'bridge', hit: high },
    { kind: 'result', tick: stale.tick, sourceTick: second.tick, request: 1, revision: 0, surface: 'underpass', hit: low }
  ])
  const started = Date.now()
  const nav = createNavcatNavigatorFromMesh(bakeNavcatMesh(replayGeometry(), replayBakeSettings()))
  const recipeBakeMs = Date.now() - started
  const queryStart = Date.now()
  const result = replayNavigation(trace, nav)
  const recipeQueryMs = Date.now() - queryStart
  world.marker(vector(result.end), success)
  console.log(replayLogTag + JSON.stringify(trace))
  return {
    status: 'pass', detail: 'Recorded two real Explorer ray hits under stable floor keys. The latest bridge result wins. Save the tagged log line and replay it in CLI.',
    metrics: { recordedRays: 2, replayEvents: trace.events.length, routeCalls: result.routeCalls, recipeBakeMs, recipeQueryMs }
  }
}

export const creatorBehaviorLiveRecipes: readonly LiveRecipe[] = [
  { id: 'RECIPE-ANIMATOR', label: 'Locomotion drives in-place animation', mount: mounted(animate) },
  { id: 'RECIPE-SCENE-RESUME', label: 'Resume after fullscreen UI', mount: mounted(resume) },
  { id: 'RECIPE-EXPLORER-REPLAY', label: 'Record an Explorer navigation replay', mount: mounted(record) }
]
