// Debugging an NPC by pointing at it (src/debugger/interact.ts): the key map, what a press does on an NPC and off
// one, the hover text, the console dump. Pure.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { str, sym, vec3, WorldState } from '../../src/htn-planner'
import { dumpText, hoverText, NPC_KEYS, resolvePress } from '../../src/debugger/interact'

test('NPC_KEYS: E, F, 1-4, one action each; 1-3 also work without an NPC under the cursor', () => {
  assert.deepEqual(
    NPC_KEYS.map(k => k.key),
    ['E', 'F', '1', '2', '3', '4']
  )
  assert.equal(new Set(NPC_KEYS.map(k => k.action)).size, NPC_KEYS.length)
  assert.deepEqual(
    NPC_KEYS.filter(k => k.anywhere).map(k => k.key),
    ['1', '2', '3']
  )
  for (const k of NPC_KEYS) assert.ok(k.hint.length > 0 && k.hint.length <= 20, k.hint)
})

test('resolvePress: on an NPC every key acts on it; off one only the anywhere keys, on everyone', () => {
  assert.deepEqual(resolvePress('replan', 'a'), { action: 'replan', host: 'a' })
  assert.equal(resolvePress('replan', undefined), null)
  assert.equal(resolvePress('dump', undefined), null)
  assert.deepEqual(resolvePress('detail', undefined), { action: 'detail', host: null })
  assert.deepEqual(resolvePress('detail', 'a'), { action: 'detail', host: 'a' })
  assert.deepEqual(resolvePress('pause', undefined), { action: 'pause', host: null })
})

test('hoverText: the name and the running step, plain text, cut', () => {
  assert.equal(hoverText('guard-3', '!chase tester', 'chase'), 'guard-3: !chase tester')
  assert.equal(hoverText('guard-3', '', 'patrol'), 'guard-3: patrol')
  const long = hoverText('guard-3', '!say "' + 'x'.repeat(100) + '"', 'patrol')
  assert.ok(long.length <= 60 && long.endsWith('…'), long)
})

test('dumpText: the host, its goal and why, its plan and its world, one fact per line', () => {
  const world = new WorldState()
  world.add('at', sym('guard-3'), vec3(1, 0, 2))
  world.add('alert', str('high'))
  const text = dumpText({
    id: 'crowd:guard-3',
    label: 'guard-3',
    domain: 'guard',
    status: { state: 'chase', lastStatus: 'succeeded', reason: 'perception | -> tester|', current: '!chase tester', steps: ['!chase tester', '!forget tester'], done: ['!move_to (1 0 2)'] },
    goal: { method: 'behave', branch: 'chase_visible' },
    world
  })
  const lines = text.split('\n')
  assert.ok(lines[0].startsWith('[htn-debug] crowd:guard-3'), lines[0])
  assert.ok(text.includes('goal: behave → chase_visible'))
  assert.ok(text.includes('why: perception: nothing → sees tester'), text)
  assert.ok(text.includes('plan: ▶ !chase tester | !forget tester'), text)
  assert.ok(text.includes('done: !move_to (1 0 2)'))
  assert.ok(lines.some(l => l.trim().startsWith('at(guard-3')), text)
  assert.ok(lines.some(l => l.trim() === 'alert("high")'), text)
  assert.ok(text.includes('world: 2 facts'), text)
})

test('dumpText: with the structured replan, why is its trigger, the facts that changed and the outcome', () => {
  const text = dumpText({
    id: 'crowd:guard-3',
    label: 'guard-3',
    domain: 'guard',
    status: {
      state: 'chase',
      lastStatus: 'succeeded',
      reason: 'debug',
      replan: { type: 'replan', guard: 'guard-3', reason: 'debug', status: 'succeeded', plan: ['!chase tester'], kept: false, passes: 1, trigger: 'debug', changes: ['+ (target_visible tester)'], changed: true },
      current: '!chase tester',
      steps: ['!chase tester'],
      done: []
    },
    goal: null,
    world: new WorldState()
  })
  const why = text.split('\n').find(l => l.startsWith('why: '))!
  assert.ok(why.startsWith('why: debug · changed'), why) // the trigger said once
  assert.ok(why.includes('changed: + (target_visible tester)') && why.includes('new plan'), why)
})
