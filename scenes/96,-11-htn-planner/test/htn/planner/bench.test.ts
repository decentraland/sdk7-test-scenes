// Micro-benchmarks: print timings, assert only correctness (no tight thresholds).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bool, float, int, list, sym, vec3, type Atom } from '../../../src/htn-planner/htn/atom'
import { decompose, PlanRunner } from '../../../src/htn-planner/htn/planner'
import { WorldState } from '../../../src/htn-planner/htn/world-state'
import { fixture, parseDomain } from './domain-text'
import { PlanTraceRecorder } from '../../../src/htn-planner/htn/trace'
import { addFacts } from '../../../src/htn-planner/htn/world-state'
import { CALLTERM_SETS } from '../../../src/examples/upstream/conformance-callterms'
import { aaaCombatDomain } from '../../../src/examples/upstream/generated/AAACombatNPC.htn'
import { aaaCombatNPCHighOrderFacts } from '../../../src/examples/upstream/generated/AAACombatNPC_high_order.facts'
import { complexScenarioDomain } from '../../../src/examples/upstream/generated/complex_scenario.htn'
import { complexScenarioRecursive100Facts } from '../../../src/examples/upstream/generated/complex_scenario_recursive_100.facts'
import { benchCases, formatAlloc, formatCounters, formatLifecycle, formatOverhead, formatSuite, runCase } from '../../../scripts/bench/suite'
import { CrowdLevel } from '../../../src/playground/levels/crowd'
import { crowdName, formatCrowd, formatGame, runCrowd, type CrowdResult } from '../../../scripts/bench/crowd'

// A patrol/chase NPC of roughly the size the scene needs.
const npcFixed = parseDomain(`
(:domain Stalker top_level_domain
  (:constants (chase_range 12.0) (catch_range 1.5) (patrol_speed 1.0) (chase_speed 3.5))
  (:method (behave ?inp_self) top_level_method
    (catch_player
      (and (#visible_player ?inp_self ?player ?pos) (#distance_to ?inp_self ?pos ?d) (<= ?d @catch_range))
      ((!face ?player) (!grab ?player)))
    (chase_player
      (and (#visible_player ?inp_self ?player ?pos) (#distance_to ?inp_self ?pos ?d) (<= ?d @chase_range))
      ((!growl) (move ?pos @chase_speed) (&recheck ?inp_self)))
    (investigate_noise
      (and (heard_noise ?noise_pos ?time) (not (investigated ?noise_pos)) (call is_recent ?time))
      ((move ?noise_pos @patrol_speed) (!look_around 2.0)))
    (patrol
      (and (patrol_route ?inp_self ?route) (patrol_index ?inp_self ?i) (#waypoint ?route ?i ?wp))
      ((move ?wp @patrol_speed) (!set_patrol_index ?inp_self (% (+ ?i 1) 6))))
    (idle () ((!idle 1.0))))
  (:method (move ?inp_pos ?inp_speed)
    (blocked (and (blocked_cell ?inp_pos)) ((!wait 0.5)))
    (walk () ((!move_to ?inp_pos ?inp_speed))))
  (:method (recheck ?inp_self)
    (still (and (#visible_player ?inp_self ?p ?pos)) ((!chase_step ?pos)))
    (lost () ((!search))))
  (:axiom (visible_player ?inp_self ?out_player ?out_pos)
    (and (player ?out_player ?out_pos) (not (hidden ?out_player)) (call can_see ?inp_self ?out_pos)))
  (:axiom (distance_to ?inp_self ?inp_pos ?out_d)
    (and (position ?inp_self ?self_pos) (= ?out_d (call distance ?self_pos ?inp_pos))))
  (:axiom (waypoint ?inp_route ?inp_i ?out_wp)
    (alt (and (== ?inp_i 0) (split_list ?inp_route ?out_wp ?rest))
         (and (> ?inp_i 0) (split_list ?inp_route ?head ?tail) (#waypoint ?tail (- ?inp_i 1) ?out_wp))))
)`)

function npcWorld(): WorldState {
  const w = new WorldState()
  const self = sym('stalker')
  w.add('position', self, vec3(0, 0, 0))
  w.add('patrol_route', self, list(vec3(1, 0, 1), vec3(5, 0, 1), vec3(5, 0, 5), vec3(1, 0, 5), vec3(-3, 0, 5), vec3(-3, 0, 1)))
  w.add('patrol_index', self, int(4))
  for (let i = 0; i < 8; i++) w.add('blocked_cell', vec3(100 + i, 0, 0))
  for (let i = 0; i < 4; i++) w.add('heard_noise', vec3(i, 0, 9), float(i))
  for (let i = 0; i < 4; i++) w.add('investigated', vec3(i, 0, 9))
  w.add('player', sym('p1'), vec3(30, 0, 30))
  w.add('player', sym('p2'), vec3(2, 0, 2))
  w.add('hidden', sym('p2'))
  return w
}

