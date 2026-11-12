# Measure your own HTN domain

The optional benchmark accepts the same game-owned `ConsumerManifest` as
`htn:check`: `.domain`, world files, entry method and Atom arguments, exact
expected status/plan, and your custom callterm factory. It does not import the
demo catalogue. Install from an HTN source checkout:

```sh
node scripts/htn-install.mjs /path/to/your-scene --benchmark
```

In your scene, start with the independent example:

```sh
npm run htn:measure -- tools/consumer/example/jobs.measure.ts --quick
npm run htn:measure -- tools/consumer/example/jobs.measure.ts --quick --json local-baseline.json
npm run htn:measure -- tools/consumer/example/jobs.measure.ts --quick --compare local-baseline.json --json current.json
npm run htn:measure -- tools/consumer/example/jobs.measure.ts --help
```

In the source checkout, `node scripts/htn-measure.mjs` runs the same command.
Manifest and domain/world paths can contain spaces. Manifest paths resolve from
the invoking package directory; paths inside it resolve beside the manifest.
The loader compiles the root `.domain` and its includes and checks any declared
world invariants. Author expectations use `formatTask`, including arguments:
`['!choose 42']`. An expected `no_plan` with an explicit empty plan is a useful
worst-case input. `invalid_world` cases belong in `htn:check`; select a valid
measurement scenario with `--scenario NAME` if the manifest contains both.

Copy/customize the example in your own tool folder. Use the world's actual fact
counts, branch distributions, method arguments and custom callterms. Include a
representative large world and an expensive/unreachable case; the example's
small scan is a smoke input, not a substitute for those snapshots. The sample
also includes an intentionally slow callterm and larger fact scan. The test
suite verifies those regression paths with deterministic counters and an
injected clock, rather than asserting tiny machine-dependent time differences.

A manifest factory gets `{world, rng, seed}` and returns `{callterms, context?}`.
Factories run afresh for each scenario/repeat and for the structural-counter
plan, using `--seed` (default 1). Warm measurements reuse that binding/context
and world. For repeatable comparisons, keep queries deterministic and read-only;
if your queries change results after repeated calls, expectation checks fail.
The benchmark plans only: action execution, deferred resolution and host tick
cost need an in-scene measurement or a separately authored host scenario.

## What the report measures

The default `--quick` preset runs three fresh Node processes per scenario,
30 warm-ups and up to 200 individually timed warm plans per repeat. Warm-up and
sample phases each stop after 100 ms. One synchronous call may run beyond its
phase budget; the parent kills a worker at the remaining 10-second total limit.
The CLI also has an outer 15-second timeout. Compilation, process startup and
file loading are outside planning samples; they still consume wall time. A
large set of scenarios may exhaust quick mode: select one, or explicitly use
`--full` (5 repeats, 5000 samples, 1-second phases, 60-second worker total and a
125-second outer timeout). `--help` lists bounded overrides. No full/long run is
started automatically.

Each row reports world construction, runner setup and the cold first plan in a
fresh process, followed by warmed p50/p95/p99/max in microseconds. Compilation is
excluded from cold. Reported latency values are medians of repeat percentiles,
not percentiles pooled across repeats. JSON retains each cold sample, actual
sample counts, and the min/max range of each compared metric across repeats.
A low sample count gives a weak tail estimate; p99 of 20 samples is effectively
the largest sample. GC, JIT, timer calls and other processes affect these numbers.
`performance.now()` supplies Node's clock; very small samples approach its
resolution and timing-call overhead. Use representative work, repeats and the
absolute comparison floors instead of treating sub-microsecond differences as
proof of improvement.

Status, a copied cold plan (including Atom arguments), one fresh seeded plan's
structural counters and peak call frames are reported alongside timings. They
are checked against author expectations; counter/result drift between repeats
also fails. Structural counters are collected separately from uninstrumented
warm samples. `--trace` enables a `PlanTraceRecorder` with one retained plan and
no world snapshots, and reports trace nodes; compare traces off and on in
separate runs. This includes that recorder's cost, not your game's entire
history/UI/export cost.

