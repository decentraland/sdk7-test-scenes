# HTN-driven NPCs

NPC behavior is planned by the HTN planner in `../htn` (TS port of
urosidoki/htn_planner; design contract and semantics in `../htn/README.md`). **Behavior is written in a
`.domain` file, not in TypeScript.** TS supplies perception (facts), executes primitive actions and
decides when to replan. Do not add a hand-written FSM or `if` chain that bypasses the planner.

Ported from a prototype where patrol, aggro (chase and catch) and losing the target
(investigate the last seen spot, look around, resume patrol) were checked in Explorer. Hearing is covered
headless. The example domains (guard, Stalker) live in `src/examples/`, outside this folder.

## Where things live

| File | Role |
| --- | --- |
| `blackboard.ts` | Facts the guard-style domains read (`now`, `self_position`, `target_visible`, `last_seen`, `waypoint`, `heard_noise`, `alert`…). Schema comment must match the domain. |
| `actions.ts` | Executors for primitives (`!move_to`, `!chase`, `!catch`, `!look_around`, `!wait`, `!forget`, `!set_waypoint`, `!turn_to`, `!listen`, `!forget_noise`) in `GUARD_ACTIONS`; tuning in `DEFAULT_TUNING`. |
| `perception.ts` | Sight: range, FOV cone, suspicion, pluggable line of sight; per-target visibility (light), presence radius (smell). |
| `noise.ts` | Noise events (`NoiseBus`, default loudness by kind) and `PlayerNoiseTracker`: footsteps by gait and landings from the player Transform. Pure. |
| `hearing.ts` | Hearing: radius, attenuation, optional wall muffling, own noises ignored, alert meter (calm / wary / alarmed). Pure. |
| `sim-clock.ts` | `SimClock`: one simulated dt per frame (engine dt clamped and scaled, 0 paused, one fixed frame per `step()`), `each(maxStep, host)` runs a long frame in equal pieces, `splitSteps`. Pure. |
| `rng.ts` | `Rng`: the seeded random numbers of a simulation (mulberry32; `next`, `int`, `range`, `pick`, `fork(label)` for an own stream per NPC), `DEFAULT_SEED`. A level owns one (`LevelSim.rng`); never `Math.random`. Pure. |
| `clock-scene.ts` | ECS: the scene's `sceneClock()` and the system that advances it before every other; GuardSquad's system, the player noise system and the scene's playground read it, so one pause / step / time scale holds them all. |
| `noise-scene.ts` | ECS: the scene `noiseBus`, public `emitNoise(...)`, the player noise system (runs while a squad is spawned). |
| `agent.ts` | `GuardAgent`: sense → sync facts → (re)plan → execute. Replan policy (triggers, candidate plan, no plan, empty plan) is documented at the top; `metrics` has the planning time. |
| `plan-budget.ts` | `PlanBudget`: a planning budget per frame shared by agents and a squad planner (`maxPlansPerFrame`, `planBudgetMs`); refused runs wait, fairly (longest waiting first, urgent with a head start). Pure. |
| `history.ts` | `EventRing` / `agentHistory()`: the agent's last events with its time (`GuardAgentOptions.history`), for a debugger's timeline. |
| `guard-scene.ts` | ECS layer: `GuardSquad` (one system for many guards; its `planner` is told which guard it builds for, `(world, guard)`, so each guard can get its own trace recorder; option `history`: each guard's own event ring; option `system: false`: no ECS system, the host calls `update(dt)`; option `squad`: a squad planner whose `!order` steps reach each guard as `(order ...)` facts; `minInterval` spaces its decisions, urgent ones do not wait; option `budget`: one `PlanBudget` for the guards' replans and the squad decision), capsule bodies, `possessEntityBody` for existing figures. |
| `raycast-los.ts` | Line of sight via SDK raycasts (async; results arrive a frame or more later). |

Example domains built on this kit (`src/examples/`, not part of the library):

| File | Role |
| --- | --- |
| `guard/guard.domain` → `guard.htn.ts` | Guard: patrol, chase/catch, investigate, listen, alarming noise, idle; belief upkeep in `reasoning` (run it with `GuardAgentOptions.reasoning: 'reasoning'`). Generated file: **never edit by hand.** |
| `guard/guard_kit.domain` | Included by `guard.domain` and `squad/yard_guard.domain`: the chase, the last-seen check, the patrol walk and `advance_patrol`, written once. |
| `stalker/stalker.domain` → `stalker.htn.ts` | Stalker: walk a route or stand, watch, notice (head turn, body turn), chase, catch; lost: search (longer at a shelter door), give up, walk off, despawn; a heard noise: start, turn, listen, walk over, look around, resume; a loud one close by: a quick turn. Belief upkeep in `reasoning`, tiers under `behave`. |
| `stalker/stalker-actions.ts` | Stalker facts via `GuardAgentOptions.syncFacts` and executors (guard ones wrapped with animation clips through a `StalkerHost`, plus `!stand`, `!watch`, `!notice`, `!head_turn`, `!body_turn`, `!give_up`, `!despawn`, `!hear`, `!refocus`, `!face [quick]`, `!unfocus`, `!peer`). |

