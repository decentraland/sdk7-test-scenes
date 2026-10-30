// `npm run htn:run`: the debugger's Domain Runner in a terminal (tools/htn/run.ts). Most cases call runCli in
// process; one spawns the npm script end to end. The CLI must agree with the in-scene tab (src/debugger/runner.ts):
// the same inputs give the same status, plan and tree rows.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as nodePath from 'node:path'
import { domainGraph, parseSession, viewRows } from '../../src/htn-planner'
import { formatTask } from '../../src/htn-planner/htn/atom'
import { GALLERY_STATIONS } from '../../src/examples/upstream/gallery'
import { LAB_STATIONS } from '../../src/examples/upstream/lab'
import { MODES } from '../../src/examples/upstream/stations'
import { hierarchicalBacktrackingDomain } from '../../src/examples/upstream/generated/hierarchical_backtracking.htn'
import { findRunnerWorld, runDomain, runnerCatalogue, runnerWorlds, worldSlugs } from '../../src/debugger/runner'
import { reportRows } from '../../src/debugger/runner-report'
import { runCli } from '../../tools/htn/run'

const ROOT: string = process.env.HTN_REPO_ROOT ?? process.cwd()
const FIXTURES = nodePath.join(ROOT, 'test/htn/fixtures/upstream')
const HIERARCHICAL = 'test/htn/fixtures/upstream/Domains/Test/hierarchical_backtracking.domain'
const CALLTERMS = 'test/htn/fixtures/upstream/Domains/Test/callterms.domain'
const WANDERER = 'test/htn/fixtures/upstream/Domains/Wanderer.domain'
const BAD = 'test/htn/fixtures/upstream/HTNDiagnosticTests/DiagnosticSemanticErrors.domain'

function cli(...argv: string[]) {
  const out: string[] = []
  const err: string[] = []
  const code = runCli(argv, { out: t => out.push(t), err: t => err.push(t), cwd: ROOT })
  return { code, stdout: out.join('\n'), stderr: err.join('\n') }
}

const noStack = (text: string) => assert.doesNotMatch(text, /\n\s+at .+:\d+:\d+\)?$/m, 'no stack trace')

test('a plan: status, ms, the plan one step per line, the Normal tree; exit 0', () => {
  const r = cli(HIERARCHICAL, '--world', 'hierarchical/fact-backtracking', '--repeats', '0')
  assert.equal(r.code, 0, r.stderr)
  const lines = r.stdout.split('\n')
  assert.equal(lines[0], 'status: succeeded')
  assert.match(lines[1], /^ms: \d+\.\d+ \(traced\)$/)
  assert.ok(lines.includes('method: (validate_fact_backtracking)'), 'the scenario names the method')
  assert.ok(lines.includes('expected: same (scenario expects succeeded [!selected_fact second])'))
  assert.ok(lines.includes('plan: 1 step'))
  assert.ok(lines.includes('  1. !selected_fact second'))
  assert.ok(lines.includes('tree (normal): 7 rows'))
  assert.ok(lines.includes('      ✓  branch_selected  branch'))
  assert.ok(lines.includes('          ✓  2/2 (candidate ?candidate=second)'), 'a choice row as the debugger shows it')
  assert.ok(lines.includes('diagnostics: 0'))
  assert.equal(r.stderr, '')
})

test('backtracking: Verbose lists every attempt; a failed branch says which condition failed, with what', () => {
  const normal = cli(HIERARCHICAL, 'validate_fact_backtracking', '--world', 'hierarchical/fact-backtracking', '--repeats', '0')
  assert.doesNotMatch(normal.stdout, /candidate=first/, 'Normal shows the committed candidate only')
  const verbose = cli(HIERARCHICAL, 'validate_fact_backtracking', '--world', 'hierarchical/fact-backtracking', '--repeats', '0', '--verbose')
  assert.equal(verbose.code, 0)
  assert.match(verbose.stdout, /^ {10}×  \(acceptable \?candidate=first\)   checked 1: \(acceptable second\)$/m)
  assert.match(verbose.stdout, /^ {10}✓  \(acceptable \?candidate=second\)$/m)
  // Without fact backtracking the first candidate sinks the branch, the fallback plans.
  const none = cli(HIERARCHICAL, 'validate_fact_backtracking', '--world', 'hierarchical/fact-backtracking', '--repeats', '0', '--mode', 'none', '-v')
  assert.equal(none.code, 0)
  assert.match(none.stdout, /^mode: NONE$/m)
  assert.match(none.stdout, /^  1\. !fact_fallback$/m)
  assert.doesNotMatch(none.stdout, /^expected:/m, 'the expectation is for ALL')
  assert.match(none.stdout, /^failed branches: 1$/m)
  assert.match(
    none.stdout,
    /^  validate_fact_backtracking\.branch_selected  no_match  at \(acceptable \?candidate=first\)   checked 1: \(acceptable second\)  \{candidate=first\}  hierarchical_backtracking\.domain:\d+$/m
  )
})

