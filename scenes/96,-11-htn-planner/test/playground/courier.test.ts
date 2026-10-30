// The player walking onto the pad mid-carry must not cut the courier's plan: it used to replan on sight, leave the box
// in its hands, and every next plan failed on !pick_up forever.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CourierLevel } from '../../src/playground/levels/courier'
import { v3 } from '../../src/htn-planner'

const DT = 1 / 30

function runUntil(level: CourierLevel, done: () => boolean, seconds: number): boolean {
  for (let t = 0; t < seconds; t += DT) {
    level.update(DT)
    if (done()) return true
  }
  return false
}

test('courier: the player on the pad does not cut a carry', () => {
  const level = new CourierLevel().init()
  level.testerPaused = true
  level.pile = 1
  assert.ok(runUntil(level, () => level.carrying, 20), 'never picked the box up')

  level.player = v3(0, 0, 0)
  assert.ok(
    runUntil(level, () => level.shelves.shelf_a + level.shelves.shelf_b === 1 && !level.carrying, 30),
    `box never reached a shelf (pile ${level.pile}, carrying ${level.carrying}, replans ${level.replans})`
  )
})
