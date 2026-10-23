// The per-frame planning budget (BACKLOG "Replan budget per frame"): the scheduler alone, then shared by agents.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { float } from '../../src/htn-planner/htn/atom'
import { GuardAgent } from '../../src/htn-planner/npc/agent'
import { PlanBudget } from '../../src/htn-planner/npc/plan-budget'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import { prim, Script, scripted } from './fake-planner'

/** Requesters that each ask once per frame while they want to plan; returns who ran, frame by frame. */
function frames(budget: PlanBudget, n: number, ask: (frame: number) => { who: object; urgent?: boolean }[]): object[][] {
  const out: object[][] = []
  for (let f = 0; f < n; f++) {
    budget.beginFrame()
    const ran: object[] = []
    for (const { who, urgent } of ask(f)) budget.tryRun(who, urgent ?? false, () => ran.push(who))
    out.push(ran)
  }
  return out
}

const names = (all: Record<string, object>, ran: object[]) => ran.map(o => Object.keys(all).find(k => all[k] === o))

test('no limits: every request runs; the counters still count', () => {
  const b = new PlanBudget()
  const a = {}
  const c = {}
  const ran = frames(b, 2, () => [{ who: a }, { who: c }])
  assert.deepEqual(ran.map(r => r.length), [2, 2])
  assert.deepEqual({ runs: b.stats.runs, deferred: b.stats.deferred, maxRunsInFrame: b.stats.maxRunsInFrame }, { runs: 4, deferred: 0, maxRunsInFrame: 2 })
})

test('maxPlansPerFrame: the rest wait and run in the next frames, oldest first; newcomers do not take their slots', () => {
  const b = new PlanBudget({ maxPlansPerFrame: 2 })
  const all: Record<string, object> = { a: {}, b: {}, c: {}, d: {}, e: {}, f: {} }
  const wants = new Set(['a', 'b', 'c', 'd', 'e'])
  const ran: string[][] = []
  for (let f = 0; f < 4; f++) {
    b.beginFrame()
    if (f === 1) wants.add('f') // a newcomer, first in tick order
    const order = f === 1 ? ['f', 'a', 'b', 'c', 'd', 'e'] : ['a', 'b', 'c', 'd', 'e', 'f']
    const got: string[] = []
    for (const k of order) if (wants.has(k)) b.tryRun(all[k], false, () => (wants.delete(k), got.push(k)))
    ran.push(got)
  }
  assert.deepEqual(ran, [['a', 'b'], ['c', 'd'], ['e', 'f'], []])
  assert.equal(b.stats.maxWaitFrames, 2)
  assert.equal(b.stats.deferred, 3 + 2 + 0)
  assert.equal(b.stats.maxRunsInFrame, 2)
  assert.equal(b.waiting, 0)
})

test('constant demand from more requesters than the budget: round-robin, whatever the tick order', () => {
  const b = new PlanBudget({ maxPlansPerFrame: 1 })
  const all: Record<string, object> = { x: {}, y: {}, z: {} }
  const ran = frames(b, 30, () => ['x', 'y', 'z'].map(k => ({ who: all[k] }))).map(r => names(all, r))
  const count = (k: string) => ran.filter(r => r[0] === k).length
  assert.deepEqual([count('x'), count('y'), count('z')], [10, 10, 10])
  assert.equal(b.stats.maxWaitFrames, 2)
})

test('urgent first, but a plain request overtakes after urgentHeadStart frames: no starvation', () => {
  const b = new PlanBudget({ maxPlansPerFrame: 1, urgentHeadStart: 3 })
  const plain = {}
  let ranAt = -1
  const pending = new Set<object>()
  let urgentRuns = 0
  for (let f = 0; f < 30 && ranAt < 0; f++) {
    b.beginFrame()
    // Two new urgent requesters every frame (twice the budget), each asking every frame until it runs, before the
    // plain one in tick order.
    pending.add({}).add({})
    for (const who of [...pending]) b.tryRun(who, true, () => (pending.delete(who), urgentRuns++))
    b.tryRun(plain, false, () => (ranAt = f))
  }
  assert.ok(urgentRuns >= 3, `urgent ones went first (${urgentRuns})`)
  assert.ok(ranAt > 0 && ranAt <= 3 + 3, `the plain request ran at frame ${ranAt}`)

  const u = new PlanBudget({ maxPlansPerFrame: 1 })
  const first = {}
  const late = {}
  const urgent = {}
  u.beginFrame()
  u.tryRun(first, false, () => {})
  u.tryRun(late, false, () => {}) // waits from frame 1
  u.tryRun(urgent, true, () => {}) // waits from frame 1 too, urgent
  u.beginFrame()
  let who: object | null = null
  u.tryRun(late, false, () => (who = late))
  u.tryRun(urgent, true, () => (who = urgent))
  assert.equal(who, urgent, 'the urgent one has the reserved slot')
})

