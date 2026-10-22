// Agent executor/replan logic against a scripted fake planner (no real HTN planner needed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAtom, float, int, sym, vec3 } from '../../src/htn-planner/htn/atom'
import { newPlanStats, PlanRunner, type PlanStep } from '../../src/htn-planner/htn/planner'
import type { WorldState } from '../../src/htn-planner/htn/world-state'
import { parseDomain } from '../htn/planner/domain-text'
import type { ActionExecutor, ActionFactory, GuardEvent } from '../../src/htn-planner/npc/actions'
import { GuardAgent, GuardAgentOptions, PlanRunnerLike } from '../../src/htn-planner/npc/agent'
import { CLEAR_LINE_OF_SIGHT, GeometricLineOfSight, TargetSample } from '../../src/htn-planner/npc/perception'
import { NoiseBus } from '../../src/htn-planner/npc/noise'
import { distanceXZ, v3 } from '../../src/htn-planner/npc/vec'
import { defer, DeferredExpander, prim, Script, scripted } from './fake-planner'

const FRONT: TargetSample[] = [{ id: 'player', position: v3(0, 0, 6) }]
const BEHIND: TargetSample[] = [{ id: 'player', position: v3(0, 0, -30) }]

function makeAgent(script: Script, extra: Partial<GuardAgentOptions> = {}, expand?: DeferredExpander, domain?: PlanRunnerLike['domain']) {
  const s = scripted(script, expand, domain)
  const events: GuardEvent[] = []
  const agent = new GuardAgent({
    id: 'g',
    planner: s.factory,
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    route: [v3(0, 0, 0), v3(0, 0, 4)],
    perception: { detectTime: 0, nearDetectTime: 0, loseGrace: 0 },
    onEvent: e => events.push(e),
    ...extra
  })
  const steps = () => events.filter(e => e.type === 'step').map(e => (e.type === 'step' ? e.name : ''))
  const replans = () => events.filter((e): e is Extract<GuardEvent, { type: 'replan' }> => e.type === 'replan')
  return { agent, events, steps, replans, runner: s.runner }
}

function run(agent: GuardAgent, seconds: number, targets: readonly TargetSample[] = [], dt = 0.1) {
  const n = Math.round(seconds / dt)
  for (let i = 0; i < n; i++) agent.tick(dt, targets)
}

/** '!wait' replacement that records cancellation. */
function spyWait(log: string[]): ActionFactory {
  return args => {
    const seconds = args[0] && args[0].t === 'float' ? args[0].v : 0
    let t = 0
    const ex: ActionExecutor = {
      start: () => (log.push('start'), 'running'),
      update: dt => ((t += dt), t >= seconds ? 'done' : 'running'),
      cancel: () => log.push('cancel')
    }
    return ex
  }
}

test('executes steps in order; instant steps chain within one tick', () => {
  const { agent, steps, runner } = makeAgent(call =>
    call === 0 ? [prim('!set_waypoint', int(1)), prim('!forget', sym('player')), prim('!move_to', vec3(0, 0, 2), sym('walk')), prim('!wait', float(0.5))] : [prim('!wait', float(100))]
  )
  agent.tick(0.1, [])
  assert.deepEqual(steps(), ['!set_waypoint', '!forget', '!move_to'])
  assert.equal(agent.blackboard.currentWaypoint, 1)
  assert.deepEqual(agent.blackboard.world.rows('current_waypoint', 1), [[int(1)]])
  assert.equal(agent.currentAction, '!move_to')
  run(agent, 2.5)
  assert.ok(distanceXZ(agent.kinematic.position, v3(0, 0, 2)) <= 0.3)
  assert.deepEqual(steps().slice(0, 4), ['!set_waypoint', '!forget', '!move_to', '!wait'])
  assert.equal(runner().calls, 2) // plan completed → replanned once
})

test('replans immediately when the plan completes', () => {
  const { agent, replans } = makeAgent(() => [prim('!wait', float(0.25))])
  run(agent, 1.05)
  const reasons = replans().map(r => r.reason)
  assert.equal(reasons[0], 'start')
  assert.ok(reasons.slice(1).every(r => r === 'plan completed'))
  assert.ok(reasons.length >= 4, `replans: ${reasons.length}`)
})

test('target acquired: running step is cancelled and the agent replans, throttled', () => {
  const log: string[] = []
  const { agent, replans, runner } = makeAgent(
    (_call, world) => (world.rows('target_visible', 2).length > 0 ? [prim('!chase', sym('player'))] : [prim('!wait', float(100))]),
    { replanThrottle: 1, actions: { '!wait': spyWait(log) } }
  )
  agent.tick(0.1, BEHIND) // t=0.1: initial plan, waiting
  agent.tick(0.1, BEHIND)
  assert.equal(runner().calls, 1)
  agent.tick(0.1, FRONT) // t=0.3: detected, but within the throttle window
  assert.equal(agent.mode, 'chase')
  assert.equal(runner().calls, 1)
  assert.deepEqual(log, ['start'])
  run(agent, 0.7, FRONT) // t=1.0
  assert.equal(runner().calls, 1)
  agent.tick(0.1, FRONT) // t=1.1 → throttle elapsed
  assert.equal(runner().calls, 2)
  assert.deepEqual(log, ['start', 'cancel'])
  const last = replans()[replans().length - 1]
  assert.match(last.reason, /^perception/)
  assert.deepEqual(last.plan, ['!chase player'])
  assert.equal(agent.currentAction, '!chase')
})

