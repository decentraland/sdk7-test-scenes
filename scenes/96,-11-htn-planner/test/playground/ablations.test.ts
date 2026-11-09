// Ablations of the playground levels (src/playground/ablation.ts, docs/htn-level-metrics.md): the same brain with one
// parameter changed. Which level has which, and for each, that it changes what it says and nothing when it is off.
// Also the stagger (LevelSim.stagger) that makes seeds differ for the metrics' means.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LEVELS } from '../../src/playgrounds'
import { runLevel } from '../../src/playground/headless'
import { AmbushLevel } from '../../src/playground/levels/ambush'
import { CrowdLevel } from '../../src/playground/levels/crowd'
import { HearingLevel } from '../../src/playground/levels/hearing'
import { OrdersLevel } from '../../src/playground/levels/orders'
import { SightLevel } from '../../src/playground/levels/sight'
import { StorekeeperLevel } from '../../src/playground/levels/storekeeper'
import type { GuardEvent } from '../../src/htn-planner'
import type { CrewMember, LevelSim } from '../../src/playground/sim'

/** A level with `ablation` set, initialised, recording every event of its NPCs. */
function ablated<T extends LevelSim>(level: T, ablation: string | null, seed?: number): { level: T; events: { id: string; e: GuardEvent }[] } {
  const events: { id: string; e: GuardEvent }[] = []
  level.ablation = ablation
  level.observer = (e: GuardEvent, m: CrewMember) => events.push({ id: m.id, e })
  level.init(seed)
  return { level, events }
}

/** Step `level` until its script did `rounds` rounds (or `limit` s), calling `each` after every update. */
function play(level: LevelSim, rounds = 1, each: () => void = () => {}, limit = 600): void {
  while (level.round <= rounds && level.time < limit) {
    level.update(1 / 30)
    each()
  }
}

const names = (level: LevelSim) => level.ablations().map(a => a.name)

test('the general ablations apply where the NPCs have the feature; a level adds its own', () => {
  const byLevel = Object.fromEntries(LEVELS.map(p => [p.make().info.number, names(p.make())]))
  assert.deepEqual(byLevel[5], ['no_hearing', 'no_memory'], 'the guard domain hears and remembers')
  assert.deepEqual(byLevel[7], ['no_hearing', 'no_memory'])
  assert.deepEqual(byLevel[9], ['no_hearing', 'no_memory', 'no_budget'], 'the crowd shares a planning budget')
  assert.deepEqual(byLevel[10], ['no_active_plan'], 'the storekeeper checks its running step')
  assert.deepEqual(byLevel[11], ['no_memory', 'no_squad'], 'the yard guards hear nothing: no no_hearing')
  assert.deepEqual(byLevel[12], ['no_hearing', 'no_memory', 'no_presence', 'no_light'])
  for (const [n, list] of Object.entries(byLevel)) assert.equal(new Set(list).size, list.length, `level ${n}: names are unique`)
  for (const p of LEVELS) for (const a of p.make().ablations()) assert.ok(a.change.length > 10, `${a.name}: says what it changes`)
})

test('off changes nothing: an ablation a level does not have runs it as it is', () => {
  const plain = runLevel(new SightLevel(), { rounds: 1 })
  const other = runLevel(new SightLevel(), { rounds: 1, ablation: 'no_squad' })
  delete other.ablation
  assert.deepEqual(other, plain)
})

test('no_hearing: the NPCs hear no noise (level 6: its bell and pebble reach nobody)', () => {
  const heard = (ablation: string | null) => {
    const { level, events } = ablated(new HearingLevel(), ablation)
    play(level)
    return events.filter(x => x.e.type === 'heard').length
  }
  assert.ok(heard(null) > 0)
  assert.equal(heard('no_hearing'), 0)
})

test('no_hearing keeps a noise that is no sound: level 12\'s lure (a light glimpsed) still reaches it', () => {
  const { level, events } = ablated(new AmbushLevel(), 'no_hearing')
  play(level)
  const kinds = new Set(events.flatMap(x => (x.e.type === 'heard' ? [x.e.kind] : [])))
  assert.deepEqual([...kinds], ['light'])
})

test('no_memory: no NPC ends a tick remembering a lost target (level 5), where it does without the ablation', () => {
  const remembered = (ablation: string | null) => {
    const { level } = ablated(new SightLevel(), ablation)
    let ticks = 0
    play(level, 1, () => (ticks += level.crew.some(m => m.agent.blackboard.memories.size > 0) ? 1 : 0))
    return ticks
  }
  assert.ok(remembered(null) > 0)
  assert.equal(remembered('no_memory'), 0)
})

