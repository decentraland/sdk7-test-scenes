import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { getSurfaces, type Point, type Surface } from '../../src/arena'
import {
  FLOOR_PICK_LOWER, FLOOR_PICK_START, FLOOR_PICK_TARGET_X, FLOOR_PICK_TARGET_Z, FLOOR_PICK_UPPER,
  GLASS_WALL_CENTER, GLASS_WALL_COLLIDER, GLASS_WALL_HALF_DEPTH, GLASS_WALL_MESH, GLASS_WALL_MODEL,
  MASK_ROUTE_GOAL, MASK_ROUTE_START, maskFloor, pickFloorDestination, rectangularFloor, routeClearsPhysicalWall,
  routeToPickedFloor, wallCrossingZ, type NavigationHit
} from '../../src/recipes/recipe-authoring'
import { encodeAuthoringWall, readAuthoringWall } from '../../scripts/recipe-authoring-model'
import { createTraversalNavigator } from '../sdk-detour-probe/traversal-routing'
import { usingMesh } from './ground'
import { check, type CatalogCase } from './types'

// Match the SDK7 ColliderLayer flags without importing the ECS runtime into this Node fixture.
const POINTER_MASK = 1
const PHYSICS_MASK = 2

function physicalGeometry(
  input: Buffer, position: Point, visibleMeshesCollisionMask: number, invisibleMeshesCollisionMask: number
): ReturnType<typeof readAuthoringWall> {
  return readAuthoringWall(input, position).filter(({ name }) => {
    const mask = name.endsWith('_collider') ? invisibleMeshesCollisionMask : visibleMeshesCollisionMask
    return (mask & PHYSICS_MASK) !== 0
  })
}

function timers() {
  const metrics = { recipeBakeMs: 0, recipeBakeCount: 0, recipeQueryMs: 0, recipeQueryCount: 0 }
  return {
    metrics,
    bake(start: number) { metrics.recipeBakeMs += performance.now() - start; metrics.recipeBakeCount++ },
    query<T>(lookup: () => T): T {
      const start = performance.now()
      const result = lookup()
      metrics.recipeQueryMs += performance.now() - start
      metrics.recipeQueryCount++
      return result
    }
  }
}

const masks: CatalogCase['run'] = (backend) => {
  const asset = readFileSync(new URL('../../' + GLASS_WALL_MODEL, import.meta.url))
  const timer = timers()
  const selectBegin = performance.now()
  const pointerOnly = physicalGeometry(asset, GLASS_WALL_CENTER, POINTER_MASK, 0)
  const physical = physicalGeometry(asset, GLASS_WALL_CENTER, POINTER_MASK, PHYSICS_MASK)
  const wrongSelection = physicalGeometry(asset, GLASS_WALL_CENTER, PHYSICS_MASK, 0)
  const selectMs = performance.now() - selectBegin
  function path(wall: ReturnType<typeof readAuthoringWall>, withBypass: boolean) {
    const bake = performance.now()
    return usingMesh(backend, [maskFloor(withBypass), ...wall.map(({ surface }) => surface)], (nav) => {
      timer.bake(bake)
      return timer.query(() => nav.route(MASK_ROUTE_START, MASK_ROUTE_GOAL))
    })
  }
  const direct = path(pointerOnly, true)
  const around = path(physical, true)
  const sealed = path(physical, false)
  const wrong = path(wrongSelection, true)
  const directZ = wallCrossingZ(direct)
  const aroundZ = wallCrossingZ(around)
  const wrongZ = wallCrossingZ(wrong)
  const clears = (route: typeof around) => routeClearsPhysicalWall([MASK_ROUTE_START, ...route.points])
  const earlyCorner = { status: 'complete' as const, points: [MASK_ROUTE_START, [3.9, 0, 3], [4, 0, 4.7], MASK_ROUTE_GOAL] as Point[] }
  const cornerCrossing = wallCrossingZ(earlyCorner)
  const cornerControl = cornerCrossing !== undefined && cornerCrossing > GLASS_WALL_CENTER[2] + GLASS_WALL_HALF_DEPTH + 0.08 &&
    !clears(earlyCorner)
  return {
    ...check(pointerOnly.length === 0 && physical.length === 1 && physical[0].name === GLASS_WALL_COLLIDER &&
      wrongSelection.length === 1 && wrongSelection[0].name === GLASS_WALL_MESH &&
      direct.status === 'complete' && directZ !== undefined && Math.abs(directZ - MASK_ROUTE_START[2]) < 0.15 &&
      around.status === 'complete' && aroundZ !== undefined && aroundZ > GLASS_WALL_CENTER[2] + GLASS_WALL_HALF_DEPTH + 0.08 &&
      clears(around) && sealed.status === 'unreachable' && wrong.status === 'complete' && wrongZ !== undefined &&
      Math.abs(wrongZ - MASK_ROUTE_START[2]) < 0.15 && !clears(wrong) && cornerControl,
    'The named physical mesh forces a continuously clear bypass. Without the bypass the goal is unreachable. ' +
    'Replacing the collider with the visible mesh leaves a route crossing the physical wall. A corner-cut path fails the sweep. ' +
    JSON.stringify({ selected: physical.map(({ name }) => name), wrongSelection: wrongSelection.map(({ name }) => name),
      directZ, aroundZ, sweptClear: clears(around), sealed: sealed.status, wrongZ, cornerControl })),
    metrics: { ...timer.metrics, geometrySelectionMs: selectMs, geometrySelections: 3 }
  }
}

