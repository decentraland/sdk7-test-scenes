// The Domain Runner (src/debugger/runner.ts): every gallery and lab scenario is a world state of its domain, a run
// gives the planner's status, plan and a traced run, and compares with the scenario's expected plan.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { int, snapshotWorld, sym, WorldState } from '../../src/htn-planner'
import { GALLERY_STATIONS } from '../../src/examples/upstream/gallery'
import { LAB_STATIONS } from '../../src/examples/upstream/lab'
import { MODES } from '../../src/examples/upstream/stations'
import { cloneWorld, EMPTY_WORLD, runDomain, runnerCatalogue, topLevelMethods, worldFrom } from '../../src/debugger/runner'
import { HelloLevel } from '../../src/playground/levels/hello'

const ALL = MODES[0].mode
const NONE = MODES[3].mode
const catalogue = runnerCatalogue([...GALLERY_STATIONS, ...LAB_STATIONS])

test('catalogue: one entry per domain, its scenarios as world states, an empty world last', () => {
  const names = catalogue.map(d => d.domain)
  assert.equal(new Set(names).size, names.length)
  const aaa = catalogue.find(d => d.id === 'AAACombatNPC')
  assert.ok(aaa)
  assert.ok(aaa.worlds.length > 5)
  assert.equal(aaa.worlds[0].label, 'AAA Combat NPC: idle: patrol')
  assert.equal(aaa.worlds[aaa.worlds.length - 1], EMPTY_WORLD)
  assert.deepEqual(topLevelMethods(aaa.domain).map(m => m.name), ['run'])
})

test('catalogue: an extra domain (a playground NPC) comes with an empty world', () => {
  const level = new HelloLevel().init()
  const c = runnerCatalogue([], [{ domain: level.trace.domain, label: 'hello' }])
  assert.equal(c.length, 1)
  assert.equal(c[0].label, 'hello')
  assert.deepEqual(c[0].worlds, [EMPTY_WORLD])
})

test('every scenario runs as its station expects (ALL mode), with a traced run', () => {
  let compared = 0
  for (const d of catalogue)
    for (const w of d.worlds) {
      if (!w.method) continue
      const r = runDomain({ domain: d.domain, method: w.method, world: w, mode: w.mode ?? ALL, repeats: 1 })
      assert.ok(r.expected, `${w.label} has an expectation`)
      assert.ok(r.expected.same, `${w.label}: ${r.status} ${JSON.stringify(r.plan)}`)
      if (r.status === 'succeeded' || r.status === 'no_plan') assert.equal(r.run.status, r.status)
      compared++
    }
  assert.ok(compared > 50, `${compared} scenarios`)
})

test('a run in another mode or with another method is not compared', () => {
  const d = catalogue.find(x => x.id === 'HierarchicalBacktracking')!
  const w = d.worlds.find(x => x.method && !x.mode)!
  assert.equal(runDomain({ domain: d.domain, method: w.method!, world: w, mode: NONE, repeats: 0 }).expected, undefined)
  const empty = runDomain({ domain: d.domain, method: w.method!, world: EMPTY_WORLD, mode: ALL, repeats: 0 })
  assert.equal(empty.expected, undefined)
  assert.equal(empty.run.status, empty.status)
})

test('the runner plans on a copy: a cloned world is never written', () => {
  const live = new WorldState()
  live.add('lamp', sym('off'))
  live.add('count', int(3))
  const before = live.revision
  const w = cloneWorld('npc', 'npc world', live)
  live.add('later', int(1)) // a change after the copy does not reach it
  const copy = new WorldState()
  w.setup(copy)
  assert.deepEqual(copy.tableKeys().sort(), ['count/1', 'lamp/1'])
  assert.equal(live.revision, before + 1)
  const again = worldFrom(snapshotWorld(copy))
  assert.deepEqual(again.rows('lamp', 1), [[sym('off')]])
})

test('timing: the mean of the untraced repeats, the traced run apart', () => {
  const d = catalogue.find(x => x.id === 'AAACombatNPC')!
  let t = 0
  const r = runDomain({ domain: d.domain, method: 'run', world: d.worlds[0], mode: ALL, repeats: 4, minTotalMs: 0, clock: () => (t += 1) })
  assert.equal(r.repeats, 4)
  assert.equal(r.ms, 1)
  assert.ok(r.tracedMs >= 1)
})

