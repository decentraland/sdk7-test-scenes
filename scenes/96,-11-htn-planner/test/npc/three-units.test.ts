// Upstream docs/USE_CASES.md pattern 1 (lines 11-43): three planning units on one world. `reasoning` updates beliefs,
// `active_plan` checks the running plan against facts the host publishes about the running step, `behave` plans the
// actions. Expected flow (USE_CASES.md:42): plan an attack on A, preserve progress while A remains valid, then lose
// A, fail validation, cancel the attack and plan a search. Pitfall (USE_CASES.md:33): an unconditional fallback in
// `active_plan` accepts an invalid plan.
//
// First with bare PlanRunners and a small host loop (what upstream describes), then on GuardAgent: `activePlan` runs
// the check in its own runner every tick and cancels on a failure (register row H3); `reasoning` rides on `syncFacts`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatTask, sym, vec3, type Atom } from '../../src/htn-planner/htn/atom'
import type { DomainIR } from '../../src/htn-planner/htn/ir'
import { PlanRunner, type CallTerm } from '../../src/htn-planner/htn/planner'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import { timed, type ActionFactory, type GuardEvent } from '../../src/htn-planner/npc/actions'
import { GuardAgent, RUNNING_FACT, runningRow, type PlannerFactory } from '../../src/htn-planner/npc/agent'
import { agentHistory } from '../../src/htn-planner/npc/history'
import { historyRows } from '../../src/debugger/history-rows'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import { PlanBudget } from '../../src/htn-planner/npc/plan-budget'
import { compileDomainSource } from '../../tools/htn/compiler'

const SENTRY = `
(:domain Sentry top_level_domain
    // Beliefs. The callterms only queue the updates: the host applies them after the decomposition
    // (MISSING_CALLTERMS.md:115-121, never delete facts while decomposing).
    (:method (reasoning) top_level_method
        (spot (and (seen ?t ?p) (call note_threat ?t ?p)) ())
        (lose (and (threat ?t) (not (seen ?t ?any_p)) (call note_lost ?t)) ())
        (quiet () ()))

    (:method (behave) top_level_method
        (attack (and (threat ?t)) ((!attack ?t)))
        (search (and (last_known ?any_t ?p)) ((!search ?p)))
        (idle () ((!idle))))

    // Is the running step still valid? Facts about it come from the host: (running <action> <argument>).
    (:method (active_plan) top_level_method
        (attack_valid (and (running attack ?t) (threat ?t)) ())
        (search_valid (and (running search ?any_p) (not (threat ?any_t))) ())
        (idle_valid (and (running idle) (not (threat ?any_t)) (not (last_known ?any_k ?any_q))) ())
        @FALLBACK@))
`

function compile(fallback: boolean): DomainIR {
  const text = SENTRY.replace('@FALLBACK@', fallback ? '(accept_anything () ())' : '')
  const r = compileDomainSource('Sentry.domain', text)
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
  return r.ir
}

const STRICT = compile(false)
const WITH_FALLBACK = compile(true)

/** The belief updates `reasoning` queued; applied by the host once the decomposition has returned. */
type Update = (w: WorldState) => void
function beliefCallterms(queue: Update[]): Record<string, CallTerm> {
  return {
    note_threat: ([t, p]) => {
      queue.push(w => {
        w.set('threat', t)
        w.set('last_known', t, p)
      })
      return { t: 'bool', v: true }
    },
    note_lost: () => {
      queue.push(w => w.clear('threat', 1))
      return { t: 'bool', v: true }
    }
  }
}

/**
 * The host publishes the running step as `(running <action> <arguments>...)`: the domain cannot see the runner.
 * The same row GuardAgent writes (`runningRow`); the sentry's steps have at most one argument.
 */
function publishRunning(world: WorldState, step: { name: string; args: readonly Atom[] } | null) {
  world.clear(RUNNING_FACT, 1)
  world.clear(RUNNING_FACT, 2)
  if (step) world.add(RUNNING_FACT, ...runningRow(step))
}

const A = sym('A')

/**
 * The host of USE_CASES.md:16-26 on bare PlanRunners: refresh → reasoning → (no plan: behave) / (plan: active_plan →
 * continue, or cancel → behave). Three runners, one world, one set of callterms; steps are timed (seconds).
 */
