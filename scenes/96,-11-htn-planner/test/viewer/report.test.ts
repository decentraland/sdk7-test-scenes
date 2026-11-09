// npm run htn:view -- <session.json> --text: the session as a plain-text report for an AI agent, read off the same
// view model as the page (timeline markers with the plan diff, the refinement tree and its folds, the plan strip, the
// world view). A header; a line per replan, failed step and unannounced run, repeats ×N; the chosen runs as an
// outline; deterministic (no wall-clock ms); cut at --max-lines with a line saying so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { int, sym } from '../../src/htn-planner/htn/atom'
import { buildSession, parseSession } from '../../src/htn-planner/debug/session'
import type { DebugSession } from '../../src/htn-planner/debug/session'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import { decompose } from '../../src/htn-planner/htn/planner'
import { PlanTraceRecorder } from '../../src/htn-planner/htn/trace'
import type { AgentLogEntry } from '../../src/htn-planner/npc/history'
import type { GuardEvent, ReplanEvent } from '../../src/htn-planner/npc/actions'
import { compile } from '../htn/compiler/helpers'
import { reportOptionError, reportText, sessionReport } from '../../tools/viewer/model/report'
import { parseViewArgs } from '../../tools/viewer/model/html'
import { runCli } from '../../tools/htn/run'
import { levelSession, runLevel } from '../../src/playground/headless'
import { OrdersLevel } from '../../src/playground/levels/orders'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()

const DOMAIN = `(:domain Door top_level_domain
  (:method (go) top_level_method
    (open_door (and (door ?d open) (at ?d ?p)) ((!walk ?p) (!enter ?d)))
    (knock (and (door ?d closed)) ((!knock ?d) (!wait 2)))))`

/**
 * Agent `g`: the door closed at t=1 (knock), open at t=5 (walk; the walk fails at 7), gone at t=7 (no plan); the same
 * replan logged twice at 1 and 2 (a collapsed pair), the measured ms set to noise.
 */
function doorSession(): DebugSession {
  const r = compile(DOMAIN)
  assert.ok(r.ok)
  let now = 0
  const rec = new PlanTraceRecorder(r.ir, { time: () => now })
  const w = new WorldState()
  w.add('door', sym('front'), sym('closed'))
  w.add('at', sym('front'), int(4))
  now = 1
  decompose(r.ir, w, 'go', [], { trace: rec })
  w.set('door', sym('front'), sym('open'))
  now = 5
  decompose(r.ir, w, 'go', [], { trace: rec })
  w.clear('door', 2)
  now = 7
  decompose(r.ir, w, 'go', [], { trace: rec })
  const replan = (t: number, e: Partial<ReplanEvent>, extra: Partial<AgentLogEntry> = {}): AgentLogEntry => ({
    t,
    ...extra,
    event: { type: 'replan', guard: 'g', reason: 'start', status: 'succeeded', plan: [], kept: false, passes: 1, ...e }
  })
  const ev = (t: number, event: GuardEvent): AgentLogEntry => ({ t, event })
  const history = {
    toArray: () => [
      replan(1, { trigger: 'start', plan: ['!knock front', '!wait 2'] }),
      ev(1, { type: 'step', guard: 'g', name: '!knock', args: [sym('front')] }),
      ev(3, { type: 'step_end', guard: 'g', name: '!knock', status: 'done' }),
      ev(3, { type: 'step', guard: 'g', name: '!wait', args: [int(2)] }),
      ev(5, { type: 'step_end', guard: 'g', name: '!wait', status: 'cancelled' }),
      replan(5, { trigger: 'facts', reason: 'facts closed -> open', plan: ['!walk 4', '!enter front'], previous: ['!wait 2'], changes: ['- (door front closed)', '+ (door front open)'] }),
      ev(5, { type: 'step', guard: 'g', name: '!walk', args: [int(4)] }),
      ev(7, { type: 'step_end', guard: 'g', name: '!walk', status: 'failed' }),
      replan(7, { trigger: 'step_failed', reason: 'step failed', status: 'no_plan', changes: ['- (door front open)'] })
    ]
  }
  const s = JSON.parse(JSON.stringify(buildSession({ domain: r.ir, agents: [{ id: 'g', recorder: rec }], histories: [history as never] }))) as DebugSession
  for (const run of s.runs) run.ms = Math.random()
  return s
}

