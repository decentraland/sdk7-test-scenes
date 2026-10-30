# HTN upstream conformance suite

Expectations transcribed from urosidoki/htn_planner (`vendor/htn_planner/HTNTest/src`, plus the doc and
SDK examples that state a concrete result) and replayed against the TS compiler (`tools/htn`) and planner
(`src/htn`). Expected values are copied from upstream, never derived from our implementation. Each case
records its source in `upstream` (file:line) and, where the port is partial, why in `note`.

- `cases/*.json`: the cases. A file holds one case object or an array of cases.
- `src/examples/upstream/conformance-callterms.ts`: named callterm sets reproducing the C++ bindings of the ported
  tests (shared with the scene's language lab).
- `src/examples/upstream/atom-literal.ts`: parser for the atom literals used in `facts`, `args` and `vars`.
- `cases.ts`: case types, loader and structural validation.
- `cases-schema.test.ts`: validates every case without the compiler or planner (must always pass).
- `conformance.test.ts`: one `node:test` subtest per case, named by `name`.
- `COVERAGE.md`: upstream tests → cases, or why they are skipped.

Run: `npm test conformance` (both tests), `npm test cases-schema` (schema only).

## Case format

The base format is the one in `src/htn-planner/htn/README.md` ("Conformance fixtures"). Everything below marked
**ext** is an optional extension added by this suite.

```jsonc
{
  "name": "unique test name",
  "upstream": "HTNTest/src/HTNGeneratedEquivalenceTest.cpp:2741",
  "note": "ext: why the port is partial, upstream context",
  "domain": "upstream/Domains/Test/human.domain", // relative to test/htn/fixtures/, or a key of `sources`
  "sources": { "Root.domain": "...", "Base.domain": "..." }, // ext: in-memory files for upstream inline sources
  "worldstate": "upstream/WorldStates/Test/human.worldstate", // ext: may also be an array, loaded in order
  "facts": [["candidate", "1"], ["flags", "#true", "#false"]],
  "callterms": "test",                       // set name in conformance-callterms.ts; default "empty"
  "vars": { "value": "(1.0 2.0 3.0)" },     // ext: host values read by callterm sets; null = unbound result
  "mode": { "factsAndAxioms": true, "branches": true },
  "maxDepth": 8192,                          // ext: PlannerOptions.maxDepth
  "method": "behave", "args": [],
  "expect": { "status": "succeeded", "plan": ["!eat \"apple\""] }
  // or, ext: "script": [ ...ops ] instead of method/args/expect
}
```

### Atom literals

Domain value syntax: symbols (`enemy_7`, `true`), `"strings"`, ints (`-2147483648`), floats (`-0.5`, need a
`.`), nested lists `(a (1 2) "x")`. **ext**: `#true` / `#false` are BOOL atoms, which have no domain syntax
(upstream tests create them in C++). `?vars` and `@constants` are not literals.

### Plan expectations (`expect` of a planning case or op)

- `status` (required), `plan` (exact, `formatTask` format; deferred steps `&name args`, the name as written,
  e.g. `&SharedBase::shared 8`), `executed` / `executedResult` (PlanRunner loop with no world changes).
- **ext** `planLength`, `nonEmpty`: where upstream only checks size/non-emptiness.
- **ext** `steps: [{ at, text, head, contains, argCount, args, types, sizes, nums }]`: partial checks of one
  step; `at` < 0 counts from the end. `args`/`types`/`sizes`/`nums` are keyed by argument path: `"2"` is
  argument 2, `"2.1"` element 1 of the list in argument 2. `args` compares `formatAtom` text, `types` the atom
  tag (`int float bool sym str list`), `sizes` list length, `nums` the numeric value (floats compared as
  float32, `0` and `-0` distinguished).
- **ext** `includesSteps` / `excludesSteps`: formatted steps that must / must not appear.
- **ext** `samePlanAs` (+ `samePlanPlus`): equal to a plan saved by an earlier op's `save`, optionally followed
  by extra steps.
- **ext** `calls`: host counters bumped by callterm sets (named after the upstream C++ variables: `Calls`,
  `OuterCalls`, `Visits`...). `trace`: host trace pushed by callterm sets. `diagnostics`: count of
  `RuntimeDiagnostic`s by `code`. All three are cumulative within a case (reset with the `resetCounters` op).
- **ext** `diagnosticAt: [{ code, line, col }]` or `[{ code, find, after?, nth?, file? }]`: source of the latest
  diagnostic with that code. `find` locates the position like upstream does (`Text.find(after)`, then the
  `nth` occurrence of `find`), 1-based line/column as in `HTNSourceText::GetPosition`.

Every check also requires that callterm-side argument checks (upstream `EXPECT_*` inside lambdas) passed.

### Compile expectations (ext)

`"expect": { "compile": "ok" | "error", ... }` with no `method`: the case only compiles the domain.
`errorCount`, `errorLines` (all errors), `errorAt: { line, col }` or `{ find, nth, file }` (first error;
`file` names the `sources` entry it must be reported in), `irName` and `irCallterms` (subset of
`DomainIR.callterms`) for successful compiles. `upstreamMessage` documents upstream's message text and is
not asserted (diagnostic wording is the compiler's choice).

### Script ops (ext)

A case with `script` runs ops in order on one world and one host context (one `PlanRunner`, created on first
use). Ops with `expect` take plan expectations as above.

| op | does |
| --- | --- |
| `decompose {method, args?, mode?, save?, expect}` | `decompose()`; `mode` overrides the case mode |
| `plan {method, args?, expect}` | `PlanRunner.plan()`; `expect.remaining` = `steps` after planning |
| `resolve {expect, current?, currentStep?, remaining?, calls?, trace?, diagnostics?, diagnosticAt?}` | `PlanRunner.resolve()` must return `expect` (`ready`/`completed`/`failed`) |
| `complete`, `clear` | `PlanRunner.complete()` / `clear()` |
| `expandDeferred {from, of?, save?, expect}` | `decomposeDeferred()` of step `from` of the plan saved as `of` (default: the last plan) |
| `decomposeDeferred {method, args?, expect}` | `decomposeDeferred()` of a method found by name (`Domain::name` or a unique `name`) and arity |
| `addFact {fact}`, `addFacts {facts}` | `WorldState.add` |
| `removeFact {name, arity, index}` | remove row `index` (upstream `RemoveFact(name, arity, index)`) |
| `clearFacts {name, arity}`, `clearWorld` | `WorldState.clear` / `clearAll` |
| `loadWorldstate {path}` | clear, then load (upstream `HTNDatabaseHook::ParseWorldStateFile`) |
| `setVar {name, value}` | change a host var (`null` = unbound result) |
| `resetCounters` | reset counters, trace and collected diagnostics |
| `expectCounters {calls?, trace?, diagnostics?}` | check host state between ops |

## Mapping notes

- Upstream `HTNPlanningUnit::DecomposeTopLevelMethod` = `plan` op; `decompose_call(..., top_level_only=1)` =
  `decompose`; `decompose_call(..., 0)` on a deferred step = `decomposeDeferred`.
- Upstream "Report" callterm error policy = collecting `onDiagnostic`; reason `NotRegistered` =
  `missing_callterm`, `NonBooleanConditionResult` = `non_boolean_condition_result`. C++-only reasons
  (MissingBinding, MissingInstance, argument/return conversion) are not ported.
- `HTN_DECOMPOSITION_CALL_FRAME_CAPACITY_EXCEEDED` = `depth_exceeded`; recursion cases use the default `maxDepth`,
  8192 like upstream's `--call-frame-capacity`, counted as upstream counts its call frames (engine.ts header).
- Tests parameterized over instrumentation (Full/None) or repeated "attempts" on reused storage run once
  or twice; generated storage reuse has no TS equivalent.
