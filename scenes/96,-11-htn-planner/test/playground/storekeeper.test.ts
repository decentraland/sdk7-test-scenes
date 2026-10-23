// Level 10 (storekeeper): the running-plan check on a playground NPC (GuardAgentOptions.activePlan, register row H3,
// upstream docs/USE_CASES.md section 1). First the domain on its own: what `behave` plans and which running steps
// `active_plan` accepts; then the level: a door shut mid-walk and a customer who walks off mid-carry cancel the
// running step at once, the History tab shows the check, and without the check the same steps run to their end.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { float, formatTask, sym, type Atom } from '../../src/htn-planner/htn/atom'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import { historyRows } from '../../src/debugger/history-rows'
import { storekeeperDomain } from '../../src/examples/basics/storekeeper.htn'
import { StorekeeperLevel } from '../../src/playground/levels/storekeeper'
import type { AgentSetup } from '../../src/playground/sim'

const DT = 1 / 30

interface Facts {
  customer?: string
  open?: boolean
  holding?: boolean
  running?: Atom[]
}

function world(f: Facts): WorldState {
  const w = new WorldState()
  if (f.customer) w.add('customer', sym(f.customer))
  if (f.open) w.add('store_open')
  if (f.holding) w.add('holding_crate')
  if (f.running) w.add('running', ...f.running)
  return w
}

function plan(method: string, f: Facts): string[] | null {
  const runner = new PlanRunner(storekeeperDomain, world(f), { onDiagnostic: d => assert.fail(d.message) })
  const status = runner.plan(method)
  return status === 'succeeded' ? runner.steps.map(s => formatTask(s.name, s.args)) : null
}

test('storekeeper behave: serve, fetch, store_shut, rest', () => {
  assert.deepEqual(plan('behave', {}), ['!go_to bench', '!sit 3.0'])
  assert.deepEqual(plan('behave', { open: true }), ['!go_to bench', '!sit 3.0'])
  assert.deepEqual(plan('behave', { customer: 'tester', open: true }), ['!go_to store', '!take_crate', '&behave'])
  assert.deepEqual(plan('behave', { customer: 'tester' }), ['!say "the store is shut!"', '!wait 5.0'])
  assert.deepEqual(plan('behave', { customer: 'you', holding: true }), ['!go_to counter', '!hand_over you'])
})

test('storekeeper active_plan: each running step is valid only while its facts hold; no catch-all', () => {
  const ok = (f: Facts) => plan('active_plan', f) !== null
  const step = (...names: string[]) => names.map(n => sym(n))
  // On the way to the store: a customer, an open door, empty hands.
  assert.ok(ok({ running: step('go_to', 'store'), customer: 'tester', open: true }))
  assert.ok(!ok({ running: step('go_to', 'store'), customer: 'tester' }), 'door shut')
  assert.ok(!ok({ running: step('go_to', 'store'), open: true }), 'customer gone')
  // Carrying the crate to the counter: a customer to give it to.
  assert.ok(ok({ running: step('go_to', 'counter'), customer: 'tester', holding: true }))
  assert.ok(!ok({ running: step('go_to', 'counter'), holding: true }), 'customer gone')
  // Handing over to that customer only.
  assert.ok(ok({ running: step('hand_over', 'tester'), customer: 'tester' }))
  assert.ok(!ok({ running: step('hand_over', 'tester'), customer: 'you' }))
  // Waiting at the shut door: until it opens or the customer leaves.
  assert.ok(ok({ running: [sym('wait'), float(5)], customer: 'tester' }))
  assert.ok(!ok({ running: [sym('wait'), float(5)], customer: 'tester', open: true }))
  // Resting: until a customer comes.
  assert.ok(ok({ running: step('go_to', 'bench') }))
  assert.ok(!ok({ running: step('go_to', 'bench'), customer: 'tester', open: true }))
  // No running step, or one the method does not know: no branch accepts it.
  assert.ok(!ok({ customer: 'tester', open: true }))
  assert.ok(!ok({ running: step('dance'), customer: 'tester', open: true }))
})