test('target lost: memory becomes last_seen, the agent replans, forget clears it', () => {
  const seenAtPlan: string[] = []
  const { agent, replans } = makeAgent(
    (_call, world) => {
      const seen = world.rows('last_seen', 3)
      if (seen.length === 0) return [prim('!wait', float(100))]
      seenAtPlan.push(seen[0].map(formatAtom).join(' '))
      return [prim('!wait', float(0.3)), prim('!forget', sym('player')), prim('!wait', float(100))]
    },
    { replanThrottle: 0 }
  )
  agent.tick(0.1, FRONT)
  assert.equal(agent.mode, 'chase')
  const rows = agent.blackboard.world.rows('target_visible', 2)
  assert.equal(rows.length, 1)
  assert.equal(formatAtom(rows[0][1]), '(0.0 0.0 6.0)')
  agent.tick(0.1, BEHIND) // lost (loseGrace 0) → replanned in the same tick
  assert.equal(agent.mode, 'investigate')
  assert.equal(agent.blackboard.world.rows('target_visible', 2).length, 0)
  assert.deepEqual(seenAtPlan, ['player (0.0 0.0 6.0) 0.1'])
  assert.match(replans()[replans().length - 1].reason, /^perception player\| -> \|player/)
  run(agent, 0.3, BEHIND)
  assert.equal(agent.blackboard.world.rows('last_seen', 3).length, 0)
  assert.equal(agent.mode, 'patrol')
})

test('a failed step replans right away, bypassing the throttle; an unknown primitive is a 0.05 s no-op (H11)', () => {
  const failing: ActionFactory = () => ({ start: () => 'failed', update: () => 'failed', cancel: () => {} })
  const { agent, events, replans } = makeAgent(
    call => (call === 0 ? [prim('!boom')] : call === 1 ? [prim('!no_such_action')] : [prim('!wait', float(100))]),
    { replanThrottle: 10, actions: { '!boom': failing } }
  )
  run(agent, 0.3)
  assert.deepEqual(replans().map(r => r.reason), ['start', 'step failed', 'plan completed'])
  assert.equal(agent.currentAction, '!wait')
  assert.deepEqual(events.filter(e => e.type === 'step_end').map(e => e.type === 'step_end' && `${e.name} ${e.status}`), ['!boom failed', '!no_such_action done'])
  assert.deepEqual(events.filter(e => e.type === 'diagnostic').map(e => e.type === 'diagnostic' && e.message), [
    'no executor for !no_such_action: runs as a 0.05 s no-op'
  ])
})

test('bad arguments make the executor factory refuse the step: a no-op, reported once', () => {
  const { agent, events, replans } = makeAgent(call => (call < 3 ? [prim('!move_to', sym('nowhere'), sym('walk'))] : [prim('!wait', float(100))]))
  run(agent, 0.5)
  assert.deepEqual(replans().map(r => r.reason), ['start', 'plan completed', 'plan completed', 'plan completed'])
  assert.deepEqual(events.filter(e => e.type === 'diagnostic').map(e => e.type === 'diagnostic' && e.message), [
    'the !move_to executor rejected !move_to nowhere walk: runs as a 0.05 s no-op'
  ])
})

test('deferred steps expand against the state left by earlier steps', () => {
  const expand: DeferredExpander = (step, world) => {
    if (step.name !== 'advance') return null
    const cur = world.rows('current_waypoint', 1)[0][0]
    return [prim('!set_waypoint', int((cur.v as number) + 1))]
  }
  const { agent, steps } = makeAgent(call => (call === 0 ? [prim('!set_waypoint', int(4)), defer('advance')] : [prim('!wait', float(100))]), {}, expand)
  agent.tick(0.1, [])
  assert.equal(agent.blackboard.currentWaypoint, 5)
  assert.deepEqual(steps().slice(0, 2), ['!set_waypoint', '!set_waypoint'])
})

test('a failed deferred decomposition replans', () => {
  const { agent, replans } = makeAgent(call => (call === 0 ? [defer('nope')] : [prim('!wait', float(100))]))
  run(agent, 0.2)
  assert.equal(replans()[1].reason, 'deferred step failed')
})

test('no plan: retry on the next tick, as upstream HTNDemo, whatever replanThrottle (H7)', () => {
  // Upstream AIHTNDemoWandererAgent::TryPlan: "Planning failed; retrying next update" (no cooldown).
  const { agent, runner, replans } = makeAgent(call => (call < 2 ? null : [prim('!wait', float(100))]), { replanThrottle: 10 })
  agent.tick(0.1, [])
  assert.equal(runner().calls, 1)
  agent.tick(0.1, [])
  assert.equal(runner().calls, 2)
  agent.tick(0.1, [])
  assert.equal(runner().calls, 3)
  assert.equal(agent.currentAction, '!wait')
  assert.deepEqual(replans().map(r => r.reason), ['start', 'retry after no_plan', 'retry after no_plan'])
})

