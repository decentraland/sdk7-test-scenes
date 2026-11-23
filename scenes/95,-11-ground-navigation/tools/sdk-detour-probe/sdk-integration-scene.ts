import {
  ColliderLayer, engine, GltfContainer, GltfContainerLoadingState, LoadingState, PlayerIdentityData, TextShape, Transform, type Entity
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { init } from 'recast-navigation'
import type { Point, Surface } from '../../src/arena'
import { displacedCorridor } from '../catalog/ground-corridor'
import { actionableDoor, lateDoor } from '../catalog/ground-door'
import { followPartial } from '../catalog/ground-partial'
import manifest from '../catalog/manifest.json'
import type { CatalogCase, CatalogResult } from '../catalog/types'
import { awaitSurface, createProbeWorld, fromAbove, requireCheck, surfaceAt, until, type ProbeWorld } from './sdk-collision-probes'
import { createTraversalNavigator } from './traversal-routing'

const teal = Color4.create(0.18, 0.65, 0.54, 1)
const amber = Color4.create(1, 0.76, 0.25, 1)
const white = Color4.White()
const v = Vector3.create
const log = (value: unknown) => console.log('[sdk-navigation-integration] ' + JSON.stringify(value))
class MissingParticipants extends Error {}

function* delayedSupport(world: ProbeWorld) {
  const left = v(4, 2, 6)
  const right = v(5, 2, 6)
  const hold = v(3, 2.3, 6)
  const bot = world.marker(hold, amber)
  const platform = world.box(v(4.5, 1.85, 6), v(2.4, 0.3, 1.8), teal)
  yield* awaitSurface(world, left, platform, true)
  let revision = 0
  let pending: { timestamp: number; phase: 'holding'; revision: number; target: Vector3 } | undefined
  let phase: 'holding' | 'landed' = 'holding'
  const query = (target: Vector3) => {
    const ray = world.issueRay(fromAbove(target, 0.35), Vector3.Down(), 0.6)
    pending = { timestamp: ray.timestamp, phase: 'holding', revision, target }
    return ray
  }
  const accept = ({ timestamp, hits }: { timestamp: number; hits: readonly { entityId?: number; position?: Vector3 }[] }) => {
    if (!pending || timestamp !== pending.timestamp || pending.revision !== revision || pending.phase !== phase) return false
    const target = pending.target
    if (!hits.some((hit) => hit.entityId === platform && hit.position && Vector3.distance(hit.position, target) <= 0.02)) return false
    Transform.getMutable(bot).position = target
    phase = 'landed'
    return true
  }
  const old = yield* world.readRay(query(left))
  requireCheck(old.hits.some((hit) => hit.entityId === platform), 'Old native ray should report real support.')
  // Hold delivery to the traversal executor while Explorer applies a topology change.
  revision++
  Transform.getMutable(platform).position = v(4.5, 0.35, 6)
  yield* awaitSurface(world, left, platform, false)
  requireCheck(!accept(old) && Vector3.distance(Transform.get(bot).position, hold) < 0.01,
    'The stale positive landed the bot over missing support.')
  revision++
  Transform.getMutable(platform).position = v(4.5, 1.85, 6)
  yield* awaitSurface(world, right, platform, true)
  const replacement = query(right)
  requireCheck(!accept(old) && Vector3.distance(Transform.get(bot).position, hold) < 0.01,
    'A positive result for the other point released the pending probe.')
  const fresh = yield* world.readRay(replacement)
  requireCheck(accept(fresh) && Vector3.distance(Transform.get(bot).position, right) < 0.01,
    'The current ray did not release the correct landing.')
  return { oldResultTick: old.tick, newResultTick: fresh.tick, staleDeliveriesRejected: 2, supportRestored: true }
}

function tile(x: number, z: number, height: number, halfWidth = 0.9, halfDepth = 0.9): Surface {
  return {
    vertices: [
      [x - halfWidth, height, z - halfDepth], [x - halfWidth, height, z + halfDepth],
      [x + halfWidth, height, z + halfDepth], [x + halfWidth, height, z - halfDepth]
    ],
    triangles: [0, 1, 2, 0, 2, 3]
  }
}

function* modelSupport(world: ProbeWorld) {
  const variants = [
    { kind: 'collider', at: v(4, 2.1, 10), path: 'models/landing-with-collider.gltf' },
    { kind: 'decoration', at: v(8, 2.1, 10), path: 'models/landing-decoration.gltf' },
    { kind: 'missing', at: v(12, 2.1, 10), path: 'models/missing-landing.gltf' }
  ]
  const holdingDistance = 2.25
  const vectorPoint = ({ x, y, z }: Vector3): Point => [x, y, z]
  const holdAt = ({ x, y, z }: Vector3) => v(x, y, z - holdingDistance)
  const surfaces = variants.flatMap(({ at }) => [
    tile(at.x, at.z, at.y), tile(at.x, at.z - holdingDistance, at.y, 0.65, 0.4)
  ])
  const links = variants.map(({ at }) => ({ from: vectorPoint(holdAt(at)), to: vectorPoint(at) }))
  const unlinked = createTraversalNavigator('navcat', surfaces, 0.18, 1.4)
  const navigator = createTraversalNavigator('navcat', surfaces, 0.18, 1.4, links)
  const outcomes = []
  for (const { kind, at, path } of variants) {
    const hold = holdAt(at)
    world.box(v(hold.x, hold.y - 0.15, hold.z), v(1.3, 0.3, 0.8), teal)
    const bot = world.marker(hold, amber)
    const model = world.entity(v(at.x, 2, at.z))
    const from = vectorPoint(hold)
    const to = vectorPoint(at)
    requireCheck(navigator.route(from, to).status === 'complete' && unlinked.route(from, to).status === 'unreachable',
      'The pre-baked jump must already link the separated takeoff and landing.')
    let holds = 0
    function* tryLanding() {
      const solid = yield* surfaceAt(world, at, model)
      if (solid) Transform.getMutable(bot).position = at
      else {
        holds++
        requireCheck(Vector3.distance(Transform.get(bot).position, hold) < 0.01, 'Bot left takeoff without collider support.')
      }
      return solid
    }
    for (let tick = 0; tick < 2; tick++) {
      requireCheck(!(yield* tryLanding()), 'Pre-baked jump ran before its model was requested.')
    }
    GltfContainer.create(model, { src: path, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS })
    const state = () => GltfContainerLoadingState.getOrNull(model)?.currentState
    const errored = () => state() === LoadingState.NOT_FOUND || state() === LoadingState.FINISHED_WITH_ERROR
    const expectedSolid = kind === 'collider'
    let solid = false
    for (let attempt = 0; attempt < 300; attempt++) {
      solid = yield* tryLanding()
      requireCheck(!solid || expectedSolid, 'Non-colliding GLTF unexpectedly enabled the landing.')
      if (errored() || (state() === LoadingState.FINISHED && solid === expectedSolid)) break
    }
    requireCheck(kind === 'missing' ? errored() : state() === LoadingState.FINISHED, 'Unexpected GLTF load outcome for ' + kind)
    requireCheck(solid === expectedSolid && Vector3.distance(Transform.get(bot).position, solid ? at : hold) < 0.01,
      'Navigation advanced without matching real collider support for ' + kind)
    outcomes.push({ kind, loadingState: state(), supported: solid, holds, decision: solid ? 'land' : 'hold' })
  }
  return outcomes
}

function* markerCenter(world: ProbeWorld, expected: Vector3, marker: Entity) {
  const axes = [v(1, 0, 0), v(0, 1, 0), v(0, 0, 1)]
  const projections = []
  for (const axis of axes) {
    const displacement = Vector3.scale(axis, 0.24)
    const low = world.issueRay(Vector3.subtract(expected, displacement), axis, 0.48)
    const high = world.issueRay(Vector3.add(expected, displacement), Vector3.scale(axis, -1), 0.48)
    const first = (yield* world.readRay(low)).hits.find((hit) => hit.entityId === marker)?.position
    const second = (yield* world.readRay(high)).hits.find((hit) => hit.entityId === marker)?.position
    requireCheck(first && second, 'Could not bracket the physical marker near ' + JSON.stringify(expected))
    projections.push(Vector3.dot(Vector3.scale(Vector3.add(first, second), 0.5), axis))
  }
  return v(projections[0], projections[1], projections[2])
}

function* reparentedPose(world: ProbeWorld) {
  const pivot = v(9, 1.8, 12)
  const local = v(1.1, 0.5, 0.1)
  const localYaw = Quaternion.fromEulerDegrees(0, 15, 0)
  const fore = v(0, 0, 0.8)
  const parent = world.entity(pivot)
  const actor = world.entity(local, parent, localYaw)
  const tail = world.marker(Vector3.Zero(), amber, actor, true)
  const nose = world.marker(fore, white, actor, true)
  const expected = (degrees: number) => {
    const yaw = Quaternion.fromEulerDegrees(0, degrees, 0)
    const position = Vector3.add(pivot, Vector3.rotate(local, yaw))
    const rotation = Quaternion.multiply(yaw, localYaw)
    return { position, rotation, end: Vector3.add(position, Vector3.rotate(fore, rotation)) }
  }
  function* sample({ position, end }: ReturnType<typeof expected>) {
    // The colliders are exported to the client on the next SDK tick.
    yield
    yield
    const a = yield* markerCenter(world, position, tail)
    const b = yield* markerCenter(world, end, nose)
    return { a, b }
  }
  const initial = yield* sample(expected(0))
  Transform.getMutable(parent).rotation = Quaternion.fromEulerDegrees(0, 90, 0)
  const rotated = expected(90)
  const before = yield* sample(rotated)
  requireCheck(Vector3.distance(initial.a, before.a) > 0.8 && Vector3.distance(before.a, rotated.position) < 0.02,
    'Attached actor did not follow the rotating pivot.')
  const pose = Transform.getMutable(actor)
  pose.parent = engine.RootEntity
  pose.position = rotated.position
  pose.rotation = rotated.rotation
  const after = yield* sample(rotated)
  Transform.getMutable(parent).rotation = Quaternion.fromEulerDegrees(0, 180, 0)
  const free = yield* sample(rotated)
  const heading = ({ a, b }: typeof before) => Vector3.normalize(Vector3.subtract(b, a))
  const angle = (a: Vector3, b: Vector3) => Math.acos(Math.max(-1, Math.min(1, Vector3.dot(a, b)))) * 180 / Math.PI
  const move = Math.max(Vector3.distance(before.a, after.a), Vector3.distance(after.a, free.a))
  const turn = Math.max(angle(heading(before), heading(after)), angle(heading(after), heading(free)))
  requireCheck(move <= 0.02 && turn <= 1, 'Reparent caused a discontinuity in the world-space collider pose.')
  return { maxPositionDeltaM: move, maxYawDeltaDegrees: turn }
}

function* remoteAvatarSupport(world: ProbeWorld, setLabel: (label: string) => void) {
  const pads = [v(5, 0.25, 8), v(11, 0.25, 8)]
  const floors = pads.map((pad) => world.box(v(pad.x, 0.125, pad.z), v(1.6, 0.25, 1.6), teal))
  const marker = world.marker(v(8, 0.3, 8), amber)
  const occupancy = (samples: Array<{ entityId?: number; position?: Vector3 }>) => pads.map((pad) =>
    samples.some((hit) => hit.entityId === 0 && hit.position && Math.hypot(hit.position.x - pad.x, hit.position.z - pad.z) <= 0.35))
  function* readPads(mask: number) {
    const rays = pads.map((pad) => world.issueRay(fromAbove(pad, 2.4), Vector3.Down(), 2.5, mask))
    const left = yield* world.readRay(rays[0])
    const right = yield* world.readRay(rays[1])
    return [...left.hits, ...right.hits]
  }
  function* waitForOccupancy(expected: readonly boolean[], detail: string) {
    for (let attempt = 0; attempt < 900; attempt++) {
      const occupied = occupancy(yield* readPads(ColliderLayer.CL_PLAYER))
      if (occupied.every((value, index) => value === expected[index])) return occupied
      yield
    }
    throw new Error(detail)
  }
  setLabel('Two remote guests: stand on both green pads. Observer stays off the pads.')
  log({ stage: 'avatar-instruction', phase: 'occupy-both' })
  const remotePlayers = () => [...engine.getEntitiesWith(PlayerIdentityData)].filter(([entity]) => entity !== engine.PlayerEntity).length
  for (let frames = 0; frames < 900 && remotePlayers() < 2; frames++) yield
  if (remotePlayers() < 2) throw new MissingParticipants('Explorer did not see two remote players in the test realm.')
  const initial = yield* waitForOccupancy([true, true], 'Did not receive separate native CL_PLAYER hits with entityId 0 on both pads.')
  const worldHits = yield* readPads(ColliderLayer.CL_PHYSICS)
  requireCheck(!occupancy(worldHits).some(Boolean) && floors.every((floor) => worldHits.some((hit) => hit.entityId === floor)),
    'The physics-only mask must see the platforms without the avatars.')
  setLabel('Move the guest off the left pad. Leave the right pad occupied.')
  log({ stage: 'avatar-instruction', phase: 'release-left' })
  const final = yield* waitForOccupancy([false, true], 'Releasing one pad did not preserve the other avatar occupancy.')
  const landing = pads.find((_, index) => !final[index])
  requireCheck(landing === pads[0], 'The controller did not choose the freed pad.')
  Transform.getMutable(marker).position = landing
  return { initialOccupancy: initial, finalOccupancy: final, remoteEntityId: 0, chosenLanding: 'left' }
}

function* compareGround(run: CatalogCase['run']) {
  const outcomes = []
  for (const backend of ['navcat', 'detour'] as const) {
    let result: CatalogResult | undefined
    let error: unknown
    const ready = backend === 'detour' ? init() : Promise.resolve()
    ready.then(() => run(backend)).then((value) => { result = value }, (failure: unknown) => { error = failure })
    try {
      yield* until(() => result !== undefined || error !== undefined, 'Ground navigator did not finish: ' + backend, 900)
      requireCheck(result, String(error))
      outcomes.push({ backend, ...result })
    } catch (failure) {
      outcomes.push({ backend, status: 'fail', detail: String(failure) })
    }
  }
  requireCheck(outcomes.every(({ status }) => status === 'pass'), JSON.stringify(outcomes))
  return outcomes
}

export function runSdkIntegrationScene(includeAvatars: boolean) {
  const label = engine.addEntity()
  Transform.create(label, { position: v(8, 2.6, 5) })
  TextShape.create(label, { text: 'SDK7 navigation integration', fontSize: 3, width: 9 })
  const setLabel = (text: string) => { TextShape.getMutable(label).text = text }
  const probes = [
    { id: 'E22', run: () => compareGround(lateDoor) },
    { id: 'GAME-10', run: () => compareGround(actionableDoor) },
    { id: 'GAME-24', run: () => compareGround(followPartial) },
    { id: 'E25', run: () => compareGround(displacedCorridor) },
    { id: 'SDK-T01', run: delayedSupport },
    { id: 'SDK-T02', run: modelSupport },
    { id: 'SDK-T04', run: reparentedPose },
    ...(includeAvatars ? [{ id: 'SDK-T03', run: remoteAvatarSupport }] : [])
  ]
  let index = 0
  let passed = 0
  let current: { world: ProbeWorld; steps: Generator<void, unknown> } | undefined
  log({ stage: 'start', count: probes.length })
  engine.addSystem(function tick() {
    const probe = probes[index]
    if (!probe) {
      setLabel('SDK7 navigation integration\n' + passed + '/' + probes.length + ' passed')
      log({ stage: 'done', passed, count: probes.length })
      engine.removeSystem(tick)
      return
    }
    const title = manifest.find(({ id }) => id === probe.id)?.title
    try {
      if (!current) {
        const world = createProbeWorld()
        setLabel(title ?? probe.id)
        current = { world, steps: probe.run(world, setLabel) }
      }
      const step = current.steps.next()
      if (!step.done) return
      log({ stage: 'result', id: probe.id, title, verdict: 'pass', detail: step.value })
      passed++
    } catch (error) {
      log({ stage: 'result', id: probe.id, title, verdict: error instanceof MissingParticipants ? 'missing' : 'fail', detail: String(error) })
    }
    current?.world.dispose()
    current = undefined
    index++
  })
}
