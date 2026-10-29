# HTN authoring tools

Copy this whole folder to `tools/htn-authoring/` beside the [runtime module](../../src/htn-planner/README.md).
It is Node-only authoring code; do not import it from your scene. No compiler source-file selection or runtime npm dependency is needed.
Keep both licence files with it.

## Generate and watch your domains

Copy `htn.config.example.json` to your scene root as `htn.config.json` for the starter, or edit your existing game-owned config.
Each `domains` entry names project-relative `source` and `output` paths plus an optional `exportName`.
Use distinct TypeScript output files and keep the config with your game, not inside this tools folder.

```sh
node tools/htn-authoring/generate.mjs
node tools/htn-authoring/generate.mjs --watch
```

Run from the scene root; `--config path/to/htn.config.json` selects another config whose directory is the project root.
The watcher reads the compiler's exact include list, including relative, absolute and missing paths. It publishes only
changed outputs after every configured domain compiles. READY means generation succeeded, not that Explorer was tested.
On FAILED / STALE, no candidates are published; an open preview may still use its previous bundle. Fix the error and
wait for READY before trying or publishing. Ctrl+C stops watching. A second watcher for the same config is rejected.

Use generation in npm `prestart`, `prebuild` and `predeploy` as described in the module guide. Creator Hub and direct SDK
commands bypass npm hooks: keep the watcher open for Preview, and explicitly generate and check notices before Publish.
The individual compiler commands below remain available for one-off checks and overrides.
Run from your SDK7 scene root:

```sh
node tools/htn-authoring/compiler.cjs src/npc/guard/guard.domain src/npc/guard/guard.htn.ts guardDomain
node tools/htn-authoring/compiler.cjs --check src/npc/guard/guard.domain
node tools/htn-authoring/notices.mjs
node tools/htn-authoring/notices.mjs --check
```

See the module guide for the complete manual copy setup, npm commands and publication exclusions.
The `.domain` source and its includes belong to your game, outside the library and this folder.
The compiler uses the current working directory as your scene root; a launcher may instead set `HTN_REPO_ROOT`.

For maintainers: the source scene pins esbuild 0.18.20 for reproducible preparation; consumers do not need it.
`npm run htn:authoring` prepares the compiler, notices and licence files from source.
`npm run htn:authoring -- --check` verifies their content; scene CI runs this check.
Edit compiler sources under `tools/htn/` and the notice source under `scripts/htn-notices.mjs`, then regenerate.
