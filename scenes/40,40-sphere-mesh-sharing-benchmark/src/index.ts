import { engine, Entity, Material, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'

/**
 * Sphere mesh-sharing benchmark
 * ------------------------------------------------------------------
 * Validates a Unity Explorer memory optimization: SpherePrimitive now
 * shares ONE immutable Mesh asset across every sphere entity, instead of
 * allocating a new Mesh per entity (Box/Plane/Cylinder still allocate a
 * distinct mesh per entity).
 *
 * This scene spawns two equal-size grids:
 *   - LEFT  (blue)  : COUNT_PER_GROUP sphere entities  -> optimized path
 *   - RIGHT (red)   : COUNT_PER_GROUP box entities     -> unoptimized/control path
 *
 * In the Explorer's Memory Profiler (Memory module), the box grid should
 * show COUNT_PER_GROUP distinct Mesh assets (and proportionally more mesh
 * memory), while the sphere grid should collapse to a single shared Mesh
 * asset regardless of COUNT_PER_GROUP. See README.md for the exact
 * validation steps.
 */

// Single knob to scale the test. 512 entities per group is large enough to
// make the mesh-memory difference obvious in the Profiler while still
// building/loading quickly. Raise it to make the contrast even starker.
const COUNT_PER_GROUP = 512

// Grid layout: entities are laid out in a square-ish grid, one group per
// half of the scene. SPACING/ENTITY_SCALE keep neighbors from overlapping.
const GRID_COLUMNS = Math.ceil(Math.sqrt(COUNT_PER_GROUP))
const SPACING = 0.6 // meters between entity centers
const ENTITY_SCALE = 0.4 // meters (diameter/side length) — smaller than SPACING so entities never touch
const ENTITY_HEIGHT = 1 // meters, comfortable eye-level for both grids

// Local-coordinate anchors for each grid's near corner. Scene base parcel is
// "40,40" with a second parcel at "41,40" (see scene.json), which gives a
// local coordinate space of x: 0..32, z: 0..16. Both grids are (GRID_COLUMNS
// - 1) * SPACING wide/deep at most (13.2m for the default 512 count), so
// they comfortably fit side by side with margin to spare.
const SPHERE_GRID_ORIGIN = { x: 2, z: 2 }
const BOX_GRID_ORIGIN = { x: 17.4, z: 2 }

const SPHERE_COLOR = Color4.create(0.15, 0.35, 0.95, 1) // blue = optimized/shared-mesh path
const BOX_COLOR = Color4.create(0.9, 0.2, 0.15, 1) // red = control/distinct-mesh path

export function main() {
  spawnGrid(SPHERE_GRID_ORIGIN, createSphere)
  spawnGrid(BOX_GRID_ORIGIN, createBox)
}

function spawnGrid(origin: { x: number; z: number }, createEntity: (x: number, z: number) => Entity) {
  for (let i = 0; i < COUNT_PER_GROUP; i++) {
    const column = i % GRID_COLUMNS
    const row = Math.floor(i / GRID_COLUMNS)
    createEntity(origin.x + column * SPACING, origin.z + row * SPACING)
  }
}

// Optimized path: MeshRenderer.setSphere allocates a single shared, immutable
// Mesh the first time it's used, and every subsequent sphere entity reuses
// that same Mesh asset instead of allocating its own.
function createSphere(x: number, z: number): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: { x, y: ENTITY_HEIGHT, z },
    scale: { x: ENTITY_SCALE, y: ENTITY_SCALE, z: ENTITY_SCALE }
  })
  MeshRenderer.setSphere(entity)
  Material.setPbrMaterial(entity, { albedoColor: SPHERE_COLOR, roughness: 0.6 })
  return entity
}

// Control/unoptimized path: MeshRenderer.setBox allocates a distinct Mesh
// asset per entity, so this group's Mesh count scales 1:1 with COUNT_PER_GROUP.
function createBox(x: number, z: number): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: { x, y: ENTITY_HEIGHT, z },
    scale: { x: ENTITY_SCALE, y: ENTITY_SCALE, z: ENTITY_SCALE }
  })
  MeshRenderer.setBox(entity)
  Material.setPbrMaterial(entity, { albedoColor: BOX_COLOR, roughness: 0.6 })
  return entity
}
