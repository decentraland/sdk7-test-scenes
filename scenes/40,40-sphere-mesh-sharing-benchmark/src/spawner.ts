import { engine, Entity, Material, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'

/**
 * Sphere mesh-sharing benchmark — runtime spawner
 * ------------------------------------------------------------------
 * Validates a Unity Explorer memory optimization: SpherePrimitive shares ONE
 * immutable Mesh asset across every sphere entity, instead of allocating a new
 * Mesh per entity.
 *
 * The comparison is made ACROSS Explorer builds: run this same scene on an old
 * build (no sharing) and on a new build (shared mesh) and watch the Memory
 * Profiler. On the old build, mesh memory climbs 1:1 with the sphere count; on
 * the new build it stays flat no matter how many spheres you spawn. That's why
 * there's no in-scene control group — the control is the old build itself.
 *
 * The UI (see ui.tsx) drives this module in real time: click "Add spheres" to
 * pile on thousands of spheres, "Delete all" to reset.
 */

// How many spheres each button press spawns. Large so the mesh-memory
// divergence between old and new builds becomes obvious after just a click or
// two.
export const ADD_BATCH = 1000

// Stack layout: spheres fill a fixed GRID_COLUMNS x GRID_DEPTH footprint (sized
// to span most of the 2-parcel scene) and grow UPWARD (+y), layer by layer, as
// more are added.
const GRID_COLUMNS = 48 // entities along x
const GRID_DEPTH = 24 // entities along z
const PER_LAYER = GRID_COLUMNS * GRID_DEPTH
const SPACING = 0.6 // meters between entity centers
const ENTITY_SCALE = 0.4 // meters (diameter) — smaller than SPACING so spheres never touch
const BASE_HEIGHT = 0.5 // meters, y of the bottom layer

// Local-coordinate anchor for the stack's near corner. Scene base parcel is
// "40,40" with a second parcel at "41,40" (see scene.json), giving a local
// coordinate space of x: 0..32, z: 0..16. The footprint above fits inside it.
const GRID_ORIGIN = { x: 2, z: 1 }

const SPHERE_COLOR = Color4.create(0.15, 0.35, 0.95, 1) // blue

// Live registry of every sphere we've spawned, so "Delete all" can remove them
// and the UI can display the current count.
const spheres: Entity[] = []

export function getSphereCount(): number {
  return spheres.length
}

export function addSpheres(count: number = ADD_BATCH) {
  for (let i = 0; i < count; i++) {
    spheres.push(createSphere(stackPosition(spheres.length)))
  }
}

export function deleteAll() {
  for (const entity of spheres) engine.removeEntity(entity)
  spheres.length = 0
}

// Places the sphere at index `i` within the stack. Each layer is a
// GRID_COLUMNS x GRID_DEPTH slab in the x/z plane; once a layer fills, the stack
// grows upward (+y) into the next layer.
function stackPosition(i: number): { x: number; y: number; z: number } {
  const layer = Math.floor(i / PER_LAYER)
  const withinLayer = i % PER_LAYER
  const column = withinLayer % GRID_COLUMNS
  const row = Math.floor(withinLayer / GRID_COLUMNS)
  return {
    x: GRID_ORIGIN.x + column * SPACING,
    y: BASE_HEIGHT + layer * SPACING,
    z: GRID_ORIGIN.z + row * SPACING
  }
}

// MeshRenderer.setSphere reuses a single shared, immutable Mesh asset across
// every sphere entity (on builds with the optimization) instead of allocating
// its own.
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
