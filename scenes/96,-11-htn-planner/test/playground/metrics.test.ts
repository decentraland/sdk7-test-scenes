// The outcome metrics of a level run (src/playground/metrics.ts, docs/htn-level-metrics.md): each rule on a small
// hand-made stream of frames and events, then on real runs: the same seed gives the same metrics, the docs name them all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GuardEvent, ReplanEvent, Vec3 } from '../../src/htn-planner'
import { runLevel } from '../../src/playground/headless'
import { CrowdLevel } from '../../src/playground/levels/crowd'
import { OrdersLevel } from '../../src/playground/levels/orders'
import { SightLevel } from '../../src/playground/levels/sight'
import { activityOf, flatMetrics, formatMetricsTable, Frame, meanMetrics, METRICS, MetricsReader, MOVE_EPSILON, NpcFrame } from '../../src/playground/metrics'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
const DT = 0.5
const at = (x: number, z = 0): Vec3 => ({ x, y: 0, z })

/** A frame of NPCs at level time t, round 1 from 0, a visitor offered unless said otherwise. */
function frame(t: number, npcs: Partial<NpcFrame>[], extra: Partial<Frame> = {}): Frame {
  return {
    t,
    dt: DT,
    round: 1,
    roundStart: 0,
    visitors: ['tester'],
    npcs: npcs.map((n, i) => ({ key: n.key ?? n.id ?? `npc${i}`, id: n.id ?? `npc${i}`, present: true, step: '', position: at(0), sees: [], ...n })),
    ...extra
  }
}
const replan = (status: string, more: Partial<ReplanEvent> = {}): GuardEvent => ({ type: 'replan', guard: 'g', reason: 'r', status, plan: [], kept: false, passes: 1, ...more })
const catchOf = (target = 'tester'): GuardEvent => ({ type: 'catch', guard: 'g', target })

// ---- activities --------------------------------------------------------------------------------------------------

test('activity rule: no step running is idle, moving or not', () => {
  assert.equal(activityOf('', 0), 'idle')
  assert.equal(activityOf('', 5), 'idle')
})

test('activity rule: a step with the body moving is moving, whatever the step', () => {
  assert.equal(activityOf('!move_to', 0.1), 'moving')
  assert.equal(activityOf('!chase', 0.1), 'moving')
  assert.equal(activityOf('!wait', 0.1), 'moving')
  assert.equal(activityOf('!move_to', MOVE_EPSILON / 2), 'acting', 'a jitter below MOVE_EPSILON is standing')
})

test('activity rule: a !wait… step standing is waiting', () => {
  assert.equal(activityOf('!wait', 0), 'waiting')
  assert.equal(activityOf('!wait_for', 0), 'waiting')
})

test('activity rule: any other step standing is acting', () => {
  assert.equal(activityOf('!look_around', 0), 'acting')
  assert.equal(activityOf('!catch', 0), 'acting')
})

test('activity shares are of the present time, and walked is the XZ distance between frames', () => {
  const r = new MetricsReader()
  r.frame(frame(0.5, [{ id: 'g', step: '!move_to', position: at(0) }]))
  r.frame(frame(1.0, [{ id: 'g', step: '!move_to', position: at(1) }]))
  r.frame(frame(1.5, [{ id: 'g', step: '!move_to', position: at(1, 1) }]))
  r.frame(frame(2.0, [{ id: 'g', step: '!wait', position: at(1, 1) }]))
  const g = r.result().npcs[0]
  assert.equal(g.present, 2)
  assert.equal(g.walked, 2)
  // The first frame has nothing to compare with: standing.
  assert.deepEqual([g.moving, g.acting, g.waiting, g.idle], [0.5, 0.25, 0.25, 0])
})

test('an NPC that is not present is not counted: no time, no walking, no detections', () => {
  const r = new MetricsReader()
  r.frame(frame(0.5, [{ id: 'g', present: false, position: at(9), sees: ['tester'] }]))
  r.frame(frame(1.0, [{ id: 'g', present: true, position: at(9) }]))
  const m = r.result()
  assert.equal(m.npcs[0].present, 0.5)
  assert.equal(m.npcs[0].walked, 0)
  assert.equal(m.encounter?.chases, 0)
  assert.equal(m.encounter?.exposed, 0.5, 'exposed only while an NPC is out to sense the visitor')
})

test('a respawned NPC (a new key, the same id) is one NPC: its walk does not jump to the new start', () => {
  const r = new MetricsReader()
  r.frame(frame(0.5, [{ key: 'first', id: 'g', position: at(0) }]))
  r.frame(frame(1.0, [{ key: 'second', id: 'g', position: at(20) }]))
  const m = r.result()
  assert.equal(m.npcs.length, 1)
  assert.equal(m.npcs[0].walked, 0)
})

