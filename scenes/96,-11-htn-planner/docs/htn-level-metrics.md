# HTN playground levels: outcome metrics and ablation baselines

What a feature buys, measured next to what it costs. The bench (`npm run htn:bench`, the counter gate in `npm test`)
measures the cost of a planner or agent feature; this file measures its benefit: what the NPCs of the playground
levels do with it and without it. Together they are the decision table of the feature-cost rule in
[htn-guidance.md](htn-guidance.md#new-planner-features-opt-in-and-paid-for-in-the-bench).

The idea after Metta-AI/cogame-collab-cooking (its baselines are "the SAME brain with one parameter changed"): each
**ablation** is a level with one documented change and nothing else, and the **outcome metrics** are read the same
way for the level and each ablation, over several seeds.

Code, all in `scenes/96,-11-htn-planner`:
- `src/playground/metrics.ts`: the reader (`MetricsReader`, plain frames and events in, `LevelMetrics` out),
  `observeLevel` (feeds it from a `LevelSim`), `METRICS` (every metric with its definition), the table;
- `src/playground/ablation.ts`: the general ablations and where they apply; `LevelSim.ablation`, `ablations()`,
  `levelAblations()`, `isSound()`, `roles()`, `posts()`, `outcomes()`, `stagger` in `src/playground/sim.ts`;
- `src/playground/headless.ts`: `runLevel(level, { metrics, ablation, stagger })`, `runLevelSet` (seeds x
  ablations, the means), `formatLevelSet`;
- tests: `test/playground/metrics.test.ts` (one test per metric rule, on hand-made streams; determinism; this file
  names every metric), `test/playground/ablations.test.ts` (each ablation changes what it says, and an ablation that
  is off changes nothing).

The reader is not in the scene's runtime path: the scene never loads `metrics.ts`. It observes a level after every
update and hears the NPCs' events through `LevelSim.observer` (null in the scene); a run with metrics is the same run
as one without (a test compares them). It reads sim time and sim state only, never the wall clock, so the same seed
gives the same numbers on every machine. With no ablation set (the default) every level runs as before: the counter
gate (`benchmarks/counters.baseline.json`) did not change.

## Running it

In `scenes/96,-11-htn-planner`:

```
npm run htn:level -- 5 --metrics                              # one run, its checks, then the metrics
npm run htn:level -- 12 --ablate no_presence --metrics        # one ablation (its checks show what it broke)
npm run htn:level -- 11 --ablate all --seed 1-5 --rounds 3 --stagger 5          # the table below for level 11
npm run htn:level -- 11 --ablate all --seed 1-5 --rounds 3 --stagger 5 --json   # { level, seeds, variants: [{ ablation, change, runs, mean }] }
npm run htn:level -- 12 --ablate nope                         # exit 2: lists the level's ablations
npm run htn:level -- 7 --variant all --seed 1-20 --rounds 3 --stagger 5          # the level and its domain variants (flat) side by side
```

- `--metrics`: the metrics after the run; `--json` always has them (`metrics.values`: one number per metric, null
  where it is not defined; `metrics.detail`: per NPC, per round).
- `--ablate <name>`: one ablation; `--ablate all`: the level as it is (`default`) and every ablation it has.
- `--seed a-b` or `a,b,c`: a run per seed, means over the seeds (a metric undefined in a run, e.g. no catch to time,
  is left out of its mean).
- `--stagger S`: the tester starts its script after a wait drawn from the seed in [0, S) s, so the NPCs meet it at
  another point of their patrol each seed. Only the crowd (level 9) draws from the seed by itself (where each guard
  starts); without a stagger every other level gives the same run for every seed, and a mean over seeds would be one
  run.
- `--variant <name>`: the level's NPCs on another shape of their domain (`src/playground/variants.ts`; `flat`: the
  frozen before shape of the stalker and the guard, below); `--variant all`: the level as it is and each variant
  (with `--ablate`, every pair).