test('no plan: one retry per tick, never more (H7)', () => {
  const { agent, runner } = makeAgent(() => null, { replanThrottle: 0 })
  run(agent, 1)
  assert.equal(runner().calls, 10)
  assert.equal(agent.lastPlanStatus, 'no_plan')
})

test('no plan: a branch the world opens later is planned on the first tick it holds, not a throttle later (H7)', () => {
  // The agent writes (now <seconds>) every tick, so a time-gated branch can open on any tick.
  const now = (w: WorldState) => {
    const v = w.rows('now', 1)[0]?.[0]
    return v !== undefined && v.t === 'float' ? v.v : 0
  }
  const { agent, replans } = makeAgent((_call, w) => (now(w) >= 0.15 ? [prim('!wait', float(100))] : null))
  run(agent, 0.2)
  assert.equal(agent.currentAction, '!wait')
  assert.equal(replans().length, 2)
})

test('no plan after a reload: retried on the next tick (H7, H16)', () => {
  const { agent, replans } = makeAgent(() => [prim('!wait', float(100))], { replanThrottle: 10 })
  agent.tick(0.1, [])
  const b = scripted(call => (call < 2 ? null : [prim('!look_around', float(100))]))
  agent.reload(b.factory)
  run(agent, 0.3)
  assert.deepEqual(replans().map(r => r.reason), ['start', 'reload', 'retry after no_plan', 'retry after no_plan'])
  assert.equal(agent.currentAction, '!look_around')
})

test('no plan between no-op steps: retried every tick, the no-executor diagnostic still said once (H7, H11)', () => {
  const { agent, events, runner } = makeAgent(call => (call % 3 === 0 ? [prim('!dance')] : null), { replanThrottle: 10 })
  run(agent, 1.2)
  // Per 3 ticks: plan !dance (a 0.05 s no-op), it ends and the replan finds nothing, retry finds nothing.
  assert.equal(runner().calls, 12)
  assert.equal(events.filter(e => e.type === 'step').length, 4)
  assert.equal(events.filter(e => e.type === 'diagnostic').length, 1)
})

test('chase runs at the live target and catch emits an event', () => {
  const { agent, events } = makeAgent(call =>
    call === 0 ? [prim('!chase', sym('player')), prim('!catch', sym('player')), prim('!wait', float(100))] : [prim('!wait', float(100))]
  )
  const target: TargetSample[] = [{ id: 'player', position: v3(0, 0, 8) }]
  for (let i = 0; i < 100 && !events.some(e => e.type === 'catch'); i++) {
    target[0] = { id: 'player', position: v3(0, 0, 8 + i * 0.02) } // creeping away slowly
    agent.tick(0.1, target)
  }
  assert.ok(events.some(e => e.type === 'catch' && e.target === 'player'))
  assert.ok(distanceXZ(agent.kinematic.position, target[0].position) <= agent.tuning.catchRadius + 1e-6)
})

test('chase fails when the target is no longer detected', () => {
  const los = new GeometricLineOfSight()
  const { agent, events } = makeAgent(call => (call === 0 ? [prim('!chase', sym('player'))] : [prim('!wait', float(100))]), {
    lineOfSight: los,
    replanThrottle: 10
  })
  agent.tick(0.1, FRONT)
  los.occluders = [{ min: v3(-5, 0, 3), max: v3(5, 4, 3.5) }]
  agent.tick(0.1, FRONT)
  assert.ok(events.some(e => e.type === 'step_end' && e.name === '!chase' && e.status === 'failed'))
})

test('look_around sweeps the gaze and ends facing roughly the original heading', () => {
  const { agent } = makeAgent(call => (call === 0 ? [prim('!look_around', float(2.0))] : [prim('!wait', float(100))]))
  let maxAbs = 0
  for (let i = 0; i < 21; i++) { // the step starts on tick 1 and gets 20 updates
    agent.tick(0.1, [])
    maxAbs = Math.max(maxAbs, Math.abs(agent.kinematic.yaw))
  }
  assert.ok(maxAbs > 1, `swept ${maxAbs} rad`)
  assert.ok(Math.abs(agent.kinematic.yaw) < 0.5)
  assert.equal(agent.currentAction, '!wait')
})

test('stop() cancels the running step and clears the plan', () => {
  const log: string[] = []
  const { agent, runner } = makeAgent(() => [prim('!wait', float(100))], { actions: { '!wait': spyWait(log) } })
  agent.tick(0.1, [])
  agent.stop()
  assert.deepEqual(log, ['start', 'cancel'])
  assert.equal(runner().steps.length, 0)
  assert.equal(agent.currentAction, '')
})

