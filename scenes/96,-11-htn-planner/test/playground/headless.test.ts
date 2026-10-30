// A level run headless and read from a terminal (src/playground/headless.ts, `npm run htn:level`): the tester
// script's checks with the sim time of each, a summary per NPC, the history on request, an exit code.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { LEVELS } from '../../src/playgrounds'
import { HelloLevel } from '../../src/playground/levels/hello'
import { CrowdLevel } from '../../src/playground/levels/crowd'
import { expect, TesterStep, wait } from '../../src/playground/sim'
import {
  findLevel,
  formatLevelList,
  formatLevelRun,
  formatLevelSet,
  LevelRunResult,
  levelRunExitCode,
  levelSetExitCode,
  LevelSetResult,
  parseLevelArgs,
  parseSeeds,
  runLevel,
  runLevelSet
} from '../../src/playground/headless'
import { SightLevel } from '../../src/playground/levels/sight'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()

test('arguments: a level, --seed, --seconds, --dt as a fraction, --rounds, --json, --verbose, --list', () => {
  assert.deepEqual(parseLevelArgs(['crowd', '--seed', '7', '--seconds', '90', '--dt', '1/60', '--rounds', '2', '--json', '--verbose']), {
    level: 'crowd',
    seed: 7,
    seconds: 90,
    dt: 1 / 60,
    rounds: 2,
    json: true,
    verbose: true,
    list: false
  })
  const d = parseLevelArgs(['9'])
  assert.ok(!('error' in d))
  assert.equal(d.level, '9')
  assert.equal(d.seed, undefined)
  assert.equal(d.dt, 1 / 30)
  assert.equal(d.rounds, 1)
  assert.ok(!('error' in parseLevelArgs(['--list'])))
  for (const bad of [[], ['crowd', '--seed'], ['crowd', '--dt', '0'], ['crowd', '--dt', 'x'], ['crowd', '--rounds', '0'], ['crowd', '--seconds', '-1'], ['crowd', '--nope'], ['a', 'b']]) {
    const r = parseLevelArgs(bad)
    assert.ok('error' in r, bad.join(' '))
  }
})

test('a level by id or by number; unknown: undefined', () => {
  assert.equal(findLevel(LEVELS, 'crowd')?.make().info.number, 9)
  assert.equal(findLevel(LEVELS, '9')?.make().info.id, 'crowd')
  assert.equal(findLevel(LEVELS, 'nope'), undefined)
  const list = formatLevelList(LEVELS)
  assert.match(list, /^ *1 +hello +A plan is a list of steps/m)
  assert.match(list, /^ *11 +orders /m)
})

test('a run: every check of a round with its sim time, the NPCs, ok; the same seed gives the same result', () => {
  const r = runLevel(new HelloLevel(), { seed: 3 })
  assert.equal(r.level.id, 'hello')
  assert.equal(r.seed, 3)
  assert.equal(r.finished, true)
  assert.equal(r.ok, true)
  assert.equal(levelRunExitCode(r), 0)
  assert.equal(r.checks.length, 5)
  assert.ok(r.checks.every(c => c.state === 'pass' && c.round === 1))
  for (let i = 1; i < r.checks.length; i++) assert.ok(r.checks[i].at >= r.checks[i - 1].at)
  assert.ok(r.seconds >= r.checks[4].at)
  assert.equal(r.npcs.length, 1)
  const npc = r.npcs[0]
  assert.equal(npc.id, 'hello')
  assert.ok(npc.plansMade >= 2 && npc.replans >= 2)
  assert.equal(npc.branch, 'morning_round')
  assert.ok(npc.lastReplanReason.length > 0)
  assert.equal(r.history, undefined, 'the history only with verbose')
  assert.deepEqual(runLevel(new HelloLevel(), { seed: 3 }), r)
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r, 'plain data: --json prints it as it is')
})

