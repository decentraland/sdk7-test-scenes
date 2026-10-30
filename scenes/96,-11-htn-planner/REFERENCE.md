# Optional HTN reference snapshot

This folder is source material to inspect, not your game's entrypoint. It mirrors the original module scene's
`src/`, `assets/`, `tools/`, `scripts/`, `test/` and `benchmarks/`, plus public guidance under `docs/`.

- [Guard behaviour and shared include](src/examples/guard/guard.domain)
- [Primitive stalker animation host](src/examples/stalker/stalker-model.ts)
- [Basic example domains](src/examples/basics/)
- [More domain examples](src/examples/canon/)
- [Playground hosts](src/playground/)
- [Debugger implementation](src/debugger/)
- [Domain-design guidance](docs/htn-guidance.md)
- [Example catalogue](docs/htn-examples-catalog.md)

Your installed library's README and HOW-TO are in `../../src/htn-planner/`. Prefer those for actual integration.
Look here first when you need an example. If an example is missing, use the version-specific source URL in `SOURCE.json`.
To execute the complete demo or repository CLI tools, use the source checkout, not this reference folder.

Keep the entire snapshot excluded from TypeScript compilation, runtime imports and SDK deployment. The installer adds
its `.dclignore` entry. A conventional `src/` TypeScript include already excludes it; broad includes need an explicit
`reference/htn` exclusion. Delete this folder whenever you want. Keep any code/assets adapted for play in game-owned
runtime folders, update their paths and preserve applicable notices before deleting the snapshot.
