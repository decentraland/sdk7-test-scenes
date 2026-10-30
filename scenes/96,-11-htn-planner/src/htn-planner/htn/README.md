# HTN planner (TS port)

TypeScript port of [urosidoki/htn_planner](https://github.com/urosidoki/htn_planner) 2.4.0
(MIT), commit `aec08fa36f2c521c4da00c045bf23b8aed7bfa92`. Upstream translates `.domain` files ahead of time
into C. We keep that split:

```
.domain ──(tools/htn compiler, Node, build/test time)──► DomainIR TS module ──► src/htn-planner/htn planner (scene runtime)
```

- **Compiler** `tools/htn/`: lexer, parser, include loader, validator, linker → `DomainIR`
  (`src/htn-planner/htn/ir.ts`); on request (`checkMethods`) `check-methods.ts` warns about branches of a
  running-plan check that accept anything (rule: `check-method.ts`, shared with the agent). `reachability.ts` then
  removes unreachable method/axiom bodies, retaining every public entry and every deferred target (even in dead
  code). Full-source fact/callterm requirements and validation callsites remain available. Recompile generated
  modules after compiler updates; method IDs are local to one compiled domain. Never bundled into the scene.
- **Runtime** `src/htn-planner/htn/`: `atom.ts`, `world-state.ts`, `ir.ts`, `planner.ts` (with `engine.ts`),
  `callterms.ts` (bindings, error policy, call-site validation, list callterms). Ships in the scene.
- **Debugger capture** (same folder, used only when a recorder is attached): `trace.ts` (upstream's
  HTNGeneratedDebugger node model), `trace-view.ts` (its Normal/Verbose projection), `titles.ts`, `domain-graph.ts`;
  `src/htn-planner/debug/session.ts` bundles a `DebugSession`.
- **Upstream reference**: https://github.com/urosidoki/htn_planner at the commit above (spec in `docs/DOMAIN_LANGUAGE.md`
  and linked docs; behavior in `HTNFramework/src/Translator/HTNCCodeGenerator.cpp` and `HTNTest/src/`).
  Copies of upstream domains/world states used by tests live in `test/htn/fixtures/upstream/`.

## Planner limitations

