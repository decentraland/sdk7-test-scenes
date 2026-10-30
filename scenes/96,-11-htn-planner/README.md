# HTN planner for Decentraland

Give NPCs tasks such as patrol, investigate a noise or chase a player, with different ways to carry them out.
Write behaviour in `.domain` files, compile it to TypeScript, and let your scene execute the plan.
This [TypeScript port of urosidoki/htn_planner](https://github.com/urosidoki/htn_planner/tree/aec08fa36f2c521c4da00c045bf23b8aed7bfa92)
includes an SDK7 NPC host. A first capsule guard needs no models or audio.

The SDK host runs NPCs on the local client. Your game owns multiplayer authority and synchronization.
The reusable module is `src/htn-planner/`; the full demonstration scene is a separate consumer.

```mermaid
flowchart LR
    Rules["Behavior rules<br/>Tasks and alternative ways to do them"]
    Facts["Game state<br/>What the NPC knows"]
    subgraph Module["HTN module"]
        Planner["Planner<br/>Choose a suitable plan"]
        Host["NPC host<br/>Execute the plan"]
        Planner -->|"Action steps"| Host
    end
    Rules --> Planner
    Facts --> Planner
    Host --> Actions["Your scene<br/>Movement, sound, interactions"]
    Actions -->|"Update game state"| Facts
```

When the world changes, the host can replan using fresh facts.

## Install with an AI agent

Give your coding agent this prompt:

```text
Add the HTN NPC module to this Decentraland SDK7 scene.

Installation and guides:
https://github.com/decentraland/sdk7-test-scenes/blob/main/scenes/96,-11-htn-planner/README.md

1. Read the linked README and its module guide. Clarify any unspecified NPC
   behaviour and multiplayer needs with me.
2. Follow the manual copy setup, including the domain compiler, notices and
   game-owned guard files. Keep existing code, assets, settings, npm commands
   and project instructions. The automated installer is an alternative.
3. Adapt the guard or use a matching HOW-TO recipe. Keep my behaviour, actions
   and assets outside the library. After changing .domain sources or includes,
   run npm run htn:generate before previewing. Preserve the source commit and
   licences. Find examples through the module guide.
4. Run the relevant available checks and build. Report what was connected,
   checks passed, and how I can try the behaviour in Explorer. Keep client
   verification separate from headless results.
```

## Add it to your scene

### 1. Copy

Follow the [manual copy setup](src/htn-planner/README.md#install-by-copying) in an existing SDK7 scene.
It lists the library, compiler, notice command and game-owned guard files to copy, plus npm hooks and deployment exclusions.
Keep your scene's entrypoint, assets and settings. The guide also offers an optional automated installer.

### 2. Configure the behaviour

Edit your `src/npc/guard/guard.domain` and its `guard_kit.domain` include, then run:

```sh
npm run htn:generate
```

The generated TypeScript triggers SDK hot reload if Preview is open; otherwise start your normal Preview.
The game-owned `htn.config.json` lists generation targets. Commit the config, sources and generated output together.
See the [generation workflow](src/htn-planner/README.md#domain-generation-and-preview) for errors and direct Creator Hub Publish,
or the [optional watcher](src/htn-planner/README.md#optional-watch) for frequent edits.

### 3. Connect

Merge this setup into your scene's `src/index.ts`, using your existing `main()` when you have one:

```ts
import { createCapsuleBody, GuardSquad, plannerFor, v3 } from './htn-planner'
import { guardDomain } from './npc/guard/guard.htn'

export function main() {
  const guards = new GuardSquad({ planner: plannerFor(guardDomain), reasoning: 'reasoning' })
  guards.spawn([{ id: 'guard', route: [v3(4, 0, 4), v3(12, 0, 4), v3(12, 0, 12)], body: createCapsuleBody }])
}
```

The squad registers its own update system. Call `guards.despawn()` when your game removes this encounter.

### 4. Try it

Run your normal build and preview. The capsule patrols its route and chases the local player when detected.
Approach it, move away and check that the result fits your game. A successful build does not prove the encounter works in Explorer.
For loading-phase preparation and staged activation, see [Preparation → Ready → Play](src/htn-planner/HOW-TO.md#7-prepare-ai-before-play).

## Project containers (C2)

```mermaid
flowchart LR
    Creator(["`**Creator**
Game author
Edits behavior and runs tools`"])
    subgraph Project["`**SDK7 game project**
Development and runtime artifacts`"]
        Sources["`**Behavior sources**
Game-owned file artifacts
.domain files and includes
Generation targets in configuration`"]
        Authoring["`**HTN authoring tool**
Node.js application / htn:generate
Reads configured sources
Compiles behavior modules`"]
        Generated["`**Generated behavior**
TypeScript file artifacts
.htn.ts modules exporting DomainIR`"]
        Build["`**SDK build**
Node.js application / SDK7 toolchain
Bundles game, HTN and behavior
Produces the scene JavaScript`"]
        Runtime["`**Scene application**
JavaScript / SDK7
Game integration and HTN library
Executes NPC plans`"]
        Sources -->|"`Source text, includes
Target configuration`"| Authoring
        Authoring -->|"`Compiles and writes`"| Generated
        Generated -->|"`TypeScript
build input`"| Build
        Build -->|"`Produces
bin/index.js`"| Runtime
    end
    Client["`**Decentraland client**
External application
Rendering, input and scene APIs`"]
    Creator -->|"`Edits`"| Sources
    Creator -->|"`Runs generation`"| Authoring
    Runtime -->|"`Uses scene APIs`"| Client

    classDef game fill:#fff0d5,stroke:#c88719,color:#172033;
    classDef artifact fill:#fff8e8,stroke:#b49861,color:#172033;
    classDef application fill:#dceeff,stroke:#3975aa,color:#172033;
    classDef external fill:#eeeeee,stroke:#777777,color:#172033;
    class Creator game;
    class Sources,Generated artifact;
    class Authoring,Build,Runtime application;
    class Client external;
```

Authoring and build run during development; the client executes the resulting scene JavaScript. Arrows name file inputs,
build results or interface use, not network services or deployment boundaries. See [runtime components](src/htn-planner/HOW-TO.md#runtime-components-c3).

## Make your own behaviour

Start with the [small-domain authoring example](src/htn-planner/HOW-TO.md#6-design-and-check-a-small-domain),
then use the [integration recipes](src/htn-planner/HOW-TO.md) for your own entity, facts and actions.
[Domain design guidance](docs/htn-guidance.md) covers priorities, fact ownership, interrupted tasks and host contracts.

The planner does not simulate action effects or repair part of a plan. Your executors change the world; each replan builds
another whole plan. Read the [planning contract](src/htn-planner/README.md#choose-the-right-planning-contract) before adapting a behaviour.

## Examples and the demo

Use the [example catalogue](docs/htn-examples-catalog.md) to find a matching domain.
The [module guide](src/htn-planner/README.md#examples-for-people-and-ai) explains where to find local references and,
when absent, examples at the matching source revision on GitHub.

To explore the full scene at **96,-11**, run `npm install`, then `npm start` here.
[Ambush with an animated primitive stalker starts by default](DEMO.md#the-playground); the **Playgrounds** menu offers the other lessons.
The demo, debugger UI, examples and their assets are separate consumers, not required parts of your game.

The alternative installer's `--reference` option keeps a removable source snapshot in `reference/htn/`, excluded from deployment.
Adapt only the code and assets you choose to use into your game's folders, preserving applicable notices.

## Debug and test

For a behaviour that picks the wrong plan or gets stuck, use [domain debugging](docs/htn-guidance.md#testing-and-debugging).
The [demo guide](DEMO.md) covers the in-scene debugger and repository CLI tools.
For game-owned cases, use the optional [consumer testing tools](docs/consumer-testing.md).

For source-checkout verification, run `npm run htn:ci`: notices, headless tests, types, root-domain checks, lint and
strict running-plan checks. Keep headless results separate from checking movement and feedback in a target client.
Regenerate committed modules when their `.domain` sources change.

### Optional source-checkout tools

The source scene also keeps tools for developing and checking the port. Use the [demo/tool guide](DEMO.md#develop)
when you need them; the three-folder manual integration does not require this whole toolbox.

- **Demonstration:** `src/examples/`, `src/playground/` and `src/debugger/` provide the runnable lessons and SDK UI.
  The full scene imports them; a minimal consumer imports only its chosen behaviour and the library.
- **Offline authoring and diagnostics:** `tools/htn/`, `tools/lint/`, `tools/viewer/` and `tools/vscode-htn/` provide
  compiler sources, lint, an offline HTML session viewer (`elkjs` layout) and optional editor support.
- **Verification and measurements:** `src/htn-testing/`, `tools/consumer/`, `tools/upstream-golden/`, `benchmarks/`
  and the lab/variant helpers in `scripts/` support scenarios, C++ reference plans and performance comparisons.

The Node/editor/C++ tools are outside game runtime imports. `.dclignore` excludes their raw files; runtime imports
separately determine what enters JavaScript. Installer `--testing` and `--benchmark` copy only their documented
consumer tools, while `--reference` keeps an optional source snapshot outside runtime imports.

## Reference and updates

- [Module installation, updates and source-version tracking](src/htn-planner/README.md)
- [Planner language, semantics and limitations](src/htn-planner/htn/README.md)
- [NPC host, executor lifecycle and integration options](src/htn-planner/npc/README.md)
- [Measure planning in your own domain](docs/consumer-benchmark.md)

Keep runtime code independent of demonstration levels and Node-only authoring tools.
Use the relevant tool's `--help` for its available commands and options.

## Measured deployment size

SDK 7.30.1 production builds measured on 2026-10-29 (Node 22.22.2).
These are uncompressed publishable-file bytes, not memory use or a fixed library package size.

| Build | Published total | JavaScript |
| --- | ---: | ---: |
| Primitive demo at `a40690d`, 5 files | 1,484,690 B | 1,460,878 B |
| Previous GLTF/audio demo at `2c333f3`, 17 files | 5,905,114 B | 1,463,902 B |
| README capsule guard, installed with `--starter` at `6729cd8` | 395,905 B | 393,113 B |
| Same consumer with an empty `main()` at `6729cd8` | — | 259,397 B |

The historical primitive build above removed 4,420,424 B (about 75%) from the full demo.
The current demo keeps the model excluded and restores the 298,056 B of footsteps and voice audio.
Ambush animates primitive joint Transforms and runs the same stalker domain. The historical size rows
above predate the audio restoration; reproduce the current deployment size after building. See the
[GLTF Animator replacement recipe](src/htn-planner/HOW-TO.md#switch-your-gltf-animation-clips) for your own skinned character.

In the matched consumer baseline, the capsule adds 133,716 B of JavaScript over the empty scene:
tree-shaken HTN, its guard domain and the SDK APIs they reach. It publishes no demo examples or debugger.
Reproduce with `npm run build -- --production --skip-install` (including the notice hook) and the SDK publishable-file inventory;
repeat after changing SDK versions, behaviour or imports. The source checkout and optional authoring/reference folders are separate from deployment.

## Measured planning and action work

Recorded on 2026-10-23 at source `11d2f5f617a4d127ae0bba8f42431d9c6ce5b740`, Windows x64,
Intel Core Ultra 9 275HX, Node 22.22.2. Warm p50 ranges across two reports, in **microseconds per operation**:

| Workload | Warm p50 |
| --- | ---: |
| Plan: 3 fact rows, 2 steps | 5.0–5.9 |
| Plan: 624 fact rows, 241 steps | 240.7–308.0 |
| Built-in wait: factory/start/15 updates/done | 0.68–0.71 |
| Built-in move: factory/start/109 updates/done | 18.6–19.8 |
| Tick all 32 patrol guards | 67.2–71.0 |

These elapsed Node timings describe batch means around CPU work. First calls were slower: about 1.55/7.53 ms for tiny/heavy
planning and 8.87 ms for the first 32-guard tick. They exclude rendering/ECS writes, real raycasts, physics, networking and
pathfinding; they establish no Explorer FPS or NPC capacity. Wait/move advance simulated time without sleeping.
The [full measurements](docs/performance-measurements.md) retain p95/p99, cold/warm results, method and reproduction commands.
Use `npm run htn:perf` in the source checkout, or optional `htn:measure` in an installed consumer.

## Licences

The port, host and original tooling are MIT, copyright 2026 Decentraland Foundation. Upstream MIT and other component notices remain
separate. Preserve both library licence files; see the [redistribution instructions](src/htn-planner/README.md#licences-and-deployment).
The notice command generates `htn-notices.txt` for deployment. The full demo also includes its example-specific credits there.
