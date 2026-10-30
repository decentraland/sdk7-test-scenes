// One decision of a domain with a belief upkeep unit, the way GuardAgent makes it (GuardAgentOptions.reasoning): the
// `reasoning` method planned and its steps applied until it has nothing to do, then `behave` planned on the updated
// beliefs. For the domain tests of stalker.domain and guard.domain (no agent, no ECS).
import assert from 'node:assert/strict'
import { formatTask } from '../../src/htn-planner/htn/atom'
import type { DomainIR } from '../../src/htn-planner/htn/ir'
import { decompose, PlanStep } from '../../src/htn-planner/htn/planner'
import { atomName, atomNumber } from '../../src/htn-planner/npc/actions'
import type { GuardBlackboard } from '../../src/htn-planner/npc/blackboard'
import { stalkerFacts } from '../../src/examples/stalker/stalker-actions'

export const fmt = (plan: readonly PlanStep[]) => plan.map(s => formatTask(s.name, s.args))

/** The primitives the reasoning methods emit: instant belief changes. */
export const UPKEEP = new Set(['!forget', '!forget_noise', '!unfocus'])

/** Runs one upkeep step on the blackboard, as the host's executors do. */
export function applyUpkeep(b: GuardBlackboard, step: PlanStep): void {
  if (step.kind !== 'primitive') return
  if (step.name === '!forget') b.forget(atomName(step.args[0]) ?? '')
  else if (step.name === '!forget_noise') b.forgetNoise(atomNumber(step.args[0]))
  else if (step.name === '!unfocus') stalkerFacts.clearFocus(b.world)
}

export interface Decision {
  /** The upkeep steps applied, in order. */
  upkeep: string[]
  /** behave's plan after them. */
  plan: string[]
}

/** The upkeep to its fixpoint (applied to `b`), then behave. */
export function decide(domain: DomainIR, b: GuardBlackboard, passes = 8): Decision {
  const upkeep: string[] = []
  for (let i = 0; ; i++) {
    const r = decompose(domain, b.world, 'reasoning', [])
    if (r.status !== 'succeeded' || r.plan.length === 0) break
    assert.ok(i < passes, `reasoning never settled: ${upkeep.join(', ')}`)
    for (const s of r.plan) {
      assert.ok(s.kind === 'primitive' && UPKEEP.has(s.name), `an upkeep step is an instant belief change: ${s.name}`)
      applyUpkeep(b, s)
      upkeep.push(formatTask(s.name, s.args))
    }
  }
  const r = decompose(domain, b.world, 'behave', [])
  assert.equal(r.status, 'succeeded')
  return { upkeep, plan: fmt(r.plan) }
}