function threeUnitHost(domain: DomainIR) {
  const world = new WorldState()
  const queue: Update[] = []
  const options = { callterms: beliefCallterms(queue) }
  const reasoning = new PlanRunner(domain, world, { ...options, defaultTopLevel: 'reasoning' })
  const validate = new PlanRunner(domain, world, { ...options, defaultTopLevel: 'active_plan' })
  const behave = new PlanRunner(domain, world, { ...options, defaultTopLevel: 'behave' })
  const log: string[] = []
  let progress = 0
  const seconds: Record<string, number> = { '!attack': 3, '!search': 2, '!idle': 1 }
  return {
    world,
    reasoning,
    validate,
    behave,
    log,
    progress: () => progress,
    tick(dt: number) {
      // reasoning: its callterms queue belief updates, applied after it returns.
      queue.length = 0
      const r = reasoning.plan()
      assert.equal(r, 'succeeded', 'reasoning has a quiet branch')
      assert.deepEqual(reasoning.steps, [], 'reasoning works through callterms, it emits no actions')
      for (const u of queue) u(world)
      // A running plan: ask active_plan; otherwise behave.
      if (behave.current() !== null) {
        publishRunning(world, behave.current())
        if (validate.plan() !== 'succeeded') {
          log.push(`cancel ${formatTask(behave.current()!.name, behave.current()!.args)}`)
          behave.clear()
          progress = 0
        }
      }
      if (behave.current() === null) {
        assert.equal(behave.plan(), 'succeeded')
        assert.equal(behave.resolve(), 'ready')
        const s = behave.current()!
        log.push(`start ${formatTask(s.name, s.args)}`)
        progress = 0
      }
      const s = behave.current()!
      progress += dt
      if (progress >= seconds[s.name] - 1e-6) {
        log.push(`done ${formatTask(s.name, s.args)}`)
        behave.complete()
        publishRunning(world, null)
        progress = 0
      }
    }
  }
}

test('USE_CASES 1 on PlanRunners: attack A while it stays valid, lose A, validation fails, cancel, search', () => {
  const h = threeUnitHost(STRICT)
  h.world.set('seen', A, vec3(4, 0, 2))
  h.tick(0.5) // reasoning selects A; no plan yet → behave
  assert.deepEqual(h.log, ['start !attack A'])
  h.tick(0.5)
  h.tick(0.5)
  assert.deepEqual(h.log, ['start !attack A'], 'active_plan accepts: no restart')
  assert.equal(h.progress(), 1.5, 'progress preserved across three planning cycles')

  // A leaves sight: reasoning drops the threat (keeps last_known), active_plan finds no branch.
  h.world.clear('seen', 2)
  h.tick(0.5)
  assert.deepEqual(h.log, ['start !attack A', 'cancel !attack A', 'start !search (4.0 0.0 2.0)'])
  assert.equal(h.world.rows('threat', 1).length, 0)
  h.tick(0.5)
  h.tick(0.5)
  h.tick(0.5)
  h.tick(0.5)
  assert.deepEqual(h.log.slice(3), ['done !search (4.0 0.0 2.0)', 'start !search (4.0 0.0 2.0)'], 'search_valid keeps the search')
})

test('USE_CASES 1 pitfall: an unconditional fallback in active_plan accepts the attack on a lost target', () => {
  const h = threeUnitHost(WITH_FALLBACK)
  h.world.set('seen', A, vec3(4, 0, 2))
  h.tick(0.5)
  h.world.clear('seen', 2)
  h.tick(0.5)
  h.tick(0.5)
  assert.equal(h.world.rows('threat', 1).length, 0, 'reasoning did drop the threat')
  assert.deepEqual(h.log, ['start !attack A'], 'yet the attack goes on')
  h.tick(1.5)
  h.tick(0.5)
  assert.deepEqual(h.log, ['start !attack A', 'done !attack A', 'start !search (4.0 0.0 2.0)'], 'it runs to its end')
  // The same world without the fallback: the attack is invalid.
  publishRunning(h.world, { name: '!attack', args: [A] })
  assert.equal(h.validate.plan(), 'succeeded')
  assert.equal(new PlanRunner(STRICT, h.world, { defaultTopLevel: 'active_plan' }).plan(), 'no_plan')
})

