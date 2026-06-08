/**
 * ColliderLayer showcase scene
 *
 * Demonstrates how each ColliderLayer value (CL_PLAYER, CL_MAIN_PLAYER, CL_PHYSICS,
 * CL_POINTER, CL_CUSTOM*) behaves across the SDK components that consume collider
 * masks: TriggerArea, Raycast, MeshCollider, and GltfContainer.
 *
 * Parcel: 5,5
 *
 * Layout (top-down, north = +z):
 *
 *   z=14    [T1] [T2] [T3] [T4]            ← TriggerArea row
 *
 * TriggerArea boxes (T1–T4):
 *   Box 1: CL_PLAYER            — fires for remote avatars only
 *   Box 2: CL_MAIN_PLAYER       — fires for the local player only
 *   Box 3: CL_PLAYER|CL_MAIN_PLAYER — fires for both local and remote
 *   Box 4: CL_PHYSICS            — negative control: never fires for any avatar (CL_PHYSICS targets scene-mesh walls / floors, not the character).
 *   z=11                          [Gltf]   ← GltfContainer with CL_MAIN_PLAYER visible mesh
 *
 *   z=8.5             [MC_N]
 *   z=7.77       [MC_NW]   [MC_NE]
 *   z=6      [MC_W]   ⊙   [MC_E]            ← Raycast emitter (clickable sphere)
 *   z=4.23       [MC_SW]   [MC_SE]
 *   z=3.5             [MC_S]
 *
 * - Click the yellow sphere to rotate its forward direction by +45° around Y.
 * - The thin yellow beam visualises the current ray: full length if no hit,
 *   shortened to the hit distance if a collider qualifies.
 * - The mask cycles every 2 s (CL_PLAYER → CL_MAIN_PLAYER → CL_PHYSICS) so
 *   you can hold a rotation and watch all three results in turn.
 */

import {
  Billboard,
  BillboardMode,
  ColliderLayer,
  GltfContainer,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  Raycast,
  RaycastQueryType,
  RaycastResult,
  TextShape,
  Transform,
  TriggerArea,
  engine,
  pointerEventsSystem,
  triggerAreaEventsSystem,
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

// ─── helpers ─────────────────────────────────────────────────────────────────

function label(text: string, pos: Vector3, color: Color4 = Color4.White()): void {
  const e = engine.addEntity()
  Transform.create(e, { position: pos })
  Billboard.create(e, { billboardMode: BillboardMode.BM_Y })
  TextShape.create(e, { text, textColor: color, fontSize: 3 })
}

// ─── A. TriggerArea row (moved north to give the raycast section open space) ──

function makeTriggerBox(
  x: number,
  maskLabel: string,
  initialColor: Color4,
  mask: ColliderLayer | number
): void {
  const z = 14
  const pos = Vector3.create(x, 1, z)
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale: Vector3.create(1.5, 2, 1.5) })
  MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, { albedoColor: { ...initialColor, a: 0.5 } })
  TriggerArea.setBox(e, mask as ColliderLayer)
  label(maskLabel, Vector3.create(x, pos.y + 1.8, z))

  triggerAreaEventsSystem.onTriggerEnter(e, (result) => {
    const trigEntity = result.trigger?.entity ?? -1
    console.log(`TriggerArea [${maskLabel}] ENTER — triggering entity: ${trigEntity}`)
    Material.setPbrMaterial(e, { albedoColor: Color4.create(0, 1, 0.4, 0.7) })
  })

  triggerAreaEventsSystem.onTriggerExit(e, () => {
    Material.setPbrMaterial(e, { albedoColor: { ...initialColor, a: 0.5 } })
  })
}

makeTriggerBox(3, 'CL_PLAYER',              Color4.create(0.2, 0.5, 1, 0.5), ColliderLayer.CL_PLAYER)
makeTriggerBox(5, 'CL_MAIN_PLAYER',         Color4.create(1, 0.5, 0, 0.5),   ColliderLayer.CL_MAIN_PLAYER)
makeTriggerBox(
  7,
  'CL_PLAYER\n| CL_MAIN_PLAYER',
  Color4.create(0.8, 0.2, 1, 0.5),
  (ColliderLayer.CL_PLAYER | ColliderLayer.CL_MAIN_PLAYER) as unknown as ColliderLayer
)
makeTriggerBox(9, 'CL_PHYSICS (no hit)',    Color4.create(0.5, 0.5, 0.5, 0.5), ColliderLayer.CL_PHYSICS)

// ─── B. Raycast emitter — clickable sphere + ring of MeshCollider targets ────

const SPHERE_POS = Vector3.create(8, 1, 6)
const SPHERE_SCALE = 0.3
const SPHERE_RADIUS_WORLD = SPHERE_SCALE * 0.5 // built-in sphere is unit-diameter

const RAY_MAX_DISTANCE = 3
// Push the ray origin just outside the sphere collider so we never self-hit.
const RAY_ORIGIN_OFFSET = SPHERE_RADIUS_WORLD + 0.05

