// The public metrics describe decision/replan decompositions, not all work done by their runners.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PlanRunner, newPlanStats } from '../../src/htn-planner/htn/planner'
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { compileDomainSource } from '../../tools/htn/compiler'

test('lastStats/totalStats count decisions only; upkeep, checks and deferred expansion have separate accounting', () => {
  const compiled = compileDomainSource('Metrics.domain', `
(:domain Metrics top_level_domain
  (:method (behave) top_level_method (start () ((!wait 0.2) (&resume))))
  (:method (resume) top_level_method (ready (and (ready)) ((hold))))
  (:method (hold) (stay () ((!wait 100.0))))
  (:method (reasoning) top_level_method (settled () ()))
  (:method (check) top_level_method (valid (and (running wait ?any_seconds)) ())))`)
  assert.ok(compiled.ok, compiled.diagnostics.map(d => d.message).join('\n'))
  let clock = 0
  const agent = new GuardAgent({
    id: 'metrics', start: { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, route: [],
    planner: world => new PlanRunner(compiled.ir, world, { stats: newPlanStats() }),
    lineOfSight: CLEAR_LINE_OF_SIGHT, reasoning: 'reasoning', activePlan: 'check', clock: () => clock++
  })
  agent.blackboard.world.add('ready')
  agent.tick(0.05, [])
  const firstLast = agent.metrics.lastStats!
  const firstTotal = agent.metrics.totalStats!
  const snapshot = { ...firstLast }
  assert.equal(agent.metrics.plansMade, 1)
  assert.equal(agent.metrics.reasoningMade, 1)
  assert.equal(agent.metrics.totalReasoningMs, 1)
  assert.equal(firstTotal.methods, 1, 'the reasoning method did not inflate the decision total')
  for (let i = 0; i < 6; i++) agent.tick(0.05, [])
  assert.equal(agent.currentAction, '!wait')
  assert.equal(agent.runner.stats!.methods, 2, 'the deferred resume and hold methods actually decomposed')
  assert.ok(agent.metrics.checksMade > 0, 'the real running-plan check executed')
  assert.equal(agent.metrics.totalCheckMs, agent.metrics.checksMade)
  assert.equal(agent.metrics.plansMade, 1, 'deferred expansion is not a decision/replan')
  assert.equal(agent.metrics.totalPlanMs, 1)
  assert.equal(agent.metrics.lastStats, firstLast)
  assert.equal(agent.metrics.totalStats, firstTotal)
  assert.deepEqual(firstLast, snapshot, 'deferred expansion and checks cannot mutate the saved decision stats')

  agent.requestReplan('test decision', true)
  agent.tick(0.05, [])
  assert.equal(agent.metrics.plansMade, 2)
  assert.equal(agent.metrics.reasoningMade, 2)
  assert.equal(agent.metrics.totalReasoningMs, 2)
  assert.equal(agent.metrics.totalPlanMs, 2)
  assert.equal(agent.metrics.totalStats!.methods, 2, 'exactly two decision decompositions; no double counting')
  assert.equal(agent.metrics.lastStats!.methods, 1)
  assert.deepEqual(firstLast, snapshot)
  assert.deepEqual(firstTotal, snapshot, 'old total snapshots also remain unchanged')
  agent.stop()
})
