// The language lab: upstream's language-feature test domains (Domains/Test), the docs/SDK example domains and the
// CI smoke test domain, one station per topic, then the hot reload station (hot-reload.ts). Scenarios are the
// conformance cases that plan on a fresh world (generated/lab/cases.ts, npm run htn:examples), each with its
// upstream expectation and the callterm set of the upstream test.
import { addFacts, Atom } from '../../htn-planner'
import { DEFAULT_MAX_DEPTH } from '../../htn-planner/htn/engine'
import { parseAtom, parseAtoms } from './atom-literal'
import { CALLTERM_SETS, HostContext } from './conformance-callterms'
import { LAB_CASES, LAB_DOMAINS, LAB_WORLDS } from './generated/lab/cases'
import { HOT_RELOAD_STATION } from './hot-reload'
import type { LabCase } from './lab-case'
import type { GalleryScenario, GalleryStation } from './stations'

const TOPICS: { id: string; title: string; blurb: string; domains: string[] }[] = [
  { id: 'lists', title: 'Lists', blurb: 'atom lists, split head/tail, runtime list values', domains: ['atom_list_demo', 'runtime_lists'] },
  { id: 'numbers', title: 'Numbers', blurb: 'arithmetic, bad operands, negative literals', domains: ['numeric_expressions', 'negative_literals'] },
  {
    id: 'callterms',
    title: 'Callterms',
    blurb: 'host functions: bool results, missing ones, new facts',
    domains: ['callterms', 'boolean_callterms', 'boolean_compatibility', 'missing_callterms']
  },
  { id: 'nested', title: 'Nested calls', blurb: 'callterms and operators inside arguments', domains: ['nested_calls', 'nested_operator_calls'] },
  {
    id: 'axioms',
    title: 'Axioms',
    blurb: 'assignments, out / io parameters, nested choices, lookups',
    domains: ['axiom_assignments', 'nested_axiom_choices', 'worldstate_lookup_scenarios']
  },
  {
    id: 'overloads',
    title: 'Overloads & sharing',
    blurb: 'overloads by arity, shared implementations, recursion',
    domains: ['axiom_overloads', 'method_overloads', 'shared_implementations', 'recursion_dispatch']
  },
  {
    id: 'docs',
    title: 'Docs & SDK examples',
    blurb: 'upstream README, language docs, SDK consumers',
    domains: ['Tutorial', 'GuardNPC', 'AxiomIo', 'CoreConsumer', 'IntegrationConsumer', 'BridgeConsumer']
  },
  {
    id: 'smoke',
    title: 'CI smoke',
    blurb: 'upstream CI smoke test: axiom backtracking, runtime lists, no plan',
    domains: ['linux_smoke']
  }
]

/**
 * Callterms a lab domain calls that the callterm set of its upstream test leaves out on purpose, by `domain set`:
 * the test binds only what its methods reach (upstream checks the full set only through ValidateGeneratedCallTerms,
 * which these tests do not call), or it checks what a missing one does. The stations do not report these as
 * unregistered_callterm; any other missing callterm is reported (test/demo/zones.test.ts).
 */
const UNBOUND: Record<string, string[]> = {
  // HTNRuntimeListTest.cpp:63 SetUp; :238 MissingCallUsesPolicyExactlyOnceWithOriginalSource calls the missing one.
  'runtime_lists runtime-lists': ['missing_runtime_list'],
  // HTNGeneratedEquivalenceTest.cpp:286 BindTestCallTerms; only :1817 binds assignment_probe.
  'numeric_expressions test': ['assignment_probe'],
  // HTNGeneratedEquivalenceTest.cpp:1817 binds assignment_probe alone.
  'numeric_expressions assignment-probe': ['add', 'inc'],
  // HTNGeneratedEquivalenceTest.cpp:1513 an empty registry (a reached callterm is missing: no_plan); :1572 none.
  'callterms empty': ['binded_function_with_args', 'get_health', 'get_max_speed', 'add_target_available'],
  // HTNMissingCallTermTest.cpp:121: probe is the missing callterm under test.
  'missing_callterms missing-callterms': ['probe'],
  // HTNNestedCallExpressionTest.cpp:129, :168 (missing_distance_callterm is the missing one), :256, :335: each binds
  // only what it reaches.
  'nested_operator_calls nested-operator-calls': ['get_entity_position', 'get_distance_from_to'],
  'nested_operator_calls nested-operator-missing': ['missing_distance_callterm', 'distance', 'get_entity_position', 'get_distance_from_to'],
  'nested_operator_calls nested-operator-continue-move': ['missing_distance_callterm', 'identity', 'distance'],
  'nested_operator_calls nested-operator-debugger': ['missing_distance_callterm', 'get_entity_position', 'get_distance_from_to'],
  // HTNGeneratedEquivalenceTest.cpp:2884 binds nothing; :2986 binds both for the axiom effects test.
  'nested_axiom_choices empty': ['axiom_trace', 'axiom_value'],
  // HTNSharedImplementationTest.cpp:125 SetUp binds echo; :241 validates that the three are missing.
  'shared_implementations shared-impl': ['unused_condition', 'missing_shared_callterm', 'unused_argument'],
  // HTNGeneratedEquivalenceTest.cpp:3108, :3165 bind nothing; :3137 binds visit.
  'recursion_dispatch empty': ['visit']
}

function scenario(c: LabCase): GalleryScenario {
  const vars: Record<string, Atom | undefined> = {}
  for (const [k, v] of Object.entries(c.vars)) vars[k] = v === null ? undefined : parseAtom(v)
  return {
    name: `${c.domain}: ${c.name}`,
    group: c.domain,
    domain: LAB_DOMAINS[c.domain],
    method: c.method,
    args: parseAtoms(c.args),
    setup: world => {
      for (const key of c.worlds) addFacts(world, LAB_WORLDS[key])
      for (const [name, ...args] of c.facts) world.add(name, ...parseAtoms(args))
    },
    callterms: CALLTERM_SETS[c.callterms],
    unbound: UNBOUND[`${c.domain} ${c.callterms}`],
    context: (world): HostContext => ({ world, vars: { ...vars }, trace: [], counters: {}, errors: [] }),
    mode: c.mode,
    maxDepth: c.maxDepth ?? DEFAULT_MAX_DEPTH,
    status: c.status,
    expect: c.plan
  }
}

/** The language topics, then the hot reload station (HTNHotReloadDemo). */
export const LAB_STATIONS: GalleryStation[] = [
  ...TOPICS.map(t => ({
    id: t.id,
    title: t.title,
    blurb: t.blurb,
    domain: LAB_DOMAINS[t.domains[0]],
    scenarios: t.domains.flatMap(d => LAB_CASES.filter(c => c.domain === d).map(scenario))
  })),
  HOT_RELOAD_STATION
]
