# HTN authoring tools

Copy this whole folder to `tools/htn-authoring/` beside the [runtime module](../../src/htn-planner/README.md).
It is Node-only authoring code; do not import it from your scene. No compiler source-file selection or runtime npm dependency is needed.
Keep both licence files with it.

## Generate your domains

Copy `htn.config.example.json` to your scene root as `htn.config.json` for the starter, or preserve your existing config.
Each `domains` entry names project-relative `source` and distinct TypeScript `output` paths plus an optional `exportName`.
Keep this game-owned config outside the tools folder. After editing a source or include, run from the scene root:

```sh
node tools/htn-authoring/generate.mjs
```

The manual setup provides the shorter `npm run htn:generate` command and npm lifecycle hooks.
`--config path/to/htn.config.json` selects another config whose directory is the project root.
See [generation and Creator Hub](../../src/htn-planner/README.md#domain-generation-and-preview) for Preview, errors and Publish checks.
For frequent edits, `--watch` is available through the [optional watcher](../../src/htn-planner/README.md#optional-watch).

The individual compiler commands below remain available for checks and overrides. Run from your SDK7 scene root:

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