test('text: one line per check (PASS / FAIL / WAIT / ----), the result line, one line per NPC; verbose adds the history', () => {
  const r = runLevel(new HelloLevel(), { verbose: true })
  const text = formatLevelRun(r)
  assert.match(text, /^level 1 hello: A plan is a list of steps {2}\(seed 1, dt 1\/30, 1 round, limit 600 s\)$/m)
  assert.match(text, /^PASS +t= +\d+\.\d+ s +\d+\.\d+ s +a plan: morning_round, 6 steps$/m)
  assert.match(text, /^OK: 5 passed, 0 failed, 0 pending; script round 1 done at \d+\.\d s$/m)
  assert.match(text, /^ {2}hello +\S+ +morning_round +plans \d+ +replans \d+ +step .* +last replan \d+\.\d s: /m)
  assert.ok(r.history && r.history.length > 0)
  assert.match(text, /^history hello \(\d+ entries\):$/m)
  assert.match(text, /^ +\d+\.\d\d +replan +replan: /m)
  assert.doesNotMatch(formatLevelRun(runLevel(new HelloLevel(), {})), /^history/m)
})

class NeverLevel extends HelloLevel {
  protected testerScript(): TesterStep[] {
    return [wait(1, 'a moment'), expect('never holds', () => false, 2), expect('always holds', () => true, 1)]
  }
}

test('a failed check: FAIL with the time it gave up, not ok, exit 1', () => {
  const r = runLevel(new NeverLevel(), {})
  assert.equal(r.finished, true)
  assert.equal(r.ok, false)
  assert.equal(levelRunExitCode(r), 1)
  assert.deepEqual(
    r.checks.map(c => [c.label, c.state]),
    [
      ['never holds', 'fail'],
      ['always holds', 'pass']
    ]
  )
  assert.ok(Math.abs(r.checks[0].at - 3) < 0.05 && Math.abs(r.checks[0].seconds - 2) < 0.05)
  assert.match(formatLevelRun(r), /^FAIL +t= +3\.0\d s +2\.0\d s +never holds$/m)
  assert.match(formatLevelRun(r), /^FAILED: 1 passed, 1 failed, 0 pending/m)
})

test('out of time: the check it waits on and those after it are pending, not ok, exit 1', () => {
  const r = runLevel(new HelloLevel(), { seconds: 10 })
  assert.equal(r.finished, false)
  assert.ok(Math.abs(r.seconds - 10) < 1e-6)
  assert.equal(r.ok, false)
  assert.equal(levelRunExitCode(r), 1)
  const states = r.checks.map(c => c.state)
  assert.equal(states[0], 'pass')
  assert.ok(states.includes('waiting') && states[states.length - 1] === 'pending', states.join(' '))
  assert.match(formatLevelRun(r), /^TIMED OUT at 10\.0 s: 2 passed, 0 failed, 3 pending/m)
  assert.match(formatLevelRun(r), /^WAIT +t= +10\.00 s +\d+\.\d\d s +step 3: then to the tree$/m)
})

test('several rounds: every round\'s checks, a failure in any round counts', () => {
  const r = runLevel(new HelloLevel(), { rounds: 2 })
  assert.equal(r.checks.length, 10)
  assert.deepEqual([...new Set(r.checks.map(c => c.round))], [1, 2])
  assert.ok(r.ok)
})

test('every level of the scene passes a round headless, as its station board says', () => {
  for (const p of LEVELS) {
    const r: LevelRunResult = runLevel(p.make(), {})
    assert.ok(r.ok, `${r.level.id}: ${formatLevelRun(r)}`)
  }
  const crowd = runLevel(new CrowdLevel(), { seed: 5 })
  assert.equal(crowd.npcs.length, 10)
  assert.ok(crowd.ok)
})

