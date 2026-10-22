// Build the scene's language lab (src/examples/upstream/generated/lab): the upstream language-feature domains
// (test/htn/fixtures/upstream/Domains/Test) and the docs/SDK example domains, with scenarios taken from the
// conformance cases. Every scenario is planned once here on a fresh world; one whose result differs from the
// upstream expectation is left out (it depends on a world change made by an earlier step of its case).
// Run by scripts/htn-examples.mjs (npm run htn:examples).
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { formatTask } from '../src/htn-planner/htn/atom'
import type { DomainIR } from '../src/htn-planner/htn/ir'
import { PlanRunner } from '../src/htn-planner/htn/planner'
import { WorldState } from '../src/htn-planner/htn/world-state'
import { parseAtom, parseAtoms } from '../src/examples/upstream/atom-literal'
import { CALLTERM_SETS } from '../src/examples/upstream/conformance-callterms'
import type { LabCase } from '../src/examples/upstream/lab-case'
import { FIXTURES_DIR, isCompileExpect, loadCases } from '../test/htn/conformance/cases'
import type { ConformanceCase, PlanExpect } from '../test/htn/conformance/cases'
import { compileDomainFile, compileDomainSource, emitDomainModule, emitWorldStateModule, formatDiagnostic, parseWorldState } from '../tools/htn/compiler'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
const OUT = nodePath.join(ROOT, 'src/examples/upstream/generated/lab')
const DOCS = nodePath.join(ROOT, 'src/examples/upstream/docs')

/** Fixture domains the gallery stations (stations.ts) do not already run. */
const FIXTURE_DOMAINS = [
  'atom_list_demo', 'runtime_lists', 'numeric_expressions', 'negative_literals',
  'callterms', 'boolean_callterms', 'boolean_compatibility', 'missing_callterms', 'nested_calls', 'nested_operator_calls',
  'axiom_assignments', 'nested_axiom_choices', 'worldstate_lookup_scenarios',
  'axiom_overloads', 'method_overloads', 'shared_implementations', 'recursion_dispatch'
]
/** Cases with inline upstream docs/SDK example sources. */
const DOCS_FILE = 'docs-and-sdk.json'
const BREAKING_OPS = new Set(['addFact', 'addFacts', 'removeFact', 'clearFacts', 'clearWorld', 'loadWorldstate'])

/** worldstate_lookup_scenarios has no upstream test: plans read off the domain and its world state. */
const HAND_WRITTEN: LabCase[] = [
  ['active entity in combat', ['upstream/WorldStates/Test/worldstate_lookup_scenarios.worldstate'], [], ['!engage 0 0 0 2 3 0']],
  ['active entity without a weapon', [], [['active_entity', '0'], ['entity_state', '0', '0'], ['entity_target', '0', '0'], ['entity_squad', '0', '0']], ['!observe 0 0']],
  ['no active entity', [], [], ['!idle']]
].map(([name, worlds, facts, plan]) => ({
  domain: 'worldstate_lookup_scenarios',
  name: name as string,
  upstream: 'Domains/Test/worldstate_lookup_scenarios.domain (no upstream test)',
  method: 'run_scenario',
  args: [],
  worlds: worlds as string[],
  facts: facts as string[][],
  callterms: 'empty',
  vars: {},
  status: 'succeeded',
  plan: plan as string[]
}))

/** cmake/LinuxSmoke/main.cpp: the generated-C smoke test of the upstream CI (no conformance case). */
const SMOKE_FILE = 'upstream/cmake/LinuxSmoke/linux_smoke.domain'
const SMOKE_WORLD = [['candidate', '1'], ['candidate', '2']]
const SMOKE: LabCase[] = [
  ['run: the axiom backtracks to candidate 2', 'run', [], 'succeeded', ['!selected 2']],
  ['no_plan: a branch that never matches', 'no_plan', [], 'no_plan', []],
  ['runtime_list 7: a list built at runtime', 'runtime_list', ['7'], 'succeeded', ['!result (target 7 8 (position 7))']],
  ['runtime_list 9', 'runtime_list', ['9'], 'succeeded', ['!result (target 9 10 (position 9))']]
].map(([name, method, args, status, plan]) => ({
  domain: 'linux_smoke',
  name: name as string,
  upstream: 'cmake/LinuxSmoke/main.cpp',
  method: method as string,
  args: args as string[],
  worlds: [],
  facts: SMOKE_WORLD,
  callterms: 'linux-smoke',
  vars: {},
  status: status as LabCase['status'],
  plan: plan as string[]
}))

