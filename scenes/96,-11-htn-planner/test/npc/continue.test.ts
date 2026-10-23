// The continue convention on GuardAgent (GuardAgentOptions.continueTask; Killzone 2 / Decima continue branches,
// docs/htn-guidance.md, Replanning §2.1, §2.3): a replan whose plan is only the continue
// task keeps the running plan and its running step; `!begin_plan` / `!end_plan` write and clear the
// `(active_plan <name> <args>...)` fact; the running step is published as `(running <action> <args>...)`. Off by
// default: then `!continue` and the markers are ordinary primitives with no executor (upstream DOMAIN_LANGUAGE).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatTask, sym } from '../../src/htn-planner/htn/atom'
import type { DomainIR } from '../../src/htn-planner/htn/ir'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { timed, type ActionFactory, type GuardEvent } from '../../src/htn-planner/npc/actions'
import { ACTIVE_PLAN_FACT, GuardAgent, RUNNING_FACT, type GuardAgentOptions } from '../../src/htn-planner/npc/agent'
import { agentHistory } from '../../src/htn-planner/npc/history'
import { historyRows, replanOutcome } from '../../src/debugger/history-rows'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import { compileDomainSource } from '../../tools/htn/compiler'

// A turret: attacks the first threat in its list; a continue branch keeps the running attack while its target is
// still a threat, even when another threat is listed first. `(threat ?t)` rows come from the test (syncFacts).
const TURRET = `
(:domain Turret top_level_domain
    (:method (behave) top_level_method
        (continue_attack (and (active_plan attack ?t) (threat ?t)) ((!continue)))
        (attack (and (threat ?t)) ((!begin_plan attack ?t) (!aim ?t) (!attack ?t) (!end_plan)))
        @IDLE@))
`

function compile(text: string): DomainIR {
  const r = compileDomainSource('Turret.domain', text)
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
  return r.ir
}

const DOMAIN = compile(TURRET.replace('@IDLE@', '(idle () ((!idle)))'))

/** A timed step that records its progress, so a restart would show. */
function recording(seconds: number, progress: Map<string, number>): ActionFactory {
  return args => {
    const key = formatTask('', args).trim()
    progress.set(key, 0)
    return timed(seconds, (_dt, elapsed) => progress.set(key, elapsed))
  }
}

function turret(extra: Partial<GuardAgentOptions> = {}, domain = DOMAIN) {
  const events: GuardEvent[] = []
  const progress = new Map<string, number>()
  const history = agentHistory(512)
  let threats: string[] = []
  const agent = new GuardAgent({
    id: 'turret',
    planner: world => new PlanRunner(domain, world),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    actions: { '!aim': () => timed(0.2), '!attack': recording(3, progress), '!idle': () => timed(1) },
    onEvent: e => events.push(e),
    history,
    syncFacts: a => {
      const world = a.blackboard.world
      world.clear('threat', 1)
      for (const t of threats) world.add('threat', sym(t))
      return threats.join(',')
    },
    ...extra
  })
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.1) agent.tick(0.1, [])
  }
  const of = <T extends GuardEvent['type']>(type: T) => events.filter((e): e is Extract<GuardEvent, { type: T }> => e.type === type)
  const rows = (fact: string) => [0, 1, 2, 3].flatMap(n => agent.blackboard.world.rows(fact, n).map(r => formatTask('', r).trim()))
  return {
    agent,
    progress,
    history,
    run,
    threats: (...ids: string[]) => (threats = ids),
    starts: () => of('step').map(e => formatTask(e.name, e.args)),
    ends: () => of('step_end').map(e => `${e.name} ${e.status}`),
    replans: () => of('replan'),
    diagnostics: () => of('diagnostic'),
    activePlan: () => rows(ACTIVE_PLAN_FACT),
    running: () => rows(RUNNING_FACT)
  }
}

const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-6

test('continue: a replan that plans only the continue task keeps the running plan and its step, with its progress', () => {
  const s = turret({ continueTask: '!continue' })
  s.threats('A')
  s.run(1)
  assert.deepEqual(s.starts(), ['!begin_plan attack A', '!aim A', '!attack A'])
  assert.deepEqual(s.activePlan(), ['attack A'], '!begin_plan wrote the active plan')
  s.threats('B', 'A') // B is listed first now: without the continue branch the turret would switch
  s.run(1)
  assert.deepEqual(s.starts(), ['!begin_plan attack A', '!aim A', '!attack A'], 'no new step started, none restarted')
  assert.deepEqual(s.ends().filter(e => e.endsWith('cancelled')), [])
  assert.ok(near(s.progress.get('A'), 1.7), `progress ${s.progress.get('A')}: never restarted`)
  const last = s.replans().slice(-1)[0]
  assert.equal(last.trigger, 'facts')
  assert.equal(last.kept, true)
  assert.equal(last.continued, true)
  assert.equal(last.changed, false)
  assert.deepEqual(last.plan, ['!attack A', '!end_plan'], 'the plan it goes on with, not (!continue)')
  assert.equal(s.agent.metrics.continued, 1)
  assert.deepEqual(s.diagnostics(), [])
})

test('continue: when the continue branch no longer holds, the next plan replaces the running one and its active plan', () => {
  const s = turret({ continueTask: '!continue' })
  s.threats('A')
  s.run(1)
  s.threats('B') // A is gone
  s.run(0.5)
  assert.deepEqual(s.starts().slice(3), ['!begin_plan attack B', '!aim B', '!attack B'])
  assert.deepEqual(s.ends().filter(e => e.endsWith('cancelled')), ['!attack cancelled'])
  assert.deepEqual(s.activePlan(), ['attack B'])
  assert.equal(s.replans().slice(-1)[0].continued, undefined)
})

