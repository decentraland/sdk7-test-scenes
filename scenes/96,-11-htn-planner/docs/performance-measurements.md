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

Final quiet-window results and source/environment pin are recorded here after harness validation.