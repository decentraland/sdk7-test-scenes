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
import { isServerAlive, pollHeartbeat, setMyScore, showToast } from './state'

// A claim queued locally, waiting for the room to be synced before it is sent.
let pendingClaim = false

export function setupClient(): void {
  buildScene()

  // Server → me: my new authoritative total.
  room.onMessage('scoreUpdate', (data) => setMyScore(data.total))

  // Server → me: claim was rejected (too far, etc.).
  room.onMessage('claimRejected', (data) => showToast(data.reason))

  engine.addSystem(claimRetrySystem)
}

// Build the local, non-synced visuals. These are client-only decorations — the
// only synced state in this scene is owned and created by the server.
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

  // The clickable score orb (glowing emissive sphere).
  const orb = engine.addEntity()
  Transform.create(orb, { position: ORB_POSITION, scale: Vector3.create(0.9, 0.9, 0.9) })
  MeshRenderer.setSphere(orb)
  MeshCollider.setSphere(orb) // required for the pointer raycast to hit the orb
  Material.setPbrMaterial(orb, {
    albedoColor: Color4.fromHexString('#ffd34eff'),
    emissiveColor: Color4.fromHexString('#ffb000ff'),
    emissiveIntensity: 2
  })
  pointerEventsSystem.onPointerDown(
    { entity: orb, opts: { button: InputAction.IA_POINTER, hoverText: 'Score a point!' } },
    tryClaim
  )

  // Floating title sign.
  const sign = engine.addEntity()
  Transform.create(sign, {
    position: Vector3.create(ORB_POSITION.x, 3.4, ORB_POSITION.z),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0)
  })
  TextShape.create(sign, {
    text: 'AUTHORITATIVE SERVER\nLEADERBOARD\n\nClick the orb to score',
    fontSize: 3,
    textColor: Color4.White(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
}

// The orb was clicked. We never send a score — only the intent to claim a point.
function tryClaim(): void {
  // Server-not-alive is a long (cold-start) failure that may never resolve — tell
  // the player explicitly instead of silently buffering a click that goes nowhere.
  if (!isServerAlive()) {
    showToast('Server is waking up — try again in a moment…')
    return
  }
  // Room-not-synced is a brief (~1 s) load-time blip — buffer and auto-fire.
  pendingClaim = true
}

function claimRetrySystem(): void {
  // Keep the client's view of server liveness fresh.
  pollHeartbeat()

  if (!pendingClaim) return
  if (!isStateSyncronized()) return

  room.send('claimPoint', { nonce: 0 })
  pendingClaim = false
}
