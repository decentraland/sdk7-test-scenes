import { Entity, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

// ---------------------------------------------------------------------------
// The plumbing the suite runs on. Everything here is deliberately side-agnostic:
// the identical code has to behave the same inside the client renderer and inside
// the headless server, because the whole scene rests on comparing those two runs.
//
// That is why every wait is driven by an engine SYSTEM rather than by
// timers.setTimeout: a system tick is the one clock both hosts definitely share,
// and "wait for the host to write component X" only ever means "wait for more
// ticks". Wall-clock (Date.now) is used solely for deadlines.
// ---------------------------------------------------------------------------

type Waiter = {
  resolve: (satisfied: boolean) => void
  ready: () => boolean
  deadline: number
}

const waiters: Waiter[] = []

// Added exactly once per side (see setupClient / startServer). Resolves each
// waiter the first tick its predicate holds, or hands back `false` at its
// deadline — a timeout is a normal, expected outcome here, never an exception.
export function harnessSystem(): void {
  if (waiters.length === 0) return
  const now = Date.now()
  for (let i = waiters.length - 1; i >= 0; i--) {
    const waiter = waiters[i]
    if (waiter.ready()) {
      waiters.splice(i, 1)
      waiter.resolve(true)
    } else if (now >= waiter.deadline) {
      waiters.splice(i, 1)
      waiter.resolve(false)
    }
  }
}

// Resolves on the next tick of harnessSystem.
export function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    waiters.push({ resolve: () => resolve(), ready: () => true, deadline: Number.MAX_SAFE_INTEGER })
  })
}

// Resolves true if `ready` became true in time, false if it timed out.
export function waitUntil(ready: () => boolean, timeoutMs: number): Promise<boolean> {
  // Check immediately: the host may already have written what we're waiting for.
  if (ready()) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    waiters.push({ resolve, ready, deadline: Date.now() + timeoutMs })
  })
}

// Tick-driven sleep. `ready` never holds, so it always ends on its deadline.
export function waitMs(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    waiters.push({ resolve: () => resolve(), ready: () => false, deadline: Date.now() + ms })
  })
}

// Calls `sample(elapsedMs)` once per tick for `durationMs`, starting immediately.
// The suite's motion assertions are all built on this — one pass over the tween's
// lifetime, gathering evidence, instead of a lucky read at a single instant.
export async function sampleFor(durationMs: number, sample: (elapsedMs: number) => void): Promise<void> {
  const startedAt = Date.now()
  for (;;) {
    const elapsed = Date.now() - startedAt
    sample(elapsed)
    if (elapsed >= durationMs) return
    await nextFrame()
  }
}

// --- Entity scopes ----------------------------------------------------------------
// Every test builds its rig through a scope and disposes it in a `finally`, so a
// failing or timing-out test cannot leave colliders behind for the next one to
// trip over — this matters most on the client, where the suite shares the engine
// with the live rig and the UI.
export interface EntityScope {
  add(): Entity
  dispose(): void
}

export function entityScope(): EntityScope {
  const owned: Entity[] = []
  return {
    add() {
      const entity = engine.addEntity()
      owned.push(entity)
      return entity
    },
    dispose() {
      for (const entity of owned) engine.removeEntity(entity)
      owned.length = 0
    }
  }
}

// --- Assertion helpers -------------------------------------------------------------
// The protocol types hand back `Vector3 | undefined` on result components, so
// every reader below tolerates a missing value rather than throwing: on a host
// with no raycast system there is nothing to read, and that has to surface as a
// readable failure detail, not a crash inside the runner.

export function v3(value: { x: number; y: number; z: number } | undefined): Vector3 {
  return value ? Vector3.create(value.x, value.y, value.z) : Vector3.Zero()
}

export function fmtV3(value: { x: number; y: number; z: number } | undefined): string {
  if (!value) return '(none)'
  return `(${value.x.toFixed(2)}, ${value.y.toFixed(2)}, ${value.z.toFixed(2)})`
}

export function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Vector3.distance(v3(a), v3(b))
}

// Quaternions are double-covered — q and -q are the same rotation — so rotation
// equality is |dot| ≈ 1 rather than a component-wise comparison.
export function quaternionError(a: Quaternion, b: Quaternion): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
  return 1 - Math.abs(dot)
}

// Progress of `current` along the start→end segment, projected onto it and
// normalized to 0..1. Used by the move assertions so they read the same whether
// the travel runs along X, Y or Z.
export function progressAlong(start: Vector3, end: Vector3, current: Vector3): number {
  const segment = Vector3.subtract(end, start)
  const lengthSq = Vector3.lengthSquared(segment)
  if (lengthSq === 0) return 0
  return Vector3.dot(Vector3.subtract(current, start), segment) / lengthSq
}

// Normalize any thrown value to a readable string for a result detail.
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

// Runs `poll` as a real engine system at regular priority for `durationMs`, then
// removes it again. Needed for ONE-SHOT signals such as tweenSystem.tweenCompleted():
// the SDK's own tween bookkeeping system sits at priority -Infinity, i.e. it runs
// LAST in the frame and consumes the flag, and a poll from a promise continuation
// lands after the whole (synchronous) system loop — so it would always miss. A
// regular-priority system sees the flag first, exactly as scene code normally would.
export async function pollInSystem(durationMs: number, poll: () => void): Promise<void> {
  const system = () => poll()
  engine.addSystem(system)
  try {
    await waitMs(durationMs)
  } finally {
    engine.removeSystem(system)
  }
}