const slashes = (path: string) => path.split(nodePath.sep).join('/')
const baseName = (path: string) => nodePath.basename(path).replace(/\.(domain|worldstate)$/, '')

/** lowerCamelCase, as tools/htn/cli.ts names exports: 'AAACombatNPC_high_order' -> 'aaaCombatNPCHighOrder'. */
function camel(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const lowerFirst = (w: string) => {
    const caps = /^[A-Z]+(?=[A-Z][a-z])/.exec(w)?.[0] ?? (/^[A-Z]+$/.test(w) ? w : w.charAt(0))
    return caps.toLowerCase() + w.slice(caps.length)
  }
  return words.map((w, i) => (i === 0 ? lowerFirst(w) : w.charAt(0).toUpperCase() + w.slice(1))).join('')
}

/** The lab domain key of a case, or undefined when the lab does not run it. */
function domainKey(c: ConformanceCase): string | undefined {
  if (c.sources) {
    if (!c.file?.endsWith(DOCS_FILE)) return undefined
    const sdk = /^SDK\/Examples\/(\w+)\//.exec(c.upstream)
    return sdk ? sdk[1] : baseName(c.domain)
  }
  const m = /^upstream\/Domains\/Test\/(\w+)\.domain$/.exec(c.domain)
  return m && FIXTURE_DOMAINS.includes(m[1]) ? m[1] : undefined
}

interface Candidate {
  lab: LabCase
  expect: PlanExpect
}

/** The planning calls of a case that run on the case's initial world (host values may change in between). */
function candidates(c: ConformanceCase, domain: string): Candidate[] {
  const worlds = c.worldstate === undefined ? [] : Array.isArray(c.worldstate) ? c.worldstate : [c.worldstate]
  const base = { domain, name: c.name, upstream: c.upstream, worlds, facts: c.facts ?? [], callterms: c.callterms ?? 'empty', maxDepth: c.maxDepth }
  const make = (method: string, args: string[] | undefined, mode: LabCase['mode'], vars: LabCase['vars'], expect: PlanExpect): Candidate => ({
    lab: { ...base, method, args: args ?? [], vars, mode, status: expect.status, plan: expect.plan ?? null },
    expect
  })
  if (!c.script) {
    if (c.method === undefined || !c.expect || isCompileExpect(c.expect)) return []
    return [make(c.method, c.args, c.mode, { ...c.vars }, c.expect)]
  }
  const out: Candidate[] = []
  let vars: LabCase['vars'] = { ...c.vars }
  for (const op of c.script) {
    if (BREAKING_OPS.has(op.op)) break
    if (op.op === 'setVar') vars = { ...vars, [op.name]: op.value }
    else if (op.op === 'decompose') out.push(make(op.method, op.args, op.mode ?? c.mode, vars, op.expect))
    else if (op.op === 'plan') out.push(make(op.method, op.args, c.mode, vars, op.expect))
  }
  return out
}

function readWorld(path: string, into: WorldState) {
  parseWorldState(fs.readFileSync(nodePath.join(FIXTURES_DIR, path), 'utf8'), into)
}

/** Plan the scenario on a fresh world; the formatted plan, or a reason it does not match the expectation. */
function check(lab: LabCase, ir: DomainIR, expect?: PlanExpect): string | undefined {
  const world = new WorldState()
  for (const w of lab.worlds) readWorld(w, world)
  for (const [name, ...args] of lab.facts) world.add(name, ...parseAtoms(args))
  const vars: Record<string, ReturnType<typeof parseAtom> | undefined> = {}
  for (const [k, v] of Object.entries(lab.vars)) vars[k] = v === null ? undefined : parseAtom(v)
  const host = { world, vars, trace: [] as string[], counters: {} as Record<string, number>, errors: [] as string[] }
  // The lab checks plans only; a callterm error is not a reason to skip a scenario (the stations report it).
  const runner = new PlanRunner(ir, world, {
    callterms: CALLTERM_SETS[lab.callterms],
    context: host,
    mode: lab.mode,
    maxDepth: lab.maxDepth,
    calltermErrorPolicy: 'fail_silently'
  })
  const status = runner.plan(lab.method, parseAtoms(lab.args))
  const plan = runner.steps.map(s => formatTask(s.name, s.args))
  if (status !== lab.status) return `status ${status}, expected ${lab.status}`
  if (lab.plan && JSON.stringify(plan) !== JSON.stringify(lab.plan)) return `plan ${JSON.stringify(plan)}`
  if (expect?.planLength !== undefined && plan.length !== expect.planLength) return `plan length ${plan.length}`
  if (host.errors.length) return `callterm errors ${host.errors.join('; ')}`
  return undefined
}

