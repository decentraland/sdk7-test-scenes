// One language-lab scenario, as scripts/htn-lab.ts writes it into generated/lab/cases.ts: a planning call taken
// from the conformance suite (test/htn/conformance/cases) with its world, host values and upstream expectation.
import type { DecompositionStatus } from '../../htn-planner'

export interface LabCase {
  /** Key in LAB_DOMAINS: the fixture file name (`runtime_lists`) or the docs/SDK example name (`Tutorial`). */
  domain: string
  /** The conformance case name. */
  name: string
  /** Upstream source of the expectation (file:line). */
  upstream: string
  method: string
  /** Atom literals (src/examples/upstream/atom-literal.ts). */
  args: string[]
  /** Keys in LAB_WORLDS, loaded in order before `facts`. */
  worlds: string[]
  /** [name, ...atom literals]. */
  facts: string[][]
  /** Set name in conformance-callterms.ts. */
  callterms: string
  /** Host values the callterms read; null = an unbound result. */
  vars: Record<string, string | null>
  mode?: { factsAndAxioms: boolean; branches: boolean }
  maxDepth?: number
  status: DecompositionStatus
  /** The exact plan upstream expects; null where upstream checks only parts of it (length, some steps). */
  plan: string[] | null
}