// ---- events ------------------------------------------------------------------------------------------------------

test('replans: every replan counts; one that found no plan is a failed plan; a noise\'s replan is a noise reaction', () => {
  const r = new MetricsReader()
  r.frame(frame(30, [{ id: 'g' }], { dt: 30 }))
  r.event(1, 0, 1, 'g', 'g', replan('succeeded'))
  r.event(1, 0, 2, 'g', 'g', replan('no_plan'))
  r.event(1, 0, 3, 'g', 'g', replan('succeeded', { trigger: 'hearing' }))
  r.event(1, 0, 4, 'g', 'g', replan('succeeded', { trigger: 'perception', also: ['hearing'] }))
  const g = r.result().npcs[0]
  assert.deepEqual([g.replans, g.plansFailed, g.noiseReactions], [4, 1, 2])
  assert.equal(flatMetrics(r.result()).replans_per_min, 8, '4 replans in 30 s present')
})

test('steps: failed and cancelled ends are counted apart; done is neither', () => {
  const r = new MetricsReader()
  r.frame(frame(1, [{ id: 'g' }]))
  for (const status of ['done', 'failed', 'cancelled', 'cancelled'] as const) r.event(1, 0, 1, 'g', 'g', { type: 'step_end', guard: 'g', name: '!x', status })
  const g = r.result().npcs[0]
  assert.deepEqual([g.stepsFailed, g.stepsCancelled], [1, 2])
})

// ---- the encounter -----------------------------------------------------------------------------------------------

test('notice: seconds from the round\'s start to the first detection by any NPC; before the start counts 0', () => {
  const r = new MetricsReader()
  r.frame(frame(10, [{ id: 'a' }], { roundStart: 4 }))
  r.frame(frame(11, [{ id: 'a' }, { id: 'b', sees: ['tester'] }], { roundStart: 4 }))
  r.frame(frame(12, [{ id: 'a', sees: ['tester'] }], { roundStart: 4 }))
  assert.equal(r.result().rounds[0].notice, 7)
  const early = new MetricsReader()
  early.frame(frame(1, [{ id: 'a', sees: ['tester'] }], { roundStart: 3 }))
  assert.equal(early.result().rounds[0].notice, 0)
})

test('catch: seconds from the round\'s start to its first catch; the rate is rounds with one over rounds', () => {
  const r = new MetricsReader()
  r.frame(frame(1, [{ id: 'a', sees: ['tester'] }], { round: 1, roundStart: 0 }))
  r.event(1, 0, 3, 'a', 'a', catchOf())
  r.event(1, 0, 5, 'a', 'a', catchOf())
  r.frame(frame(20, [{ id: 'a' }], { round: 2, roundStart: 15 }))
  const m = r.result()
  assert.deepEqual(
    m.rounds.map(x => [x.round, x.caught, x.catches]),
    [
      [1, 3, 2],
      [2, null, 0]
    ]
  )
  const f = flatMetrics(m)
  assert.equal(f.catch_rate, 0.5)
  assert.equal(f.catch_s, 3)
  assert.equal(f.notice_s, 1)
  assert.equal(f.notice_to_catch_s, 2)
  assert.equal(f.noticed_rate, 0.5)
})

test('a chase is an NPC\'s detection episode; it is lost when it ends with no catch of the visitor meanwhile', () => {
  const r = new MetricsReader()
  r.frame(frame(1, [{ id: 'a', sees: ['tester'] }]))
  r.frame(frame(2, [{ id: 'a' }]))
  const m = r.result().encounter
  assert.deepEqual([m?.chases, m?.lost, m?.won], [1, 1, 0])
})

test('a catch by any NPC wins every open chase of that visitor: a guard that only watched did not lose it', () => {
  const r = new MetricsReader()
  r.frame(frame(1, [{ id: 'a', sees: ['tester'] }, { id: 'b', sees: ['tester'] }]))
  r.event(1, 0, 1.2, 'a', 'a', catchOf())
  r.frame(frame(2, [{ id: 'a' }, { id: 'b' }]))
  r.frame(frame(3, [{ id: 'a', sees: ['tester'] }, { id: 'b' }]))
  const m = r.result().encounter
  assert.deepEqual([m?.chases, m?.won, m?.lost], [3, 2, 0], 'the third, still open at the end, is neither')
})