test('USE_CASES 1: validation must run in its own unit; planning active_plan into the behave unit wipes the running plan', () => {
  const h = threeUnitHost(STRICT)
  h.world.set('seen', A, vec3(4, 0, 2))
  h.tick(0.5)
  const running = h.behave.steps.map(s => formatTask(s.name, s.args))
  assert.deepEqual(running, ['!attack A'])
  // Its own unit: the behave unit's plan, cursor and the host's progress are untouched.
  publishRunning(h.world, h.behave.current())
  assert.equal(h.validate.plan(), 'succeeded')
  assert.deepEqual(h.behave.steps.map(s => formatTask(s.name, s.args)), running)
  // The same check planned into the behave unit: a successful, empty result replaces the plan
  // (USE_CASES.md:58-59, "decomposition replaces that unit's result").
  assert.equal(h.behave.plan('active_plan'), 'succeeded')
  assert.deepEqual(h.behave.steps, [])
  assert.equal(h.behave.current(), null)
})


// ---- the same on GuardAgent ------------------------------------------------------------------------------------

/** A timed step that records its progress, so a restart would show. */
function recording(seconds: number, progress: Map<string, number>): ActionFactory {
  return args => {
    const key = formatTask('', args).trim()
    progress.set(key, 0)
    return timed(seconds, (_dt, elapsed) => progress.set(key, elapsed))
  }
}

type Replan = Extract<GuardEvent, { type: 'replan' }>
type Check = Extract<GuardEvent, { type: 'check' }>
type Diagnostic = Extract<GuardEvent, { type: 'diagnostic' }>

/**
 * GuardAgent plans `behave` (`topLevel`) and checks the running step with `active_plan` (`activePlan`, its own runner
 * on the agent's world, every tick a step runs; the agent publishes `(running ...)`). `reasoning` is an extra runner
 * run from `syncFacts`, before the agent checks or plans.
 */
function sentryAgent(domain: DomainIR, activePlan = 'active_plan', planBudget?: PlanBudget, beforeTick?: () => void) {
  const queue: Update[] = []
  const callterms = beliefCallterms(queue)
  const events: GuardEvent[] = []
  const progress = new Map<string, number>()
  const history = agentHistory(512)
  let seen: Atom | null = null
  let reasoning: PlanRunner | undefined
  const planner = (d: DomainIR): PlannerFactory => world => new PlanRunner(d, world, { callterms })
  const agent: GuardAgent = new GuardAgent({
    id: 'sentry',
    planner: planner(domain),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    topLevel: 'behave',
    activePlan,
    planBudget,
    actions: { '!attack': recording(3, progress), '!search': recording(2, progress), '!idle': recording(1, progress) },
    onEvent: e => events.push(e),
    history,
    syncFacts: a => {
      const world = a.blackboard.world
      reasoning ??= new PlanRunner(domain, world, { callterms, defaultTopLevel: 'reasoning' })
      world.clear('seen', 2)
      if (seen) world.add('seen', A, seen)
      queue.length = 0
      reasoning.plan()
      for (const u of queue) u(world)
      return '' // nothing for the agent's own fact-change trigger
    }
  })
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.1) {
      beforeTick?.()
      agent.tick(0.1, [])
    }
  }
  const of = <T extends GuardEvent['type']>(type: T) => events.filter((e): e is Extract<GuardEvent, { type: T }> => e.type === type)
  return {
    agent,
    progress,
    run,
    history,
    reload: (d: DomainIR) => agent.reload(planner(d)),
    starts: () => of('step').map(e => formatTask(e.name, e.args)),
    ends: () => of('step_end').map(e => `${e.name} ${e.status}`),
    replans: (): Replan[] => of('replan'),
    checks: (): Check[] => of('check'),
    diagnostics: (): Diagnostic[] => of('diagnostic'),
    see: (p: Atom | null) => (seen = p),
    running: () => [1, 2].flatMap(n => agent.blackboard.world.rows(RUNNING_FACT, n).map(r => formatTask('', r).trim()))
  }
}

const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-6