test('npm run htn:level: the CLI prints the run, exits 0 / 1 / 2', () => {
  const cli = (...args: string[]) => spawnSync(process.execPath, [join(ROOT, 'scripts/htn-level.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' })
  const ok = cli('hello', '--json')
  assert.equal(ok.status, 0, ok.stderr)
  const parsed = JSON.parse(ok.stdout) as LevelRunResult
  assert.equal(parsed.level.id, 'hello')
  assert.equal(parsed.ok, true)
  const late = cli('1', '--seconds', '4')
  assert.equal(late.status, 1)
  assert.match(late.stdout, /TIMED OUT/)
  const usage = cli('nope')
  assert.equal(usage.status, 2)
  assert.match(usage.stderr, /unknown level "nope"/)
  assert.match(usage.stderr, /usage: npm run htn:level/)
  const list = cli('--list')
  assert.equal(list.status, 0)
  assert.match(list.stdout, /crowd/)
})

test('arguments for metrics: --metrics, --ablate <name|all>, --stagger S, --seed as a range or a list', () => {
  assert.deepEqual(parseLevelArgs(['5', '--metrics', '--ablate', 'all', '--stagger', '5', '--seed', '1-5']), {
    level: '5',
    seconds: 600,
    dt: 1 / 30,
    rounds: 1,
    json: false,
    verbose: false,
    list: false,
    metrics: true,
    ablate: 'all',
    stagger: 5,
    seeds: [1, 2, 3, 4, 5]
  })
  const one = parseLevelArgs(['5', '--seed', '-3'])
  assert.ok(!('error' in one) && one.seed === -3 && one.seeds === undefined, 'a negative seed is one seed')
  assert.deepEqual(parseSeeds('2,4,9'), [2, 4, 9])
  assert.deepEqual(parseSeeds('3-3'), [3])
  for (const bad of ['5-1', '1-x', 'a,b']) assert.equal(typeof parseSeeds(bad), 'string', bad)
  for (const bad of [['5', '--ablate'], ['5', '--ablate', '--json'], ['5', '--stagger', '-1'], ['5', '--seed', '5-1']]) assert.ok('error' in parseLevelArgs(bad), bad.join(' '))
})

test('a set of runs: every ablation on every seed, means per ablation; only a run without an ablation sets the exit code', () => {
  const set = runLevelSet(() => new SightLevel(), { seeds: [1, 2], ablations: [null, 'no_memory'], rounds: 1, stagger: 5 })
  assert.deepEqual(
    set.variants.map(v => [v.ablation, v.runs.map(r => r.seed)]),
    [
      [null, [1, 2]],
      ['no_memory', [1, 2]]
    ]
  )
  const [plain, forgetful] = set.variants
  assert.ok(plain.runs.every(r => r.ok))
  assert.ok(forgetful.runs.some(r => !r.ok), 'without memory it never investigates: a check fails')
  assert.equal(levelSetExitCode(set), 0)
  const values = plain.runs.map(r => r.metrics.values.notice_s as number)
  assert.equal(plain.mean.notice_s, (values[0] + values[1]) / 2)
  assert.match(forgetful.change, /forget a lost target/)
  const text = formatLevelSet(set)
  assert.match(text, /^level 5 sight: .*\(seeds 1,2, 1 round, limit 600 s, stagger 5 s\)$/m)
  assert.match(text, /^ {2}seed 2: FAILED \d+ at [\d.]+ s: /m)
  assert.match(text, /^metric +default +no_memory$/m)
  assert.match(text, /^catch_rate +1 +1$/m)
  const broken: LevelSetResult = { ...set, variants: [{ ...plain, runs: [{ ...plain.runs[0], ok: false }] }] }
  assert.equal(levelSetExitCode(broken), 1)
})

test('npm run htn:level: --metrics prints the table, --json has them, an unknown ablation lists those of the level', () => {
  const cli = (...args: string[]) => spawnSync(process.execPath, [join(ROOT, 'scripts/htn-level.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' })
  const table = cli('sight', '--metrics')
  assert.equal(table.status, 0, table.stderr)
  assert.match(table.stdout, /^metrics:$/m)
  assert.match(table.stdout, /^catch_rate +1$/m)
  const json = JSON.parse(cli('sight', '--json').stdout) as LevelRunResult
  assert.equal(json.metrics?.values.catch_rate, 1)
  const bad = cli('sight', '--ablate', 'no_squad')
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /no ablation "no_squad"; its ablations: no_hearing, no_memory/)
  const all = cli('orders', '--ablate', 'all', '--seed', '1-2')
  assert.equal(all.status, 0, all.stderr)
  assert.match(all.stdout, /^metric +default +no_memory +no_squad$/m)
})
