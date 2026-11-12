// "Why not X?" over a recorded run (src/htn-planner/htn/why-not.ts): the failing term per attempted binding, needed
// vs the world's rows, never reached behind an earlier branch, a method never decomposed (and why its callers were not
// taken), abandoned and discarded branches, a primitive in the plan, a name not in the domain. On gallery scenarios
// (the upstream AAA Combat NPC, hierarchical backtracking) and small domains of our own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decompose, formatWhyNot, int, PlanTraceRecorder, sym, whyNode, whyNot, WorldState } from '../../../src/htn-planner'
import type { DomainIR } from '../../../src/htn-planner'
import { compileDomainSource } from '../../../tools/htn/compiler'
import { findRunnerWorld, runDomain, runnerCatalogue } from '../../../src/debugger/runner'
import { GALLERY_STATIONS } from '../../../src/examples/upstream/gallery'
import { LAB_STATIONS } from '../../../src/examples/upstream/lab'
import { MODES } from '../../../src/examples/upstream/stations'

const SHOP = `
(:domain shop top_level_domain
    (:method (behave) top_level_method
        (buy
            (and (have_money ?m) (> ?m 10) (item ?i ?price) (<= ?price ?m))
            ((!buy ?i)))
        (enter (or (door_open store) (not (closed ?x))) ((!enter)))
        (wait () ((!wait)))
        (later () ((!never)))))
`

function compile(text: string, file = 'shop.domain'): DomainIR {
  const r = compileDomainSource(file, text)
  assert.ok(r.ok && r.ir, JSON.stringify(r.diagnostics))
  return r.ir!
}

function shop() {
  const domain = compile(SHOP)
  const world = new WorldState()
  world.add('have_money', int(20))
  world.add('item', sym('car'), int(500))
  world.add('item', sym('boat'), int(300))
  world.add('door_open', sym('back'))
  world.add('door_open', sym('front'), sym('back'))
  world.add('closed', sym('front'))
  const recorder = new PlanTraceRecorder(domain)
  decompose(domain, world, 'behave', [], { trace: recorder })
  const ask = (query: string) => whyNot({ query, domain, runs: [recorder.lastPlan!], world: rev => recorder.world(rev) })
  return { domain, recorder, ask }
}

test('a condition that failed for every candidate: one failing term per binding, not the exhausted choice fact', () => {
  const { ask } = shop()
  const w = ask('buy')
  assert.equal(w.verdict, 'failed')
  assert.deepEqual(w.matched, ['behave.buy', '!buy'])
  const a = w.attempts[0]
  assert.equal(a.name, 'behave.buy')
  assert.equal(a.outcome, 'no_match')
  assert.deepEqual(
    a.terms.map(t => [t.term, t.why, t.bindings]),
    [
      ['(<= ?price=500 ?m=20)', 'false', 'm=20 i=car price=500'],
      ['(<= ?price=300 ?m=20)', 'false', 'm=20 i=boat price=300']
    ]
  )
  assert.equal(a.terms[0].source, 'shop.domain:5')
  assert.ok(!a.terms.some(t => t.term.startsWith('(item') || t.term.startsWith('(have_money')), 'a choice fact that ran out of rows is not the cause')
})

test('a fact: the row it needed against the rows the world has, the closest first; another arity; not: the row that matched', () => {
  const { ask } = shop()
  const w = ask('behave.enter')
  const [fact, not] = w.attempts[0].terms
  assert.equal(fact.term, '(door_open store)')
  assert.equal(fact.needed, '(door_open store)')
  assert.deepEqual(fact.found, ['(door_open back)'])
  assert.equal(fact.rows, 1)
  assert.deepEqual(fact.otherArity, ['door_open/2: 1 row'])
  assert.equal(fact.why, 'no row matches (door_open store); 1 row of door_open/1, closest (door_open back): arg 1 is back, not store')
  assert.equal(not.term, '(not (closed ?x))')
  assert.equal(not.needed, 'no (closed ?x)')
  assert.deepEqual(not.found, ['(closed front)'])
  assert.equal(not.why, 'world has (closed front)')
})