## Adding or changing a behavior

1. **Write the behavior in a `<name>.domain`** (start from `src/examples/guard/guard.domain`). Language: upstream
   `docs/DOMAIN_LANGUAGE.md` (https://github.com/urosidoki/htn_planner), examples in
   `test/htn/fixtures/upstream/Domains/`. Key rules:
   - Branches are tried top to bottom; put the most urgent behavior first.
   - Conditions read facts; tasks are `!primitive` (executed by TS), `compound` (decomposed now) or
     `&deferred` (decomposed when the guard reaches it, against fresh facts).
   - Variables `?x`; discarded fact args `?any_x`; method params `?inp_x`; constants `@name`.
   - Wrap even one condition in `(and ...)`; `()` means unconditional.
2. **Compile:** `npm run htn:compile -- src/examples/guard/guard.domain src/examples/guard/guard.htn.ts guardDomain`.
   Errors print as `file:line:col: error code: message`.
   To swap the domain of running agents: `agent.reload(plannerFor(domain))` or `squad.reload(...)` (world kept,
   running step cancelled, plan and pending deferred steps dropped, replan next tick). In the dev server a
   regenerated `.htn.ts` restarts the whole scene instead.
3. **New facts** the domain reads: write them in `GuardBlackboard` (`blackboard.ts`) and update its schema
   comment. Facts are keyed by name and arity; write them whenever the underlying state changes so a replan
   or deferred step in the same tick sees them.
4. **New primitives** `!name`: add an `ActionFactory` to `GUARD_ACTIONS` in `actions.ts` (or pass
   `actions` in `GuardAgentOptions`). An executor implements `start()`, `update(dt)` returning
   `running | done | failed`, and `cancel()`. A step with no executor (or whose factory returns null for its
   arguments) runs as a 0.05 s no-op, as upstream's demo host does; a `diagnostic` event says so once per primitive.
5. **New replan triggers**: in `agent.ts`. The current triggers are plan done/failed, a change in
   visible or remembered targets, and a hearing escalation (a noise after quiet, or the alert becoming
   alarmed; never while a target is visible, if the domain reads `target_visible`), paced by `replanThrottle` (default 0, as upstream); with a
   shared `planBudget` (`GuardSquad` option `budget`) a replan may also wait for a later frame, the step running on. Sight
   and hearing run and replan only if the domain reads their facts (`target_visible`/`last_seen`,
   `heard_noise`/`alert`; callterms: all), so a visitor walking by never cuts the plan of a domain without them,
   and such an agent pays for no line-of-sight checks (its mode stays `patrol`). The reads follow the active
   runner's `domain` object, so a swapped domain gets its senses. A replan while a plan runs plans a
   candidate in a second runner: the same steps and arguments from the current step on → the running step goes
   on with its progress (event `replan` with `kept: true`); different → it is cancelled and the candidate runs.
   No plan keeps the running plan (`onNoPlan: 'keep'`, default) or stops it (`'cancel'`); with nothing running the
   agent retries on the next tick, one planner call per tick (upstream: "retrying next update"; the throttle paces
   only the triggers). A successful empty
   plan plans again in the same tick (`maxPlanningPasses`, default 4). So a trigger costs planning time, not
   progress, when nothing changes for the domain; keep step arguments stable (ids, not live positions).
   To let the domain judge the running step instead (upstream USE_CASES 1), set `activePlan: 'active_plan'`: the
   agent publishes `(running <action> <arguments>...)` and plans that method in its own runner on every tick a step
   runs; a failure cancels the step and replans at once (event `check`). One branch per action, no catch-all:
   `htn:compile -- --check-method active_plan` warns about one at compile time, the agent at run time.
   To let the domain keep the running plan on a replan (continue branches, Killzone 2 / Decima), set
   `continueTask: '!continue'`. A plan that is only `(!continue)` keeps the running plan and its step (event
   `replan` with `continued: true`). The domain reads `(running ...)`, and `(active_plan <name> ...)` between
   `(!begin_plan <name> ...)` and `(!end_plan)`. See `docs/htn-guidance.md`, Replanning.
6. **Test headless** (no Explorer): add a scenario to `test/npc/scenario.test.ts`. Scenarios run the real
   `@dcl/sdk/ecs` engine in Node with the real planner and the generated domain. Then run:
   - `npm test`: all tests, or `npm test -- npc` for these only;
   - `npm run typecheck:tools` and `npx tsc -p tsconfig.json --noEmit`.
7. **Check in Explorer**: `npm run start` in the test scene (capsules, plan text above each NPC).

## Hearing

SDK `AudioSource` notifies nobody, so a sound guards can hear is a **game event** on the scene
`noiseBus`: `{ kind, position, loudness (audible radius, m), time, source }`.

- **Sources.** The local player's footsteps and landings come automatically while a `GuardSquad` or a
  Stalker is spawned (`PlayerNoiseTracker`, `DEFAULT_PLAYER_NOISE`): smoothed horizontal speed → gait; Ctrl-walk
  (< 3 m/s) `steps` 1 m, jog (< 9 m/s) `steps` 7 m, run `run` 12 m; one noise per 0.5 s while moving,
  the first 0.3 s after starting. A landing (> 3 m/s downward for ≥ 0.12 s, then stop) is `land`
  8–14 m. Ambient sound (wind, presence steps, cowbell ambience) is not a noise; guards emit none.
- **Add a noise source** from any game system, without touching npc internals:
  ```ts
  import { emitNoise } from './htn-planner'
  emitNoise({ kind: 'impact', position: { x, y, z }, source: 'branch' }) // loudness defaults by kind
  emitNoise({ kind: 'bell', position: bellPos, loudness: 25, source: 'bell' })
  ```
  Default radii (`NOISE_LOUDNESS`): steps 7, run 12, land 8, impact 10, bell 25, voice 15, test 10.
  A new kind works with the default radius 8 and alert gain 1; add it to `NOISE_LOUDNESS` and
  `DEFAULT_HEARING.alertGain` to tune it.
- **Hearing** (`hearing.ts`): heard if distance ≤ radius (×0.5 behind an occluder when the squad gets a
  `hearingLineOfSight`; off in the scene because SDK raycasts answer a frame late, too late for a one-off
  noise). Perceived level = 1 − distance / radius. Alert += perceived × gain (steps/run 0.5, bell 0.7,
  others 1); one noise with perceived ≥ 0.5 alarms at once and holds it for `alarmHold` (1 s, longer than the
  replan throttle); alarmed at alert ≥ 0.6; decays 0.08/s. The
  alert is separate from sight suspicion: a noise must not make a guard chase blind.
- **Facts.** `(heard_noise ?kind ?position ?time ?loudness)`: one row, the latest noise heard (loudest
  of a tick), `?loudness` = perceived level, `?time` = guard clock. `(alert calm|wary|alarmed)`.
- **Domain** (`guard.domain`): chase > forget stale memory > forget stale noise (12 s) >
  `check_alarming_noise` (alarmed: `!turn_to`, `!listen 0.6` flinch, `!move_to` hurry, or run if perceived
  ≥ 0.75, `!look_around`, `!forget_noise`) > investigate last seen > `listen_to_noise` (faint:
  `!turn_to`, `!listen 2.0`, `!forget_noise`) > patrol. `!forget_noise ?time` keeps a newer noise heard
  meanwhile, so the guard follows a trail hop by hop instead of replanning on every footstep.
- **Mode** `alert` (yellow in `MODE_COLORS`) while a heard noise is remembered.

## Sight by light, and presence

Two `perception.ts` options for a world with light and smell; both off by default.

- **Visibility** (`TargetSample.visibility`, a factor on `PerceptionConfig.range`, default 1): how visible a target
  is now, given by the host per target: its light (level 12: lit 1, shielded 7/9, dark 5/9 of 9 m), camouflage,
  fog. Detection time scales with the target's own range. 0 never sees it (NaN counts as 1, below 0 as 0).
  `sightRange(cfg, target)` gives the range; `inViewCone(..., range)` tests any range (an outer lure ring).
- **Presence** (`PerceptionConfig.presenceRadius`, m): within it a target is sensed all around, without line of
  sight and whatever its visibility: a nose, a sixth sense (level 12: 2.5 m, right on its heels is never safe).
  It feeds the same detection as sight (`target_visible`), so a domain needs nothing new.
- `Perception.senses()` lists each tracked target's range now, how it was sensed (`sight` / `presence`), its
  suspicion and detection; `GuardAgent.lastHeard` keeps the last noise heard. The debugger's sense gizmos draw them.

## Gotchas

- A guard repeating the same plan forever usually means a fact never changes after its action. For
  example, `!set_waypoint` must update `current_waypoint`.
- `decompose` only reads the world state. Primitives change the world through executors and the
  blackboard, never during planning.
- Callterms (`(call f ...)`) run during planning, may run several times, and are not rolled back. Prefer
  facts unless a computation is needed.
- Recursion depth is limited (`maxDepth`, default 8192 call frames counted like upstream: about two per method level).
- `noise-scene.ts` holds module state (the scene bus, the player tracker). Tests share it: a squad starts
  reading at the bus's current position, and a teleport (> 4 m in a frame) resets the tracker.
- Runtime code under `htn/` and `npc/` must stay ES2020, synchronous, and free of `~system/*`
  imports in modules that tests load.
