// Level 7's Spawn and Give up buttons: each spawn kind starts the stalker the way its branch list says, with you
// (the player) standing in the field and the tester paused.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StalkerLevel, StalkerSpawn } from '../../src/playground/levels/stalker'
import { v3 } from '../../src/htn-planner'

const DT = 1 / 30

function level(kind: StalkerSpawn): StalkerLevel {
  const l = new StalkerLevel().init()
  l.spawn(kind)
  return l
}

/** Run until the chosen branch is one of `names`; the seconds it took. */
function until(l: StalkerLevel, names: string[], seconds: number): number {
  for (let t = 0; t < seconds; t += DT) {
    l.update(DT)
    if (names.some(n => l.doing(n))) return t
  }
  assert.fail(`no ${names.join(' / ')} within ${seconds} s (chosen ${l.chosen}, ${l.agent.lastReplanReason})`)
}

test('a Spawn button pauses the tester and Reset brings back the patrol', () => {
  const l = level('stand')
  assert.equal(l.testerPaused, true)
  assert.equal(l.spawnKind, 'stand')
  l.reset()
  assert.equal(l.testerPaused, false)
  assert.equal(l.spawnKind, 'patrol')
  until(l, ['walk_route'], 5)
})

test('stand: watching in the field, it notices you in front of it, then chases', () => {
  const l = level('stand')
  l.player = v3(0, 0, -8) // further than target_close: noticed because it watches
  until(l, ['notice_seen_target'], 10)
  until(l, ['chase_noticed_target', 'chase_ignoring_noise'], 15)
})

test('chase: it starts having noticed you and runs at you', () => {
  const l = level('chase')
  l.player = v3(0, 0, 0)
  until(l, ['chase_noticed_target', 'chase_ignoring_noise'], 5)
  until(l, ['stand_over_caught'], 15)
})

test('cross: it walks its route and starts watching on the way', () => {
  const l = level('cross')
  until(l, ['walk_route'], 5)
  for (let t = 0; t < 30 && !l.agent.blackboard.world.rows('watching', 1).length; t += DT) l.update(DT)
  assert.ok(l.agent.blackboard.world.rows('watching', 1).length > 0, 'never started watching')
})

test('Give up: chasing you, it gives up and walks off', () => {
  const l = level('chase')
  l.player = v3(0, 0, 0)
  until(l, ['chase_noticed_target', 'chase_ignoring_noise'], 5)
  l.giveUp()
  until(l, ['leave', 'walked_off'], 5)
})
