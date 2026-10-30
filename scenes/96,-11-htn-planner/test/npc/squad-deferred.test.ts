// Squad orders commit only after the whole candidate resolves; failures preserve the previous decision.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAtom, sym } from '../../src/htn-planner/htn/atom'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { GuardSquad, createCapsuleBody, plannerFor, type SquadDecision } from '../../src/htn-planner/npc/guard-scene'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { compileDomainSource } from '../../tools/htn/compiler'

function compile(source: string) {
  const r = compileDomainSource('Audit.domain', source)
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
  return r.ir
}
const MEMBER = compile(`(:domain Member top_level_domain
  (:method (behave) top_level_method (wait () ((!wait 100.0)))))`)
const COMMAND = compile(`(:domain Audit top_level_domain
  (:method (decide) top_level_method
    (initial (and (phase initial)) ((!order g1 hold) (!order g2 hold)))
    (replacement (and (phase replacement)) ((!order g1 chase) (&finish)))
    (empty (and (phase empty)) ()))
  (:method (finish) top_level_method
    (ready (and (ready)) ((!order g2 flank)))))`)

function setup() {
  let phase = 'initial'
  let ready = false
  const decisions: SquadDecision[] = []
  const resolutions: string[] = []
  const squad = new GuardSquad({
    planner: plannerFor(MEMBER),
    system: false,
    noise: null,
    targets: () => [],
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    squad: {
      planner: world => {
        const runner = new PlanRunner(COMMAND, world)
        const resolve = runner.resolve.bind(runner)
        runner.resolve = () => {
          const result = resolve()
          resolutions.push(result)
          return result
        }
        return runner
      },
      topLevel: 'decide',
      snapshot: world => {
        world.add('phase', sym(phase))
        if (ready) world.add('ready')
        return `${phase}:${ready}`
      },
      onDecision: decision => decisions.push(decision)
    }
  })
  squad.spawn(['g1', 'g2'].map(id => ({ id, route: [{ x: 0, y: 0, z: 0 }], body: createCapsuleBody })))
  const orders = () => Object.fromEntries([...squad.orders].map(([id, rows]) => [
    id, rows.map(row => row.map(formatAtom).join(' '))
  ]))
  const facts = () => Object.fromEntries(squad.guards.map(h => [
    h.spec.id, h.agent.blackboard.world.rows('order', 1).map(row => row.map(formatAtom).join(' '))
  ]))
  squad.update(0.1)
  assert.deepEqual(orders(), { g1: ['hold'], g2: ['hold'] })
  resolutions.length = 0
  return {
    squad, orders, facts, decisions, resolutions,
    change(next: string, canFinish = false) {
      phase = next
      ready = canFinish
      squad.update(0.1)
    }
  }
}

for (const mode of ['initial-failure', 'deferred-success', 'empty-success', 'deferred-failure-orders', 'deferred-failure-status'] as const) {
  test(`squad deferred: ${mode}`, () => {
    const s = setup()
    try {
      s.change(mode === 'initial-failure' ? 'absent' : mode === 'empty-success' ? 'empty' : 'replacement', mode === 'deferred-success')
      if (mode === 'initial-failure') {
        assert.equal(s.decisions[s.decisions.length - 1].status, 'no_plan')
        assert.deepEqual(s.orders(), { g1: ['hold'], g2: ['hold'] })
      } else if (mode === 'deferred-success') {
        assert.equal(s.decisions[s.decisions.length - 1].status, 'succeeded')
        assert.deepEqual(s.orders(), { g1: ['chase'], g2: ['flank'] })
      } else if (mode === 'empty-success') {
        assert.equal(s.decisions[s.decisions.length - 1].status, 'succeeded')
        assert.deepEqual(s.orders(), {})
      } else if (mode === 'deferred-failure-orders') {
        assert.deepEqual(s.resolutions, ['ready', 'failed'])
        assert.deepEqual(s.orders(), { g1: ['hold'], g2: ['hold'] }, 'failed deferred expansion must preserve the previous whole decision')
        assert.deepEqual(s.facts(), { g1: ['hold'], g2: ['hold'] }, 'members must not receive a partially applied decision')
      } else {
        assert.deepEqual(s.resolutions, ['ready', 'failed'])
        assert.equal(s.decisions[s.decisions.length - 1].status, 'deferred_failed', 'deferred failure must not be reported as successful or guessed to be no_plan')
        assert.deepEqual(s.decisions[s.decisions.length - 1].plan, ['!order g1 chase', '&finish'],
          'diagnostics retain the rejected candidate before deferred expansion')
        assert.deepEqual(s.orders(), { g1: ['hold'], g2: ['hold'] },
          'the diagnostic candidate is separate from committed orders')
      }
    } finally {
      s.squad.despawn()
    }
  })
}