test('hearing: a noise after quiet and an escalation to alarmed replan; more noises at the same level do not', () => {
  const bus = new NoiseBus()
  const { agent, replans } = makeAgent(() => [prim('!wait', float(100))], { replanThrottle: 0.25 })
  const noiseReplans = () => replans().filter(r => r.reason.startsWith('noise')).map(r => r.reason)
  agent.tick(0.1, BEHIND)
  // Faint footsteps 6 m away (jog, 7 m radius: perceived ~0.14), every half second.
  const step = () => bus.emit({ kind: 'steps', position: v3(0, 0, -6), loudness: 7, source: 'player' })
  for (let i = 0; i < 3; i++) {
    const noises = [step()]
    agent.tick(0.1, BEHIND, noises)
    run(agent, 0.4, BEHIND)
  }
  assert.deepEqual(noiseReplans(), ['noise steps wary'])
  assert.equal(agent.mode, 'alert')
  // A bang close by alarms: one more replan.
  agent.tick(0.1, BEHIND, [bus.emit({ kind: 'impact', position: v3(1, 0, -1), loudness: 10, source: 'x' })])
  run(agent, 0.4, BEHIND)
  assert.deepEqual(noiseReplans(), ['noise steps wary', 'noise impact alarmed'])
  // Its own noise is not heard.
  agent.tick(0.1, BEHIND, [bus.emit({ kind: 'impact', position: v3(1, 0, -1), loudness: 10, source: 'g' })])
  assert.equal(agent.lastHearing.heard.length, 0)
})

test('hearing: no noise replan while a target is visible', () => {
  const bus = new NoiseBus()
  const { agent, replans } = makeAgent(() => [prim('!wait', float(100))])
  run(agent, 0.5, FRONT)
  assert.equal(agent.mode, 'chase')
  for (let i = 0; i < 5; i++) {
    agent.tick(0.1, FRONT, [bus.emit({ kind: 'impact', position: v3(0, 0, -2), loudness: 10, source: 'x' })])
    run(agent, 0.3, FRONT)
  }
  assert.ok(agent.lastHearing.alert > 0.5)
  assert.ok(!replans().some(r => r.reason.startsWith('noise')))
})

test('senses the domain never reads do not replan: a visitor walking by does not cut the plan', () => {
  const bus = new NoiseBus()
  const log: string[] = []
  const { agent, replans } = makeAgent(() => [prim('!wait', float(100))], { replanThrottle: 0, actions: { '!wait': spyWait(log) } }, undefined, {
    facts: ['pile_boxes/1'],
    callterms: []
  })
  for (let i = 0; i < 5; i++) {
    agent.tick(0.1, FRONT, [bus.emit({ kind: 'impact', position: v3(1, 0, -1), loudness: 10, source: 'x' })])
    agent.tick(0.1, BEHIND)
  }
  assert.equal(agent.mode, 'patrol') // it does not even sense them: nothing would read the facts
  assert.deepEqual(replans().map(r => r.reason), ['start'])
  assert.deepEqual(log, ['start'])
})

test('each sense replans only through the facts the domain reads', () => {
  const bus = new NoiseBus()
  const bang = () => [bus.emit({ kind: 'impact', position: v3(1, 0, -1), loudness: 10, source: 'x' })]
  const reasons = (facts: string[], callterms: string[] = []) => {
    const { agent, replans } = makeAgent(() => [prim('!wait', float(100))], { replanThrottle: 0 }, undefined, { facts, callterms })
    agent.tick(0.1, BEHIND) // start: nobody around
    agent.tick(0.1, FRONT) // acquired
    agent.tick(0.1, BEHIND) // lost: remembered
    agent.tick(0.1, BEHIND, bang())
    return replans().slice(1).map(r => r.reason)
  }
  assert.deepEqual(reasons(['target_visible/2']), ['perception | -> player|', 'perception player| -> |'])
  assert.deepEqual(reasons(['last_seen/3']), ['perception | -> |player'])
  assert.deepEqual(reasons(['alert/1']), ['noise impact alarmed'])
  // A callterm may read the blackboard: every sense replans, as without a domain.
  assert.equal(reasons(['pile_boxes/1'], ['distance_to']).length, 3)
})

// ---- candidate plan (upstream USE_CASES 2) ------------------------------------------------------

const advanceTo = (seconds: number): DeferredExpander => step => (step.name === 'advance' || step.name === 'next' ? [prim('!wait', float(seconds))] : null)

test('a replan whose candidate equals the running plan keeps the step, its index and its progress', () => {
  const log: string[] = []
  const { agent, events, replans, runner } = makeAgent(
    call => (call === 0 ? [prim('!set_waypoint', int(1)), prim('!wait', float(0.95)), defer('advance', int(2))] : [prim('!wait', float(0.95)), defer('advance', int(2))]),
    { replanThrottle: 0, actions: { '!wait': spyWait(log) } },
    advanceTo(100)
  )
  agent.tick(0.1, []) // t=0.1: !set_waypoint done, the wait starts
  run(agent, 0.5) // the wait is half done
  agent.requestReplan('poke')
  agent.tick(0.1, [])
  assert.equal(runner().calls, 2)
  const last = replans()[replans().length - 1]
  assert.equal(last.reason, 'poke')
  assert.equal(last.kept, true)
  assert.deepEqual(last.plan, ['!wait 0.9', 'advance 2']) // the running plan from its current step
  assert.deepEqual(log, ['start']) // not cancelled, not restarted
  assert.equal(agent.currentAction, '!wait')
  run(agent, 0.4) // t=1.1: the wait ends on its original schedule (a restart would end at 1.7)
  assert.ok(events.some(e => e.type === 'step_end' && e.name === '!wait' && e.status === 'done'))
  assert.deepEqual(log, ['start', 'start']) // then the deferred step: the plan went on from its index
})