test('continue: !end_plan clears the active plan; a plan that ends without one clears it too', () => {
  const s = turret({ continueTask: '!continue' })
  s.threats('A')
  s.run(3.5) // aim 0.2 + attack 3: done, !end_plan, a new plan begins
  assert.ok(s.starts().includes('!end_plan'))
  assert.deepEqual(s.activePlan(), ['attack A'], 'the next attack plan began again')
  s.threats()
  s.run(0.3)
  assert.deepEqual(s.activePlan(), [], 'the attack was cut by idle: its active plan goes with it')

  const noEnd = compile(TURRET.replace('(!end_plan)', '').replace('@IDLE@', '(idle () ((!idle)))'))
  const t = turret({ continueTask: '!continue' }, noEnd)
  t.threats('A')
  t.run(1)
  assert.deepEqual(t.activePlan(), ['attack A'])
  t.run(2.5) // the attack plan completes with no !end_plan: the replan that follows starts from no active plan
  const completed = t.replans().find(r => r.trigger === 'plan_done')!
  assert.deepEqual(completed.plan.slice(0, 1), ['!begin_plan attack A'], 'a new plan, not (!continue): the fact was dropped with the plan')
})

test('continue: the running step is published as (running ...) without activePlan, and dropped with the step', () => {
  const s = turret({ continueTask: '!continue' })
  s.threats('A')
  s.run(0.5)
  assert.deepEqual(s.running(), ['attack A'])
  s.agent.stop()
  assert.deepEqual(s.running(), [])
  assert.deepEqual(s.activePlan(), [], 'stop drops the plan and its active plan')
})

test('continue: a reload drops the active plan with the plan', () => {
  const s = turret({ continueTask: '!continue' })
  s.threats('A')
  s.run(1)
  s.agent.reload(world => new PlanRunner(DOMAIN, world))
  assert.deepEqual(s.activePlan(), [])
  s.run(0.1)
  assert.deepEqual(s.starts().slice(3), ['!begin_plan attack A', '!aim A'], 'replanned from scratch')
})

test('continue with no running plan: the continue task idles one tick, said once, never an error', () => {
  // A careless continue branch: it does not ask for an active plan, so it holds before any plan ran.
  const careless = compile(`
(:domain Careless top_level_domain
    (:method (behave) top_level_method
        (continue_attack (and (threat ?any_t)) ((!continue)))
        (idle () ((!idle)))))
`)
  const s = turret({ continueTask: '!continue' }, careless)
  s.threats('A')
  s.run(0.3)
  assert.deepEqual(s.starts(), ['!continue', '!continue', '!continue'], 'one tick each, then the plan is done and replans')
  assert.deepEqual(s.replans().map(r => [r.trigger, r.plan.join(' '), r.continued]), [
    ['start', '!continue', undefined],
    ['plan_done', '!continue', undefined],
    ['plan_done', '!continue', undefined]
  ])
  assert.deepEqual(s.diagnostics().map(d => d.code), ['continue_idle'])
  assert.match(s.diagnostics()[0].message, /no running plan/)
  assert.equal(s.agent.metrics.continued, 0)
})

test('continue inside a longer plan keeps nothing: the step idles one tick', () => {
  const longer = compile(`
(:domain Longer top_level_domain
    (:method (behave) top_level_method
        (both () ((!continue) (!idle)))))
`)
  const s = turret({ continueTask: '!continue' }, longer)
  s.run(0.3)
  assert.deepEqual(s.starts(), ['!continue', '!idle'])
  assert.deepEqual(s.diagnostics().map(d => d.code), ['continue_idle'])
  assert.match(s.diagnostics()[0].message, /not the only step/)
})

test('continue is off by default: !continue and the markers are steps with no executor, no fact is written', () => {
  const s = turret()
  s.threats('A')
  s.run(1)
  assert.deepEqual(s.activePlan(), [], 'no marker executor')
  assert.deepEqual(s.running(), [], 'no running fact without activePlan or continueTask')
  assert.deepEqual(s.diagnostics().map(d => d.code), ['no_executor'], '!begin_plan: a 0.05 s no-op')
  assert.match(s.diagnostics()[0].message, /no executor for !begin_plan/)
  assert.equal(s.agent.metrics.continued, 0)
})

test('continue is off by default: a plan that is only !continue replaces the running plan like any other', () => {
  const swap = compile(`
(:domain Swap top_level_domain
    (:method (behave) top_level_method
        (continue_when_told (and (told ?any)) ((!continue)))
        (idle () ((!idle)))))
`)
  let told = false
  const s = turret({ syncFacts: a => (a.blackboard.world.clear('told', 1), told && a.blackboard.world.add('told', sym('yes')), String(told)) }, swap)
  s.run(0.5)
  told = true
  s.run(0.2)
  assert.deepEqual(s.ends().filter(e => e.endsWith('cancelled')), ['!idle cancelled'], 'the running step is cut')
  assert.deepEqual(s.starts().slice(-1), ['!continue'])
  assert.equal(s.replans().some(r => r.continued), false)
})

test('continue: the history and the timeline say the running plan was continued', () => {
  const s = turret({ continueTask: '!continue' })
  s.threats('A')
  s.run(1)
  s.threats('B', 'A')
  s.run(0.2)
  const last = s.replans().slice(-1)[0]
  assert.equal(replanOutcome(last), 'running plan continued')
  const rows = historyRows(s.history.toArray(), [])
  assert.ok(rows.some(r => r.kind === 'kept' && /running plan continued/.test(r.text)), rows.map(r => r.text).join('\n'))
})