- Several seeds, `--ablate all` or `--variant all` print a line per run (OK, or the checks it did not pass) and the
  table of means.
  Exit 1 only when a run without an ablation failed: an ablated run is expected to break checks.

A level with three rounds over five seeds runs in about a second (level 12: two).

## The metrics

`npm run htn:level` prints them in this order; the tables below leave out rows that are 0 in every column.

Run:

| metric | definition |
|---|---|
| `rounds` | rounds of the tester script the run reached (the last one may be cut off by `--seconds`) |
| `round_s` | s from round 1's start (after the stagger) to the end of the run, per round |

Per NPC (means over the NPCs that were present; an NPC off-stage, as level 12's before it steps out, is not
counted; an NPC respawned under the same id is one NPC):

| metric | definition |
|---|---|
| `moving` | share of its present time with a step running and its body moving (more than 1 mm in the tick) |
| `acting` | share with a step running, standing, not a `!wait…` step (looking around, turning, catching, handing over) |
| `waiting` | share with a `!wait…` step running, standing |
| `idle` | share with no step running (no plan, or between steps) |
| `walked_m` | m walked (XZ, while present) per round |
| `replans_per_min` | replans per minute present (kept plans too) |
| `plans_failed` | replans that found no plan, per round |
| `steps_failed` | steps that ended failed (a chase that lost its target), per round |
| `steps_cancelled` | steps cancelled (a new plan, a running step the check rejected), per round |
| `noise_reactions` | replans a noise asked for (trigger `hearing`), per round: investigations of noises and lures |

