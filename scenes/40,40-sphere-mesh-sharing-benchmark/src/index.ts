import { setupUi } from './ui'

/**
 * Sphere mesh-sharing benchmark
 * ------------------------------------------------------------------
 * Validates a Unity Explorer memory optimization: SpherePrimitive shares ONE
 * immutable Mesh asset across every sphere entity, instead of allocating a new
 * Mesh per entity (Box/Plane/Cylinder still allocate a distinct mesh per
 * entity).
 *
 * The scene starts empty. Use the on-screen UI to spawn shapes in real time
 * while watching the Explorer's Memory Profiler:
 *   - "+N spheres" : mesh memory stays flat, no matter how many you add
 *     (shared-mesh path).
 *   - "+N boxes"   : mesh memory climbs 1:1 with the box count (control path).
 *   - "Delete all" : removes every spawned shape.
 *
 * All spawn/registry logic lives in src/spawner.ts; the buttons live in
 * src/ui.tsx. See README.md for the exact validation steps.
 */

export function main() {
  setupUi()
}
