# HTN planner for Decentraland

A TypeScript port of [urosidoki/htn_planner](https://github.com/urosidoki/htn_planner/tree/aec08fa36f2c521c4da00c045bf23b8aed7bfa92)
with an SDK7 NPC host. Write behaviour in `.domain` files, compile it to TypeScript, and let your scene execute the plan.
The reusable module is `src/htn-planner/`; the scene at **96,-11** demonstrates it with guards, a stalker, squads and a crowd.

## Add it to your scene

Follow the [manual copy setup](src/htn-planner/README.md#install-by-copying): copy the library, domain compiler, notice
command and game-owned guard files into your SDK7 scene. Edit its `.domain` sources and regenerate TypeScript as you
develop the behaviour. Keep your scene's entrypoint, assets and settings. The guide also offers `htn-install.mjs` as an
alternative automated copy with optional reference/testing tools.
Then merge this setup into your scene's `src/index.ts`:

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
Read its module README and follow the manual copy setup, including compiler, notices and game-owned guard files.
Preserve existing game code and merge the setup into main(). Use the automated installer only as an alternative.
Keep my own behaviour, actions and assets outside the library. Read the installed module guide for examples and checks.
```

The alternative installer offers `--reference` for optional examples/assets on disk. The module guide gives the AI a local-first,
version-specific GitHub fallback when that reference folder is absent.

## Explore before integrating

Run `npm install`, then `npm start` here to try the [full demo](DEMO.md). Its **Playgrounds** menu and debugger are example
consumers of the library. They are not installed in your game by default.

The alternative installer's `--reference` option keeps a removable source snapshot under `reference/htn/`, including example assets
and tools. It is excluded from your game's deployment. To use a selected example in the game, adapt just the needed code
and assets into your own runtime folders and keep its applicable notices.

## Measured planning and action work

Recorded on 2026-10-23 at clean source `11d2f5f617a4d127ae0bba8f42431d9c6ce5b740`, Windows 10.0.26300 x64,
Intel Core Ultra 9 275HX (24 logical CPUs), Node 22.22.2. These are elapsed Node timings around CPU work, **microseconds per operation**:

| Workload | Warm p50, two reports | Primary p95 | Primary p99 |
| --- | ---: | ---: | ---: |
| Plan: 3 fact rows, 2 steps | 5.0–5.9 | 14.4 | 24.1 |
| Plan: 624 fact rows, 241 steps | 240.7–308.0 | 375.3 | 441.1 |
| Built-in wait: factory/start/15 updates/done | 0.68–0.71 | 1.54 | 4.13 |
| Built-in move: factory/start/109 updates/done | 18.6–19.8 | 30.2 | 42.0 |
| Tick all 32 patrol guards | 67.2–71.0 | 102.6 | 140.2 |

Each report uses three fresh workers, 30 warm-up batches and 200 measured batches of eight operations. Percentiles
are medians across workers of **batch-mean** percentiles, not individual-operation tails. The p50 column spans two
separate reports; p95/p99 come only from the primary one. Warm medians varied by up to about 22%; these are
observations, not stable speed limits. Initial calls were slower (primary tiny/heavy planning medians 1.55/7.53 ms,
and 8.87 ms for the first 32-guard tick). Forcing all 32 guards to replan every tick measured 106.3–114.3 µs warm p50,
a different workload from executing their existing patrol plans. For loading-phase preparation and staged NPC
activation, follow [Preparation → Ready → Play](src/htn-planner/HOW-TO.md#7-prepare-ai-before-play).

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

The port, host and original tooling are MIT, copyright 2026 Decentraland Foundation. Upstream MIT and other component notices remain
separate. Preserve both library licence files; see the [redistribution instructions](src/htn-planner/README.md#licences-and-deployment).
The installer generates `htn-notices.txt` for deployment. The full demo also includes its example-specific credits there.
