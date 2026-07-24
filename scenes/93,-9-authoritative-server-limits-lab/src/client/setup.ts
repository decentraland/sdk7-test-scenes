import { Material, MeshCollider, MeshRenderer, TextAlignMode, TextShape, Transform, engine, timers } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { FLOOD_DURATION_MS, FLOOD_PER_FRAME } from '../shared/config'
import { room } from '../shared/messages'
import { RunnerState } from '../shared/schemas'
import { isServerAlive, pollHeartbeat, showToast } from './state'

// Requests queued locally until the room is synced, then auto-fired.
const pendingRequests: { testIndex: number; param: number }[] = []
let pendingCleanup = false

// --- Comms burst receipt counter (test #7) --------------------------------------
let burstReceived = 0
let burstReportScheduled = false

// --- Inbound flood driver (test #8) ---------------------------------------------
let flooding = false
let floodEndsAt = 0
let floodSent = 0

export function setupFloorOnly(): void {
  buildFloor()
}

export function setupClient(): void {
  buildFloor()
  buildSignpost()

  // Server → all: one of the 700-message burst. Count arrivals for the tally.
  room.onMessage('commsBurst', (data) => {
    if (data.testIndex === 7) burstReceived++
  })

  // Server → me: a transient notice. Guard against the deliberately-oversized
  // comms message (test #7) in case it somehow arrives instead of being dropped.
  room.onMessage('notice', (data) => {
    if (data.text.length <= 200) showToast(data.text)
  })

  engine.addSystem(clientSyncSystem)
}

// The player asked to run a test. We never run it locally — only send the intent;
// the server executes it and the result arrives via the synced TestResults.
export function requestTest(testIndex: number, param: number): void {
  if (!isServerAlive()) {
    showToast('Server is not responding — it may be waking up or dead from a destructive test.')
    return
  }
  pendingRequests.push({ testIndex, param })

  // Test #8 is client-driven: this client floods the server while it counts.
  if (testIndex === 8) {
    flooding = true
    floodSent = 0
    floodEndsAt = Date.now() + FLOOD_DURATION_MS
  }
}

export function requestCleanup(): void {
  pendingCleanup = true
}

function clientSyncSystem(): void {
  pollHeartbeat()

  if (!isStateSyncronized()) return

  while (pendingRequests.length > 0) {
    const req = pendingRequests.shift()!
    room.send('runTest', { testIndex: req.testIndex, param: req.param })

    // When test #7 starts, reset our receipt counter and schedule the report a
    // little before the server stops counting.
    if (req.testIndex === 7 && !burstReportScheduled) {
      burstReportScheduled = true
      burstReceived = 0
      timers.setTimeout(() => {
        room.send('reportCommsTally', { testIndex: 7, received: burstReceived })
        burstReportScheduled = false
      }, 3200)
    }
  }

  if (pendingCleanup) {
    pendingCleanup = false
    room.send('cleanup', {})
  }

  // Drive the inbound flood: emit a batch every frame until the window closes,
  // then report how many we sent so the server can compare against arrivals.
  if (flooding) {
    if (Date.now() >= floodEndsAt) {
      flooding = false
      room.send('reportFloodSent', { testIndex: 8, sent: floodSent })
    } else {
      for (let i = 0; i < FLOOD_PER_FRAME; i++) room.send('floodPing', { seq: floodSent++ })
    }
  }
}

// The ground platform covering the single parcel (16 × 16 m).
function buildFloor(): void {
  const ground = engine.addEntity()
  Transform.create(ground, { position: Vector3.create(8, 0, 8), scale: Vector3.create(16, 0.1, 16) })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: Color4.fromHexString('#1a1030ff') })
}

// The in-world title sign.
function buildSignpost(): void {
  const sign = engine.addEntity()
  Transform.create(sign, { position: Vector3.create(8, 3.6, 8), rotation: Quaternion.fromEulerDegrees(0, 180, 0) })
  TextShape.create(sign, {
    text: 'SERVER LIMITS LAB\n\nUse the panel to push the server’s limits.\nSome tests in the DANGER ZONE KILL the server.',
    fontSize: 3,
    textColor: Color4.White(),
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER
  })
}