test('the report of a small session: header, a line per replan and failure, the last and the failed run as outlines', () => {
  const text = reportText(sessionReport(doorSession(), { source: 'door.json' }))
  assert.equal(
    text,
    [
      'HTN session door.json',
      'domain Door: g',
      '1 agent · time 1.00–7.00 s · 3 runs · failures: 1 planning, 1 steps',
      '  g: 3 runs, 3 replans, 1 failed, 1 failed step',
      text.split('\n')[4],
      '',
      '== timeline g ==',
      't=1.00 run 1 ◆ start  plan: new 2: knock(front), wait(2)',
      't=5.00 run 2 ◆ facts closed -> open  Δ −door(front, closed) +door(front, open)  plan: kept 0 / dropped 1 / new 2: walk(4), enter(front)',
      't=7.00 × step walk(4) failed',
      't=7.00 run 3 × step_failed: step failed  Δ −door(front, open)  plan: none (no_plan): go × knock: door(?d, closed) — no rows',
      '',
      '== run g:3 · t=7.00 · no_plan · failed, last run of g ==',
      'why: step_failed: step failed → no_plan',
      'facts changed: −door(front, open)',
      'failed: go × knock: door(?d, closed) — no rows',
      'tree (normal; --verbose for every attempt):',
      '  × go',
      '    × open_door',
      '      | × door(?d, open) — no rows',
      '    × knock',
      '      | × door(?d, closed) — no rows',
      'plan: none',
      'world rev 4 vs rev 3:',
      '  −○ door(front, open)',
      '  not read, unchanged: at (1)',
      ''
    ].join('\n')
  )
  assert.match(text.split('\n')[4], /^notation: ◆ replan/)
})

test('a run chosen by --run or --at: why it planned, the plan diff, the plan at the cursor, the world it rests on', () => {
  const s = doorSession()
  const second = s.runs[1]
  const at6 = reportText(sessionReport(s, { at: 6 }))
  const byRun = reportText(sessionReport(s, { run: { agent: 'g', seq: second.seq } }))
  const block = (t: string) => t.slice(t.indexOf('== run'))
  assert.equal(block(at6).split('\n')[0], `== run g:${second.seq} · t=5.00 · succeeded, 2 steps · the run at t=6.00 ==`)
  assert.deepEqual(block(at6).split('\n').slice(1), [
    'why: facts closed -> open → new plan',
    'facts changed: −door(front, closed) +door(front, open)',
    'plan diff (= kept − dropped + new): + walk(4)  + enter(front)  − wait(2)',
    'tree (normal; --verbose for every attempt):',
    '  ✓ go',
    '    ✓ open_door',
    '      | ✓ door(front, open)',
    '      | ✓ at(front, 4)',
    '      ✓ walk(4)',
    '      ✓ enter(front)',
    '    · not tried: knock',
    'plan at t=6.00:',
    '  1. ▶ walk(4)  5.00–',
    '  2. · enter(front)',
    `world rev ${second.world} vs rev ${s.runs[0].world}:`,
    '   ● at(front, 4)',
    '  ~● door(front, open)  was door(front, closed)',
    ''
  ])
  assert.equal(block(byRun).split('\n')[0], `== run g:${second.seq} · t=5.00 · succeeded, 2 steps · selected ==`)
  assert.ok(block(byRun).includes('  1. × walk(4)  5.00–7.00'), 'at the end of the session: the walk failed')
})

test('--verbose: every attempt as recorded, every fold open', () => {
  const s = doorSession()
  const text = reportText(sessionReport(s, { run: { agent: 'g', seq: s.runs[0].seq }, verbose: true }), { verbose: true })
  assert.ok(text.includes('tree (verbose, every attempt as recorded):'))
  assert.ok(text.includes('    × open_door\n      | × door(?d, open) — 1 row, none match\n      | · at(?d, ?p)'), text)
})