function level(setup: Partial<AgentSetup> = {}): StorekeeperLevel {
  class Variant extends StorekeeperLevel {
    protected agentSetup(): AgentSetup {
      return { ...super.agentSetup(), ...setup }
    }
  }
  const l = new Variant().init()
  l.testerPaused = true
  return l
}

function runUntil(l: StorekeeperLevel, done: () => boolean, seconds: number): boolean {
  for (let t = 0; t < seconds; t += DT) {
    l.update(DT)
    if (done()) return true
  }
  return false
}

const step = (l: StorekeeperLevel) => {
  const s = l.agent.currentAction === '' ? null : l.agent.runner.current()
  return s ? formatTask(s.name, s.args) : ''
}

test('storekeeper level: the door shut mid-walk cancels !go_to store at once, the History tab shows the check', () => {
  const l = level()
  l.teleportTester(l.spot('customer')!)
  assert.ok(runUntil(l, () => step(l) === '!go_to store', 2), 'fetches')
  runUntil(l, () => false, 1)
  const at = { ...l.agent.kinematic.position }
  l.storeOpen = false
  l.update(DT)
  assert.equal(l.crew[0].lastRejected, '!go_to store')
  assert.equal(l.agent.lastReplanReason, 'active_plan failed')
  assert.ok(runUntil(l, () => l.doing('store_shut'), 0.5), 'store_shut planned in the same tick')
  assert.ok(Math.hypot(l.agent.kinematic.position.x - at.x, l.agent.kinematic.position.z - at.z) < 0.2, 'stopped where it was')

  const rows = historyRows(l.crew[0].history.toArray(), []).map(r => r.kind).reverse()
  const i = rows.indexOf('check')
  assert.deepEqual(rows.slice(i, i + 4), ['check', 'cancelled', 'replan', 'step'])

  // The door opens: the wait at the shut door is rejected, the keeper fetches again.
  assert.ok(runUntil(l, () => step(l) === '!wait 5.0', 2), 'says so, then waits at the shut door')
  runUntil(l, () => false, 1)
  l.storeOpen = true
  assert.ok(runUntil(l, () => l.doing('fetch'), 0.2))
  assert.equal(l.crew[0].lastRejected, '!wait 5.0')
  assert.ok(runUntil(l, () => l.served === 1, 20), 'served at last')
  assert.equal(l.crew[0].rejections, 2)
  const codes = l.crew[0].history.toArray().flatMap(e => (e.event.type === 'diagnostic' ? [e.event.code] : []))
  assert.deepEqual(codes, [], 'no fallback, no conflict')
})

test('storekeeper level: a customer who walks off mid-carry cancels !go_to counter; the crate stays in hand', () => {
  const l = level()
  l.teleportTester(l.spot('customer')!)
  assert.ok(runUntil(l, () => step(l) === '!go_to counter', 15), 'carries the crate')
  runUntil(l, () => false, 0.5)
  l.teleportTester(l.spot('away')!)
  l.update(DT)
  assert.equal(l.crew[0].lastRejected, '!go_to counter')
  assert.ok(runUntil(l, () => l.doing('rest'), 0.2))
  assert.ok(l.holding)
  l.teleportTester(l.spot('customer')!)
  assert.ok(runUntil(l, () => l.doing('serve'), 0.5), 'the sit is rejected, serve at once')
  assert.ok(runUntil(l, () => l.served === 1 && !l.holding, 15))
})

test('storekeeper level without activePlan: no fact-change replan, the walk to the shut door runs to its end', () => {
  const l = level({ activePlan: undefined })
  l.teleportTester(l.spot('customer')!)
  assert.ok(runUntil(l, () => step(l) === '!go_to store', 2))
  runUntil(l, () => false, 1)
  l.storeOpen = false
  assert.ok(runUntil(l, () => step(l) !== '!go_to store', 15))
  const store = l.spot('store')!
  assert.ok(Math.hypot(l.agent.kinematic.position.x - store.x, l.agent.kinematic.position.z - store.z) < 0.5, 'walked all the way')
  assert.equal(l.agent.metrics.checksMade, 0)
  assert.equal(l.crew[0].rejections, 0)
})
