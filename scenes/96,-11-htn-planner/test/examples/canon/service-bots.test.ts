// The SS14 service bots (src/examples/canon/service_bots): the `overrides` chain (one base shape, four bots) and the
// fact backtracking a filtered sensor list needs. (Every scenario and story: canon.test.ts.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decompose, formatTask, WorldState } from '../../../src/htn-planner'
import { addFacts } from '../../../src/examples/canon/paper'
import { NONE, planOf, station } from './helpers'

test('the mark filter on the sensor list needs fact backtracking: with every backtracking off the medic sees only the first patient', () => {
  const medic = station('medic_bot')
  const s = medic.scenarios.find(x => x.name === '6_best_patient_treated_recently_the_next_one')
  assert.ok(s)
  assert.deepEqual(planOf(medic.domain, s, NONE).plan, ['!idle_wait 2.0 7.0'])
})

test('one world, four bots: each variant reads only its own sensor fact and fills the base shape its way', () => {
  const w = () => {
    const world = new WorldState()
    addFacts(world, 'now 0.0\npatient alice\npuddle puddle_1\non_fire stove\nwants_hug bob\njob crate\ndistance_to alice 0.5\ndistance_to puddle_1 0.5\ndistance_to stove 0.5\ndistance_to bob 0.5')
    return world
  }
  const plan = (id: string) => decompose(station(id).domain, w(), 'behave', []).plan.map(p => formatTask(p.name, p.args))
  assert.deepEqual(plan('medic_bot'), ['!inject alice', '!mark_treated alice', '!say finish_inject'])
  assert.deepEqual(plan('cleaner_bot'), ['!clean puddle_1'])
  assert.deepEqual(plan('fire_bot'), ['!say fire_detected', '!wait 1.0', '!extinguish stove'])
  assert.deepEqual(plan('hug_bot'), ['!say hug_start', '!hug bob', '!wait 1.0', '!mark_hugged bob', '!say hug_finish_nice'])
})
