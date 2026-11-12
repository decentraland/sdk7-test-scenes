// Commuter (src/examples/canon/classics/commuter.domain): GTPyhop's travel example. The source's expected plans are
// golden tests (GTPYHOP_EXPECTED, from simple_htn.py main()); its acting examples are stories: a failed call plans
// the same again, a breakdown mid-ride is picked up by the re-entrant `travel`, and with both taxis bad the trip
// ends with no plan where the source's brittle methods fail with an error. (Every scenario and story: canon.test.ts.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { executed } from '../../../src/examples/canon/paper'
import { cashOf } from '../../../src/examples/canon/classics/stories'
import { ROOT, station, storyRun } from './helpers'

const FILE = 'src/examples/canon/classics/commuter.domain'

/** The expected plans in the source (simple_htn.py, main()), formatted as our plans. */
const GTPYHOP_EXPECTED = {
  /** find_plan(state1, [('travel','alice','park')]) */
  alice: ['!call_taxi alice home_a', '!ride_taxi alice park', '!pay_driver alice park'],
  /** find_plan(state1, [('travel','alice','park'), ('travel','bob','park')]) */
  aliceThenBob: ['!call_taxi alice home_a', '!ride_taxi alice park', '!pay_driver alice park', '!walk bob home_b park'],
  /** After run_lazy_lookahead got Alice to the park: find_plan(new_state, [('travel','alice','park')]) */
  arrived: [] as string[]
}

const scenario = (name: string) => station('commuter').scenarios.find(s => s.name === name)!

test('commuter golden: the source’s expected plans', () => {
  assert.deepEqual(scenario('1_alice_to_the_park').expect, GTPYHOP_EXPECTED.alice)
  assert.deepEqual([scenario('3_alice_already_at_the_park').status, scenario('3_alice_already_at_the_park').expect], ['succeeded', GTPYHOP_EXPECTED.arrived])
  // Two tasks: one decomposition plans Alice's trip and defers Bob's; running it gives the source's plan.
  const run = storyRun('commuter/two-trips-the-source-plan')
  assert.deepEqual(executed(run.trace), GTPYHOP_EXPECTED.aliceThenBob)
  // The source's fare: 1.5 + 0.5 x 8 = 5.5 from Alice's 20.
  assert.equal(cashOf(run.stage.agents[0].world, 'alice'), 14.5)
})

test('commuter: after the lazy-lookahead run Alice is at the park, and travel plans nothing (the source’s last check)', () => {
  const run = storyRun('commuter/the-taxi-does-not-come')
  assert.ok(run.trace.includes('plan: (empty)'))
  assert.ok(run.stage.agents[0].world.rows('at', 2).some(r => r[0].v === 'alice' && r[1].v === 'park'))
})

test('commuter: a run-time failure makes the replan pick the next way (the re-entrant method), not the same plan', () => {
  const trace = storyRun('commuter/the-taxi-breaks-down-get-out-call-another').trace
  const failed = trace.indexOf('fail !ride_taxi alice park')
  assert.equal(trace[failed + 1], 'plan: !leave_taxi alice home_a, &travel alice park', 'the replan reads taxi_broken')
  // The second taxi is the host's pick (taxi1 is broken): the trip ends at the park.
  assert.deepEqual(trace.slice(-1), ['plan: (empty)'])
})

test('commuter: the header credits GTPyhop’s files at a pinned commit, and the notices carry its licence', () => {
  const header = fs.readFileSync(nodePath.join(ROOT, FILE), 'utf8')
  assert.match(header, /GTPyhop\/blob\/1ca7773963443476d0e83d03f10efab325327565\/Examples\/simple_htn\.py/)
  const notices = fs.readFileSync(nodePath.join(ROOT, 'src/examples/canon/THIRD_PARTY_NOTICES.md'), 'utf8')
  assert.match(notices, /The Clear BSD License\s+Copyright \(c\) 2021 University of Maryland/)
})