const dist = (a: Atom, b: Atom) => {
  if (a.t !== 'list' || b.t !== 'list') return undefined
  const [ax, , az] = a.v.map(x => x.v as number)
  const [bx, , bz] = b.v.map(x => x.v as number)
  return float(Math.hypot(ax - bx, az - bz))
}
const npcCallterms = {
  can_see: (a: readonly Atom[]) => {
    const d = dist(vec3(0, 0, 0), a[1])
    return bool(d !== undefined && (d.v as number) < 20)
  },
  distance: (a: readonly Atom[]) => dist(a[0], a[1]),
  is_recent: () => bool(true)
}

function time(label: string, iterations: number, fn: () => void): number {
  for (let i = 0; i < Math.min(50, iterations); i++) fn() // warm-up
  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const ms = performance.now() - start
  console.log(`[bench] ${label}: ${iterations} runs in ${ms.toFixed(1)} ms (${((ms * 1000) / iterations).toFixed(1)} us/run)`)
  return ms
}

test('bench: patrol/chase NPC decompositions', () => {
  const w = npcWorld()
  const self = [sym('stalker')]
  const o = { callterms: npcCallterms }
  const patrol = decompose(npcFixed, w, 'behave', self, o)
  assert.equal(patrol.status, 'succeeded')
  assert.deepEqual(patrol.plan.map(s => s.name), ['!move_to', '!set_patrol_index'])
  time('patrol (axiom recursion over route, 4 failed branches first)', 1000, () => decompose(npcFixed, w, 'behave', self, o))

  w.clear('hidden', 1)
  const chase = decompose(npcFixed, w, 'behave', self, o)
  assert.deepEqual(chase.plan.map(s => s.name), ['!growl', '!move_to', '&recheck'])
  time('chase (fact + axiom backtracking, deferred step)', 1000, () => decompose(npcFixed, w, 'behave', self, o))

  const runner = new PlanRunner(npcFixed, w, o)
  time('PlanRunner plan + resolve/complete to the end (chase)', 1000, () => {
    runner.plan('behave', self)
    while (runner.resolve() === 'ready') runner.complete()
  })
})

test('bench: 100-deep recursion (recursion_dispatch non_tail / mutual / deep_failure)', () => {
  const d = parseDomain(fixture('Domains/Test/recursion_dispatch.domain'))
  const w = new WorldState()
  w.add('depth', int(100))
  const o = { callterms: { visit: () => bool(true) } }
  assert.equal(decompose(d, w, 'non_tail', [], o).plan.length, 201)
  time('non_tail depth 100', 1000, () => decompose(d, w, 'non_tail', [], o))
  time('mutual depth 100', 1000, () => decompose(d, w, 'mutual', [], o))
  time('deep_failure depth 100 (fails at the bottom, falls back)', 1000, () => decompose(d, w, 'deep_failure', [], o))
  w.clear('depth', 1)
  w.add('depth', int(1000))
  time('non_tail depth 1000 (maxDepth 2048)', 100, () => decompose(d, w, 'non_tail', [], { maxDepth: 2048 }))
})

test('bench: fact scan with backtracking (200 rows, solution near the end)', () => {
  const d = parseDomain(`(:domain Scan top_level_domain
    (:method (m) top_level_method (b (and (enemy ?e ?hp) (> ?hp 90) (armed ?e) (not (fleeing ?e))) ((!attack ?e)))))`)
  const w = new WorldState()
  for (let i = 0; i < 200; i++) w.add('enemy', int(i), int(i % 100))
  for (let i = 0; i < 200; i += 7) w.add('armed', int(i))
  w.add('fleeing', int(91))
  const r = decompose(d, w, 'm', [])
  assert.deepEqual(r.plan.map(s => s.args[0].v), [98])
  time('200-row fact scan + checks', 1000, () => decompose(d, w, 'm', []))
})