test('activePlan on GuardAgent: the check passes on every tick, the attack goes on with its progress', () => {
  const s = sentryAgent(STRICT)
  s.see(vec3(4, 0, 2))
  s.run(2)
  assert.deepEqual(s.starts(), ['!attack A'])
  assert.ok(near(s.progress.get('A'), 1.9), `progress ${s.progress.get('A')}: never restarted`)
  assert.deepEqual(s.running(), ['attack A'], 'the agent publishes the running step')
  assert.ok(s.agent.metrics.checksMade >= 19, `checked on every tick the attack ran: ${s.agent.metrics.checksMade}`)
  assert.equal(s.agent.metrics.plansMade, 1, 'a check is not a plan')
  assert.deepEqual(s.checks(), [], 'a passed check is not an event')
  assert.deepEqual(s.diagnostics(), [])
})

test('activePlan on GuardAgent: a failed check cancels the attack once and plans a search', () => {
  const s = sentryAgent(STRICT)
  s.see(vec3(4, 0, 2))
  s.run(1)
  s.see(null)
  s.run(0.1)
  assert.deepEqual(s.starts(), ['!attack A', '!search (4.0 0.0 2.0)'])
  assert.deepEqual(s.ends(), ['!attack cancelled'])
  const [check] = s.checks()
  assert.deepEqual({ method: check.method, step: check.step, status: check.status }, { method: 'active_plan', step: '!attack A', status: 'no_plan' })
  const replan = s.replans().pop()!
  assert.equal(replan.reason, 'active_plan failed')
  assert.equal(replan.kept, false)
  assert.deepEqual(s.running(), ['search (4.0 0.0 2.0)'])
  // search_valid holds: no more checks fail, no replan loop.
  const replans = s.replans().length
  s.run(1.5)
  assert.equal(s.checks().length, 1)
  assert.equal(s.replans().length, replans, 'no replan while the search runs')
  assert.deepEqual(s.ends(), ['!attack cancelled'])
})

test('activePlan on GuardAgent: the check and the cancel are in the History tab', () => {
  const s = sentryAgent(STRICT)
  s.see(vec3(4, 0, 2))
  s.run(1)
  s.see(null)
  s.run(0.1)
  const rows = historyRows(s.history.toArray(), [])
  const kinds = rows.map(r => r.kind).reverse()
  const at = kinds.indexOf('check')
  assert.ok(at > 0, kinds.join(' '))
  assert.deepEqual(kinds.slice(at, at + 4), ['check', 'cancelled', 'replan', 'step'])
  assert.equal(rows.find(r => r.kind === 'check')!.text, 'active_plan rejects !attack A (no_plan): cancel')
})

test('activePlan on GuardAgent bypasses the candidate check: a check stricter than behave restarts the step once', () => {
  // active_plan is stricter than behave: the attack is valid only in range. The check fails, the agent cancels without
  // asking whether the candidate is equivalent (H2), behave plans the same attack from zero (as upstream,
  // USE_CASES.md:25). Upstream would then cancel again on every update; the agent says the two methods disagree and
  // does not check that step again, so it restarts once per step, not once per tick.
  const strict = compileDomainSource(
    'Sentry.domain',
    SENTRY.replace('(attack_valid (and (running attack ?t) (threat ?t)) ())', '(attack_valid (and (running attack ?t) (threat ?t) (in_range ?t)) ())').replace('@FALLBACK@', '')
  )
  assert.ok(strict.ok)
  const s = sentryAgent(strict.ir)
  s.see(vec3(4, 0, 2))
  s.run(2)
  assert.deepEqual(s.starts(), ['!attack A', '!attack A'], 'restarted once')
  assert.deepEqual(s.ends(), ['!attack cancelled'])
  assert.equal(s.checks().length, 1)
  assert.equal(s.replans().length, 2, 'the start and the one forced replan')
  assert.ok(s.replans()[1].reason === 'active_plan failed' && !s.replans()[1].kept)
  assert.deepEqual(s.diagnostics().map(d => d.code), ['active_plan_conflict'])
  assert.match(s.diagnostics()[0].message, /behave plans !attack A again/)
  assert.ok(near(s.progress.get('A'), 1.8), `progress ${s.progress.get('A')}: the second attack ran on`)
  // The next attack (after this one ends) is checked again, and restarted once more: once per step, still one diagnostic.
  s.run(2)
  assert.deepEqual(s.ends(), ['!attack cancelled', '!attack done', '!attack cancelled'])
  assert.equal(s.diagnostics().length, 1)
})