The installed [module guide](../README.md#choose-the-right-planning-contract) is the consumer summary: ordered,
total-order planning; no effect simulation, cheapest-plan search, plan repair or MTR; immediate callterms;
bounded depth/storage; and the boundary between local host simulation and target-client evidence.

- Primitives are plan output, not executed effects. Write decision-relevant facts when the real action changes them;
  use `&task` or the next plan when a later decision needs those results. Explicit mutating callterms are different:
  their writes are immediate and survive backtracking; throwing bindings escape `plan()`.
- A selected condition commits. `mode.factsAndAxioms` searches alternatives within it; `mode.branches` can try the
  next branch after task failure. Both default to on. Details and intentional port differences follow below.
- `maxDepth` defaults to 8192 call frames; exhaustion returns `depth_exceeded`. `PlanRunner` reuses internal search
  storage once warm, but new values, changed steps, deferred expansion, host code, diagnostics and trace capture
  can allocate. `decompose()` / `decomposeDeferred()` create fresh engines. Use runners in game loops and measure
  the actual domain/bindings rather than assuming universal zero allocation.

## Runtime constraints (scene bundle, Unity Explorer V8 / esbuild)

- ES2020 only (`lib: ES2020` in the scene tsconfig): no `Array.prototype.at`, `Object.hasOwn`, etc.
- Synchronous. No `eval`, `new Function`, `Proxy`, `async`, WASM, Node APIs, `~system/*` imports.
- No module-level mutable singletons in `htn/`: several planners/NPCs run side by side.
- Reuse internal search storage once warm (`engine.ts` header; `test/htn/planner/alloc.test.ts` guards selected
  stable workloads); the allocation exceptions above still apply. In the engine: buffers from its
  pools (`sized()` per length, a top index; never cut a pooled array to length 0), continuations as `Cont` records,
  no closure, spread, generator or temporary object per node. Plan steps and atoms are values (never change them; a
  runner hands out an equal step again); a callterm's `args` array is valid during the call only
  (`docs/htn-guidance.md`, "Plans, steps and callterm arguments: who owns what").

## Semantics checklist (verify against upstream; do not guess)

- Branches in source order. A branch whose condition fails always falls through to the next.
  `mode.branches`: after a *selected* branch's task subtree fails, try the next branch.
  `mode.factsAndAxioms`: fact/axiom choice points stay open across later parts of the same condition
  (incl. inside axioms/`alt`). A branch condition commits when the branch is selected
  (upstream `HTNConditionContinuation.inl:233`), so task failure never reopens it; only `mode.branches`
  reacts to task failure.
  With both off, facts/axioms keep only their first solution. Default: both on.
- `and` searches combinations; `or` commits to the first successful child; `alt` keeps alternatives;
  `not` succeeds iff no solution, leaks no bindings.
- Fact query: name + arity; bound args/literals constrain, unbound vars bind, `?any_*` discards. A fact with no
  variable outside the statically bound set (compiler flag `once`, upstream `AnalyzeCondition`) has only its first
  matching row (`EmitDirectDeterministicFact`); otherwise every matching row, duplicates included, is a solution.
- BOOL matches INT 1/0 (both directions) in `==`/`!=`, facts, axiom outputs and list elements.
  Symbols `true`/`false` are not booleans. Mixed int/float allowed in comparisons.
- Arithmetic: all-int → int (32-bit, truncating division, checked overflow fails); any float → float.
  `%` ints only. Division by zero fails.
- Standalone `(call f ...)` needs a BOOL result; a non-bool one is a `non_boolean_condition_result` error and fails.
- A callterm error (missing callterm / binding / daemon, arguments a typed binding rejects, a result it cannot
  convert, a non-bool standalone condition) fails the call and goes through `calltermErrorPolicy`
  (below). A callterm returning `undefined` is an ordinary failure, never reported. A `PlanRunner` also reports
  every call site whose callterm is not bound, when created (`unregistered_callterm`; upstream
  `ValidateGeneratedCallTerms`). Throwing callterms are not caught: their exceptions propagate out of planning.
- Facts the domain never reads are stored (upstream 2.4.0 `WriteFact` rejects them): `checkFacts(domain, world)`
  lists them and wrong-arity tables; a `PlanRunner` reports each wrong-arity table once (`fact_arity_mismatch`).
- `maxDepth` (default 8192) is upstream's call-frame capacity, counted like its frames (engine.ts header);
  exceeding it aborts with `depth_exceeded`, no branch fallback.
- Axiom params: `inp` bound read-only; `out` must be unbound at entry (else fail before the body);
  `io` matches or produces. Outputs are published only on success; axioms may have many solutions.
- `split_list`/`split_list_front` → element, rest; `split_list_back` → rest, element. Empty/non-list fails.
- `&task`: args evaluated when the step is created; body decomposed when the runner reaches it.
  `PlanStep.name` keeps the prefix like primitives do: `'!move_to'`, `'&advance_patrol'`.
- Overrides: unqualified calls (including calls made from inside the base domain) resolve to the most
  derived override; `Base::name` resolves to the base body. `@constants` use the effective (overridden) value.

Where upstream behavior is unclear, read the generated-code semantics and tests, record the finding in
the test name or a comment with the upstream file/line, and do not invent behavior.

## Binding callterms (`callterms.ts`; upstream `HTNCallTermRegistry`, `HTNCallTermBinding.h`)

```ts
import { callterm, memberCallterm, listCallterms, withSignature, int, PlanRunner } from './htn-planner'

const callterms = {
  ...listCallterms,                                         // list_add, list_remove_at, list_get, list_size, list_clear
  lt: callterm(['int', 'int'], (a, b) => a < b, 'bool'),    // typed: HTN_CALLTERM_BIND
  distance: memberCallterm<Navigator, ['vec3', 'vec3'], 'float'>(
    'navigator', ['vec3', 'vec3'], (nav, a, b) => nav.distance(a, b), 'float'),  // typed member: HTN_CALLTERM_BIND_MEMBER
  raw: (args, context) => int(args.length),                 // raw: Registry.Bind(id, fn), as before
  checked: withSignature(['list', undefined], args => args[0]) // raw with a signature
}
const runner = new PlanRunner(domain, world, {
  callterms,
  daemons: { navigator: myNavigator },   // instances of member callterms (HTNCallTermBindingContext::SetDaemon)
  context: services,                     // the client context, for callterms and converters
  calltermErrorPolicy: 'report',         // default 'unset' fails errors unreported and warns once
  onDiagnostic: d => console.log(`[htn] ${d.code}: ${d.message}`)
})
```

- Parameter / result types: `'int'` (int32), `'float'`, `'bool'` (BOOL or INT 0/1), `'str'`, `'sym'`, `'list'`,
  `'vec3'` (a list of 3 numbers ↔ `{ x, y, z }`), `'any'` (an Atom), or your own `CallTermType` (`name`, `atom`,
  `fromAtom(atom, context)`, `toAtom(value, context)`; `undefined` = conversion failure). Strict like upstream: an
  INT is not a float, a symbol is not a string.
- A typed binding checks before it runs: count (`argument_count_mismatch`), atom type
  (`argument_type_mismatch`), converter (`argument_conversion_failed`); after: the result
  (`return_conversion_failed`). The function's last argument is the invocation (`call.context`, `call.daemon`,
  `call.setError(...)`); returning `undefined` is an ordinary failure.
- `calltermErrorPolicy` (upstream `HTNCallTermErrorPolicy`): `'unset'` (default): valid calls run normally, an
  error fails the call unreported; `'fail_silently'`; `'report'`: one diagnostic per failed invocation to
  `onDiagnostic` (code `missing_callterm`, `non_boolean_condition_result` or `callterm_error`; the reason, daemon,
  domain, file:line:col, method / branch or axiom in `calltermError`). `plannerFor` uses `'report'` + console.
  Nothing throws: `'unset'`, `'report'` without `onDiagnostic` or an invalid value fail the call like upstream's
  release build and, in place of its debug assert, print one `[htn] ...` console warning per runner and condition,
  with the first error.
