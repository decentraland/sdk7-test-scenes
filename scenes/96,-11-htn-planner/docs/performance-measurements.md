# Planning and action CPU-work measurements

Run this opt-in repository benchmark from this scene directory, with Node 22+ and the normal development dependencies:

```sh
npm run htn:perf -- --json /path/outside-the-scene/htn-release-cpu.json
npm run htn:perf -- --case tick-32-replan --repeats 3 --samples 200 --warmup 30 --batch 8
npm run htn:perf -- --help
```

The default has nine workloads, three fresh Node processes per workload, one first operation, 30 warm-up batches and
200 measured batches of eight operations per process. Each worker is limited to 15 seconds and the complete report to
90 seconds (100 seconds including the outer launcher, excluding bundling). Choose one case or reduce samples/batch if
those limits are insufficient. These measurements are separate from `npm test`; tests verify accounting and report
units with an injected clock and do not assert machine-dependent speed.

The timer is `performance.now()`: **elapsed wall time around CPU work**, including any scheduler/GC interruption,
not OS process CPU time. Compilation, imports, process startup, world construction and runner/context creation are
outside the measured operation. The first operation is recorded separately, in its own fresh process for each repeat;
it includes first-use/JIT effects of that operation, not a cold system boot. Raw JSON retains each repeat's first value,
all warm samples, dimensions and counters, OS/CPU/architecture/Node/V8, configuration, source commit/dirty flag and a
source fingerprint. Keep raw files outside the scene, as in the command above.

Warm values are microseconds per operation: each elapsed batch is divided by eight. p50/p95/p99 describe **batch means**,
then the report takes the median of each percentile across repeats. They are not individual-operation tail percentiles.
The first-operation median has only three observations; use the raw spread as a warning about JIT/startup noise.
The harness loop, status checks and simple accounting remain in measured work; no empty-loop subtraction is presented
as exact overhead removal. Sub-microsecond rows approach timer/loop resolution. Background load can change all results.

## What an operation means

| Workload | Timed operation | Outside timing / practical boundary |
| --- | --- | --- |
| `plan-idle` | Existing upstream `ComplexScenario` idle `PlanRunner.plan` | Precompiled IR and fixed world; no host action effects |
| `plan-heavy100` | Existing `FactHeavy100`, recursive/fact-heavy `run_scenario` | Same existing benchmark fixtures; a selected heavy planning case, not a universal worst-case bound |
| `dispatch-1` | Resolve, inspect/name-dispatch, a synthetic counter effect, complete one preplanned primitive | Top-level planning outside timing; no actual game executor |
| `dispatch-deferred32` | Resolve a deferred method into 32 primitives, inspect/dispatch/counter/complete all | Top-level plan outside timing; **deferred decomposition is included**, so this row is not pure cursor overhead |
| `action-wait` | Real built-in `!wait` factory, `start`, repeated `update(1/30)` until `done` | Context outside timing; configured 0.5 simulated seconds does not mean 0.5 CPU seconds |
| `action-move` | Real built-in `!move_to` factory, `start`, repeated `update(1/30)` until arrival/done | Flat-terrain kinematic move from (0,0,0) to (3,0,4), walking 1.3 m/s, arrival radius 0.3 m; pose reset outside timing |
| `tick-1` | One real `GuardAgent.tick(1/30)` | One NPC, two-waypoint patrol, one far target; normal completion replans and belief upkeep included |
| `tick-32` | One host loop ticking all 32 real guards | Two-waypoint patrol each; 32 far targets scanned by each NPC; normal completion replans and upkeep included |
| `tick-32-replan` | Request a replan then tick each of those 32 guards | Every tick includes candidate planning, upkeep, comparison and the real running action; no planning budget or throttle |

All cases have trace, structural stats and history off. Patrol targets stay far away: this measures movement and
perception scanning without chase/catch. Whole-tick rows include sensing, blackboard writes, reasoning, planning when
requested/due, execution and metric bookkeeping. Their first tick includes initial plans for every NPC. The JSON reports
actual decision-plan, reasoning-plan and active-check counts separately; it does not infer them from `totalStats` or
pretend every warm patrol tick replans. Lifecycle rows report `starts`, `updates`, `completions`; their logical simulated
seconds are separate accounting. Totals include cold, warm-up and measured operations. Actual table/row/step counts for
planning, population, target count, dt and other dimensions are stored with the measured results.

