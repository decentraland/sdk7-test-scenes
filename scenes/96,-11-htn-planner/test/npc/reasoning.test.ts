// GuardAgentOptions.reasoning: belief upkeep as a planning unit of its own (upstream docs/USE_CASES.md pattern 1),
// planned before every planning of the top-level method; its steps (bookkeeping primitives) run at once, so the
// decision list never spends a plan on them.
import { test } from 'node:test'
import { stalkerDomain } from '../../src/examples/stalker/stalker.htn'
import { stalkerActions, stalkerFacts } from '../../src/examples/stalker/stalker-actions'
import assert from 'node:assert/strict'
import { float, sym, vec3 } from '../../src/htn-planner/htn/atom'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import type { DomainIR } from '../../src/htn-planner/htn/ir'
import type { GuardEvent, ReplanEvent } from '../../src/htn-planner/npc/actions'
import { GuardAgent, GuardAgentOptions } from '../../src/htn-planner/npc/agent'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import { parseDomain } from '../htn/planner/domain-text'

const DOMAIN = parseDomain(`
(:domain Upkeep top_level_domain
  (:method (reasoning) top_level_method
    (forget_stale_noise
      (and (now ?time) (heard_noise ?any_kind ?any_position ?heard_at ?any_loudness) (> (- ?time ?heard_at) 5.0))
      ((!forget_noise ?heard_at)))
    (forget_unwanted (and (last_seen ?target ?any_position ?any_time) (unwanted ?target)) ((!forget ?target))))
  (:method (behave) top_level_method
    (listen (and (heard_noise ?any_kind ?position ?any_time ?any_loudness)) ((!turn_to ?position) (!wait 100.0)))
    (search (and (last_seen ?target ?position ?any_time)) ((!move_to ?position walk) (!wait 100.0)))
    (walk (and (current_waypoint ?index) (waypoint ?index ?position)) ((!move_to ?position walk) (!wait 100.0)))
    (idle () ((!wait 100.0)))))`)

function makeAgent(domain: DomainIR, extra: Partial<GuardAgentOptions> = {}) {
  const events: GuardEvent[] = []
  const agent = new GuardAgent({
    id: 'g',
    planner: world => new PlanRunner(domain, world),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    route: [v3(0, 0, 30)],
    perception: { detectTime: 0, nearDetectTime: 0, loseGrace: 0 },
    reasoning: 'reasoning',
    onEvent: e => events.push(e),
    ...extra
  })
  const replans = () => events.filter((e): e is ReplanEvent => e.type === 'replan')
  const diagnostics = () => events.filter(e => e.type === 'diagnostic').map(e => (e.type === 'diagnostic' ? e.code : ''))
  const steps = () => events.filter(e => e.type === 'step').map(e => (e.type === 'step' ? e.name : ''))
  return { agent, events, replans, diagnostics, steps }
}

const hear = (agent: GuardAgent, at: number) => agent.blackboard.hear({ kind: 'test', position: v3(5, 0, 0), time: at, loudness: 0.5 })

test('reasoning: its steps run before the decision is planned, which then sees the updated beliefs', () => {
  const { agent, replans, steps } = makeAgent(DOMAIN)
  agent.time = 10
  hear(agent, 1) // 9 s old: stale
  agent.tick(0.1, [])
  const first = replans()[0]
  assert.deepEqual(first.upkeep, ['!forget_noise 1.0'])
  assert.deepEqual(first.plan, ['!move_to (0.0 0.0 30.0) walk', '!wait 100.0'], 'the stale noise is gone before behave plans: no listen')
  assert.equal(agent.blackboard.heardNoise, null)
  assert.deepEqual(steps(), ['!move_to'], 'upkeep steps are not plan steps')
  assert.equal(agent.metrics.reasoningMade, 2, 'one pass that applied the rule, one that found nothing left')
  assert.equal(agent.metrics.plansMade, 1, 'reasoning calls are counted apart')
})

