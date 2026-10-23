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
Recompile your domains after updating and check them in your game. For a source layout change, consult its release diff
and remove obsolete module files; the installer does not delete files from your project.

To update a reference snapshot, remove its entire folder and reinstall with `--reference`. Its files are optional copies;
keep any adaptations you need in game-owned files before removing it.

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
