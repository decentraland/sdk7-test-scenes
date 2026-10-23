# HTN planner for Decentraland

A TypeScript port of [urosidoki/htn_planner](https://github.com/urosidoki/htn_planner/tree/aec08fa36f2c521c4da00c045bf23b8aed7bfa92)
with an SDK7 NPC host. Write behaviour in `.domain` files, compile it to TypeScript, and let your scene execute the plan.
The reusable module is `src/htn-planner/`; the scene at **96,-11** demonstrates it with guards, a stalker, squads and a crowd.

## Add it to your scene

From this scene's directory, with Node 22 or newer:

```sh
node scripts/htn-install.mjs /path/to/your-sdk7-scene --starter
```

This installs the library, the domain compiler and licence-notice command. `--starter` also adds a game-owned capsule-guard
behaviour under `src/npc/guard/`. Your scene's entrypoint and existing assets stay yours.
Then add this to your scene's `src/index.ts`:

```ts
import { createCapsuleBody, GuardSquad, plannerFor, v3 } from './htn-planner'
import { guardDomain } from './npc/guard/guard.htn'

export function main() {
  const guards = new GuardSquad({ planner: plannerFor(guardDomain), reasoning: 'reasoning' })
  guards.spawn([{ id: 'guard', route: [v3(4, 0, 4), v3(12, 0, 4), v3(12, 0, 12)], body: createCapsuleBody }])
}
```

Merge the spawn into your existing `main()` when you already have one. Run your normal preview: the capsule patrols its route
and chases the local player when detected. Call `guards.despawn()` when your game removes this encounter.
The squad registers its own update system; no additional `engine.addSystem` call is needed.

Read the [module README](src/htn-planner/README.md) for installation options, updates and optional references, and
[HOW-TO](src/htn-planner/HOW-TO.md) for your own entity, facts/actions, standalone planning and optional tracing.

## Ask an AI to integrate it

```text
Install the HTN module from <module-source-folder> into this SDK7 scene.
Read its README and use its installer with --starter. Preserve existing game code and merge the setup into main().
Keep my own behaviour, actions and assets outside the library. Read the installed module guide for examples and checks.
```

Add `--reference` if you want the optional examples/assets on disk. The module guide gives the AI a local-first,
version-specific GitHub fallback when that reference folder is absent.

## Explore before integrating

Run `npm install`, then `npm start` here to try the [full demo](DEMO.md). Its **Playgrounds** menu and debugger are example
consumers of the library. They are not installed in your game by default.

Add `--reference` to the install command to keep a removable source snapshot under `reference/htn/`, including example assets
and tools. It is excluded from your game's deployment. To use a selected example in the game, adapt just the needed code
and assets into your own runtime folders and keep its applicable notices.

## Measured planning and action work

Recorded on 2026-10-23 at clean source `eac4363f24c7446db054dc43606de4baf867bbf5`, Windows x64,
Intel Core Ultra 9 275HX, Node 22.22.2. These are elapsed Node timings around CPU work, **microseconds per operation**:

| Workload | Warm p50, two reports | Primary p95 | Primary p99 |
| --- | ---: | ---: | ---: |
| Plan: 3 fact rows, 2 steps | 5.6–6.2 | 14.5 | 32.5 |
| Plan: 624 fact rows, 241 steps | 188.5–232.7 | 295.1 | 333.7 |
| Built-in wait: factory/start/15 updates/done | 0.43–0.54 | 1.19 | 2.33 |
| Built-in move: factory/start/109 updates/done | 12.3–18.3 | 17.1 | 36.0 |
| Tick all 32 patrol guards | 46.7–53.2 | 88.1 | 111.8 |

Each report uses three fresh workers, 30 warm-up batches and 200 measured batches of eight operations. Percentiles
are medians across workers of **batch-mean** percentiles, not individual-operation tails. The p50 column spans two
separate reports; p95/p99 come only from the primary one. Several confirmation medians moved by roughly 10–50%.
Initial calls were slower (tiny/heavy planning medians 1.33/4.85 ms). Forcing all 32 guards to replan every tick
measured 120.5–142.4 µs warm p50, a different workload from executing their existing patrol plans.

Wait/move advance simulated time without sleeping; their durations are not CPU seconds. The move is flat-terrain
kinematic steering. These measurements exclude renderer/ECS writes, models, real raycasts, physics, networking and
pathfinding; they establish no Explorer FPS, universal per-action cost or NPC capacity.
[Method, full nine-workload table and reproduction commands](docs/performance-measurements.md) distinguish planning,
preplanned dispatch/deferred expansion, action lifecycles and whole-host ticks. Run `npm run htn:perf` in the source
checkout to reproduce; installed consumer planning measurements use the separate optional `htn:measure` command.

## Documentation

- [Module installation and AI handoff](src/htn-planner/README.md)
- [Integration recipes and a small-domain authoring example](src/htn-planner/HOW-TO.md)
- [Demonstration, debugger and repository-only CLI tools](DEMO.md)
- [Domain design and host contracts](docs/htn-guidance.md)
- [Example catalogue](docs/htn-examples-catalog.md)
- [Planner semantics and limitations](src/htn-planner/htn/README.md#planner-limitations)

The planner does not simulate action effects or repair part of a plan. Your executors change the world; each replan builds
another whole plan. Start with a small working behaviour and consult the limitations before adapting it.

For source-checkout verification, run `npm run htn:ci`: notices, headless tests, types, root-domain checks, lint and
strict running-plan checks. A passing run is separate from trying the intended encounter in a target client.

## Licences

The port, host and original tooling are MIT, copyright 2026 Vitaly Popuzin. Upstream MIT and other component notices remain
separate. Preserve both library licence files; see the [redistribution instructions](src/htn-planner/README.md#licences-and-deployment).
The installer generates `htn-notices.txt` for deployment. The full demo also includes its example-specific credits there.
