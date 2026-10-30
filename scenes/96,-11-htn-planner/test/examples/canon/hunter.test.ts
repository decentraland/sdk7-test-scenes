// Hunter (src/examples/canon/classics/hunter.domain): the IPC 2020 Snake domain. The source ships no expected plans,
// so every story (one per source problem pb01-pb05) is a solution of the source problem: its host fails any step the
// source's action preconditions forbid (no `fail` line), and at the end no mouse is left (the source's goal:
// `hunt_done`, no mouse anywhere). (Every scenario and story: canon.test.ts.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { sym } from '../../../src/htn-planner'
import { story } from '../../../src/examples/canon/paper'
import { HUNTER_HOST, snakeStepError } from '../../../src/examples/canon/classics/stories'
import { playStory } from '../../../tools/htn/canon'
import { CANON, ROOT, station } from './helpers'

for (const s of station('hunter').stories) {
  test(`hunter ${s.name}: every step legal in the source domain, no mouse left`, () => {
    const run = playStory(CANON, s)
    assert.deepEqual(run.trace.filter(l => l.startsWith('fail ')), [])
    assert.equal(run.stage.agents[0].world.rows('prey_at', 1).length, 0)
    assert.equal(run.trace.filter(l => l.startsWith('plan: ')).pop(), 'plan: (empty)', 'the loop ends in all_caught')
  })
}

test('hunter: the precondition check rejects an illegal step (it is not vacuous)', () => {
  // After pb01's first step the head is at px1y2: the same step again starts from the wrong cell.
  const first = story({ station: 'hunter', name: 'one step', blurb: '', from: '1_pb01_start', method: 'hunt', host: HUNTER_HOST, maxSteps: 1, expect: [] })
  const w = playStory(CANON, first).stage.agents[0].world
  assert.equal(snakeStepError('!move_short', ['viper', 'px1y2', 'px2y2'].map(sym), w), '!move_short viper px1y2 px2y2: head')
  assert.equal(snakeStepError('!move_short', ['viper', 'px0y2', 'px1y2'].map(sym), w), undefined)
  // The host fails it: the world is left as it was.
  assert.equal(HUNTER_HOST.effects!['!move_short'](['viper', 'px1y2', 'px2y2'].map(sym), w, 0), false)
})

test('hunter: the notices carry the Snake MIT licence', () => {
  const notices = fs.readFileSync(nodePath.join(ROOT, 'src/examples/canon/THIRD_PARTY_NOTICES.md'), 'utf8')
  assert.match(notices, /Copyright \(c\) 2020 Mau Magnaguagno/)
})