test('no_presence: the NPC never senses anyone by presence (level 12), where it smells the tester without it', () => {
  const smelled = (ablation: string | null) => {
    const { level } = ablated(new AmbushLevel(), ablation)
    let ticks = 0
    play(level, 1, () => (ticks += level.crew.some(m => m.agent.perception.senses().some(s => s.by === 'presence')) ? 1 : 0))
    return ticks
  }
  assert.ok(smelled(null) > 0)
  assert.equal(smelled('no_presence'), 0)
})

test('no_light: the targets come with no visibility (seen as far as lit), where the dark tester is seen nearer without it', () => {
  for (const [ablation, want] of [
    [null, 5 / 9],
    ['no_light', undefined]
  ] as const) {
    const { level } = ablated(new AmbushLevel(), ablation)
    level.update(1 / 30)
    assert.equal(level.testerLight, 'dark')
    assert.equal(level.targetsNow.find(t => t.id === 'tester')?.visibility, want, String(ablation))
  }
})

test('no_budget: the crowd has no planning budget, so no replan ever waits for one', () => {
  const deferred = (ablation: string | null) => {
    const { level } = ablated(new CrowdLevel(), ablation)
    play(level)
    return { budget: level.planBudget, waited: level.crew.reduce((n, m) => n + m.agent.metrics.budgetDeferred, 0) }
  }
  const on = deferred(null)
  assert.ok(on.budget !== null && on.waited > 0)
  const off = deferred('no_budget')
  assert.equal(off.budget, null)
  assert.equal(off.waited, 0)
})

test('no_active_plan: the storekeeper never checks its running step; a fact change replans it instead', () => {
  const run = (ablation: string | null) => {
    const { level, events } = ablated(new StorekeeperLevel(), ablation)
    play(level)
    return { checks: level.agent.metrics.checksMade, rejected: events.filter(x => x.e.type === 'check').length, factReplans: events.filter(x => x.e.type === 'replan' && x.e.trigger === 'facts').length }
  }
  const on = run(null)
  assert.ok(on.checks > 0 && on.rejected > 0)
  assert.equal(on.factReplans, 0, 'with the check, facts never replan')
  const off = run('no_active_plan')
  assert.deepEqual([off.checks, off.rejected], [0, 0])
  assert.ok(off.factReplans > 0)
})

test('no_squad: no squad planner gives orders; each guard orders itself and nobody flanks', () => {
  const roles = new Set<string>()
  const { level } = ablated(new OrdersLevel(), 'no_squad')
  play(level, 1, () => {
    for (const r of Object.values(level.roles())) roles.add(r)
  })
  assert.equal(level.decisions.length, 0)
  assert.equal(level.squad?.lastDecision ?? null, null)
  assert.equal(level.squad?.orders.size, 0)
  assert.ok(roles.has('chase'), 'a guard that sees the intruder chases on its own')
  assert.ok(!roles.has('flank'), [...roles].join(' '))
  const { level: commanded } = ablated(new OrdersLevel(), null)
  play(commanded)
  assert.ok(commanded.decisions.length > 0)
})

test('stagger: the tester waits a time drawn from the seed in [0, stagger) before its script; none without it', () => {
  const delay = (seed: number, stagger: number) => {
    const level = new SightLevel()
    level.stagger = stagger
    return level.init(seed).scriptDelay
  }
  assert.equal(delay(1, 0), 0)
  const delays = [1, 2, 3, 4, 5].map(seed => delay(seed, 10))
  assert.ok(delays.every(d => d >= 0 && d < 10))
  assert.equal(new Set(delays).size, 5, 'another seed, another wait')
  assert.equal(delay(3, 10), delays[2], 'the same seed, the same wait')
  const level = new SightLevel()
  level.stagger = 10
  level.init(4)
  const start = { ...level.tester.position }
  while (level.time + 1 / 30 < level.scriptDelay) level.update(1 / 30)
  assert.deepEqual(level.tester.position, start, 'the tester has not moved yet')
  assert.equal(level.checks[0].state, 'pending')
  level.advanceTime(1)
  assert.notEqual(level.checks[0].state, 'pending', 'then its script runs')
})
