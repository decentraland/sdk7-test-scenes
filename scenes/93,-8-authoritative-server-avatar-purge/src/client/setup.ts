import {
  Entity,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  TextAlignMode,
  TextShape,
  Transform,
  engine,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { ORB_POSITION } from '../shared/config'
import { room } from '../shared/messages'
import { pollHeartbeat, showToast } from './state'
import { purgeOtherAvatars, startSwapWatch } from './repro-delete'

// --- Click feedback: flash the orb white, then lerp it back to RED. ---
// The orb is RED because it is the exploit trigger (DELETE_ENTITY injection),
// not a friendly button.
const ORB_ALBEDO = Color4.fromHexString('#ff2a2aff')
const ORB_EMISSIVE = Color4.fromHexString('#c00000ff')
const FLASH_ALBEDO = Color4.White()
const FLASH_EMISSIVE = Color4.White()
const FLASH_SECONDS = 0.8

let orbEntity: Entity | undefined
// 0 = just clicked (full flash colour), 1 = fully back to the original colour.
let flashProgress = 1

export function setupClient(): void {
  buildScene()

  // Keep the client's view of server liveness fresh (drives the UI status line).
  engine.addSystem(pollHeartbeat)
  engine.addSystem(orbFlashSystem)
  startSwapWatch() // version-aware swap detection over the local roster
  engine.addSystem(pingSystem) // verified-sender ground truth for the server detector
}

// Build the local, non-synced visuals. These are client-only decorations — the
// only synced state in this scene is the server's heartbeat.
function buildScene(): void {
  // Ground platform covering both parcels (32 × 16 m).
  const ground = engine.addEntity()
  Transform.create(ground, {
    position: Vector3.create(16, 0, 8),
    scale: Vector3.create(32, 0.1, 16)
  })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: Color4.fromHexString('#1b2a4aff') })

  // Pedestal under the orb.
  const pedestal = engine.addEntity()
  Transform.create(pedestal, {
    position: Vector3.create(ORB_POSITION.x, 0.5, ORB_POSITION.z),
    scale: Vector3.create(1.2, 1, 1.2)
  })
  MeshRenderer.setCylinder(pedestal)
  MeshCollider.setCylinder(pedestal)
  Material.setPbrMaterial(pedestal, { albedoColor: Color4.fromHexString('#3a4a6bff') })

  // The clickable RED exploit orb (glowing emissive sphere).
  const orb = engine.addEntity()
  orbEntity = orb
  Transform.create(orb, { position: ORB_POSITION, scale: Vector3.create(0.9, 0.9, 0.9) })
  MeshRenderer.setSphere(orb)
  MeshCollider.setSphere(orb) // required for the pointer raycast to hit the orb
  Material.setPbrMaterial(orb, {
    albedoColor: ORB_ALBEDO,
    emissiveColor: ORB_EMISSIVE,
    emissiveIntensity: 2
  })
  pointerEventsSystem.onPointerDown(
    { entity: orb, opts: { button: InputAction.IA_POINTER, hoverText: 'PURGE other avatars (DELETE_ENTITY)' } },
    onOrbClick
  )

  // Floating title sign.
  const sign = engine.addEntity()
  Transform.create(sign, {
    position: Vector3.create(ORB_POSITION.x, 3.4, ORB_POSITION.z),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0)
  })
  TextShape.create(sign, {
    text: 'AVATAR PURGE  (DELETE_ENTITY exploit)\n\nClick the RED orb: injects DELETE_ENTITY for every\nOTHER avatar on THIS client AND on the server.\n\nGuard test: open a 3rd (observer) client. hammurabi\nkeeps its avatars; bevy loses them. Check server logs.',
    fontSize: 3,
    textColor: Color4.fromHexString('#ff6666ff'),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
}

// The RED orb was clicked. Two purges fire, and their difference is the point:
//   1) CLIENT — inject the DELETE_ENTITY into THIS client's own engine. Wipes the
//      avatars from this browser's ECS immediately. Host-independent (below the
//      guard).
//   2) SERVER — ask the headless server to do the same on ITS engine
//      (purgeOnServer). That forwards the delete across the scene→host boundary,
//      where hammurabi denies it and bevy applies it. To SEE that difference,
//      watch a THIRD observer client (and the server logs), not this one.
// Repeatable: both re-scan every click, so late joiners are hit too.
function onOrbClick(): void {
  flashProgress = 0 // immediate local feedback

  const purged = purgeOtherAvatars() // (1) client-local
  room.send('purgeOnServer', {}) // (2) ask the server to purge on its side

  showToast(
    purged > 0
      ? `⚠ Purged ${purged} here + asked server to purge`
      : 'No other avatars here — also asked server (invite a 2nd player)'
  )
}

// Send a verified `ping` to the server ~every 2s once the room is synced. The
// payload is empty; the point is the server-side comms-verified context.from,
// which the server's swap detector cross-checks against its avatar roster.
const PING_SECONDS = 2
let pingAcc = 0
function pingSystem(dt: number): void {
  if (!isStateSyncronized()) return
  pingAcc += dt
  if (pingAcc < PING_SECONDS) return
  pingAcc = 0
  room.send('ping', {})
}

// Eases the orb from its flash colour back into RED after a click.
function orbFlashSystem(dt: number): void {
  if (flashProgress >= 1 || orbEntity === undefined) return

  flashProgress = Math.min(1, flashProgress + dt / FLASH_SECONDS)
  Material.setPbrMaterial(orbEntity, {
    albedoColor: Color4.lerp(FLASH_ALBEDO, ORB_ALBEDO, flashProgress),
    emissiveColor: Color4.lerp(FLASH_EMISSIVE, ORB_EMISSIVE, flashProgress),
    emissiveIntensity: 2
  })
}
