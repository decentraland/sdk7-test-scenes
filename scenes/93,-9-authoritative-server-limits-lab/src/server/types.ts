import { Entity } from '@dcl/sdk/ecs'

// The context every test function receives. Kept in its own module so the test
// files and the runner can share it without a circular import.
export interface RunnerCtx {
  // The single server-owned entity carrying all the synced state components.
  stateEntity: Entity
  // Force an immediate heartbeat pulse (used right after writing LastWords, so
  // clients get a fresh beat before a destructive test stalls the loop).
  beatNow: () => void
  // Promise-based sleep backed by the engine's timer system (never native
  // setTimeout — see scene-runtime guidance).
  delay: (ms: number) => Promise<void>
}

export interface TestOutcome {
  // Pass = the limit fired as expected. Fail = the op unexpectedly succeeded, or
  // the wrong error came back.
  pass: boolean
  detail: string
}

export type TestFn = (ctx: RunnerCtx, param: number) => Promise<TestOutcome>

// Normalize any thrown value to a readable string for the result detail.
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}
