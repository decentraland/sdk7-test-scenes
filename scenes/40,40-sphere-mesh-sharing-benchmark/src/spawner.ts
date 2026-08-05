import { engine, Entity, Material, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'

/**
 * Sphere mesh-sharing benchmark — runtime spawner
 * ------------------------------------------------------------------
 * Validates a Unity Explorer memory optimization: SpherePrimitive shares
 * ONE immutable Mesh asset across every sphere entity, instead of allocating
 * a new Mesh per entity (Box/Plane/Cylinder still allocate a distinct mesh
 * per entity).
 *
 * The UI (see ui.tsx) drives this module in real time so the effect is
 * observable live in the Explorer's Memory Profiler: click "Add spheres"
 * repeatedly and mesh memory stays flat (shared mesh); click "Add boxes" and
 * mesh memory climbs 1:1 with the box count.
 */

// How many entities each button press spawns. Small enough to click through
// several batches while watching the Profiler, large enough that a single box
// batch is visible in the memory graph.
export const ADD_BATCH = 100

// Stack layout: each group fills a fixed GRID_COLUMNS x GRID_DEPTH footprint and
// grows UPWARD (+y), layer by layer. GRID_COLUMNS * GRID_DEPTH is sized to equal
// ADD_BATCH, so every button press drops one complete new layer on top of the
// previous one — the stack visibly rises with each click.
const GRID_COLUMNS = 10 // entities along x
const GRID_DEPTH = 10 // entities along z  (COLUMNS * DEPTH === ADD_BATCH === one layer)
const PER_LAYER = GRID_COLUMNS * GRID_DEPTH
const SPACING = 0.6 // meters between entity centers
const ENTITY_SCALE = 0.4 // meters (diameter/side length) — smaller than SPACING so entities never touch
const BASE_HEIGHT = 0.5 // meters, y of the bottom layer

// Local-coordinate anchors for each grid's near corner. Scene base parcel is
// "40,40" with a second parcel at "41,40" (see scene.json), giving a local
// coordinate space of x: 0..32, z: 0..16. Spheres fill the left half, boxes the
// right half.
const SPHERE_GRID_ORIGIN = { x: 2, z: 2 }
const BOX_GRID_ORIGIN = { x: 17.4, z: 2 }

const SPHERE_COLOR = Color4.create(0.15, 0.35, 0.95, 1) // blue = optimized/shared-mesh path
const BOX_COLOR = Color4.create(0.9, 0.2, 0.15, 1) // red = control/distinct-mesh path

// Live registries of every entity we've spawned, so "Delete all" can remove
// them and the UI can display current counts.
const spheres: Entity[] = []
const boxes: Entity[] = []

export function getSphereCount(): number {
  return spheres.length
}

export function getBoxCount(): number {
  return boxes.length
}

export function addSpheres(count: number = ADD_BATCH) {
  for (let i = 0; i < count; i++) {
    spheres.push(createSphere(stackPosition(SPHERE_GRID_ORIGIN, spheres.length)))
  }
}

export function addBoxes(count: number = ADD_BATCH) {
  for (let i = 0; i < count; i++) {
    boxes.push(createBox(stackPosition(BOX_GRID_ORIGIN, boxes.length)))
  }
}

export function deleteAll() {
  for (const entity of spheres) engine.removeEntity(entity)
  for (const entity of boxes) engine.removeEntity(entity)
  spheres.length = 0
  boxes.length = 0
}

// Places the entity at index `i` within a stack anchored at `origin`. Each layer
// is a GRID_COLUMNS x GRID_DEPTH slab in the x/z plane; once a layer fills, the
// stack grows upward (+y) into the next layer.
function stackPosition(origin: { x: number; z: number }, i: number): { x: number; y: number; z: number } {
  const layer = Math.floor(i / PER_LAYER)
  const withinLayer = i % PER_LAYER
  const column = withinLayer % GRID_COLUMNS
  const row = Math.floor(withinLayer / GRID_COLUMNS)
  return {
    x: origin.x + column * SPACING,
    y: BASE_HEIGHT + layer * SPACING,
    z: origin.z + row * SPACING
  }
}

// Optimized path: MeshRenderer.setSphere reuses a single shared, immutable Mesh
// asset across every sphere entity instead of allocating its own.
function createSphere(position: { x: number; y: number; z: number }): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position,
    scale: { x: ENTITY_SCALE, y: ENTITY_SCALE, z: ENTITY_SCALE }
  })
  MeshRenderer.setSphere(entity)
  Material.setPbrMaterial(entity, { albedoColor: SPHERE_COLOR, roughness: 0.6 })
  return entity
}

// Control/unoptimized path: MeshRenderer.setBox allocates a distinct Mesh asset
// per entity, so this group's Mesh count scales 1:1 with the box count.
function createBox(position: { x: number; y: number; z: number }): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position,
    scale: { x: ENTITY_SCALE, y: ENTITY_SCALE, z: ENTITY_SCALE }
  })
  MeshRenderer.setBox(entity)
  Material.setPbrMaterial(entity, { albedoColor: BOX_COLOR, roughness: 0.6 })
  return entity
}