test('timing on a coarse clock: it repeats until the readings add up to minTotalMs, within the budget', () => {
  const d = catalogue.find(x => x.id === 'AAACombatNPC')!
  // A 1 ms clock that ticks every 40 reads: a plan reads 0 most times, 1 now and then.
  let reads = 0
  const clock = () => Math.floor(reads++ / 40)
  const r = runDomain({ domain: d.domain, method: 'run', world: d.worlds[0], mode: ALL, repeats: 20, minTotalMs: 5, budgetMs: 1000, clock })
  assert.ok(r.repeats > 20, `more than 20 repeats: ${r.repeats}`)
  assert.ok(r.ms > 0 && r.ms < 1, `a mean under a tick: ${r.ms}`)
  // Never past the budget.
  let t = 0
  const capped = runDomain({ domain: d.domain, method: 'run', world: d.worlds[0], mode: ALL, repeats: 1, minTotalMs: 1e9, budgetMs: 30, clock: () => (t += 10) })
  assert.ok(capped.repeats >= 1 && capped.repeats <= 3, `stopped at the budget: ${capped.repeats}`)
})

test('invalid call: no run begins, an empty one is shown', () => {
  const d = catalogue.find(x => x.id === 'AAACombatNPC')!
  const r = runDomain({ domain: d.domain, method: 'nope', world: EMPTY_WORLD, mode: ALL, repeats: 0 })
  assert.equal(r.status, 'invalid_call')
  assert.deepEqual(r.run.nodes, [])
})

test('dev checks first: call sites the world leaves unbound (but on purpose), world tables of a wrong arity', () => {
  const d = catalogue.find(x => x.id === 'CallTermsDemo')!
  const bare = runDomain({ domain: d.domain, method: 'test_callterms', world: EMPTY_WORLD, mode: ALL, repeats: 0 })
  assert.match(bare.diagnostics[0], /^unregistered_callterm: Callterm 'binded_function_with_args' is not registered at callterms\.domain:\d+:\d+ \(domain 'CallTermsDemo' calls it/)
  const missing = d.worlds.find(w => w.unbound?.includes('binded_function_with_args'))!
  const r = runDomain({ domain: d.domain, method: missing.method!, world: missing, mode: ALL, repeats: 0 })
  assert.ok(!r.diagnostics.some(l => l.startsWith('unregistered_callterm')), 'left out on purpose')
  assert.equal(r.diagnostics.filter(l => l.startsWith('missing_callterm')).length, 1, 'the reached call, once')
  const h = catalogue.find(x => x.id === 'HierarchicalBacktracking')!
  const live = new WorldState()
  live.add('candidate', sym('a'), sym('b'))
  const wrong = runDomain({ domain: h.domain, method: 'validate_fact_backtracking', world: cloneWorld('w', 'w', live), mode: ALL, repeats: 0 })
  assert.match(wrong.diagnostics.join('\n'), /^fact_arity_mismatch: Fact 'candidate\/2' is in the world state, but domain 'HierarchicalBacktracking' reads 'candidate' only as candidate\/1$/m)
})

test('maxPasses: deferred steps expanded in order; 1 plans once', () => {
  const d = catalogue.find(x => x.id === 'Wanderer')!
  const w = d.worlds.find(x => x.label.includes('path ready'))!
  const once = runDomain({ domain: d.domain, method: 'run', world: w, mode: ALL, repeats: 0 })
  assert.deepEqual([once.passes, once.expansions.length, once.expanded], [1, 0, undefined])
  const r = runDomain({ domain: d.domain, method: 'run', world: w, mode: ALL, repeats: 0, maxPasses: 5 })
  assert.equal(r.passes, 2)
  assert.deepEqual(r.plan, once.plan, 'the plan itself is the same')
  assert.equal(r.expansions[0].step, '&talk_about_destination')
  assert.equal(r.expansions[0].run.deferred, true)
  assert.deepEqual(r.expanded, [...r.plan.slice(0, 3), ...r.expansions[0].plan, ...r.plan.slice(4)])
})
