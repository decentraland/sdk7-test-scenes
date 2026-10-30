// Shared helpers for planner tests.
import { bool, formatTask, type Atom } from '../../../src/htn-planner/htn/atom'
import type { DomainIR } from '../../../src/htn-planner/htn/ir'
import { decompose, type BacktrackingMode, type PlannerOptions, type PlanStep, type RuntimeDiagnostic } from '../../../src/htn-planner/htn/planner'
import type { WorldState } from '../../../src/htn-planner/htn/world-state'

export const MODES: { name: string; mode: BacktrackingMode }[] = [
  { name: 'NONE', mode: { factsAndAxioms: false, branches: false } },
  { name: 'FACTS_AND_AXIOMS', mode: { factsAndAxioms: true, branches: false } },
  { name: 'BRANCHES', mode: { factsAndAxioms: false, branches: true } },
  { name: 'ALL', mode: { factsAndAxioms: true, branches: true } }
]

export function formatStep(step: PlanStep): string {
  return formatTask(step.name, step.args)
}

export interface Run {
  status: string
  plan: string[]
  diagnostics: RuntimeDiagnostic[]
}

export function run(
  domain: DomainIR,
  world: WorldState,
  method: string,
  args: Atom[] = [],
  options: PlannerOptions = {}
): Run {
  const diagnostics: RuntimeDiagnostic[] = []
  const r = decompose(domain, world, method, args, {
    calltermErrorPolicy: 'report', // diagnostics are recorded, like an upstream test's Report callback
    ...options,
    onDiagnostic: d => {
      diagnostics.push(d)
      options.onDiagnostic?.(d)
    }
  })
  return { status: r.status, plan: r.plan.map(formatStep), diagnostics }
}

/** A boolean callterm that records its first argument (as a number) and returns true. */
export function tracer(trace: number[]) {
  return (args: readonly Atom[]) => {
    trace.push(args[0].v as number)
    return bool(true)
  }
}

/** Run `fn` with console.warn captured: its result and every warning's text (the planner's dev warnings). */
export function warnings<T>(fn: () => T): { result: T; warned: string[] } {
  const warned: string[] = []
  const warn = console.warn
  console.warn = (...a: unknown[]) => void warned.push(a.map(String).join(' '))
  try {
    return { result: fn(), warned }
  } finally {
    console.warn = warn
  }
}
