# HTN demonstration and repository tools

For installation in another scene, use the [module guide](src/htn-planner/README.md).
This page describes the full demonstration checkout; its debugger, examples and assets are intentional runtime content here.

## The playground

Level 12 **Ambush**, with the animated Krampus model and sound, starts in front of you when you enter.
It keeps its proximity trigger: walk toward the crossing in front of the light (within 13 m), or watch the blue
tester approach it, for Krampus to step out. It is initially off-stage.

The **Playgrounds** button on the right of the screen opens a list: levels 1-12, **Gallery** and **Language lab**.
A click spawns that playground in front of you, turned to face you and moved inside the scene if it would stick
out. One is spawned at a time: the next click replaces it, a click on the spawned one (marked *restart*)
restarts it where it stands, **Remove** takes it away.

Each playground is one line in `src/playgrounds.ts`: comment the line out and it is gone from the menu. Each
level is a file in `src/playground/levels`, each gallery station a file in `src/examples/upstream/gallery` (the
list: `gallery/index.ts`), each lab topic a line of `TOPICS` in `src/examples/upstream/lab.ts`. The spawner
(`src/spawn`) gives a playground a root entity placed and turned for it; everything it builds hangs under that
root, so a respawn leaves nothing behind.

Every level pad has:
- a **lesson sign** (front-left): what the domain shows, in three or four lines, and what to watch;
- an **NPC** coloured like the branch it is running, with the branch and the running step above it (level 8 has
  three);
- a blue **TESTER** bot that plays the visitor from a script and says what it is doing;
- the **board** (back): the planner panel and the auto-test panel; the lamp on top is green while every
  check passes, red when one failed;
- buttons: **Tester: pause/run**, **Reset level**, and the level's own controls.

The planner panel shows the domain and why it last replanned (`running plan kept` when the new plan was the
same as the running one, or none was found), the planning time and the steps done; **BRANCHES** of the top method, top to
bottom (`×` condition false, `✓` chosen, with the values it bound, `·` not checked), nested methods under the
chosen branch; **PLAN**: done steps, `▶` the running one, `&` deferred ones. The auto-test panel lists the
tester's checks (`✓` passed in so many seconds, `×` not within the limit, `●` waiting now).

| # | Level | Domain | The tester… |
|---|---|---|---|
| 1 | A plan is a list of steps | `basics/hello.domain` | watches the same 6 steps run, then a new plan |
| 2 | Branches: first match wins | `basics/lamp.domain` | switches the lamp off; then rain + lamp off: rain wins |
| 3 | Facts and variables | `basics/greeter.domain` | walks up (`?who=tester`), is greeted once, leaves, is forgotten |
| 4 | Methods call methods; `&` decides later | `basics/courier.domain` | drops 5 boxes: shelf_a fills, shelf_b, then "no room" |
| 5 | Senses change facts | `guard/guard.domain` | is seen: chase; runs out: investigate; stays: caught |
| 6 | Hearing: faint vs loud | `guard/guard.domain` | throws a pebble (listen), rings the bell (run there) |
| 7 | A full NPC: tiers of behaviours | `stalker/stalker.domain` | is noticed, hides in the hut (search, give up, leave); then is caught |
| 8 | A squad: one domain, three NPCs | `guard/guard.domain` | is chased by the one that sees it only; rings the bell: near ones run there, far ones listen |
| 9 | A crowd: ten guards, one domain | `guard/guard.domain` | walks into the middle (most chase at once), runs out, rings the bell |
| 10 | Is the running step still valid? | `basics/storekeeper.domain` | orders a crate, shuts the store door on the keeper's way (step rejected: "shut"), opens it (fetch again), walks off mid-carry (rest) |
| 11 | A squad planner gives the orders | `squad/yard_squad.domain` + `squad/yard_guard.domain` | walks in: the guard that sees it chases, the next holds the gate, the third flanks; sends a on a break: b takes the gate |
| 12 | An ambush: sight, light, smell, sound | `stalker/stalker.domain` | nears the light (it steps out, peers at the crossing), stands dark at 6.5 m (unseen), lights up (caught: the run fails), lights up in its far ring (it comes to look), throws a stone and crosses while it looks, follows it in the dark (smelled, caught) |

