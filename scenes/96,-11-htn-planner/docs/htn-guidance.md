# Working with the HTN planner — guidance

How to build NPCs on this planner: host integration, domain design, tools and performance.
Language and host semantics follow [urosidoki/htn_planner 2.4.0](https://github.com/urosidoki/htn_planner/tree/aec08fa36f2c521c4da00c045bf23b8aed7bfa92),
especially `docs/DOMAIN_LANGUAGE.md`, `docs/USE_CASES.md` and `docs/GENERATED_RECURSION.md`.
Examples and measurements below describe this port and their stated test conditions.
Read the [planner limitations](../src/htn-planner/htn/README.md#planner-limitations)
before adapting it to another game. Start integration with the [manual copy setup](../src/htn-planner/README.md#install-by-copying),
including the compiler for normal `.domain` authoring; the automated installer is an alternative.

## The split: planner vs host

- The planner only plans. It gives a plan and a cursor: `plan / resolve / current / complete / clear`
  (`PlanRunner`, upstream `HTNPlanningUnit`). The host owns everything else: when to replan, what to cancel,
  executing steps, writing facts, budgets. Upstream README: "the engine owns action dispatch, replanning policy,
  scheduling and world-state updates".
- For an unexpected replan, check both the domain's guards and the host's fact writers, triggers and cancellation
  (`src/htn-planner/npc/agent.ts`). A correct plan alone does not establish a correct executor lifecycle.

## World state and facts

For automatic fixture and paper-host consistency checks, see [world invariants](htn-world-invariants.md).
These opt-in checks run in test tooling; production planning does not infer or enforce them.

- **Represent state needed for decisions, continuation and re-entry.** Visual changes or executor-internal state
  need no planner fact unless a decision depends on them. Incident (2026-10-14): the courier picked up a box
  (`carrying` lived only in the level code), a replan cut the carry, and every new plan started with `!pick_up`,
  which failed forever.
- **The assigned executor or sensor updates those facts after the change**, before a replan or deferred step reads
  them. Domains have no effects; if `!set_waypoint` changes the waypoint but its writer leaves `current_waypoint`
  stale, the same plan repeats forever.
- **Facts are keyed by name and arity.** A typo or a wrong arity silently matches nothing and the branch just never
  fires. Compare what you write with `DomainIR.facts` of the compiled domain. Upstream 2.4.0 rejects writes to
  facts the domain does not reference; our `WorldState` stores them. Use `checkFacts()` for dev checks;
  a `PlanRunner` reports wrong-arity tables once as `fact_arity_mismatch`.
- **"The state after step N" is a deferred task** (`&x`): it is decomposed when the runner reaches it, against the
  world as it is then. Use it when a later decision needs the result of an earlier action;
  `src/examples/canon/infiltrator/infiltrator.domain` demonstrates this.
- **Primitive effects are not simulated during decomposition.** A primitive in the plan is output, not an action (USE_CASES:
  "producing them does not perform an action"), so every method of the same decomposition, also one that comes
  after that primitive, reads the facts as they were when planning began. A sub-method that runs after an
  in-plan change (a pot started earlier in the same plan) still sees the old facts: an idle pot. Pass what the
  plan did as a parameter, e.g. `(use_cooking_time ?inp_order ?inp_cooking)` with `?inp_cooking` set by the
  branch that starts the pot; or make the sub-method deferred (`&`) when it must see the world after the step ran
  (DOMAIN_LANGUAGE "Deferred decomposition": the body "can inspect the world state as it exists then"). By
  design, upstream too. This assumes read-only callterms: explicit mutating callterms write immediately
  and their writes survive backtracking. Both planning patterns appear in one example: `src/examples/canon/infiltrator/infiltrator.domain` passes a fetched
  medikit on to `!use_medikit` as a parameter, and ends a weapon or keycard fetch with `&behave`.
- **Never delete facts during decomposition.** Callterms are not undone on backtracking (USE_CASES).

## Replanning (host policy)

- **Replan only on changes the domain can see.** A replan triggered by a fact the domain never reads only cuts the
  running plan. Our agent replans on sight / hearing only if `DomainIR.facts` has `target_visible`, `last_seen`,
  `heard_noise` or `alert` (commit 6d5b86c). A domain with callterms gets every trigger, since a callterm may read
  anything. The same goes for gates: "no noise replan during a chase" applies only if the domain reads
  `target_visible`.
- **Do not sense what the domain cannot read.** Upstream's world state refuses facts the domain does not reference
  (`HTNWorldState::WriteFact`), so a host gains nothing by publishing them; skip the sensing work too (line-of-sight
  rays, hearing) and keep the body's mode honest (an NPC that cannot see shows no chase). Derive "what the domain
  reads" from the domain the runner holds now, not once at creation: a hot reload or an adopted candidate runner may
  bring another one. When a sense switches off, clear what it wrote, or stale facts and a stuck mode stay. A host
  hook that derives its own facts from sight (`syncFacts`) needs a domain that reads the base sight facts.
- **A replan should not cancel the running step by itself.** Upstream pattern (USE_CASES 2): plan a candidate in a
  separate planning unit on the same world; if it is equivalent to the running plan, keep the step, the plan index
  and the step's progress; cancel and adopt only when they differ. Our agent does this (`GuardAgent`, two runners
  that swap roles on adoption).
- **Never plan into the runner whose plan is running.** `plan()` replaces its plan, even when it finds nothing
  (USE_CASES: "decomposition replaces that unit's result"). Plan into a second runner and swap on adoption.
- **Define equivalence on what the executor acts on**: action identity, targets, arguments (USE_CASES). Our agent
  compares the candidate's steps with the rest of the running plan from its current step, by name and arguments
  (deferred steps too); a candidate that starts with a deferred step is expanded first, because the running plan
  has expanded its own. Arguments compare exactly, so a step whose argument jitters (a live position) never
  matches and restarts on every trigger: pass a target id and read the live position in the executor (`!chase`).
- **A kept plan is still a planning, but not a new plan.** Count it (planning time, plans made), but do not reset
  per-plan views such as the done steps; our `replan` event says `kept: true`.
- **Re-check the running plan in the domain, not in host code.** Upstream pattern: a separate top-level method
  `active_plan` answers "is the running plan still valid?", next to `behave` (full replan) and `reasoning` (update
  beliefs). Do not give `active_plan` an unconditional fallback branch: it would accept an invalid plan. Our agent:
  `activePlan: 'active_plan'`; a failed check cancels the step even when `behave` would plan the same again.
- **Decide what happens when there is no plan**: keep the current action or stop. Upstream asks the host to choose
  explicitly. Our agent: `onNoPlan` 'keep' (default) lets a running plan go on, since a trigger replan only asks
  whether something better exists and "nothing" is no reason to stop mid-step; 'cancel' stops it. With nothing
  running it retries on the next tick, as upstream ("retrying next update"): no cooldown, so a branch that opens
  (time, a fact) is taken on the tick it does. One planner call per tick per stuck NPC: budget a crowd per frame.
- **A successful empty plan is not a failure**: the domain says "nothing to do", often after a callterm changed the
  world. Re-publish the facts and plan again at once, with a small budget of passes per tick (upstream HTNDemo: 4)
  so a domain that never gets past an empty plan cannot spin. Our agent: `maxPlanningPasses`, `syncFacts` between
  passes. Example: a goal task whose first method is "already done", `already_there` in
  [classics/commuter.domain](../src/examples/canon/classics/commuter.domain).
- **Throttle trigger replans, not retries** and avoid flip-flopping between two close branches: keep the current
  one unless a new one clearly wins (Transformers: Fall of Cybertron). Our agent: `replanThrottle` (default 0, as upstream; set 0.25 s if a trigger flickers) paces
  perception / hearing / fact-change replans; a no-plan retry, a completed plan or a failed step replans at once.
  In the domain the same is a **continue branch** next to the behaviour it guards (next item).
- **Continue branches: the domain says "keep the running plan"** (Killzone 2, Decima; our agent:
  `continueTask: '!continue'`, opt-in). A branch whose only task is `(!continue)` sits directly above the behaviour
  branch it guards. Its condition says that this behaviour is the one running and is still worth doing. When a
  replan plans exactly `(!continue)`, the agent keeps the running plan. The running step goes on with its progress
  (no restart, no cue replays), and the replan event says `kept` and `continued` (`htn:view` and the History tab:
  "running plan continued"). The planner knows nothing of it: `!continue`, `!begin_plan` and `!end_plan` are ordinary
  primitives (upstream DOMAIN_LANGUAGE), and the agent gives them meaning only with the option on.
  - **What the domain reads.** There are two facts, both written by the agent:
    - `(running <action> <arguments>...)`: the running step. It is the running-plan check's fact (`activePlan`),
      published with either option. Use it for a behaviour that is one long step (`!chase ?t`, `!attack ?t`).
    - `(active_plan <name> <arguments>...)`: the running plan. Written by a `(!begin_plan <name> <arguments>...)` step
      and cleared by `(!end_plan)`. Use it for a behaviour of several steps (Decima: hover, then grab). The agent also
      clears it whenever the plan is dropped (a new plan adopted, the plan done or failed, a reload, a stop), so it
      never names an old plan.
  - **How to write one**, named `continue_<behaviour>`, directly above its behaviour:
    ```lisp
    (continue_chase
        (and (running chase ?target) (target_visible ?target ?any_position))
        ((!continue)))
    // htn-lint-disable-next-line order-dependent -- a behaviour below its continue branch: that order is the point
    (chase_visible_target ...)
    ```
    The condition reads the fact for what runs, plus the reason it is still worth doing (the target still in sight).
    The fact alone would keep a plan that has gone wrong. Branches above the continue branch still win, so its
    position is its priority. `htn:lint` reports the behaviour below it as `order-dependent` (info). That order is
    the point, so suppress it with the reason, as above.
  - **Mistakes it forgives.** A `(!continue)` plan with nothing running, or `!continue` inside a longer plan, keeps
    nothing. The step idles one tick (diagnostic `continue_idle`, once); it is never an error. Guard the branch with
    the fact, and it cannot hold before a plan runs.
  - **Continue branch or `activePlan`?** They answer different questions and combine:
    - `activePlan` asks every tick "is the running step still valid?". A failure cancels it at once (a door shut
      mid-walk). It never stops a switch to another plan: a trigger replan still adopts a different candidate.
    - A continue branch answers a replan with "nothing better than what runs". It stops twitch: the nearest target
      changed, or a lower branch now also holds. It does not stop an invalid step; the executor or `activePlan`
      does that.
  - **When to use one**: compare responsiveness and plan stability with an ablation; the measurements:
    [htn-level-metrics.md](htn-level-metrics.md#continue-branches-guardagentoptionscontinuetask).
  - Examples: the sentry turret keeps its running attack when sensors rank another threat first. Its canonical
    story uses a paper host; [real-host integration tests](../test/playground/continue-canon.test.ts) separately run
    turret/drone domains through `LevelSim` → `GuardAgent` with deterministic timed/effect executors and on/off
    `continueTask` ablations. They check progress, interruptions and cleanup, with fixture-fed swarm roles. They
    do not establish production SDK executors, a full coordinator loop or Explorer behaviour. The smaller agent
    tests remain in `test/npc/continue.test.ts`.
- **Replanning on your own effects can skip pauses** (a combo skipped its recovery). Represent the
  recovery state in facts and guard it explicitly, rather than relying only on branch order.
- **Irreversible actions only after a plan is chosen**, never inside conditions or callterms (USE_CASES).

## Domain design

Start with the installed [small-domain recipe](../src/htn-planner/HOW-TO.md#6-design-and-check-a-small-domain):
strategy → facts and writers → ordered guards → executors → independent cases and recovery. It needs no AI skill.
The rules below are defaults with a purpose, not branch-count or depth quotas.

- Keep the root readable; group related behaviours into named tasks where that removes complexity.
  Branch order expresses priority. Guard entry conditions and document who writes each fact.
- Put belief upkeep in the host or a wired `reasoning` method; make every pass progress towards completion.
- Handle applicable partial/completed states when a task can be re-entered. Share repeated task tails and
  conditions where this reduces duplication; preserve independent teaching fixtures when intentional.
- Define expected decisions before running scenarios. Check execution and recovery over time as well as
  plan shape; the [canonical examples](htn-examples-catalog.md#canonical-examples--srcexamplescanon)
  provide executable scenarios and host stories. Lint thresholds are review prompts, not design laws.
- A branch condition commits once selected: a later task failure does not reopen its fact choices. Only the
  `branches` backtracking mode tries the next branch.
- Recursion depth is limited like upstream's: `maxDepth` 8192 call frames, two per method level, one per running
  task. A method that selected its last branch keeps its frames until the plan ends, so a recursion step that calls
  such a method costs four frames, not two (1000 idle entities in complex_scenario peak at 3843). Axioms are free.
  Check the measured peak before increasing `maxDepth`. A loop that plans one step and defers the rest
  (`(step) (&loop)`) starts a new bounded decomposition at each `&`, rather than accumulating recursive frames ([classics/hunter.domain](../src/examples/canon/classics/hunter.domain),
  `&hunt` after every move).
- A fact whose variables are all bound at that point (method parameters, `?inp_` axiom parameters, variables
  bound earlier in the `and` or by every `or`/`alt` child) or `?any_` has one solution: duplicate rows do not
  rerun the rest of the condition. A fact that binds a variable has one solution per matching row, duplicates
  included. The rule is static, as upstream's: a variable bound by only one `or` child counts as unbound.
- **No arithmetic as a fact or `split_list` argument**: `(pair (+ ?x 1) ?y)` is a compile error
  (`arithmetic-argument`, as upstream's code generator). Assign it first: `(= ?next (+ ?x 1)) (pair ?next ?y)`.
  Calls and runtime lists are fine there (`(pair (call next ?x) ?y)`, `(pair (?x 1) ?y)`).
- **`?any_` is a discard, for fact arguments only** (DOMAIN_LANGUAGE: "a discarded fact argument"). Passed as
  an axiom `?out_` / `?io_` argument, e.g. `(#nearest free_counter ?p ?u ?c ?any_moves)`, it is a compile error
  (`discard-consumed`, as upstream's code generator): name the variable normally (`?moves`) even if nothing reads
  it. In tasks, calls, comparisons, assignments and `split_list` the compiler rejects a discard too. As an axiom
  `?inp_` argument it is an unbound input: a body fact that reads it matches nothing.

### Worked example: a soup in a split kitchen

Read [the domain](../src/examples/canon/soup_kitchen/soup_kitchen.domain),
[worlds](../src/examples/canon/soup_kitchen/worlds/soup_kitchen/) and
[host story](../src/examples/canon/soup_kitchen/stories.ts) together. This is **one team plan** whose steps name a cook,
with one shared world. It is an executable paper model, without NPC movement or two independent cook planners.
Its source is HDDLGym's collaborative Overcooked domain at `f19db8ff0c60c54e2a832e0ea2a8b5241fb3b5b7`;
the domain header records the adaptation and the [MIT notice](../src/examples/canon/THIRD_PARTY_NOTICES.md#soup_kitchen-soup_kitchen)
is retained. The example models one ingredient and one soup, not a complete kitchen game.

**Strategy:** choose the phase nearest completion: served → deliver → start cooking → add ingredient.
Within a phase, resume an existing handoff before fetching again; prefer a solo route when one cook reaches everything.
In the split world chef1 reaches supplies/counter; chef2 reaches counter/pot/delivery. Guards bind the participating
cooks and check all required `exchange` rows. The shared `handoff_ingredient` / `handoff_bowl` tasks avoid copied tails.

| Facts | Writer and meaning |
| --- | --- |
| `agent/1`, `pile/1`, `pot/1`, `table/1`, `recipe/3`, `exchange/6`, `start_label/2`, `cooking_progress/2` | Fixture/setup defines participants, the one-ingredient recipe and permitted state transitions. `exchange` includes both before and after holdings. |
| `holding/2` | Fixture initially; `KITCHEN_HOST.!interact` checks a matching exchange and replaces both holdings when the interaction succeeds. Piles are replenishing sources, so repeated food types are valid. |
| `cooking/2` | The host adds it when an interaction starts the pot; `!wait` advances one scripted stage and removes it on completion. |

The planner does not apply the table as effects. A phase passes known future holdings as parameters; it ends before
the next phase needs to inspect them. Serving includes `&wait_cooking`: each expansion reads the pot **then**, emits one
wait and another deferred check while cooking, or an empty expansion when ready. The fixture has three progress stages;
a real host needs its own clock and completion event. Deferred recursion alone guarantees neither progress nor termination.

Derive expectations from those rules, not from a captured planner trace. For example, scenario
`2_add_onion_through_counter` cannot take the solo route: no cook has both the supply and pot exchange rows. It must give:

```text
!interact chef1 onion_pile
!interact chef1 counter
!interact chef2 counter
!interact chef2 pot1
```

These existing worlds cover the other phase/re-entry decisions:

| World | Expected decision and reason |
| --- | --- |
| `1_add_onion_solo` | Two interactions by chef1: the same cook can fetch and fill the pot. |
| `3_start_cooking` | Only `!interact chef2 pot1`: the ingredient is already in the pot. |
| `4_deliver_solo_waits` / `5_deliver_through_counter` | Fetch a bowl directly / hand it across; defer the cooking check, then serve and deliver. |
| `6_resume_bowl_in_hand` | `&wait_cooking chef2 pot1 soup`, then pot and delivery interactions; no second bowl fetch. |
| `7_resume_hand_in` / `8_served` | One delivery interaction / successful empty plan: finish what is in hand, or stop after completion. |

After an interrupted handoff, the item may already be in a cook's hand or on the counter. Those are real effects;
cancellation does not put it back in the pile. Re-entry branches continue from those holdings. The
[recovery test](../test/examples/canon/recovery.test.ts) interrupts the ingredient and bowl transfers, injects one failure,
and semantically requires soup at delivery and an empty counter within 24 steps. It establishes those modelled recovery
cases, not arbitrary multiplayer contention. There are no reservation locks to release in this example; for a claimed
helper's post-crossing cleanup, compare [door_helper](../src/examples/canon/door_helper/door_helper.domain).

The [invariant](../src/examples/canon/soup_kitchen/soup_kitchen.invariants.domain) rejects conflicting contents for one
holder; it does not prove reachability, all recipe constraints or unique physical ingredient identity. Test a nearby
world with a needed exchange row removed: it must choose another available route or return `no_plan`, not silently
succeed. `no_plan` is intentional for an impossible kitchen; a served soup is a different result, `succeeded` with no steps.

Run from the source scene (the repository-only runner is not part of a minimal module installation):

```sh
npm run -s htn:run -- --world soup_kitchen/2_add_onion_through_counter
npm run -s htn:run -- --world soup_kitchen/6_resume_bowl_in_hand
npm run -s htn:run -- --story soup_kitchen/a-soup-in-a-split-kitchen
npm test -- examples/canon
```

To adapt it, write your facts/executor contract and expected cases first, then lint, check applicable invariants and run
an execution story. Keep source/licence/deviation notes. A future two-planner kitchen would need its own shared-resource
and cancellation contract; this team-plan example does not establish that integration.

## Authoring tools

- Run `npm run htn:compile -- --check <file.domain>...` after every edit (or from your editor's task runner): it
  parses, loads includes, validates and links, prints every diagnostic and writes nothing. Exit code 4 on errors,
  so a script or CI step can gate on it.
- Then run `npm run -s htn:lint -- <file.domain> --json`: the compile check, then symbol checks the compiler does
  not make, then the shape rules. Its rules and output: [htn-lint.md](htn-lint.md); how an agent uses it while
  writing a domain: fix compile errors, then symbol errors, then review shape findings. Suppress a deliberate case inline, with the reason:
  `// htn-lint-disable-next-line <rule> -- <why>`.
- Run the domain with `npm run htn:run` (the Domain Runner in a terminal): it compiles in memory, plans against a
  world state and prints the plan, the tree and why branches failed. See "How an AI agent debugs a domain".
- In VS Code, install the local extension `scenes/96,-11-htn-planner/tools/vscode-htn` (copy it into
  `~/.vscode/extensions`; its README): highlighting, `//` toggling, and a `$htn-check` problem matcher, so a task
  running `--check` on the open file puts every error in Problems with its full range.
- A compiled module (`*.htn.ts`, `*.facts.ts`) is a copy of its source: regenerate it in the same commit as the
  `.domain` / `.worldstate` edit. Keep the `// Source:` header the compiler writes; a test can then recompile every
  module from it and name the stale ones (this scene: `test/htn/compiler/generated.test.ts`).

### Adding a canonical example

Use the [canonical example format](htn-examples-catalog.md#canonical-examples--srcexamplescanon).
Give the domain a strategy header, facts with writers, primitives with executors, source/licence and deviations.
Write each scenario's expected status and plan from that strategy before running it. Cover entry, applicable
re-entry and near-miss cases; use host stories for interacting agents and interruptions. Add applicable
[world invariants](htn-world-invariants.md). Register the example in the catalogue and verify its scenarios,
stories, generated modules and lint; update the baseline only for explained changes.

## Callterms

- They run during planning, possibly many times, and are never rolled back. Keep them cheap and idempotent.
- Upstream lets a callterm write facts (its Pathfinder does), and they are visible at once and survive
  backtracking. Use it on purpose only.
- Register every callterm the domain lists in `DomainIR.callterms`. A `PlanRunner` reports every call site of a
  missing one (`unregistered_callterm`) when created, like upstream's `ValidateGeneratedCallTerms`;
  `validateCallterms()` gives the sites, `missingCallterms()` the names.
- A host that leaves a callterm out on purpose (a test that binds only what it reaches) filters that one
  report by `d.callterm` in `onDiagnostic`. Do not drop the sink: the next missing callterm is a real bug.
- **Bind with a signature** (`callterm(['int', 'vec3'], fn, 'bool')`), not a raw function that checks its own
  arguments: a wrong count, type or shape is then reported with the reason and the `(call` position, instead of
  looking like `false`. Keep raw functions for callterms that take any atoms. Put the types the domain really
  passes: a literal `1` is an INT, not a float; bare `true` / `false` are symbols, not bools.
- An unbound variable passed to a call (`(call f ?x)`, ?x bound only by one `or` child) does not skip the call: it
  is invoked and fails before the function runs, reported as upstream (`not_registered` for a missing callterm,
  else `argument_type_mismatch` with `actualType: 'unbound'`, or `argument_conversion_failed` for an `'any'`
  parameter). A callterm function never sees an unbound argument.
- **State a callterm needs lives in a daemon** (`memberCallterm('nav', ...)` + `daemons: { nav }`) or the client
  `context`, never in a module variable: several planners share one set of bindings.
- **Converters for host types** (`CallTermType`): resolve ids through `context` (an entity manager), return
  `undefined` for a stale or foreign one. That is `argument_conversion_failed`, reported, and the function does not
  run.
- **Choose the error policy on purpose** (`calltermErrorPolicy`). The planner never throws for a callterm error
  (like upstream). Under the default `unset`, an error fails the call, is not reported, and the first one per runner
  prints a `[htn] Configure the callterm error policy explicitly (PlannerOptions.calltermErrorPolicy). ...` warning
  with that error (`report` without `onDiagnostic`, or an invalid value, print their own once). The warning is our
  stand-in for upstream's debug assert: it means "a policy is missing", fix the options, not the domain. A game
  host uses `report` with a sink that logs (`plannerFor` does); `fail_silently` only where failures are expected and
  counted elsewhere (a test of fallback branches). Whatever the policy, an error fails only that call: the branch
  falls through as for `false`.
- **A callterm must not throw** (upstream: no throwing across the runtime boundary). Return `undefined` for an
  ordinary failure, or call `call.setError(reason)` for a reported one (it fails even if it returns a value; side
  effects done before stay). Nothing catches a throw: it escapes `plan()` mid-decomposition, under every policy.
  Wrap host code that can throw (JSON, maps of entities) in your callterm and turn the throw into `undefined`.

## Side effects, squads and directors (upstream USE_CASES)

- Spawning, spending, deleting: a primitive the host runs after the plan is chosen, never a callterm in a condition.
  A condition's callterm runs for every candidate tried, for branches later abandoned, and again on every planner
  call (a host that plans candidates calls it for plans it drops). Primitive steps from a failed branch are removed
  from the candidate plan; their executors have not run, so this is not rollback of physical game effects.
- Never let a callterm add or delete rows of a fact while it is being enumerated: candidates are skipped or added
  depending on row order (as upstream, the n-th retry takes the n-th matching row of the table as it is then).
- Squad: one planner over a shared snapshot emits `!order member role`; the host writes each order as a fact into
  that NPC's own world, and the NPC's domain picks how to carry it out. Plan the squad again when the snapshot
  changes; an unchanged order should not interrupt the NPC. Our kit: `GuardSquad` with `squad: { planner, topLevel,
  snapshot }`; `snapshot` writes the shared facts and returns a key (put in it only what should re-decide, e.g. the
  member ids, not positions); a member that drops out is `squad.remove(id)` or simply not `available` in the
  snapshot. Orders arrive as `(order <arguments>...)`: give the member domain a branch for no order. No plan keeps
  the orders; a successful empty plan clears them. A key that flickers decides every frame: put less in it, or
  space decisions with `minInterval` (seconds; a change inside it waits and is decided once, from the snapshot as
  it is then, when it elapses; the start, a roster change, a reload and `requestDecision(reason, true)` do not
  wait). Upstream leaves the cadence to the host ("the host owns update cadence and budgets", USE_CASES).
  Paper-prototype example with stable roles (a collector keeps its resource, the lead changes hands only with the
  swarm gathered) and members that keep their running job through a decision: `src/examples/canon/swarm/`.
- **Joint plans that run side by side reserve their parties first.** A squad planner that starts a new plan on every
  run, while earlier ones still run, must not hand the same member or target to two plans: the plan's first steps
  reserve everyone it involves (host bookkeeping, applied at once, before the next run), its conditions skip
  `(reserved ?x)`, and on success it frees them after a barrier step that waits for the action to end (SquadSmart,
  AIIDE 2007). Example: `src/examples/canon/arrest_team/arrest_team.domain`.
- **Give shared tasks an exit contract.** For success, cancellation, permanent failure, lost relevance and a lost
  participant, say who ends the task and preserves, transfers or releases its claims and helper obligations.
  Replacing a plan cancels the current executor; pending release steps of the discarded plan do not run.
  Put cleanup in the owning host/task lifecycle, including participant removal when no executor remains.
  Cleanup must tolerate repeated calls and release only that task's claims, not a newer owner's reservation.
  Example interruption story to test when wiring such a host: reserve a helper to hold a door, cancel the joint
  task or remove the requester, then check the helper's obligation ends and another task can reserve it; a late
  cleanup from the old task must not clear the new claim. Use a timeout only when the task needs one.
  The arrest_team example explicitly omits cancellation/give-up cleanup; its success trace does not test this contract.
- Squad in the scene: level 11 (`squad/yard_squad.domain`, `yard_guard.domain`, `test/playground/orders.test.ts`).
  What it shows:
  - **Situation facts go in the snapshot, the choice of who in the squad domain.** The host writes who spotted the
    intruder (`(spotter b)`), the squad domain decides that b chases, the first other available guard holds the gate
    and the rest flank. A role list walks the roster with `split_list`, skipping the guard already given a role.
  - **The host keeps a role stable**: the chaser stays the spotter while it sees or remembers the intruder, even if
    another guard saw it more recently. Without that, the chase could pass back and forth between two guards that
    both see the visitor (USE_CASES: the host resolves conflicting reservations).
  - **A member domain does not act outside its order**: a patrolling guard that sees you keeps patrolling until the
    squad orders the chase. Give it a branch for no order (a break, or a chase order with nothing left to chase
    until the squad decides again), or it has no plan.
  - **Per-guard planner options go in the factory**: `GuardSquadOptions.planner` is told which guard it builds for,
    `(world, guard) => plannerFor(domain, { trace: traces.get(guard.id) })(world)`; a plain `plannerFor(domain)`
    still works for a squad with no per-guard options.
  - **Per-guard history**: `GuardSquadOptions.history` gives each guard its own ring, `guard => rings.get(guard.id)`
    (undefined: none), as `GuardAgentOptions.history`; no `onEvent` plumbing.
  - **Who ticks the squad**: by default `GuardSquad.spawn` adds its own ECS system. A host that runs its own loop
    passes `system: false` and calls `update(dt)` once a frame; never both (twice the speed). The player noise
    system (`playerNoise`) runs either way.
- Director: a world-level domain over intensity, cooldown and spawn points. Its idle answer is a successful empty
  plan, not a failure. A branch whose condition still holds is chosen again on every decision (a recovery phase
  restarts its cooldown each time): make its steps safe to repeat, or guard it with a phase fact.

## Senses: sight by light, presence, lures (level 12)

The agent's senses only make facts (`target_visible`, `last_seen`, `heard_noise`); the domain decides what they mean.
Keep a sense a host rule that writes the facts the domain already reads, so the same domain runs on another level.
- **Sight that depends on the target's light (or camouflage, fog): a per-target factor, not a per-NPC range.**
  The host gives each `TargetSample` a `visibility` (lit 1, shielded less, dark less still); the sight range for that
  target is `range × visibility`, detection time scales with it. Why per target: two people, one with a lantern and
  one without, are seen from different distances by the same NPC at the same moment. Level 12: 9 / 7 / 5 m.
- **A presence radius for "right on its heels is never safe":** `presenceRadius` senses a target all around,
  through walls, whatever its light, into the same detection. Without it a player can follow a sighted NPC at 1 m in
  the dark forever (owner playtest of the encounter level 12 ports). Keep it small (2.5 m on a 28 m pad).
- **A lure is a noise, not a new fact.** A light glimpsed beyond sight range but within an outer ring should draw
  the NPC to look, not chase: the host checks the cone at the ring's radius (`inViewCone(..., ring)` plus line of
  sight) for a glance (0.8 s), then emits a noise at the light with a radius chosen so it is perceived below the
  domain's startle level (`loudness = d / (1 - 0.45)`). The domain's investigate branch does the rest, unchanged.
- **Ears on the player's own noises** are a factor on their radius, applied by the host before the agent hears them.
- **An ambush is host state around the agent:** off-stage (`LevelSim.present` false: the agent is not ticked and its
  body hidden) until someone enters a trigger zone, then a fresh agent at the entry. After a fail (caught), re-arm the
  trigger only once nobody stands in it: a visitor the scene cannot move back otherwise triggers it again at once and
  is caught again (a capture loop; the source encounter had one at its checkpoint). A checkpoint past the encounter
  keeps it away for good.
- **Check each rule as a headless scenario named by the rule** (`test/playground/ambush.test.ts`) and as a tester
  check, several rounds; the debugger's sense gizmos (below) show the cone, the presence and the ring in the world.

## Bodies: animation and sound

### Recipe: an HTN NPC with animation and sound reactions

Files to copy: `src/examples/stalker/stalker-rig.ts` (pure), `stalker-model.ts` (ECS), `stalker-gaze.ts`, the
executors in `stalker-actions.ts`, and `assets/stalker/` (its provenance in `SOURCES.md`). The planner and the
library never see an asset.
1. **The executors talk to a host interface, not to the ECS** (`StalkerHost`: `play(clip, speed)`, `lookYaw`,
   `lookWorldYaw`, `targetPosition`). Each executor plays its clip when it starts; a move picks the clip by gait
   (walk / hurry / run) with an animation speed from the movement speed (m/s divided by the clip's stride at the
   model's scale: no sliding feet).
2. **A rig implements that interface, pure** (`StalkerRig`): it keeps the wanted clip and speed, turns the head
   (`StalkerGaze`: a scan while walking a round, the looks the domain asks for, a bounded turn speed), counts
   footfalls from the walking clip's phase (`footfallsBetween`: touch-downs at fixed fractions of the cycle) and
   turns the agent's events into cues (`noticed`, `heard`, the first `chase`, `caught`). Tick it around the agent:
   `rig.beforeTick(dt, agent)`, `agent.tick(...)`, `rig.afterTick(dt)`; events through `rig.onEvent`.
3. **The head aims the sight.** Give the agent `sightYaw: () => rig.sightYaw(agent)`: what the model looks at is
   what it can see (peering at the crossing with the head, the body in profile, finds who comes that way).
4. **Timers end the clip steps, not the renderer** (`clipFinished` is false): a renderer's "finished" makes a scene
   run and a headless one differ; the domain's clip lengths are known.
5. **The model reads the rig every frame** (`StalkerModel.update(dt, rig, pose, shown)`): patrol clips crossfade
   (0.18 s), other clips are selected outright; three one-frame head poses are weighted for the head's angle (only
   the head pivot moves); a step plays from a rotating pair of `AudioSource`s at the feet on each new footfall (a
   fixed round of pitch offsets: no random numbers); a voice line through a gate (`VoiceGate`: one line at a time,
   more urgent cuts in, once per spawn, a cooldown). All sources are children of the model: spatial for free.
6. **Respawn = a new rig.** The model sees a new rig object and starts the clip, the step count and the voice over.
   Off-stage it stays under the floor, silent.
7. **Test the rig headless** (`test/examples/stalker-rig.test.ts`) and the model on the headless engine
   (`test/playground/ambush-view.test.ts`: the GltfContainer, the clip playing, the head weights, the step sounds).

## Executors (primitives)

- An executor has `start / update / cancel` and returns `running | done | failed`. `failed` replans at once.
- A step with no executor (unknown name, or the factory returned null for its arguments) runs as a 0.05 s no-op, as
  upstream's demo host; the plan goes on. A `diagnostic` event (`no_executor`) names it once per primitive.
- A logical action is not a game input (pick up and drop share a button in a cooking game): the executor maps them.
- End a clip step after the clip's length (known per clip), not an arbitrary timer; a renderer's "finished" may end it
  early in the scene only, so a headless run stays the same (level 12's rig ignores it).
- A blocked path must fail `!move_to` (and replan), not stall the NPC (F.E.A.R.: a slammed door → another route).
- **A runtime failure does not itself select an alternative.** If eligibility facts stay the same, the next plan
  may choose the same action and target. For a persistent obstacle, have the responsible executor or sensor record
  what failed or refresh reachability, and let the domain select an eligible alternative. Keep transient retries
  possible and define when learned failure information becomes stale. See the learned fact in
  `src/examples/canon/door_helper/door_helper.domain`; no global cooldown or attempt cap is implied.

## Testing and debugging

- Test domains headless: a scripted tester with `expect` checks, several rounds (a check that fails only in
  alternate rounds hides behind the last result). See `test/playground/levels.test.ts`.
- When a domain misbehaves, look at the trace: which branches were tried, why each failed, the replan reason
  (`PlanTraceRecorder`, the live boards). How to read one is below.
- Tell apart a missing callterm, no plan, and a successful empty plan; they look alike from outside.
- A fact written with the wrong arity is never read. A `PlanRunner` with `onDiagnostic` reports it
  (`fact_arity_mismatch`) once per table; `checkFacts(domain, world)` also lists facts the domain never reads
  (upstream's `WriteFact` rejects those; ours keeps them, so a host can keep its own facts in the world).
- Every gallery scenario's plan is upstream's own (`test/examples/upstream-golden.test.ts`, below). A new
  scenario has no reference until `npm run htn:golden` is run; until then its `expect` is our planner's output.

### Reading a trace (upstream's generated debugger model)

- Attach a recorder only while debugging: `PlannerOptions.trace = new PlanTraceRecorder(domain)`. Without one the
  planner pays nothing; with one, planning takes 6 to 9 times longer (`test/htn/planner/bench.test.ts`).
- Read top-down: plan → method → its branches in priority order. A failed branch whose condition failed: the last
  failed leaf under it is the reason. A failed branch whose condition held: a task below it failed, so the reason is
  inside that task's method (the boards call it "abandoned").
- A failed fact keeps the rows it was checked against (`rows`, `rowCount`). Compare them with the pattern and its
  `before` bindings: a wrong value, argument order, arity, or a fact the host forgot to update.
- A term marked not started was never evaluated (a short-circuit): an earlier term failed. Do not debug it.
- The same condition several times is backtracking. The Normal view (`viewRows`) folds it into "retry xN", or into
  numbered choice rows when a fact matched several rows; only the last choice is committed. Many retries in a hot
  branch are a cost: put the most selective fact first, or bind its variables earlier.
- An axiom call has one axiom scope per body solution tried; its After is what the call published.
- `before` / `after` say what a node bound. A condition that should match but finds its variable already bound in
  `before` to another value was fed by an earlier term.
- Each run records the world revision it planned against; `worldDiff` between two runs shows what changed, which
  is usually why the plan changed. With `GuardAgentOptions.history`, the `sense` event before a `replan` says what
  triggered it, and `kept` says the running plan went on.
- **Collapse repeats when you record them, not when you show them.** An agent that cannot plan retries every tick;
  logged one by one, the retries push everything older out of a bounded history and the timeline that explains the
  failure is gone. Merge a run of identical events of one agent (same type and same telling fields, times ignored)
  into one entry with a count and its first / last time; any other event of that agent ends the run. Our
  `agentHistory` does this for every event type (`eventKey`); `heard` ignores its measured levels.

### How an AI agent debugs a domain (`npm run htn:run`)

The Domain Runner in a terminal: no Explorer, no generated module. It compiles the `.domain` (with includes) in
memory, plans once against a world state with the in-scene tab's code, and prints compact, greppable lines. Run it
from the scene folder with `npm run -s` (no npm banner).
1. **Find the inputs.** `npm run -s htn:run -- --list my.domain`: its top-level methods (`name/arity (name ?params)`)
   and the gallery / lab scenarios of that domain (`station/scenario-slug (method args) expects ...`). A world is a
   `.worldstate` file, a scenario id, or `empty` (the default).
2. **Run it.** `npm run -s htn:run -- my.domain method arg1 arg2 --world my.worldstate`. Arguments are atom
   literals (`3`, `-1.5`, `sym`, `"text"`, `(1 2)`). The method can be left out when the domain has one top-level
   method or the scenario names one. Read the exit code first: 0 plan, 1 no plan or a failed deferred step, 2 usage
   or compile error (the compile errors print as `htn:compile --check` does: `file:line:col-line:col: error code:
   message`, fix them and run again).
3. **Read the header.** `status:` (`succeeded`, `no_plan`, `invalid_call`, `depth_exceeded`), `plan:` with one
   numbered step per line, `expected: same | DIFFERS` for a scenario (its plan under that method and mode).
4. **No plan, or the wrong one: `failed branches:`.** One line per branch attempt that did not hold:
   `method.branch  no_match|abandoned  at <term with ?var=value>  [checked N: rows]  {bindings}  file:line`.
   `no_match`: that term is the deepest failed condition; compare the rows it checked with its bindings (a wrong
   value, argument order or arity, a fact the world lacks). A choice fact that ran out of rows after every candidate
   was rejected is not named: the term that rejected the last candidate is. `abandoned`: the condition held and the named task
   failed; look for that task's method among the following lines. Normal view lists them only when there is no
   plan; `-v` always, with the whole Verbose tree (every attempt, every candidate a fact tried).
5. **The tree** (`tree (normal|verbose): N rows`, two spaces per depth): `✓` chosen, `×` failed (`(condition held,
   a task failed)` marks an abandoned branch), `·` not reached (short-circuit: do not debug it), `↺ ×N` retries,
   `i/n` a fact's choice rows. `?x=value` is what the node bound.
6. **`diagnostics:`** come first from the dev checks: `unregistered_callterm` (a call site the bound callterm set
   lacks: it fails when reached), `fact_arity_mismatch` (a world fact the domain reads with another arity: never
   read). Then the run's: `missing_callterm`, `callterm_error`... with `file:line:col`, repeats as `(xN)`. The CLI
   binds the gallery's callterms (plus the list callterms) for files and `empty`, a scenario's own set for a
   scenario; `--callterms none|test|...` picks another set (`--list` names them). A domain's own host callterms are
   not available: its calls fail as a failed `(call ...)` term, which is still enough to read the rest.
7. **Probe.** `--mode NONE` (or `FACTS_AND_AXIOMS`, `BRANCHES`): a plan that changes needs backtracking.
   `--max-passes N`: expand the plan's deferred `&` steps in order on the same world (`expanded plan:` and one
   `deferred:` tree each). `world diff:` lists facts a callterm wrote while planning (the planner itself writes none).
8. **Edit, rerun, compare.** The output is deterministic but for the `ms:` line, so diff two runs to see what an
   edit changed. Before changing a domain that has scenarios, run them (each says `expected: same | DIFFERS`).
9. **Ask "why not X?" directly: `--why <name>`** (repeatable; a branch `method.branch` or `branch`, a method, a
   primitive `!name`). One section per name after the diagnostics: `why not <name>: <verdict>` (`failed`,
   `not_reached`, `chosen`, `in_plan`, `not_in_domain`, `no_run`), a one-line summary, then one line per attempt
   (`× method.branch  no_match  condition failed in (method args): ...`) with its failing terms below it, one per
   attempted binding: `× (<= ?hp=85 20)  false  {bindings}  file:line`; for a fact
   `no row matches (door_open store); 1 row of door_open/1, closest (door_open back): arg 1 is back, not store`,
   or `world has no door_open/1 rows (it has door_open/2: 3 rows: another arity)`; for a `not` the row that made
   it fail. `· ... not_reached  never reached in (...): an earlier branch succeeded (m.b)`: the earlier branch is
   the one to change (or reorder). `not_decomposed`: its method was never called, with the branches that call it
   and why each was not taken, nested. `abandoned`: the condition held, the named task failed, its method's
   branches nested. `discarded`: it held and decomposed, a failure above dropped it. `not_in_domain` lists names
   alike (a typo, or the domain you ran is not the one you edited). The same reading is a library call,
   `whyNot({ query, domain, runs, world })` (`htn/why-not.ts`), over any recorder's runs.
10. **Why an NPC replanned, and whether its plan still fits.** A live agent's replan events (`GuardAgentOptions.history`
   or `onEvent`; `agent.lastReplan` for the last one) carry `trigger` (`start`, `reload`, `perception`, `hearing`,
   `facts`, `plan_done`, `step_failed`, `deferred_failed`, `no_plan_retry`, `active_plan`, `request`, `debug`;
   `also`: triggers that asked while it was pending), `waited` (s) and `budgetFrames` (held back by the throttle or
   the shared budget), `changes` (`+ (fact args)` / `- (fact args)`: the facts the domain reads that changed since
   the replan before, without the volatile ones), `volatile` (the volatile facts the domain reads that changed, by
   name: the agent's `now` and `self_position`, written every tick, and those a host declares in
   `GuardAgentOptions.volatileFacts` for the per-tick values its `syncFacts` writes; they differ at nearly every
   replan, so in `changes` they would only crowd out the facts that mean something), `previous` (the rest of the running plan) and `changed` (false: the same steps again, or
   kept). A replan you did not expect: read `trigger` and `changes`; an empty `changes` with a sense trigger is a
   host key that flaps without a fact change; an empty `changes` with `volatile` and a new plan is a condition on
   the clock (or a position) that flipped. `planDrift(domain, run, world)` re-checks the facts the run's chosen
   path rests on against the world now (`gone`: a fact it matched is no longer there; `present`: a `not` fact
   now has a row): a running plan whose facts drifted and that did not replan is a missing trigger, or the
   `active_plan` check the domain lacks. Both are in a `DebugSession`: the timeline's replan events, and `drift`
   per agent given its world (`buildSession({ agents: [{ id, recorder, metrics, world: agent.blackboard.world }],
   histories })`), which is the hook for a headless level runner's JSON.
11. **For scripts:** `--json` prints one object (`status`, `ms`, `plan`, `expanded`, `rows` with `depth`, `status`,
   `kind`, `text`, `failures`, `deferred`, `worldDiff`, `diagnostics`, `expected`, `why` with `--why`: per name
   `verdict`, `summary`, `attempts[]` with `outcome`, `call`, `terms[]` (`term`, `why`, `needed`, `found`, `rows`,
   `otherArity`, `bindings`, `source`), `nested`; a compile or usage error is
   `{"status":"compile_error"|"usage_error", ...}`). `--session out.json` writes a `DebugSession` (the debugger's
   data model; `parseSession` loads and checks it) for `npm run htn:view` (below).

### Debugging a domain with the in-scene debugger

The scene's **HTN debugger** panel (scene README, "The HTN debugger") shows the views above on live hosts.
- **Wrong plan on a live NPC: History first.** Find the replan, read its reason, its `Δ` (the facts that changed) and
  the `sense` row before it, then open its run: the Plan tab's **Why** line has the trigger, the wait and the changed
  facts in full, **Now** whether the facts the plan rests on still hold (a plan that runs on facts that are gone
  missed a replan trigger). A `×N` row with `retry after no_plan` is an NPC stuck without a plan: the row below it is
  the last thing that worked. A replan you did not expect is a host problem (a perception key flapping, a fact the host
  rewrites every tick); a wrong branch is a domain problem.
- **Then World, "changed only":** the facts that changed since the run before are usually why the plan changed. A
  fact that should have changed and did not is a missing executor or sensor update.
- **Then Plan:** read the branches top-down; open the failed branch you expected to win; select its failed fact and
  compare the rows it checked with its Before bindings (wrong value, argument order, a variable bound earlier). The
  watch's **why** says it for you: select a method row for every branch's verdict (a branch you expected but that
  has no row was never reached: the `✓` above it won), a branch row for its failing terms with the row needed and
  the closest row the world has.
- **Reproduce without the simulation:** in Domain Runner, run the domain on a copy of the NPC's world now. Same
  plan: the cause is in the facts; change the scenario or the domain and run again. Different plan: the world
  changed between the replan and the copy, so step back with Prev / History instead.
- **Before a domain change, run the gallery / lab scenario of that domain in the Runner**: it says whether the plan
  is still the one the scenario expects.
- **Domain view** for structure: a method nobody calls, recursion as back-edges, and a branch that never turns
  green over many runs while an earlier sibling always does (it is shadowed: its condition is never reached).
- **Too fast to read: pause, step, slow down.** The header's Pause stops every planner host (one simulation clock,
  `sceneClock()`); the tabs stay live, so read Plan / World / History on a frozen NPC, then Step frame by frame
  (1/30 s) through the replan you are after, or run at x0.1-x0.5. A host of your own that ticks NPCs must take its
  dt from `sceneClock()` (`each(maxStep, update)`), never from the engine's, or it runs on while the rest is paused.
  Planning times stay wall-clock.
- **Who is where: the Map tab.** Every NPC from above in its mode's colour, a line to where its running step goes,
  the selected one's route through its plan's positions; a click on a dot selects it. Use it for many NPCs at once
  (two chasing the same target, one stuck on a waypoint), then switch to its tabs.
- **Walking among the NPCs: the overlay and the keys.** Key 1 (or **NPC overlay**) puts each NPC's running step
  above it, again for its goal (root method → branch) and why it last planned (trigger, reason, changed facts), and
  a line on the ground to where its step goes. With many NPCs keep everyone at step and press 1 on the one you
  watch for full. Point at an NPC: the hover lists the keys; F replans it now (trigger `debug`: a plan that changes
  on F alone was stale, a missed replan trigger), 4 prints its goal, why, plan and world to the console (copy it
  into a test), E opens the panel on it, 2 / 3 pause and step everyone.
- **What does it sense? The sense gizmos.** At full (and for the NPC selected in the panel at step) each NPC that
  perceives draws its sight cone where its head looks, out to the range its targets' light allows now, its presence
  disc and the last noise it heard with that noise's radius; red seen, purple smelled, orange in sight but not yet
  detected. A cone that does not reach a target it should see: its light (visibility) or the head; a target seen
  through a wall: the line of sight; no cone at all: the domain reads no sight fact, so the agent does not see.
- **Planning time with a coarse target-client clock:** if it moves in 1 ms steps, read the mean over many plans, not one plan's
  ms. A recorder makes planning several times slower; hosts that can record only while debugging should.

### How an AI agent runs a playground level headless (`npm run htn:level`)

No Explorer needed: a level's own tester script (the same `LevelSim` its station runs) plays on a fixed dt from a
seed, and the terminal says which checks passed. In the scene dir:

```
npm run htn:level -- --list                   # number, id, title, checks, NPCs of every level
npm run htn:level -- crowd                    # or the number: 9
npm run htn:level -- 7 --seconds 20 --verbose # stop at 20 s of sim time; add each NPC's event history
npm run htn:level -- orders --rounds 3 --json # three rounds of the script; one JSON object
```

```
level 7 stalker: A full NPC: tiers of behaviours  (seed 1, dt 1/30, 1 round, limit 20 s)
PASS  t=   0.07 s    0.07 s  nobody -> walk_route (patrol)
PASS  t=  11.00 s    5.17 s  sees me -> notice_seen_target
PASS  t=  13.10 s    0.73 s  lost me in the hut -> search_at_shelter
WAIT  t=  20.00 s    6.90 s  gives up -> leave
----                        walked off, a new one patrols
----                        sees me -> notice (or already chasing)
----                        noticed -> chase_noticed_target
----                        caught -> stand_over_caught
TIMED OUT at 20.0 s: 3 passed, 0 failed, 5 pending (script round 1 not done)
NPCs at 20.0 s:
  stalker  investigate  search_at_shelter  plans 4  replans 4  step !stand 4.0  last replan 13.1 s: perception: sees tester → remembers tester
```

- **Read it:** a check line is the state, the sim time it resolved at (`t=`; WAIT: now), and how long the NPC took
  (FAIL: how long the script waited before giving up). `----`: the script never reached it. Exit code 0: every
  check passed; 1: one failed or the time ran out (`--seconds`, default 600, is a limit: the run ends as soon as the
  script has done `--rounds`, default 1); 2: bad arguments.
- **A failed check: `--verbose`, then read the NPC's history up to the check's `t=`.** The replan before it says
  why the NPC chose what it did (the `sense` row: what it saw or which fact changed), the steps after it what it
  did. A replan that never came is a host / perception problem; a replan to the wrong branch is a domain problem:
  take the facts to Domain Runner (above) or the trace.
- **Reproducible: the same seed, dt and level give the same output, line for line.** Time is only the dt a level
  is stepped with, random numbers only the level's seeded `rng` (`src/htn-planner/npc/rng.ts`; never `Math.random`,
  a test greps `src/` for it), and planning ms (wall clock) never change behaviour. So a failure reproduces with
  the same `--seed`; a check that fails only for some seeds (`--seed 1..N` in a loop) is a timing assumption in the
  domain or the script. Plan budgets: `maxPlansPerFrame` is deterministic, `planBudgetMs` is not (wall clock).
- **A smaller `--dt` (1/60) is a finer simulation, not the scene's:** the station steps with the frame's dt (at
  most 0.1 s, cut into pieces by `sceneClock()`); a check that passes at 1/30 and fails at 1/60 depends on the
  frame rate.
- **Outcomes, not only checks: `--metrics`** (and `--json`'s `metrics`): what the NPCs did with their time, how the
  encounter with the tester went; `--ablate <name|all>` the level with one parameter changed, `--seed 1-5 --stagger 5`
  means over seeds. Definitions and the baseline table: [htn-level-metrics.md](htn-level-metrics.md).
  `--variant <name|all>` runs the level's NPCs on another shape of their domain (`src/playground/variants.ts`, e.g.
  `flat`, the frozen before shape of the stalker and the guard), side by side with `all`.
- **In a test:** `runLevel(level, { seed, seconds, dt, rounds, verbose })` from `src/playground/headless.ts`
  returns the object `--json` prints; for finer control `level.init(seed)`, `level.advanceTime(seconds, dt)`,
  `level.reset(seed)` (time back to 0, the same run as a fresh level), `level.checkLog` (every resolved check).

### How an AI agent records and views a session (`--session`, `npm run htn:view`)

A `DebugSession` (`src/htn-planner/debug/session.ts`) is one JSON file with everything a debugger view reads: the
domain graph, every recorded plan run with upstream's node list, the worlds they planned against, each agent's
events (replans with their trigger and the facts that changed, steps and how they ended) and its metrics. Record one,
read it as text first, and draw it as a page for a person. In the scene dir:

```
npm run htn:run -- --world aaa/melee-low-health-retreat --session aaa.json     # one plan (Domain Runner)
npm run htn:level -- orders --rounds 3 --seconds 60 --session orders.json      # every NPC of a level over time
npm run htn:run -- --story v5_tired/the-recovery-survives-the-replan --session t.json  # a canonical story: its replans
npm run -s htn:view -- orders.json --text                                       # read it: the report on stdout
npm run -s htn:view -- orders.json --text --at 12.5 --agent b                   # what b ran at 12.5 s, and why
npm run htn:view -- orders.json --open                                          # the page, for a person
```

- **Read it with `--text` first** (the page is for people). The report is built from the page's own view model, so
  it says what the page shows, short and greppable, values substituted, no code, no measured ms (the same seed gives
  the same text):
  - a header: the domains and which agents plan on each, the time span, runs and failures per agent;
  - `== timeline <agent> ==`: one line per replan, `t=3.40 run 4 ◆ facts hold -> chase  Δ −order(hold)
    +order(chase)  plan: kept 0 / dropped 1 / new 3: chase(tester), catch(tester), wait(1.5)` (◇: the running plan
    was kept; ×: planning found none, with the failing literal: `plan: none (no_plan): go × knock: door(?d, closed)
    — no rows`), a line per failed step (`× step walk(4) failed`) and per run no replan made (`& advance_patrol
    expanded`); identical lines in a row are one, `×3`, with the time span and the runs;
  - `== run <agent>:<n> ==` for each agent's last run and every failed run (or the one asked for): why it planned,
    the facts that changed, the plan diff (`= kept − dropped + new`), `failed:` the last branch that failed and its
    term, the refinement tree as an outline (`✓` chosen, `×` failed, `↶` backtracked, `· not tried: …`, `| ` a
    precondition term with values and what a failed fact found, `↺N` tried N times, a folded failed subtree
    `[folded: × N attempts]`, three or more failed branches as one `× N branches failed` card), the plan at the
    cursor (`✓` done, `▶` running, `·` upcoming, `×` failed, `✂` cut by a replan, with start–end times), the world
    it planned against (`+ − ~` against the world before, `●` the row the plan rests on, `○` a table the planner
    looked at; unread, unchanged tables only named).
  - Narrow it: `--agent <id>` (repeatable), `--run <agent>:<n>` (the run number the timeline prints; quote ids with
    spaces: `--run "stalker (2):3"`), `--at <t>` (the run each agent was on at t and its plan at t), `--verbose`
    (every attempt as recorded, every fold open), `--world-all`, `--max-lines N` (default 200, `0` no limit; a cut
    report ends `… N more lines (use --run …)`). `--json` prints the same report as data (the view-model objects).
  - "Why did b stop patrolling at 12 s": `--text --agent b` and find the last ◆ before 12 s (its trigger and Δ),
    then `--run b:<n>` for its tree (the branch above `patrol` that now held, with the values it read) and world.

- **What a level session holds:** every run and event of every NPC for the whole run (not the board's last 32), and
  a level's other planners: level 11's squad planner is agent `squad` on its own domain (`session.domains`,
  `agentDomains`; read an agent's graph with `sessionGraph(session, agent)`), its decisions as `replan` events. An
  NPC a respawn replaced is an agent of its own (`stalker`, `stalker (2)`); every time is on the level clock. The
  same seed gives the same session but for the measured planning `ms` (a test checks it).
- **Or read it as data** (`parseSession(text)` checks the shape): `runs` by time, each with `agent`, `t`,
  `status`, `plan` and `nodes`; `timeline` entries `{ t, event }` with `event.type` `replan` (`trigger`, `reason`,
  `changes`, `previous` and `plan`, `kept`), `step`, `step_end` (`done` / `failed` / `cancelled`); `worlds` per
  agent and revision (a run's `world`). "Why did guard b stop patrolling at 12 s": the last `replan` of `b` before
  12 s, its `changes`, then the run at that `t` (its chosen branch is the plan node's method's succeeded branch).
- **The page is for people** (and for screenshots): one self-contained HTML file, no server, no network. Timeline
  per agent (◆ replan, × failure, plan and step spans), the run at the cursor as a refinement tree (each branch tried
  as a card with its precondition and the values bound, the failing literal with what it found; three or more
  failed branches in a row as one card; failed subtrees folded to "× N attempts") or drawn over the domain's AND/OR
  map, its plan done / running / upcoming, why it planned with the diff against the plan it replaced, the world
  marked + / − / ~ and ● where the plan rests on a row.
- **Screenshots without a person:** the page takes its state from the URL (`?agent=b&t=12.5&tab=map&whole=1`,
  `&mode=verbose`, `&run=<seq>`, `&node=<id>`, `&zoom=0.8`), so a headless browser can shoot any moment:
  `msedge --headless=new --window-size=1600,1000 --virtual-time-budget=4000 --screenshot=out.png
  "file:///<abs path>/orders.html?agent=b&t=12.5"` (Chrome takes the same flags). Look at the PNG before saying a
  figure reads well.
- **The view model is a library** (`tools/viewer/model`, pure, tested in `test/viewer`): `planTree` (the refinement
  tree and its folds), `domainMap` / `mapOverlay`, `timelineModel` / `planDiff`, `planStrip`, `worldView`. Use them
  in a test to assert on what the page would show.

### How an AI agent checks plans against upstream (`npm run htn:golden`)

Upstream urosidoki/htn_planner at `aec08fa` plans every gallery scenario and every lab scenario on HTNTest's
callterms (or none); its plans are checked in (`test/fixtures/upstream-golden/<station>.golden.txt`) and `npm test`
asserts our planner gives the same status, steps and callterm errors. Plain `npm test` needs no C++.

- **When to regenerate:** after adding or changing a gallery / lab scenario, a domain or a world state. The test says
  so ("inputs changed since the upstream plans were made"); a missing case fails with "no upstream plan".
- **Needs:** WSL with Ubuntu (default distro `Ubuntu-24.04`, `HTN_WSL_DISTRO` to change it) or Linux, with g++ (13
  is enough), gcc, git. No CMake, premake or GoogleTest. The first run clones upstream to `~/src/htn-upstream`
  (`HTN_UPSTREAM`) and builds the library into `~/htn-golden-build` (`HTN_GOLDEN_BUILD`), a few minutes; later runs
  reuse the objects, about 20 s.
- **Run** in the scene dir: `npm run htn:golden`. It writes the manifest and the derived worlds
  (`tools/upstream-golden/cases.ts`: a scenario's world becomes a `.worldstate`, or the upstream file itself when
  equal), builds and runs `tools/upstream-golden/build.sh --run` through WSL, rewrites the golden files and prints
  `N match our planner, M differ` with the ids. `-- --export-only`: only the manifest and worlds;
  `-- --driver-output <file>`: use a saved driver output (from `build.sh <manifest> --run` on another machine).
- **A case that differs:** do not edit the golden file or the `expect` to match ours. Run the case on upstream alone
  (`~/htn-golden-build/htn-golden <manifest> ~/src/htn-upstream <scene> <case id>`) and on ours
  (`npm run -s htn:run`), find the cause in upstream's source, then fix the port, or document the deliberate difference and its upstream source/line in
  `DIFFERENCES` in the test. Keep a user-facing limitation in the runtime README when applicable.
- **Not driven:** lab scenarios with a test-local callterm set and host values (the driver binds only
  `BindTestCallTerms` and the Wanderer's), and the hot reload revisions; `npm run htn:golden -- --export-only`
  lists them by reason. Add a set to `driver.cpp` and `calltermSet()` in `cases.ts` to cover one.

### Validation, hot reload, outcomes (USE_CASES 1, 6 and "Runtime configuration")

Tested in `test/npc/three-units.test.ts`, `test/examples/hot-reload-policy.test.ts`, `hot-reload-pipeline.test.ts`,
`test/htn/planner/outcomes.test.ts`.
- **`active_plan`: one branch per running action, each checking what keeps it valid; no catch-all.** The domain
  cannot see the runner: the host publishes the running step as facts, e.g. `(running attack A)`. A last
  `(accept () ())` branch accepts an attack on a lost target, which then runs to its end.
- **Each top-level method in its own `PlanRunner` on the same world.** Planning `active_plan` into the behave
  runner replaces the running plan with its empty result. On `GuardAgent`: `activePlan: 'active_plan'` does the
  check (its own runner, every tick a step runs, the running step as `(running <action> <arguments>...)`, e.g.
  `(running attack A)`, `(running idle)`); `reasoning` is `GuardAgentOptions.reasoning` (its own runner, planned before
  every replan, its steps run at once until it has nothing to do; the replan event lists them in `upkeep`). Do not check
  through `requestReplan(reason, true)`: a replan keeps a candidate equivalent to the running plan (H2), so the
  failed step is never cancelled and the agent replans on every tick.
- **The check and `behave` must agree.** A check stricter than `behave` rejects a step `behave` plans again at once:
  upstream would restart it on every update; our agent restarts it once, says `active_plan_conflict` and leaves
  that step unchecked. Diagnostics for the other mistakes: `active_plan_invalid` (no such top-level method, no
  check), `active_plan_fallback` (a branch that always succeeds: a condition that always holds, `()` or `(and)`, and
  only primitives). Catch the catch-all before running: `npm run htn:compile -- --check my.domain --check-method
  active_plan` warns `check-method-fallback` on that branch (same rule; upstream has no marker for check methods, so
  name them). Watch the History tab: a `check` row, then the cancel and the replan.
- **A check runs every tick a step runs**: `metrics.checksMade` and `totalCheckMs` show its cost (apart from
  `plansMade`). Keep it a few fact lookups per branch.
- **The check sees only the action and its arguments**, not the branch that planned it. Two branches that both
  `(!wait 3.0)` for different reasons (resting, waiting at a shut door) cannot be told apart, so one branch accepts
  the other's wait. Give each purpose its own primitive (`!sit`, `!wait`) or argument.
- **With `activePlan` the host need not replan on fact changes at all**: return no key from `syncFacts` and let
  the check stop a step the domain no longer accepts; every other step runs to its end. Scene level 10
  (`basics/storekeeper.domain`, `test/playground/storekeeper.test.ts`): the store door shut on the keeper's way
  cancels `!go_to store` mid-walk, a customer who walks off cancels the carry to the counter.
- **A trace recorder shares the planner factory with the check**: the agent builds the check's runner from the same
  `PlannerFactory`, so a recorder in it records a check run on every tick, pushes the `behave` runs out of `runs`
  and replaces `lastPlan` (a board then shows `to_store_valid` as the chosen branch). Wrap it:
  `plannerFor(domain, { trace: skipRuns(recorder, domain, ['active_plan']) })`; the History tab still has every
  rejected check.
- **`reasoning` updates beliefs through callterms that queue the change**, or through instant primitives the host
  runs before planning `behave` (our agent's `reasoning` option); apply a callterm queue after `plan()` returns
  (never delete facts mid-decomposition).
- **Hot reload: keep the world, drop the plan, plan again.** `agent.reload(plannerFor(newDomain))` (or
  `squad.reload(...)` for every guard) does it: the running step is cancelled, the plan and its pending deferred
  steps go, the next tick plans from the new domain; world, position and metrics stay. Do not switch the domain
  inside a `PlannerFactory` instead: the agent keeps two runners and the old one comes back on the next adoption.
- **Never carry plan steps into a new revision.** A deferred step holds the method index of the domain that planned
  it; another domain refuses it (`stale_deferred_step`, `invalid_call`), a copied step must name its method.
- **The reload loop is the client's** (upstream HTNHotReloadDemo): save the source, compile a candidate (the agents
  keep the active domain), reload only a candidate that compiled and has the agents' top-level method, keep the
  active one otherwise. In a scene, a new `.htn.ts` restarts the scene (world lost); the compiler is Node only.
- **Always give a `PlanRunner` a policy and an `onDiagnostic`**: `calltermErrorPolicy: 'report'` with a sink
  (`plannerFor` logs to the console); without a policy callterm errors fail unreported (one console warning per
  runner), with `fail_silently` they are invisible. Read the outcome from both: a missing callterm under a fallback branch is `succeeded`, only
  `missing_callterm` shows it; `no_plan` with no diagnostic is a real "nothing applies"; `succeeded` with no steps is
  deliberate completion. A typed callterm that cannot read its arguments reports `callterm_error`; one returning
  `undefined` or `false` does not.
- **Give every primitive an executor.** A step with none is a 0.05 s no-op and the planner reports `succeeded`: the
  only sign is the agent's `diagnostic` event (`no_executor`, once per primitive). Watch `onEvent` or the History tab.

## Performance

For the current recorded release workload and separate planning/action/host boundaries, start with
[performance measurements](performance-measurements.md). The tables below retain their historical dates and fixtures;
they are not a newer run or a target-client frame budget. For startup scheduling and optional isolated plan-only
preparation, use [Preparation → Ready → Play](../src/htn-planner/HOW-TO.md#7-prepare-ai-before-play).

- Spread planner calls over frames, cache costly queries; measure planning time per agent: `GuardAgent.metrics`
  (ms last / total / max, plans made, tasks completed; the station board shows them).
- The host uses `performance.now()` when available, otherwise `Date.now()`. Check resolution in your target client:
  with whole-millisecond ticks, one fast plan reads 0 or 1 ms. Aggregate many calls; Node timings below use a separate
  environment and do not establish the target client's clock implementation.

### Historical frame measurements (2026-10-15)

`npm run htn:bench` (scene `benchmarks/main_benchmark.txt`, Node 22 / V8 on a desktop CPU, 2026-10-15). These are
Node numbers from that date; they include no target-client scene-runtime measurement or universal clock-resolution claim.

- **Warm plans in these historical fixtures**, µs per plan: guard.domain 1-5, stalker.domain (21 branches) 8-10 (the flat
  domains, measured before the 2026-10-18 restructure; the tiered ones cost about the same per replan, upkeep pass
  included; see [Domain variants](htn-level-metrics.md#domain-variants-the-tiered-stalker-and-guard-now-the-default)),
  AAACombatNPC 2-13, upstream's ComplexScenario cases 2-9. The outlier is a plan that walks a hundred entities
  (FactHeavy100: 21 184 rows tested, 243 call frames, about 0.5-1.1 ms). The first plan of a scenario costs
  up to a few hundred times a warm one in that run: 0.01-3 ms. First-use allocation and JIT effects were not
  separated; this does not identify the cause of a target-client spike.
- **Many NPCs (level 9, guards, 30 ticks/s, a visitor walking in and a bell)**, ms per tick for every agent's whole
  update (perception, hearing, planning, actions), after the first second:

  | NPCs | recorder | tick p50 | tick p95 | tick max | planning p95 | worst plan (one NPC, one tick) | replans/s | first tick |
  |---|---|---|---|---|---|---|---|---|
  | 10 | off | 0.03 | 0.12 | 3.0 | 0.008 | 0.64 | 2.7 | 0.7 |
  | 10 | on | 0.02 | 0.11 | 5.9 | 0.044 | 0.67 | 2.7 | 2.2 |
  | 25 | off | 0.04 | 0.11 | 2.4 | 0.019 | 0.22 | 7.2 | 0.8 |
  | 25 | on | 0.04 | 0.17 | 4.4 | 0.061 | 2.0 | 7.2 | 1.1 |
  | 50 | off | 0.08 | 0.19 | 4.7 | 0.028 | 1.1 | 14.7 | 1.2 |
  | 50 | on | 0.06 | 0.24 | 4.9 | 0.080 | 2.3 | 14.7 | 2.4 |

  Replans are rare (about 0.3 per NPC per second; a tick with any planning in 5-7 % of ticks), so the average is
  tiny; the maxima are single spikes (a garbage collection, or every NPC replanning in the tick the visitor walks
  in: the first tick plans all N at once).
- Choose a frame budget from measurements in your target client; these Node fixture rows do not establish a
  universal NPC count, a per-action cost or a safe frame-time allowance.
- **One budget for all planning of a frame** (`PlanBudget`, `npc/plan-budget.ts`; `GuardSquad` option `budget`,
  `GuardAgentOptions.planBudget` for any other host, which calls `beginFrame()` once per frame). It gates every
  replan of every agent and the squad decision: `maxPlansPerFrame` (runs; one run = one replan with all its
  passes, or one decision) and / or `planBudgetMs` (checked before a run; the first run of a frame always goes).
  A refused run waits: the agent keeps its running step, the squad its orders. Fair: the requests that waited
  longest are reserved the frame's slots (urgent ones, an agent with nothing to run, count `urgentHeadStart`, 4,
  frames more; ties go to the one served longest ago), a newcomer gets only what the reserved ones leave, and every
  frame runs at least one. The running-plan check (`activePlan`) is not budgeted. Upstream has none: its demo plans
  every NPC synchronously when it needs to, and leaves "update cadence and budgets" to the host (USE_CASES 5).
  Counters: `budget.stats` (`deferred`, `maxWaitFrames`, `maxRunsInFrame`), per agent `metrics.budgetDeferred` /
  `budgetMaxWaitFrames`, `SquadDecision.waitedFrames`; the debugger header and level 9's board show them.
  Level 9, the same run with a budget (recorder off; 120 s; "max/tick": the most planner calls in one tick, the
  first tick included; "waits": runs deferred; "longest": frames one waited):

  | NPCs | budget | first tick ms | tick p95 | planning p95 | worst plan | max/tick | waits | longest | replans/s |
  |---|---|---|---|---|---|---|---|---|---|
  | 10 | none | 1.60 | 0.11 | 0.008 | 0.19 | 10 | 0 | 0 | 2.7 |
  | 10 | 3 / frame | 0.27 | 0.03 | 0.005 | 0.08 | 3 | 96 | 3 | 2.8 |
  | 10 | 0.25 ms | 0.50 | 0.04 | 0.005 | 0.13 | 10 | 8 | 1 | 2.7 |
  | 25 | none | 1.36 | 0.10 | 0.016 | 0.13 | 25 | 0 | 0 | 7.2 |
  | 25 | 3 / frame | 0.11 | 0.10 | 0.016 | 0.08 | 3 | 821 | 8 | 7.1 |
  | 25 | 0.25 ms | 0.35 | 0.11 | 0.014 | 0.18 | 21 | 91 | 2 | 7.2 |
  | 50 | none | 1.26 | 0.21 | 0.027 | 0.60 | 50 | 0 | 0 | 14.7 |
  | 50 | 3 / frame | 0.15 | 0.18 | 0.025 | 1.14 | 3 | 3206 | 16 | 13.6 |
  | 50 | 0.25 ms | 0.42 | 0.18 | 0.023 | 0.26 | 33 | 410 | 3 | 14.2 |

  The spike it cuts is the first tick and the walk-in (all N plan at once; the first tick 3-12× less); the steady state hardly
  changes, since replans are rare. A count cap bounds the work per frame whatever a plan costs, at the price of
  waits (50 NPCs at 3 a frame: up to 16 frames, half a second, behind); a time budget lets cheap plans through in
  bulk and holds back only when they add up. On a client whose clock has 1 ms steps, prefer
  `maxPlansPerFrame` (a 0.25 ms budget reads every plan as 0 or 1 ms). The scene's level 9 uses 3 a frame
  (`CROWD_BUDGET`, a control switches it off). Tick times move by tens of % between runs (garbage collections),
  and so do the time-budget rows (what gets through depends on measured time); the count-budget rows repeat exactly.
- **Trace capture is optional debugging work.** It allocates and increased planning time in these historical
  fixtures (for example planning p95 0.008 → 0.044 ms for 10 NPCs). Leave it off when unused and measure it separately
  when enabled; the playground uses a recorder for its board.

What to watch, per NPC (`GuardAgent.metrics`):
- `maxPlanMs` against `lastPlanMs`: one slow plan versus all slow; `plansMade` per second: replanning churn
  (a perception key or a `syncFacts` key that changes every tick replans every tick).
- `maxPeakCallFrames` against `callFrameCapacity`: the recursion depth the domain really uses; set `maxDepth` to a
  few times the peak, not the default 8192, to fail fast on runaway recursion.
- `lastError`: a runtime error of the last plan even when nobody listens to `onDiagnostic` (a missing callterm
  under a fallback branch still plans).
- With counters (`plannerFor(domain, { stats: newPlanStats() })`, `lastStats` / `totalStats`), agent snapshots/totals
  cover decision/replan decompositions only. They exclude running-plan checks, reasoning upkeep and deferred expansions;
  use `checksMade` / `totalCheckMs` and `reasoningMade` / `totalReasoningMs` for those two categories. Deferred
  expansion needs a separate runner/host measurement when total cost matters. In those decision counters:
  `factRowsTested` / `factRowsMatched` high: a fact scanned row by row whose first argument could be bound
  earlier (reorder the condition); `factChoiceRetries` and `unbinds` high: backtracking through fact solutions
  (put the selective condition first); `branchRetries` close to `branches`: the common case is a late branch
  (move it up); `branchBacktracks`: branches whose tasks failed after their condition held (check in the condition
  what the task needs). The historical row-heavy fixtures measured roughly 10% counting overhead; this is not
  an upper bound for another workload.

### Historical allocations and NPCs per ms (2026-10-16)

`npm run htn:bench` also reports, per scenario, the **V8 heap bytes per warm plan** and the garbage collections they
cause, and from the level 9 crowd the **game metric**: how many NPCs one ms of frame runs (the whole AI update:
perception, hearing, planning, actions), at 30 and 60 fps. Node 22, desktop CPU, 2026-10-16, 5 repeats:

- **Bytes per plan** (a warm `PlanRunner`): guard.domain, stalker.domain, AAACombatNPC 0-6 B, ComplexScenario
  36-40 B, FactHeavy100 40 B, the sample NPC 1-2.5 KB; no garbage collection in 5000 plans. Upstream's C++ planner
  reports 0 (`Benchmarks/main_benchmark.txt`: alloc/plan, bytes/plan): its frames, checkpoints and plan live in
  preallocated execution storage. Ours does the same since 2026-10-16 (`htn/engine.ts` header: every buffer pooled
  and reused, continuations as records, not closures); what is left is the host's: ComplexScenario's test callterm
  returns a new FLOAT per call, the sample NPC's callterms build arrays (`map`, `vec3`). Before: 1.6-14 KB per plan
  (FactHeavy100 731 KB), a young-generation GC every few thousand plans; the pooled engine also plans 1.3-7× faster
  (interleaved runs of both under the same load), the crowd's NPCs per ms hardly move (planning is a small share of
  the frame). `test/htn/planner/alloc.test.ts` keeps it so (a few hundred B per plan fail it).
- **NPCs per ms of frame** (recorder off, no budget): ~340 (10 NPCs), ~690 (50) at 30 fps; ~850-900 at 60 fps (a
  frame has less to do). In a busy frame (p95) about a third of that. Per NPC: 1.1-1.5 µs and ~2 KB of heap per
  frame, a GC every ~5 s of play for 50 NPCs. Planning p99 per frame: 0.01-0.05 ms.
- **Precision**: bytes are V8 heap used before and after plus what each GC freed meanwhile (`node:v8`
  `GCProfiler`), net of an empty loop, the smaller of two measurements: a 2-field object measures 40 B, an array of
  100 numbers 848 B (`test/htn/planner/perf-compare.test.ts`). It counts what reaches the JS heap (not native memory;
  allocations the optimiser removes do not count, as for the GC). Times are wall clock on a desktop that runs other
  things: p95 moves 30-70 % between runs, the medians of 5 processes by 10-30 %. No current target-client measurement
  accompanies these historical rows; verify its clock resolution and aggregate enough ticks there.

### Plans, steps and callterm arguments: who owns what

The planner reuses its buffers, so what it hands out follows three rules:
- **A plan step is a value.** Never change a `PlanStep` or its `args`. A `PlanRunner` hands out the same step object
  again when a later plan makes the same step (the same task at the same occurrence in the plan, the same arguments
  by type and value: BOOL 1 is not INT 1 here); a step that differs is a new object, and the old one stays as it
  was, so a step an executor keeps stays valid for as long as it keeps it. Compare steps and atoms by value
  (`atomEquals`, `formatTask`), not by identity. Steps from `resolve()` (deferred expansions) are always new.
  `runner.steps` is a copy (it allocates: read `current()` in a hot loop). `decompose()` returns a plan the caller
  owns, from a fresh engine per call: for a game loop use a runner.
- **Atoms are values too.** `bool()` and `int()` of -128..1023 return shared atoms; `split_list` returns the same
  rest list for the same list. Never change an atom.
- **A callterm's `args` array is the engine's**, reused for the next call: read it during the call, copy it to keep
  it (the atoms in it may be kept). Return shared atoms where you can (`bool()`, small `int()`, a constant list): a
  callterm that builds a list or a float per call is what is left in bytes per plan.

What still allocates while planning ([Planner limitations](../src/htn-planner/htn/README.md#planner-limitations)): values the domain makes
(float arithmetic, ints outside -128..1023, runtime lists, `split_list` of a new list), host callterms, diagnostics,
a step that changed, a deferred expansion, and trace capture. Recorder overhead depends on the workload.

### How an AI agent checks a change's cost

1. **Counters, every change** (deterministic, in `npm test`): `test/htn/planner/perf-gate.test.ts` counts
   `PlanStats` for every bench scenario (3 plans: counters, status, plan, peak frames) and for the seeded level runs
   (crowd 10 / 25 / 50 with and without 3 plans per frame, every playground level's first minute) and compares with
   `benchmarks/counters.baseline.json`. Any difference fails, printed per scenario and counter
   (`stats.factRowsTested 12 -> 18 (+6, +50.0%)`). No clock is involved, so it holds on every machine and in CI.
   Same counters = the planner did the same work. More counters: say why in the commit, then
   `npm run htn:bench -- --update-counters` and commit the baseline with the change (the review sees the diff).
   `-- --check-counters` runs only the gate (2 s). Bytes per plan are guarded the same way, without a clock:
   `test/htn/planner/alloc.test.ts` plans five scenarios warm and fails above a few hundred bytes per plan (0-75 B
   measured), so a closure, array or object per node or per plan shows in `npm test`.
2. **Time and bytes, before you merge a planner change** (same machine only, never in CI): on the base commit
   `npm run htn:bench -- --json /tmp/before.json` (or use the committed `benchmarks/main_benchmark.json` if it is
   from your machine: its `machine` field says), then on your change `npm run htn:bench -- --compare /tmp/before.json`
   (`--threshold 10` %, the default; 5 repeats, each a fresh process). It flags p50 / p95 / plans/s / bytes per plan
   per scenario and NPCs per ms / planning p99 per crowd that are worse by more than the threshold **and** beyond the
   noise (every current run worse than every baseline run); exit 1 on a regression. Overlapping runs print as
   `noise`: rerun on a quieter machine or with `--repeats 9` before you believe them. A planner slowed by 2 µs and
   500 B per plan fails in 44 of 90 values.
3. **Commit the new numbers** when the change is meant to move them: `npm run htn:bench -- --out
   benchmarks/main_benchmark.txt --json benchmarks/main_benchmark.json`.

### New planner features: opt-in, and paid for in the bench

The planner is a game HTN like upstream's: total order, the first matching branch wins, the host replans instead of
repairing a plan. It reuses warm search storage; values, changed steps, deferred expansion and host/debug code can
still allocate. Measure cost and outcome for the workload that needs a feature and for the intended frame budget. Academic HTN features (effects simulated during planning, plan
repair, partial order, cost-optimal search) buy expressiveness with search, memory or both. So any new planner
feature:

- **is opt-in** (a domain construct or a `PlannerOptions` field), and **off costs nothing**: with it off,
  `benchmarks/counters.baseline.json` stays byte-for-byte the same (the npm test gate) and the bytes per plan of
  every existing scenario stay within the measurement's precision (`--compare`, and `alloc.test.ts` in npm test);
- **with it on, allocates nothing per warm plan either**, or says in its bench row what it allocates and why: take
  buffers from the engine's pools (`sized()`, a top index, never cut an array to length 0), continuations as `Cont`
  records, no closure, spread or temporary object per node;
- **with it on, adds its own bench rows** (a scenario in `scripts/bench/suite.ts` that uses it, and the same
  problem solved without it where there is one), so the counters baseline and `main_benchmark.txt` show its cost:
  counters, µs, bytes per plan, NPCs per ms;
- is decided from that table: what it makes possible against what it costs per plan and per frame.

The cost is half of the table; the benefit is the other half: what the NPCs do better with the feature.
[htn-level-metrics.md](htn-level-metrics.md) measures it on the playground levels: outcome metrics (time to notice
and to catch, catch rate, coverage, chases lost, the gate held, the share of time moving / acting / waiting / idle,
replans per minute) for each level and for each **ablation**, the same level with one parameter changed
(`npm run htn:level -- <level> --ablate all --seed 1-5 --rounds 3 --stagger 5`). So a new opt-in feature (planner or
agent) also gets an ablation that turns it off on the level that uses it, and a row in that file's tables: the
bench says what it costs, the ablation what it buys (e.g. level 9's planning budget: frames spread, no loss in
catch time; level 10's running-plan check: no outcome difference over replanning on every fact change there; the
continue convention, `continueTask`: no planner change, bench rows `Continue holds` / `Retarget` / `Continue miss`
at about 1 µs and 0 bytes a plan, and a sim ablation that trades re-targets for catches).