test('identical consecutive lines collapse to ×N with the time span and the runs', () => {
  const s = doorSession()
  const first = s.timeline[0]
  s.timeline.splice(1, 0, { ...first, t: 2, event: { ...first.event } })
  const lines = sessionReport(s).timelines[0].lines
  assert.equal(lines[0].count, 2)
  assert.match(reportText(sessionReport(s)), /^t=1\.00–2\.00 run 1 ×2 ◆ start {2}plan: new 2: knock\(front\), wait\(2\)$/m)
})

test('the text is deterministic (no measured ms) and stays under --max-lines with a line saying what was cut', () => {
  const a = reportText(sessionReport(doorSession()))
  assert.equal(reportText(sessionReport(doorSession())), a, 'the measured ms differ, the text does not')
  const cut = reportText(sessionReport(doorSession()), { maxLines: 10 }).split('\n')
  assert.equal(cut.length, 11, '10 lines and the final newline')
  const total = a.split('\n').length - 1
  assert.equal(cut[9], `… ${total - 9} more lines (use --run <agent>:<n>, --at <t> or --agent <id> to narrow, --max-lines N to raise)`)
  assert.equal(reportText(sessionReport(doorSession()), { maxLines: 0 }), a, '0: no limit (and this one is short)')
  assert.ok(!/\d+\.\d{3,} ?ms/.test(a), 'no milliseconds')
})

test('options naming what the session lacks: an agent, a run', () => {
  const s = doorSession()
  assert.equal(reportOptionError(s, { agents: ['g'] }), null)
  assert.equal(reportOptionError(s, { agents: ['x'] }), "no agent 'x' in this session (agents: g)")
  assert.equal(reportOptionError(s, { run: { agent: 'g', seq: 99 } }), `g has no run 99 (its runs: ${s.runs[0].seq}..${s.runs[2].seq})`)
})

test('arguments: --text / --json with the report options; report options alone, or with --out, are usage errors', () => {
  assert.deepEqual(parseViewArgs(['s.json', '--text']), { session: 's.json', open: false, report: 'text' })
  assert.deepEqual(parseViewArgs(['s.json', '--text', '--agent', 'a', '--agent', 'stalker (2)', '--run', 'stalker (2):3', '--verbose', '--world-all', '--max-lines', '50']), {
    session: 's.json',
    open: false,
    report: 'text',
    agents: ['a', 'stalker (2)'],
    run: { agent: 'stalker (2)', seq: 3 },
    verbose: true,
    worldAll: true,
    maxLines: 50
  })
  assert.deepEqual(parseViewArgs(['s.json', '--json', '--at', '12.5']), { session: 's.json', open: false, report: 'json', at: 12.5 })
  for (const bad of [
    ['s.json', '--agent', 'a'],
    ['s.json', '--verbose'],
    ['s.json', '--text', '--out', 'x.html'],
    ['s.json', '--text', '--json'],
    ['s.json', '--text', '--run', 'a'],
    ['s.json', '--text', '--at', 'soon'],
    ['s.json', '--text', '--max-lines', '-1'],
    ['s.json', '--text', '--run', 'a:1', '--at', '2']
  ])
    assert.ok('error' in parseViewArgs(bad), bad.join(' '))
})