test('reasoning: nothing to update is one planner call and no upkeep on the replan', () => {
  const { agent, replans } = makeAgent(DOMAIN)
  agent.tick(0.1, [])
  assert.equal(replans()[0].upkeep, undefined)
  assert.equal(agent.metrics.reasoningMade, 1)
})

test('reasoning: rules are applied until none holds (a fixpoint), several in one replan', () => {
  const { agent, replans } = makeAgent(DOMAIN)
  agent.time = 10
  hear(agent, 1)
  agent.blackboard.remember({ id: 'cat', position: v3(1, 0, 1), time: 9 })
  agent.blackboard.world.add('unwanted', sym('cat'))
  agent.tick(0.1, [])
  assert.deepEqual(replans()[0].upkeep, ['!forget_noise 1.0', '!forget cat'])
  assert.equal(agent.blackboard.memories.size, 0)
  assert.equal(agent.metrics.reasoningMade, 3)
  assert.equal(replans()[0].plan[0], '!move_to (0.0 0.0 30.0) walk')
})

test('reasoning: a trigger replan whose only news the upkeep drops keeps the running plan (no bookkeeping plan cuts it)', () => {
  const ignoring = parseDomain(`
(:domain Ignore top_level_domain
  (:method (reasoning) top_level_method
    (ignore_birds (and (heard_noise bird ?any_position ?heard_at ?any_loudness)) ((!forget_noise ?heard_at))))
  (:method (behave) top_level_method
    (listen (and (heard_noise ?any_kind ?position ?any_time ?any_loudness)) ((!turn_to ?position) (!wait 100.0)))
    (walk (and (current_waypoint ?index) (waypoint ?index ?position)) ((!move_to ?position walk) (!wait 100.0)))))`)
  const { agent, replans, events } = makeAgent(ignoring)
  agent.tick(0.1, [])
  assert.equal(agent.currentAction, '!move_to')
  agent.tick(0.1, [], [{ seq: 1, kind: 'bird', position: v3(2, 0, 0), loudness: 30, source: 'tree', time: 0 }])
  const last = replans()[replans().length - 1]
  assert.equal(last.trigger, 'hearing')
  assert.deepEqual(last.upkeep, ['!forget_noise 0.2'])
  assert.equal(last.kept, true, 'the walk goes on')
  assert.equal(agent.currentAction, '!move_to')
  assert.ok(!events.some(e => e.type === 'step_end' && e.status === 'cancelled'))
})

test('reasoning off (the default): no reasoning runner, no upkeep, the metric stays 0', () => {
  const { agent, replans } = makeAgent(DOMAIN, { reasoning: undefined })
  agent.time = 10
  hear(agent, 1)
  agent.tick(0.1, [])
  assert.equal(replans()[0].upkeep, undefined)
  assert.equal(replans()[0].plan[0], '!turn_to (5.0 0.0 0.0)', 'the stale noise is still there')
  assert.equal(agent.metrics.reasoningMade, 0)
})

test('reasoning: a method the domain lacks is reported once and planning goes on without it', () => {
  const { agent, diagnostics, replans } = makeAgent(DOMAIN, { reasoning: 'beliefs' })
  agent.tick(0.1, [])
  agent.requestReplan('poke', true)
  agent.tick(0.1, [])
  assert.deepEqual(diagnostics(), ['reasoning_invalid'])
  assert.equal(replans().length, 2)
  assert.equal(agent.metrics.reasoningMade, 0)
})

test('reasoning: a step that does not finish at once is cancelled and reported; a rule that never settles is capped', () => {
  const bad = parseDomain(`
(:domain Bad top_level_domain
  (:method (reasoning) top_level_method
    (slow (and (slow_rule yes)) ((!wait 5.0)))
    (endless (and (endless_rule yes)) ((!set_waypoint 0))))
  (:method (behave) top_level_method (idle () ((!wait 100.0)))))`)
  const slow = makeAgent(bad)
  slow.agent.blackboard.world.add('slow_rule', sym('yes'))
  slow.agent.tick(0.1, [])
  assert.ok(slow.diagnostics().includes('reasoning_not_instant'))
  assert.equal(slow.agent.currentAction, '!wait')
  const endless = makeAgent(bad, { reasoningPasses: 3 })
  endless.agent.blackboard.world.add('endless_rule', sym('yes'))
  endless.agent.tick(0.1, [])
  endless.agent.requestReplan('poke', true)
  endless.agent.tick(0.1, [])
  assert.deepEqual(endless.diagnostics(), ['reasoning_unsettled'], 'said once')
  assert.equal(endless.agent.metrics.reasoningMade, 6, 'three passes per replan, no more')
  assert.deepEqual(endless.replans()[0].upkeep, ['!set_waypoint 0', '!set_waypoint 0', '!set_waypoint 0'])
})

