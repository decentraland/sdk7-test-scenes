import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileDomainSource } from '../../tools/htn/compiler'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import type { GuardEvent } from '../../src/htn-planner/npc/actions'

type Variant = 'same' | 'permit' | 'changed-tail' | 'invalid-prefix' | 'failed-prefix' | 'external-replan'
function durationPrefix(variant: Variant = 'same') {
  const compiled = compileDomainSource('DurationPrefix.domain', `(:domain DurationPrefix top_level_domain
    (:method (behave) top_level_method
      (changed (and (changed)) ((!prepare) (!work) (!finish)))
      (work () ((!prepare) (!work))))
    (:method (active_plan) top_level_method
      (preparing (and (running prepare) (prepare_allowed)) ())
      (working (and (running work) (allowed)) ())))`)
  assert.ok(compiled.ok, compiled.diagnostics.map(d => d.message).join('\n'))
  const events: GuardEvent[] = []
  let starts = 0, updates = 0, cancelled = 0, preparations = 0, checks = 0
  const agent = new GuardAgent({
    id: 'worker', start: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
    planner: world => new PlanRunner(compiled.ir, world),
    lineOfSight: CLEAR_LINE_OF_SIGHT, activePlan: 'active_plan',
    onEvent: e => {
      events.push(e)
      if (e.type === 'check' && e.step.startsWith('!work')) {
        checks++
        if (variant === 'changed-tail') agent.blackboard.world.add('changed')
      }
    },
    actions: {
      '!prepare': (_args, ctx) => {
        let ticks = 0
        return {
          start: () => {
            preparations++
            if (variant === 'invalid-prefix' && preparations > 1) ctx.blackboard.world.clear('prepare_allowed', 0)
            return 'running'
          },
          update: () => {
            ticks++
            if (variant === 'external-replan' && preparations === 2 && ticks === 1) agent.requestReplan('external', true)
            if (ticks < 3) return 'running'
            if (preparations > 1 && variant === 'permit') ctx.blackboard.world.add('allowed')
            return preparations > 1 && variant === 'failed-prefix' ? 'failed' : 'done'
          },
          cancel() {}
        }
      },
      '!work': () => ({
        start: () => { starts++; return 'running' },
        update: () => { updates++; return 'running' },
        cancel: () => { cancelled++ }
      }),
      '!finish': () => ({ start: () => 'done', update: () => 'done', cancel() {} })
    }
  })
  agent.blackboard.world.add('prepare_allowed')
  for (let i = 0; i < 24; i++) agent.tick(0.1, [])
  const result = { starts, updates, cancelled, preparations, checks,
    conflicts: events.filter(e => e.type === 'diagnostic' && e.code === 'active_plan_conflict'), events }
  if (variant === 'permit') {
    agent.blackboard.world.clear('allowed', 0)
    agent.tick(0.1, [])
  }
  const cancelledAfterWithdrawal = cancelled
  agent.stop()
  return { ...result, cancelledAfterWithdrawal }
}

test('active-plan conflict survives a completed duration prefix', () => {
  const s = durationPrefix()
  assert.ok(s.updates > 0, `work is starved: ${s.starts} starts and ${s.updates} updates`)
  assert.equal(s.starts, 2)
  assert.equal(s.cancelled, 1)
  assert.equal(s.conflicts.length, 1)
})

test('duration prefix effects are checked before bypassing the repeated work', () => {
  const s = durationPrefix('permit')
  assert.equal(s.starts, 2)
  assert.ok(s.updates > 0)
  assert.equal(s.conflicts.length, 0, 'the prefix made work valid')
  assert.equal(s.cancelledAfterWithdrawal, s.cancelled + 1, 'later fact changes still cancel the work')
})

test('a changed tail is rejected once before its own repeat is diagnosed', () => {
  const s = durationPrefix('changed-tail')
  assert.equal(s.starts, 3)
  assert.equal(s.cancelled, 2)
  assert.ok(s.updates > 0)
  assert.equal(s.conflicts.length, 1)
})

test('a duration prefix keeps its own active-plan check', () => {
  const s = durationPrefix('invalid-prefix')
  assert.ok(s.events.some(e => e.type === 'check' && e.step.startsWith('!prepare')))
  assert.ok(s.starts > 1)
  assert.equal(s.updates, 0, 'a rejected prefix must not exempt later work from its own checks')
  assert.ok(s.conflicts.length > 0)
})

test('a failed duration prefix does not reach or exempt the rejected work', () => {
  const s = durationPrefix('failed-prefix')
  assert.equal(s.starts, 1)
  assert.equal(s.updates, 0)
  assert.ok(s.preparations > 2)
  assert.equal(s.conflicts.length, 0)
})

test('an external replan during a duration prefix discards stale rejection history', () => {
  const s = durationPrefix('external-replan')
  assert.equal(s.starts, 3, 'work after the external decision is checked before its fresh repeat')
  assert.equal(s.cancelled, 2)
  assert.ok(s.updates > 0)
  assert.equal(s.conflicts.length, 1)
})
