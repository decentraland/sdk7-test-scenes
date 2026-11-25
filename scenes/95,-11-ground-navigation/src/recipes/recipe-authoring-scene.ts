import {
  ColliderLayer, engine, GltfContainer, GltfContainerLoadingState, LoadingState, MeshCollider,
  type Entity
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { getSurfaces, type Point } from '../arena'
import { bakeNavcatMesh, createNavcatNavigatorFromMesh, NAVIGATION_BAKE, type Route } from '../navigation'
import { createProbeWorld, requireCheck, until, type ProbeWorld } from '../../tools/sdk-detour-probe/sdk-collision-probes'
import {
  FLOOR_PICK_LOWER, FLOOR_PICK_START, FLOOR_PICK_TARGET_X, FLOOR_PICK_TARGET_Z, FLOOR_PICK_UPPER, GLASS_PANEL_OFFSET,
  GLASS_WALL_CENTER, GLASS_WALL_HALF_DEPTH, GLASS_WALL_HALF_THICKNESS, GLASS_WALL_MODEL, MASK_AGENT_RADIUS,
  MASK_ROUTE_GOAL, MASK_ROUTE_START, glassWallSurface, maskFloor, moveSurface, pickFloorDestination,
  routeClearsPhysicalWall, routeToPickedFloor, wallCrossingZ
} from './recipe-authoring'
import type { LiveRecipe, LiveRecipeResult } from './types'

const floorColor = Color4.create(0.23, 0.33, 0.43, 1)
const lowerColor = Color4.create(0.19, 0.64, 0.52, 1)
const upperColor = Color4.create(0.95, 0.66, 0.32, 1)
const v = Vector3.create
const directionX = v(1, 0, 0)
const smallBake = {
  ...NAVIGATION_BAKE, cellSize: 0.05, cellHeight: 0.05, radius: MASK_AGENT_RADIUS,
  height: 1.4, climb: 0.1, maxEdgeLength: 80, minRegionSize: 1, mergeRegionSize: 1, maxSimplificationError: 0.35
}

function routeMarkers(world: ProbeWorld, route: Route, color: Color4, zOffset = 0) {
  for (const [x, y, z] of route.points) world.marker(v(x, y + 0.12, z + zOffset), color)
}

type RecipeRun = (world: ProbeWorld, tickNumber: () => number) => Generator<void, LiveRecipeResult>
function mounted(run: RecipeRun): LiveRecipe['mount'] {
  return (onResult) => {
    const world = createProbeWorld()
    let ticks = 0
    let stopped = false
    const steps = run(world, () => ticks)
    function stop() {
      if (stopped) return
      stopped = true
      engine.removeSystem(tick)
    }
    function tick() {
      ticks++
      let result: IteratorResult<void, LiveRecipeResult>
      try {
        result = steps.next()
      } catch (error) {
        stop()
        onResult({ status: 'fail', detail: String(error), metrics: { elapsedSceneTicks: ticks } })
        return
      }
      if (!result.done) return
      stop()
      onResult({ ...result.value, metrics: { ...result.value.metrics, elapsedSceneTicks: ticks } })
    }
    engine.addSystem(tick)
    return () => {
      stop()
      world.dispose()
    }
  }
}

function* liveMasks(world: ProbeWorld, tickNumber: () => number): ReturnType<RecipeRun> {
  const offsets = [0, 7]
  const models = offsets.map((zOffset, index) => {
    world.box(v(4, -0.05, 4 + zOffset), v(6, 0.1, 4), floorColor)
    const model = world.entity(v(GLASS_WALL_CENTER[0], 0, GLASS_WALL_CENTER[2] + zOffset))
    GltfContainer.create(model, {
      src: GLASS_WALL_MODEL,
      visibleMeshesCollisionMask: ColliderLayer.CL_POINTER,
      invisibleMeshesCollisionMask: index === 0 ? ColliderLayer.CL_NONE : ColliderLayer.CL_PHYSICS
    })
    return model
  })
  const loadStart = tickNumber()
  const state = (model: Entity) => GltfContainerLoadingState.getOrNull(model)?.currentState
  yield* until(() => models.every((model) => state(model) === LoadingState.FINISHED), 'The wall GLB did not load in Explorer.')
  const modelLoadTicks = tickNumber() - loadStart

  const rayStart = tickNumber()
  const [wallX, , wallZ] = GLASS_WALL_CENTER
  const rays = offsets.flatMap((zOffset, i) => {
    const physicalZ = wallZ + zOffset
    const visibleZ = physicalZ + GLASS_PANEL_OFFSET[2]
    const physicalFace = wallX - GLASS_WALL_HALF_THICKNESS
    const visibleFace = physicalFace + GLASS_PANEL_OFFSET[0]
    return [
      { mask: ColliderLayer.CL_POINTER, z: physicalZ, x: undefined },
      { mask: ColliderLayer.CL_PHYSICS, z: physicalZ, x: i === 1 ? physicalFace : undefined },
      { mask: ColliderLayer.CL_POINTER, z: visibleZ, x: visibleFace },
      { mask: ColliderLayer.CL_PHYSICS, z: visibleZ, x: undefined }
    ].map((test) => ({ ...test, model: models[i], request: world.issueRay(v(2, 0.85, test.z), directionX, 3, test.mask) }))
  })
  const hits = []
  let matchingRays = 0
  for (const { model, request, x, z } of rays) {
    const { hits: result } = yield* world.readRay(request)
    const own = result.filter((hit) => hit.entityId === model)
    const hit = own[0]
    if (x === undefined ? !hit : hit?.position && Math.abs(hit.position.x - x) < 0.1 &&
      Math.abs(hit.position.z - z) < 0.05) matchingRays++
    hits.push({ expectedX: x, z, meshes: own.map(({ meshName, position }) => ({ meshName, position })) })
  }
  const rayBatchTicks = tickNumber() - rayStart
  requireCheck(matchingRays === rays.length,
    'The pointer-only panel and physics barrier must respond only in their distinct positions and collision layers. ' +
    JSON.stringify(hits))

  const beginBake = Date.now()
  const navigators = [
    createNavcatNavigatorFromMesh(bakeNavcatMesh([maskFloor(true)], smallBake)),
    createNavcatNavigatorFromMesh(bakeNavcatMesh([maskFloor(true), moveSurface(glassWallSurface(), GLASS_WALL_CENTER)], smallBake))
  ]
  const recipeBakeMs = Date.now() - beginBake
  const beginQuery = Date.now()
  const routes = navigators.map((navigator) => navigator.route(MASK_ROUTE_START, MASK_ROUTE_GOAL))
  const recipeQueryMs = Date.now() - beginQuery
  const [directZ, aroundZ] = routes.map((route) => wallCrossingZ(route))
  requireCheck(routes.every((route) => route.status === 'complete') &&
    directZ !== undefined && Math.abs(directZ - 3) < 0.15 &&
    aroundZ !== undefined && aroundZ > 3 + GLASS_WALL_HALF_DEPTH + 0.08 &&
    routeClearsPhysicalWall([MASK_ROUTE_START, ...routes[1].points]),
  'The two navcat routes must go through the pointer-only model and around the physically colliding model.')
  routes.forEach((route, index) => routeMarkers(world, route, index === 0 ? lowerColor : upperColor, offsets[index]))
  return {
    status: 'pass',
    detail: 'Explorer rays verify the distinct layer footprints. navcat uses the matching authored fixture geometry. ' +
      JSON.stringify({ matchingRays, hits, directZ, aroundZ }),
    metrics: { modelLoadTicks, rayBatchTicks, rayCount: rays.length, recipeBakeMs, recipeBakeCount: 2, recipeQueryMs, recipeQueryCount: 2 }
  }
}

function* liveClickFloor(world: ProbeWorld, tickNumber: () => number): ReturnType<RecipeRun> {
  const x = FLOOR_PICK_TARGET_X
  const z = FLOOR_PICK_TARGET_Z
  const lower = world.box(v(x, -0.06, z), v(3, 0.12, 2), lowerColor)
  const upper = world.box(v(x, 2.94, z), v(3, 0.12, 2), upperColor)
  MeshCollider.setBox(lower, ColliderLayer.CL_CUSTOM1 | ColliderLayer.CL_PHYSICS)
  MeshCollider.setBox(upper, ColliderLayer.CL_CUSTOM1 | ColliderLayer.CL_PHYSICS)
  const decoration = world.box(v(x, 3.6, z), v(0.8, 0.1, 0.8), floorColor)
  MeshCollider.setBox(decoration, ColliderLayer.CL_POINTER)
  const zones = new Map([[lower, FLOOR_PICK_LOWER], [upper, FLOOR_PICK_UPPER]])

  // Cast the tool's click ray from fixed camera origins so the engine test can replay without manual input.
  yield
  const rayStart = tickNumber()
  const [lowProbe, highProbe, pointerProbe, missProbe] = [
    world.issueRay(v(x, 1, z), Vector3.Down(), 2, ColliderLayer.CL_CUSTOM1),
    world.issueRay(v(x, 4, z), Vector3.Down(), 5, ColliderLayer.CL_CUSTOM1),
    world.issueRay(v(x, 4, z), Vector3.Down(), 2, ColliderLayer.CL_POINTER),
    world.issueRay(v(x + 3, 4, z), Vector3.Down(), 5, ColliderLayer.CL_CUSTOM1)
  ]
  const lowHits = yield* world.readRay(lowProbe)
  const highHits = yield* world.readRay(highProbe)
  const pointerHits = yield* world.readRay(pointerProbe)
  const missHits = yield* world.readRay(missProbe)
  const rayBatchTicks = tickNumber() - rayStart
  const selectStart = Date.now()
  const lowerPick = pickFloorDestination(lowHits.hits, zones)
  const upperPick = pickFloorDestination(highHits.hits, zones, lowerPick)
  const miss = pickFloorDestination(missHits.hits, zones, upperPick)
  const decorationPick = pickFloorDestination(pointerHits.hits, zones, upperPick)
  const destinationSelectionMs = Date.now() - selectStart
  requireCheck(lowerPick?.floor === 'lower' && upperPick?.floor === 'upper' &&
    miss === upperPick && decorationPick === upperPick && pointerHits.hits.some((hit) => hit.entityId === decoration) &&
    Math.hypot(lowerPick.point[0] - upperPick.point[0], lowerPick.point[2] - upperPick.point[2]) < 0.05,
  'Real Explorer rays must pick two distinct floors at the same XZ and ignore misses and pointer decoration.')

  const beginBake = Date.now()
  const navigator = createNavcatNavigatorFromMesh(bakeNavcatMesh(getSurfaces(true)))
  const recipeBakeMs = Date.now() - beginBake
  const routes: Route[] = []
  const traced = { route(start: Point, goal: Point) {
    const route = navigator.route(start, goal)
    routes.push(route)
    return route
  } }
  const beginQuery = Date.now()
  const lowerArrives = routeToPickedFloor(traced, lowerPick)
  const upperArrives = routeToPickedFloor(traced, upperPick)
  const flattened = navigator.route(FLOOR_PICK_START, [upperPick.point[0], 0, upperPick.point[2]])
  const recipeQueryMs = Date.now() - beginQuery
  const flatEnd = flattened.points[flattened.points.length - 1]
  requireCheck(lowerArrives && upperArrives && flattened.status === 'complete' && flatEnd !== undefined && flatEnd[1] < 0.2,
    'Both floor routes must arrive on their intended decks. A Y-flattened control must arrive on the lower deck.')
  routes.forEach((route, index) => routeMarkers(world, route, index === 0 ? lowerColor : upperColor))
  return {
    status: 'pass',
    detail: 'Four actual Explorer rays: valid lower and upper floor, pointer decoration, and no destination. ' +
      'Dropping Y was caught even though the route still completed. ' + JSON.stringify({ lowerPick, upperPick, flatEnd }),
    metrics: {
      rayBatchTicks, rayCount: 4, destinationSelectionMs, destinationSelections: 4,
      recipeBakeMs, recipeBakeCount: 1, recipeQueryMs, recipeQueryCount: 3
    }
  }
}

export const authoringLiveRecipes: readonly LiveRecipe[] = [
  { id: 'RECIPE-GLB-MASKS', label: 'GLB collision masks', mount: mounted(liveMasks) },
  { id: 'RECIPE-CLICK-FLOOR', label: 'Click destination on stacked floors', mount: mounted(liveClickFloor) }
]