function write(path: string, text: string) {
  fs.mkdirSync(nodePath.dirname(path), { recursive: true })
  fs.writeFileSync(path, text)
}

// ---- hot reload (HTNHotReloadDemo/src/HTNHotReloadDemoSelfTest.cpp) -------------------------------------------

const HOT_RELOAD_OUT = nodePath.join(ROOT, 'src/examples/upstream/generated/hot-reload')
const HOT_RELOAD_TEMPLATE = 'upstream/HTNHotReloadDemo/Validation/Wanderer.domain'
const HOT_RELOAD_REVISIONS = ['A', 'B']
/** The source the self-test writes to check that a failed compile keeps the active domain. */
const HOT_RELOAD_BROKEN = '(:domain InvalidSource (unterminated'

/**
 * The self-test's revisions: the validation template with @REVISION@ replaced, compiled next to a copy of
 * Domains/Includes/movement2.domain (here: its include is read from the fixture Domains/Includes), plus the
 * diagnostics of the broken source.
 */
function hotReload(): number {
  fs.rmSync(HOT_RELOAD_OUT, { recursive: true, force: true })
  const template = nodePath.join(FIXTURES_DIR, HOT_RELOAD_TEMPLATE)
  const includes = nodePath.join(FIXTURES_DIR, 'upstream/Domains/Includes')
  const text = fs.readFileSync(template, 'utf8')
  const header = [`Source: ${slashes(nodePath.relative(ROOT, template))} with @REVISION@ replaced`]
  let failed = 0
  for (const rev of HOT_RELOAD_REVISIONS) {
    const readFile = (path: string) =>
      nodePath.resolve(path) === nodePath.resolve(template)
        ? text.split('@REVISION@').join(rev)
        : fs.readFileSync(nodePath.join(includes, nodePath.basename(path)), 'utf8')
    const result = compileDomainFile(template, { readFile })
    for (const d of result.diagnostics) console.error(formatDiagnostic(d))
    if (!result.ok) {
      failed++
      continue
    }
    const out = nodePath.join(HOT_RELOAD_OUT, `WandererRev${rev}.htn.ts`)
    write(out, emitDomainModule(result.ir, `wandererRev${rev}Domain`, { irImportPath: '../../../../htn-planner/htn/ir', header: [...header, `by ${rev}`] }))
  }
  const broken = compileDomainSource('Wanderer.domain', HOT_RELOAD_BROKEN)
  if (broken.ok) {
    console.error('htn:lab: the broken hot reload source compiled')
    failed++
  }
  const lines = [
    '// Generated by scripts/htn-lab.ts (npm run htn:examples). Do not edit by hand.',
    '// The broken source of the hot reload self-test and what the compiler says about it.',
    `export const BROKEN_SOURCE = ${JSON.stringify(HOT_RELOAD_BROKEN)}`,
    `export const BROKEN_DIAGNOSTICS: string[] = ${JSON.stringify(broken.diagnostics.map(formatDiagnostic))}`,
    ''
  ]
  write(nodePath.join(HOT_RELOAD_OUT, 'broken.ts'), lines.join('\n'))
  console.log(`htn:lab: wrote hot reload revisions ${HOT_RELOAD_REVISIONS.join(', ')} and the broken source`)
  return failed
}

