// A headless level run recorded as a DebugSession (`npm run htn:level -- <level> --session out.json`): every NPC's
// runs, worlds and events for the whole run (not the board's last 32), and a level's other planners (a squad
// planner) with their own domain and decisions, so a viewer can replay the run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSession, sessionGraph } from '../../src/htn-planner/debug/session'
import type { DebugSession } from '../../src/htn-planner/debug/session'
import { levelSession, parseLevelArgs, runLevel } from '../../src/playground/headless'
import { OrdersLevel } from '../../src/playground/levels/orders'
import { StalkerLevel } from '../../src/playground/levels/stalker'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()

/** The session without what the wall clock measures (planning ms), which is all that may differ between two runs. */
function withoutTimings(s: DebugSession): unknown {
  return JSON.parse(JSON.stringify(s), (key, value) => (key === 'ms' || /Ms$/.test(key) ? 0 : value))
}

test('--session <file> is an option of htn:level', () => {
  const a = parseLevelArgs(['orders', '--session', 'out.json'])
  assert.ok(!('error' in a))
  assert.equal(a.session, 'out.json')
  assert.ok('error' in parseLevelArgs(['orders', '--session']))
  const b = parseLevelArgs(['orders'])
  assert.ok(!('error' in b) && !('session' in b), 'absent unless given')
})

test('level 11: every guard and the squad planner, each run kept, the squad on its own domain with its decisions', () => {
  const level = new OrdersLevel()
  runLevel(level, { seconds: 90, rounds: 4, record: true })
  const s = levelSession(level)
  assert.deepEqual([...new Set(s.runs.map(r => r.agent))].sort(), ['a', 'b', 'c', 'squad'])
  const a = s.runs.filter(r => r.agent === 'a')
  assert.ok(a.length > 32, `more runs than the board keeps (${a.length})`)
  assert.ok(a[0].t! < 0.1, 'the first run is still there')
  assert.equal(sessionGraph(s, 'squad').name, 'YardSquad')
  assert.equal(sessionGraph(s, 'a').name, s.domain.name)
  const decisions = s.timeline.filter(e => e.event.guard === 'squad')
  assert.ok(decisions.length >= 2, 'the squad decisions are in the timeline')
  assert.ok(decisions.every(e => e.event.type === 'replan' && e.event.reason !== ''))
  assert.ok(s.timeline.some(e => e.event.guard === 'b' && e.event.type === 'step'))
  for (const r of s.runs) assert.ok(s.worlds.some(w => w.agent === r.agent && w.revision === r.world), `world of ${r.agent} #${r.seq}`)
  assert.ok(s.runs.every((r, i) => i === 0 || r.t! >= s.runs[i - 1].t!), 'by time')
  assert.ok(parseSession(JSON.stringify(s)))
})

test('the same seed gives the same session, but for the measured planning ms', () => {
  const record = () => {
    const level = new StalkerLevel()
    runLevel(level, { seconds: 20, seed: 4, record: true })
    return withoutTimings(levelSession(level))
  }
  assert.deepEqual(record(), record())
})

test('npm run htn:level -- <level> --session: writes the file and says so', () => {
  const dir = mkdtempSync(join(tmpdir(), 'htn-level-session-'))
  try {
    const file = join(dir, 'hello.json')
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/htn-level.mjs'), 'hello', '--session', file], { cwd: ROOT, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /session: .*hello\.json/)
    const s = parseSession(readFileSync(file, 'utf8'))
    assert.ok(s.runs.length > 0 && s.timeline.length > 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a respawned NPC: each one an agent of its own, on the level clock', () => {
  const level = new StalkerLevel()
  runLevel(level, { seconds: 120, record: true })
  assert.ok(level.retired.length > 0, 'the stalker respawned at least once')
  const s = levelSession(level)
  const ids = [...new Set(s.runs.map(r => r.agent))]
  assert.deepEqual(ids.slice(0, 2), ['stalker', 'stalker (2)'])
  const second = s.runs.filter(r => r.agent === 'stalker (2)')
  const spawned = level.retired.length > 1 ? level.retired[1].spawnedAt : level.crew[0].spawnedAt
  assert.ok(second[0].t! >= spawned - 1e-9 && spawned > 0, `the second one starts at ${spawned} s, not 0`)
  assert.ok(s.timeline.filter(e => e.event.guard === 'stalker (2)').every(e => e.t >= spawned - 1e-9))
  assert.ok(s.runs.every((r, i) => i === 0 || r.t! >= s.runs[i - 1].t!), 'by time')
  assert.deepEqual(Object.keys(s.drift ?? {}), [ids[ids.length - 1]], 'only the NPC still there has a world now (the drift)')
})
