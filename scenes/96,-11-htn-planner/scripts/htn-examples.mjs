// Regenerate the upstream example modules the scene's gallery runs (src/examples/upstream/generated) from the
// upstream fixtures. Usage: npm run htn:examples
import { runBundled } from './run-bundled.mjs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const fixtures = 'test/htn/fixtures/upstream'
const out = 'src/examples/upstream/generated'

const domains = [
  ['Domains/AAACombatNPC.domain', 'aaaCombatDomain'],
  ['Domains/Wanderer.domain', 'wandererDomain'],
  ['Domains/Grunt.domain', 'gruntDomain'],
  ['Domains/NormalNinja.domain', 'normalNinjaDomain'],
  ['Domains/EliteNinja.domain', 'eliteNinjaDomain'],
  ['Domains/Test/complex_scenario.domain', 'complexScenarioDomain'],
  ['Domains/BuiltinComparisonsDemo.domain', 'builtinComparisonsDomain'],
  ['Domains/RuntimeBacktrackingDemo.domain', 'runtimeBacktrackingDomain'],
  ['Domains/Test/hierarchical_backtracking.domain', 'hierarchicalBacktrackingDomain'],
  ['Domains/Test/backtracking_policy.domain', 'backtrackingPolicyDomain'],
  ['Domains/Test/human.domain', 'humanDomain'],
  ['Domains/include_demo.domain', 'includeDemoDomain']
]
const worldStates = [
  ...['high_order', 'medium_order', 'low_order', 'idle', 'melee', 'ranged', 'investigation', 'search'].map(s => `WorldStates/AAACombatNPC_${s}.worldstate`),
  ...['combat', 'emergency', 'idle', 'mobility', 'recovery', 'recursive_100'].map(s => `WorldStates/Test/complex_scenario_${s}.worldstate`),
  ...['critical', 'engage', 'out_of_ammo', 'safe'].map(s => `WorldStates/Test/builtin_comparisons_${s}.worldstate`),
  'WorldStates/RuntimeBacktrackingDemo.worldstate',
  'WorldStates/Test/hierarchical_backtracking_no_combat.worldstate',
  'WorldStates/Test/human.worldstate',
  'WorldStates/Test/human_axiom_backtracking.worldstate',
  'WorldStates/Test/elite_ninja.worldstate'
]

const fileName = path => path.split('/').pop().replace(/\.(domain|worldstate)$/, '')
const jobs = [
  ...domains.map(([path, name]) => [path, `${out}/${fileName(path)}.htn.ts`, name]),
  ...worldStates.map(path => [path, `${out}/${fileName(path)}.facts.ts`])
]
let failed = 0
for (const [path, target, name] of jobs) {
  const args = [join(root, 'scripts', 'htn-compile.mjs'), `${fixtures}/${path}`, target, ...(name ? [name] : [])]
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: root })
  if (r.status !== 0) failed++
}
process.exitCode = failed ? 1 : 0

// Our labelled adaptation is separate from the verbatim upstream module.
const adapted = spawnSync(process.execPath, [
  join(root, 'scripts', 'htn-compile.mjs'),
  'src/examples/upstream/adapted/AAACombatNPC.domain',
  'src/examples/upstream/adapted/AAACombatNPC.htn.ts', 'aaaEligibleCombatDomain'
], { stdio: 'inherit', cwd: root })
if (adapted.status !== 0) process.exitCode = 1

// The language lab uses the same temporary Node launcher as the other repository CLIs.
const result = await runBundled('lab', { entryPoints: [join(root, 'scripts/htn-lab.ts')] }, {
  args: [], cwd: root, env: { ...process.env, HTN_REPO_ROOT: root }
})
if (result.status !== 0) process.exitCode = 1
