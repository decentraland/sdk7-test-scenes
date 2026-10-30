import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileDomainSource } from '../../tools/htn/compiler'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import type { GuardEvent, ActionFactory } from '../../src/htn-planner/npc/actions'

function compiled(source: string) {
  const r = compileDomainSource('CandidateConflict.domain', source)
  assert.ok(r.ok, r.diagnostics.map(d => d.message).join('\n'))
  return r.ir
}
function deferredCase(
  kind: 'deferred' | 'top-no-plan' | 'valid-empty',
  remove = true,
  onNoPlan: 'keep' | 'cancel' = 'keep',
  stopDuringResolve = false
) {
  const domain = kind === 'top-no-plan' ? compiled(`(:domain TopCandidate top_level_domain
    (:method (behave) top_level_method (walk (and (allowed)) ((!move_to (100.0 0.0 0.0) walk)))))`)
    : compiled(`(:domain DeferredCandidate top_level_domain
    (:method (behave) top_level_method (route () ((&next))))
    (:method (next)
      (walk (and (allowed)) ((!move_to (100.0 0.0 0.0) walk)))
      ${kind === 'valid-empty' ? '(empty () ())' : ''}))`)
  let allowed = true
  const events: GuardEvent[] = []
  const a = new GuardAgent({
    id: kind,
    planner: world => {
      const r = new PlanRunner(domain, world)
      if (stopDuringResolve) {
        const resolve = r.resolve.bind(r)
        r.resolve = () => {
          const result = resolve()
          if (result === 'failed') a.stop()
          return result
        }
      }
      return r
    },
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    onNoPlan,
    onEvent: e => events.push(e),
    syncFacts: a => {
      a.blackboard.world.clear('allowed', 0)
      if (allowed) a.blackboard.world.add('allowed')
      return 'stable-key'
    }
  })
  a.tick(0.1, [])
  a.tick(0.1, [])
  const before = a.kinematic.position.x
  if (remove) allowed = false
  a.requestReplan('candidate-probe', true)
  a.tick(0.1, [])
  const after = a.kinematic.position.x
  const replan = events.filter(e => e.type === 'replan').slice(-1)[0]
  const cancels = events.filter(e => e.type === 'step_end' && e.status === 'cancelled')
  return { a, before, after, replan, cancels, events }
}

test('candidate/conflict: top-level no_plan respects keep and actual move_to advances', () => {
  const s = deferredCase('top-no-plan')
  assert.equal(s.replan?.status, 'no_plan')
  assert.equal(s.replan?.kept, true)
  assert.equal(s.cancels.length, 0)
  assert.ok(s.after > s.before)
})
test('candidate/conflict: successful deferred equivalent keeps actual move_to', () => {
  const s = deferredCase('deferred', false)
  assert.equal(s.replan?.kept, true)
  assert.equal(s.cancels.length, 0)
  assert.ok(s.after > s.before)
})
test('candidate/conflict: successful empty deferred completion deliberately replaces actual move_to', () => {
  const s = deferredCase('valid-empty')
  assert.equal(s.replan?.status, 'succeeded')
  assert.equal(s.replan?.kept, false)
  assert.equal(s.cancels.length, 1)
})
test('candidate: failed deferred candidate must respect keep just like top-level no_plan', () => {
  const s = deferredCase('deferred')
  assert.equal(s.replan?.status, 'deferred_failed')
  assert.equal(s.a.lastPlanStatus, 'deferred_failed')
  assert.equal(s.replan?.kept, true)
  assert.equal(s.cancels.length, 0, 'failed deferred candidate must not cancel the valid running move_to')
  assert.ok(s.after > s.before, 'the running movement should advance under keep')
})

test('candidate: failed deferred candidate respects cancel and reports deferred_failed', () => {
  const s = deferredCase('deferred', true, 'cancel')
  assert.equal(s.replan?.status, 'deferred_failed')
  assert.equal(s.a.lastPlanStatus, 'deferred_failed')
  assert.equal(s.replan?.kept, false)
  assert.deepEqual(s.replan?.plan, [])
  assert.equal(s.cancels.length, 1)
  assert.equal(s.a.currentAction, '')
})

test('candidate: stopping during deferred validation cannot adopt or emit another plan', () => {
  const s = deferredCase('deferred', true, 'keep', true)
  assert.equal(s.events.filter(e => e.type === 'replan').length, 1, 'only the initial plan was published')
  assert.equal(s.cancels.length, 1, 'stop cancelled the running action exactly once')
  assert.equal(s.a.currentAction, '')
  const time = s.a.time
  s.a.tick(0.1, [])
  assert.equal(s.a.time, time, 'the stopped agent stays stopped')
})

type ConflictVariant = 'same' | 'changed-tail' | 'effect-prefix' | 'running-prefix' | 'stop-prefix'

