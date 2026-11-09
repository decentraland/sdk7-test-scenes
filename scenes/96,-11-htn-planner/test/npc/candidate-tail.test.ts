// Replanning may happen after an action completes but before the next deferred task resolves.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bool } from '../../src/htn-planner/htn/atom'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { PlanTraceRecorder } from '../../src/htn-planner/htn/trace'
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import type { ReplanEvent } from '../../src/htn-planner/npc/actions'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import { compileDomainSource } from '../../tools/htn/compiler'

type Candidate = 'failed' | 'valid' | 'empty' | 'last-step' | 'stop' | 'same-tail'

function atBoundary(candidate: Candidate = 'failed', onNoPlan: 'keep' | 'cancel' = 'keep') {
  const compiled = compileDomainSource('CandidateTail.domain', `(:domain CandidateTail top_level_domain
    (:method (behave) top_level_method
      (empty (and (empty_candidate)) ((&empty)))
      (resume (and (resume_tail)) ((&b)))
      (normal () ((&a) ${candidate === 'last-step' ? '' : '(&b)'})))
    (:method (a) (allowed (and (allowed)) ((!hold))))
    (:method (b) (future (and (call visit_tail)) ((!future))))
    (:method (empty) (complete () ())))`)
  assert.ok(compiled.ok, compiled.diagnostics.map(d => d.message).join('\n'))
  const domain = compiled.ir
  const traces: PlanTraceRecorder[] = []
  const views: { event: ReplanEvent; tailCalls: number; head: string | undefined }[] = []
  let allowed = true, empty = false, holdStarts = 0, futureStarts = 0, futureUpdates = 0, tailCalls = 0
  const agent = new GuardAgent({
    id: 'boundary',
    planner: world => {
      const trace = new PlanTraceRecorder(domain)
      traces.push(trace)
      const runner = new PlanRunner(domain, world, {
        trace,
        callterms: { visit_tail: () => { tailCalls++; return bool(true) } }
      })
      if (candidate === 'stop') {
        const resolve = runner.resolve.bind(runner)
        runner.resolve = () => {
          const result = resolve()
          if (result === 'failed') agent.stop()
          return result
        }
      }
      return runner
    },
    start: { position: v3(0, 0, 0), yaw: 0 },
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    onNoPlan,
    syncFacts: a => {
      a.blackboard.world.clear('allowed', 0)
      if (allowed) a.blackboard.world.add('allowed')
      if (empty) a.blackboard.world.add('empty_candidate')
      return 'same-key'
    },
    actions: {
      '!hold': (_args, ctx) => ({
        start: () => { holdStarts++; return 'running' },
        update: () => {
          if (holdStarts > 1) return 'running'
          allowed = candidate === 'valid'
          empty = candidate === 'empty'
          ctx.blackboard.world.clear('allowed', 0)
          if (allowed) ctx.blackboard.world.add('allowed')
          if (empty) ctx.blackboard.world.add('empty_candidate')
          if (candidate === 'same-tail') ctx.blackboard.world.add('resume_tail')
          agent.requestReplan('completed hold', true)
          return 'done'
        },
        cancel() {}
      }),
      '!future': () => ({
        start: () => { futureStarts++; return 'running' },
        update: () => { futureUpdates++; return 'running' },
        cancel() {}
      })
    },
    onEvent: event => {
      if (event.type === 'replan') {
        views.push({ event, tailCalls, head: agent.runner.steps[0]?.name })
      }
    }
  })
  agent.tick(0.1, [])
  agent.tick(0.1, [])
  return {
    agent, views, traces, domain,
    counts: () => ({ holdStarts, futureStarts, futureUpdates, tailCalls }),
    allow() { allowed = true }
  }
}

test('failed candidate keeps a valid deferred continuation when the current action just completed', () => {
  const s = atBoundary()
  assert.equal(s.counts().futureStarts, 1, 'the old deferred tail must execute instead of being discarded')
  assert.equal(s.views[1].event.status, 'deferred_failed')
  assert.equal(s.views[1].event.kept, true)
  assert.equal(s.agent.currentAction, '!future')
})