test('the gallery AAA run (htn:run --session): the tree, the plan, the world it rests on', () => {
  const dir = mkdtempSync(join(tmpdir(), 'htn-report-'))
  try {
    const file = join(dir, 'aaa.json')
    const out: string[] = []
    const io = { out: (t: string) => out.push(t), err: (t: string) => out.push(t), cwd: dir }
    assert.equal(runCli(['--world', 'aaa/melee-low-health-retreat', '--session', file], io), 0, out.join('\n'))
    const text = reportText(sessionReport(parseSession(readFileSync(file, 'utf8')), { source: 'aaa.json' }))
    const lines = text.split('\n')
    assert.deepEqual(lines.slice(0, 4), ['HTN session aaa.json', 'domain AAACombatNPC: domain-runner', '1 agent · untimed (runs in order) · 1 run · failures: 0 planning, 0 steps', '  domain-runner: 1 run'])
    assert.ok(lines.includes('run 1 ✓ run  plan: 4 steps: announce_state(combat, 1), remember_enemy(1, 202), throw_smoke(1), retreat_via(1, back_alley)'))
    const tree = lines.indexOf('tree (normal; --verbose for every attempt):')
    assert.deepEqual(lines.slice(tree + 1, tree + 4), ['  ✓ run', '    × high_priority_script', '      | ✓ controlled_npc(1) ↺2'])
    for (const l of [
      '      | × scripted_order(1, high, ?order, ?target) — no rows',
      '        ✓ critical_retreat',
      '          | ✓ 15 ≤ 20',
      '        · not tried: melee, ranged',
      'plan:',
      '  4. retreat_via(1, back_alley)',
      '   ● health(1, 15)',
      '   ○ enemy_distance(1, 201, 17)',
      '   ● enemy_dead: no rows'
    ])
      assert.ok(lines.includes(l), l)
    assert.match(text, /^ {2}not read, unchanged: .*stamina \(1\)/m)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a level 11 run: every agent a timeline of replans, the last run of each, the same text for the same seed', () => {
  const record = () => {
    const level = new OrdersLevel()
    runLevel(level, { seconds: 12, seed: 2, record: true })
    return JSON.parse(JSON.stringify(levelSession(level))) as DebugSession
  }
  const s = record()
  const text = reportText(sessionReport(s, { source: 'orders.json' }), { maxLines: 0 })
  assert.equal(reportText(sessionReport(record(), { source: 'orders.json' }), { maxLines: 0 }), text, 'deterministic')
  const lines = text.split('\n')
  assert.equal(lines[1], `domain ${s.domain.name}: a, b, c · domain YardSquad: squad`)
  assert.deepEqual(
    lines.filter(l => l.startsWith('== timeline')),
    ['== timeline a ==', '== timeline b ==', '== timeline c ==', '== timeline squad ==']
  )
  const entries = lines.filter(l => /^t=\d/.test(l))
  assert.ok(entries.length > 10)
  for (const l of entries) assert.match(l, /^t=\d+\.\d\d(–\d+\.\d\d)? (runs? \d+(–\d+)? )?(×\d+ )?[◆◇×&✓] /, l)
  assert.ok(entries.some(l => /◆ perception: nothing → sees tester {2}Δ \+target_visible\(tester, \(/.test(l)), 'a perception replan with the fact and its values')
  assert.ok(entries.some(l => / plan: kept \d+ \/ dropped \d+ \/ new \d+: /.test(l)), 'a plan diff')
  const runs = lines.filter(l => l.startsWith('== run'))
  assert.deepEqual(
    runs.map(l => l.replace(/:\d+ .*· (last run of \S+) ==$/, ' $1')),
    ['== run a last run of a', '== run b last run of b', '== run c last run of c', '== run squad last run of squad']
  )
  const narrowed = reportText(sessionReport(s, { agents: ['squad'] }))
  assert.ok(!narrowed.includes('== timeline a ==') && narrowed.includes('== timeline squad =='))
  assert.ok(reportText(sessionReport(s)).split('\n').length <= 201, 'the default limit')
})

test('npm run htn:view -- <session> --text / --json: the report on stdout, no page; an unknown agent exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'htn-report-cli-'))
  try {
    const file = join(dir, 'door.json')
    writeFileSync(file, JSON.stringify(doorSession()))
    const view = (...args: string[]) => spawnSync(process.execPath, [join(ROOT, 'scripts/htn-view.mjs'), file, ...args], { cwd: ROOT, encoding: 'utf8' })
    const text = view('--text', '--max-lines', '5')
    assert.equal(text.status, 0, text.stderr)
    assert.equal(text.stdout.split('\n')[0], 'HTN session door.json')
    assert.match(text.stdout, /^… \d+ more lines/m)
    assert.ok(!existsSync(join(dir, 'door.html')), 'no page')
    const json = view('--json', '--agent', 'g')
    assert.equal(json.status, 0, json.stderr)
    assert.equal(JSON.parse(json.stdout).runs[0].agent, 'g')
    const bad = view('--text', '--agent', 'nobody')
    assert.equal(bad.status, 2)
    assert.match(bad.stderr, /no agent 'nobody' in this session \(agents: g\)/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