test('bench: debugger capture (gallery domains), without and with a PlanTraceRecorder', () => {
  // Without a recorder the engine tests one field per hook: compare with the planner before the debugger work
  // (docs/htn-guidance.md, Debugging, "Cost"). With one, every event becomes a node.
  const cases = [
    { name: 'complex_scenario recursive_100', domain: complexScenarioDomain, facts: complexScenarioRecursive100Facts, method: 'run_scenario', n: 50 },
    { name: 'AAACombatNPC high_order', domain: aaaCombatDomain, facts: aaaCombatNPCHighOrderFacts, method: 'run', n: 2000 }
  ]
  for (const c of cases) {
    const w = new WorldState()
    addFacts(w, c.facts)
    const o = { callterms: CALLTERM_SETS.test, context: { world: w, vars: {}, trace: [], counters: {}, errors: [] } }
    const rec = new PlanTraceRecorder(c.domain, { worlds: false })
    const plain = decompose(c.domain, w, c.method, [], o)
    const traced = decompose(c.domain, w, c.method, [], { ...o, trace: rec })
    assert.deepEqual(traced.plan, plain.plan)
    const off = time(`${c.name}: no recorder`, c.n, () => decompose(c.domain, w, c.method, [], o))
    const on = time(`${c.name}: recorder (${rec.lastPlan!.nodes.length} nodes)`, c.n, () => decompose(c.domain, w, c.method, [], { ...o, trace: rec }))
    console.log(`[bench] ${c.name}: recording costs x${(on / off).toFixed(1)}`)
  }
})

test('npm run htn:bench smoke: every scenario plans, counters, frames and bytes are reported, the crowd runs', () => {
  const tiny = { iterations: 20, samples: 20, budgetMs: 20, allocPlans: 20 }
  const results = benchCases().map(c => runCase(c, tiny))
  assert.deepEqual(results.map(r => r.name).slice(0, 6), ['Idle', 'Combat', 'Emergency', 'Mobility', 'Recovery', 'FactHeavy100'])
  for (const r of results) {
    assert.equal(r.failures, 0, r.name)
    assert.ok(r.stats.methods > 0 && r.stats.tasks > 0 && r.peakCallFrames > 0, r.name)
    assert.ok(r.p50 <= r.p95 && r.p95 <= r.p99 && r.p99 <= r.max, r.name)
    assert.ok(r.bytesPerPlan !== null && r.bytesPerPlan >= 0, r.name)
  }
  for (const text of [formatSuite(results), formatLifecycle(results), formatCounters(results), formatAlloc(results), formatOverhead(results)])
    assert.equal(text.split('\n').length, results.length + 2)
  const crowd = runCrowd({ size: 10, seconds: 5, record: false })
  assert.equal(crowd.ticks, 150)
  assert.equal(crowd.maxPlansInTick, 10, 'all ten plan in the first tick')
  assert.ok(crowd.replansPerSecond > 0 && crowd.firstTickMs > 0 && crowd.maxPeakCallFrames > 0)
  assert.deepEqual(crowd.failedChecks, [])
  assert.equal(formatCrowd([crowd]).split('\n').length, 5)
  assertCrowdMetrics(crowd)
  assert.ok(crowd.bytesPerFrame >= 0 && crowd.tickMeanMs > 0 && crowd.planP99 <= crowd.planMax)
  const at60 = runCrowd({ size: 10, seconds: 5, record: false, fps: 60 })
  assert.equal(at60.ticks, 300)
  assert.equal(crowdName(at60), '10 npcs 60fps')
  assert.equal(formatGame([crowd, at60]).split('\n').length, 6)
  const budgeted = runCrowd({ size: 10, seconds: 5, record: false, budget: { maxPlansPerFrame: 3 } })
  assert.equal(budgeted.maxPlansInTick, 3, 'the budget spreads the first tick')
  assert.ok(budgeted.budgetWaits > 0 && budgeted.budgetMaxWaitFrames >= 3)
  assert.deepEqual(budgeted.failedChecks, [])
  assert.match(formatCrowd([budgeted]), /3\/f/)
})

function assertCrowdMetrics(crowd: CrowdResult): void {
  for (const value of [crowd.tickMeanMs, crowd.tickP95, crowd.npcsPerMs, crowd.npcsPerMsP95])
    assert.ok(Number.isFinite(value) && value > 0)
  assert.equal(crowd.npcsPerMs, crowd.size / crowd.tickMeanMs)
  assert.equal(crowd.npcsPerMsP95, crowd.size / crowd.tickP95)
  assert.ok(crowd.tickP50 <= crowd.tickP95 && crowd.tickP95 <= crowd.tickP99 && crowd.tickP99 <= crowd.tickMax)
}

test('crowd metrics: a rare stall can put mean tick time above p95', t => {
  // One 1 s host stall among 120 warm ticks changes the mean, but falls beyond p95.
  let clock = 0
  let ticks = 0
  const update = CrowdLevel.prototype.update
  t.mock.method(performance, 'now', () => (clock += 0.001))
  t.mock.method(CrowdLevel.prototype, 'update', function (this: CrowdLevel, dt: number) {
    update.call(this, dt)
    if (++ticks === 31) clock += 1000
  })
  const crowd = runCrowd({ size: 10, seconds: 5, record: false })
  assert.ok(crowd.tickMeanMs > crowd.tickP95)
  assertCrowdMetrics(crowd)
  assert.ok(crowd.npcsPerMsP95 > crowd.npcsPerMs)
})
