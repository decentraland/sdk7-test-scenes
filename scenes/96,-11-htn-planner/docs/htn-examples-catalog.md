# HTN planner — example plans catalog

The examples the capsule test scene must cover. The examples are separate from the planner itself. A creator imports the planner without them and adapts it to their own game. Source and licence details are recorded in the domain headers and notices below.

## Where they run

Scene `scenes/96,-11-htn-planner` (README there). Every playground spawns from the scene's Playgrounds menu; the
list is `src/playgrounds.ts`, one line each. Playground levels (basics, guard sight and hearing, stalker with the
capsule `StalkerHost` and its spawn variants, a guard squad with a `possessEntityBody` figure): one file each in
`src/playground/levels`. Upstream gallery: `src/demo/upstream-zone.ts` over `src/examples/upstream/gallery`, one
station file each, which lists every scenario with its expected plan. Those plans are checked by
`test/examples/upstream-stations.test.ts`. Language lab: the same zone over `src/examples/upstream/lab.ts`, with
scenarios generated from the conformance cases (`scripts/htn-lab.ts`). The same test checks that every upstream
example domain runs on some station.

## Summary

- **Guard**: belief upkeep, then 4 tiers — patrol, chase/catch, investigate (listen, reaction to a loud noise, a last-seen spot), idle. Shares its chase, search and patrol with yard_guard (`guard/guard_kit.domain`).
- **Stalker**: belief upkeep, then 6 tiers — notice, peer, search shelter, give up/leave, despawn and more. Needs a capsule stub (`StalkerHost`) instead of animations.
- Their shape before the 2026-10-18 restructure (a flat root of 8 and 21 branches) is frozen as the known bad example: `test/fixtures/reference/guard_flat.domain`, `stalker_flat.domain` ([domain-variant measurements](htn-level-metrics.md#domain-variants-the-tiered-stalker-and-guard-now-the-default)).
- **Language lab**: the 17 upstream language-feature test domains, the README / docs / SDK example domains and the CI smoke test domain: 265 scenarios. Then a hot reload station (HTNHotReloadDemo).
- **Upstream examples**: AAACombatNPC, Wanderer, Ninja/Grunt (domain inheritance), backtracking, comparisons, human and more. Their actions are abstract, so each one needs a simple executor: a timed step + colour/label + movement.

## AAA target eligibility: reference and adaptation

The source has a known limitation: a closer dead visible enemy excludes a farther live enemy.
The verbatim fixture and generated AAA module preserve upstream behavior for comparison.
`src/examples/upstream/adapted/AAACombatNPC.domain` adds the same living-target check to the
closer-rival comparison; its gallery scenario chooses the living enemy. Both paths are tested.
Regenerate the adaptation with `npm run htn:examples`. It reuses the pinned upstream includes
and licence; it is an explicit local adaptation, not a claim that upstream fixed the issue.

## Guard — `src/examples/guard/guard.domain` → `guard.htn.ts` (`guardDomain`)

`(reasoning)`, the belief upkeep the host plans before every decision (`GuardAgentOptions.reasoning`):
`forget_stale_memory` (last seen > 20 s ago: `!forget`), `forget_stale_noise` (> 12 s: `!forget_noise`), an empty
`nothing_to_update`.

`(behave)` tiers in priority order; the behaviour names (what a level reads, `chosenDepth: 2`) one level down:

| # | Tier | Trigger | Behaviour: plan |
|---|---|---|---|
| 1 | `chase` | `target_visible` | `chase_visible_target` (`guard_kit.domain`): `!chase`, `!catch`, `!wait 1.5` |
| 2 | `investigate` | `heard_noise` or `last_seen` | `check_alarming_noise` (`alert alarmed`): `!turn_to`, `!listen 0.6`, `(go_to_noise)` (run if loudness ≥ 0.75, else hurry), `!look_around 3`, `!forget_noise`; `investigate_last_seen`: `!move_to hurry`, `!look_around 3`, `!forget` (kit); `listen_to_noise`: `!turn_to`, `!listen 2`, `!forget_noise` |
| 3 | `patrol` | `current_waypoint` + `waypoint` | `patrol` (kit): `!move_to walk`, `!wait 1`, `&advance_patrol` |
| 4 | `idle` | — | `!wait 1` |

Scene triggers needed:
- player in sight (chase, investigate after losing them);
- a button that makes a faint or a loud noise (listen / alarm, hurry vs run);
- a waypoint loop (patrol);
- an empty route (idle).

## Stalker — `src/examples/stalker/stalker.domain` → `stalker.htn.ts` (`stalkerDomain`)

`(reasoning)`: forget unnoticed, drop a noise while hunting, forget a stale noise (30 s), forget a noise heard before
the sighting, ignore the player's noise on the route, drop the focus; an empty `nothing_to_update`.

`(behave)`: 6 tiers in priority order, each calling a behaviour:

1. `finish`: stand over caught; leave (`gave_up` → walk to the exit, `!despawn`)
2. `hunt`: chase noticed target; notice seen target; notice close target (`notice_target`: `already_facing`, or a
   head turn followed by a body turn); declines when it may notice nobody yet
3. `hear` → `react_to_noise`: track heard target, continue investigation, retarget investigation, startled by a loud
   noise (≥ 0.6), investigate noise (`check_noise_spot`: turn, go, look around, drop the noise and the focus)
4. `search` (axiom `lost_target`): search at shelter → `!give_up`; search last seen (`give_up_search`)
5. `route` → `follow_route`: walked off (`!despawn`); walk route + `&after_waypoint`: watch point / `!peer` / look on
   patrol / next with modulo wrap
6. `idle`

Capsule `StalkerHost`:
- `play`: no-op (or colour/label);
- `clipFinished`: `false`;
- the head turn (`!head_turn`, `!peer`) is shown by turning the head sphere separately from the body.

Spawn kinds to demo: `cross`, `stand`, `patrol`, `chase`.

## Upstream — `test/htn/fixtures/upstream/Domains/` (+ `WorldStates/`)

| Domain | Shows |
|---|---|
| `Wanderer` (+ `Includes/movement2`) | path segments via recursion, deferred `&talk_about_destination`, callterms, idle, base/overrides |
| `AAACombatNPC` + `Includes/aaa_{orders,combat,investigation,search,idle}` | scripted orders (high/medium/low), nearest enemy via `not`, retreat at low HP, melee/ranged tactics, investigation by stimulus, lost-enemy search, idle activities; world states `idle`, `melee`, `ranged`, `investigation`, `search`, `high/medium/low_order` |
| `Grunt`, `NormalNinja`, `EliteNinja` + `EnemyBase`, `Ninja` | domain inheritance, `Base::` calls, constant/axiom overrides — the same world state gives different plans |
| `Test/complex_scenario` + `combat_reactions` | emergency/recovery/mobility, iteration over entities, axioms `is_threat`/`can_engage`, callterms |
| `BuiltinComparisonsDemo` | `== != < <= > >=`: critical / engage / out_of_ammo / safe |
| `RuntimeBacktrackingDemo`, `Test/hierarchical_backtracking`, `Test/backtracking_policy` | fact/axiom alternatives, branch fallback after a child fails, all 4 `BacktrackingMode` combinations |
| `Test/human` | eat the first edible, unspoiled fruit (axioms + `not`), unwrap/peel |
| `include_demo` + `react_to_events`, `navigation_support`, `perception_common` | react to danger vs inspect an event, then move to an objective |
| other `Test/*` | lists, numerics, callterms, nested calls, overloads, recursion, negative literals: the language lab |

Each upstream demo needs:
- a world state, either loaded from `.worldstate` or editable with scene buttons;
- a generic executor for every abstract primitive: a timed step + capsule colour/label (+ a move when the primitive has a position);
- the plan shown as text, so the player can compare it with the expected plan.

Wanderer station (`src/examples/upstream/gallery/wanderer.ts`, host `WandererWorld`) follows the HTNDemo host
(`AIHTNDemoWandererAgent`, `DemoWanderer`, `AIHTNDemoPathfinder`, `AIHTNDemoGridTerrainDaemon`):
- one path request at a time: `request_path_from_to` writes `pathfind_state in_progress` during the decomposition;
  a request for another pair replaces the previous one and its facts. It finishes after |dx| + |dz| host updates:
  `succeeded`, or `failed` when either end is a blocked cell (then the plan falls back to `!wanderer_idle`);
- the world picks the next waypoint when the last walk segment reaches the destination; `!after_destination_comment`
  is a 0.05 s no-op. At an interactable (`look_at_view` at (15 0), `sit_on_bench` at (12 12)) the wanderer turns
  `contextual` with no destination; `!play_contextual_animation` lasts the interactable's usage time, then the next
  waypoint;
- the host times the steps: a segment its distance / 5.5 cells/s, `!say` 0.8 s, wait 0.15 s, idle 0.4 s, others
  0.05 s. Auto moves on after two journeys (or eight plans without one);
- not ported: A* and string pulling. The path is a straight line in up to 3 segments; blocked cells only fail a
  query that starts or ends on one, and the grid is not drawn.

## Language lab — `src/examples/upstream/lab.ts` (generated by `npm run htn:examples`)

| Pad | Domains |
|---|---|
| Lists | `atom_list_demo`, `runtime_lists` |
| Numbers | `numeric_expressions`, `negative_literals` |
| Callterms | `callterms`, `boolean_callterms`, `boolean_compatibility`, `missing_callterms` |
| Nested calls | `nested_calls`, `nested_operator_calls` |
| Axioms | `axiom_assignments`, `nested_axiom_choices`, `worldstate_lookup_scenarios` |
| Overloads & sharing | `axiom_overloads`, `method_overloads`, `shared_implementations`, `recursion_dispatch` |
| Docs & SDK examples | `Tutorial` (DOMAIN_LANGUAGE.md), `GuardNPC` (README), `AxiomIo` (AXIOM_OVERLOADS.md), `CoreConsumer`, `IntegrationConsumer`, `BridgeConsumer` (SDK/Examples) |
| CI smoke | `linux_smoke` (`cmake/LinuxSmoke`): `run` → `!selected 2` (the axiom backtracks past candidate 1), `no_plan`, `runtime_list 7` / `9` → `!result (target 7 8 (position 7))` |
| Hot reload | `HTNHotReloadDemo/Validation/Wanderer.domain`, revisions A and B (`src/examples/upstream/hot-reload.ts`) |

- A scenario is a planning call of a conformance case that runs on the case's initial world. Calls after a world
  edit in a scripted case are left out. The generator plans each one and drops any that differs from upstream.
- `worldstate_lookup_scenarios` has no upstream test, so its three scenarios are hand-written from the domain.
- Callterms are the conformance sets (`src/examples/upstream/conformance-callterms.ts`), the bindings of the
  upstream C++ tests.
- `linux_smoke` has no conformance case either: its four scenarios come from the upstream `cmake/LinuxSmoke/main.cpp`
  (world `candidate 1`, `candidate 2`; callterm `identity`).
- Hot reload follows `HTNHotReloadDemoSelfTest.cpp`. The generator compiles the validation template with
  `@REVISION@` replaced by `A` and `B` (its include read from `Domains/Includes`). It also records the compiler's
  diagnostic for the broken source `(:domain InvalidSource (unterminated`. The station walks the Wanderer on rev A.
  `Reload >` (and Auto, mid-walk) swaps in rev B, then the broken source, then A again. A swap keeps the world and
  the path host, drops the running step and replans, so the new plan starts with `!say "reload-validation-B"`. The
  deferred step then says `...-B-deferred`. The broken source does not compile, and the active revision stays.
- Not in the scene: `HTNDiagnosticTests` (domains that must fail to compile) and the inline compiler-error
  sources. They are covered by the compiler tests only.

## Canonical examples — `src/examples/canon/`

Published HTN examples adapted as executable teaching material. Their source and licence are recorded in
each domain header and in the notices below. Form: **paper prototypes**: no NPC body and
no scene level; a domain, world states each with the plan it must give, and stories that replay a run with a
scripted host (effects written when a step runs, run-time failures, outside events, replans; primitives only
logged). Every domain header says what it teaches, its source and licence, how it deviates and what was not
ported; copied code's notices: `src/examples/canon/THIRD_PARTY_NOTICES.md`. How to add one:
[Adding a canonical example](htn-guidance.md#adding-a-canonical-example); the format follows here.

**One format, one harness.** A *station* is a domain with scenarios: `<example>/<stem>.domain` and the folder
`<example>/worlds/<stem>/`. A *scenario* is one `.worldstate` file there, named `<n>_<what>.worldstate` (the file
stem is its name); its header says how to plan it and what it must give, in the lines `npm run htn:run` prints:

```
// <stem>: what the world shows (sensed facts are written out)
// method: <top-level method> [args...]
// expect: succeeded                 (or no_plan; `succeeded` with no steps: the empty plan)
//   1. !first_step arg
//   2. &deferred_step arg
```

A *story* is code: `<example>/stories.ts` holds the example's scripted host (`PaperHost`: the effects each executor
writes, a failure's leftovers, step durations, sensors) and its stories, registered in `src/examples/canon/index.ts`
(`CANON_STORIES`). A story plays on a stage (`src/examples/canon/paper.ts`): one agent (`story({...})`: a start
world, events, scripted failures, a stop rule) or several (a script calling `tick`, `run`, `event`, `matches`,
`show`); every decision is one trace line (`plan:`, `switch:`, `keep:`, `continue:`, `no plan (status)`,
`expand &x: ...`, `run`, `fail`, `event:`, `until: done`, `stop: N steps`, `<fact>: rows`, `world is <scenario>`,
agents prefixed `<id>: `) and the trace must equal the story's `expect`. `tools/htn/canon.ts` reads the catalogue;
`test/examples/canon/canon.test.ts` checks every scenario (also with branch backtracking off), every story, every
header and the executor lists in `htn-lint.json`; example-specific lessons sit next to it.

Run (from the scene folder), record, view:

```bash
npm run -s htn:run -- --list                                     # every station, scenario (expected plan) and story
npm run -s htn:run -- --world v3_rearm/2_rearm_at_the_oak        # a scenario: its own domain, method and expected plan
npm run -s htn:run -- --world v6_partial_plans/1_enemy_far_away --session /tmp/t.json && npm run htn:view -- /tmp/t.json
npm run -s htn:run -- --story v5_tired/the-recovery-survives-the-replan   # a story's trace; exit 1 if it differs
npm run -s htn:run -- --story swarm_coordinator/roles-as-facts-from-the-coordinator --session /tmp/s.json  # one session, every agent
```

### Bridge troll — `bridge_troll/` (Humphreys, Game AI Pro ch. 12, re-expressed; bevy_htn `troll.htn`, MIT)

A tutorial series: one domain per step, each file's header says what changed from the step before and why.

| Step | Domain (`be_troll`) | Teaches | Scenarios / stories |
|---|---|---|---|
| 1 | `v1_priority` | branch order is priority; unconditional fallback last | 4 / 2 (an enemy interrupts the patrol; the route) |
| 2 | `v2_attack_task` | a root branch delegates to a named compound task (`attack_enemy`: trunk or boulder) | 3 / 0 |
| 3 | `v3_rearm` | recursion with progress; without effect simulation the self-call is deferred (`&attack_enemy`); the direct form ends in `depth_exceeded` (test) | 4 / 1 (the trunk breaks, rearm) |
| 4 | `v4_last_seen` | a world change the plan does not make: walk, then `&regain_sight` decides on arrival (emulates expected effects) | 3 / 2 (found again; gone) |
| 5a | `v5_combo_bug` | BEFORE, a known bug: a replan during `!recover` combos into the whirlwind | 2 / 1 |
| 5b | `v5_tired` | AFTER: the reason as a fact (`tired`), first method of `attack_enemy` (re-entrant); the replan keeps `!recover` | 4 / 1 |
| 6 | `v6_partial_plans` | partial plans: `close_in` is one long step that ends the plan; `enemy_in_reach` tells before from after | 6 / 2 (walk, then swing; the knight flees) |

Not ported: MTR plan comparison (the host keeps a plan the planner would choose again instead), section 12.9's
two-planner upper/lower body and its non-blocking navigate, automated partial planning, sections 12.4–12.5's planner
internals and the plan runner's step-precondition monitoring (our substitute: an `active_plan` validator,
`basics/storekeeper.domain`), the figure-only SuperSlam / Taunt variant of section 12.4, Fluid Troll Bridge's human
domain (cited only).

### Classics — `classics/` (textbook and benchmark examples, golden plans from the sources)

| Example | Domain | Teaches | Source (licence) | Scenarios / stories |
|---|---|---|---|---|
| commuter | `commuter` (`travel ?person ?to`, `two_trips`) | already-there first method (empty plan); walk vs taxi by thresholds in order; re-entrant from inside a taxi, so a run-time failure (taxi breaks down) makes the replan pick the next way; a task list as `(travel) (&travel)` | GTPyhop `simple_htn.py`, `simple_htn_acting_error.py` (BSD-3-Clause-Clear) | 8 / 4: the source's expected plans (golden), the taxi that does not come, the breakdown, both taxis bad (no plan, where the source errors) |
| hunter | `hunter` (`hunt`) | a loop of one step per plan and `&hunt`; unguided search (`move` over free neighbours) moved to a host path sensor (`path_step`, nearest prey first), the body-shape choice kept (`slither`: short / long) | IPC 2020 HTN track, Snake (MIT) | 8 / 5: one story per source problem pb01–pb05; the source has no expected plans, so the tests check every executed step against its action preconditions and that no mouse is left |

### Crafting — `crafting/` (production chains)

| Example | Domain | Teaches | Source (licence) | Scenarios / stories |
|---|---|---|---|---|
| ore to gold | `ore_to_gold` (`earn_gold`) | a goal loop ordered from the stage nearest the goal back to the start (enough > sell > smelt > mine), `&earn_gold` after each stage; "go there, then do it" as a re-entrant task with an already-there first method and a deferred self-call; guards instead of fall-through by backtracking (test shows the source's unguarded shape needs `branches` mode) | bevy_htn `miner.htn` (MIT OR Apache-2.0, used under MIT) | 6 / 1 (three gold from nothing) |

### Space Station 14 (MIT) and RAE (BSD-3)

Every scenario plans the same under ALL and FACTS_AND_AXIOMS (as every canonical scenario): the roots carry a guard per
branch, so no plan relies on a failed subtree falling through to the next branch. SS14's own roots have no
conditions and rely on exactly that (fall-through works in our ALL / BRANCHES modes, not in FACTS_AND_AXIOMS /
NONE); `test/examples/canon/creatures.test.ts` shows the source's shape failing there. Fact and axiom backtracking
stay on: a domain-side filter over a best-first sensor list (`(patient ?p) (not (recently_treated ?p))`) needs it
(with NONE the medic sees only the first patient; a test shows it).

| Example | Files | Teaches | Scenarios / stories (tests) |
|---|---|---|---|
| Creatures (SS14 `mob.yml` roots) | `creatures/{mouse,grazer,pet_follower,hostile_mob}.domain` + `creatures/tiers/{reach,idle,follow,feed,melee}.domain` (`:include`) | 2–3 branch roots delegating to shared tiers; a guard axiom per root branch that also picks the target (`#feed_target`, `#melee_target`); re-entrant tiers (already in range, a running idle timer); host sensors publishing candidates best-first instead of utility operators; the melee fix-up ladder (one fix per plan) | 26 scenarios in `creatures/worlds/`; stories (`creatures/stories.ts`): mid-plan resume after a walk, leader walks off mid-loiter, replan mid-wait, the ladder down to the hit, attacked while grazing |
| Service bots (SS14 `medibot`, `cleanbot`, `firebot`, `hugbot`) | `service_bots/bot_base.domain` (`base`) + `service_bots/{medic,cleaner,fire,hug}_bot.domain` (`overrides`) | `base` / `overrides` as a template: the base owns `run_bot` and `serve` (announce, get in range, do the job), variants override the hooks (`job_target` axiom, `announce_approach`, `do_job`) and a constant (`approach_range`); a mark with a lifetime the host removes (`recently_treated`) filtering a best-first sensor list in the domain; speech with a cooldown from a timestamp fact; a run-time state switch as a fact (`tampered`), not a variant | 17 scenarios in `service_bots/worlds/`; stories (`service_bots/stories.ts`): two patients with lines on cooldown and a mark expiring, a fire bot replanned on its way, a cleaner working through a puddle list |
| Door helper (RAE `domain_nav.py`) | `door_helper/door_helper.domain` | four ordered methods for one task (door type x carrying) in the source's order; an unknown fact read as "could be either" and a run-time failure that writes the learned fact, so the replan takes the next method (RAE's retry without planner retries); claim / release a teammate as steps of the behaviour, an already-claimed branch so a replan keeps its helper; one hop per plan ending in a deferred `&fetch`; a collision event tier above the job. A 2-NPC level would need: two robots, one door, the route table, a door executor that shuts a spring door unless held, the helper planning its own walk and hold from a claim fact (not built) | 11 scenarios in `door_helper/worlds/door_helper/` (one fetch, hop by hop); stories (`door_helper/stories.ts`): a spring door learned by a failed pass and a teammate claimed and released, a collision pre-empting the job, waiting until a teammate is free |
| Fetcher (RAE `domain_fetch.py`) | `fetcher/fetcher.domain` | a search loop by deferred recursion (the plan ends at `!perceive`; `&fetch` reads what it found); a step that changes what a later condition reads ends the segment with `&` (`drop_load` before the emergency move); three recharge methods chosen by reasons in the world (`searching`, `round_trip`, a borrowed charger) instead of RAE's simulated choice; a battery margin (`can_reach`: the target and back to the charger); every compound re-entrant, so mid-plan resumes work; an emergency tier above the job | 14 scenarios in `fetcher/worlds/fetcher/`; stories (`fetcher/stories.ts`): a search that recharges and carries the charger, an emergency mid-search with the search resuming, a borrowed charger handed back |

### Industry slides, papers and games (Killzone, Decima, AIIDE papers, SimpleFPS, HDDLGym)

Their stories are scripts (a 5 Hz replan, a group planner feeding member planners, two villagers, plans side by
side): `<example>/stories.ts`, in the format above. `!continue` and `active_plan` are the paper host's (`continue:`
keeps the running plan; `ACTIVE_PLAN` in `paper.ts` writes and drops the bracket fact).

| Example | Source → licence | Teaches | Scenarios | Emulated |
|---|---|---|---|---|
| `sentry_turret/` | Killzone 2 slides, Killzone 3 (Game AI Pro ch. 29) → re-expressed; Space Station 14 `TurretCompound` (MIT, shape only) | continue branch beside its behaviour, `!begin_plan` / `!end_plan`, weapon by threat kind and range, host-ranked targets | 7 + a 5 Hz replan story | `!continue` and `active_plan` by the host |
| `swarm/` (`swarm_coordinator`, `swarm_drone`, include `swarm_shared`) | Decima talk 2024 / 2026 (swarm machine fragment) → re-expressed | group planner hands out roles as facts; 2-branch delegating root; a continue branch beside each behaviour; `!begin_plan` / `!end_plan`; axioms keep branches one line; lead hand-over only with the swarm gathered (double-negation axiom, shared include) | coordinator 4, drone 8 + a sequence: roles → member plans, continue, carrier, role change ends a follow, hand-over (story) | `!continue` and `active_plan` by the host; distances as host facts |
| `villager_day/` | Kelly, Botea, Koenig, AIIDE 2008 (NPC daily routines, JSHOP2) → re-expressed | needs as priority tiers (sleep, food, the shop's hours, money, pastime); "obtain food" by ordered alternatives with an "already done" first branch; never-idle fallback; two villagers synchronised through a fact (`keeper_present`); patience as a host counter; re-entrant `go_to` | 8 + a morning of two villagers, one plan per game hour (story) | effects over 24 h → one hour per replan, the host applies the hour; random action → host-rolled `pastime` |
| `arrest_team/` | SquadSmart (Gorniak, Davis, AIIDE 2007), fig. 1 SHOP code + fig. 2 domain graph → re-expressed | one planner for the squad; reservations that survive replans; bookkeeping steps vs member actions (SHOP `!!` vs `!`); a sync barrier; a role paired with its complement (restrain + cover) or alone; list recursion for the parties | 7 + plans running side by side over five ticks (story) | `!!reserve` / `!!free` / `!!global_block` → host steps `!reserve` / `!free` / `!wait_until_done`; `:sort-by` distance → host-sorted `near` rows; "restrained" sensed by the host |
| `infiltrator/` | SimpleFPS HTN (Soemers, HTN_Plan_Reuse, MIT, C++ task classes) → copied / adapted | strategy by what is in hand (stealth / ranged / melee); prerequisite tiers before the attack (heal, arm, open the way); a pickup ends the plan with `&behave`, or the item is passed on as a parameter; re-entrant move / lights / contact / cover | 8 + a fetch whose deferred `&behave` plans the attack with the gun just picked up (story) | costs → branch order; effects → `&behave` / parameters; sorted item lists and path queries → host facts |
| `soup_kitchen/` | HDDLGym Overcooked-AI HDDL (MIT, `overcooked_short_domain_with_collab.hddl`) → copied / adapted | a team plan over two cooks; one generic `!interact` plus an exchange-rule table (smart objects); alternatives ordered done / half done / solo / through the counter; future holdings passed as parameters; a deferred wait loop; one phase per planning run | 8 + a whole soup in a split kitchen, phase by phase (story) | effects → one phase per run and parameters; the `wait` action's effect → `&wait_cooking` expanded while the host cooks; HDDL method choice → branch order |

## Scope of the Swarm paper story

The coordinator/drone story demonstrates role assignment, commitment and interruption.
Its drone host implements grab and plan brackets, but does not execute release, navigation or automatic
coordinator updates. It does not establish a full collect-deliver-return cycle or all-agent progress.
Those need a shared execution host; the existing real-GuardAgent integration remains follow-up work.