function main(): number {
  fs.rmSync(OUT, { recursive: true, force: true })
  const irs = new Map<string, DomainIR>()
  const exports = new Map<string, string>()
  const compile = (key: string, file: string): boolean => {
    if (irs.has(key)) return true
    const result = compileDomainFile(file)
    for (const d of result.diagnostics) console.error(formatDiagnostic(d))
    if (!result.ok) return false
    const name = `${camel(key)}Domain`
    const header = [`Source: ${slashes(nodePath.relative(ROOT, file))}`]
    write(nodePath.join(OUT, `${key}.htn.ts`), emitDomainModule(result.ir, name, { irImportPath: '../../../../htn-planner/htn/ir', header }))
    irs.set(key, result.ir)
    exports.set(key, name)
    return true
  }

  const accepted: LabCase[] = []
  const seen = new Set<string>()
  let skipped = 0
  const take = (lab: LabCase, expect?: PlanExpect) => {
    const id = JSON.stringify([lab.domain, lab.method, lab.args, lab.worlds, lab.facts, lab.callterms, lab.vars, lab.mode, lab.maxDepth])
    if (seen.has(id)) return
    const why = check(lab, irs.get(lab.domain)!, expect)
    if (why) {
      skipped++
      console.log(`htn:lab: skip ${lab.domain} ${lab.method} (${lab.name}): ${why}`)
      return
    }
    seen.add(id)
    accepted.push(lab)
  }

  let failed = 0
  for (const c of loadCases()) {
    const key = domainKey(c)
    if (!key) continue
    let file = nodePath.join(FIXTURES_DIR, c.domain)
    if (c.sources) {
      file = nodePath.join(DOCS, `${key}.domain`)
      if (!irs.has(key)) write(file, c.sources[c.domain])
    }
    if (!compile(key, file)) {
      failed++
      continue
    }
    for (const { lab, expect } of candidates(c, key)) take(lab, expect)
  }
  for (const key of FIXTURE_DOMAINS)
    if (!compile(key, nodePath.join(FIXTURES_DIR, `upstream/Domains/Test/${key}.domain`))) failed++
  for (const lab of HAND_WRITTEN) take(lab)
  if (compile('linux_smoke', nodePath.join(FIXTURES_DIR, SMOKE_FILE))) for (const lab of SMOKE) take(lab)
  else failed++

  const worldPaths = [...new Set(accepted.flatMap(c => c.worlds))].sort()
  const worldKey = (path: string) => baseName(path)
  for (const path of worldPaths) {
    const world = new WorldState()
    readWorld(path, world)
    const header = [`Source: test/htn/fixtures/${path}`]
    const text = emitWorldStateModule(world, `${camel(worldKey(path))}Facts`, { irImportPath: '../../../../htn-planner/htn/world-state', header })
    write(nodePath.join(OUT, `${worldKey(path)}.facts.ts`), text)
  }

  const keys = [...irs.keys()].sort()
  const order = [...FIXTURE_DOMAINS, ...keys.filter(k => !FIXTURE_DOMAINS.includes(k))]
  const cases = accepted
    .map(c => ({ ...c, worlds: c.worlds.map(worldKey) }))
    .sort((a, b) => order.indexOf(a.domain) - order.indexOf(b.domain))
  const lines = [
    '// Generated by scripts/htn-lab.ts (npm run htn:examples). Do not edit by hand.',
    "import type { DomainIR } from '../../../../htn-planner/htn/ir'",
    "import type { WorldFacts } from '../../../../htn-planner/htn/world-state'",
    "import type { LabCase } from '../../lab-case'",
    ...keys.map(k => `import { ${exports.get(k)} } from './${k}.htn'`),
    ...worldPaths.map(p => `import { ${camel(worldKey(p))}Facts } from './${worldKey(p)}.facts'`),
    '',
    'export const LAB_DOMAINS: Record<string, DomainIR> = {',
    ...keys.map(k => `  ${k}: ${exports.get(k)},`),
    '}',
    '',
    'export const LAB_WORLDS: Record<string, WorldFacts> = {',
    ...worldPaths.map(p => `  ${worldKey(p)}: ${camel(worldKey(p))}Facts,`),
    '}',
    '',
    'export const LAB_CASES: LabCase[] = [',
    ...cases.map(c => `  ${JSON.stringify(c)},`),
    ']',
    ''
  ]
  write(nodePath.join(OUT, 'cases.ts'), lines.join('\n'))
  console.log(`htn:lab: wrote ${cases.length} scenarios over ${keys.length} domains and ${worldPaths.length} world states (${skipped} skipped)`)
  failed += hotReload()
  return failed ? 1 : 0
}

process.exitCode = main()
