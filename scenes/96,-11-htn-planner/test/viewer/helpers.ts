// Shared helpers for the session viewer's tests (not a test file itself): a domain written inline, planned once
// against a few facts with a recorder, as `npm run htn:run -- --session` records it.
import { domainGraph } from '../../src/htn-planner/htn/domain-graph'
import type { DomainGraph } from '../../src/htn-planner/htn/domain-graph'
import type { Atom } from '../../src/htn-planner/htn/atom'
import type { DomainIR } from '../../src/htn-planner/htn/ir'
import { decompose } from '../../src/htn-planner/htn/planner'
import type { PlannerOptions } from '../../src/htn-planner/htn/planner'
import { PlanRun, PlanTraceRecorder } from '../../src/htn-planner/htn/trace'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import { compile } from '../htn/compiler/helpers'

export interface Planned {
  domain: DomainIR
  graph: DomainGraph
  run: PlanRun
  recorder: PlanTraceRecorder
  world: WorldState
}

/** Compile `source`, add `facts` ([name, ...args]) and plan `method` once with a recorder. Throws on a compile error. */
export function planned(source: string, facts: readonly (readonly [string, ...Atom[]])[], method: string, options: PlannerOptions = {}): Planned {
  const r = compile(source)
  if (!r.ok) throw new Error(r.diagnostics.map(d => d.message).join('; '))
  const world = new WorldState()
  for (const [name, ...args] of facts) world.add(name, ...args)
  const recorder = new PlanTraceRecorder(r.ir)
  decompose(r.ir, world, method, [], { ...options, trace: recorder })
  return { domain: r.ir, graph: domainGraph(r.ir), run: recorder.lastPlan!, recorder, world }
}
