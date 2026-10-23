# HTN module and demonstration scene

For library use or host integration, start with [README.md](README.md), the
[runtime reference](src/htn-planner/htn/README.md) and
[agent reference](src/htn-planner/npc/README.md).
For domain design, debugging and tooling, read [HTN guidance](docs/htn-guidance.md)
and the relevant lint, world-invariant or measurement reference linked there.

The reusable code is `src/htn-planner/`; examples and playgrounds are consumers.
Keep the runtime independent of demonstration levels and Node-only compiler tools.
Use `package.json` scripts and each tool's `--help` for checks. Regenerate committed
modules when their source changes. Distinguish headless checks from Explorer verification.
Preserve source licences and notices when copying or adapting code.

For installation into another scene or game-owned customization, read the
[module guide](src/htn-planner/README.md) and [HOW-TO](src/htn-planner/HOW-TO.md).
Its examples section defines the local-reference-first, version-specific GitHub fallback.