test('activePlan on GuardAgent: a trigger replan still keeps an equivalent candidate (H2)', () => {
  const s = sentryAgent(STRICT)
  s.see(vec3(4, 0, 2))
  s.run(1)
  s.agent.requestReplan('ask again')
  s.run(0.5)
  const replan = s.replans().pop()!
  assert.equal(replan.reason, 'ask again')
  assert.equal(replan.kept, true)
  assert.deepEqual(s.starts(), ['!attack A'])
  assert.ok(near(s.progress.get('A'), 1.4), `progress ${s.progress.get('A')}`)
})

test('activePlan pitfall on GuardAgent: a fallback branch is a diagnostic, and the attack on a lost target runs to its end', () => {
  const s = sentryAgent(WITH_FALLBACK)
  s.see(vec3(4, 0, 2))
  s.run(1)
  s.see(null)
  s.run(2.5)
  assert.deepEqual(s.ends().slice(0, 1), ['!attack done'])
  assert.deepEqual(s.starts().slice(0, 2), ['!attack A', '!search (4.0 0.0 2.0)'])
  assert.deepEqual(s.checks(), [])
  const d = s.diagnostics()
  assert.deepEqual(d.map(x => x.code), ['active_plan_fallback'])
  assert.match(d[0].message, /active_plan.*accept_anything.*accepts any running step/)
})

test('activePlan pitfall: the agent and the compiler (checkMethods) report the same branches, by one rule', () => {
  // `(and)` always holds and `!idle` cannot fail: both branches accept any running step, not only `()` with no tasks.
  const text = SENTRY.replace('@FALLBACK@', '(always (and) ((!idle)))\n        (accept_anything () ())')
  const compiled = compileDomainSource('Sentry.domain', text, { checkMethods: ['active_plan'] })
  assert.ok(compiled.ok)
  const warned = compiled.diagnostics.map(d => [d.code, /branch '(\w+)'/.exec(d.message)?.[1]])
  assert.deepEqual(warned, [['check-method-fallback', 'always'], ['check-method-fallback', 'accept_anything']])
  const s = sentryAgent(compiled.ir)
  s.see(vec3(4, 0, 2))
  s.run(1)
  const reported = s.diagnostics().map(d => [d.code, /branch '(\w+)'/.exec(d.message)?.[1]])
  assert.deepEqual(reported, [['active_plan_fallback', 'always'], ['active_plan_fallback', 'accept_anything']])
})

test('activePlan on GuardAgent: a method the domain lacks is a diagnostic, no check, no cancel', () => {
  const s = sentryAgent(STRICT, 'validate')
  s.see(vec3(4, 0, 2))
  s.run(1)
  s.see(null)
  s.run(2.5)
  assert.deepEqual(s.ends().slice(0, 1), ['!attack done'])
  assert.deepEqual(s.checks(), [])
  assert.deepEqual(s.diagnostics().map(d => d.code), ['active_plan_invalid'])
  assert.match(s.diagnostics()[0].message, /'validate' is not a top-level method of domain 'Sentry'/)
  assert.equal(s.agent.metrics.checksMade, 0)
})

test('activePlan on GuardAgent survives a reload: the new domain checks, the running fact is dropped with the plan', () => {
  const s = sentryAgent(WITH_FALLBACK)
  s.see(vec3(4, 0, 2))
  s.run(1)
  assert.deepEqual(s.running(), ['attack A'])
  s.reload(STRICT)
  assert.deepEqual(s.running(), [], 'the step was cancelled, its fact goes with it')
  s.run(0.5)
  assert.deepEqual(s.starts(), ['!attack A', '!attack A'], 'replanned from the new domain')
  s.see(null)
  s.run(0.1)
  assert.deepEqual(s.starts().slice(2), ['!search (4.0 0.0 2.0)'], 'the new domain has no fallback: the check fails')
  assert.equal(s.checks().length, 1)
  assert.deepEqual(s.ends(), ['!attack cancelled', '!attack cancelled'])
  assert.deepEqual(s.diagnostics().map(d => d.code), ['active_plan_fallback'], 'said once, for the old domain')
})

