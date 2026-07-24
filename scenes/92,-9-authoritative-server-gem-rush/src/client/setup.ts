import {
  Material,
  MeshCollider,
  MeshRenderer,
  TextAlignMode,
  TextShape,
  Transform,
  engine
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { room } from '../shared/messages'
import { isServerAlive, pollHeartbeat, setLifetimeStats, setMyRoundTotal, showToast } from './state'

// Collects queued locally, waiting for the room to be synced before being sent.
const pendingCollects: number[] = []
let statsRequested = false

export function setupClient(): void {
  buildScene()

  // Server → me: my collect was accepted; authoritative round total.
  room.onMessage('gemCollected', (data) => {
    setMyRoundTotal(data.roundTotal)
    showToast(data.value > 1 ? `Rare gem! +${data.value}` : '+1 gem')
  })

  // Server → me: collect was rejected (too far, too late, no round).
  room.onMessage('collectRejected', (data) => showToast(data.reason))

  // Server → me: my persisted lifetime stats.
  room.onMessage('myStats', (data) => setLifetimeStats(data))

  engine.addSystem(clientSyncSystem)
}

// The player clicked a gem. We never send a score — only the intent to collect.
export function queueCollect(gemId: number): void {
  // Server-not-alive is a long (cold-start) failure that may never resolve — tell
  // the player explicitly instead of silently buffering a click that goes nowhere.
  if (!isServerAlive()) {
    showToast('Server is waking up — try again in a moment…')
    return
  }
  // Room-not-synced is a brief (~1 s) load-time blip — buffer and auto-fire.
  pendingCollects.push(gemId)
}

function clientSyncSystem(): void {
  // Keep the client's view of server liveness fresh.
  pollHeartbeat()

  if (!isStateSyncronized()) return

  // Ask the server for my persisted lifetime stats exactly once per session.
  if (!statsRequested) {
    statsRequested = true
    room.send('getMyStats', {})
  }

  while (pendingCollects.length > 0) {
    const gemId = pendingCollects.shift()!
    room.send('collectGem', { gemId })
  }
}

// Build the local, non-synced visuals. These are client-only decorations — the
// only synced state in this scene is owned and created by the server.
function buildScene(): void {
  // Ground platform covering the single parcel (16 × 16 m).
  const ground = engine.addEntity()
  Transform.create(ground, {
    position: Vector3.create(8, 0, 8),
    scale: Vector3.create(16, 0.1, 16)
  })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: Color4.fromHexString('#14261bff') })

  // Floating title sign.
  const sign = engine.addEntity()
  Transform.create(sign, {
    position: Vector3.create(8, 3.6, 8),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0)
  })
  TextShape.create(sign, {
    text: 'GEM RUSH\n\nCollect gems during the round —\nstorage is only written at round end',
    fontSize: 3,
    textColor: Color4.White(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
}