test('a different candidate (another argument, also of a deferred step) cancels the running step and is adopted', () => {
  const differs = (candidate: PlanStep[]) => {
    const log: string[] = []
    const { agent, replans } = makeAgent(call => (call === 0 ? [prim('!wait', float(1)), defer('advance', int(2))] : candidate), {
      replanThrottle: 0,
      actions: { '!wait': spyWait(log) }
    })
    agent.tick(0.1, [])
    agent.requestReplan('poke')
    agent.tick(0.1, [])
    const last = replans()[replans().length - 1]
    return { log, kept: last.kept, plan: last.plan }
  }
  assert.deepEqual(differs([prim('!wait', float(2))]), { log: ['start', 'cancel', 'start'], kept: false, plan: ['!wait 2.0'] })
  assert.deepEqual(differs([prim('!wait', float(1)), defer('advance', int(3))]), { log: ['start', 'cancel', 'start'], kept: false, plan: ['!wait 1.0', 'advance 3'] })
  assert.deepEqual(differs([prim('!wait', float(1))]), { log: ['start', 'cancel', 'start'], kept: false, plan: ['!wait 1.0'] })
})

test('a candidate starting with a deferred step is compared with what it expands to now', () => {
  const log: string[] = []
  const { agent, replans } = makeAgent(() => [defer('next')], { replanThrottle: 0, actions: { '!wait': spyWait(log) } }, advanceTo(5))
  agent.tick(0.1, []) // the running plan: &next expanded to !wait 5
  agent.requestReplan('poke')
  agent.tick(0.1, [])
  assert.equal(replans()[replans().length - 1].kept, true)
  assert.deepEqual(log, ['start'])
})

test('no plan while a step runs: by default the step is kept and nothing retries until the plan ends', () => {
  const log: string[] = []
  const { agent, replans, runner } = makeAgent(call => (call === 1 ? null : [prim('!wait', float(1))]), {
    replanThrottle: 0.25,
    actions: { '!wait': spyWait(log) }
  })
  agent.tick(0.1, [])
  agent.requestReplan('poke', true) // urgent: past the throttle
  agent.tick(0.1, [])
  const last = replans()[replans().length - 1]
  assert.deepEqual([last.status, last.kept, last.plan], ['no_plan', true, ['!wait 1.0']])
  assert.deepEqual(log, ['start'])
  assert.equal(agent.currentAction, '!wait')
  run(agent, 0.7) // t=0.9: still the same step, no retries
  assert.equal(runner().calls, 2)
  run(agent, 0.4) // the kept plan completes and the agent plans again
  assert.equal(runner().calls, 3)
  assert.equal(replans()[replans().length - 1].reason, 'plan completed')
})

test("no plan with onNoPlan 'cancel': the step is cancelled and the agent retries on the next tick (H7)", () => {
  const log: string[] = []
  const { agent, runner } = makeAgent(call => (call === 1 || call === 2 ? null : [prim('!wait', float(100))]), {
    replanThrottle: 10,
    onNoPlan: 'cancel',
    actions: { '!wait': spyWait(log) }
  })
  agent.tick(0.1, [])
  agent.requestReplan('poke', true) // urgent: past the throttle
  agent.tick(0.1, [])
  assert.deepEqual(log, ['start', 'cancel'])
  assert.equal(agent.currentAction, '')
  agent.tick(0.1, [])
  assert.equal(runner().calls, 3)
  assert.equal(agent.currentAction, '')
  agent.tick(0.1, [])
  assert.equal(runner().calls, 4)
  assert.equal(agent.currentAction, '!wait')
})

test('a successful empty plan plans again in the same tick, re-syncing facts between passes', () => {
  let syncs = 0
  const { agent, replans, runner } = makeAgent(() => (syncs >= 2 ? [prim('!wait', float(100))] : []), { syncFacts: () => (syncs++, '') })
  agent.tick(0.1, []) // sense syncs once, pass 1 is empty, the agent syncs again, pass 2 has a step
  assert.equal(runner().calls, 2)
  assert.equal(syncs, 2)
  assert.equal(agent.currentAction, '!wait')
  assert.deepEqual(replans().map(r => [r.reason, r.passes, r.plan]), [['start', 2, ['!wait 100.0']]])
})

test('immediate planning passes are bounded per tick', () => {
  const { agent, runner } = makeAgent(() => [])
  agent.tick(0.1, [])
  assert.equal(runner().calls, 4) // default budget, as upstream MaxImmediatePlanningPasses
  agent.tick(0.1, [])
  assert.equal(runner().calls, 8)
  const two = makeAgent(() => [], { maxPlanningPasses: 2 })
  two.agent.tick(0.1, [])
  assert.equal(two.runner().calls, 2)
})