The shape of its plans (per NPC, means over the NPCs). The definitions below and the
[domain-variant comparison](#domain-variants-the-tiered-stalker-and-guard-now-the-default) describe their scope.
A **new plan** is a successful replan that did not keep the running plan:

| metric | definition |
|---|---|
| `plans_per_min` | new plans per minute present |
| `plan_len` | steps per new plan (a deferred step counts one) |
| `plan_1step` | share of new plans of one step |
| `plan_bookkeeping` | share of new plans whose every step is bookkeeping (`!forget…`, `!unfocus`, `!refocus`, `!set_…`, `!watch`, `!remember…`, `!clear_…`: the classification of research 05) |
| `upkeep_per_min` | belief upkeep steps run before its plans (`GuardAgentOptions.reasoning`, `ReplanEvent.upkeep`) per minute present |
| `planner_calls_per_min` | planner calls per minute present: decisions, candidates, empty-plan passes and upkeep passes (`metrics.plansMade + reasoningMade`) |

The encounter, for levels where the visitor (the tester) is offered to the NPCs' senses (5, 7, 8, 9, 11, 12):

| metric | definition |
|---|---|
| `noticed_rate` | share of rounds in which some NPC detected the visitor (perception: in its blackboard's visible targets) |
| `notice_s` | s from a round's start to the first detection (mean over the rounds with one; 0 when before the start) |
| `catch_rate` | share of rounds with a catch (a `catch` event) |
| `catch_s` | s from a round's start to its first catch (mean over the rounds with one) |
| `notice_to_catch_s` | s from a round's first detection to its first catch (rounds with both) |
| `seen_s` | s per round that some NPC had the visitor detected |
| `presence_s` | s per round that some NPC sensed the visitor by presence alone (smell, out of sight; level 12) |
| `coverage` | share of the time the visitor was offered to a present NPC's senses that some NPC had it detected |
| `chases` | detection episodes per round: an NPC detecting the visitor, until it no longer does |
| `chases_lost` | episodes per round that ended with no catch of the visitor by any NPC during them: it got away |

Squads (levels 8 and 11):

| metric | definition |
|---|---|
| `role_changes` | changes of any guard's role per round (its first role is not a change; level 11's squad orders) |
| `gate_held` | share of the run some guard stood within 2 m of the gate post (`YARD_GATE`, inside the gap in the fence) |

A level's own outcome counts (`LevelSim.outcomes`, per round):

| metric | definition |
|---|---|
| `served` | level 10: crates handed over |
| `lures` | level 12: glimpses of a light in its far ring that sent it to look |

False alarms are not measured: every noise in the levels is the tester's (bell, pebble, stone), and the visitor is
the only target, so there is no ground truth of a threat that was not one.

**Read the times with the script in mind.** A round is the tester's script: it walks in, waits, rings the bell. So
`notice_s` and `catch_s` are mostly the script's pace; they compare an ablation with its own level, never one level
with another. A check that fails waits out its limit before the script goes on, so an ablation that breaks checks
has longer rounds (`round_s`), and per-round counts and times after the failure include that wait. Compare shares,
rates per minute, `coverage` and the check verdicts (`runs ok`) first.

## The ablations

General ones: `LevelSim` implements them, and a level has those that change something for its NPCs (computed from
their setups: the facts their domain reads, the options they are built with). A level's own come on top.

| ablation | levels | the one change |
|---|---|---|
| `no_hearing` | 5-9, 12 | every noise is dropped before the NPCs tick (a level may keep a noise that is no sound: level 12's lure, a glimpsed light delivered as a noise, stays) |
| `no_memory` | 5, 7-9, 11, 12 | a lost target is forgotten at once: `last_seen` is cleared in the NPC's facts sync, before every plan (one more replan when it goes) |
| `no_presence` | 12 | no presence sense (smell): `PerceptionConfig.presenceRadius` 0 |
| `no_budget` | 9 | no shared planning budget: every replan runs the frame it is due (`LevelSim.planBudget` null) |
| `no_active_plan` | 10 | no running-plan check (`GuardAgentOptions.activePlan` unset); the level replans on every change of its facts instead |
| `no_squad` | 11 | no squad planner: each guard orders itself, its calm role (a holds the gate, b and c patrol), or chase while it sees or remembers the intruder; nobody takes a role over, nobody flanks |
| `no_light` | 12 | sight not scaled by the target's light (`TargetSample.visibility` unset: seen as far as a lit target); the lure ring still depends on the light |

Levels 1-4 have none (their domains read no sense; no budget, no check, no squad). Level 11's guards hear nothing
(the squad has no noise source and the yard guard domain reads no noise), so it has no `no_hearing`.

## Baseline: every level, every ablation

`npm run htn:level -- <level> --ablate all --seed 1-5 --rounds 3 --stagger 5`, means over seeds 1-5. `runs ok`: the
runs whose checks all passed. With `--stagger 5` every default run passes; with `--stagger 10` or more, level 7
fails for some seeds (open items below).

### Level 5 sight: Senses change facts; the NPC replans

| metric | default | no_hearing | no_memory |
|---|---:|---:|---:|
| runs ok | 5/5 | 5/5 | 0/5 |
| `round_s` | 22.8 | 22.8 | 31.3 |
| `moving` | 0.59 | 0.59 | 0.816 |
| `acting` | 0.273 | 0.273 | 0.023 |
| `waiting` | 0.137 | 0.137 | 0.161 |
| `walked_m` | 24.1 | 24.1 | 42.2 |
| `replans_per_min` | 19.6 | 19.6 | 16.1 |
| `steps_cancelled` | 4 | 4 | 4 |
| `noticed_rate` | 1 | 1 | 1 |
| `notice_s` | 6.38 | 6.38 | 8.54 |
| `catch_rate` | 1 | 1 | 1 |
| `catch_s` | 6.44 | 6.44 | 14.4 |
| `notice_to_catch_s` | 0.056 | 0.056 | 5.87 |
| `seen_s` | 3.87 | 3.87 | 6.52 |
| `coverage` | 0.421 | 0.421 | 0.377 |
| `chases` | 2 | 2 | 2 |
| `chases_lost` | 0 | 0 | 0.333 |

All 0: `idle`, `plans_failed`, `steps_failed`, `noise_reactions`, `presence_s`.

What it shows: memory is what makes the guard search. Without it the "lost -> investigate_last_seen" check fails
every round, the guard walks back to its patrol at once (acting 0.27 -> 0.02, walked 24 -> 42 m per round), and in
one round in three the tester got away from a chase. `no_hearing` changes nothing: the script makes no noise here.

### Level 6 hearing: Hearing: faint vs loud

| metric | default | no_hearing | no_memory |
|---|---:|---:|---:|
| runs ok | 5/5 | 0/5 | 5/5 |
| `round_s` | 18 | 14.1 | 18 |
| `moving` | 0.546 | 0.888 | 0.546 |
| `acting` | 0.407 | 0.004 | 0.407 |
| `waiting` | 0.047 | 0.108 | 0.047 |
| `walked_m` | 16.5 | 17.1 | 16.5 |
| `replans_per_min` | 14.9 | 7.99 | 14.9 |
| `steps_cancelled` | 2 | 0 | 2 |
| `noise_reactions` | 2 | 0 | 2 |

All 0: `idle`, `plans_failed`, `steps_failed`.

What it shows: the level is hearing and nothing else. Deaf, the guard only patrols (two noise reactions per round ->
0, half the replans). `no_memory` changes nothing: nobody is seen here.

### Level 7 stalker: A full NPC: tiers of behaviours

| metric | default | no_hearing | no_memory |
|---|---:|---:|---:|
| runs ok | 5/5 | 5/5 | 0/5 |
| `round_s` | 62.1 | 62.1 | 104 |
| `moving` | 0.673 | 0.673 | 0.824 |
| `acting` | 0.325 | 0.325 | 0.176 |
| `idle` | 0.002 | 0.002 | 0 |
| `walked_m` | 56.6 | 56.6 | 80.7 |
| `replans_per_min` | 13.3 | 13.3 | 9.17 |
| `steps_cancelled` | 5 | 5 | 4 |
| `noticed_rate` | 1 | 1 | 1 |
| `notice_s` | 10 | 10 | 10 |
| `catch_rate` | 1 | 1 | 1 |
| `catch_s` | 57 | 57 | 98.7 |
| `notice_to_catch_s` | 47 | 47 | 88.7 |
| `seen_s` | 11.2 | 11.2 | 7.83 |
| `coverage` | 0.178 | 0.178 | 0.075 |
| `chases` | 2 | 2 | 2 |
| `chases_lost` | 1 | 1 | 1 |

All 0: `waiting`, `plans_failed`, `steps_failed`, `noise_reactions`, `presence_s`.

What it shows: without memory the stalker never searches the hut (search_at_shelter and the give-up chain fail), so
it does not walk off either: the checks after it wait out their limits (round 62 -> 104 s), it watches the tester
less than half as much (coverage 0.18 -> 0.08). The catch still comes, once the tester stands in the field.
`no_hearing` makes no difference: the tester makes no noise in this script (a visitor's footsteps would).

### Level 8 squad: A squad: one domain, three NPCs

| metric | default | no_hearing | no_memory |
|---|---:|---:|---:|
| runs ok | 5/5 | 0/5 | 5/5 |
| `round_s` | 31 | 26.1 | 23 |
| `moving` | 0.687 | 0.753 | 0.687 |
| `acting` | 0.221 | 0.118 | 0.197 |
| `waiting` | 0.092 | 0.129 | 0.116 |
| `walked_m` | 40.9 | 33.9 | 28.1 |
| `replans_per_min` | 15.6 | 14.3 | 17.5 |
| `steps_cancelled` | 4.11 | 2.58 | 3.67 |
| `noise_reactions` | 1 | 0 | 1 |
| `noticed_rate` | 1 | 1 | 1 |
| `notice_s` | 4.07 | 4.98 | 3.68 |
| `catch_rate` | 0.933 | 0.733 | 0.867 |
| `catch_s` | 5.01 | 6.47 | 4.73 |
| `notice_to_catch_s` | 0.96 | 0.904 | 0.956 |
| `seen_s` | 6.82 | 6.07 | 6.12 |
| `coverage` | 0.758 | 0.66 | 0.768 |
| `chases` | 4.67 | 3.87 | 4 |
| `chases_lost` | 1.4 | 1.07 | 1.33 |
| `gate_held` | 0.216 | 0.166 | 0.01 |

All 0: `idle`, `plans_failed`, `steps_failed`, `presence_s`, `role_changes`.

What it shows: three independent guards, the comparison for level 11. Nobody holds the gate on purpose: it is held
a fifth of the time, by a guard that chased the tester out or searches where it was last seen, at the way out
(without memory, 1 %). Deaf, the bell check fails, and the shifted rounds catch the tester less often (0.93 -> 0.73): an
effect of the script's timing more than of hearing, which plays no part in the chase.

### Level 9 crowd: A crowd: 10 guards, one domain

| metric | default | no_hearing | no_memory | no_budget |
|---|---:|---:|---:|---:|
| runs ok | 5/5 | 0/5 | 5/5 | 5/5 |
| `round_s` | 30.7 | 25.9 | 24.4 | 30.6 |
| `moving` | 0.681 | 0.768 | 0.662 | 0.684 |
| `acting` | 0.222 | 0.092 | 0.193 | 0.218 |
| `waiting` | 0.096 | 0.139 | 0.144 | 0.098 |
| `idle` | 0.001 | 0.001 | 0.001 | 0 |
| `walked_m` | 38.9 | 32.2 | 27.4 | 38.5 |
| `replans_per_min` | 17 | 14.6 | 18 | 16.9 |
| `steps_failed` | 0.46 | 0.28 | 0.14 | 0 |
| `steps_cancelled` | 4.33 | 2.45 | 3.49 | 4.68 |
| `noise_reactions` | 1 | 0 | 1 | 1 |
| `noticed_rate` | 1 | 1 | 1 | 1 |
| `notice_s` | 2.51 | 2.61 | 2.52 | 2.51 |
| `catch_rate` | 1 | 1 | 1 | 1 |
| `catch_s` | 3.53 | 3.79 | 3.57 | 3.54 |
| `notice_to_catch_s` | 1.02 | 1.17 | 1.05 | 1.02 |
| `seen_s` | 6.91 | 7.88 | 8.74 | 6.9 |
| `coverage` | 0.924 | 0.921 | 0.941 | 0.924 |
| `chases` | 18.9 | 13.7 | 13.2 | 18.4 |
| `chases_lost` | 6.27 | 4.07 | 2.67 | 6 |

All 0: `plans_failed`, `presence_s`.

What it shows: **the planning budget (3 plans per frame) costs nothing in outcome**: notice 2.51 s both, catch 3.53
against 3.54 s, coverage 0.924 both. Its one trace: when a guard loses the tester, its replan may wait a frame or two
for the budget, and meanwhile its `!chase` step fails on the lost target instead of being cancelled by the replan
(0.46 failed steps per guard per round, 0 without the budget; cancelled 4.33 against 4.68). So the budget's benefit
on the cost side (the bench: the frame everyone replans spread over frames) comes with no measurable loss here.
Without memory fewer chases start (18.9 -> 13.2) and fewer end lost (6.3 -> 2.7).

### Level 10 storekeeper: Is the running step still valid?

| metric | default | no_active_plan |
|---|---:|---:|
| runs ok | 5/5 | 0/5 |
| `round_s` | 25.3 | 32.2 |
| `moving` | 0.764 | 0.684 |
| `acting` | 0.216 | 0.241 |
| `waiting` | 0.02 | 0.075 |
| `walked_m` | 42.7 | 48.6 |
| `replans_per_min` | 15.6 | 15.9 |
| `steps_cancelled` | 5 | 5 |
| `served` | 1 | 1 |

All 0: `idle`, `plans_failed`, `steps_failed`, `noise_reactions`.

What it shows: **here the running-plan check buys nothing in outcome.** Replanning on every change of the level's
facts (customer, door, crate) makes the same plans at the same moments (the event histories match plan for plan),
serves the same crate per round, and replans as often (15.6 against 15.9 per minute). The checks fail because they
test the mechanism (they wait for a rejected step), and their timeouts make the rounds longer, which is all the
other differences are. The check pays off where a replan on every fact change would be too many replans (facts that
change often but rarely invalidate the step), which this level does not have.

### Level 11 orders: A squad planner gives the orders

| metric | default | no_memory | no_squad |
|---|---:|---:|---:|
| runs ok | 5/5 | 5/5 | 0/5 |
| `round_s` | 19.5 | 16.3 | 43.7 |
| `moving` | 0.593 | 0.661 | 0.708 |
| `acting` | 0.178 | 0.078 | 0.062 |
| `waiting` | 0.229 | 0.261 | 0.23 |
| `walked_m` | 20.4 | 18.7 | 46.7 |
| `replans_per_min` | 25.6 | 29.4 | 14.7 |
| `steps_cancelled` | 5.04 | 5.84 | 3.47 |
| `noticed_rate` | 1 | 1 | 1 |
| `notice_s` | 3.35 | 3.35 | 3.37 |
| `catch_rate` | 1 | 1 | 1 |
| `catch_s` | 3.41 | 3.41 | 3.42 |
| `notice_to_catch_s` | 0.056 | 0.056 | 0.044 |
| `seen_s` | 3.3 | 3.3 | 12.9 |
| `coverage` | 0.934 | 0.934 | 0.952 |
| `chases` | 4.2 | 4.2 | 3.13 |
| `chases_lost` | 0.4 | 2.07 | 0.133 |
| `role_changes` | 10 | 11.6 | 6.27 |
| `gate_held` | 0.938 | 0.934 | 0.264 |

All 0: `idle`, `plans_failed`, `steps_failed`, `noise_reactions`, `presence_s`.

What it shows: **the commander does not catch faster** (catch 3.41 s with it, 3.42 without, every round caught):
in this script the tester walks in past the gate, and the guard at the gate notices and catches it within a tenth of
a second either way. **What it buys is the gate: held 94 % of the run, 26 % without.** Without orders the gate
holder is also the first to see the intruder, chases it, and nobody takes the gate over (nor when it goes on a
break); with the squad planner the next guard does, at the price of more replans (25.6 against 14.7 per guard per
minute: every new order replans a guard) and 10 role changes per round. Without memory the chaser's role ends the
moment the intruder is out of sight: chases end lost five times as often (0.4 -> 2.07 per round), the outcome the
same. Against level 8 (three guards, no orders, the same yard): the gate held 0.94 against 0.22, catch rate 1 against
0.93.

### Level 12 ambush: An ambush: sight, light, smell, sound

| metric | default | no_hearing | no_memory | no_presence | no_light |
|---|---:|---:|---:|---:|---:|
| runs ok | 5/5 | 0/5 | 5/5 | 5/5 | 0/5 |
| `round_s` | 140 | 168 | 140 | 147 | 199 |
| `moving` | 0.759 | 0.782 | 0.759 | 0.745 | 0.714 |
| `acting` | 0.24 | 0.217 | 0.24 | 0.254 | 0.284 |
| `idle` | 0.001 | 0.001 | 0.001 | 0.001 | 0.002 |
| `walked_m` | 89.1 | 109 | 89.1 | 93.8 | 50.8 |
| `replans_per_min` | 11 | 9.05 | 11 | 10.9 | 17.3 |
| `steps_cancelled` | 10 | 9 | 10 | 9 | 9.33 |
| `noise_reactions` | 3 | 2 | 3 | 3 | 2.67 |
| `noticed_rate` | 1 | 1 | 1 | 1 | 1 |
| `notice_s` | 38.2 | 38.2 | 38.2 | 38.2 | 19.1 |
| `catch_rate` | 1 | 1 | 1 | 1 | 1 |
| `catch_s` | 39.8 | 39.8 | 39.8 | 39.8 | 22.5 |
| `notice_to_catch_s` | 1.63 | 1.63 | 1.63 | 1.63 | 3.4 |
| `seen_s` | 6.8 | 6.8 | 6.8 | 7.2 | 9.94 |
| `presence_s` | 1.03 | 1.03 | 1.03 | 0 | 0.689 |
| `coverage` | 0.052 | 0.043 | 0.052 | 0.052 | 0.144 |
| `chases` | 2 | 2 | 2 | 2 | 2.33 |
| `lures` | 2 | 2 | 2 | 2 | 2 |

All 0: `waiting`, `plans_failed`, `steps_failed`, `chases_lost`.

What it shows:
- **Light matters most.** Without it the dark tester is seen as far as a lit one: noticed in half the time (notice
  19.1 against 38.2 s from the round's start), on its way in, before the script's "dark: unseen" part; the
  sight-by-light checks fail and the rounds run out of time.
- **Smell matters only right on its heels.** Without it, the dark tester 1.6 m behind it is noticed after 6.9 s (by
  sight, once it turns), not 0.33 s (seed 1; the "smells me" check passes either way, its limit is 8 s:
  `npm run htn:level -- 12 --ablate no_presence` shows the times); the 1 s per round of presence sensing is gone,
  and the rounds are 7 s longer.
- **Hearing: only the stone.** Deaf, it ignores the knock (that check fails), and a noise reaction per round goes;
  the lure, a glimpsed light, still draws it (2 per round both ways).
- **Memory makes no difference here**: the stalker never loses anyone in this script (no chase is lost: noticed =
  caught).

## Domain variants: the tiered stalker and guard, now the default

The domain-shape comparison adopted on 2026-10-18: the tiered stalker and guard are `stalker.domain` and `guard.domain`, run with their belief
upkeep (`GuardAgentOptions.reasoning`) on levels 5-9 and 12; the flat ones they replaced are frozen in
`test/fixtures/reference` and run as the variant `flat` (registered by the tools, not the scene). Every table above
was measured on the flat domains; the outcome metrics they show did not change (below).

- **The switch, measured.** `npm run htn:level -- <level> --metrics --seed 1-10`, before and after, levels 5-9, 11
  and 12: every run ok, every per-seed line and every outcome and activity metric the same. Only the plan rows moved:

| level | `planner_calls_per_min` before → after | `plan_len` | `upkeep_per_min` |
|---|---:|---:|---:|
| 5 sight | 19.8 → 39.6 | 3 = | 0 = |
| 6 hearing | 22.8 → 45.6 | 3.33 = | 0 = |
| 7 stalker | 13.3 → 26.7 | 2.31 = | 0 = |
| 8 squad | 15.3 → 30.5 | 3.29 = | 0 = |
| 9 crowd | 16.3 → 32.5 | 3.25 = | 0 = |
| 11 orders (yard_guard restructured, no upkeep) | 31.6 = | 2.83 = | 0 = |
| 12 ambush | 11 → 22.4 | 3.10 → 3.05 | 0 → 0.458 |

  The experiment's own run (`--variant all --seed 1-20 --rounds 3 --stagger 5`, 240 runs) gave the same picture.
- **`plan_bookkeeping` is 0 before and after.** The tester scripts never make the flat domains plan a
  bookkeeping-only plan.
- **Off-script, the difference shows.** With a random visitor (`node scripts/htn-variant-diff.mjs`, live against
  `flat`, 50 seeds × 120 s), the flat domains plan 29 (level 5), 87 (level 8) and 278 (level 9) bookkeeping-only
  plans and the live ones none. Catches agree within 0.1%. The full comparison is in the research doc.

## Continue branches (`GuardAgentOptions.continueTask`)

No playground level has two visitors, so this ablation is a headless sim test, not an `htn:level` run:
`test/npc/continue-ablation.ts` (the sim) and `test/npc/continue-ablation.test.ts` (`npm test -- continue-ablation`
prints the tables). One guard, two visitors running around a 7 m circle at 2.6 m/s (the chase runs 3.4 m/s) in
opposite directions, so which one is nearer keeps flipping; a caught visitor reappears across the circle. The
domain is a test-only copy of `guard_tiered.domain` with one continue branch directly above `chase_visible_target`
(`test/fixtures/continue/guard_continue.domain`):

```lisp
(continue_chase
    (and (running chase ?target) (target_visible ?target ?any_position))
    ((!continue)))
```

The ablation is the option: `continueTask: '!continue'` (on) or unset (off). Off, nothing publishes
`(running ...)`, so the branch never holds: the test checks that the off runs equal guard_tiered's, event for
event. Ten seeds (the visitors' start phases) × 60 s, means; `cone` is the guard's usual 110° sight cone (the
visitor it does not face drops out of sight), `all_around` a 360° cone (both always seen).

| metric | cone off | cone on | all_around off | all_around on |
|---|---:|---:|---:|---:|
| re-targets / min (a chase cut for the other visitor) | 5.7 | 0.1 | 12.7 | 0 |
| flip-flops / min (back to the visitor chased before) | 2.3 | 0 | 0 | 0 |
| catches / min | 15.6 | 14.4 | 19.5 | 14.2 |
| `catch_s` (first chase step to catch) | 2.11 | 2.42 | 2.90 | 3.99 |
| new plans / min | 38 | 30.4 | 34.2 | 16.3 |
| replans / min (kept ones too) | 51.1 | 53.3 | 35.1 | 43.6 |
| continued / min | 0 | 22.9 | 0 | 27.3 |
| planner calls / min (decisions and upkeep) | 102 | 107 | 70.2 | 87.2 |

- **It does what it says: the guard stops re-targeting.** Flip-flops and re-targets drop to about 0, and the guard
  makes 20-52% fewer new plans, so fewer chases are cut.
- **It costs this guard catches.** Re-targeting to whichever visitor is nearest is the faster way to catch *a*
  visitor: with the continue branch the guard keeps running after the far one. Catches drop 8% (cone) and 27% (all
  around), `catch_s` rises 15% and 38%.
- **It does not save planning.** A kept replan is still a planner call. Longer chases see more crossings, so there
  are more replans: planner calls rise 5% and 24%.
- **Recommendation: do not add this branch to the live guard as it is.** For a catcher, "nearest first" is the
  goal, and the 110° cone already damps the twitch. A continue branch fits where commitment is the goal: a turret
  that should finish its burst, a multi-step behaviour that would lose its progress (Decima's grab-a-resource, our
  `investigate_last_seen`), a squad role. For the chase, a hysteresis condition would fit better: keep the target
  unless the other is clearly nearer, by a margin. That needs a distance fact the guard domain does not have yet.
  This is not measured here.

Cost (`npm run htn:bench`, rows `Continue holds`, `Retarget`, `Continue miss`): a plan that is `(!continue)`
costs about as much as the chase it replaces, about 1 µs and 0 bytes. A continue branch that fails adds 1 branch
retry, 2 conditions and 1 fact query to every plan that falls through it.

## Open items

- The scripts pace the encounters: the times above say more about the script than about the NPC where an ablation
  breaks a check. Scripts that adapt (walk on as soon as the NPC reacted, flee a chase, hide when seen) would make
  `catch_rate` and `notice_s` outcome measures rather than script measures; so would a hand-made visitor model
  (BACKLOG, Evaluation ideas: play against partner models).
- Level 7 with `--stagger 10` or more: for some seeds the stalker faces away when the tester peeks in and never
  notices it; the rest of the script fails after it (seed 2 with 10 s; seeds 2 and 5 with 20 s). A script that
  assumes the NPC's patrol phase.
- Encounter metrics count the scripted tester only; a visitor on the pad (`you`) is offered to the senses in the
  scene, never headless.
- The general ablations are three sense switches, a budget and a check; level-specific ones exist for 11 and 12.
  More to add when a feature lands (each new opt-in feature: an ablation, a row of this table).
