// The History tab (src/debugger/history-rows.ts) on a playground level run headless: events newest first, a
// replan linked to the run it made.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AgentLogEntry, PlanRun } from '../../src/htn-planner'
import { historyRows, knowledgeText, readableReason, repeatText, runAt, withTrigger } from '../../src/debugger/history-rows'
import { hostRuns } from '../../src/debugger/runs'
import { LampLevel } from '../../src/playground/levels/lamp'

test('a level agent: replans link to their runs, newest first', () => {
  const level = new LampLevel().init()
  for (let i = 0; i < 400; i++) level.update(0.05)
  const m = level.crew[0]
  const entries = m.history.toArray()
  const runs = hostRuns(m.trace)
  const rows = historyRows(entries, runs)
  assert.equal(rows.length, entries.length)
  assert.ok(rows[0].t >= rows[rows.length - 1].t, 'newest first')
  const replans = rows.filter(r => r.kind === 'replan' || r.kind === 'kept')
  assert.ok(replans.length > 0)
  const linked = replans.filter(r => r.run !== undefined)
  assert.ok(linked.length > 0)
  for (const r of linked) assert.ok(runs.some(run => run.seq === r.run && run.t === (r.until ?? r.t)), 'the run was made at the (last) replan')
  assert.ok(rows.some(r => r.kind === 'step' && r.glyph === '▶'))
})

const run = (seq: number, t: number, deferred = false): PlanRun => ({ seq, t, deferred, method: 0, args: [], status: 'succeeded', plan: [], ms: 0, world: 0, nodes: [] })

test('runAt: the newest top-level run at that time, else the newest before', () => {
  const runs = [run(1, 1), run(2, 2), run(3, 2), run(4, 2, true), run(5, 4)]
  assert.equal(runAt(runs, 2)!.seq, 3)
  assert.equal(runAt(runs, 3)!.seq, 3)
  assert.equal(runAt(runs, 0.5), undefined)
})

test('kinds: kept replan, failed and cancelled steps, senses; heard can be hidden', () => {
  const g = 'npc'
  const entries: AgentLogEntry[] = [
    { t: 1, event: { type: 'replan', guard: g, reason: 'start', status: 'succeeded', plan: ['!a', '!b'], kept: false, passes: 1 } },
    { t: 2, event: { type: 'sense', guard: g, what: 'perception', from: '|', to: 'you|' } },
    { t: 2, event: { type: 'replan', guard: g, reason: 'perception', status: 'succeeded', plan: ['!a', '!b'], kept: true, passes: 2 } },
    { t: 3, event: { type: 'step_end', guard: g, name: '!a', status: 'cancelled' } },
    { t: 3, event: { type: 'step_end', guard: g, name: '!b', status: 'failed' } },
    { t: 4, event: { type: 'heard', guard: g, kind: 'step', source: 'you', perceived: 1, muffled: false, alert: 0.2, level: 'wary' } }
  ]
  const rows = historyRows(entries, [])
  assert.deepEqual(rows.map(r => r.kind), ['heard', 'failed', 'cancelled', 'kept', 'sense', 'replan'])
  assert.match(rows[3].text, /running plan kept, 2 passes/)
  assert.match(rows[5].text, /replan: start → 2 steps {3}!a, !b/)
  assert.equal(historyRows(entries, [], { hideHeard: true }).length, 5)
})

test('kinds: a diagnostic (a step with no executor) is a warning row', () => {
  const message = 'no executor for !x: runs as a 0.05 s no-op'
  const rows = historyRows([{ t: 1, event: { type: 'diagnostic', guard: 'npc', code: 'no_executor', message } }], [])
  assert.deepEqual(rows.map(r => [r.kind, r.text]), [['diagnostic', message]])
})

test('perception keys (visible|remembered) in words, in reasons and sense rows', () => {
  assert.equal(knowledgeText('tester|'), 'sees tester')
  assert.equal(knowledgeText('|tester'), 'remembers tester')
  assert.equal(knowledgeText('a,b|c'), 'sees a, b · remembers c')
  assert.equal(knowledgeText('|'), 'nothing')
  assert.equal(knowledgeText(''), 'nothing')
  assert.equal(readableReason('perception tester| -> |tester'), 'perception: sees tester → remembers tester')
  assert.equal(readableReason('plan completed'), 'plan completed')
  assert.equal(withTrigger('plan_done', 'plan completed'), 'plan_done: plan completed')
  for (const word of ['debug', 'reload', 'start', 'request']) assert.equal(withTrigger(word, word), word, `${word} said once`)
  assert.equal(withTrigger('perception', 'perception: sees tester → remembers tester'), 'perception: sees tester → remembers tester')
  assert.equal(withTrigger('active_plan', 'active_plan failed'), 'active_plan failed')
  assert.equal(withTrigger('debug', 'debugger: replan'), 'debug: debugger: replan', 'a word, not a prefix')
  assert.equal(withTrigger(undefined, 'poke'), 'poke')
  assert.equal(withTrigger('request', ''), 'request')
  const rows = historyRows([{ t: 1, event: { type: 'sense', guard: 'g', what: 'perception', from: '|', to: 'tester|' } } as AgentLogEntry], [])
  assert.equal(rows[0].text, 'perception: nothing → sees tester')
})

test('a collapsed run is one row: ×N and its time span; a replan links to the run of its last retry', () => {
  const g = 'npc'
  const entries: AgentLogEntry[] = [
    { t: 1, event: { type: 'replan', guard: g, reason: 'start', status: 'no_plan', plan: [], kept: false, passes: 1 } },
    { t: 1.1, until: 5.3, count: 43, event: { type: 'replan', guard: g, reason: 'retry after no_plan', status: 'no_plan', plan: [], kept: false, passes: 1 } }
  ]
  const rows = historyRows(entries, [run(1, 1), run(2, 3), run(3, 5.3)])
  assert.equal(rows.length, 2)
  assert.deepEqual([rows[0].count, rows[0].until, rows[0].run], [43, 5.3, 3])
  assert.equal(repeatText(rows[0]), '×43, 1.10–5.30 s')
  assert.equal(rows[1].count, undefined)
  assert.equal(repeatText(rows[1]), '')
})

test('a replan row: the facts that changed by name, same plan vs new plan', () => {
  const g = 'npc'
  const entries: AgentLogEntry[] = [
    { t: 1, event: { type: 'replan', guard: g, reason: 'start', status: 'succeeded', plan: ['!a'], kept: false, passes: 1, trigger: 'start', changed: true } },
    {
      t: 2,
      event: {
        type: 'replan',
        guard: g,
        reason: 'facts a -> b',
        status: 'succeeded',
        plan: ['!b'],
        kept: false,
        passes: 1,
        trigger: 'facts',
        changed: true,
        changes: ['- (door_open store)', '+ (door_open back)', '+ (order x)'],
        previous: ['!a']
      }
    },
    { t: 3, event: { type: 'replan', guard: g, reason: 'plan completed', status: 'succeeded', plan: ['!b'], kept: false, passes: 1, trigger: 'plan_done', changed: false, changes: [] } }
  ]
  const rows = historyRows(entries, [])
  assert.equal(rows[0].text, 'replan: plan completed → same plan')
  assert.equal(rows[1].text, 'replan: facts a -> b → 1 step   !b   Δ −door_open +door_open +order')
  assert.equal(rows[2].text, 'replan: start → 1 step   !a')
})