test('never reached: an earlier branch succeeded; a primitive of that branch says the same; chosen and in the plan', () => {
  const { ask } = shop()
  const later = ask('later')
  assert.equal(later.verdict, 'not_reached')
  assert.equal(later.attempts[0].shadowedBy, 'behave.wait')
  assert.equal(later.summary, 'behave.later: never reached in (behave): an earlier branch succeeded (behave.wait)')
  assert.deepEqual(ask('!never').attempts, later.attempts)
  assert.deepEqual(ask('never').attempts, later.attempts, 'the ! is optional')
  const wait = ask('behave.wait')
  assert.equal(wait.verdict, 'chosen')
  assert.equal(wait.attempts[0].text, 'chosen in (behave)')
  const prim = ask('!wait')
  assert.equal(prim.verdict, 'in_plan')
  assert.deepEqual(prim.steps, ['run #1 step 1: !wait'])
})

test('a method: every branch of it, tried and not reached; a name not in the domain, with names alike', () => {
  const { ask } = shop()
  const m = ask('behave')
  assert.equal(m.verdict, 'chosen')
  assert.deepEqual(
    m.attempts.map(a => [a.name, a.outcome]),
    [
      ['behave.buy', 'no_match'],
      ['behave.enter', 'no_match'],
      ['behave.wait', 'chosen'],
      ['behave.later', 'not_reached']
    ]
  )
  const none = ask('byu')
  assert.equal(none.verdict, 'not_in_domain')
  assert.deepEqual(none.attempts, [])
  assert.ok(none.suggestions?.includes('behave.buy'), JSON.stringify(none.suggestions))
  assert.match(none.summary, /^'byu' is not in domain shop: no method, branch or primitive of that name; did you mean .*behave\.buy/)
})

test('formatWhyNot: the verdict line, the summary, attempts with their terms indented', () => {
  const { ask } = shop()
  assert.deepEqual(formatWhyNot(ask('buy')), [
    'why not buy: failed',
    '  behave.buy: condition failed in (behave): (<= ?price=500 ?m=20) false (+1 more)',
    '  matched: behave.buy, !buy',
    '  × behave.buy  no_match  condition failed in (behave): (<= ?price=500 ?m=20) false (+1 more)  shop.domain:4',
    '      × (<= ?price=500 ?m=20)  false  {m=20 i=car price=500}  shop.domain:5',
    '      × (<= ?price=300 ?m=20)  false  {m=20 i=boat price=300}  shop.domain:5'
  ])
})

// ---- gallery: the upstream AAA Combat NPC and hierarchical backtracking -----------------------------------------

const catalogue = runnerCatalogue([...GALLERY_STATIONS, ...LAB_STATIONS])

function scenario(id: string) {
  const found = findRunnerWorld(catalogue, id)
  assert.ok(found, id)
  const r = runDomain({ domain: found.domain.domain, method: found.world.method!, world: found.world, mode: MODES[0].mode, repeats: 0 })
  return (query: string) => whyNot({ query, domain: found.domain.domain, runs: [r.run], world: rev => r.recorder.world(rev) })
}

test('gallery AAA melee: a numeric guard false, a fact the world lacks, a branch behind the chosen one', () => {
  const ask = scenario('aaa/melee-nearest-enemy')
  const retreat = ask('critical_retreat')
  assert.equal(retreat.verdict, 'failed')
  assert.equal(retreat.attempts[0].call, '(combat_tick 1 202 3)')
  assert.equal(retreat.attempts[0].terms[0].term, '(<= ?hp=85 20)')
  const parry = ask('melee_tick.parry_counter')
  assert.equal(parry.attempts[0].terms[0].term, '(enemy_attacking ?inp_enemy=202)')
  assert.equal(parry.attempts[0].terms[0].why, 'world has no enemy_attacking/1 rows')
  const ranged = ask('combat_tick.ranged')
  assert.equal(ranged.verdict, 'not_reached')
  assert.equal(ranged.attempts[0].shadowedBy, 'combat_tick.melee')
  const script = ask('high_priority_script')
  assert.equal(script.attempts[0].terms[0].term, '(scripted_order ?npc=1 high ?order ?target)')
  assert.equal(script.attempts[0].terms[0].needed, '(scripted_order 1 high ?order ?target)')
})

