// Level 9, the crowd: its checks read the agents' modes, so they also pass without trace recording (the load setup).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plannerText } from '../../src/playground/board'
import { CrowdLevel } from '../../src/playground/levels/crowd'

const DT = 1 / 30

function runRounds(level: CrowdLevel, rounds: number): string[] {
  const failed: string[] = []
  let seconds = 0
  while (level.round <= rounds && seconds < 900) {
    level.update(DT)
    seconds += DT
    for (const c of level.checks) {
      const id = `round ${c.round}: ${c.label}`
      if (c.state === 'fail' && !failed.includes(id)) failed.push(id)
    }
  }
  assert.ok(level.round > rounds, `the script did not loop ${rounds} times (at "${level.testerSay}")`)
  return failed
}

test('a crowd of 25 without trace recording: the script passes, every agent plans and reports its peak frames', () => {
  const level = new CrowdLevel(25)
  level.recordTraces = false
  level.init()
  assert.deepEqual(runRounds(level, 2), [])
  assert.equal(level.crew.length, 25)
  for (const m of level.crew) {
    assert.equal(m.trace.lastPlan, null, 'nothing recorded')
    assert.ok(m.agent.metrics.plansMade > 2, m.id)
    assert.ok(m.agent.metrics.maxPeakCallFrames > 0 && m.agent.metrics.callFrameCapacity === 8192, m.id)
  }
})

test('the crowd board names five other NPCs and shows the peak call frames', () => {
  const level = new CrowdLevel().init()
  for (let i = 0; i < 10; i++) level.update(DT)
  const text = plannerText(level)
  assert.match(text, /… \+4 more/)
  assert.match(text, /frames: peak \d+ of 8192/)
})

test('the crowd shares a plan budget: at most 3 replans a frame, nobody waits long, the script still passes; the board shows it', () => {
  const level = new CrowdLevel(25)
  level.recordTraces = false
  level.init()
  level.update(DT)
  assert.equal(level.crew.filter(m => m.agent.metrics.plansMade > 0).length, 3, 'the first frame: three plans')
  assert.deepEqual(runRounds(level, 1), [])
  const s = level.planBudget!.stats
  assert.equal(s.maxRunsInFrame, 3)
  assert.ok(s.deferred > 0 && s.maxWaitFrames <= Math.ceil(25 / 3) + 4, `waits ${s.deferred}, longest ${s.maxWaitFrames} frames`)
  assert.match(plannerText(level), /budget 3 plans\/frame: \d+ waits, longest \d+ frames/)

  const free = new CrowdLevel(25, null)
  free.recordTraces = false
  free.init()
  free.update(DT)
  assert.equal(free.planBudget, null)
  assert.equal(free.crew.filter(m => m.agent.metrics.plansMade > 0).length, 25, 'no budget: everyone in the first frame')
  assert.doesNotMatch(plannerText(free), /budget/)
})

test('the crowd control switches the budget off and on (the level restarts)', () => {
  const level = new CrowdLevel().init()
  const toggle = () => level.controls().find(c => c.label.startsWith('Budget'))!
  assert.equal(toggle().label, 'Budget: off (restarts)')
  const limit = () => level.planBudget?.maxPlansPerFrame ?? null
  toggle().run()
  assert.equal(limit(), null)
  assert.equal(toggle().label, 'Budget: on (restarts)')
  toggle().run()
  assert.equal(limit(), 3)
})