test('reasoning: world facts it reads are plain facts, e.g. a time it compares with now', () => {
  const { agent } = makeAgent(DOMAIN)
  agent.blackboard.world.set('heard_noise', sym('test'), vec3(1, 0, 1), float(0), float(0.2))
  agent.time = 3
  agent.tick(0.1, [])
  assert.equal(agent.currentAction, '!turn_to', 'a fresh noise is kept')
})

test('reasoning: four convergent mutations exhaust the default budget without proving non-progress', () => {
  for (const passes of [undefined, 5]) {
    const { agent, events } = makeAgent(DOMAIN, passes === undefined ? {} : { reasoningPasses: passes })
    agent.time = 10
    hear(agent, 1)
    for (const id of ['cat', 'dog', 'bird']) {
      agent.blackboard.remember({ id, position: v3(1, 0, 1), time: 9 })
      agent.blackboard.world.add('unwanted', sym(id))
    }
    agent.tick(0.1, [])
    assert.equal(agent.blackboard.heardNoise, null)
    assert.equal(agent.blackboard.memories.size, 0)
    assert.equal(agent.metrics.reasoningMade, passes ?? 4)
    const warnings = events.filter(e => e.type === 'diagnostic' && e.code === 'reasoning_unsettled')
    assert.equal(warnings.length, passes === undefined ? 1 : 0)
    if (warnings.length) {
      const warning = warnings[0]
      assert.equal(warning.type, 'diagnostic')
      if (warning.type === 'diagnostic') {
        assert.match(warning.message, /budget.*confirming settlement/)
        assert.doesNotMatch(warning.message, /does not make its own condition false/)
      }
    }
  }
})

test('reasoning: live Stalker clears the audit snapshot at its production four-pass budget', () => {
  const actions = stalkerActions(
    { play: () => {}, clipFinished: () => false, targetPosition: () => undefined },
    {
      turnSign: 1, bodyYawDeg: () => 0, headTurnSeconds: 1, bodyTurnSeconds: 1,
      minClipSeconds: 0, leaveDistance: 10, faceTurnRate: 1,
      gaitClips: {
        walk: { clip: 'PatrolWalk', speed: 1 },
        hurry: { clip: 'PatrolWalk', speed: 1 },
        run: { clip: 'AggroRun', speed: 1 }
      }
    }
  )
  const { agent, diagnostics, replans } = makeAgent(stalkerDomain, { actions, route: [] })
  // Constructed audit snapshot; this does not establish reachability in a rendered level.
  agent.time = 40
  for (const id of ['a', 'b'])
    agent.blackboard.remember({ id, position: v3(1, 0, 1), time: 39 })
  hear(agent, 0)
  stalkerFacts.setFocus(agent.blackboard.world, 0)
  agent.tick(0.1, [])
  assert.equal(agent.metrics.reasoningMade, 4)
  assert.equal(agent.blackboard.memories.size, 0)
  assert.equal(agent.blackboard.heardNoise, null)
  assert.equal(stalkerFacts.focused(agent.blackboard.world), false)
  assert.deepEqual(replans()[0].upkeep, ['!forget a', '!forget b', '!forget_noise 0.0', '!unfocus'])
  assert.deepEqual(diagnostics(), ['reasoning_unsettled'], 'settlement is not confirmed within four passes')
  assert.deepEqual(replans()[0].plan, ['!stand 1.0'])
})
