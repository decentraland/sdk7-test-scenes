// Upstream docs/USE_CASES.md pattern 6 (lines 115-119): hot reload is client-owned; the engine must "define what
// happens to active plans and pending deferred tasks". Upstream's choice (HTNHotReloadDemo/README.md:53-61, and
// AIHTNDemoWandererAgent.cpp:185-216 ReleaseGeneratedPlanner / AttachGeneratedPlanner): keep the world state and the
// game state, discard the plan (pending deferred calls included), replan on the next update; the self-test reloads
// "during a movement primitive with pending deferred calls" and requires the new revision's deferred comment to run
// after the reloads (README.md:91-93, 133-134).
//
// Ours: the lab station (src/demo/upstream-zone.ts reload()) and GuardAgent.reload() / GuardSquad.reload() do the same
// (register H16). A deferred step only expands in the domain that planned it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decomposeDeferred, formatTask, PlanRunner, sym, WorldState, type DomainIR, type PlanStep, type RuntimeDiagnostic } from '../../src/htn-planner'
import { timed, type GuardEvent } from '../../src/htn-planner/npc/actions'
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import { galleryCallterms, same } from '../../src/examples/upstream/stations'
import { WandererWorld } from '../../src/examples/upstream/gallery/wanderer'
import { HOT_RELOAD_STATION, HOT_RELOADS, wandererLocation } from '../../src/examples/upstream/hot-reload'
import { wandererRevADomain } from '../../src/examples/upstream/generated/hot-reload/WandererRevA.htn'
import { compileDomainSource } from '../../tools/htn/compiler'

const fmt = (s: PlanStep) => formatTask(s.name, s.args)

function settle(host: WandererWorld) {
  for (let i = 0; host.world.rows('pathfind_state', 4).some(r => same(r[0], sym('in_progress'))); i++) {
    assert.ok(i < 1000, 'the query never finished')
    host.update(1 / 30)
  }
}

test('hot reload, deferred case: the pending rev A deferred call is dropped with the plan; rev B plans from the kept world and runs its own deferred call', () => {
  const world = new WorldState()
  HOT_RELOAD_STATION.scenarios[0].setup(world)
  const host = HOT_RELOAD_STATION.host!(world) as WandererWorld
  let runner = new PlanRunner(wandererRevADomain, world, { callterms: galleryCallterms, context: host })
  const executed: string[] = []
  const step = () => {
    const s = runner.current()!
    executed.push(fmt(s))
    host.complete(s.name, s.args)
    runner.complete()
  }
  runner.plan('run')
  while (runner.resolve() === 'ready') step() // the path request
  settle(host)
  runner.plan('run')
  runner.resolve()
  step() // !say "reload-validation-A"
  step() // the first segment
  assert.equal(runner.resolve(), 'ready')
  assert.equal(runner.current()!.name, '!walk_segment', 'mid-walk')
  const pending = runner.steps.find(s => s.kind === 'deferred')
  assert.equal(pending && fmt(pending), '&talk_about_destination', 'a rev A deferred call is pending')
  const before = wandererLocation(world)

  // The reload, as the station does it: a new runner on the same world and host; the old plan is gone.
  runner = new PlanRunner(HOT_RELOADS[0].domain!, world, { callterms: galleryCallterms, context: host })
  assert.deepEqual(runner.steps, [], 'nothing of the old plan survives')
  assert.equal(wandererLocation(world), before, 'world kept')
  const mark = executed.length
  // Plan again until the walk to (15 0) is over (a new path query from where it stood, then the segments).
  for (let i = 0; i < 4 && !executed.slice(mark).includes('!walk_segment (15 0)'); i++) {
    assert.equal(runner.plan('run'), 'succeeded')
    while (runner.resolve() === 'ready') step()
    settle(host)
  }
  const after = executed.slice(mark)
  const arrived = after.indexOf('!walk_segment (15 0)')
  assert.ok(arrived > 0, `movement resumed: ${after.join(', ')}`)
  assert.equal(after[0], '!say "reload-validation-B"')
  // The deferred call of the plan that walked there was expanded by rev B, against the world at that moment.
  assert.equal(after[arrived + 1], '!say "reload-validation-B-deferred"', after.join(', '))
  assert.ok(!after.some(s => s.includes('validation-A')), 'nothing of rev A after the reload, its pending deferred call included')
})

// What "keep the pending deferred tasks" would meet: a deferred PlanStep carries a MethodId (an index into the
// domain that planned it), not a name. Expanded against another revision, it runs whatever method has that index.
const TALKER_1 = `
(:domain Talker top_level_domain
    (:method (run) top_level_method
        (go () ((!walk) (&comment) (!rest))))
    (:method (comment)
        (say () ((!say "rev 1 comment")))))
`
const TALKER_2 = `
(:domain Talker top_level_domain
    (:method (run) top_level_method
        (go () ((!walk) (&comment) (!rest))))
    (:method (shout)
        (loud () ((!shout "rev 2 shout"))))
    (:method (comment)
        (say () ((!say "rev 2 comment")))))
`
function compile(text: string): DomainIR {
  const r = compileDomainSource('Talker.domain', text)
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
  return r.ir
}

