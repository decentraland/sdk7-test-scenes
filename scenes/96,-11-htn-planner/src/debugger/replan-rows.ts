// Why a run was planned and whether it still fits, for the Plan tab and the History rows: the replan event that made
// the shown run (its trigger, how long it waited, the facts that changed since the replan before, whether the plan
// changed) and the drift of the run's chosen path against the host's world now (htn/plan-drift.ts). Plain text; the
// views colour it. Pure, no SDK.
import { planDrift } from '../htn-planner'
import type { AgentLogEntry, DomainIR, FactSource, PlanDrift, PlanRun, ReplanEvent } from '../htn-planner'
import { readableReason, replanOutcome, runAt, withTrigger } from './history-rows'

/** The replan entry whose run is `run` (the newest one, when a collapsed run of retries made several). */
export function replanFor(entries: readonly AgentLogEntry[], runs: readonly PlanRun[], run: PlanRun | null | undefined): ReplanEvent | undefined {
  if (!run || run.deferred) return undefined
  for (let i = entries.length - 1; i >= 0; i--) {
    const { event, t, until } = entries[i]
    if (event.type !== 'replan') continue
    if (runAt(runs, until ?? t)?.seq === run.seq) return event
  }
  return undefined
}

/**
 * The "why this plan" line (the trigger said once, withTrigger): `<trigger>: <reason> · waited 0.3 s (2 frames) · changed: + (fact ...) … · new plan`.
 * Up to `maxChanges` fact changes in full; with none, the volatile facts that moved (`only now changed`).
 */
export function replanText(e: ReplanEvent, maxChanges = 3): string {
  const parts = [`${withTrigger(e.trigger, readableReason(e.reason))}${e.also?.length ? ` (also ${e.also.join(', ')})` : ''}`]
  if (e.waited !== undefined || e.budgetFrames !== undefined) {
    const frames = e.budgetFrames ? ` (budget: ${e.budgetFrames} frame${e.budgetFrames === 1 ? '' : 's'})` : ''
    parts.push(`waited ${(e.waited ?? 0).toFixed(2)} s${frames}`)
  }
  if (e.changes !== undefined) {
    const shown = e.changes.slice(0, maxChanges).join(', ')
    const nothing = e.volatile?.length ? `only ${e.volatile.join(', ')} changed` : 'no fact the domain reads changed'
    parts.push(e.changes.length === 0 ? nothing : `changed: ${shown}${e.changes.length > maxChanges ? ` … +${e.changes.length - maxChanges}` : ''}`)
  }
  parts.push(replanOutcome(e))
  return parts.join(' · ')
}

/** The drift of a run against the world now; nothing for a run that is not a succeeded top-level plan. */
export function runDrift(domain: DomainIR, run: PlanRun | null | undefined, world: FactSource): PlanDrift | undefined {
  if (!run || run.status !== 'succeeded') return undefined
  return planDrift(domain, run, world)
}

/** `all 5 facts it rests on still hold` / `2 of 5 no longer hold: gone: no (door_open store) now; … · …`. */
export function driftText(d: PlanDrift, max = 2): string {
  if (d.checked === 0) return 'it rests on no fact (nothing to re-check)'
  if (d.items.length === 0) return `all ${d.checked} facts it rests on still hold`
  const shown = d.items.slice(0, max).map(i => `${i.branch} ${i.text}`)
  return `${d.items.length} of ${d.checked} no longer hold: ${shown.join(' · ')}${d.items.length > max ? ` … +${d.items.length - max}` : ''}`
}
