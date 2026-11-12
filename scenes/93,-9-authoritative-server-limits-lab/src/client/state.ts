import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { HEARTBEAT_FRESHNESS_MS } from '../shared/config'
import { ServerHeartbeat } from '../shared/schemas'

// Client-side, UI-facing state. Kept in its own module to avoid a circular import
// between setup.ts (writes it) and ui.tsx (reads it).

// --- Transient toast message ----------------------------------------------------
let toastText = ''
let toastUntil = 0
export function showToast(message: string): void {
  toastText = message
  toastUntil = Date.now() + 3000
}
export function getToast(): string {
  return Date.now() < toastUntil ? toastText : ''
}

// --- Server liveness ------------------------------------------------------------
// isStateSyncronized() only proves the CRDT room is connected — that room can be
// replaying a stale snapshot from a previous server run while the server is
// cold-booting, dead from a destructive test, or not started at all. So we track
// the CLIENT-side time at which the heartbeat value last *changed*, not the value
// itself: a stale snapshot never advances, so it can't read as "alive", and
// server/client clock skew is irrelevant. When a destructive test kills the
// server, the pulse stops and this flips to false within HEARTBEAT_FRESHNESS_MS —
// that transition is the pass signal for the DANGER ZONE tests.
let lastBeatValue = 0
let lastBeatSeenAt = 0

export function pollHeartbeat(): void {
  for (const [, hb] of engine.getEntitiesWith(ServerHeartbeat)) {
    if (hb.beatAt !== lastBeatValue) {
      lastBeatValue = hb.beatAt
      lastBeatSeenAt = Date.now()
    }
    break
  }
}

export function isServerAlive(): boolean {
  if (!isStateSyncronized()) return false
  if (lastBeatSeenAt === 0) return false // never observed a tick yet
  return Date.now() - lastBeatSeenAt < HEARTBEAT_FRESHNESS_MS
}

// --- Destructive-test two-click arming ------------------------------------------
// A destructive test needs two clicks: the first arms the row (a red warning),
// the second — within ARM_WINDOW_MS — actually fires it. Prevents a stray click
// from killing the server for everyone.
const ARM_WINDOW_MS = 4000
let armedIndex = -1
let armedUntil = 0

export function armDestructive(testIndex: number): void {
  armedIndex = testIndex
  armedUntil = Date.now() + ARM_WINDOW_MS
}
export function isArmed(testIndex: number): boolean {
  return armedIndex === testIndex && Date.now() < armedUntil
}
export function disarm(): void {
  armedIndex = -1
  armedUntil = 0
}
