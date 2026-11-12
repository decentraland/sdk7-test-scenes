# Compiler reachability (A17 / T20)

The compiler validates and links every declaration, produces requested check-method warnings, then removes
unreachable method and axiom bodies. This follows `HTNCompilerReachability.cpp` and `HTNReachabilityTest.cpp` in
[upstream aec08fa](https://github.com/urosidoki/htn_planner/tree/aec08fa36f2c521c4da00c045bf23b8aed7bfa92).

The roots are every published `top_level_method`, at every arity, and every method targeted by a deferred task
anywhere in the source. The latter includes a deferred task inside a removed body: the upstream external dispatch
contract preserves those targets. `reasoning`, `active_plan` and custom check methods remain ordinary public
entries; there is no assumed default entry name. Traversal follows resolved compound/deferred methods and axiom
conditions, including recursive methods, inherited overloads, effective overrides and qualified base calls.
Unreachable mutual-recursion cycles are removed. The internal linker can link a domain without public roots;
pruning then removes all bodies except deferred roots and their dependencies. The public compiler still requires
a top-level domain with a top-level method.

Retained declarations keep source order, parameters, branches, source ranges and debugger names. Method/axiom IDs
are compacted and every retained reference and public entry ID is remapped. IDs belong to one compiled domain;
regenerate modules after updating the compiler, and replan after a domain revision. Deferred steps from another
compiled domain remain subject to the existing stale-step check.

Fact requirements, callterm names, and callterm validation remain source-wide, including removed code. This keeps
host fact filtering and initialization reports stable. Optional `DomainIR.prunedCallSites` records preserve only
removed callsites, with their original order, arguments and source information; retained call nodes keep their
identity. Existing v2 IR literals without this optional field still work. Planning and decomposition do no extra
reachability work. The pass runs only in the Node compiler; the added metadata is read by callsite validation.

## Verification and measured scope

`test/htn/compiler/reachability.test.ts` uses independent fixtures with explicit expected declarations and plans,
checks all four backtracking modes, external-only entries, overrides/arity, deferred expansion from a removed
source, source ranges, serialized metadata, initialization diagnostics, legacy v2 IR, no-root linking and
conservative handling of an unresolved reachable edge. Before the pass, three structural pruning regressions
fail; after it they pass. Existing conformance, golden plans, host stories, source/diagnostic tests, committed
module freshness and deterministic planner counters provide the wider behavior checks.

Run `npm test` for that complete suite, `npm run typecheck:tools` for compiler/test types, and `npm run build` for
the scene build. `npm test -- test/htn/compiler/reachability.test.ts` selects the focused regressions.

Local Windows / Node 22 measurements on 2026-10-23, comparing the same 54 committed domain sources and emitter
headers before/after the pass (UTF-8, LF output; JSON includes a surrounding array):

| Measure | Before | After | Change |
| --- | ---: | ---: | ---: |
| Methods | 371 | 362 | -9 |
| Axioms | 72 | 71 | -1 |
| Serialized IR bytes | 701,788 | 697,354 | -4,434 (0.63%) |
| Generated TypeScript bytes | 1,114,766 | 1,107,544 | -7,222 (0.65%) |
| Compile + emit, local median | 55.25 ms | 54.50 ms | inconclusive |
| JSON load, local median | 2.77 ms | 2.60 ms | inconclusive |

Each compile sample read/compiled/emitted all 54 modules; seven samples followed a warm-up pass. Each JSON-load
sample parsed the complete IR array 20 times; the table reports the median per parse across seven samples.
These short local timings vary with the machine and are not evidence of a speedup. No NPC runtime speedup is
claimed. The main measured benefit is generated/IR size, limited because most example declarations are reachable
and source-wide diagnostic metadata must survive.

Four committed modules change: `Wanderer.htn.ts`, its two hot-reload revisions, and the lab's
`shared_implementations.htn.ts`. The shared-implementation fixture accounts for 6,421 of the 7,222 saved generated
bytes; each Wanderer module saves 267. Remaining generated modules match their previous output. C-specific
arithmetic/comparison helper elimination and C ABI emission are outside this TypeScript IR implementation.
