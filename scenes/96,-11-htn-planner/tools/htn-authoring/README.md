# HTN authoring tools

Copy this whole folder to `tools/htn-authoring/` beside the [runtime module](../../src/htn-planner/README.md).
It is Node-only authoring code; do not import it from your scene. No compiler source-file selection or runtime npm dependency is needed.
Keep both licence files with it.

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