These Node measurements exclude SDK ECS/renderer writes, models, animation, audio, real raycasts, network transport,
physics and pathfinding. Built-in move is direct kinematic steering on a supplied flat terrain; your game's terrain,
custom action factories and other callbacks can do much more work. There is no universal per-action cost, NPC capacity,
Explorer FPS or other-client performance claim. Measure the same scene, NPC count and frame bursts in the target client;
see [the consumer benchmark guide](consumer-benchmark.md#budget-the-actual-scene).

The command and helpers stay under `scripts/`, already excluded from source-scene deployment. The portable installer
copies neither this command nor these fixtures; optional consumer planning measurements remain `htn:measure`.
The existing broader `htn:bench` suite and crowd scenarios remain available for different workloads.

## Recorded release run

Measured on 2026-10-23 at clean public release-source commit `11d2f5f617a4d127ae0bba8f42431d9c6ce5b740`.
This commit includes the integrated runtime, benchmark harness and first-release consumer contracts.
Windows `10.0.26300`, x64, Intel Core Ultra 9 275HX (24 logical CPUs), Node `v22.22.2`, V8 `12.4.254.21-node.39`.
Two separate default reports completed successfully in about seven elapsed seconds each. Each report has three fresh
workers per workload, 30 warm-up batches and 200 measured batches of eight; tracing/stats/history are off. Development
builds/tests by the other release workers were paused during these runs; unrelated OS load was not controlled.

Values below are **microseconds**. Cold is the primary report first-operation median (three observations); warm p50/p95/p99
are medians of repeat percentiles of batch means. Confirmation p50 comes from the second independent full report.

| Workload | Cold median | Warm p50 | Warm p95 | Warm p99 | Confirmation p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `plan-idle` | 1545.500 | 5.900 | 14.362 | 24.125 | 4.975 |
| `plan-heavy100` | 7533.600 | 307.950 | 375.312 | 441.125 | 240.675 |
| `dispatch-1` | 155.100 | 0.275 | 0.312 | 1.087 | 0.275 |
| `dispatch-deferred32` | 350.800 | 1.837 | 11.112 | 34.063 | 1.950 |
| `action-wait` | 146.300 | 0.675 | 1.537 | 4.125 | 0.713 |
| `action-move` | 656.700 | 19.775 | 30.188 | 41.950 | 18.550 |
| `tick-1` | 3566.300 | 3.463 | 11.975 | 63.250 | 3.575 |
| `tick-32` | 8870.800 | 67.150 | 102.588 | 140.150 | 70.988 |
| `tick-32-replan` | 8484.900 | 114.325 | 195.612 | 220.862 | 106.262 |

These are observations of this build/machine, not stable speed limits: confirmation p50 values moved by up to about
22%, despite pausing other build workers. No timing regression verdict follows from these two reports. In particular,
sub-microsecond dispatch/wait rows should be read as a rough scale, and cold results include first-use/JIT noise.
The primary first planning calls cost about **1.55 ms tiny / 7.53 ms heavy**, while the first 32-guard host tick costs
about **8.87 ms**; the confirmation cold medians are 1.09 / 6.02 / 8.24 ms respectively. The forced-replan32 first tick
has cold medians 8.48 / 4.48 ms. A warm heavy plan here is hundreds of microseconds, and a mostly executing 32-guard
host tick differs from an all-NPC replan burst. First-spawn/cold work must be budgeted separately from warm work.

The tiny planning world has **3 rows in 3 tables**, producing **2 primitive steps**. `FactHeavy100` has **624 rows in 18
tables**, producing **241 primitive steps**. Both use the existing seven-method `ComplexScenario` IR. Each worker actually
ran 1,841 operations: one cold, 240 warm-up and 1,600 measured. Dispatch32 completed 58,912 synthetic primitives per worker;
its deferred expansion is included in timing. Wait completed 1,841 lifecycles with 27,615 updates (15 each); move completed
1,841 lifecycles with 200,669 updates (109 each). These updates advance simulation directly without sleeping: move takes
109/30 simulated seconds and wait 0.5 simulated seconds, independently of the CPU-work numbers above.

Per worker, whole-tick runs advance 1,841 frames, about 61.37 simulated seconds. Tick1 made 4 decision plans and 4 reasoning
plans; tick32 made 148 of each across 58,912 NPC ticks. Requested-replan32 made 58,912 of each, with zero active checks.
The two reports agree on all these counters. Forced replanning also changes execution progression (48,400 completed steps,
versus 351 in the normal 32-guard patrol); it is an artificial candidate/replan stress case, not the same patrol played faster.
The JSON keeps these counts separate and includes final fact-row/movement counts; planning-time counters alone do not
measure an arbitrary game host or its callbacks.

The raw files are `final-report.json` (primary) and `final-confirmation.json`, recorded with the release task evidence.
They are not uploaded with the scene. Reproduce new files using the commands above; the summary intentionally retains
this measured public-source revision even when documentation or release wiring later changes. Primary selected-source SHA-256:
`25ec3efe93b0b5c61f7e3cee7ef8161db1a2e51b6eaedad4d9f9e6cae57f8f10`. This hashes the runtime, selected guard/upstream generated examples, benchmark helpers
and driver bytes; it is not a complete transitive dependency lock. The Git commit and environment remain the primary pin.