function fingerprintBakeInput(surfaces: readonly Surface[], settings: { radius: number; height: number; schema: string }): string {
  const triangles = surfaces.flatMap((surface) => {
    const rows: string[] = []
    for (let i = 0; i < surface.triangles.length; i += 3) {
      const points = surface.triangles.slice(i, i + 3).map((id) => surface.vertices[id].map(Math.fround))
      // Any cyclic start represents the same triangle. Preserve winding.
      const starts = points.map((_, j) => JSON.stringify([...points.slice(j), ...points.slice(0, j)]))
      rows.push(starts.sort()[0])
    }
    return rows
  })
  return createHash('sha256').update(JSON.stringify([settings, triangles.sort()])).digest('hex')
}

const freshness: CatalogCase['run'] = (backend) => {
  const path = GLASS_WALL_MODEL
  const original = readFileSync(new URL('../../' + path, import.meta.url))
  const recolored = encodeAuthoringWall(GLASS_WALL_HALF_DEPTH, [0.95, 0.32, 0.18, 0.48])
  const narrowed = encodeAuthoringWall(1.95)
  const pose: Point = [4, 0, 2.4]
  const moved: Point = [4.25, 0, 2.4]
  const floor = rectangularFloor(1, 7, 1, 5)
  const settings = { radius: 0.40, height: 1.4, schema: 'authoring-5cm-v1' }
  const cache = new Map<string, ReturnType<typeof createTraversalNavigator>>()
  const timer = timers()
  let geometryFingerprintMs = 0
  function refresh(input: Buffer, position: Point) {
    const fingerprintStart = performance.now()
    const surfaces = [floor, ...physicalGeometry(input, position, POINTER_MASK, PHYSICS_MASK).map(({ surface }) => surface)]
    const key = fingerprintBakeInput(surfaces, settings)
    geometryFingerprintMs += performance.now() - fingerprintStart
    const cached = cache.get(key)
    const request = (navigation: ReturnType<typeof createTraversalNavigator>) =>
      timer.query(() => navigation.route([2, 0, 2.5], [6, 0, 2.5]))
    if (cached) return { key, found: true, route: request(cached) }
    const bake = performance.now()
    const navigation = createTraversalNavigator(backend, surfaces, settings.radius, settings.height)
    timer.bake(bake)
    cache.set(key, navigation)
    return { key, found: false, route: request(navigation) }
  }
  try {
    const base = refresh(original, pose)
    const tint = refresh(recolored, pose)
    const geometry = refresh(narrowed, pose)
    const translated = refresh(original, moved)
    const byPath = new Map([[path, base.key]])
    const staleMesh = cache.get(byPath.get(path) ?? '')
    // A file-name-only lookup still sees the old doorway as open.
    const falseHit = timer.query(() => staleMesh?.route([2, 0, 2.5], [6, 0, 2.5]))?.status === 'complete' &&
      geometry.route.status === 'unreachable'
    const rawBytesCauseFalseMiss = !original.equals(recolored) && tint.key === base.key
    const passing = base.route.status === 'complete' && translated.route.status === 'complete' &&
      tint.found && !geometry.found && !translated.found && timer.metrics.recipeBakeCount === 3 &&
      base.key !== geometry.key && base.key !== translated.key && falseHit && rawBytesCauseFalseMiss
    return {
      ...check(passing, 'Only the authoring geometry and bake settings are hashed. ' +
        JSON.stringify({
          route: base.route.status, recolorCacheHit: tint.found, changedGeometry: geometry.route.status,
          movedCacheHit: translated.found, pathOnlyWouldAcceptStale: falseHit, byteHashWouldRebakeRecolor: rawBytesCauseFalseMiss
        })),
      metrics: { ...timer.metrics, geometryFingerprintMs, fingerprintCount: 4 }
    }
  } finally {
    for (const navigation of cache.values()) navigation.dispose?.()
  }
}

