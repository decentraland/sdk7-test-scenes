// Every playground level's tester script passes on the pure simulation: the same checks the station boards show.
// Several rounds, and no check may fail in any of them (the board shows only the last result of each).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GuardEvent } from '../../src/htn-planner'
import { LEVELS } from '../../src/playgrounds'
import { plannerText } from '../../src/playground/board'
import type { CrewMember } from '../../src/playground/sim'

const DT = 1 / 30
const ROUNDS = 6

for (const playground of LEVELS) {
  const level = playground.make().init()
  test(`level ${level.info.number} ${level.info.id}: ${ROUNDS} rounds of the tester script pass`, () => {
    const failed: string[] = []
    let seconds = 0
    while (level.round <= ROUNDS && seconds < 1800) {
      level.update(DT)
      seconds += DT
      for (const c of level.checks) {
        const id = `round ${c.round}: ${c.label} (${c.seconds.toFixed(1)} s)`
        if (c.state === 'fail' && !failed.includes(id)) failed.push(id)
      }
    }
    assert.ok(level.round > ROUNDS, `script did not loop ${ROUNDS} times in 1800 s (at "${level.currentStep?.kind} ${level.testerSay}")`)
    assert.ok(level.checks.length > 0)
    assert.deepEqual(failed, [])
    for (const m of level.crew) assert.equal(m.agent.lastPlanStatus, 'succeeded', m.id)
  })
}

test('a replan that kept the running plan keeps the done steps on the board and says so', () => {
  const level = LEVELS[0].make().init()
  const member = level.crew[0]
  member.doneSteps.push('!wait 1.0')
  const replan = (kept: boolean): GuardEvent => ({ type: 'replan', guard: member.id, reason: 'test', status: 'succeeded', plan: [], kept, passes: 1 })
  const sim = level as unknown as { onEvent(e: GuardEvent, m: CrewMember): void } // protected: the agent calls it
  sim.onEvent(replan(true), member)
  assert.deepEqual(member.doneSteps, ['!wait 1.0'])
  assert.equal(member.replans, 1)
  assert.match(plannerText(level), /running plan kept/)
  sim.onEvent(replan(false), member)
  assert.deepEqual(member.doneSteps, [])
  assert.doesNotMatch(plannerText(level), /running plan kept/)
})