test('failed candidate cancel explicitly discards the deferred continuation', () => {
  const s = atBoundary('failed', 'cancel')
  assert.equal(s.views[1].event.status, 'deferred_failed')
  assert.equal(s.views[1].event.kept, false)
  assert.deepEqual(s.views[1].event.plan, [])
  assert.equal(s.counts().futureStarts, 0)
  assert.equal(s.counts().tailCalls, 0)
  assert.equal(s.agent.currentAction, '')
})

test('keeping the tail neither probes its callterm early nor restarts its execution under repeated requests', () => {
  const s = atBoundary()
  assert.deepEqual(s.views[1].event.plan, ['&b'])
  assert.equal(s.views[1].head, '&b', 'the active cursor stays deferred during candidate comparison')
  assert.equal(s.views[1].tailCalls, 0, 'the candidate check must not resolve the active tail')
  for (let i = 0; i < 3; i++) {
    s.agent.requestReplan('repeat', true)
    s.agent.tick(0.1, [])
  }
  assert.deepEqual(s.counts(), { holdStarts: 1, futureStarts: 1, futureUpdates: 3, tailCalls: 1 })
  const activeRuns = s.traces[0].runs.filter(run => run.deferred)
  assert.deepEqual(activeRuns.map(run => s.domain.methods[run.method].name), ['a', 'b'])
  assert.ok(activeRuns.every(run => run.status === 'succeeded'))
  assert.ok(s.views.slice(1).every(view => view.event.status === 'deferred_failed' && view.event.kept))
})

test('valid candidate can replace a deferred continuation without evaluating the old tail', () => {
  const s = atBoundary('valid')
  assert.equal(s.views[1].event.status, 'succeeded')
  assert.equal(s.views[1].event.kept, false)
  assert.equal(s.counts().holdStarts, 2)
  assert.equal(s.counts().futureStarts, 0)
  assert.equal(s.counts().tailCalls, 0)
  assert.equal(s.agent.currentAction, '!hold')
})

test('equal deferred continuation validates separately and keeps the original lazy cursor', () => {
  const s = atBoundary('same-tail')
  assert.equal(s.views[1].event.status, 'succeeded')
  assert.equal(s.counts().futureStarts, 1)
  assert.equal(s.views[1].event.kept, true)
  assert.equal(s.views[1].head, '&b', 'comparison does not expand the active cursor')
  assert.equal(s.views[1].tailCalls, 1, 'the candidate was validated before it was kept')
  assert.deepEqual(s.traces[0].runs.filter(run => run.deferred)
    .map(run => s.domain.methods[run.method].name), ['a', 'b'], 'the original tail expands during execution')
  assert.equal(s.agent.currentAction, '!future')
})

test('successful empty candidate deliberately replaces the deferred continuation', () => {
  const s = atBoundary('empty')
  assert.equal(s.views[1].event.status, 'succeeded')
  assert.equal(s.views[1].event.kept, false)
  assert.deepEqual(s.views[1].event.plan, [])
  assert.equal(s.counts().futureStarts, 0)
  assert.equal(s.counts().tailCalls, 0)
})

for (const policy of ['keep', 'cancel'] as const) {
  test(`failure after the last step reports honestly under ${policy} and can recover`, () => {
    const s = atBoundary('last-step', policy)
    assert.equal(s.views[1].event.status, 'deferred_failed')
    assert.equal(s.views[1].event.kept, policy === 'keep')
    assert.deepEqual(s.views[1].event.plan, [])
    assert.equal(s.counts().holdStarts, 1)
    s.allow()
    s.agent.requestReplan('recover', true)
    s.agent.tick(0.1, [])
    assert.equal(s.counts().holdStarts, 2)
    assert.equal(s.agent.currentAction, '!hold')
  })
}

test('stop callback during deferred candidate validation cannot run the pending continuation', () => {
  const s = atBoundary('stop')
  assert.equal(s.views.length, 1, 'no candidate event after the callback stops the agent')
  assert.equal(s.counts().futureStarts, 0)
  assert.equal(s.counts().tailCalls, 0)
  const time = s.agent.time
  s.agent.requestReplan('repeat', true)
  s.agent.tick(0.1, [])
  assert.equal(s.agent.time, time)
  assert.equal(s.counts().holdStarts, 1)
})
