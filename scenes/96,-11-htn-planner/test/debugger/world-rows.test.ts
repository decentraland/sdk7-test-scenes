// The World tab (src/debugger/world-rows.ts): facts grouped by name/arity, + / − / ~ against the world before.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { float, int, snapshotWorld, str, sym, WorldState } from '../../src/htn-planner'
import { worldView } from '../../src/debugger/world-rows'

function worlds() {
  const w = new WorldState()
  w.add('at', sym('npc'), sym('door'))
  w.add('hp', int(80))
  w.add('item', sym('key'), sym('shelf'))
  w.add('item', sym('lamp'), sym('desk'))
  w.add('noise', str('step'))
  const before = snapshotWorld(w)
  w.set('at', sym('npc'), sym('hall')) // same leading value: ~
  w.set('hp', int(60)) // one value: ~
  w.removeWhere('item', 2, r => r[0].v === 'lamp') // −
  w.add('item', sym('box'), sym('floor')) // + (another leading value)
  w.add('speed', float(1.25)) // a new fact: +
  w.clear('noise', 1) // a fact gone: −
  return { before, after: snapshotWorld(w) }
}

test('grouped by fact, sorted, with + / − / ~ and what a changed row was', () => {
  const { before, after } = worlds()
  const v = worldView(after, before)
  const text = v.lines.map(l => (l.kind === 'group' ? `[${l.key} ${l.rows} +${l.added} -${l.removed} ~${l.changed}]` : `${l.mark} ${l.values}${l.was ? ' was ' + l.was : ''}`))
  assert.deepEqual(text, [
    '[at/2 1 +0 -0 ~1]',
    '~ npc  hall was npc  door',
    '[hp/1 1 +0 -0 ~1]',
    '~ 60 was 80',
    '[item/2 2 +1 -1 ~0]',
    '= key  shelf',
    '+ box  floor',
    '- lamp  desk',
    '[noise/1 0 +0 -1 ~0]',
    '- "step"',
    '[speed/1 1 +1 -0 ~0]',
    '+ 1.25'
  ])
  assert.deepEqual(v.counts, { facts: 4, rows: 5, added: 2, removed: 2, changed: 2 })
})

test('changed only, a name filter, no world before (no marks), no world', () => {
  const { before, after } = worlds()
  const changed = worldView(after, before, { changedOnly: true })
  assert.ok(changed.lines.every(l => l.kind === 'group' || l.mark !== '='))
  assert.equal(changed.lines.filter(l => l.kind === 'group').length, 5)
  const items = worldView(after, before, { filter: 'IT' })
  assert.deepEqual(items.lines.filter(l => l.kind === 'group').map(l => l.key), ['item/2'])
  const plain = worldView(after, undefined)
  assert.ok(plain.lines.every(l => l.kind === 'group' || l.mark === '='))
  assert.equal(plain.counts.added, 0)
  assert.deepEqual(worldView(undefined, before).lines, [])
})

test('the same rows twice: a multiset, one removed', () => {
  const w = new WorldState()
  w.add('tick', int(1))
  w.add('tick', int(1))
  const before = snapshotWorld(w)
  w.removeWhere('tick', 1, () => true)
  w.add('tick', int(1))
  const v = worldView(snapshotWorld(w), before)
  assert.deepEqual(v.lines.map(l => (l.kind === 'group' ? l.key : `${l.mark}${l.values}`)), ['tick/1', '=1', '-1'])
})
