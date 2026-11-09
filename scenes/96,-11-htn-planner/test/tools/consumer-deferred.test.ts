import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileDomainSource } from '../../tools/htn/compiler'
import { callterm, memberCallterm } from '../../src/htn-planner/htn/callterms'
import { formatTask } from '../../src/htn-planner/htn/atom'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import { Stage } from '../../src/htn-testing/paper'

const compiled = compileDomainSource('deferred-consumer.domain', `
(:domain DeferredConsumer top_level_domain
  (:method (job) top_level_method
    (done (and (done)) ())
    (resume (and (progress)) ((&later)))
    (start () ((!first) (!second)))
  )
  (:method (later)
    (bound (and (call custom) (call member)) ((!second)))
  )
)`)
if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
const domain = compiled.ir

function setup(withDaemon = true) {
  const world = new WorldState()
  const context = { token: 'game host' }
  const lease = { open: true }
  const calls: string[] = []
  let drops = 0
  const stage = new Stage({ station: 'game', name: 'resume', blurb: 'bound deferred comparison', expect: [], play() {} }, {
    domain: () => domain, scenario: () => undefined, record: true
  })
  const agent = stage.agent({ id: 'worker', world, method: 'job', context,
    callterms: {
      custom: callterm([], invocation => {
        assert.equal(invocation.context, context)
        calls.push('custom')
        return true
      }, 'bool'),
      member: memberCallterm('lease', [], (instance: { open: boolean }, invocation) => {
        assert.equal(instance, lease)
        assert.equal(invocation.context, context)
        calls.push('member')
        return instance.open
      }, 'bool')
    },
    daemons: withDaemon ? { lease } : {},
    host: {
      effects: {
        '!first': (_args, w) => { w.add('progress'); w.add('reservation') },
        '!second': (_args, w) => { assert.equal(w.rows('reservation', 0).length, 1); w.clear('reservation', 0); w.add('done') }
      },
      dropped: w => { drops++; w.clear('reservation', 0) }
    }
  })
  return { stage, agent, world, calls, drops: () => drops }
}

test('deferred comparison keeps a running plan using custom bindings, context and daemon without recording the probe', () => {
  const s = setup()
  s.agent.tick()
  s.agent.step()
  assert.equal(s.agent.tick().kept, true)
  assert.deepEqual(s.calls, ['custom', 'member'])
  assert.equal(s.drops(), 0, 'equivalent rest must not release host resources')
  assert.equal(s.world.rows('reservation', 0).length, 1)
  const session = s.stage.session()!
  assert.equal(session.runs.length, 2, 'comparison probe is not an execution run')
  assert.ok(session.runs.every(run => !run.deferred && domain.methods[run.method].name === 'job'))
  assert.deepEqual(session.runs[session.runs.length - 1].plan.map(step => formatTask(step.name, step.args)), ['&later'])
  const decision = session.timeline[session.timeline.length - 1].event
  assert.equal(decision.type, 'replan')
  if (decision.type === 'replan') {
    assert.equal(decision.kept, true)
    assert.deepEqual(decision.plan, ['!second'])
  }
  assert.equal(s.agent.recorder!.lastDeferred, null)
  s.agent.step()
  s.agent.tick()
  assert.deepEqual(s.stage.trace, [
    'worker: plan: !first, !second', 'worker: run !first',
    'worker: keep: !second', 'worker: run !second', 'worker: plan: (empty)'
  ])
  assert.equal(s.drops(), 0)
})

test('deferred comparison reports a missing member daemon through the agent diagnostic sink before dropping', () => {
  const s = setup(false)
  s.agent.tick()
  s.agent.step()
  assert.equal(s.agent.tick().kept, false)
  assert.deepEqual(s.calls, ['custom'])
  assert.equal(s.drops(), 1)
  assert.equal(s.world.rows('reservation', 0).length, 0)
  assert.deepEqual(s.stage.trace.map(line => line.replace(/ at .*deferred-consumer\.domain:\d+:\d+$/, '')), [
    'worker: plan: !first, !second', 'worker: run !first',
    "worker: diagnostic: Callterm 'member' needs daemon 'lease', which has no instance",
    'worker: switch: &later'
  ])
  assert.equal(s.stage.session()!.runs.length, 2)
})
