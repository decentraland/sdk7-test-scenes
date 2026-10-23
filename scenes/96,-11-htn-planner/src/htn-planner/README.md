# HTN NPC module

Use this folder for planning and SDK7 NPC execution. Examples, debugger UI, tests and Node tools are separate consumers.
A capsule guard needs no model, audio, gallery or debugger assets.

## Install by copying

Start with an existing SDK7 scene and a downloaded, versioned copy of this source scene. Use Node 22+ for authoring
commands. Keep your scene's entrypoint, assets, settings, dependencies and project instructions. Copy these paths
relative to the source scene; create destination folders as needed:

| From this source scene | Into your scene |
| --- | --- |
| Entire `src/htn-planner/` | Same path, including `LICENSE` and `LICENSE.htn_planner`. |
| Compiler files below, plus `tools/htn/LICENSE` and `tools/htn/LICENSE.htn_planner` | Same `tools/htn/` paths; authoring only. |
| `scripts/htn-compile.mjs`, `scripts/htn-notices.mjs` | Same paths; authoring only. |
| `src/examples/guard/guard.domain`, `guard_kit.domain`, `guard.htn.ts` | All three into `src/npc/guard/`; these belong to your game. |

Copy these **13 compiler files** from `tools/htn/` (the runner, viewer and catalogues are not needed):

```text
ast.ts             check-methods.ts  cli.ts          compiler.ts
diagnostics.ts     emit.ts           lexer.ts        linker.ts
loader.ts          parser.ts         reachability.ts validator.ts
worldstate.ts
```

Install your SDK scene dependencies normally. The compiler uses `esbuild` from the existing SDK toolchain; there is
no new runtime npm package. Keep TypeScript's include scoped to `src/`; if it uses `**/*`, exclude `tools/htn` and any
`reference/htn` folder.

Merge these entries into `package.json`'s `scripts`, preserving its other commands:

```json
"htn:compile": "node scripts/htn-compile.mjs",
"htn:notices": "node scripts/htn-notices.mjs"
```

Run `npm run htn:notices` before both build and deploy: set `prebuild`/`predeploy` to it when absent, or prepend
`npm run htn:notices && ` to each existing hook without removing that hook's command. Resolve an existing different
`htn:compile` or `htn:notices` command before replacing it.

Append these support-file exclusions to your existing `.dclignore` (keep its existing game exclusions):

```text
src/htn-planner
tools/htn
scripts/htn-compile.mjs
scripts/htn-notices.mjs
src/npc/guard/*.domain
reference/htn
```

The SDK bundles imported TypeScript into `bin/`; these exclusions keep authoring sources out of the raw deployment.
Do **not** exclude the generated root `htn-notices.txt`. Generate and check it after copying:

```sh
npm run htn:compile -- --check src/npc/guard/guard.domain
npm run htn:compile -- src/npc/guard/guard.domain src/npc/guard/guard.htn.ts guardDomain
npm run htn:notices
npm run htn:notices -- --check
```

Edit your `guard.domain` and its `guard_kit.domain` include, then regenerate `guard.htn.ts`; do not edit generated code
by hand. Commit these game-owned sources/output together. Record the source repository URL and full commit in your
game's README or source note, including any local changes; manual copying does not create `SOURCE.json` automatically.
Keep that pin for examples and future updates.