test('coverage: of the time a visitor was offered to a present NPC, the share some NPC had it detected', () => {
  const r = new MetricsReader()
  r.frame(frame(1, [{ id: 'a', sees: ['tester'] }]))
  r.frame(frame(2, [{ id: 'a' }]))
  r.frame(frame(3, [{ id: 'a' }], { visitors: [] }))
  r.frame(frame(4, [{ id: 'a' }]))
  const m = r.result()
  assert.equal(m.encounter?.exposed, 1.5)
  assert.equal(m.encounter?.seen, 0.5)
  assert.equal(flatMetrics(m).coverage, 1 / 3)
})

test('presence: seconds some present NPC sensed the visitor by presence alone', () => {
  const r = new MetricsReader()
  r.frame(frame(1, [{ id: 'a', smells: true }, { id: 'b', smells: true }]))
  r.frame(frame(2, [{ id: 'a', smells: false }]))
  assert.equal(r.result().encounter?.presence, 0.5)
})

test('no visitor ever offered to a present NPC: no encounter metrics at all', () => {
  const r = new MetricsReader()
  r.frame(frame(1, [{ id: 'a' }], { visitors: [] }))
  assert.equal(r.result().encounter, null)
  assert.equal(flatMetrics(r.result()).catch_rate, undefined)
})

// ---- squads ------------------------------------------------------------------------------------------------------

test('role changes: a role other than the guard\'s last one; its first role is no change', () => {
  const r = new MetricsReader({ roles: true })
  r.frame(frame(1, [{ id: 'a' }], { roles: { a: 'hold', b: 'patrol' } }))
  r.frame(frame(2, [{ id: 'a' }], { roles: { a: 'hold', b: 'chase' } }))
  r.frame(frame(3, [{ id: 'a' }], { roles: { a: 'none', b: 'patrol' } }))
  assert.equal(r.result().squad?.roleChanges, 3)
})

test('a post is held while some present NPC stands within its radius; two there count once', () => {
  const r = new MetricsReader({ posts: [{ id: 'gate', at: at(0), radius: 2 }] })
  r.frame(frame(1, [{ id: 'a', position: at(1) }, { id: 'b', position: at(-1) }]))
  r.frame(frame(2, [{ id: 'a', position: at(3) }]))
  r.frame(frame(3, [{ id: 'a', position: at(0), present: false }]))
  const m = r.result()
  assert.equal(m.squad?.held.gate, 0.5)
  assert.equal(flatMetrics(m).gate_held, 0.5 / 1.5)
})

test('a level\'s own outcome counts: as they stand at the last frame that counts, per round', () => {
  const r = new MetricsReader({ rounds: 2 })
  r.frame(frame(1, [{ id: 'a' }], { outcomes: { served: 1 } }))
  r.frame(frame(2, [{ id: 'a' }], { round: 2, roundStart: 1.5, outcomes: { served: 3 } }))
  r.frame(frame(3, [{ id: 'a' }], { round: 3, roundStart: 2.5, outcomes: { served: 9 } }))
  assert.deepEqual(r.result().outcomes, { served: 3 })
  assert.equal(flatMetrics(r.result()).served, 1.5)
})

// ---- rounds, the flat view, the table ----------------------------------------------------------------------------

test('only the rounds asked for count: frames and events of later rounds are left out', () => {
  const r = new MetricsReader({ rounds: 1 })
  r.frame(frame(1, [{ id: 'a' }], { round: 1 }))
  r.frame(frame(2, [{ id: 'a', sees: ['tester'] }], { round: 2, roundStart: 1.5 }))
  r.event(2, 1.5, 2, 'a', 'a', replan('succeeded'))
  const m = r.result()
  assert.equal(m.rounds.length, 1)
  assert.equal(m.npcs[0].replans, 0)
  assert.equal(m.seconds, 0.5)
})

test('per-round counts divide by the rounds reached; per-NPC numbers are means over the NPCs that were present', () => {
  const r = new MetricsReader()
  r.frame(frame(1, [{ id: 'a', position: at(0) }, { id: 'b', position: at(0) }], { round: 1 }))
  r.frame(frame(2, [{ id: 'a', position: at(4) }, { id: 'b', position: at(0) }], { round: 2, roundStart: 1.5 }))
  r.frame(frame(3, [{ id: 'c', present: false }], { round: 2, roundStart: 1.5 }))
  const f = flatMetrics(r.result())
  assert.equal(f.rounds, 2)
  assert.equal(f.walked_m, 1, '(4 + 0) m over two NPCs and two rounds; c was never present')
})

