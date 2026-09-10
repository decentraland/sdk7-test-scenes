import { Entity } from '@dcl/sdk/ecs'
import { fmtWorld } from './constants'
import { Vector3 } from '@dcl/sdk/math'

/** Prefixed console.log so `get_scene_logs` reads as a full per-station transcript. */
export function slog(station: string, message: string) {
  console.log(`[${station}] ${message}`)
}

/** Logs an INIT line mapping a human purpose to its (reload-unstable) CRDT entity id. */
export function logEntity(purpose: string, entity: Entity) {
  console.log(`[INIT] ${purpose} => entityId ${entity}`)
}

/** Logs an INIT line for a "stand here" floor mark, in both local and world coordinates. */
export function logMark(label: string, local: Vector3) {
  console.log(
    `[INIT] MARK ${label} => local (${local.x}, ${local.y}, ${local.z}) world ${fmtWorld(local)}`
  )
}

// -------------------------------------------------------------------------------------------
// Central, resettable counters. Every station reads/writes its own slice; the reset registry
// below lets a single "reset" action zero every station back to its initial state without a
// scene reload.
// -------------------------------------------------------------------------------------------
export const counters = {
  // S1
  s1BurstDistance: 0,
  s1LastKind: 'idle',
  // S2
  s2PlatformArrivals: 0,
  // S3
  s3ZoneAEnters: 0,
  s3ZoneBEnters: 0,
  s3CurrentModifier: 'none',
  // S4
  s4DownUpClicks: 0,
  s4ChargeCommits: 0,
  s4LastChargeMs: 0,
  s4ShortHits: 0,
  s4LongHits: 0,
  s4OccludedBlocked: 0,
  s4OccludedCleared: 0,
  s4OffsetHits: 0,
  s4BigHits: 0,
  s4SecondaryHits: 0,
  // S5
  s5AEnters: 0,
  s5ALeaves: 0,
  s5BEnters: 0,
  s5BLeaves: 0,
  s5CEnters: 0,
  s5CLeaves: 0,
  // S6 -- one counter per global InputAction, plus the entity-bound suppression counter
  globalPointer: 0,
  globalPrimary: 0,
  globalSecondary: 0,
  globalAction3: 0,
  globalAction4: 0,
  globalAction5: 0,
  globalAction6: 0,
  globalJump: 0,
  globalForward: 0,
  globalBackward: 0,
  globalLeft: 0,
  globalRight: 0,
  globalWalk: 0,
  entityPrimary: 0,
  // S7
  s7MarkerLeftHits: 0,
  s7MarkerRightHits: 0,
  s7MarkerUpHits: 0,
  s7MarkerDownHits: 0,
  // S8
  s8Button1: 0,
  s8Button2: 0,
  s8Button3: 0,
  s8InputSubmits: 0,
  s8InputChanges: 0,
  s8DropdownIndex: -1,
  s8ScrollY: 0,
  s8Drags: 0,
  s8ModalOpen: false,
  s8PanelOpen: false,
  // S9 -- UI text entry
  s9PanelOpen: false,
  s9ChangesFree: 0,
  s9SubmitsFree: 0,
  s9ChangesSeeded: 0,
  s9SubmitsSubmitOnly: 0,
  s9DisabledChanges: 0, // must stay 0 -- a disabled <Input /> has to reject ui_set_text
  s9FormSubmits: 0,
  s9FormAccepted: 0,
  // S10 -- Paint surface
  s10Stamps: 0,
  s10StrokeDots: 0,
  s10Strokes: 0,
  s10OffCanvasSamples: 0,
  // Ray samples skipped because PrimaryPointerInfo.worldRayDirection was not populated -- i.e.
  // the held press never parked a pointer. Distinguishes "the ray missed" from "no ray at all",
  // which used to be invisible: the sampler returned silently and no counter moved.
  s10NoDirectionSamples: 0,
  s10LongestStrokeDots: 0,
  s10PoolRecycles: 0,
  s10Clears: 0
}

type ResetFn = () => void
const resetHandlers: ResetFn[] = []

/** Stations register a callback here to restore their own visuals/state on a global reset. */
export function onReset(fn: ResetFn) {
  resetHandlers.push(fn)
}

let resetCount = 0

export function resetAllStations() {
  resetCount++
  slog('RESET', `reset #${resetCount} requested -- restoring all stations to initial state`)
  for (const key of Object.keys(counters) as (keyof typeof counters)[]) {
    const v = counters[key]
    ;(counters as any)[key] = typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : 'none'
  }
  counters.s3CurrentModifier = 'none'
  counters.s1LastKind = 'idle'
  counters.s8DropdownIndex = -1
  for (const fn of resetHandlers) fn()
  slog('RESET', `reset #${resetCount} complete -- all counters zeroed, all InputModifiers cleared`)
}
