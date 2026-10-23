// The session viewer's labels: values, not code. A literal of the trace reads `health(1, 15)` with its bindings
// substituted, a comparison `15 ≤ 20`, a step `move_to((-8, 0, -6.6), hurry)`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { float, int, list, str, sym, vec3 } from '../../src/htn-planner/htn/atom'
import type { Atom } from '../../src/htn-planner/htn/atom'
import { bindingsText, headName, literalLabel, stepLabel, stepText, valueText } from '../../tools/viewer/model/format'

const env =
  (values: Record<string, Atom>) =>
  (name: string): Atom | undefined =>
    values[name]

test('values: numbers short, names and strings bare, lists with commas', () => {
  assert.equal(valueText(int(3)), '3')
  assert.equal(valueText(float(-6.6)), '-6.6')
  assert.equal(valueText(float(2)), '2')
  assert.equal(valueText(float(1 / 3)), '0.33')
  assert.equal(valueText(sym('melee')), 'melee')
  assert.equal(valueText(str('back_alley')), 'back_alley')
  assert.equal(valueText(vec3(-8, 0, -6.6)), '(-8, 0, -6.6)')
  assert.equal(valueText(list()), '()')
  assert.equal(valueText({ t: 'bool', v: true }), 'true')
})

test('a fact with its bindings substituted; unbound variables stay', () => {
  assert.equal(literalLabel('(health ?inp_npc ?hp)', env({ inp_npc: int(1), hp: int(15) })), 'health(1, 15)')
  assert.equal(literalLabel('(scripted_order ?npc high ?order ?target)', env({ npc: int(1) })), 'scripted_order(1, high, ?order, ?target)')
  assert.equal(literalLabel('(retreat_route ?npc "back_alley")', env({})), 'retreat_route(?npc, back_alley)')
  assert.equal(literalLabel('(door_open)', env({})), 'door_open')
  assert.equal(literalLabel('(heard_noise ?any_kind ?pos ?any)', env({})), 'heard_noise(_, ?pos, _)', 'discards read _')
})

test('comparisons and arithmetic read infix; calls and axioms as functions; an assignment keeps its target', () => {
  assert.equal(literalLabel('(<= ?hp 20)', env({ hp: int(15) })), '15 ≤ 20')
  assert.equal(literalLabel('(!= ?guard ?inp_busy)', env({ guard: sym('a'), inp_busy: sym('b') })), 'a ≠ b')
  assert.equal(literalLabel('(> (+ ?a 1) ?b)', env({ a: int(2) })), '(2 + 1) > ?b')
  assert.equal(literalLabel('(call distance ?a ?b)', env({ a: int(1), b: int(2) })), 'distance(1, 2)')
  assert.equal(literalLabel('(#find_candidate ?c)', env({ c: sym('x') })), 'find_candidate(x)')
  assert.equal(literalLabel('(= ?d (call dist ?a))', env({ a: int(4), d: float(2.5) })), 'd := dist(4) = 2.5')
  assert.equal(literalLabel('(= ?d 3)', env({})), 'd := 3')
  assert.equal(literalLabel('(split_list ?guards ?g ?rest)', env({ guards: list(sym('a'), sym('b')), g: sym('a') })), 'split_list((a, b), a, ?rest)')
  assert.equal(literalLabel('(< ?hp @limit)', env({ hp: int(3) }), new Map([['@limit', '20']])), '3 < 20')
})

test('task titles: no ! or &, nested expressions with values; a plan step as the planner evaluated it', () => {
  assert.equal(literalLabel('(!move_to ?post hurry)', env({ post: vec3(-8, 0, -6.6) })), 'move_to((-8, 0, -6.6), hurry)')
  assert.equal(literalLabel('(&advance_patrol)', env({})), 'advance_patrol')
  assert.equal(literalLabel('(!set_waypoint (% (++ ?index) ?count))', env({ index: int(2), count: int(4) })), 'set_waypoint(++(2) % 4)')
  assert.equal(stepLabel('!announce_state', [str('combat'), int(1)]), 'announce_state(combat, 1)')
  assert.equal(stepLabel('!wait', []), 'wait')
  assert.equal(headName('(!move_to ?post hurry)'), 'move_to')
  assert.equal(headName('(#axiom ?x)'), 'axiom')
})

test('broken titles never throw: shown as they are', () => {
  assert.equal(literalLabel('(unclosed ?a', env({ a: int(1) })), 'unclosed(1)')
  assert.equal(literalLabel('', env({})), '')
  assert.equal(literalLabel(')(', env({})), ')(')
})

test('bindings in short: name = value', () => {
  assert.equal(bindingsText([{ name: 'enemy', value: int(202) }, { name: 'route', value: str('back_alley') }]), 'enemy = 202, route = back_alley')
  assert.equal(bindingsText([]), '')
})

test('a logged step reads as a label: numbers short, strings bare', () => {
  assert.equal(stepText('!move_to (-8.0 0.0 -6.6) hurry'), 'move_to((-8, 0, -6.6), hurry)')
  assert.equal(stepText('!announce_state "combat" 1'), 'announce_state(combat, 1)')
  assert.equal(stepText('!wait 2.0'), 'wait(2)')
  assert.equal(stepText(''), '')
})