test('activePlan on GuardAgent: a failed check whose replan finds nothing retries every tick, unchecked, then attacks again (H7)', () => {
  // behave without search and idle: with no threat there is no plan.
  const ATTACK_ONLY = (() => {
    const text = SENTRY.replace('@FALLBACK@', '')
      .replace('(search (and (last_known ?any_t ?p)) ((!search ?p)))', '')
      .replace('(idle () ((!idle))))', ')')
    const r = compileDomainSource('Sentry.domain', text)
    assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
    return r.ir
  })()
  const s = sentryAgent(ATTACK_ONLY)
  s.run(0.3)
  assert.deepEqual(s.replans().map(r => r.reason), ['start', 'retry after no_plan', 'retry after no_plan'], 'nothing to attack: a retry per tick')
  s.see(vec3(4, 0, 2))
  s.run(0.1)
  assert.deepEqual(s.starts(), ['!attack A'], 'the retry on the next tick finds the threat')
  s.run(0.5)
  s.see(null)
  s.run(0.1)
  assert.deepEqual(s.ends(), ['!attack cancelled'])
  assert.deepEqual(s.replans().slice(-1).map(r => [r.reason, r.status]), [['active_plan failed', 'no_plan']])
  const checks = s.agent.metrics.checksMade
  const replans = s.replans().length
  s.run(0.3)
  assert.equal(s.replans().length, replans + 3, 'one retry per tick')
  assert.equal(s.agent.metrics.checksMade, checks, 'no step runs: nothing to check')
  assert.equal(s.checks().length, 1)
  assert.deepEqual(s.running(), [])
  s.see(vec3(1, 0, 1))
  s.run(0.1)
  assert.deepEqual(s.starts(), ['!attack A', '!attack A'])
  assert.deepEqual(s.diagnostics(), [])
})

test('without activePlan the agent publishes no running step and checks nothing', () => {
  const agent = new GuardAgent({
    id: 'plain',
    planner: world => new PlanRunner(STRICT, world, { callterms: beliefCallterms([]) }),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    actions: { '!idle': () => timed(1) }
  })
  for (let i = 0; i < 5; i++) agent.tick(0.1, [])
  assert.equal(agent.currentAction, '!idle')
  assert.equal(agent.blackboard.world.rows(RUNNING_FACT, 1).length, 0)
  assert.equal(agent.metrics.checksMade, 0)
})

test('activePlan with a shared plan budget: a failed check cancels at once, the replan waits for budget, the conflict is still seen', () => {
  const strict = compileDomainSource(
    'Sentry.domain',
    SENTRY.replace('(attack_valid (and (running attack ?t) (threat ?t)) ())', '(attack_valid (and (running attack ?t) (threat ?t) (in_range ?t)) ())').replace('@FALLBACK@', '')
  )
  assert.ok(strict.ok)
  const budget = new PlanBudget({ maxPlansPerFrame: 1 })
  const other = {}
  let hog = false
  // Another planner asks first in every frame while `hog` is on.
  const s = sentryAgent(strict.ir, 'active_plan', budget, () => {
    budget.beginFrame()
    if (hog) budget.tryRun(other, false, () => {})
  })
  s.see(vec3(4, 0, 2))
  s.run(0.1)
  assert.deepEqual(s.starts(), ['!attack A'])
  hog = true
  s.run(0.1) // the check fails; the other planner has the frame's run
  assert.deepEqual(s.ends(), ['!attack cancelled'])
  assert.equal(s.agent.currentAction, '', 'no step while the replan waits')
  assert.equal(s.agent.metrics.budgetDeferred, 1)
  s.run(0.1) // its request was refused last frame: it has this frame's slot
  assert.deepEqual(s.starts(), ['!attack A', '!attack A'])
  assert.ok(s.replans()[1].reason === 'active_plan failed' && !s.replans()[1].kept)
  assert.deepEqual(s.diagnostics().map(d => d.code), ['active_plan_conflict'], 'the rejected plan survives the wait')
  assert.equal(s.agent.metrics.budgetMaxWaitFrames, 1)
})