test('callterms: a missing one fails its call with a clear diagnostic, no throw; exit 1 without a plan', () => {
  const r = cli(CALLTERMS, '--world', 'callterms/callterms-missing-reached-callterm-returns-no_plan', '--repeats', '0')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /^status: no_plan$/m)
  assert.match(r.stdout, /^failed branches: 1$/m, 'Normal lists the failures when there is no plan')
  assert.match(r.stdout, /test_callterms\.branch_callterms {2}no_match {2}at \(call binded_function_with_args "we are doing nothing"\)/)
  assert.match(r.stdout, /^ {2}missing_callterm: Callterm 'binded_function_with_args' is not registered at callterms\.domain:\d+:\d+$/m)
  // Bound (the upstream test's set), it plans.
  const bound = cli(CALLTERMS, 'test_callterms', '--world', 'callterms/callterms-missing-reached-callterm-returns-no_plan', '--callterms', 'test', '--repeats', '0')
  assert.equal(bound.code, 0, bound.stdout)
  // Unbound up front: the dev check lists every call site the set lacks.
  const none = cli(CALLTERMS, 'test_callterms', '--callterms', 'none', '--repeats', '0')
  assert.equal(none.code, 1)
  assert.match(none.stdout, /^ {2}unregistered_callterm: Callterm 'get_health' is not registered at callterms\.domain:\d+:\d+ \(domain 'CallTermsDemo' calls it; the call fails when reached\)$/m)
  noStack(none.stdout + none.stderr)
})

test('a compile error prints as htn:compile --check does; exit 2; --json says compile_error', () => {
  const r = cli(BAD)
  assert.equal(r.code, 2)
  const lines = r.stderr.split('\n')
  assert.equal(lines.filter(l => /^test\/htn\/fixtures\/upstream\/HTNDiagnosticTests\/DiagnosticSemanticErrors\.domain:\d+:\d+-\d+:\d+: error unknown-/.test(l)).length, 3, r.stderr)
  assert.match(lines[lines.length - 1], /^htn:run: compile failed for '.*DiagnosticSemanticErrors\.domain' with 3 error\(s\)$/)
  assert.equal(r.stdout, '')
  const json = cli(BAD, '--json')
  assert.equal(json.code, 2)
  const o = JSON.parse(json.stdout)
  assert.equal(o.status, 'compile_error')
  assert.equal(o.diagnostics.length, 3)
})

test('--json: one object; the same status, plan and rows as the in-scene Domain Runner', () => {
  const r = cli(HIERARCHICAL, 'validate_axiom_backtracking', '--world', 'hierarchical/axiom-backtracking', '--json', '--repeats', '0', '--verbose')
  assert.equal(r.code, 0)
  assert.equal(r.stdout.split('\n').length, 1)
  const o = JSON.parse(r.stdout)
  assert.equal(o.version, 1)
  assert.equal(o.status, 'succeeded')
  assert.deepEqual(o.plan, ['!selected_axiom second'])
  assert.equal(o.view, 'verbose')
  assert.equal(o.world.id, 'hierarchical/axiom-backtracking')
  assert.equal(o.expected.same, true)
  assert.deepEqual(o.diagnostics, [])
  assert.ok(typeof o.ms === 'number')
  // The tab: the scene's compiled module of the same domain, the same world state.
  const catalogue = runnerCatalogue([...GALLERY_STATIONS, ...LAB_STATIONS])
  const found = findRunnerWorld(catalogue, 'hierarchical/axiom backtracking')!
  const tab = runDomain({ domain: hierarchicalBacktrackingDomain, method: 'validate_axiom_backtracking', world: found.world, mode: MODES[0].mode, repeats: 0 })
  assert.equal(o.status, tab.status)
  assert.deepEqual(o.plan, tab.plan)
  const rows = reportRows(tab.run, domainGraph(hierarchicalBacktrackingDomain), 'verbose')
  assert.deepEqual(
    o.rows.map((x: { depth: number; text: string }) => [x.depth, x.text]),
    rows.map(x => [x.depth, x.text])
  )
  assert.ok(o.rows.some((x: { status: string }) => x.status === 'failed'), 'Verbose keeps the failed attempts')
})

