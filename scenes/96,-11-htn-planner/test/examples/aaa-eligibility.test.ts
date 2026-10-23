// Upstream is a verbatim reference, including its known target-selection defect.
import { compileDomainFile } from '../../tools/htn/compiler'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decompose, formatTask, int, WorldState } from '../../src/htn-planner'
import { aaaCombatDomain } from '../../src/examples/upstream/generated/AAACombatNPC.htn'
import { aaaEligibleCombatDomain } from '../../src/examples/upstream/adapted/AAACombatNPC.htn'

function world(dead: number[] = [101]) {
  const w = new WorldState()
  w.add('controlled_npc', int(1))
  for (const [id, distance] of [[101, 2], [202, 5]]) {
    w.add('visible_enemy', int(1), int(id))
    w.add('hostile_enemy', int(id))
    w.add('enemy_distance', int(1), int(id), int(distance))
  }
  for (const id of dead) w.add('enemy_dead', int(id))
  return w
}

test('AAA: preserved upstream demonstrates the dead-nearer-target limitation', () => {
  const r = decompose(aaaCombatDomain, world(), 'run', [])
  assert.equal(r.status, 'succeeded')
  assert.deepEqual(r.plan.map(p => formatTask(p.name, p.args)),
    ['!announce_state "idle" 1', '!play_idle_animation 1', '!check_surroundings 1'])
})

test('AAA adaptation: rank only eligible enemies, with either branch-backtracking policy', () => {
  for (const branches of [false, true]) {
    for (const [dead, target] of [[[101], 202], [[], 101]] as [number[], number][]) {
      const r = decompose(aaaEligibleCombatDomain, world(dead), 'run', [],
        { mode: { factsAndAxioms: true, branches } })
      assert.equal(r.status, 'succeeded')
      assert.deepEqual(r.plan.map(p => formatTask(p.name, p.args)), [
        '!announce_state "combat" 1', '!dodge_enemy 1 ' + target, '!improvised_melee_attack 1 ' + target
      ])
    }
    const r = decompose(aaaEligibleCombatDomain, world([101, 202]), 'run', [],
      { mode: { factsAndAxioms: true, branches } })
    assert.deepEqual(r.plan.map(p => formatTask(p.name, p.args)),
      ['!announce_state "idle" 1', '!play_idle_animation 1', '!check_surroundings 1'])
  }
})

test('AAA adaptation: checked-in module matches its domain source', () => {
  const compiled = compileDomainFile('src/examples/upstream/adapted/AAACombatNPC.domain')
  assert.ok(compiled.ok)
  assert.deepEqual(aaaEligibleCombatDomain, compiled.ir)
})
