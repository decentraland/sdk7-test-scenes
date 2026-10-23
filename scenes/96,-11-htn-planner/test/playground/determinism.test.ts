// Playground levels are reproducible: time comes only from the dt the level is stepped with, random numbers only from
// the level's seeded `rng`, and the wall clock (planning ms) never changes what an NPC does. So a headless run
// (tests, `npm run htn:level`) gives the same events, plans and checks every time for the same seed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { DEFAULT_SEED } from '../../src/htn-planner'
import { LEVELS } from '../../src/playgrounds'
import { CrowdLevel } from '../../src/playground/levels/crowd'
import type { LevelSim } from '../../src/playground/sim'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
const SECONDS = 60

/** Everything a run did: every NPC's events with their times, its plan and pose now, every resolved check. */
function digest(level: LevelSim): string[] {
  const out: string[] = [`time ${level.time.toFixed(4)} round ${level.round} catches ${level.catches}`]
  for (const m of level.crew) {
    for (const e of m.history.toArray()) out.push(`${m.id} ${e.t.toFixed(4)} x${e.count ?? 1} ${JSON.stringify(e.event)}`)
    const a = m.agent
    const step = a.runner.current()
    out.push(`${m.id} at ${a.kinematic.position.x.toFixed(4)},${a.kinematic.position.z.toFixed(4)} mode ${a.mode} plans ${a.metrics.plansMade} replans ${m.replans} step ${step?.name ?? '-'}`)
  }
  for (const c of level.checkLog) out.push(`check ${c.round} ${c.label} ${c.state} ${c.seconds.toFixed(4)} at ${c.at.toFixed(4)}`)
  return out
}

function run(make: () => LevelSim, seed?: number, seconds = SECONDS): string[] {
  const level = make().init(seed)
  level.advanceTime(seconds)
  return digest(level)
}

for (const playground of LEVELS) {
  const id = playground.make().info.id
  test(`level ${id}: the same seed gives the same events, plans and checks`, () => {
    const a = run(playground.make)
    assert.ok(a.some(l => l.includes('"type":"replan"')), 'the NPCs planned')
    assert.deepEqual(run(playground.make), a)
  })
}

test('reset(seed) starts the level over: the same run as a fresh level, time from 0', () => {
  for (const make of [LEVELS[6].make, LEVELS[9].make, LEVELS[10].make, () => new CrowdLevel()]) {
    const level = make().init()
    level.advanceTime(25)
    level.reset()
    assert.equal(level.time, 0)
    assert.deepEqual(level.checkLog, [])
    level.advanceTime(SECONDS)
    assert.deepEqual(digest(level), run(make), level.info.id)
    level.reset(4)
    assert.equal(level.seed, 4)
    level.advanceTime(SECONDS)
    assert.deepEqual(digest(level), run(make, 4), `${level.info.id} seed 4`)
  }
})

test('advanceTime steps the level in fixed dt: the same as stepping it by hand', () => {
  const byHand = LEVELS[2].make().init()
  for (let i = 0; i < 300; i++) byHand.update(1 / 30)
  const advanced = LEVELS[2].make().init()
  advanced.advanceTime(10)
  assert.deepEqual(digest(advanced), digest(byHand))
  const coarse = LEVELS[2].make().init()
  coarse.advanceTime(10, 0.1)
  assert.ok(Math.abs(coarse.time - 10) < 1e-9)
})

test('the seed: a level starts with the default one; the crowd draws its guards\' places from it', () => {
  const level = new CrowdLevel().init()
  assert.equal(level.seed, DEFAULT_SEED)
  const starts = (seed: number) => new CrowdLevel().init(seed).crew.map(m => `${m.agent.kinematic.position.x.toFixed(3)},${m.agent.kinematic.position.z.toFixed(3)}`)
  assert.deepEqual(starts(3), starts(3))
  assert.notDeepEqual(starts(3), starts(4))
  assert.notDeepEqual(run(() => new CrowdLevel(), 3, 20), run(() => new CrowdLevel(), 4, 20))
})

test('the crowd\'s script passes whatever the seed (a round each, seeds 1-6)', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const level = new CrowdLevel()
    level.recordTraces = false
    level.init(seed)
    while (level.round <= 1 && level.time < 300) level.update(1 / 30)
    assert.ok(level.round > 1, `seed ${seed}: the script did not finish a round`)
    const failed = level.checkLog.filter(c => c.state === 'fail').map(c => c.label)
    assert.deepEqual(failed, [], `seed ${seed}`)
  }
})

test('the wall clock does not change behaviour: planning that takes ages gives the same run', () => {
  const perf = globalThis.performance as { now: () => number }
  const realNow = perf.now
  const make = () => new CrowdLevel()
  const normal = run(make, 2, 30)
  let fake = 0
  perf.now = () => (fake += 13.7) // every reading 13.7 ms later: each plan "takes" tens of ms
  try {
    assert.deepEqual(run(make, 2, 30), normal)
  } finally {
    perf.now = realNow
  }
})

/** Files under `dir` with a .ts / .tsx name, as paths relative to the scene with '/'. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) ? [relative(ROOT, path).split(sep).join('/')] : []
  })
}

/** Wall-clock readers allowed in src/: planning-time metrics and UI refresh, none of which changes behaviour. */
const WALL_CLOCK_ALLOWED = [
  'src/htn-planner/npc/agent.ts', // GuardAgent.metrics (option `clock`)
  'src/htn-planner/npc/plan-budget.ts', // PlanBudget's ms (option `clock`; only `planBudgetMs` acts on it)
  'src/htn-planner/htn/trace.ts', // PlanRun.ms
  'src/debugger/', // the debugger reads the simulation and times planning and its own panel, never drives it
  'src/demo/upstream-zone.ts', // a gallery station's planning ms
  'src/playground/station.ts' // the board's refresh, wall-clock as well as simulated
]
const wallClockAllowed = (file: string) => WALL_CLOCK_ALLOWED.some(a => (a.endsWith('/') ? file.startsWith(a) : file === a))

test('no Math.random in src/ (the simulation draws from a seeded Rng); wall-clock reads only where they are metrics', () => {
  const random: string[] = []
  const clock: string[] = []
  for (const file of sources(join(ROOT, 'src'))) {
    const lines = readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/)
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '')
      if (/\bMath\.random\b/.test(code)) random.push(`${file}:${i + 1}`)
      if (/\b(Date\.now|performance\.now)\s*\(/.test(code) && !wallClockAllowed(file)) clock.push(`${file}:${i + 1}`)
    })
  }
  assert.deepEqual(random, [], 'use the level\'s rng (src/htn-planner/npc/rng.ts) instead')
  assert.deepEqual(clock, [], 'simulated time comes from the dt (SimClock / the level); a metric may read the wall clock: add it to WALL_CLOCK_ALLOWED')
})