test('--session: a DebugSession file the session loader reads back', () => {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'htn-run-test-'))
  try {
    const file = nodePath.join(dir, 'out', 'session.json')
    const r = cli(WANDERER, '--world', 'wanderer/walking-path-ready', '--session', file, '--max-passes', '3', '--json', '--repeats', '0')
    assert.equal(r.code, 0, r.stdout)
    const o = JSON.parse(r.stdout)
    const s = parseSession(fs.readFileSync(file, 'utf8'))
    assert.equal(s.domain.name, 'Wanderer')
    assert.equal(s.runs.length, 2, 'the plan and its deferred step')
    const [plan, deferred] = s.runs
    assert.deepEqual(plan.plan.map(p => formatTask(p.name, p.args)), o.plan)
    assert.equal(deferred.deferred, true)
    assert.deepEqual(deferred.plan.map(p => formatTask(p.name, p.args)), o.deferred[0].plan)
    assert.ok(s.worlds.some(w => w.revision === plan.world), 'the world it planned against')
    assert.equal(viewRows(plan, 'normal').length, o.rows.length, 'the loaded run gives the same tree')
    assert.throws(() => parseSession('{"version":2}'), /not a DebugSession: version 2, expected 1/)
    assert.throws(() => parseSession('nope'), /not a DebugSession: invalid JSON/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('--max-passes: deferred & steps expanded in order on the world it planned against', () => {
  const once = cli(WANDERER, '--world', 'wanderer/walking-path-ready', '--repeats', '0')
  assert.doesNotMatch(once.stdout, /^expanded plan:/m, 'plans once by default, as the tab')
  const r = cli(WANDERER, '--world', 'wanderer/walking-path-ready', '--repeats', '0', '--max-passes', '2')
  assert.equal(r.code, 0)
  assert.match(r.stdout, /^ {2}4\. &talk_about_destination$/m)
  assert.match(r.stdout, /^expanded plan: 5 steps \(2 planner passes\)$/m)
  assert.match(r.stdout, /^ {2}4\. !say "Both coordinates are even!"$/m)
  assert.match(r.stdout, /^deferred: &talk_about_destination -> succeeded \[!say "Both coordinates are even!"\]$/m)
})

test('a .worldstate file, the default method, and the world planning wrote', () => {
  const r = cli('test/htn/fixtures/upstream/Domains/AAACombatNPC.domain', '--world', nodePath.join(FIXTURES, 'WorldStates/AAACombatNPC_melee.worldstate'), '--repeats', '0')
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /^method: \(run\)$/m, 'the only top-level method')
  assert.match(r.stdout, /^world: .*AAACombatNPC_melee\.worldstate \(AAACombatNPC_melee\.worldstate; 8 fact tables, 11 rows\)$/m)
  // The lab's mutation case, on the scenario's own domain: a callterm adds a fact while planning.
  const mutation = cli('--world', 'lists/runtime_lists-runtime-lists-callterm-fact-mutation-is-visible-to-later-conditions', '--repeats', '0')
  assert.equal(mutation.code, 0, mutation.stdout + mutation.stderr)
  assert.match(mutation.stdout, /^world diff: \+1 -0 \(written while planning\)$/m)
})

test('user errors: one line and exit 2, never a stack trace', () => {
  const cases: [string[], RegExp][] = [
    [[HIERARCHICAL], /pick a top-level method of 'HierarchicalBacktracking': validate_parent_guard\/0 \(validate_parent_guard\), .*do_behavior_child_guard\/1 \(do_behavior_child_guard \?inp_threat\)/],
    [[HIERARCHICAL, 'do_behavior_child_guard'], /'do_behavior_child_guard' takes 1 argument\(s\), got 0/],
    [[HIERARCHICAL, 'nope'], /'nope' is not a top-level method/],
    [[HIERARCHICAL, 'do_behavior_child_guard', '(1 2'], /argument atom literal/],
    [[HIERARCHICAL, '--world', 'nope'], /unknown world state 'nope'/],
    [[HIERARCHICAL, '--mode', 'some'], /unknown mode 'some'; modes: ALL, FACTS_AND_AXIOMS, BRANCHES, NONE/],
    [[HIERARCHICAL, '--max-passes', '0'], /--max-passes takes a whole number >= 1/],
    [[HIERARCHICAL, '--frobnicate'], /unknown option '--frobnicate'/],
    [['missing.domain'], /compile failed for 'missing\.domain'/],
    [['--world', 'empty'], /give a \.domain file/],
    [[HIERARCHICAL, '--world', 'missing.worldstate'], /cannot read world state 'missing\.worldstate'/]
  ]
  for (const [argv, message] of cases) {
    const r = cli(...argv)
    assert.equal(r.code, 2, argv.join(' '))
    assert.match(r.stderr, message, argv.join(' '))
    noStack(r.stderr)
  }
  const json = cli(HIERARCHICAL, '--json')
  assert.equal(JSON.parse(json.stdout).status, 'usage_error')
  // A plan argument that parses: an atom literal.
  const arg = cli(HIERARCHICAL, 'do_behavior_child_guard', 'enemy', '--repeats', '0')
  assert.match(arg.stdout, /^method: \(do_behavior_child_guard enemy\)$/m)
})

test('--list: a domain file’s top-level methods and the world states; scenario slugs are unique', () => {
  const r = cli('--list', HIERARCHICAL)
  assert.equal(r.code, 0)
  assert.match(r.stdout, /^domain: HierarchicalBacktracking \(.*hierarchical_backtracking\.domain\)$/m)
  assert.match(r.stdout, /^ {2}top-level: do_behavior_child_guard\/1 \(do_behavior_child_guard \?inp_threat\)$/m)
  assert.match(r.stdout, /^ {4}hierarchical\/fact-backtracking \(validate_fact_backtracking\) expects succeeded: !selected_fact second$/m)
  assert.doesNotMatch(r.stdout, /^ {4}wanderer\//m, 'only this domain’s scenarios')
  const all = cli('--list')
  assert.match(all.stdout, /^ {4}wanderer\/walking-path-ready /m)
  assert.match(all.stdout, /^callterm sets: gallery, none, test, /m)
  const catalogue = runnerCatalogue([...GALLERY_STATIONS, ...LAB_STATIONS])
  const slugs = [...worldSlugs(catalogue).values()]
  assert.equal(new Set(slugs).size, slugs.length)
  assert.equal(slugs.length, runnerWorlds(catalogue).length)
  for (const s of slugs) assert.match(s, /^[a-z0-9_./-]+$/, s)
})

test('canonical examples: --list names every scenario and story, --world runs a scenario, --story replays a story', () => {
  const list = cli('--list').stdout
  assert.match(list, /^ {4}v3_rearm\/2_rearm_at_the_oak \(be_troll\) expects succeeded: !navigate_to old_oak, !uproot_trunk old_oak, &attack_enemy knight$/m)
  assert.match(list, /^ {4}soup_kitchen\/1_add_onion_solo \(make_soup soup delivery\) expects succeeded: /m)
  assert.match(list, /^stories: \d+ \(--story <id>; canonical examples, src\/examples\/canon\)$/m)
  assert.match(list, /^ {4}v5_tired\/the-recovery-survives-the-replan: /m)
  assert.doesNotMatch(list, /^problem: /m)

  const world = cli('--world', 'mouse/2_hungry_food_far', '--repeats', '0')
  assert.equal(world.code, 0, world.stderr)
  assert.ok(world.stdout.includes('expected: same (scenario expects succeeded [!move_near cheese 1.0, !consume cheese])'))

  const story = cli('--story', 'v5_tired/the-recovery-survives-the-replan')
  assert.equal(story.code, 0, story.stderr)
  assert.ok(story.stdout.split('\n').includes('  keep: !recover'))
  assert.match(story.stdout, /^matches the expected trace$/m)
  const json = JSON.parse(cli('--story', 'v5_tired/the recovery survives the replan', '--json').stdout)
  assert.deepEqual([json.story, json.matches, json.trace], ['v5_tired/the-recovery-survives-the-replan', true, json.expect])

  const unknown = cli('--story', 'v5_tired/no-such-story')
  assert.equal(unknown.code, 2)
  assert.match(unknown.stderr, /unknown story 'v5_tired\/no-such-story': see --list/)
})

test('canonical examples: --story --session records the whole story, every agent, as one session', () => {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'htn-run-test-'))
  try {
    const file = nodePath.join(dir, 'swarm.json')
    const r = cli('--story', 'swarm_coordinator/roles-as-facts-from-the-coordinator', '--session', file)
    assert.equal(r.code, 0, r.stdout)
    const s = parseSession(fs.readFileSync(file, 'utf8'))
    assert.equal(s.domain.name, 'SwarmCoordinator')
    assert.deepEqual([...new Set(s.runs.map(x => x.agent))].sort(), ['coordinator', 'd1', 'd2', 'd3'])
    assert.ok(s.timeline.filter(e => e.event.type === 'replan').length >= 8, 'every tick is a replan on the timeline')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('npm run htn:run end to end: the exit code of the run', { timeout: 120000 }, () => {
  const script = nodePath.join(ROOT, 'scripts', 'htn-run.mjs')
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: ROOT })
  const ok = run(HIERARCHICAL, '--world', 'hierarchical/child-guard', '--repeats', '0')
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, /^ {2}1\. !search enemy$/m)
  const none = run(CALLTERMS, '--world', 'callterms/callterms-missing-reached-callterm-returns-no_plan', '--repeats', '0')
  assert.equal(none.status, 1)
  const bad = run(BAD)
  assert.equal(bad.status, 2)
})