test('hot reload: a pending deferred step carried into the new revision does not expand there; it is reported', () => {
  const rev1 = compile(TALKER_1)
  const rev2 = compile(TALKER_2)
  const world = new WorldState()
  const runner = new PlanRunner(rev1, world)
  assert.equal(runner.plan('run'), 'succeeded')
  const pending = runner.steps[1]
  assert.equal(pending.kind, 'deferred')
  if (pending.kind !== 'deferred') return
  assert.equal(pending.name, '&comment')
  const idIn2 = rev2.methods.findIndex(m => m.name === 'comment')
  assert.notEqual(pending.method, idIn2, 'the method moved in rev 2')
  assert.equal(rev2.methods[pending.method].name, 'shout', 'its index is another method in rev 2')

  // The step remembers its domain: rev 2 refuses it instead of running `shout`.
  const said: RuntimeDiagnostic[] = []
  const r = decomposeDeferred(rev2, world, pending, { onDiagnostic: d => said.push(d) })
  assert.deepEqual(r, { status: 'invalid_call', plan: [] })
  assert.deepEqual(said.map(d => d.code), ['stale_deferred_step'])
  assert.match(said[0].message, /&comment.*another domain/)
  // In its own domain it still expands.
  assert.deepEqual(decomposeDeferred(rev1, world, pending).plan.map(fmt), ['!say "rev 1 comment"'])
  // A copy (serialized, hand-built) has no domain: its name must match the method at its index.
  assert.equal(decomposeDeferred(rev2, world, { ...pending }).status, 'invalid_call', 'stale index, by name')
  const byName = decomposeDeferred(rev2, world, { ...pending, method: idIn2 })
  assert.deepEqual(byName.plan.map(fmt), ['!say "rev 2 comment"'])
})

const work = (who: string, deferred = false) =>
  compile(`(:domain Worker top_level_domain
    (:method (behave) top_level_method (go () ((!work "${who}") ${deferred ? '(&after)' : ''})))
    (:method (pad) (go () ((!pad))))
    (:method (after) (go () ((!after "${who}")))))`)

function worker(domain: DomainIR, seconds = 1) {
  const events: GuardEvent[] = []
  const agent = new GuardAgent({
    id: 'worker',
    planner: world => new PlanRunner(domain, world),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    actions: { '!work': () => timed(seconds), '!after': () => timed(seconds), '!pad': () => timed(seconds) },
    onEvent: e => events.push(e)
  })
  const starts = () => events.flatMap(e => (e.type === 'step' ? [formatTask(e.name, e.args)] : []))
  return { agent, events, starts }
}

test('hot reload on GuardAgent: keeps the world and the agent, drops the plan and the running step, plans from the new domain', () => {
  const X = work('X')
  const Y = work('Y')
  const { agent, events, starts } = worker(X, 100)
  agent.tick(0.1, [])
  assert.deepEqual(starts(), ['!work "X"'])
  agent.blackboard.world.add('kept', sym('yes'))
  const plans = agent.metrics.plansMade
  const position = { ...agent.kinematic.position }

  agent.reload(world => new PlanRunner(Y, world))
  assert.equal(agent.currentAction, '', 'the running step is gone')
  assert.deepEqual(agent.runner.steps, [], 'and so is the plan')
  const ended = events.filter(e => e.type === 'step_end')
  assert.deepEqual(ended.map(e => e.type === 'step_end' && `${e.name} ${e.status}`), ['!work cancelled'])
  assert.deepEqual(agent.blackboard.world.rows('kept', 1), [[sym('yes')]], 'world kept')
  assert.deepEqual(agent.kinematic.position, position)
  assert.equal(agent.metrics.plansMade, plans, 'history kept')

  agent.tick(0.1, [])
  assert.deepEqual(starts(), ['!work "X"', '!work "Y"'], 'replans at once, from the new domain')
  const replan = events.filter(e => e.type === 'replan').pop()
  assert.equal(replan?.type === 'replan' && replan.reason, 'reload')
  assert.equal(agent.runner.domain, Y)

  // Later candidates come from the new factory too: the old domain never comes back.
  for (let i = 0; i < 5; i++) {
    agent.requestReplan('any later trigger', true)
    agent.tick(0.1, [])
  }
  assert.ok(starts().slice(1).every(s => s === '!work "Y"'), starts().join(', '))
  assert.equal(agent.runner.domain, Y)
})

test('hot reload on GuardAgent: a pending deferred step of the old domain never expands against the new one', () => {
  // Rev 1 plans (!walk) (&comment) (!rest); in rev 2 the index of `comment` is `shout`'s.
  const rev1 = compile(TALKER_1)
  const rev2 = compile(TALKER_2)
  const events: GuardEvent[] = []
  const agent = new GuardAgent({
    id: 'talker',
    topLevel: 'run',
    planner: world => new PlanRunner(rev1, world),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    actions: { '!walk': () => timed(1), '!rest': () => timed(1), '!say': () => timed(0.1), '!shout': () => timed(0.1) },
    onEvent: e => events.push(e)
  })
  const starts = () => events.flatMap(e => (e.type === 'step' ? [formatTask(e.name, e.args)] : []))
  agent.tick(0.1, [])
  assert.equal(agent.currentAction, '!walk')
  assert.ok(agent.runner.steps.some(s => s.kind === 'deferred'), 'a rev 1 deferred call is pending')

  agent.reload(world => new PlanRunner(rev2, world))
  for (let i = 0; i < 40; i++) agent.tick(0.1, [])
  const after = starts().slice(1)
  assert.ok(!after.some(s => s.startsWith('!shout')), `no wrong method: ${after.join(', ')}`)
  assert.ok(after.includes('!say "rev 2 comment"'), after.join(', '))
  assert.ok(!after.includes('!say "rev 1 comment"'))
})

test('hot reload on GuardAgent: a reload mid-step drops it; the new domain plans the walk again and runs its own deferred call', () => {
  const X = work('X', true)
  const Y = work('Y', true)
  const { agent, starts } = worker(X)
  agent.tick(0.1, [])
  agent.reload(world => new PlanRunner(Y, world))
  for (let i = 0; i < 25; i++) agent.tick(0.1, [])
  assert.deepEqual(starts().slice(0, 3), ['!work "X"', '!work "Y"', '!after "Y"'])
})