const RAYCAST_MASKS: Array<{ name: string; mask: number }> = [
  { name: 'CL_PLAYER',      mask: ColliderLayer.CL_PLAYER },
  { name: 'CL_MAIN_PLAYER', mask: ColliderLayer.CL_MAIN_PLAYER },
  { name: 'CL_PHYSICS',     mask: ColliderLayer.CL_PHYSICS },
  { name: 'CL_CUSTOM1',     mask: ColliderLayer.CL_CUSTOM1 },
]

const raycastEntity = engine.addEntity()
Transform.create(raycastEntity, {
  position: SPHERE_POS,
  scale: Vector3.create(SPHERE_SCALE, SPHERE_SCALE, SPHERE_SCALE),
})
MeshRenderer.setSphere(raycastEntity)
Material.setPbrMaterial(raycastEntity, {
  albedoColor: Color4.create(1, 1, 0, 1),
  emissiveColor: Color3.create(0.5, 0.5, 0),
  emissiveIntensity: 1,
})
// CL_POINTER lets the player's cursor click the sphere. The originOffset above
// guarantees the cycling raycast never self-hits this pointer collider.
MeshCollider.setSphere(raycastEntity, ColliderLayer.CL_POINTER)

// Hover hint via the pointer-events component (clickable).
pointerEventsSystem.onPointerDown(
  {
    entity: raycastEntity,
    opts: { button: InputAction.IA_POINTER, hoverText: 'Rotate ray +45°' },
  },
  () => {
    rotateBy45()
  }
)

// Label above the sphere — keep it as a separate (un-parented) entity so the
// sphere's 0.3 scale doesn't shrink the text. The text colour signals whether
// the latest raycast qualified a hit (green) or not (yellow).
const LABEL_COLOR_HIT = Color4.create(0.2, 1, 0.4, 1)
const LABEL_COLOR_NO_HIT = Color4.create(1, 0.95, 0.2, 1)

const raycastLabelEntity = engine.addEntity()
Transform.create(raycastLabelEntity, { position: Vector3.create(SPHERE_POS.x, SPHERE_POS.y + 1.2, SPHERE_POS.z) })
Billboard.create(raycastLabelEntity, { billboardMode: BillboardMode.BM_Y })
TextShape.create(raycastLabelEntity, {
  text: 'Raycast: CL_PLAYER\n(click sphere to rotate)',
  fontSize: 3,
  textColor: LABEL_COLOR_NO_HIT,
})

// Ray visualiser — thin elongated box updated each cycle/click.
const visualizerEntity = engine.addEntity()
Transform.create(visualizerEntity, {
  position: SPHERE_POS,
  scale: Vector3.create(0.04, 0.04, RAY_MAX_DISTANCE - RAY_ORIGIN_OFFSET),
})
MeshRenderer.setBox(visualizerEntity)
Material.setPbrMaterial(visualizerEntity, {
  albedoColor: Color4.create(1, 1, 0, 0.85),
  emissiveColor: Color3.create(0.9, 0.9, 0.1),
  emissiveIntensity: 0.6,
})

// ─── B.1 cycling state + rotation ─────────────────────────────────────────────

let raycastMaskIndex = 0
let raycastTimer = 0
let raycastTimestamp = 0
let displayedMaskName = RAYCAST_MASKS[0].name
let currentYDeg = 0

function currentDirectionXZ(): { x: number; z: number } {
  const rad = (currentYDeg * Math.PI) / 180
  return { x: Math.sin(rad), z: Math.cos(rad) }
}

function fireRaycast(mask: number): void {
  raycastTimestamp++
  const dir = currentDirectionXZ()
  Raycast.createOrReplace(raycastEntity, {
    // originOffset is added in world space (NOT rotated by the entity's
    // rotation) per the Explorer's PBRaycast handling, so we compute the
    // rotated offset ourselves.
    originOffset: Vector3.create(dir.x * RAY_ORIGIN_OFFSET, 0, dir.z * RAY_ORIGIN_OFFSET),
    direction: { $case: 'localDirection', localDirection: Vector3.Forward() },
    maxDistance: RAY_MAX_DISTANCE,
    queryType: RaycastQueryType.RQT_HIT_FIRST,
    continuous: false,
    collisionMask: mask,
    timestamp: raycastTimestamp,
  })
}

function updateVisualizer(hitDistance: number | null): void {
  const dir = currentDirectionXZ()
  // hitDistance is measured from the ray origin (already past RAY_ORIGIN_OFFSET).
  const length = hitDistance ?? RAY_MAX_DISTANCE
  // Visualiser starts at the ray origin (sphere edge) and extends `length` along the ray.
  const centerDistance = RAY_ORIGIN_OFFSET + length / 2

  const t = Transform.getMutable(visualizerEntity)
  t.position = Vector3.create(
    SPHERE_POS.x + dir.x * centerDistance,
    SPHERE_POS.y,
    SPHERE_POS.z + dir.z * centerDistance
  )
  t.rotation = Quaternion.fromEulerDegrees(0, currentYDeg, 0)
  t.scale = Vector3.create(0.04, 0.04, length)
}

