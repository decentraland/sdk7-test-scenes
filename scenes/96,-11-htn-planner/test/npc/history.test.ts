// The agent history (src/htn-planner/npc/history.ts) collapses a run of identical events into one entry at record
// time, so a stuck agent (a no-plan retry every tick, H7) does not push its older events out of the ring.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { float } from '../../src/htn-planner/htn/atom'
import type { GuardEvent } from '../../src/htn-planner/npc/actions'
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import { agentHistory, entryCount, eventKey } from '../../src/htn-planner/npc/history'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import { prim, scripted } from './fake-planner'

const retry = (guard = 'g'): Extract<GuardEvent, { type: 'replan' }> => ({ type: 'replan', guard, reason: 'retry after no_plan', status: 'no_plan', plan: [], kept: false, passes: 1 })
const heard = (perceived: number, alert: number, level = 'calm'): GuardEvent => ({
  type: 'heard',
  guard: 'g',
  kind: 'step',
  source: 'you',
  perceived,
  muffled: false,
  alert,
  level
})

test('a run of identical events is one entry: first time, last time, count; every event still counts in total', () => {
  const h = agentHistory(8)
  h.push({ t: 1, event: { type: 'replan', guard: 'g', reason: 'start', status: 'no_plan', plan: [], kept: false, passes: 1 } })
  for (let i = 0; i < 50; i++) h.push({ t: 1.1 + i * 0.1, event: retry() })
  const log = h.toArray()
  assert.equal(log.length, 2, 'start, then one entry for the retries')
  assert.equal(log[1].count, 50)
  assert.equal(log[1].t, 1.1)
  assert.ok(Math.abs((log[1].until ?? 0) - 6) < 1e-9)
  assert.equal(entryCount(log[0]), 1, 'a single event has no count (1)')
  assert.equal(log[0].until, undefined)
  assert.equal(h.total, 51)
})

test('any other event of that agent ends the run', () => {
  const h = agentHistory(8)
  h.push({ t: 1, event: retry() })
  h.push({ t: 2, event: retry() })
  h.push({ t: 3, event: { type: 'step', guard: 'g', name: '!wait', args: [float(1)] } })
  h.push({ t: 4, event: retry() })
  assert.deepEqual(
    h.toArray().map(e => [e.event.type, entryCount(e)]),
    [
      ['replan', 2],
      ['step', 1],
      ['replan', 1]
    ]
  )
})

test('a merged entry is a new object: an earlier snapshot of the ring does not change', () => {
  const h = agentHistory(4)
  h.push({ t: 1, event: retry() })
  const before = h.toArray()
  h.push({ t: 2, event: retry() })
  assert.equal(entryCount(before[0]), 1)
  assert.equal(entryCount(h.toArray()[0]), 2)
})

test('agents sharing a ring: each agent collapses its own run, the other agent does not end it', () => {
  const h = agentHistory(8)
  for (let i = 0; i < 10; i++) {
    h.push({ t: i, event: retry('a') })
    h.push({ t: i, event: retry('b') })
  }
  assert.deepEqual(
    h.toArray().map(e => [e.event.guard, entryCount(e), e.until]),
    [
      ['a', 10, 9],
      ['b', 10, 9]
    ]
  )
})

test('the key of an event: its type and what the History tab tells, not the time or a measured level', () => {
  assert.equal(eventKey(heard(0.4, 0.1)), eventKey(heard(0.9, 0.3)), 'perceived and alert vary every footstep')
  assert.notEqual(eventKey(heard(0.4, 0.1)), eventKey(heard(0.4, 0.1, 'wary')))
  assert.notEqual(eventKey(retry()), eventKey({ ...retry(), status: 'timeout' }))
  assert.notEqual(eventKey(retry()), eventKey({ ...retry(), reason: 'start' }))
  assert.notEqual(eventKey(retry('a')), eventKey(retry('b')))
  const check: GuardEvent = { type: 'check', guard: 'g', method: 'active_plan', step: '!attack A', status: 'no_plan' }
  assert.equal(eventKey(check), eventKey({ ...check }))
  assert.notEqual(eventKey(check), eventKey({ ...check, step: '!attack B' }))
})

test('collapse off: every event is its own entry', () => {
  const h = agentHistory(8, { collapse: false })
  for (let i = 0; i < 3; i++) h.push({ t: i, event: retry() })
  assert.equal(h.length, 3)
  assert.ok(h.toArray().every(e => entryCount(e) === 1))
})

test('clear forgets the run', () => {
  const h = agentHistory(8)
  h.push({ t: 1, event: retry() })
  h.clear()
  h.push({ t: 2, event: retry() })
  assert.deepEqual(h.toArray().map(entryCount), [1])
})

test('a run evicted from the ring starts again as a new entry', () => {
  const h = agentHistory(2)
  h.push({ t: 1, event: retry('a') })
  h.push({ t: 2, event: retry('b') })
  h.push({ t: 3, event: retry('b') })
  h.push({ t: 4, event: { type: 'signal', guard: 'b', name: 'x' } })
  h.push({ t: 5, event: retry('a') }) // a's run was evicted: a new entry, not a merge into nothing
  assert.deepEqual(
    h.toArray().map(e => [e.event.guard, e.event.type, entryCount(e)]),
    [
      ['b', 'signal', 1],
      ['a', 'replan', 1]
    ]
  )
})

test('a stuck agent (no plan, a retry every tick) keeps its older events in a small ring (H7)', () => {
  const history = agentHistory(8)
  // Plans a short wait, then never again: the agent retries every tick for 50 s.
  const s = scripted(call => (call === 0 ? [prim('!wait', float(0.2))] : null))
  const agent = new GuardAgent({
    id: 'g',
    planner: s.factory,
    lineOfSight: CLEAR_LINE_OF_SIGHT,
    start: { position: v3(0, 0, 0), yaw: 0 },
    history
  })
  for (let i = 0; i < 500; i++) agent.tick(0.1, [])
  const log = history.toArray()
  assert.ok(log.length <= 6, `${log.length} entries`)
  const start = log.find(e => e.event.type === 'replan' && e.event.reason === 'start')
  assert.ok(start, 'the first plan is still there')
  assert.ok(log.some(e => e.event.type === 'step'), 'and the step it ran')
  const retries = log[log.length - 1]
  assert.ok(retries.event.type === 'replan' && retries.event.reason === 'retry after no_plan')
  assert.ok(entryCount(retries) > 400)
  assert.ok(Math.abs((retries.until ?? 0) - agent.time) < 1e-6)
})
