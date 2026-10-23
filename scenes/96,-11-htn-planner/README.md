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

## Documentation

- [Module installation and AI handoff](src/htn-planner/README.md)
- [Integration recipes](src/htn-planner/HOW-TO.md)
- [Demonstration, debugger and repository-only CLI tools](DEMO.md)
- [Domain design and host contracts](docs/htn-guidance.md)
- [Example catalogue](docs/htn-examples-catalog.md)
- [Planner semantics and limitations](src/htn-planner/htn/README.md#planner-limitations)

The planner does not simulate action effects or repair part of a plan. Your executors change the world; each replan builds
another whole plan. Start with a small working behaviour and consult the limitations before adapting it.

## Licences

The port, host and original tooling are MIT, copyright 2026 Vitaly Popuzin. Upstream MIT and other component notices remain
separate. Preserve both library licence files; see the [redistribution instructions](src/htn-planner/README.md#licences-and-deployment).
The installer generates `htn-notices.txt` for deployment. The full demo also includes its example-specific credits there.