Add the [complete guard recipe](HOW-TO.md#1-a-capsule-guard) to your existing `main()`, then run your normal build and
preview. The squad installs its own update system. Try the patrol, approach the guard, then move away; this is an
Explorer check, not something a successful build proves. For encounter startup, follow
[Preparation → Ready → Play](HOW-TO.md#7-prepare-ai-before-play).

### Alternative: automated copy

From the downloaded source scene, run:

```sh
node scripts/htn-install.mjs /path/to/your-sdk7-scene --starter
```

This performs the copy, npm hooks, exclusions, notices and source metadata setup above. It preserves the entrypoint,
settings, assets and existing instructions. Conflicting npm commands or a partial starter stop before writing;
different module files require `--update`. A complete existing `src/npc/guard/` stays game-owned and is not replaced.

Optional conveniences: `--reference` copies removable examples/assets into `reference/htn/`; `--testing` adds
`htn:check` and the [testing guide](../../docs/consumer-testing.md); `--benchmark` adds `htn:measure` and the
[benchmark guide](../../docs/consumer-benchmark.md). Those local guide links exist only when their option is installed.
Otherwise read them at your recorded source commit (or the `SOURCE.json.url` from automated installation).

## Choose the right planning contract

| Constraint | Consequence for your game |
| --- | --- |
| Total-order tasks, ordered branches; no cost-optimal search | Put intended priorities in branch order. Host-ranked candidate facts can select a target; they do not optimise a whole plan. |
| No simulated primitive effects | Planning `!pick_up` does not change inventory. Pass a known result as an argument, end the plan, or use `&task` for a decision after execution. |
| A selected condition commits | Fact/axiom alternatives are searched within that condition when enabled. Later task failure does not reopen them; `mode.branches` can try the next branch. Both backtracking options default to on. |
| No plan repair or MTR comparison | Replanning builds a whole candidate. `GuardAgent` can keep an equivalent remaining plan; opt-in `continueTask` expresses commitment, and `activePlan` checks validity. These host policies do not repair a plan. |
| Callterms execute immediately | Their writes survive failed search; they may run repeatedly. Prefer read-only queries. Never spend, spawn or delete as a condition's side effect; a thrown exception escapes planning under every error policy. |
| Bounded decomposition | `maxDepth` defaults to 8192 call frames; exhaustion returns `depth_exceeded`. Give recursion a base case and progress, and bound host loops/deferred execution too. |
| Warm storage reuse has limits | `PlanRunner` reuses search buffers. New values, changed steps, deferred expansions, host code, diagnostics and tracing can allocate. `decompose()` creates a fresh engine per call. Measure your workload. |
| Local NPC execution | The SDK adapter simulates NPCs on one client. Your game owns multiplayer authority, synchronization and conflict handling. |
| Headless checks are models | Plans, paper hosts and Node timings do not establish movement, rendering, networking or frame cost in a target client. Preview the actual encounter there. |

The [planner reference](htn/README.md#semantics-checklist-verify-against-upstream-do-not-guess) gives precise language,
error and value-ownership rules. The [NPC reference](npc/README.md) describes executor lifecycle and host policies.
Start a small domain with the [worked authoring recipe](HOW-TO.md#6-design-and-check-a-small-domain).

## Examples for people and AI

For integration, customization or debugging, start with [HOW-TO](HOW-TO.md).
For a source example, first look in your project's optional `reference/htn/` snapshot:
`src/examples/`, `src/playground/`, `src/debugger/` and `docs/`. These are reference sources, not your game entrypoint.

If that folder is absent or lacks the example, use your recorded source commit on GitHub. Automated installation also
writes `SOURCE.json` next to this file,
with a `url` for the installed module. `pinned: true` identifies an exact checkout commit; append the example's relative path
to that URL. A ZIP or unrelated parent repository has `pinned: false` and a moving branch URL: verify its version before use.
`localChanges: true`
means the source checkout had uncommitted changes, so the linked commit is only its base. Without a recorded commit or that metadata, use the
[public module source](https://github.com/decentraland/sdk7-test-scenes/tree/feat/htn-planner-port/scenes/96,-11-htn-planner)
and check its version before applying an example. If online material is inaccessible, say what could not be read.

Keep the reference snapshot outside runtime imports. Adapt just the code and assets you choose to use into your own
`src/` and `assets/` folders, fix their paths and preserve applicable notices. Reading one example does not require
installing the full demo. You can delete `reference/htn/` at any time without changing your game's entrypoint.

## Update

Copy the library/compiler files from the desired source revision using the same list above; preserve your game-owned
`src/npc/guard/`, actions, facts, assets and scene wiring. Alternatively run the installer with `--update`; it refreshes
module files/metadata and leaves a complete existing guard unchanged, even with `--starter`.
Recompile your domains after updating and check them in your game. Compare old/new file lists before removing obsolete
library files; automated `--update` does not delete them. Review each path against your game imports and ownership; an ambiguous cleanup needs a separate
change, not automatic deletion. Keep the previous source pin so you can reproduce or roll back the update.

To update a reference snapshot, remove its entire folder and reinstall with `--reference`. Its files are optional copies;
keep any adaptations you need in game-owned files before removing it.

## Version, provenance and release checks

This source scene declares package version `1.0.0` and pins upstream **2.4.0** at
[`aec08fa36f2c521c4da00c045bf23b8aed7bfa92`](https://github.com/urosidoki/htn_planner/tree/aec08fa36f2c521c4da00c045bf23b8aed7bfa92).
Use your recorded source commit (or installed `SOURCE.json.ref`) for the exact port revision; package version alone does not identify its code.
Authoring/install commands are tested and recommended on **Node 22+** (hosted CI uses Node 24); the source package
declares an engine floor of Node 20, which is not independently validated here. The scene uses **SDK 7.30.1**
and ES2020 runtime output.
Changing SDK or client versions calls for another build and client check. This is a TypeScript port plus an SDK host,
not an API-identical C++ package: native allocators/ABI are inapplicable, and stored unused facts and host policies differ.
[Semantics and conformance](htn/README.md) document the boundary. A separate AI skill is not required by this installation.

For a maintained update or release:

1. Record the port commit, upstream pin, Node/SDK versions and any `SOURCE.json` flags. `pinned: false` or
   `localChanges: true` needs the actual source snapshot alongside the commit to be reproducible.
2. Review runtime/compiler changes together. Recompile your game-owned `.domain` sources; generated method IDs and
   deferred steps belong to one compiled revision. Reload through the host; do not reuse old plan steps.
3. In the source checkout, regenerate committed examples with `npm run htn:examples` and run `npm run htn:ci`.
   Inspect generated and baseline diffs. For a changed conformance expectation, retain its upstream test locator;
   regenerate golden plans from the independently built pinned C++ driver (`npm run htn:golden`, source conformance
   guide), never from the TypeScript result being tested. A matching self-generated plan is only a regression check.
4. In a clean consumer, install/update, compile a customized game-owned domain, run installed `htn:check` cases when
   `--testing` is selected, build with the SDK and check `npm run htn:notices -- --check`. Verify the entrypoint,
   customized behaviour and runtime assets remain yours, and development/reference files are excluded from publication.
5. Preserve both library licences and any promoted example/asset notices. Inspect domain headers,
   `src/examples/canon/THIRD_PARTY_NOTICES.md` and asset `SOURCES.md` through the source route below. No notice generator
   infers third-party rights. Report CI/headless checks, production build and target-client smoke as separate evidence.

`htn:ci`, example generation and the C++ golden driver are source-checkout commands, not installed consumer commands.
The optional testing and benchmark guides match the installer revision; update them with the same source. Keep any
future separately distributed skill pinned to that module/tool version rather than assuming a moving example is compatible.

## Licences and deployment

Keep both `LICENSE` and `LICENSE.htn_planner` with the library and compiler. The original port/host contributions are MIT,
copyright 2026 Vitaly Popuzin; the complete upstream MIT notice remains separate. Other copied materials retain their terms.

Run `npm run htn:notices` to generate `htn-notices.txt`, then `npm run htn:notices -- --check` to verify it is current and
included in the SDK deployment list. Keep it tracked in Git and deployed. In the full demo the generator also includes
the canonical example notices; optional reference-only copies in a consumer do not require shipping their unused assets.
When you promote an example into runtime, carry its applicable notices too; this generator is not a licence scanner.

The compiler, reference sources and their assets belong on disk for authoring, not in your deployed game. Tree shaking
removes unused code from the bundle; `.dclignore` separately controls raw files uploaded by the SDK. Use the manual
exclusions above or let the alternative installer add them; keep assets used by your game published.

For deeper integration, read the [planner reference](htn/README.md) and [NPC host reference](npc/README.md).