const clickFloor: CatalogCase['run'] = (backend) => {
  const timer = timers()
  const zoneLower = 537
  const zoneUpper = 149
  const decoration = 197
  const zones = new Map([[zoneLower, FLOOR_PICK_LOWER], [zoneUpper, FLOOR_PICK_UPPER]])
  const hit = (entityId: number, y: number, length: number): NavigationHit => ({
    entityId, position: { x: FLOOR_PICK_TARGET_X, y, z: FLOOR_PICK_TARGET_Z }, length
  })
  const begin = performance.now()
  // SDK7 ray-result shapes are injected here. The paired Explorer case validates real collider masks.
  const low = pickFloorDestination([hit(zoneLower, 0, 0.75)], zones)
  const high = pickFloorDestination([hit(zoneLower, 0, 4.1), hit(decoration, 3.7, 0.4), hit(zoneUpper, 3, 1.1)], zones, low)
  const miss = pickFloorDestination([hit(decoration, 3.7, 0.4)], zones, high)
  const invalidElevation = pickFloorDestination([hit(zoneUpper, 0, 0.4)], zones, high)
  const selectMs = performance.now() - begin
  const bake = performance.now()
  return usingMesh(backend, getSurfaces(true), (nav) => {
    timer.bake(bake)
    const lowerConnected = timer.query(() => low !== undefined && routeToPickedFloor(nav, low))
    const upperConnected = timer.query(() => high !== undefined && routeToPickedFloor(nav, high))
    const flattened = timer.query(() => high && nav.route(FLOOR_PICK_START, [high.point[0], 0, high.point[2]]))
    const flatEnd = flattened?.points[flattened.points.length - 1]
    return {
      ...check(low?.floor === 'lower' && high?.floor === 'upper' && lowerConnected && upperConnected &&
        low.point[0] === high.point[0] && low.point[2] === high.point[2] && miss === high && invalidElevation === high &&
        flattened?.status === 'complete' && flatEnd !== undefined && Math.abs(flatEnd[1]) < 0.2,
      'Injected SDK-shaped hits select both floors at equal XZ, ignore decoration and preserve the goal on a miss. ' +
      'Dropping Y produces a valid route to the wrong floor. ' +
      JSON.stringify({ low, high, preserved: miss === high && invalidElevation === high, flatEnd })),
      metrics: { ...timer.metrics, destinationSelectionMs: selectMs, destinationSelections: 4 }
    }
  })
}

export const authoringRecipeCases: CatalogCase[] = [
  { id: 'RECIPE-GLB-MASKS', layer: 'integration', run: masks },
  { id: 'RECIPE-BAKE-FRESHNESS', layer: 'integration', run: freshness },
  { id: 'RECIPE-CLICK-FLOOR', layer: 'integration', run: clickFloor }
]
