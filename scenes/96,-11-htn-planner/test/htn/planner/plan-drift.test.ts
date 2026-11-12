// Facts now vs what the plan expects (src/htn-planner/htn/plan-drift.ts): the facts the chosen path matched, with the
// values it bound, re-checked against the world as it is now; `not` facts it passed must stay absent; the committed
// candidate of a choice fact only; facts inside an axiom; a failed run has nothing to check.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decompose, formatDrift, int, planDrift, PlanTraceRecorder, snapshotRows, snapshotWorld, sym, WorldState } from '../../../src/htn-planner'
import { compileDomainSource } from '../../../tools/htn/compiler'
import { findRunnerWorld, runDomain, runnerCatalogue, worldFrom } from '../../../src/debugger/runner'
import { GALLERY_STATIONS } from '../../../src/examples/upstream/gallery'
import { LAB_STATIONS } from '../../../src/examples/upstream/lab'
import { MODES } from '../../../src/examples/upstream/stations'

const DOMAIN = `
(:domain store top_level_domain
    (:axiom (open_shop ?out_s) (and (shop ?out_s) (door_open ?out_s)))
    (:method (behave) top_level_method
        (buy (and (have_money ?m) (item ?i ?price) (<= ?price ?m) (not (closed ?i)) (#open_shop ?s))
             ((!walk_to ?s) (!buy ?i)))
        (wait () ((!wait)))))
`

function plan() {
  const r = compileDomainSource('store.domain', DOMAIN)
  assert.ok(r.ok && r.ir, JSON.stringify(r.diagnostics))
  const domain = r.ir!
  const world = new WorldState()
  world.add('have_money', int(20))
  world.add('item', sym('car'), int(500))
  world.add('item', sym('bread'), int(3))
  world.add('shop', sym('market'))
  world.add('door_open', sym('market'))
  const recorder = new PlanTraceRecorder(domain)
  decompose(domain, world, 'behave', [], { trace: recorder })
  assert.equal(recorder.lastPlan!.status, 'succeeded')
  return { domain, world, run: recorder.lastPlan! }
}

test('nothing moved: every fact of the chosen path still holds', () => {
  const { domain, world, run } = plan()
  const d = planDrift(domain, run, world)
  // have_money, item (the committed candidate only), not closed, and the axiom's shop and door_open.
  assert.equal(d.checked, 5)
  assert.deepEqual(d.items, [])
  assert.deepEqual(formatDrift(d), ['facts now: 5 checked, all hold'])
})

test('a fact the plan matched is gone, a not fact appeared, a fact inside an axiom changed', () => {
  const { domain, world, run } = plan()
  world.removeWhere('item', 2, r => r[0].v === 'bread')
  world.add('closed', sym('bread'))
  world.clear('door_open', 1)
  world.add('door_open', sym('bakery'))
  const d = planDrift(domain, run, world)
  assert.deepEqual(
    d.items.map(i => [i.branch, i.drift, i.fact, i.text]),
    [
      ['behave.buy', 'gone', '(item bread 3)', 'gone: no (item bread 3) now; item/2 has (item car 500)'],
      ['behave.buy', 'present', '(closed bread)', 'present: (closed bread) (the plan passed (not (closed bread)))'],
      ['behave.buy', 'gone', '(door_open market)', 'gone: no (door_open market) now; door_open/1 has (door_open bakery)']
    ]
  )
  assert.equal(d.items[0].source, 'store.domain:5')
  assert.deepEqual(formatDrift(d).slice(0, 2), ['facts now: 3 of 5 no longer hold', '  × behave.buy  gone: no (item bread 3) now; item/2 has (item car 500)  store.domain:5'])
  // A candidate the plan rejected (car) is not what it expects: removing it is no drift.
  const again = plan()
  again.world.removeWhere('item', 2, r => r[0].v === 'car')
  assert.deepEqual(planDrift(again.domain, again.run, again.world).items, [])
})

test('a snapshot reads as a world; a failed or missing run has nothing to check', () => {
  const { domain, world, run } = plan()
  world.clear('have_money', 1)
  const d = planDrift(domain, run, snapshotRows(snapshotWorld(world)))
  assert.deepEqual(d.items.map(i => i.fact), ['(have_money 20)'])
  assert.deepEqual(planDrift(domain, null, world), { checked: 0, items: [] })
  assert.deepEqual(planDrift(domain, { ...run, status: 'no_plan' }, world), { checked: 0, items: [] })
})

test('gallery AAA melee: the plan rests on the visible enemy; it leaves sight, the drift says so', () => {
  const found = findRunnerWorld(runnerCatalogue([...GALLERY_STATIONS, ...LAB_STATIONS]), 'aaa/melee-nearest-enemy')!
  const r = runDomain({ domain: found.domain.domain, method: 'run', world: found.world, mode: MODES[0].mode, repeats: 0 })
  const now = worldFrom(r.recorder.world(r.run.world)!)
  assert.deepEqual(planDrift(found.domain.domain, r.run, now).items, [])
  now.removeWhere('visible_enemy', 2, row => row[1].v === 202)
  const d = planDrift(found.domain.domain, r.run, now)
  assert.deepEqual(
    d.items.map(i => [i.branch, i.fact]),
    [['run.visible_combat', '(visible_enemy 1 202)']]
  )
})