const AAA = 'test/htn/fixtures/upstream/Domains/AAACombatNPC.domain'

test('--why: why a branch, a primitive or an unknown name did not make the plan, in text and in --json', () => {
  const r = cli(AAA, '--world', 'aaa/melee-nearest-enemy', '--repeats', '0', '--why', 'critical_retreat', '--why', '!fire_burst', '--why', 'nope')
  assert.equal(r.code, 0, r.stderr)
  const lines = r.stdout.split('\n')
  const at = lines.indexOf('why not critical_retreat: failed')
  assert.ok(at > lines.findIndex(l => l.startsWith('diagnostics:')), 'after the diagnostics')
  assert.deepEqual(lines.slice(at, at + 5), [
    'why not critical_retreat: failed',
    '  combat_tick.critical_retreat: condition failed in (combat_tick 1 202 3): (<= ?hp=85 20) false',
    '  matched: combat_tick.critical_retreat',
    '  × combat_tick.critical_retreat  no_match  condition failed in (combat_tick 1 202 3): (<= ?hp=85 20) false  Includes/aaa_combat.domain:3',
    '      × (<= ?hp=85 20)  false  {inp_npc=1 inp_enemy=202 inp_distance=3 hp=85}  Includes/aaa_combat.domain:4'
  ])
  assert.ok(lines.includes('why not !fire_burst: not_reached'))
  assert.ok(lines.includes('      · combat_tick.ranged  not_reached  never reached in (combat_tick 1 202 3): an earlier branch succeeded (combat_tick.melee)  Includes/aaa_combat.domain:14'))
  assert.ok(lines.includes('why not nope: not_in_domain'))
  const json = cli(AAA, '--world', 'aaa/melee-nearest-enemy', '--repeats', '0', '--why', 'parry_counter', '--json')
  const o = JSON.parse(json.stdout)
  assert.equal(o.why.length, 1)
  assert.equal(o.why[0].verdict, 'failed')
  assert.equal(o.why[0].attempts[0].terms[0].term, '(enemy_attacking ?inp_enemy=202)')
  assert.equal(o.why[0].attempts[0].terms[0].needed, '(enemy_attacking 202)')
  assert.equal(o.why[0].attempts[0].terms[0].rows, 0)
  assert.equal(cli(AAA, '--world', 'aaa/melee-nearest-enemy', '--repeats', '0', '--json').stdout.includes('"why"'), false, 'no --why, no field')
})

test('failed branches: a choice fact that ran out of rows is not named as the cause; --why lists each rejection', () => {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'htn-run-why-'))
  try {
    const domain = nodePath.join(dir, 'shop.domain')
    const world = nodePath.join(dir, 'shop.worldstate')
    fs.writeFileSync(
      domain,
      `(:domain shop top_level_domain
    (:method (behave) top_level_method
        (buy (and (item ?i ?price) (<= ?price 20)) ((!buy ?i)))))`
    )
    fs.writeFileSync(world, 'item car 500\nitem boat 300\n')
    const r = cli(domain, '--world', world, '--repeats', '0', '--why', 'buy')
    assert.equal(r.code, 1)
    const lines = r.stdout.split('\n')
    assert.ok(lines.includes('  behave.buy  no_match  at (<= ?price=300 20)  {i=boat price=300}  shop.domain:3'), r.stdout)
    assert.ok(lines.includes('      × (<= ?price=500 20)  false  {i=car price=500}  shop.domain:3'), r.stdout)
    assert.ok(lines.includes('      × (<= ?price=300 20)  false  {i=boat price=300}  shop.domain:3'), r.stdout)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
