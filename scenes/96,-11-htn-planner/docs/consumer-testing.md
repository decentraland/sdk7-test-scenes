# Test a game-owned HTN domain

Install into an existing SDK7 scene from this source scene:

```sh
node scripts/htn-install.mjs /path/to/my-scene --testing
```

This adds `npm run htn:check`, the compiler, the pure `src/htn-testing/paper.ts`
host support and this guide. It needs the SDK7 scene's development dependencies
(including esbuild, available with the SDK tooling). No reference catalogue is
needed. `--reference` is a separate, removable option. `--benchmark` independently
adds measurements; see [consumer-benchmark.md](consumer-benchmark.md) when installed.

Keep authored cases outside the library, for example `htn-tests/worker.tests.ts`,
with `.domain` and `.worldstate` files beside it. Do not import the testing support
in the production entrypoint. Write expected plans from the intended branch order
and host contract **before the first run**. Include a positive case, a nearby
world that should choose differently, and an already-started or completed case.
An empty expected plan is explicit; a missing expectation is a configuration error.

```ts
// htn-tests/worker.tests.ts
import type { ConsumerManifest } from '../tools/consumer/manifest'
import { sym } from '../src/htn-planner/htn/atom'

export default {
  domain: 'worker.domain',
  scenarios: [{
    name: 'walk to the target',
    world: 'outside.worldstate',
    method: 'go_to',
    args: [sym('counter')],
    expect: { status: 'succeeded', plan: ['!walk_to counter'] }
  }]
} satisfies ConsumerManifest
```

```sh
npm run htn:check -- htn-tests/worker.tests.ts --seed 7
npm run htn:check -- htn-tests/worker.tests.ts --json --session ../htn-reports
npm run htn:check -- htn-tests/worker.tests.ts --case 'walk to the target'
```

CLI paths resolve from the process working directory (the package root for npm
scripts); domain, world and invariant paths and the session directory resolve
beside the manifest. Spaces in paths are supported. Every scenario gets a fresh
world and fresh bindings. The factory receives `{ world, seed, rng }`; explicitly
return your selected `callterms` and optional `context` or `daemons` for member bindings. No catalogue or implicit
callterm set is loaded. To include standard list helpers, return
`{ callterms: { ...listCallterms, ...myCalls } }` from the factory, importing
`listCallterms` from `src/htn-planner/htn/callterms`. Use the supplied seeded RNG
rather than global randomness; stories also receive a fresh `rng` and `bindings`.

A sidecar `worker.invariants.domain` is discovered automatically. An explicit
`invariants: 'checks.domain'` chooses another file; `invariants: false` disables
checks. Invariants are condition-only, zero-argument top-level methods, with no
host tasks or callterms. They run on each setup and at stable story boundaries.
`invalid_world` is separate from `no_plan`; an intentionally invalid scenario can
expect `{ status: 'invalid_world', plan: [] }`.

For host behavior, add `stories` with `{ name, expect: string[], play(stage, host) }`.
`stage.scenario(name)` gives a fresh scenario world; `stage.agent({ id, world,
method, args, host: paperHost, ...host.bindings(world) })` creates a planning agent.
The default station is `game`. Share a world or host-owned state when agents
interact. A `PaperHost` supplies primitive `effects`, scripted `failures`,
`dropped` cleanup and `sense`. `tick()` replans, `step()` runs one primitive,
`step(() => true)` forces a failure, `run()` finishes the plan, and
`stage.event(note, edit)` applies an outside interruption. The script must call
`tick()` at the same boundaries as its intended host. Expected trace lines are
written in advance, e.g. `a: plan: !claim a, !finish a`, `a: run !claim a`,
`a: switch: !flee a`, `a: fail !finish a`. Test interruption, failure, cleanup and
re-entry explicitly when those contracts matter. PaperHost is a headless model of
host writes; it does not prove Explorer movement, rendering or real executors.

Reports include expected values, actual plans/traces, diagnostics and seed. Exit
codes: **0** all expectations match, **1** mismatch/runtime failure, **2**
configuration/compilation error, **3** unexpected invalid world. Deliberately alter
one expected primitive and check for exit 1 before relying on a new test workflow.
`--session` writes portable DebugSession JSON, including per-agent runs, snapshots
and the story timeline. Load with `parseSession` from
`src/htn-planner/debug/session`; the JSON report and text report already show the
human trace, with no viewer installation required.

The installer excludes support, `htn-tests`, `htn-reports`, tools and scripts from
publish. Keep custom case data in those development folders or add your own
`.dclignore` patterns. Production bundles only include code reachable from your
entrypoint. Use the normal SDK production build and inspect publishable files
after integrating your game. Deleting `reference/htn` leaves these checks usable.