Level 7 has **Spawn: cross / stand / patrol / chase** and **Give up** buttons: a new stalker starts that way (walks
across and starts watching on the way; stands watching; patrols; has already noticed you) or gives up and walks
off. A Spawn button pauses the tester; **Reset level** brings back the patrol and the tester.

Level 9 runs ten guards on the yard loops (insets and directions differ; where on its loop each starts comes from
the level's seed): the frame you walk in, all that see you
replan at once. The board shows each NPC's planning ms and peak call frames; **Board: slowest NPC** shows the one
with the slowest plan. Its headless twin with 10 / 25 / 50 guards is the many-NPC part of `npm run htn:bench`.

Level 8 is three independent guards: three `GuardAgent`s on one domain, ticked by the level, with no squad planner
and no `GuardSquad`. Each NPC has its own planner, facts and plan, and none knows what the others saw (a real
`GuardSquad` whose squad planner gives the orders is level 11). Two guards walk the yard loop in opposite directions; the third drives a ready-made figure of
separate entities (robe, head, hat, lantern, as a composite places an NPC) through `possessEntityBody`, with the
mode sphere above it. **Board: next NPC** switches whose plan the board shows; **Noise at me** makes a 10 m noise
where you stand.

Level 10 checks the running step in the domain (`GuardAgentOptions.activePlan: 'active_plan'`, upstream
`docs/USE_CASES.md` section 1). The level never replans on a fact change; the agent publishes the running step as
`(running go_to store)` and plans `active_plan` on every tick it runs. One branch per action says what keeps it valid
(the walk to the store: a customer, an open door, empty hands), with no catch-all; no branch matches: the step is
cancelled mid-walk and `behave` planned at once. The board's `running step checked` line counts the checks and
names the last rejected step; the debugger's History tab has a `check` row, then the cancel and the replan.
**Store door** opens and shuts the store; stand at the counter to be served yourself.

Level 11 runs its three guards in a real `GuardSquad` with the `squad` option (upstream `docs/USE_CASES.md`
section 4). The squad planner (`squad/yard_squad.domain`) reads a snapshot the level writes on every update (the
roster, who is available, who spotted the intruder) and gives each guard a role with `(!order <guard> <role>)`;
each guard gets it as `(order <role>)` and its own planner (`squad/yard_guard.domain`) decides how to carry it out.
Calm: the first available guard holds the gate, the others patrol. Seen: the guard that saw you chases, the next one
holds the gate, the third flanks. **a: break / back** and **b: break / back** take a guard out of the snapshot: it
gets no order and sits on the bench, the next one takes its role. The snapshot key is who is available and who
spotted you, not positions, so the squad decides only when the situation changes; the board's **SQUAD** line shows
the roles and the last decision's reason. The squad adds no ECS system of its own (`system: false`): the level calls
`update(dt)`, in the scene and headless alike; the debugger lists the squad planner as a host of its own (its world
is the snapshot).

Level 12 is an ambush with the stalker domain unchanged, as a model with animations and sound (`assets/stalker`,
provenance in `assets/stalker/SOURCES.md`). It waits off-stage (`LevelSim.present`) until someone comes within 13 m
of the crossing in front of the light, steps out at the lane's dark east end, crosses, and walks a round A ↔ crossing
↔ B, looking around at each; at the crossing it always peers with its head toward where people come from (the
domain's `waypoint_face` / `!peer`, the body stays in profile). It sees in a 120° cone, as far as your light allows:
lit 9 m, shielded 7 m, dark 5 m (`TargetSample.visibility`); within 2.5 m it smells you, light or not, through
anything (`presenceRadius`). A light it glimpses between its sight and 12 m (the lure ring) sends it to look, as a
noise of its own, not to chase; a stone's knock and your footsteps (louder to its ears) send it to look too. Seen
is caught: its run (11 m/s) is faster than yours. Caught, the run fails: the one caught is back at the start, it is
gone, and the trigger re-arms only once nobody stands in it (no capture loop; the level cannot move you, so walk
back out). Past the lane (at the light) the run counts as passed: a later catch does not bring it out again.
Buttons: **Your light** (lit / shielded / dark), **Throw a stone**, **New run (arm)**, **Past the lane**. The model
follows what the domain does: the rig (`src/examples/stalker/stalker-rig.ts`, pure) turns the executors' asks into
a clip, a head angle (which also aims its sight), footfalls and voice cues; `stalker-model.ts` (ECS) plays the
clips, weights the three head poses, plays a step at each footfall of the walk and run clips and a line when it
hears something or starts a chase, all spatial `AudioSource`s on it. A recipe to copy: `docs/htn-guidance.md`.

Walk onto the pad to join in: its NPC sees you (inside the yard on 5, 6, 8 and 11), hears your footsteps, greets you on
3. Pause the tester to play alone. The same scripts run headless in `test/playground/levels.test.ts`, six rounds
each, and no check may fail in any round; `npm run htn:level -- <id or number>` runs one from a terminal and prints
its checks with their sim times. A level is deterministic: time is only the dt it is stepped with, random numbers
only its seeded `rng` (`init(seed)`, `reset(seed)`), so the same seed gives the same run.

**Gallery: upstream examples.** Ten pads, one upstream example domain each: AAA Combat NPC, Wanderer,
Grunt/Ninja/Elite, Complex scenario, Builtin comparisons, Runtime backtracking, Hierarchical backtracking,
Backtracking policy, Human and Include demo.
- Each pad plays its scenarios by itself (two runs each); **Auto: on/off** stops that for every pad.
- **Scenario >** loads the next world state, or a variant that changes the plan.
- **Mode >** (backtracking pads) cycles ALL / FACTS_AND_AXIOMS / BRANCHES / NONE.
- Capsule colours: orange, a timed step; blue, walking to the named waypoint; red, no plan.
- The Wanderer runs upstream's asynchronous path query: a host-side query moves from requested to in progress
  to succeeded, then the Wanderer walks the segments and picks the next destination.
- Over each capsule: the scenario, the status, and `✓ as expected` when the first plan matches the catalog
  plan (or upstream's, for the lab).

**Language lab.** Nine pads with every remaining upstream example: the 17 language-feature test
domains (`Domains/Test`), the domains from upstream's README, language docs and SDK consumers
(`src/examples/upstream/docs`), the CI smoke domain and the hot reload test domain.
- Topics: Lists, Numbers, Callterms, Nested calls, Axioms, Overloads & sharing, Docs & SDK examples, CI smoke,
  Hot reload.
- 265 scenarios, taken from the conformance cases (`test/htn/conformance/cases`) and, for CI smoke, from
  upstream's `cmake/LinuxSmoke/main.cpp`. Each keeps upstream's world, host values, callterm set and expected
  plan or status, so red pads are often the expected result (`no_plan`, `invalid_call`).
- **Scenario >** steps through the cases; **Domain >** jumps to the next domain of the topic.
- **Hot reload** follows upstream's `HTNHotReloadDemo` self-test. The Wanderer walks with revision A of the
  validation domain. **Reload >** swaps in revision B, then a source that does not compile, then A again,
  on the same world: the running step is dropped and the new plan says `reload-validation-B`; the broken
  source shows its compile error and the active revision keeps running. With Auto on, it reloads by itself
  mid-walk.

## The HTN debugger

The **HTN debugger** button (bottom right) opens a panel over the scene; click it again or `×` to close. It reads
the planners of the spawned playground: the level NPCs, the gallery and lab stations (they record their plans only
while the panel is open). On the left, the hosts with what each is doing; on top, the selected one's state, plan
count, mean planning time (the Explorer's clock moves in 1 ms steps, so a single plan reads `<1 ms`), the running
step and why it last planned.
- **Time:** **Pause** stops every planner host of the scene (nothing senses, plans or moves; the panel stays live, so
  every tab can be read), **▶ Run** goes on, **Step** pauses and runs one frame of 1/30 s, **×0.1 … ×4** scale the
  simulated time (upstream HTNDemo's NPC Simulation toolbar). The time left of them is the simulated time. One
  simulation clock (`sceneClock()` in the library) drives the playground's system, GuardSquad's own system and the
  player noise bus; planning times stay wall-clock.
- **Pick an NPC:** click its body in the scene (the hover says `HTN debugger: <name>`) or its row in the list; that
  locks it (**locked**). Unlocked (**follow nearest**), the panel follows the host nearest to you. Clicking a row
  of its tree, or Prev / Next, locks it too.
- **Plan:** the last decomposition as upstream's debugger shows it. **Normal** folds retries and lists a fact's
  matches as choice rows, **Verbose** shows every node. `✓` chosen, `×` failed, orange `×` abandoned (its condition
  held, a task below failed), `↺` retry, `·` not reached. **?x=value** puts the bound values in the rows. Click a row
  to watch its variables **Before / After** (a failed fact also lists the rows it was checked against) and **why**
  it ended so: a method row lists every branch (`×` with its first failing term, `✓` chosen, `·` not reached
  behind the chosen one), a branch row its failing terms per binding with the row it needed against the world's
  rows (`no row matches (door_open store); … closest (door_open back): arg 1 is back, not store`), an abandoned one
  the task that failed and why its method had no branch. **◀ Prev /
  Next ▶** step through the kept runs, **Newest** follows the live one again. Above the tree: the plan strip (done,
  `▶` running, next), the path from the root to the running step, **Why** the shown run was planned (what asked for
  the replan, how long it waited for the throttle or the shared budget, the facts the domain reads that changed
  since the replan before, and whether that gave a new plan, the same plan or kept the running one) and **Now**:
  whether the facts the run's chosen path rests on still hold in the NPC's world (`✓ all 5 facts it rests on still
  hold`, or `× 1 of 5 no longer hold: run.visible_combat gone: no (visible_enemy 1 202) now; …`), re-checked when
  the panel refreshes.
- **World:** the facts the shown run planned against, `+` / `−` / `~` against the run before; **changed only**
  hides the rest.
- **Domain:** the domain as a graph around one method (click a method to refocus, **run root** to go back), or
  **Full**; green: what the shown run chose, red: branches it tried that failed. `−` / `+` zoom; scroll to pan.
- **History:** the host's events, newest first: replans with their reason and outcome (`same plan`, `N steps`,
  `running plan kept`) and `Δ +fact −fact` for the facts that changed since the replan before, steps and how they
  ended, what it sensed. Click a replan to open the run it made in Plan. Identical events in a row (an NPC retrying a plan every
  tick) are one row, `×N` with the first and last time.
- **Map:** the spawned playground from above (a level's pad with its props, a zone's pads): a dot per NPC in its
  mode's colour (patrol green, alert yellow, investigate violet, chase red; a station's walk blue, step orange, no
  plan red) with a nose where it looks and its running step under it, a dotted line to where that step goes, the
  selected one's route through its plan's positions in cyan, numbered; the tester and you. Click a dot to select
  that NPC (as clicking its body).
- **Domain Runner:** pick a domain, a top-level method, a world state (a gallery or lab scenario, a copy of the
  selected NPC's world, or an empty one) and a backtracking mode, then **Run planner**: it plans once on a fresh
  copy of that world (a live world is never touched), shows Success / Failure, the time, the plan, and whether it is
  the plan the scenario expects, with the same tree and watch. **World tab ›** / **Domain tab ›** show its result
  in those tabs. The same runner in a terminal: `npm run htn:run` (below, "Develop").

- **In the world, without the panel:** the **NPC overlay** button (above **HTN debugger**), the panel's
  **overlay** button or key **1** cycle everyone's overlay **off → step → full**. Step: the running step above each
  NPC in its mode's colour, a line on the ground to where it goes and a disc there. Full: also its name and mode,
  root method → chosen branch, and why it last planned (`why: perception: now sees tester · +target_visible`: the
  trigger, the reason, the facts that changed; the trigger said once when the reason is the same word, `why:
  debug`; the clock and position the agent writes every tick are not listed); the NPC selected in the panel also shows its route in cyan.
- **Sense gizmos:** at full, every NPC that perceives (all levels) shows on the ground what it senses: its sight
  cone where its head looks, out to the range its targets' light allows now (a light going out shrinks it), its
  presence (smell) radius as a faint disc, a level's extra arcs (level 12's lure ring, yellow), and the last noise
  it heard as a faint disc of that noise's radius for 3 s. The cone's colour: light blue calm, orange a target in
  sight not yet detected, red seen, purple smelled. The NPC selected in the panel shows its gizmo at step too. An
  NPC whose domain reads no sight fact draws none; about 10 entities a guard (17 on level 12).
- **Keys on an NPC:** point at its body; the hover shows its running step and lists the keys. Scenes get only the
  Explorer's fixed inputs, so these are the free ones that are not movement:

  | Key | Input | Does |
  |---|---|---|
  | click | `IA_POINTER` | select and lock it in the panel |
  | E | `IA_PRIMARY` | open the panel on it (again: close) |
  | F | `IA_SECONDARY` | replan it now (trigger `debug`) |
  | 1 | `IA_ACTION_3` | its own overlay level off → step → full (pointing at nothing: everyone's) |
  | 2 | `IA_ACTION_4` | pause / run every planner host while the debugger panel is open (also pointing at nothing) |
  | 3 | `IA_ACTION_5` | step one frame, paused, while the debugger panel is open (also pointing at nothing) |
  | 4 | `IA_ACTION_6` | log its goal, why, plan, steps done and world to the console (`[htn-debug]`) |

The line under the panel: the hosts, their plans, steps done and total planning time (upstream's toolbar line), then
the panel's own cost (scene FPS, rebuild time and count, UI entities) and the overlay's level and entities. How to read a trace and interpret its cost: `docs/htn-guidance.md`; level measurements and their limits:
`docs/htn-level-metrics.md`.

**Session viewer (offline, in a browser).** The panel is the live, close-up view. For the figure a talk or a review
needs, record a session and open it as one HTML page: `npm run htn:level -- orders --rounds 3 --seconds 60 --session
orders.json` (every plan of every NPC and of the squad planner) or `npm run htn:run -- ... --session run.json` (one
plan), then `npm run htn:view -- orders.json --open`. The page draws a timeline per agent (plans, steps, ◆ replans
with their reason, × failures; drag to scrub, ← → between replans, Space replays), the run at the cursor as a
refinement tree (each branch tried as a card with its precondition and the values bound; failures folded to
"× N attempts"; Normal / Verbose) or over the domain's AND/OR map (focus one task or the whole domain), its plan done /
running / upcoming, why it planned with the diff against the plan it replaced, and the world (+ / − / ~ against the
one before, ● the rows the plan rests on). No server, no network; drop another session JSON on the page to open it.
For an AI agent, `npm run -s htn:view -- orders.json --text` prints the same as a short plain-text report.

## Develop

```bash
npm install
npm run htn:ci           # complete scene CI checks on Windows, macOS or Linux (Node 22+); stops at the first failure
npm test                 # headless: planner, compiler, conformance, agents, playground scripts, gallery and lab plans, scene smoke tests;
                         # fails if a committed *.htn.ts / *.facts.ts differs from its source, naming the command to regenerate it,
                         # or if the planner's structural counters differ from benchmarks/counters.baseline.json (the perf gate)
npm run typecheck:tools  # tools + tests against Node types, the viewer page against the DOM
npm run build            # scene typecheck + bundle
npm run htn:examples     # regenerate src/examples/upstream/generated (gallery + lab) from test/htn/fixtures/upstream
npm run htn:golden       # rebuild upstream (aec08fa) in WSL / Linux with g++ and rewrite test/fixtures/upstream-golden
                         # (its reference plans for the gallery and lab); -- --export-only: only the manifest and worlds
npm run htn:compile -- --check src/examples/guard/guard.domain   # validate one root and its includes, write nothing
npm run -s htn:lint -- src/examples [--json] [--strict]   # domain-shape lint in layers (compile, symbols, structure): per
                         # finding the rule, place, why and fix; shape metrics per domain (docs/htn-lint.md); config
                         # htn-lint.json; -- --update-baseline after a deliberate change (test/tools/htn-lint.baseline.json)
npm run htn:bench        # planner benchmark + many-NPC load, bytes per plan, NPCs per ms of frame (about 25 s);
                         # -- --out benchmarks/main_benchmark.txt --json benchmarks/main_benchmark.json (5 repeats, ~2 min)
npm run htn:bench -- --compare benchmarks/main_benchmark.json   # same machine only: exit 1 on a timing / bytes
                         # regression over --threshold 10 (%) beyond the noise of the repeats
npm run htn:bench -- --update-counters   # accept a deliberate change of the counter gate (commit the baseline)
npm run htn:level -- crowd --seed 3   # a playground level headless: its checks with sim times, a line per NPC;
                         # -- --list, --rounds N, --seconds S, --dt 1/60, --verbose (event history), --json; exit 0 / 1 / 2
                         # --session out.json: every run, world and event of every NPC (and squad planner) as a DebugSession
npm run htn:level -- 11 --ablate all --seed 1-5 --rounds 3 --stagger 5   # outcome metrics (--metrics) of the level and of each
                         # ablation (the same level, one parameter changed), means over seeds: docs/htn-level-metrics.md
npm run htn:view -- out.json [--out page.html] [--open]   # the session viewer: one offline HTML page (tools/viewer)
npm run -s htn:view -- out.json --text   # the same session as a plain-text report (for an AI agent): a line per replan,
                         # the last and failed runs as tree outlines with plan and world; --agent, --run a:7, --at 12.5,
                         # --verbose, --max-lines N, --json
npm run start
```

**Domain Runner in a terminal** (`tools/htn/run.ts`, the tab's code): compiles a domain in memory and plans once.

```bash
npm run -s htn:run -- my.domain [method] [args...] --world <file.worldstate | scenario id | empty>
  # --mode ALL|FACTS_AND_AXIOMS|BRANCHES|NONE  -v (Verbose tree, every failed branch)  --json  --session out.json
  # --max-passes N (expand deferred & steps)  --callterms <set>  --repeats N
  # --why <name> (repeatable): why a branch (method.branch), method or !primitive is not in the plan
npm run -s htn:run -- --list [my.domain]   # top-level methods, scenario ids, callterm sets
npm run -s htn:run -- --world hierarchical/fact-backtracking -v   # a scenario on its own domain
```

It prints `status:`, `ms:`, the plan one step per line, the tree as the Plan tab shows it, the failed branches with
the condition that failed, what planning wrote to the world and the diagnostics. Exit 0 plan found, 1 no plan, 2
usage or compile error (printed as `htn:compile --check` prints it). `--session` writes a `DebugSession`
(`parseSession` loads it). `--why critical_retreat` answers "why not": the failing condition per attempted binding
with the row it needed vs the world's rows, "never reached: an earlier branch succeeded (combat_tick.melee)", a
method never decomposed with why its callers were not taken, or "not in the domain" with names alike (`--json`:
the `why` field).

`npm run htn:ci` is the same complete check locally and in CI. It checks redistribution notices and SDK publish
inclusion, runs the headless tests (including generated-module freshness), checks scene, tools/tests and viewer types,
compiles every `top_level_domain` under `src` through its includes, lints `src`, and checks `active_plan` methods.
Ordinary lint shape warnings remain informational; every `check-method-*` diagnostic fails the strict `active_plan`
pass. Root and method discovery parses declarations, including methods from included/base modules; comments and strings
do not select roots or methods. All commands and paths belong to this scene: a standalone copy needs only `npm install`
and `npm run htn:ci`, with no parent repository or shell utilities. Do not run two test commands concurrently in the
same copy: the test runner recreates `.test-build`.

GitHub discovers workflows only in the repository-root `.github/workflows`. The small
`htn-planner-tests.yml` launcher there installs Node/dependencies and calls `npm run htn:ci`; it is the hosting exception,
not a game runtime dependency. Its filters select these events:

| Event/change | HTN workflow selected |
| --- | --- |
| Pull request changing only another scene | No |
| Pull request changing HTN `src`, docs, scripts, or any other scene-local file | Yes |
| Pull request changing the HTN launcher itself | Yes |
| Push to `main` with HTN or launcher changes | Yes |
| Push to another branch | No (use its pull request or manual dispatch) |
| Manual `workflow_dispatch` | Yes |

Do not make this filtered workflow a globally required check: a skipped required check can leave an unrelated pull
request pending. GitHub path filtering has rare limits: a large diff can miss a matching file beyond the
filter window; a push over 1,000 commits or a diff-generation timeout runs workflows regardless of path filters. See
[GitHub trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
and [workflow location](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).
The table describes the configured selection rules; local checks do not establish a hosted Actions run.

## How to test

World `sdk7testscenes.dcl.eth` on `.zone`, position `96,-11`. Switch MetaMask to SEPOLIA, then use either link:
- `http://decentraland.zone/jump/?dclenv=zone&realm=sdk7testscenes.dcl.eth&position=96,-11`
- `decentraland://?dclenv=zone&realm=sdk7testscenes.dcl.eth&position=96,-11`

You spawn in the middle of the scene, facing north, with **12 Ambush** already started in front of you.
Approach its crossing to trigger Krampus, or watch the tester. Open **Playgrounds** (right of the screen) to
switch levels, restart Ambush, or remove it.

1. Levels 1-9: spawn each one and stand in front of the pad for a round of its tester script (about a minute;
   level 7 about two). Every check on the board turns `✓` and the lamp on top stays green. A red `×` names the
   check that failed. Click the spawned level again: it restarts in place. Turn and spawn another: it appears
   in front of you, and the first one is gone.
2. On a few levels, pause the tester and play its part: switch the lamp off (2), walk up to the greeter (3),
   add boxes (4), step into the yard (5), ring the bell (6), let the stalker see you, then hide in the hut (7).
   The BRANCHES list must follow you.
3. Level 7: press each **Spawn** button and **Give up** while it chases you. Level 8: step into the yard and
   check that only the guard that sees you chases; press **Board: next NPC**; watch the figure (robe, hat,
   lantern) turn and walk as one piece.
4. Gallery and Language lab: every label says `✓ as expected` while the pads cycle their scenarios. On **Hot reload**,
   press **Reload >** while it walks: the label says which revision is active and that the world was kept. On
   the backtracking pads press **Mode >**: for example, *hierarchical branches* fails (red) under NONE.
5. Level 9: press **NPC overlay** twice (full): every guard has its step, goal and why above it, a line to its
   target and its sight cone on the ground. Point at a guard: the hover lists E, F, 1-4. Press 1 on it (only its label changes), 2 (everything stops,
   the labels stay), 3 (one frame), 2 again, 4 (its state in the console), E (the panel opens on it).
6. Level 12 (headphones): stand off the way (a front corner) for a round, about two and a half minutes; all 22 checks
   turn `✓`. The stalker is a model, not a capsule: it walks and runs with its clips, its head turns at the crossing,
   its steps sound from its feet in time with them, it says a line when the stone lands and when it starts a chase.
   With **NPC overlay** at full, its cone shrinks when the tester's light goes out, turns red when it sees, and the
   yellow lure ring shows while a light is around. Then pause the tester and play: **Your light** to lit, walk
   towards the light (it steps out), let it see you (caught: walk back out of the trigger before it comes again);
   dark, follow it closely (it smells you); **Throw a stone** and cross while it looks.