test('means over runs skip the runs where a metric is undefined (null), and say null where none defines it', () => {
  assert.deepEqual(meanMetrics([{ a: 1, b: null, c: null }, { a: 3, b: 4 }]), { a: 2, b: 4, c: null })
})

test('the table: a row per metric in the documented order, a column per variant, - where undefined', () => {
  const text = formatMetricsTable([
    { label: 'default', metrics: { catch_rate: 1, moving: 0.5 } },
    { label: 'no_x', metrics: { catch_rate: null, moving: 0.25 } }
  ])
  const lines = text.split('\n')
  assert.match(lines[0], /^metric +default +no_x$/)
  assert.match(lines[2], /^moving +0\.5 +0\.25$/)
  assert.match(lines[3], /^catch_rate +1 +-$/)
})

// ---- real runs ---------------------------------------------------------------------------------------------------

test('determinism: the same seed gives the same metrics (a squad with roles and posts, and a crowd)', () => {
  for (const make of [() => new OrdersLevel(), () => new CrowdLevel()]) {
    const a = runLevel(make(), { seed: 2, rounds: 2, stagger: 5, metrics: true }).metrics
    const b = runLevel(make(), { seed: 2, rounds: 2, stagger: 5, metrics: true }).metrics
    assert.ok(a && b)
    assert.deepEqual(a, b)
  }
})

test('metrics only read the level: a run with them is the same run as one without', () => {
  const plain = runLevel(new OrdersLevel(), { seed: 3, rounds: 2 })
  const read = runLevel(new OrdersLevel(), { seed: 3, rounds: 2, metrics: true })
  delete read.metrics
  assert.deepEqual(read, plain)
})

test('a real run: level 5 notices and catches the tester every round, its guard walks and replans', () => {
  const r = runLevel(new SightLevel(), { rounds: 2, metrics: true })
  const f = r.metrics?.values ?? {}
  assert.equal(f.rounds, 2)
  assert.equal(f.noticed_rate, 1)
  assert.equal(f.catch_rate, 1)
  assert.ok((f.walked_m ?? 0) > 5 && (f.replans_per_min ?? 0) > 1, JSON.stringify(f))
  const shares = ['moving', 'acting', 'waiting', 'idle'].map(k => f[k] ?? 0)
  assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 1) < 1e-9)
})

test('the docs define every metric (docs/htn-level-metrics.md inside the scene names each key)', () => {
  const doc = readFileSync(join(ROOT, 'docs/htn-level-metrics.md'), 'utf8')
  const missing = METRICS.map(m => m.key).filter(k => !doc.includes(`\`${k}\``))
  assert.deepEqual(missing, [])
})

// ---- the shape of the plans --------------------------------------------------------------------------------------

test('plan shape: new plans (successful, not kept), their length, one-step and bookkeeping-only shares, upkeep, planner calls', () => {
  const r = new MetricsReader()
  r.frame(frame(0.5, [{ id: 'g', key: 'g', calls: 2 }]))
  r.event(1, 0, 0.5, 'g', 'g', replan('succeeded', { plan: ['!move_to (1.0 0.0 1.0) walk', '&after_waypoint 0'] }))
  r.event(1, 0, 0.5, 'g', 'g', replan('succeeded', { plan: ['!forget_noise 9.0'] }))
  r.event(1, 0, 0.5, 'g', 'g', replan('succeeded', { plan: ['!unfocus'], upkeep: ['!forget tester'] }))
  r.event(1, 0, 0.5, 'g', 'g', replan('succeeded', { plan: ['!chase tester'], kept: true }))
  r.event(1, 0, 0.5, 'g', 'g', replan('no_plan', { plan: [] }))
  r.event(1, 0, 0.5, 'g', 'g', replan('succeeded', { plan: ['!refocus 9.0', '!watch', '!face (1.0 0.0 1.0)'], upkeep: ['!unfocus', '!forget_noise 3.0'] }))
  r.frame(frame(1.0, [{ id: 'g', key: 'g', calls: 7 }]))
  const n = r.result().npcs[0]
  assert.deepEqual([n.plansNew, n.planSteps, n.plansOneStep, n.plansBookkeeping, n.upkeepSteps, n.plannerCalls], [4, 7, 2, 2, 3, 7])
  const m = flatMetrics(r.result())
  assert.equal(m.plans_per_min, 4 * 60)
  assert.equal(m.plan_len, 7 / 4)
  assert.equal(m.plan_1step, 0.5)
  assert.equal(m.plan_bookkeeping, 0.5)
  assert.equal(m.upkeep_per_min, 3 * 60)
  assert.equal(m.planner_calls_per_min, 7 * 60)
})