test('planBudgetMs with runs that cost time', () => {
  let now = 0
  const b = new PlanBudget({ planBudgetMs: 2.5, clock: () => now })
  const all = Array.from({ length: 6 }, () => ({}))
  const want = new Set(all)
  const perFrame: number[] = []
  for (let f = 0; f < 3; f++) {
    b.beginFrame()
    let n = 0
    for (const o of all) if (want.has(o)) b.tryRun(o, false, () => ((now += 1), want.delete(o), n++))
    perFrame.push(n)
  }
  assert.deepEqual(perFrame, [3, 3, 0], '0, 1 and 2 ms are under 2.5: three runs a frame')
  assert.ok(b.stats.msThisFrame === 0)

  const slow = new PlanBudget({ planBudgetMs: 1, clock: () => now })
  const s = Array.from({ length: 3 }, () => ({}))
  const left = new Set(s)
  const got: number[] = []
  for (let f = 0; f < 4; f++) {
    slow.beginFrame()
    let n = 0
    for (const o of s) if (left.has(o)) slow.tryRun(o, false, () => ((now += 10), left.delete(o), n++))
    got.push(n)
  }
  assert.deepEqual(got, [1, 1, 1, 0], 'a 10 ms run over a 1 ms budget: one a frame, nobody starves')
})

test('a requester that stops asking leaves the queue; forget drops it at once; a throwing run is still counted', () => {
  const b = new PlanBudget({ maxPlansPerFrame: 1 })
  const a = {}
  const gone = {}
  const fresh = {}
  b.beginFrame()
  b.tryRun(a, false, () => {})
  b.tryRun(gone, false, () => {}) // refused, then never asks again
  b.beginFrame() // gone holds the reserved slot this frame
  assert.equal(b.tryRun(fresh, false, () => {}), false)
  b.beginFrame() // gone did not ask last frame: dropped; fresh waits
  assert.equal(b.waitOf(gone), 0)
  assert.equal(b.tryRun(fresh, false, () => {}), true)
  b.beginFrame()
  b.tryRun(a, false, () => {})
  b.tryRun(gone, false, () => {})
  b.forget(gone)
  assert.equal(b.waiting, 0)
  b.beginFrame()
  assert.throws(() => b.tryRun(a, false, () => {
    throw new Error('boom')
  }), /boom/)
  assert.equal(b.stats.runsThisFrame, 1)
  assert.equal(b.tryRun(fresh, false, () => {}), false, 'the throwing run used the frame')
})

// ---- shared by agents ----------------------------------------------------------------------------------------------

function crew(n: number, budget: PlanBudget, script: Script) {
  const s = scripted(script)
  const agents = Array.from(
    { length: n },
    (_, i) =>
      new GuardAgent({
        id: `g${i + 1}`,
        planner: s.factory,
        lineOfSight: CLEAR_LINE_OF_SIGHT,
        start: { position: v3(i, 0, 0), yaw: 0 },
        planBudget: budget
      })
  )
  const tick = (dt = 0.1) => {
    budget.beginFrame()
    for (const a of agents) a.tick(dt, [])
  }
  return { agents, tick }
}

test('agents sharing a budget: the first plans are spread over frames; the deferred count and the wait are in metrics', () => {
  const budget = new PlanBudget({ maxPlansPerFrame: 2 })
  const { agents, tick } = crew(5, budget, () => [prim('!wait', float(100))])
  tick()
  assert.deepEqual(agents.map(a => a.metrics.plansMade), [1, 1, 0, 0, 0])
  assert.deepEqual(agents.map(a => a.currentAction), ['!wait', '!wait', '', '', ''])
  tick()
  tick()
  assert.deepEqual(agents.map(a => a.metrics.plansMade), [1, 1, 1, 1, 1])
  assert.deepEqual(agents.map(a => a.metrics.budgetDeferred), [0, 0, 1, 1, 2])
  assert.deepEqual(agents.map(a => a.metrics.budgetMaxWaitFrames), [0, 0, 1, 1, 2])
  assert.deepEqual({ deferred: budget.stats.deferred, maxWait: budget.stats.maxWaitFrames }, { deferred: 4, maxWait: 2 })
})

test('a deferred replan keeps the running step and its progress; it runs in a later frame', () => {
  const budget = new PlanBudget({ maxPlansPerFrame: 1 })
  const { agents, tick } = crew(2, budget, call => [prim('!wait', float(call < 2 ? 100 : 50))])
  tick()
  tick()
  assert.deepEqual(agents.map(a => a.currentAction), ['!wait', '!wait'])
  for (const a of agents) a.requestReplan('order changed', true)
  const replanned = () => agents.map(a => a.lastReplanReason)
  tick()
  assert.deepEqual(replanned(), ['order changed', 'start'], 'g2 waits')
  assert.equal(agents[1].currentAction, '!wait', 'and keeps its step')
  tick()
  assert.deepEqual(replanned(), ['order changed', 'order changed'])
})

test('a stopped agent leaves the queue at once: its slot goes to the next one', () => {
  const budget = new PlanBudget({ maxPlansPerFrame: 1 })
  const { agents, tick } = crew(3, budget, () => [prim('!wait', float(100))])
  tick()
  assert.equal(budget.waiting, 2)
  agents[1].stop()
  assert.equal(budget.waiting, 1)
  budget.beginFrame()
  agents[2].tick(0.1, [])
  assert.equal(agents[2].metrics.plansMade, 1, 'g3 has the slot g2 would have had')
})

test('a replan the budget held back says how many frames and how long it waited', () => {
  const budget = new PlanBudget({ maxPlansPerFrame: 1 })
  const { agents, tick } = crew(2, budget, () => [prim('!wait', float(100))])
  tick()
  tick()
  assert.equal(agents[0].lastReplan?.budgetFrames, undefined)
  assert.equal(agents[1].lastReplan?.budgetFrames, 1)
  assert.equal(agents[1].lastReplan?.waited, 0.1)
  assert.equal(agents[1].lastReplan?.trigger, 'start')
})
