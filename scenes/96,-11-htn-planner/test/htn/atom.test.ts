import { test } from 'node:test'
import assert from 'node:assert/strict'
import { float, formatAtom, formatTask, int, list, str, sym, bool, vec3 } from '../../src/htn-planner/htn/atom'
import { WorldState } from '../../src/htn-planner/htn/world-state'

test('formatAtom mirrors upstream HTNAtomToString', () => {
  assert.equal(formatTask('!print', [list(sym('patrol'), int(3), bool(true), vec3(10, 20, 30))]),
    '!print (patrol 3 1 (10.0 20.0 30.0))')
  assert.equal(formatAtom(str('enemy0')), '"enemy0"')
  assert.equal(formatAtom(list()), '()')
  assert.equal(formatAtom(float(0.25)), '0.2') // printf half-to-even on exact ties
  assert.equal(formatAtom(float(-0.25)), '-0.2')
  assert.equal(formatAtom(float(0.35)), '0.3') // 0.35f is below the tie
  assert.equal(formatAtom(float(-0.5)), '-0.5')
})

test('WorldState keys tables by name and arity', () => {
  const ws = new WorldState()
  ws.add('candidate', sym('first'))
  ws.add('candidate', sym('second'))
  ws.add('candidate', sym('x'), int(1))
  assert.equal(ws.rows('candidate', 1).length, 2)
  assert.equal(ws.rows('candidate', 2).length, 1)
  ws.set('candidate', sym('only'))
  assert.deepEqual(ws.rows('candidate', 1), [[sym('only')]])
  assert.equal(ws.removeWhere('candidate', 2, () => true), 1)
  assert.deepEqual(ws.tableKeys(), ['candidate/1'])
})
