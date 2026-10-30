// Regression expectations derive from the domain strategy, not captured planner output.
// These unregistered stories use semantic assertions below; their unused trace expectations are empty.
import { SquadHost } from '../../../src/examples/canon/arrest_team/stories'
import { DOOR_HOST, delivered } from '../../../src/examples/canon/door_helper/stories'
import { KITCHEN_HOST } from '../../../src/examples/canon/soup_kitchen/stories'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decompose, formatTask, int, sym } from '../../../src/htn-planner'
import { story, has } from '../../../src/examples/canon/paper'
import { FETCH_HOST, fetched } from '../../../src/examples/canon/fetcher/stories'
import { playStory } from '../../../tools/htn/canon'
import { CANON, station, worldOf } from './helpers'

const FETCH_WORLD = '08_place_known_too_far_for_a_round_trip_take_the_charger_along'

test('fetcher: a full battery still needs the charger for a long trip, including a replan after charging', () => {
  const w = worldOf('fetcher', FETCH_WORLD)
  w.clear('battery', 1)
  w.add('battery', int(4))
  const plan = decompose(station('fetcher').domain, w, 'behave', [])
  // Charging alone cannot make this trip possible. Take the charger before retrying travel.
  assert.equal(plan.status, 'succeeded')
  assert.deepEqual(plan.plan.map(p => formatTask(p.name, p.args)),
    ['!charge', '!take charger', '&travel_to l4', '&fetch o1'])
  // The bounded plan assertion above fails before invoking the old executor's unbounded expansion.
  const run = playStory(CANON, story({
    station: 'fetcher', name: 'charged then interrupted', blurb: '', from: FETCH_WORLD,
    method: 'behave', host: FETCH_HOST, until: fetched, maxSteps: 12,
    events: [{ afterStep: 1, note: 'interrupt after charge, before taking charger', replan: true }],
    expect: []
  }))
  assert.ok(fetched(run.stage.agents[0].world), 'the interrupted fetch must finish')
})

test('split kitchen: every handoff can resume after replan or one failed interaction', () => {
  for (const afterStep of [1, 2, 3, 6, 7, 8]) {
    let attempts = 0
    const run = playStory(CANON, story({
      station: 'soup_kitchen', name: 'handoff interrupted', blurb: '',
      from: '2_add_onion_through_counter', method: 'make_soup', args: [sym('soup'), sym('delivery')],
      host: KITCHEN_HOST, maxSteps: 24, expect: [],
      until: w => has(w, 'holding', sym('delivery'), sym('soup')),
      events: [{ afterStep, note: 'replan during transfer', replan: true }],
      fails: () => ++attempts === afterStep + 1
    }))
    assert.ok(has(run.stage.agents[0].world, 'holding', sym('delivery'), sym('soup')),
      'delivery after interruption at step ' + afterStep)
    assert.ok(has(run.stage.agents[0].world, 'holding', sym('counter'), sym('empty')))
  }
  const run = playStory(CANON, story({
    station: 'soup_kitchen', name: 'failed transfer', blurb: '',
    from: '2_add_onion_through_counter', method: 'make_soup', args: [sym('soup'), sym('delivery')],
    host: KITCHEN_HOST, maxSteps: 24, expect: [],
    until: w => has(w, 'holding', sym('delivery'), sym('soup')),
    fails: (step, _w, attempt) => step === '!interact chef1 counter' && attempt === 1
  }))
  assert.ok(has(run.stage.agents[0].world, 'holding', sym('delivery'), sym('soup')))
})

test('door helper: a replan after crossing or releasing the door still releases the helper', () => {
  for (const afterStep of [3, 4]) {
    const run = playStory(CANON, story({
      station: 'door_helper', name: 'post-crossing interruption', blurb: '',
      from: '07_the_helper_has_arrived', method: 'behave', host: DOOR_HOST,
      until: delivered, maxSteps: 15, expect: [],
      events: [{ afterStep, note: 'interrupt cleanup', replan: true }]
    }))
    const w = run.stage.agents[0].world
    assert.ok(delivered(w), 'cargo delivered: ' + run.trace.join('; '))
    assert.deepEqual(w.rows('claimed', 2), [], 'helper is no longer claimed')
    assert.deepEqual(w.rows('holding_door', 2), [], 'no retained door hold')
    assert.deepEqual(w.rows('door_held', 2), [], 'door has no holder')
    assert.ok(has(w, 'status', sym('r2'), sym('free')))
  }
})

test('arrest team: completed bandaging clears the wound and does not restart', () => {
  const run = playStory(CANON, {
    station: 'arrest_team', name: 'healed member', blurb: '', expect: [],
    play: stage => {
      const team = stage.agent({ world: stage.scenario('6_bandage_when_quiet'), method: 'squad_tick' })
      const host = new SquadHost(stage, team)
      for (let n = 0; n < 5; n++) host.tick()
    }
  })
  assert.deepEqual(run.stage.agents[0].world.rows('wounded', 1), [])
  assert.deepEqual(run.stage.agents[0].world.rows('reserved', 1), [])
  assert.equal(run.trace.filter(s => s.includes(': !bandage_self b')).length, 1)
})

test('door helper: self-held doors and failed cleanup remain resumable', () => {
  for (const from of ['07_the_helper_has_arrived', '02_spring_door_learned_hold_it_yourself']) {
    const run = playStory(CANON, story({
      station: 'door_helper', name: 'release retry', blurb: '', from,
      method: 'behave', host: DOOR_HOST, until: delivered, maxSteps: 40, expect: [],
      events: [{ afterStep: 3, note: 'replan immediately after pass', replan: true }],
      fails: (step, _w, attempt) => step.startsWith('!release_door') && attempt === 1
    }))
    const w = run.stage.agents[0].world
    assert.ok(delivered(w), run.trace.join('; '))
    assert.deepEqual(w.rows('crossing_cleanup', 3), [])
    assert.deepEqual(w.rows('claimed', 2), [])
    assert.deepEqual(w.rows('holding_door', 2), [])
  }
})
