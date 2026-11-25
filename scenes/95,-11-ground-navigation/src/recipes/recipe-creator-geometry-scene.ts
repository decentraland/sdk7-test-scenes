import { ColliderLayer, engine, GltfContainer, GltfContainerLoadingState, LoadingState, Name, Transform, type Entity } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { getSurfaces, SLABS, type Point } from '../arena'
import { createProbeWorld, requireCheck, until, type ProbeWorld } from '../../tools/sdk-detour-probe/sdk-collision-probes'
import { distance, makeNavcatRecipeNavigator, playback, STANDING } from './recipe-runtime-support'
import {
  markerPath, mirroredRampAsset, mirroredRampCheck, MIRRORED_MODEL, PATROL_GROUP_MOVE, PATROL_MARKERS, rampStations,
  RAMP_PARENT, RAMP_YAW, transformPosition
} from './recipe-creator-geometry'
import type { LiveRecipe, LiveRecipeResult } from './types'

type SceneProbe = (world: ProbeWorld) => Generator<void, LiveRecipeResult>
const green = Color4.create(0.16, 0.78, 0.54, 1)
const blue = Color4.create(0.23, 0.61, 0.96, 1)
const floor = Color4.create(0.27, 0.32, 0.43, 1)

function mount(probe: SceneProbe): LiveRecipe['mount'] {
  return (onResult) => {
    const world = createProbeWorld()
    const steps = probe(world)
    let ticks = 0
    let stopped = false
    function stop() {
      if (stopped) return
      stopped = true
      engine.removeSystem(tick)
    }
    function tick() {
      ticks++
      try {
        const result = steps.next()
        if (result.done) {
          stop()
          onResult({ ...result.value, metrics: { ...result.value.metrics, elapsedSceneTicks: ticks } })
        }
      } catch (error) {
        stop()
        onResult({ status: 'fail', detail: String(error), metrics: { elapsedSceneTicks: ticks } })
      }
    }
    engine.addSystem(tick)
    return () => {
      stop()
      world.dispose()
    }
  }
}

function positions(world: ProbeWorld, points: readonly Point[], color: Color4) {
  points.forEach(([x, y, z]) => world.marker(Vector3.create(x, y + 0.08, z), color))
}

function* mirrored(world: ProbeWorld): ReturnType<SceneProbe> {
  const parent = world.entity(Vector3.create(...RAMP_PARENT), undefined, Quaternion.fromEulerDegrees(0, RAMP_YAW, 0))
  const model = world.entity(Vector3.Zero(), parent)
  GltfContainer.create(model, { src: MIRRORED_MODEL, visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS })
  yield* until(() => GltfContainerLoadingState.getOrNull(model)?.currentState === LoadingState.FINISHED,
    'Mirrored GLB must finish loading')
  const samples = [0, 1].flatMap((index) => rampStations(index).slice(1, 4))
  const requests = samples.map(([x, y, z]) => world.issueRay(Vector3.create(x, y + 0.4, z), Vector3.Down(), 0.8))
  let hits = 0
  for (let i = 0; i < samples.length; i++) {
    const result = yield* world.readRay(requests[i])
    if (result.hits.some(({ entityId, position }) => entityId === model && position && Math.abs(position.y - samples[i][1]) < 0.12)) hits++
  }
  const started = Date.now()
  const result = mirroredRampCheck(mirroredRampAsset, makeNavcatRecipeNavigator)
  const recipeWallMs = Date.now() - started
  positions(world, result.paths[0], green)
  positions(world, result.paths[1], blue)
  positions(world, samples, floor)
  return { status: result.passed && hits === samples.length ? 'pass' : 'fail',
    detail: result.detail + ' Explorer collider sections hit ' + hits + '/' + samples.length,
    metrics: { ...result.metrics, colliderSections: hits, recipeWallMs } }
}

function scenePoint(entity: Entity): Point | undefined {
  let point: Point = [0, 0, 0]
  let current = entity
  const ancestors = new Set<Entity>()
  while (current !== engine.RootEntity) {
    if (ancestors.has(current)) return
    ancestors.add(current)
    const transform = Transform.getOrNull(current)
    if (!transform) return
    const { position, rotation, scale, parent } = transform
    point = transformPosition(point, {
      translation: [position.x, position.y, position.z],
      rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
      scale: [scale.x, scale.y, scale.z]
    })
    current = parent ?? engine.RootEntity
  }
  return point
}