function rotateBy45(): void {
  currentYDeg = (currentYDeg + 45) % 360
  Transform.getMutable(raycastEntity).rotation = Quaternion.fromEulerDegrees(0, currentYDeg, 0)
  // Re-fire so the visualiser updates without waiting for the cycle timer.
  fireRaycast(RAYCAST_MASKS[raycastMaskIndex].mask)
}

// Seed the first raycast & visualiser.
fireRaycast(RAYCAST_MASKS[0].mask)
updateVisualizer(null)

engine.addSystem((dt: number) => {
  raycastTimer += dt
  if (raycastTimer < 2) return
  raycastTimer = 0

  // 1. Read result of last raycast and refresh the label + visualiser.
  const result = RaycastResult.getOrNull(raycastEntity)
  const didHit = !!(result && result.hits.length > 0)
  let hitInfo = 'no hit'
  let hitDistance: number | null = null
  if (didHit) {
    const h = result!.hits[0]
    hitDistance = h.length ?? null
    hitInfo = `entity:${h.entityId ?? '?'} d:${hitDistance?.toFixed(2) ?? '?'}`
  }
  const lbl = TextShape.getMutable(raycastLabelEntity)
  lbl.text = `Raycast: ${displayedMaskName}\n${hitInfo}`
  lbl.textColor = didHit ? LABEL_COLOR_HIT : LABEL_COLOR_NO_HIT
  updateVisualizer(hitDistance)

  // 2. Cycle mask and fire next ray.
  raycastMaskIndex = (raycastMaskIndex + 1) % RAYCAST_MASKS.length
  const next = RAYCAST_MASKS[raycastMaskIndex]
  fireRaycast(next.mask)
  displayedMaskName = next.name
})

// ─── B.2 MeshCollider ring around the sphere ─────────────────────────────────

interface RingCube {
  angle: number              // degrees from +Z (forward), clockwise as you look down
  mask: ColliderLayer | number
  name: string
  color: Color4
}

const RING_RADIUS = 2.5
const CUBE_SCALE = 0.8

const RING_CUBES: RingCube[] = [
  { angle:   0, mask: ColliderLayer.CL_PHYSICS,                                                    name: 'CL_PHYSICS',          color: Color4.create(0.5, 0.5, 0.5, 1) },
  { angle:  45, mask: ColliderLayer.CL_POINTER,                                                    name: 'CL_POINTER',          color: Color4.create(0.8, 0.3, 0.9, 1) },
  { angle:  90, mask: (ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER),                       name: 'CL_PHYSICS|POINTER',  color: Color4.create(0.95, 0.95, 0.95, 1) },
  { angle: 135, mask: ColliderLayer.CL_PLAYER,                                                     name: 'CL_PLAYER',           color: Color4.create(0.2, 0.5, 1, 1) },
  { angle: 180, mask: ColliderLayer.CL_MAIN_PLAYER,                                                name: 'CL_MAIN_PLAYER',      color: Color4.create(1, 0.55, 0.1, 1) },
  { angle: 225, mask: (ColliderLayer.CL_PLAYER | ColliderLayer.CL_MAIN_PLAYER),                    name: 'CL_PLAYER|CL_MAIN',   color: Color4.create(0.9, 0.3, 0.7, 1) },
  { angle: 270, mask: ColliderLayer.CL_CUSTOM1,                                                    name: 'CL_CUSTOM1',          color: Color4.create(0.3, 0.85, 0.4, 1) },
  { angle: 315, mask: (ColliderLayer.CL_PHYSICS | ColliderLayer.CL_PLAYER),                        name: 'CL_PHYSICS|CL_PLAYER',color: Color4.create(0.2, 0.85, 0.95, 1) },
]

for (const cube of RING_CUBES) {
  const rad = (cube.angle * Math.PI) / 180
  const x = SPHERE_POS.x + Math.sin(rad) * RING_RADIUS
  const z = SPHERE_POS.z + Math.cos(rad) * RING_RADIUS

  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(x, SPHERE_POS.y, z),
    scale: Vector3.create(CUBE_SCALE, CUBE_SCALE, CUBE_SCALE),
  })
  MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, { albedoColor: cube.color })
  MeshCollider.setBox(e, cube.mask as ColliderLayer)
  label(cube.name, Vector3.create(x, SPHERE_POS.y + 0.9, z))
}

// ─── C. GltfContainer with CL_MAIN_PLAYER visible collider ───────────────────

label('GltfContainer: visible CL_MAIN_PLAYER', Vector3.create(13, 3, 11))

const gltfEntity = engine.addEntity()
Transform.create(gltfEntity, { position: Vector3.create(13, 1, 11) })
GltfContainer.create(gltfEntity, {
  src: 'assets/starCoin.glb',
  visibleMeshesCollisionMask: ColliderLayer.CL_MAIN_PLAYER,
  invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
})