test('gallery AAA melee: a primitive in a method never decomposed: why the branches that call it were not taken', () => {
  const ask = scenario('aaa/melee-nearest-enemy')
  const w = ask('!fire_burst')
  assert.equal(w.verdict, 'not_reached')
  const top = w.attempts[0]
  assert.equal(top.outcome, 'not_decomposed')
  assert.equal(top.text, 'ranged_tick was never decomposed: no branch that calls it was taken (combat_tick.ranged)')
  assert.deepEqual(
    top.nested.map(a => [a.name, a.outcome, a.shadowedBy]),
    [['combat_tick.ranged', 'not_reached', 'combat_tick.melee']]
  )
})

test('gallery hierarchical backtracking: an abandoned branch names the failed task and why its method had no branch', () => {
  const ask = scenario('hierarchical/child-guard')
  const w = ask('do_behavior_child_guard.branch_combat')
  const a = w.attempts[0]
  assert.equal(a.outcome, 'abandoned')
  assert.equal(a.task, '(do_combat_guarded ?inp_threat=enemy)')
  assert.deepEqual(
    a.nested.map(n => [n.name, n.outcome, n.terms[0]?.term]),
    [
      ['do_combat_guarded.branch_fire', 'no_match', '(in_combat_state)'],
      ['do_combat_guarded.branch_wait', 'no_match', '(in_combat_state)']
    ]
  )
})

test('discarded: a branch that held and decomposed, dropped because a later task above it failed', () => {
  const domain = compile(
    `(:domain d top_level_domain
      (:method (behave) top_level_method
        (both () ((sub) (check)))
        (fallback () ((!rest))))
      (:method (sub) (pick () ((!pick))))
      (:method (check) (ok (and (ready)) ((!go)))))`,
    'd.domain'
  )
  const world = new WorldState()
  const recorder = new PlanTraceRecorder(domain)
  decompose(domain, world, 'behave', [], { trace: recorder })
  const w = whyNot({ query: '!pick', domain, runs: [recorder.lastPlan!], world: rev => recorder.world(rev) })
  assert.equal(w.verdict, 'failed')
  assert.equal(w.attempts[0].outcome, 'discarded')
  assert.equal(w.attempts[0].text, 'held and decomposed in (sub), then dropped: behave.both failed above it')
  // The node view of the method: every branch of it.
  const run = recorder.lastPlan!
  const root = run.nodes.find(n => n.kind === 'method' && domain.methods[n.ref].name === 'behave')!
  const node = whyNode(domain, run, root.id, rev => recorder.world(rev))
  assert.deepEqual(
    node.attempts.map(a => [a.name, a.outcome, a.task]),
    [
      ['behave.both', 'abandoned', '(check)'],
      ['behave.fallback', 'chosen', undefined]
    ]
  )
  assert.equal(node.attempts[0].nested[0].terms[0].why, 'world has no ready/0 rows')
  // A failed fact node on its own.
  const fact = run.nodes.find(n => n.kind === 'fact')!
  assert.deepEqual(
    whyNode(domain, run, fact.id).terms.map(t => [t.term, t.why]),
    [['(ready)', 'world has no ready/0 rows']]
  )
})

test('no recorded run, and without the world snapshot a failed fact falls back to the rows it recorded', () => {
  const { domain, recorder } = shop()
  assert.equal(whyNot({ query: 'buy', domain, runs: [] }).verdict, 'no_run')
  const w = whyNot({ query: 'enter', domain, runs: [recorder.lastPlan!] })
  const fact = w.attempts[0].terms[0]
  assert.deepEqual(fact.found, ['(door_open back)'])
  assert.equal(fact.otherArity, undefined, 'other arities need the snapshot')
  assert.match(fact.why, /1 row of door_open\/1 \(first ones\)/)
})