function* named(world: ProbeWorld): ReturnType<SceneProbe> {
  for (const slab of SLABS.filter(({ kind }) => kind === 'floor' || kind === 'bridge' || kind === 'ramp')) {
    const steps = slab.kind === 'ramp' ? 8 : 1
    const length = (slab.maxZ - slab.minZ) / steps
    for (let i = 0; i < steps; i++) {
      const y = slab.nearY + (slab.farY - slab.nearY) * ((i + 0.5) / steps)
      world.box(Vector3.create((slab.minX + slab.maxX) / 2, y - 0.09, slab.minZ + length * (i + 0.5)),
        Vector3.create(slab.maxX - slab.minX, 0.18, length), floor)
    }
  }
  function createMarkers(reversed: boolean) {
    const offset = reversed ? PATROL_GROUP_MOVE : [0, 0, 0] as const
    const group = world.entity(Vector3.create(...offset))
    const markers = (reversed ? [...PATROL_MARKERS].reverse() : PATROL_MARKERS).map(({ name, parent, local }) => {
      const container = world.entity(Vector3.create(...parent), group)
      const marker = world.marker(Vector3.create(...local), blue, container)
      Name.create(marker, { value: name })
      return { name, marker, container }
    })
    return { markers, group }
  }
  function find(name: string) {
    const entity = engine.getEntityOrNullByName(name)
    return entity !== null && Name.getOrNull(entity)?.value === name ? scenePoint(entity) : undefined
  }
  const original = createMarkers(false)
  yield
  const bakeStart = Date.now()
  const nav = makeNavcatRecipeNavigator(getSurfaces(true))
  const recipeBakeMs = Date.now() - bakeStart
  try {
    let queryStart = Date.now()
    const before = markerPath(find, undefined, nav)
    let recipeQueryMs = Date.now() - queryStart
    for (const { marker, container } of original.markers) {
      world.remove(marker)
      world.remove(container)
    }
    world.remove(original.group)
    const recreated = createMarkers(true)
    yield
    queryStart = Date.now()
    const after = markerPath(find, undefined, nav)
    recipeQueryMs += Date.now() - queryStart
    requireCheck(before.points.length === 3 && after.points.length === 3, 'All authored names resolve before and after move')
    const authoredFloors = before.points.every((point, i) => distance(point, PATROL_MARKERS[i].expected) < 0.01)
    const moved = after.points.every((point, i) =>
      distance(point, transformPosition(before.points[i], { translation: PATROL_GROUP_MOVE })) < 0.01)
    const stale = original.markers.filter(({ marker }) => Transform.getOrNull(marker) !== null).length
    const target = recreated.markers.find(({ name }) => name === 'patrol-b')!
    Name.createOrReplace(target.marker, { value: 'patrol-b-control-deleted' })
    yield
    const missing = markerPath(find, undefined, nav)
    positions(world, after.path ?? [], green)
    let observedMarkers = 0
    if (after.path && after.arrivals.length === 3) {
      const [sx, sy, sz] = after.path[0]
      const bot = world.marker(Vector3.create(sx, sy + 0.12, sz), green)
      const movement = playback([{ phase: 'patrol', points: after.path, height: STANDING }], () => [], true, '', {})
      while (movement.frame().verdict === 'running') {
        movement.step(1 / 30)
        const [x, y, z] = movement.frame().bots[0].feet
        Transform.getMutable(bot).position = Vector3.create(x, y + 0.12, z)
        const observed = Transform.get(bot).position
        const expected = after.points[observedMarkers]
        if (expected && distance([observed.x, observed.y - 0.12, observed.z], expected) < 0.18) observedMarkers++
        yield
      }
    }
    return { status: authoredFloors && moved && before.arrivals.length === 3 && after.arrivals.length === 3 &&
        observedMarkers === 3 && stale === 0 && missing.missing === 'patrol-b' && !missing.arrivals.length ? 'pass' : 'fail',
      detail: 'SDK7 resolves the authored marker names after recreation in reverse order. Renaming patrol-b prevents the patrol.',
      metrics: { namedMarkers: 3, reachedMarkers: before.arrivals.length + after.arrivals.length, observedMarkers, staleIds: stale,
        missingMarkerRejected: Number(missing.missing === 'patrol-b'), recipeBakeMs, recipeQueryMs } }
  } finally {
    nav.dispose?.()
  }
}

export const creatorGeometryLiveRecipes: readonly LiveRecipe[] = [
  { id: 'RECIPE-MIRRORED-GLB', label: 'Mirrored GLB ramp', mount: mount(mirrored) },
  { id: 'RECIPE-NAMED-MARKERS', label: 'Named patrol markers', mount: mount(named) }
]