Allocations are optional: `--alloc-plans N` uses the existing V8 allocation
meter with `--expose-gc` (supplied by the launcher). It estimates allocated V8
heap bytes using heap growth plus reclaimed GC bytes, after subtracting an empty
loop; it does not count native/ArrayBuffer memory, and escape analysis can remove
allocations. The report includes measured call count, GC count/time. Default is
`null`/unavailable, never a claim of zero allocation. Allocation runs are separate
from latency samples and their requested calls remain subject to the worker
wall limit. They reuse warm bindings; use pure queries and run `htn:check` too.

## Compare without replacing a baseline

`--compare FILE` is read-only. Ordinary runs never rewrite it; an output path
that resolves to the baseline is rejected. To accept a deliberate change, review
the current report and save it under a new baseline filename yourself.
Text is printed by default; `--json FILE` also saves JSON, `--json -` prints only
JSON, and `--out FILE` also saves text.

Comparisons require equal Node/V8/esbuild versions, CPU, platform, architecture,
seed, sample limits and trace/options. A content fingerprint identifies the
installed runtime/compiler/consumer helpers. A version mismatch yields an
incompatible report; `--allow-version-change` permits an intentional code
upgrade while retaining environment/options checks. Capture both versions on
the same machine and review the code change and structural deltas. A report
cannot establish identical OS load or thermal conditions; keep those similar.

The existing benchmark comparison utility applies the relative threshold
(default 10%) and absolute timing/allocation floors. Repeat ranges must not
overlap to call a timing difference a regression; overlapping changes are
reported as noise. It checks warm p50/p95, throughput and measured bytes/plan;
p99 is reported for inspection. Structural status/plan/counter changes always
fail the comparison, independent of clocks. Missing/new scenarios are structural
changes too. A structural failure may be an intended domain/world change, so
review the diff. Environment incompatibility never produces a timing verdict.

Exit codes: `0` measured/expectations matched and comparison passed; `1` author
expectation mismatch, structural difference or timing regression; `2` invalid
input, compile/config/runtime error, timeout or incompatible baseline. Timing
comparison is for a controlled local run, not a portable CI speed gate.

## Budget the actual scene

Node is not Explorer. Its JIT, available memory, timer resolution and host load
do not establish your target client's timings or FPS. This harness's single
NPC planning sample excludes perception, blackboard updates, actions, rendering,
networking and most scheduling work. For a planning allowance of B ms per frame,
N plans in one frame provisionally cost about `N * measured-plan-us / 1000` ms;
measure that burst in the actual client before setting a budget. Average plans
per second can hide a first-frame or replan burst. Spread replans with the host's
shared planning budget and measure queue delays as well as CPU cost.

A short target-client recipe:

1. Use the same domain/world, actual custom queries and target NPC count. Record
   client version, device, scene revision, population and replan schedule.
2. After normal scene warm-up, time the whole NPC update with the client's
   available clock, and separately accumulate planning time/count. Capture the
   first spawn/replan burst and unreachable/worst-case updates too.
3. Aggregate many updates (for example a few seconds of frame windows) before
   dividing by call count if the timer has millisecond resolution. Retain frame
   tails and missed budgets; a timer reading zero does not mean a free plan.
4. Repeat with traces/counters off and then with the exact tracing configuration
   you will use. Include recorder histories, world snapshots, export and UI if
   enabled; those can allocate and cost more than the planner.
5. Compare aggregate NPC p95/p99 frame cost against the AI share of your frame
   budget alongside rendering/physics/perception/actions, and check queue delay
   under burst load. Repeat in the client/device you support.

Neither a Node microbenchmark nor one successful preview supplies a universal
microsecond, NPC-count or FPS guarantee. Helpers and example files stay under
`tools/`/`scripts/` and deployment exclusions; do not import them in `src/`.