test('hearing: the "no noise replan while a target is visible" gate applies only if the domain reads target_visible', () => {
  const bus = new NoiseBus()
  const noiseReasons = (facts: string[]) => {
    const { agent, replans } = makeAgent(() => [prim('!wait', float(100))], { replanThrottle: 0 }, undefined, { facts, callterms: [] })
    agent.tick(0.1, FRONT)
    assert.equal(agent.mode, 'chase') // last_seen/3 keeps sight running: the target is visible
    agent.tick(0.1, FRONT, [bus.emit({ kind: 'impact', position: v3(1, 0, -1), loudness: 10, source: 'x' })])
    return replans().filter(r => r.reason.startsWith('noise')).map(r => r.reason)
  }
  assert.deepEqual(noiseReasons(['alert/1', 'last_seen/3']), ['noise impact alarmed'])
  assert.deepEqual(noiseReasons(['alert/1', 'last_seen/3', 'target_visible/2']), [])
})

// ---- what the domain reads decides the sensing --------------------------------------------------

/** Line of sight that counts its checks. */
function countingSight() {
  const los = { checks: 0, check: () => (los.checks++, true) }
  return los
}

type Domain = NonNullable<PlanRunnerLike['domain']>
const reading = (...facts: string[]): Domain => ({ facts, callterms: [] })

test('a domain that reads no sight fact runs no sight: no line-of-sight checks, no target_visible / last_seen', () => {
  const los = countingSight()
  const { agent, replans } = makeAgent(() => [prim('!wait', float(100))], { lineOfSight: los, replanThrottle: 0 }, undefined, reading('pile_boxes/1'))
  agent.tick(0.1, FRONT)
  agent.tick(0.1, BEHIND)
  agent.tick(0.1, FRONT)
  assert.equal(los.checks, 0)
  assert.equal(agent.blackboard.world.rows('target_visible', 2).length, 0)
  assert.equal(agent.blackboard.world.rows('last_seen', 3).length, 0)
  assert.deepEqual(agent.lastPerception.visible, [])
  assert.equal(agent.mode, 'patrol') // a body that cannot see shows no chase
  assert.deepEqual(replans().map(r => r.reason), ['start'])
})

test('sight runs for a domain that reads either sight fact, or calls callterms', () => {
  for (const domain of [reading('target_visible/2'), reading('last_seen/3'), { facts: [], callterms: ['distance_to'] }]) {
    const los = countingSight()
    const { agent } = makeAgent(() => [prim('!wait', float(100))], { lineOfSight: los }, undefined, domain)
    agent.tick(0.1, FRONT)
    assert.ok(los.checks > 0, JSON.stringify(domain))
    assert.equal(agent.mode, 'chase')
  }
})

test('a domain that reads no hearing fact hears nothing: no heard events, no heard_noise / alert change', () => {
  const bus = new NoiseBus()
  const { agent, events } = makeAgent(() => [prim('!wait', float(100))], {}, undefined, reading('pile_boxes/1'))
  agent.tick(0.1, [], [bus.emit({ kind: 'impact', position: v3(1, 0, -1), loudness: 10, source: 'x' })])
  assert.equal(events.filter(e => e.type === 'heard').length, 0)
  assert.equal(agent.blackboard.world.rows('heard_noise', 4).length, 0)
  assert.equal(agent.blackboard.alertLevel, 'calm')
  assert.equal(agent.mode, 'patrol')
})

test("the senses follow the runner's domain when it is swapped (hot reload)", () => {
  const los = countingSight()
  const { agent, replans, runner } = makeAgent(() => [prim('!wait', float(100))], { lineOfSight: los, replanThrottle: 0 }, undefined, reading('pile_boxes/1'))
  const swap = (domain: Domain) => ((runner() as { domain?: Domain }).domain = domain)
  agent.tick(0.1, FRONT)
  assert.equal(los.checks, 0)
  swap(reading('target_visible/2'))
  agent.tick(0.1, FRONT)
  assert.ok(los.checks > 0)
  assert.equal(agent.mode, 'chase')
  assert.deepEqual(replans().map(r => r.reason), ['start', 'perception | -> player|'])
  // Back to a domain that cannot see: the target is dropped from the facts, the body shows no chase.
  swap(reading('pile_boxes/1'))
  const checks = los.checks
  agent.tick(0.1, FRONT)
  agent.tick(0.1, BEHIND)
  assert.equal(los.checks, checks)
  assert.equal(agent.blackboard.world.rows('target_visible', 2).length, 0)
  assert.equal(agent.blackboard.world.rows('last_seen', 3).length, 0)
  assert.equal(agent.mode, 'patrol')
  assert.deepEqual(replans().map(r => r.reason).slice(2), ['perception player| -> |']) // the swap itself, once
})

test('the hearing gate follows a swapped domain too', () => {
  const bus = new NoiseBus()
  const bang = () => [bus.emit({ kind: 'impact', position: v3(1, 0, -1), loudness: 10, source: 'x' })]
  const { agent, replans, runner } = makeAgent(() => [prim('!wait', float(100))], { replanThrottle: 0 }, undefined, reading('pile_boxes/1'))
  agent.tick(0.1, [], bang())
  assert.deepEqual(replans().map(r => r.reason), ['start'])
  ;(runner() as { domain?: Domain }).domain = reading('alert/1')
  agent.tick(0.1, [], bang())
  assert.deepEqual(replans().map(r => r.reason), ['start', 'noise impact alarmed'])
})

