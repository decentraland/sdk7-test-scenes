import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { HEARTBEAT_FRESHNESS_MS } from '../shared/config'
import { ServerHeartbeat } from '../shared/schemas'

// Client-side, UI-facing state. Kept in its own module to avoid a circular import
// between setup.ts / gems.ts (write it) and ui.tsx (reads it).

// --- My authoritative round score (set by the server's gemCollected message) ----
let myRoundTotal = 0
export function getMyRoundTotal(): number {
  return myRoundTotal
}
export function setMyRoundTotal(value: number): void {
  myRoundTotal = value
}

// --- My persisted lifetime stats (server's myStats reply; null until received) --
export type LifetimeStats = { gamesPlayed: number; gemsCollected: number; wins: number; bestRound: number }
let lifetimeStats: LifetimeStats | null = null
export function getLifetimeStats(): LifetimeStats | null {
  return lifetimeStats
}
export function setLifetimeStats(stats: LifetimeStats): void {
  lifetimeStats = stats
}

// --- Transient toast message (e.g. "get closer to the gem") ---------------------
// 'alert' toasts (e.g. a server anti-cheat rejection) render distinctly and linger
// a little longer than the benign 'info' ones.
export type ToastKind = 'info' | 'alert'
let toastText = ''
let toastKind: ToastKind = 'info'
let toastUntil = 0
export function showToast(message: string, kind: ToastKind = 'info'): void {
  toastText = message
  toastKind = kind
  toastUntil = Date.now() + (kind === 'alert' ? 4500 : 3000)
}
export function getToast(): { text: string; kind: ToastKind } {
  return Date.now() < toastUntil ? { text: toastText, kind: toastKind } : { text: '', kind: 'info' }
}

// --- Server liveness ------------------------------------------------------------
// isStateSyncronized() only proves the CRDT room is connected — that room can be
// replaying a stale snapshot from a previous server run while the server is still
// cold-booting (~15 s in production) or hasn't started at all. So we track the
// CLIENT-side time at which the heartbeat value last *changed*, not the value
// itself: a stale snapshot never advances, so it can't read as "alive", and
// server/client clock skew is irrelevant.
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
