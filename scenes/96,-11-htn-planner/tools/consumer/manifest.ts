// Game-owned test inputs. Paths resolve relative to the manifest, never to a demo catalogue.
import type { Atom } from '../../src/htn-planner/htn/atom'
import type { BacktrackingMode, CallTerm, DecompositionStatus, PlannerOptions } from '../../src/htn-planner/htn/planner'
import type { WorldState } from '../../src/htn-planner/htn/world-state'
import type { Rng } from '../../src/htn-planner/npc/rng'
import type { Stage } from '../../src/htn-testing/paper'

export interface ConsumerScenario {
  name: string
  world?: string
  method: string
  args?: readonly Atom[]
  mode?: BacktrackingMode
  /** Write from the intended strategy before running. An empty plan must be explicit. */
  expect: { status: DecompositionStatus | 'invalid_world'; plan: readonly string[] }
}
export interface ConsumerBindings {
  callterms: Readonly<Record<string, CallTerm>>
  context?: unknown
  daemons?: PlannerOptions['daemons']
}
export interface ConsumerStory {
  name: string
  expect: readonly string[]
  play(stage: Stage, host: {
    seed: number
    rng: Rng
    bindings(world: WorldState, seed?: number): ConsumerBindings
  }): void
}
export interface ConsumerManifest {
  domain: string
  /** Auto-discovers <domain>.invariants.domain. false explicitly disables checks. */
  invariants?: string | false
  /** Omitted means no callterms (including list helpers); select the set explicitly here. */
  callterms?(input: { world: WorldState; rng: Rng; seed: number }): ConsumerBindings
  scenarios: readonly ConsumerScenario[]
  stories?: readonly ConsumerStory[]
}