test('a candidate runner with another domain, once adopted, decides the senses', () => {
  // The factory hands later runners a new domain (a reload); the candidate runner is created on the first replan
  // while a plan runs, and replaces the active one when its plan differs.
  let domain = reading('pile_boxes/1')
  const s = scripted(call => [prim('!wait', float(call === 0 ? 100 : 50))])
  const los = countingSight()
  const agent = new GuardAgent({
    id: 'g',
    planner: world => Object.assign(s.factory(world), { domain }),
    lineOfSight: los,
    start: { position: v3(0, 0, 0), yaw: 0 },
    perception: { detectTime: 0, nearDetectTime: 0, loseGrace: 0 },
    replanThrottle: 0
  })
  agent.tick(0.1, FRONT)
  assert.equal(los.checks, 0)
  domain = reading('target_visible/2')
  agent.requestReplan('reload')
  agent.tick(0.1, FRONT) // the candidate (another wait) is adopted: its runner, with the new domain, is active now
  assert.equal(agent.runner.domain, domain)
  agent.tick(0.1, FRONT)
  assert.ok(los.checks > 0)
  assert.equal(agent.mode, 'chase')
})

/** A fake runner reports no execution info or counters: those metrics stay empty. */
const NO_RUNNER_INFO = { lastPeakCallFrames: 0, maxPeakCallFrames: 0, callFrameCapacity: 0, lastError: null, lastStats: null, totalStats: null, checksMade: 0, totalCheckMs: 0, budgetDeferred: 0, budgetMaxWaitFrames: 0, reasoningMade: 0, totalReasoningMs: 0, continued: 0 }

test('planning metrics: ms last / total / max, plans made, tasks completed', () => {
  let now = 1000
  const cost = [5, 2]
  const { agent } = makeAgent(
    call => {
      now += cost[call] ?? 1
      return call === 0 ? [prim('!set_waypoint', int(1)), prim('!wait', float(100))] : [prim('!wait', float(100))]
    },
    { clock: () => now }
  )
  agent.tick(0.1, [])
  agent.requestReplan('poke', true) // urgent: past the throttle
  agent.tick(0.1, [])
  assert.deepEqual(agent.metrics, { ...NO_RUNNER_INFO, lastPlanMs: 2, totalPlanMs: 7, maxPlanMs: 5, plansMade: 2, tasksCompleted: 1 })
})

test('planning metrics work with the default clock', () => {
  const { agent } = makeAgent(() => [prim('!wait', float(100))])
  agent.tick(0.1, [])
  const m = agent.metrics
  assert.equal(m.plansMade, 1)
  assert.ok(Number.isFinite(m.lastPlanMs) && m.lastPlanMs >= 0 && m.maxPlanMs === m.lastPlanMs && m.totalPlanMs === m.lastPlanMs)
})

test('planning metrics: peak call frames, last error and structural counters from a real runner', () => {
  const d = parseDomain(`
(:domain Metrics top_level_domain
  (:method (go ?inp_pos) (walk () ((!move_to ?inp_pos run))))
  (:method (behave) top_level_method
    (chase (and (target_visible ?id ?pos)) ((go ?pos)))
    (patrol (and (spot ?i ?p) (== (/ ?i 0) 0)) ((!move_to ?p walk)))
    (idle () ((!wait 100.0)))))`)
  const stats = newPlanStats()
  const agent = new GuardAgent({
    id: 'm',
    planner: world => new PlanRunner(d, world, { stats }),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    perception: { detectTime: 0, nearDetectTime: 0, loseGrace: 0 },
    replanThrottle: 0
  })
  agent.blackboard.world.add('spot', int(0), vec3(1, 0, 1))
  agent.tick(0.1, [])
  const m = agent.metrics
  assert.equal(agent.currentAction, '!wait')
  assert.equal(m.plansMade, 1)
  assert.equal(m.callFrameCapacity, 8192)
  assert.equal(m.lastPeakCallFrames, 2) // the entry method and one running task
  assert.equal(m.lastError?.code, 'arithmetic_error')
  assert.deepEqual(m.lastStats, { ...stats })
  assert.notEqual(m.lastStats, stats, 'a copy: the runner reuses its object')
  assert.deepEqual(m.totalStats, m.lastStats)
  const first = m.lastStats!
  const firstCopy = { ...first }
  agent.tick(0.1, FRONT) // a target in sight: replan into the chase (a compound task: four frames)
  assert.equal(agent.currentAction, '!move_to')
  assert.equal(m.plansMade, 2)
  assert.equal(m.lastPeakCallFrames, 4)
  assert.equal(m.maxPeakCallFrames, 4)
  assert.equal(m.lastError, null)
  assert.equal(m.totalStats!.methods, first.methods + m.lastStats!.methods)
  assert.equal(m.totalStats!.factQueries, first.factQueries + m.lastStats!.factQueries)
  assert.deepEqual(first, firstCopy, 'replaced, not mutated: snapshots stay valid')
})

// ---- structured replans: trigger, fact changes, previous plan, changed ------------------------------------------