- A callterm must not throw (upstream `MISSING_CALLTERMS.md:108`): return `undefined` (or `call.setError(...)`) to
  fail. There is no catch and no reason for it: a throw escapes `plan()` unchanged.
- Before planning: `validateCallterms(domain, callterms, daemons)` lists every unbound call site;
  `invokeCallterm(name, args, options)` runs one binding under the same checks, for host tests.

## Conformance fixtures (`test/htn/conformance/cases/*.json`)

```jsonc
{
  "name": "human eats the first edible fruit",
  "upstream": "HTNTest/src/HTNDecompositionTest.cpp:123", // where the expectation comes from
  "domain": "upstream/Domains/Test/human.domain",          // relative to test/htn/fixtures/
  "worldstate": "upstream/WorldStates/Test/human.worldstate", // optional
  "facts": [["candidate", "first"]],                      // optional extra rows, atoms in domain syntax
  "callterms": "deferred-test",                           // optional named set in src/examples/upstream/conformance-callterms.ts
  "calltermErrorPolicy": "fail_silently",                 // optional, default "report" (diagnostics recorded)
  "method": "behave",
  "args": [],                                             // atoms in domain syntax, e.g. "(1 2)", "\"str\""
  "mode": { "factsAndAxioms": true, "branches": true },   // optional, default all
  "expect": {
    "status": "succeeded",
    "plan": ["!eat \"apple\""],    // decompose() output formatted with formatTask; deferred steps as "&name args"
    "executed": ["!eat \"apple\""] // optional: primitives seen by PlanRunner resolve/current/complete with no world changes
  }
}
```

## Profiling (upstream `--generated-execution-profiling`, `get_execution_info`)

- **Execution info, always on**: `runner.executionInfo` after `plan()` (or a deferred expansion in `resolve()`):
  `callFrameCapacity` (= `maxDepth`), `peakCallFrames` (the smallest `maxDepth` this plan still succeeds with: tune
  `maxDepth` against it), `lastError` (the last diagnostic of that decomposition, kept without `onDiagnostic` too;
  `depth_exceeded` when the capacity ran out). A live object: read it before the next plan.
- **Structural counters, off by default**: pass a counters object, read it after each plan:
  ```ts
  const stats = newPlanStats()
  const runner = new PlanRunner(domain, world, { callterms, stats }) // or decompose(..., { stats })
  runner.plan('behave')
  stats.factRowsTested, stats.factChoiceRetries, stats.branchRetries, stats.callterms // this plan only
  ```
  Every decomposition zeroes it first. Names follow upstream's (`HTNGeneratedProfiling.h:65-82`); ours add
  `conditions`, `branchBacktracks`, `bindings` / `unbinds` (`PlanStats` in `planner.ts` says what each counts). Off,
  each counting point tests whether counters are enabled. Measure overhead for your workload; historical row-heavy
  fixtures measured roughly 10%, not a universal upper bound.
- **Per agent**: `GuardAgent.metrics` adds `lastPeakCallFrames`, `maxPeakCallFrames`, `callFrameCapacity`,
  `lastError`, and with a counting runner (`plannerFor(domain, { stats: newPlanStats() })`) `lastStats` / `totalStats`.
  These snapshots/totals cover decision/replan decompositions, excluding `activePlan` checks, reasoning and deferred
  expansion. Checks and reasoning have separate counts/times; measure deferred expansion separately for total host cost.
- **Benchmark**: `npm run htn:bench` (`-- --quick`, `-- --out benchmarks/main_benchmark.txt`), see Commands.

## Commands

- `npm test [filter...]`: bundles `test/**/*.test.ts` with esbuild and runs `node --test` (headless; no Explorer).
- `npm run typecheck:tools`: typecheck `src`, `tools`, `test` against Node types.
- `npx tsc -p tsconfig.json --noEmit`: scene typecheck (what `npm run build` enforces).
- `npm run htn:bench [-- --quick | --no-crowd | --iterations N | --samples N | --crowd-seconds N | --out FILE]`: the
  planner benchmark in upstream HTNBenchmark's shape (plans/s, µs, p50 / p95 / p99, lifecycle, counters per plan,
  counting cost) and the many-NPC load (level 9 with 10 / 25 / 50 guards). Baseline: `benchmarks/main_benchmark.txt`.
  Not part of `npm test` (about 25 s); its smoke test is.
- `npm run htn:compile -- <file.domain> <out.ts> [exportName] [--ir-import spec]`: generate a DomainIR module (a `.worldstate` input generates a `WorldFacts` module instead, loaded with `addFacts(world, facts)`)
  (import path to `src/htn-planner/htn/ir` is computed from `out.ts`; `exportName` defaults to `<domain>Domain`).
  Regenerate `src/examples/guard/guard.htn.ts` after editing `src/examples/guard/guard.domain`.
