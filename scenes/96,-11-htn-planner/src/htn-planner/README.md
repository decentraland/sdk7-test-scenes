# HTN NPC module

Use this folder for planning and SDK7 NPC execution. Examples, debugger UI, tests and Node tools are separate consumers.
A capsule guard needs no model, audio, gallery or debugger assets.

## Install

From a downloaded checkout of the HTN demo scene, run:

```sh
node scripts/htn-install.mjs /path/to/your-sdk7-scene --starter
```

Use Node 22 or newer and an existing SDK7 scene. The installer preserves your entrypoint, scene settings, assets,
dependencies and existing SDK/project instructions. Different module files require an explicit `--update`; conflicting
npm commands fail before writing. A partially existing starter also stops installation, so your domain is never mixed with
a generated file from another behaviour. It adds:

| Location in your project | Purpose |
| --- | --- |
| `src/htn-planner/` | Library, this guide, HOW-TO and both licence files. |
| `tools/htn/` | Only the compiler's source dependencies and licences; excluded from deployment. |
| `scripts/htn-compile.mjs`, `scripts/htn-notices.mjs` | Local authoring commands; excluded from deployment. |
| `src/npc/guard/` with `--starter` | Your initial domain, its include and generated module. Keep/customize these. |
| `reference/htn/` with `--reference` | Optional source examples, assets, tests, tools and guidance. Entirely removable. |

It adds `htn:compile` and `htn:notices` npm commands, chains notice generation before your existing build/deploy hooks,
and adds deployment exclusions. Install your scene dependencies normally; esbuild is supplied by the SDK toolchain.
Your TypeScript project should include `src/`; if you use a broad `**/*` include, exclude `reference/htn` and `tools/htn`.

Add the [complete guard recipe](HOW-TO.md#1-a-capsule-guard) to your existing `main()`, then run your normal preview.
The squad installs its own update system. Try the patrol, approach the guard, then move away; this is an Explorer check,
not something a successful build proves.

Optional authoring helpers: `--testing` installs `npm run htn:check` and the
[testing guide](../../docs/consumer-testing.md); `--benchmark` installs `npm run htn:measure` and the
[benchmark guide](../../docs/consumer-benchmark.md). These local guide links become available only after installing
the corresponding option. Before installation, read the guide from the source URL in `SOURCE.json`, appending
`docs/consumer-testing.md` or `docs/consumer-benchmark.md`.

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

If that folder is absent or lacks the example, read it from GitHub. The installer writes `SOURCE.json` next to this file,
with a `url` for the installed module. `pinned: true` identifies an exact checkout commit; append the example's relative path
to that URL. A ZIP or unrelated parent repository has `pinned: false` and a moving branch URL: verify its version before use.
`localChanges: true`
means the source checkout had uncommitted changes, so the linked commit is only its base. Without that metadata, use the
[public module source](https://github.com/decentraland/sdk7-test-scenes/tree/feat/htn-planner-port/scenes/96,-11-htn-planner)
and check its version before applying an example. If online material is inaccessible, say what could not be read.

Keep the reference snapshot outside runtime imports. Adapt just the code and assets you choose to use into your own
`src/` and `assets/` folders, fix their paths and preserve applicable notices. Reading one example does not require
installing the full demo. You can delete `reference/htn/` at any time without changing your game's entrypoint.

## Update

Run the installer from the desired new source version with `--update`. It replaces installed library/compiler files
and refreshes source metadata; existing `src/npc/guard/` files are yours and remain untouched, even with `--starter`.
Keep your domains, action factories, facts, models and scene wiring outside `src/htn-planner/`.
Recompile your domains after updating and check them in your game. For a source layout change, compare the old and new file lists before removing obsolete library files: `--update`
does not delete them. Review each path against your game imports and ownership; an ambiguous cleanup needs a separate
change, not automatic deletion. Keep the previous source pin so you can reproduce or roll back the update.

To update a reference snapshot, remove its entire folder and reinstall with `--reference`. Its files are optional copies;
keep any adaptations you need in game-owned files before removing it.

## Version, provenance and release checks

This source scene declares package version `1.0.0` and pins upstream **2.4.0** at
[`aec08fa36f2c521c4da00c045bf23b8aed7bfa92`](https://github.com/urosidoki/htn_planner/tree/aec08fa36f2c521c4da00c045bf23b8aed7bfa92).
Use the installed `SOURCE.json.ref` for the exact port revision; package version alone does not identify its code.
Authoring/install commands are tested and recommended on **Node 22+** (hosted CI uses Node 24); the source package
declares an engine floor of Node 20, which is not independently validated here. The scene uses **SDK 7.30.1**
and ES2020 runtime output.
Changing SDK or client versions calls for another build and client check. This is a TypeScript port plus an SDK host,
not an API-identical C++ package: native allocators/ABI are inapplicable, and stored unused facts and host policies differ.
[Semantics and conformance](htn/README.md) document the boundary. A separate AI skill is not required by this installation.

For a maintained update or release:

1. Record the port commit, upstream pin, Node/SDK versions and `SOURCE.json` flags. `pinned: false` or
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
removes unused code from the bundle; `.dclignore` separately controls raw files uploaded by the SDK. The installer sets
both sides up for its copied files. Its exclusions do not hide assets already used by your game.

For deeper integration, read the [planner reference](htn/README.md) and [NPC host reference](npc/README.md).