test('a replan says what asked for it: start, plan done, step failed, no-plan retry, reload, a host request', () => {
  const failing: ActionFactory = () => ({ start: () => 'failed', update: () => 'failed', cancel: () => {} })
  const { agent, replans } = makeAgent(call => (call === 0 ? [prim('!boom')] : call === 1 ? null : call === 2 ? [prim('!set_waypoint', int(1))] : [prim('!wait', float(100))]), {
    actions: { '!boom': failing }
  })
  run(agent, 0.4)
  agent.requestReplan('poke')
  agent.tick(0.1, [])
  agent.reload(scripted(() => [prim('!wait', float(100))]).factory)
  agent.tick(0.1, [])
  assert.deepEqual(
    replans().map(r => [r.reason, r.trigger]),
    [
      ['start', 'start'],
      ['step failed', 'step_failed'],
      ['retry after no_plan', 'no_plan_retry'],
      ['plan completed', 'plan_done'],
      ['poke', 'request'],
      ['reload', 'reload']
    ]
  )
  assert.equal(agent.lastReplan, replans()[replans().length - 1])
  // A debugger asks with its own trigger; a second request before the replan joins the first.
  agent.requestReplan('debugger: replan', false, 'debug')
  agent.requestReplan('order', false)
  agent.tick(0.1, [])
  const last = replans()[replans().length - 1]
  assert.deepEqual([last.reason, last.trigger, last.also], ['debugger: replan', 'debug', ['request']])
})

test('a replan lists the facts the domain reads that changed since the previous one, and whether the plan changed', () => {
  const { agent, replans } = makeAgent(
    (_call, w) => (w.rows('target_visible', 2).length > 0 ? [prim('!chase', sym('player'))] : [prim('!wait', float(100))]),
    { replanThrottle: 0 },
    undefined,
    { facts: ['target_visible/2', 'last_seen/3'], callterms: [] }
  )
  agent.tick(0.1, BEHIND)
  assert.equal(replans()[0].changes, undefined, 'nothing to compare the first plan with')
  assert.equal(replans()[0].changed, true)
  assert.equal(replans()[0].previous, undefined)
  agent.tick(0.1, FRONT)
  const seen = replans()[1]
  assert.equal(seen.trigger, 'perception')
  assert.deepEqual(seen.changes, ['+ (target_visible player (0.0 0.0 6.0))'], 'now/1 and self_position/1 changed too, but the domain does not read them')
  assert.deepEqual(seen.previous, ['!wait 100.0'])
  assert.deepEqual(seen.plan, ['!chase player'])
  assert.equal(seen.changed, true)
  // The same plan again: kept, not changed.
  agent.requestReplan('poke')
  agent.tick(0.1, FRONT)
  const poke = replans()[2]
  assert.deepEqual([poke.kept, poke.changed, poke.changes], [true, false, []])
})

test('the facts the agent writes every tick are volatile: named in `volatile`, never in `changes`', () => {
  const { agent, replans } = makeAgent(
    (_call, w) => (w.rows('target_visible', 2).length > 0 ? [prim('!chase', sym('player'))] : [prim('!wait', float(100))]),
    { replanThrottle: 0 },
    undefined,
    { facts: ['now/1', 'self_position/1', 'target_visible/2'], callterms: [] } // a domain that reads its clock
  )
  agent.tick(0.1, BEHIND)
  agent.tick(0.1, FRONT)
  const seen = replans()[1]
  assert.deepEqual(seen.changes, ['+ (target_visible player (0.0 0.0 6.0))'], 'the clock moves every tick: it says nothing')
  assert.deepEqual(seen.volatile, ['now'], 'it stood still: its position did not change')
  agent.requestReplan('poke')
  agent.tick(0.1, FRONT)
  const poke = replans()[2]
  assert.deepEqual([poke.changes, poke.volatile], [[], ['now']], 'only the clock moved')
})

test('a host marks the facts its syncFacts writes every tick as volatile too', () => {
  let n = 0
  const { agent, replans } = makeAgent(
    () => [prim('!wait', float(100))],
    {
      replanThrottle: 0,
      volatileFacts: ['distance'],
      syncFacts: a => {
        a.blackboard.world.set('distance', float(++n))
        a.blackboard.world.set('door', sym(n > 1 ? 'open' : 'shut'))
        return ''
      }
    },
    undefined,
    { facts: ['now/1', 'distance/1', 'door/1'], callterms: [] }
  )
  agent.tick(0.1, [])
  agent.requestReplan('poke')
  agent.tick(0.1, [])
  const poke = replans()[1]
  assert.deepEqual(poke.changes, ['- (door shut)', '+ (door open)'])
  assert.deepEqual(poke.volatile, ['distance', 'now'])
})

test('nobody listening: no world snapshot per replan, no changes', () => {
  const s = scripted(() => [prim('!wait', float(100))])
  const agent = new GuardAgent({ id: 'q', planner: s.factory, lineOfSight: CLEAR_LINE_OF_SIGHT, start: { position: v3(0, 0, 0), yaw: 0 } })
  agent.tick(0.1, [])
  agent.requestReplan('poke')
  agent.tick(0.1, [])
  assert.equal(agent.lastReplan?.trigger, 'request')
  assert.equal(agent.lastReplan?.changes, undefined)
})