function conflict(prefix: boolean, valid: boolean, variant: ConflictVariant = 'same') {
  const begin = prefix ? '(!begin_plan work)' : ''
  const end = prefix ? '(!end_plan)' : ''
  const domain = compiled(`(:domain PlanConflict top_level_domain
    (:method (behave) top_level_method
      (changed (and (changed)) (${begin} ${variant === 'running-prefix' ? '(!prepare)' : ''} (!work) (!changed) ${end}))
      (work () (${begin} ${variant === 'effect-prefix' ? '(!permit)' : ''} (!work) ${end})))
    (:method (active_plan) top_level_method
      (valid (and (running work) (allowed)) ())
      (preparing (and (running prepare)) ())))`)
  const events: GuardEvent[] = []
  let starts = 0, updates = 0, cancels = 0, elapsed = 0
  const work: ActionFactory = () => ({
    start: () => { starts++; return 'running' },
    update: dt => { updates++; elapsed += dt; return 'running' },
    cancel: () => { cancels++ }
  })
  const a = new GuardAgent({
    id: 'conflict',
    planner: world => new PlanRunner(domain, world),
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    activePlan: 'active_plan',
    continueTask: '!continue',
    actions: {
      '!work': work,
      '!changed': () => ({ start: () => 'done', update: () => 'done', cancel() {} }),
      '!prepare': () => ({
        start: () => 'running',
        update: () => { updates++; return 'running' },
        cancel() { cancels++ }
      }),
      '!permit': (_args, ctx) => ({
        start: () => {
          if (starts > 0) {
            valid = true
            ctx.blackboard.world.add('allowed')
          }
          return 'done'
        },
        update: () => 'done', cancel() {}
      })
    },
    onEvent: e => {
      events.push(e)
      if (e.type === 'check') {
        if (variant === 'stop-prefix' && events.filter(x => x.type === 'check').length === 2) a.stop()
      }
      if (e.type === 'check' && (variant === 'changed-tail' || variant === 'running-prefix')) {
        a.blackboard.world.add('changed')
      }
    },
    syncFacts: a => {
      a.blackboard.world.clear('allowed', 0)
      if (valid) a.blackboard.world.add('allowed')
      return 'stable-key'
    }
  })
  for (let i = 0; i < 6; i++) a.tick(0.1, [])
  const diagnostics = events.filter(e => e.type === 'diagnostic')
  const checks = events.filter(e => e.type === 'check')
  const replans = events.filter(e => e.type === 'replan')
  return { starts, updates, cancels, elapsed, diagnostics, checks, replans, agent: a }
}
test('candidate/conflict: rejecting repeated plan without prefix is diagnosed and progress survives', () => {
  const s = conflict(false, false)
  assert.equal(s.starts, 2)
  assert.ok(s.updates > 0)
  assert.equal(s.diagnostics.filter(e => e.code === 'active_plan_conflict').length, 1)
})
test('candidate/conflict: valid active-plan with begin/end prefix is not rejected', () => {
  const s = conflict(true, true)
  assert.equal(s.starts, 1)
  assert.equal(s.updates, 5)
  assert.equal(s.cancels, 0)
  assert.equal(s.diagnostics.length, 0)
})
test('conflict: rejecting repeated plan with begin/end prefix should be diagnosed rather than starved', () => {
  const s = conflict(true, false)
  assert.ok(s.updates > 0, 'same work was repeatedly started but never updated')
  assert.equal(s.diagnostics.filter(e => e.code === 'active_plan_conflict').length, 1)
})

test('conflict: changed remaining tail stays checked before conflict is diagnosed on its own repeat', () => {
  const s = conflict(true, false, 'changed-tail')
  assert.equal(s.starts, 3, 'initial plan, different tail, then that tail repeated')
  assert.equal(s.cancels, 2)
  assert.ok(s.updates > 0)
  assert.equal(s.diagnostics.filter(e => e.code === 'active_plan_conflict').length, 1)
})
test('conflict: effects in an instant prefix can make the repeated step valid without disabling checks', () => {
  const s = conflict(true, false, 'effect-prefix')
  assert.equal(s.starts, 2)
  assert.equal(s.cancels, 1)
  assert.equal(s.updates, 4)
  assert.equal(s.diagnostics.length, 0)
})
test('conflict: a different duration prefix is a new plan and keeps its own active-plan checks', () => {
  const s = conflict(true, false, 'running-prefix')
  assert.equal(s.starts, 1, 'only the original work starts; the new prepare step runs')
  assert.equal(s.cancels, 1)
  assert.equal(s.updates, 4)
  assert.equal(s.diagnostics.length, 0)
})

test('conflict: stop during prefix validation cannot diagnose or resume a removed agent', () => {
  const s = conflict(true, false, 'stop-prefix')
  assert.equal(s.starts, 2)
  assert.equal(s.cancels, 2, 'each started work cancelled once')
  assert.equal(s.updates, 0)
  assert.equal(s.diagnostics.length, 0, 'no diagnostic after check callback stops the agent')
  const time = s.agent.time
  s.agent.tick(.1, [])
  assert.equal(s.agent.time, time)
})
