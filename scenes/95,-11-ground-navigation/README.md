# Ground Navigation Lab (95,-11)

Compare four ground navigation backends on a two-storey SDK7 test map. It has a bridge over the lower floor, east and west ramps, a gate on the east ramp and an isolated platform. Navcat runs in the SDK7 runtime. Detour, Godot and landmass have standalone comparison runners and route replays in the scene.

## Run the scene

With Node 24:

```sh
pnpm install
pnpm test
pnpm types
pnpm start --mcp
```

- **Switch engine** cycles navcat live and the Detour, Godot and landmass route replays. The same controller follows all four routes.
- **Upper deck** starts a route to the bridge. **Toggle gate** switches ramps. With navcat live, try closing the gate while the bot is climbing: it replans from its current position. If the gate closes while the bot occupies its footprint, the demo restarts from the scenario start. The reference modes replay the corresponding open or closed run from the same scripted start.
- **Underpass** keeps the bot on the lower floor. **Isolated platform** displays a failed route. The bright line is the route, the yellow sphere is the bot and the small cube marks its target.
- **Opposing groups** runs navcat avoidance live. Three bots from each end of the upper deck swap sides. The board shows arrivals and steps with overlap.
- **Run WASM probe** initializes Detour in the current Explorer and runs six route checks and the opposing-groups case in the background. The panel shows initialization and Detour's results. The scene log also records navcat results and timing.

## Traversal tests

Open **Traversal tests**, choose a fixture and select a variant. The scene spawns its geometry and bots in place of the comparison arena. **Run** steps the fixture at 30 fixed simulation ticks per second. **Pause** keeps the current state visible, **Reset** returns to the start of the variant, and **Back to comparison** restores the main arena. Start from the front of the parcel to watch the course.

| Fixture | Checks |
| --- | --- |
| Run-up and crouch jump | Launch speed, approach obstruction and clearance to stand |
| Chained jumps | Braking distance and confirmed support between jumps |
| Mantle clearance | Correct ledge, grip, capsule fit and landing support |
| Contested ladder | Approach direction, exclusive use and blocked dismount |
| Elevator boarding | Boarding window, closed shaft, ride, exit and in-flight fallback to stairs |
| Interrupted jump | Cancellation before or after takeoff, lost support and stale probes |
| Ledge transfer | Consecutive grips and world pose continuity on a moving support |

Each variant shows **PASS** when its expected outcome holds, including safely declining or recovering from a traversal. **FAIL** includes the failing state. The scene also writes a `[ground-traversal]` result with the scenario, variant, case IDs, simulation ticks and verdict.

The registry loads pure TypeScript fixtures from `src/traversal/fixtures`. The visual adapter renders their geometry and state. The on-screen traversal menu uses the reference approach. The comparison runner uses the same controllers and verdicts with navcat and Detour approaches.

### Remote landing pads

For **SDK-T03 Два игрока на посадке без уникальных ID луча**, join the same realm with three distinct players at parcel `95,-11`. Each player opens **Traversal tests → Remote landing pads** to display the same pads.

1. The two guests enter `/goto-local landing-left` and `/goto-local landing-right` respectively. The pad centres are local XZ `(5, 8)` and `(11, 8)`.
2. The third player stays off the pads and clicks **Start observation**. Wait until the scene asks the left guest to move.
3. The left guest enters `/goto-local landing-clear`. The right guest stays in place. Expect **PASS** on the observer and a marker on the freed left pad. The observer records native raycast results under `[sdk-navigation-integration]`.

For the PR preview in Unity Editor, use environment `zone` and initial realm `sdk7testscenes.dcl.eth`.

## Creator recipes

Search the [recipe index](tools/catalog/creator-recipes.json) for a symptom, goal or constraint in English or Russian. Give that index to your coding agent together with the relevant scene files. Every entry has a minimal setup, an expected outcome, a failure control and links to the implementation. Use the case ID to find the corresponding timing below.

Run a single recipe from this directory, for example `pnpm compare:catalog --case=RECIPE-RAYCAST` for **Reject a navmesh shortcut to another floor**. The single-case JSON and Markdown reports go to `.comparison`.

| If you need to… | Start here | Where to run it |
| --- | --- | --- |
| Keep clickable props out of collision geometry while respecting hidden walls | Pointer-only glass and a hidden physics wall | Node and Creator recipes in SDK7 |
| Update the bake after a model changes at the same path | Refresh a bake after editing a GLB in place | Node |
| Send an NPC to the floor hit by a click | Pick the clicked floor from a ray hit | Node and Creator recipes in SDK7 |
| Prevent a clear horizontal ray from accepting a goal on the wrong floor | Reject a navmesh shortcut to another floor | Node and Creator recipes in SDK7 |
| Wait outside a door's sweep | Wait outside a swinging door's arc | Node and Creator recipes in SDK7 |
| Resume a local NPC after a door closes while the map is open | Resume navigation after the fullscreen UI closes | Node and Creator recipes in SDK7 |
| Change NPC height around a tunnel | Switch NPC height for a low passage | Node and Creator recipes in SDK7 |

Open **Traversal tests → Creator recipes** and choose a group. Use the Node catalogue for automated runs and the scene menu for visual or SDK7-specific checks.

To verify every menu entry in Desktop Explorer, prepare and build the local acceptance preview.

```powershell
pnpm probe:prepare --creator-recipes
pnpm exec sdk-commands build --skip-install --dir .comparison/creator-recipes-sdk
pnpm exec sdk-commands start --skip-build --no-watch --no-client --port 8000 --dir .comparison/creator-recipes-sdk
```

Open the local realm `http://127.0.0.1:8000` at parcel `95,-11`. The preview uses the scene's recipe groups and launch logic and records a `[creator-recipe-acceptance]` verdict per entry. It runs the default variant for simulation fixtures at accelerated playback. The Node catalogue runs the remaining variants and the offline bake-freshness example.

For **Resume after fullscreen UI**, click **Open Explorer map** in the recipe panel. Keep the map open briefly, then close it. To run only this recipe, add `--recipe-case=RECIPE-SCENE-RESUME` to the prepare command.

The click requests the map with `openExplorerUi`. The recipe holds a local NPC after the matching `opened` event, then replans and caps the first step after the matching `closed` event. Both events come from `ExplorerUiEventsResult` and carry the request ID. `WAS_ALREADY_OPEN` means the shared Explore slot is occupied. The recipe offers a retry because that call starts no panel session. A map opened from the Explorer's own navigation has no scene request to track. [SDK open responses](https://js-sdk-toolchain.pages.dev/enums/js_runtime_apis.__system_RestrictedActions_.OpenExplorerUiResult)

Local Desktop Explorer `v0.199.0-alpha-main` verified all 28 menu recipes across the full run and the focused map rerun. The offline bake-freshness recipe runs in Node.

**SDK7 authoring** covers asset transforms and collision masks, named markers, parcel bounds, Animator, resuming from fullscreen UI, and capturing a navigation replay. The GLB mask check uses real SDK7 rays and matching authored navigation surfaces in the scene. The Node fixture decodes the GLB and checks collider clearance against the imported triangles. Regenerate that controlled asset with `pnpm exec tsx scripts/recipe-authoring-model.ts`. The bake-freshness example demonstrates an offline in-memory cache.

The L-shaped parcel fixture scales three logical parcels into the lab parcel. For **Record an Explorer navigation replay**, save the `[ground-nav-replay]` line from the scene log and run `pnpm exec tsx scripts/recipe-creator-behavior-replay.ts <trace-or-log-path>`. The recipe index gives the expected results and failure controls.

**Gameplay** includes a long update across two bends, interception on an upper gallery, routing under cover, a reversing conveyor and turning a rectangular robot at a station, alongside the three original movement recipes in the table. The ground controller, patrol forecast, line-of-sight check, belt velocity and swept footprint are scene code. The navmesh provides spatial routes where applicable. The long-update example receives authored waypoints, so its timings describe the shared controller in both columns.

**Navigation APIs** includes bounded patrol sampling, area and portal events, a one-floor area edit, coincident traversal actions, landing-region thresholds, crowd velocity override, per-agent access in one crowd, filter-specific wall segments and island pruning. The scene visualizes navcat query and crowd results. The Node runner compares pinned navcat and Detour APIs where both are available. To compare the portal-or-wall recipe on Detour, use the [optional wall-segment binding](#optional-detour-wall-segment-binding).

In the crowd override recipe, `resetMoveTarget` can leave an agent steering toward its old goal on navcat 0.4.1. The stop phase explicitly requests zero velocity until the next goal. The reset-only variant records drift. Crowd examples render measured simulation traces at 2× speed. Off-mesh examples visualize link identity and route selection.

**Runtime operations** covers atomic navigation snapshot replacement, bounded tile streaming and urgent replanning with background progress. The Node catalogue reports memory counters alongside deterministic residency and stale-reference checks. Memory counters help diagnose a run and depend on the runtime and collector. The queue budget counts work units. Profile frame time on the target client before setting a production budget.

SDK7 logs `[ground-recipe]` for the authoring examples, with ray counts and timing where applicable. The movement examples log `[ground-traversal]` with ticks and coarse script compute time. Millisecond clock readings over a short script tick are useful as diagnostics. Use batched work and the Explorer profiler for a measured SDK7 comparison.

## Navmesh practices for SDK7

1. Bake the surfaces your NPC can physically use. Choose collision inputs explicitly, compose glTF and scene transforms, and check triangle winding after reflection. Store a fingerprint of the physical geometry, link definitions, agent profile and bake settings. [SDK7 collider masks](https://docs.decentraland.org/creator/scenes-sdk7/3d-content-essentials/colliders) · [glTF transforms](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#transformations)
2. Set radius, height, step and slope against your tightest valid fixtures. Check sizes just above and below passage and landing thresholds. Compare the effective voxel settings when porting settings across generators. Start with one offline-baked mesh. Benchmark tiles when you need localized edits or streaming, and test adjacent seams and upper layers. [Recast settings](https://recastnav.com/structrcConfig.html) · [navcat tiled meshes](https://github.com/isaac-mason/navcat#tiled-navmesh)
3. Keep the intended floor through target selection, nearest-polygon projection, straight-path extraction and movement. Check the destination polygon and endpoint tolerance before declaring arrival. A clear horizontal navmesh ray can still end below a balcony. The Detour 0.44.0 wrapper's raycast supplies no visited-polygon buffer, so this recipe checks `moveAlongSurface` as well. Log projected points, floor refs, corridor length, buffer status and endpoint separately. [Detour query contract](https://recastnav.com/classdtNavMeshQuery.html) · [JS wrapper](https://github.com/isaac-mason/recast-navigation-js/blob/main/packages/recast-navigation-core/src/nav-mesh-query.ts)
4. Treat permissions, costs, avoidance and geometry changes separately. Use area filters for access, costs for preference, the controller for temporary actors, and tile replacement when physical connectivity changes. On a new map revision, discard stale results and revalidate active corridors. Show when a rebuilt route became available as well as rebuild CPU time. [navcat filters and tile refs](https://github.com/isaac-mason/navcat) · [Detour TileCache](https://recastnav.com/classdtTileCache.html)
5. Give off-mesh links named actions, direction, entry and exit conditions. The controller owns execution, interruption recovery, and confirming support before restoring ground movement. Check the moving door's full sweep and the entire capsule under a low ceiling. At single-lane chokepoints, test reservations and wait time as well as collision avoidance. [navcat off-mesh connections](https://github.com/isaac-mason/navcat#off-mesh-connections) · [SDK7 asynchronous raycasts](https://docs.decentraland.org/creator/scenes-sdk7/interactivity/raycasting)
6. Reproduce failures from a minimal fixture, a fixed seed and timed events. Record the mesh revision, profile, requested goal, projected refs, exact status and the near-term action. For SDK7 raycasts also record the request and result ticks, attempt, mask, entity and mesh name. Include a control that still fails when the defensive check is removed.

### Choose a backend for the scene

| Workload | Start with | Compare before choosing |
| --- | --- | --- |
| Static SDK7 scene, few NPCs | Offline bake and navcat | First NPC ready time, package and baked assets, floor selection, representative query batch |
| Heavy queries or frequent mesh edits | navcat and Detour for the same inputs | WASM startup, matching bake/import work, query latency and completion, time until an affected NPC has a usable route |
| Crowds in a narrow passage or closeable doorway | navcat and Detour with fixed starts and agent settings | Update and pose readback, arrival rate, sustained stalls, clearance, high-load frame budget |
| Jumps, doors, stance changes and other authored transitions | Test the SDK7 executor with each candidate planner | Action success, reaction delay, collision controls, and replan count |
| Standalone native reference | Godot and landmass | Route and crowd results on the exported geometry, plus the cost of delivering equivalent behavior in SDK7 |

Compare correctness and required runtime support first. Record startup, bake/import, steady queries, crowd update/readback, memory and rebuild-to-replan latency in separate scopes when they affect the workload. Use the per-case table to find representative scenes. Validate the important choices on the target Explorer using comparable input and clock resolution. Use the Explorer profiler for frame and queue costs and sufficiently long batches for coarse clocks. [SDK7 performance tools](https://docs.decentraland.org/creator/scenes-sdk7/optimizing/performance-optimization) · [Node performance APIs](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html)

### Compare traversal planners

`pnpm compare:traversal` runs 36 variants with the reference approach, navcat and Detour. It writes route probes, ticks, the matched research cases and final verdicts to `.comparison/traversal-node.json`. Both engines bake the same walkable tops and blocked areas from each fixture. The runner records separate native link checks for six fixtures, with authored and projected endpoints, and tests direction and reachability when a link is removed.

The shared controllers own jumping, climbing, contacts, cancellation and recovery. The shaft fixture presents the two consecutive hangs as one link between walkable floors in the native link check. The planner approaches and the native link checks run separately, so the report does not treat finding an off-mesh link as proof of executing it.

```sh
pnpm exec tsx scripts/prepare-detour-sdk-probe.ts --traversal-compare
pnpm exec sdk-commands build --skip-install --dir .comparison/traversal-compare-sdk
pnpm exec sdk-commands start --skip-build --no-watch --no-client --port 8185 --dir .comparison/traversal-compare-sdk
```

Open the preview in Desktop Explorer. The isolated scene runs automatically and logs `[traversal-compare]` results. Repeated small bakes exercise integration and are outside the crowd performance comparison.

### Check live SDK7 collisions and transforms

```sh
pnpm exec tsx scripts/prepare-detour-sdk-probe.ts --sdk-integration
pnpm exec sdk-commands build --skip-install --dir .comparison/sdk-integration-sdk
pnpm exec sdk-commands start --skip-build --no-watch --no-client --port 18485 --dir .comparison/sdk-integration-sdk
```

Open `http://127.0.0.1:18485` as the realm for parcel `95,-11` in a regular Desktop Explorer window. The scene runs automatically and prints named verdicts as `[sdk-navigation-integration]`. Navcat and Detour run the same door update, opening action, partial-route fixture and corridor recovery as Node. Other probes exercise SDK raycasts against a platform moved while a result is pending, three GLTF loading outcomes, and physical collider pose before and after reparenting.

For the two-avatar variant, prepare with `--sdk-avatars` and rebuild. Use a multiplayer realm supported by the target Explorer. Have two separate guests stand on the indicated pads while the observer stays off them. On the second prompt, the left guest leaves and the right guest stays. The observer checks both physics-only and player raycast masks and then selects the freed pad. The Node catalogue also runs a deterministic variant that feeds duplicate remote-avatar IDs into the landing check.

## Reproduce the comparison

Use pinned Rust dependencies and Godot 4.7.2 stable. Set `GODOT_BIN` to the absolute path of the Godot console binary on Windows, or put Godot on PATH. Run Cargo with a native Windows toolchain, or the equivalent native toolchain for the host OS.

```sh
pnpm compare
pnpm compare --node-only
pnpm compare --write-replays
```

The full run writes per-case data to `.comparison/results.json`. The last command also refreshes the reference paths bundled in the scene. `pnpm compare:fixtures` exports the geometry and cases without running the native adapters. Detour runs through WASM in Node, Godot runs headless and landmass runs as a release Rust executable. The Node suite and scene build need neither Godot nor Cargo.

The route check independently validates walkable support and the agent's footprint along each segment. A failed check gives the command a non-zero exit code after it writes the report.

All geometry starts in `src/arena.ts`. Navcat and Detour each bake the same input surfaces and agent settings. Godot and landmass query the same exported convex Recast polygons. Their paths use that export without Detour's separate detail mesh. The two gate states are baked ahead. The mid-route check starts on the east ramp after closing the gate.

Each route timing is p95 of 500 calls after 100 warmups and includes endpoint selection and path extraction. The six-bot test uses a radius of 0.30 m, 30 steps/s and 15 simulated seconds. An agent counts as arrived after reaching within 0.35 m of its goal. An overlap step means some pair was closer than 0.58 m horizontally. Each backend uses its own avoidance. Navcat and Detour integrate movement directly. The Godot and landmass adapters integrate the velocity supplied by their solver and project onto the navmesh. Godot's update runs in the engine physics loop and the adapter does not report isolated avoidance CPU time.

## Recorded results

Windows x64, Node 24.22.1, Godot 4.7.2, landmass 0.9.3. One full comparison. Timings describe these adapters on this machine.

| Backend | Route checks | Closed-gate route | Group arrived | Group overlap steps | Group update p95 |
|---|---:|---:|---:|---:|---:|
| navcat 0.4.1, Node | 6/6 | 18.51 m | 6/6 | 0 | 0.232 ms |
| Detour 0.44.0, WASM in Node | 6/6 | 18.36 m | 6/6 | 0 | 0.023 ms |
| Godot NavigationServer3D, native | 6/6 | 18.36 m | 6/6 | 0 | — |
| landmass, native | 6/6 | 18.32 m | 0/6 | 0 | 0.041 ms |

Detour was faster than navcat on all six Node route queries in this run, with similar paths. It also used less time on the same Node host for the group. Landmass preserved separation but stalled head-on in the symmetric formation. Godot reached all six with a minimum centre distance of about 0.590 m on this run, above the test's 0.58 m overlap threshold. Native and Node measurements have different runtime and adapter costs. SDK7 execution was checked separately in the Explorer. More cases and larger groups are tracked separately.

Explorer smoke check on SDK 7.30.1: switched through the three reference modes and watched each bot reach the upper deck. The live navcat opposing groups reached 6/6 with zero overlap steps.

## SDK7 integration

`pnpm bake` produces the open- and closed-gate maps for navcat and Detour. The build, start and deploy scripts generate them automatically. Upstream CI calls `npm run build` and `npm run deploy`, equivalent here to `pnpm build` and `pnpm deploy`.

The main scene bundles [navcat](https://github.com/isaac-mason/navcat) and mathcat (MIT), plus [Recast/Detour](https://github.com/recastnavigation/recastnavigation) (Zlib) through [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js) (MIT). [Godot](https://github.com/godotengine/godot) (MIT) and [landmass](https://github.com/andriyDev/landmass) (MIT OR Apache-2.0) are used by the standalone comparison. A live Godot port would need to extract its query and avoidance code from the engine. A live landmass port would need a Rust-to-JS boundary or a TS port and a movement adapter.

## Live Detour probe

For isolated timings, build the same probe as a separate local SDK7 scene in the ignored `.comparison/detour-sdk` directory. From this scene's directory:

```sh
pnpm probe:prepare
pnpm exec sdk-commands build --skip-install --dir .comparison/detour-sdk
pnpm exec sdk-commands start --skip-build --no-watch --dir .comparison/detour-sdk --port 8145 --mcp --mcp-port 8146
```

Read `[detour-sdk-probe]` in Explorer's scene logs. The probe uses the stock embedded WASM build in `recast-navigation@0.44.0` and imports precomputed Detour maps. There is no remote request for the maps, special client build or host plugin. Both decks and gate states come from the same authored surfaces and bake parameters, using each engine's own baker. This probe measures queries and crowd updates without rendering agents or rebaking.

The local Desktop Explorer run on SDK 7.30.1 on November 23, 2026 initialized Detour in 59 ms. The imports and setup of two query meshes and a crowd took 3 ms. Both backends returned the expected verdict on all six live route scenarios. Detour's measured query mean was lower on three scenarios and navcat's was lower on the other three. On six opposing agents both backends reached 6/6 with zero overlap steps. The mean over 450 updates was 0.244 ms for navcat and 0.067 ms for Detour. The scene exposed `Date.now`, so individual sub-millisecond timings and p95 from that clock are unreliable. Query means come from batches of 32, with alternating engine order on each step. Crowd means describe this one probe run.

This local run verified live search and crowd execution on Desktop. To check a hosted deployment, open the published lab and use **Run WASM probe** on the target Explorer. The probe uses baked maps and tests execution on the Explorer that runs it.

## Optional Detour wall-segment binding

`RECIPE-PORTAL-WALL` **Classify a portal as a wall per NPC** runs on Detour when the WASM module exposes `dtNavMeshQuery::getPolyWallSegments`. The check uses the same Detour mesh and query filter for each segment. The baseline module from recast-navigation-js 0.44.0 reports this recipe as unsupported. An opt-in build keeps the pinned C++ Detour implementation and adds a wrapper, WebIDL declarations and a typed query method.

The same patched module exposes `initSlicedFindPath`, `updateSlicedFindPath` and `finalizeSlicedFindPath`. Use `pnpm compare:catalog --verify-only --case=E14 "--detour-wasm=$wasm"` for **Цена области при any-angle**. The test checks the route after smoothing, one-iteration updates, a truncated buffer, a total iteration budget, an invalid reference and a disconnected upper floor. The local SDK7 probe logs this result as `[detour-sliced-search]`.

In PowerShell, set `$wasm` to the built single-file `recast-navigation.wasm-compat.js`.

```powershell
pnpm exec tsx scripts/check-detour-wall-segments.ts $wasm
pnpm compare:catalog --case=RECIPE-PORTAL-WALL "--detour-wasm=$wasm"
pnpm exec tsx scripts/prepare-detour-sdk-probe.ts --wall-segments "--detour-wasm=$wasm"
pnpm exec sdk-commands build --skip-install --dir .comparison/wall-segments-sdk
```

The Node check verifies both access filters, a partially connected tile seam, walls-only mode, short output, invalid refs and repeated allocation and cleanup. The prepared SDK7 probe embeds the selected module and prints `[detour-wall-segments]` with the allowed and denied variants for each backend. It uses the coarse scene clock. Catalogue reports identify the selected module by SHA-256.

## Crowd load comparison

`pnpm compare:crowd-load` runs the 32- and 64-agent bottleneck cases in Node and writes `.comparison/crowd-load-node.json`. To run the same trials in Desktop Explorer:

```sh
pnpm exec tsx scripts/prepare-detour-sdk-probe.ts --crowd-load
pnpm exec sdk-commands build --skip-install --dir .comparison/crowd-load-sdk
pnpm exec sdk-commands start --skip-build --no-watch --no-client --port 8175 --dir .comparison/crowd-load-sdk
```

Open that preview in Explorer. The scene runs automatically and writes `[crowd-load]` results. Each configuration runs three times for 45 simulated seconds at 30 steps per second. Two opposing groups share a 3 m corridor and an alternative path. In the closing case, both backends switch to a pre-baked closed map after two simulated seconds, preserve the agents' positions and recreate their crowd with the original goals and zero initial velocity. The switch measures crowd allocation and target reissue. A separate set of queries checks that routes use the alternative corridor. Mesh building is outside these timings.

The timed batches include crowd updates and reading back agent positions. Geometry checks and pairwise overlap counting run outside the timed interval. Arrival means an agent entered the 0.35 m goal radius at least once. An overlap step means at least one pair of centres was closer than 0.58 m. The scene advances several fixed simulation steps per rendered frame. Its results measure crowd work rather than interactive frame times.

## Research catalogue comparison

`pnpm compare:catalog` runs the case manifest in Node using the same navcat and Detour versions as the scene. The detailed results go to `.comparison/catalog-comparison.json`. Each entry includes the source case ID and title, tested layer, coverage and a verdict per backend. An adapted case tests only the mechanism described in its result. Controller results use shared logic and should be read independently of engine results. The runner distinguishes unavailable engine features from missing required inputs or variants. A failed or missing check gives the command a non-zero exit code after it writes the report.

`specified` is the default label for a registered test. It does not certify that the test exercises every condition in the research recipe. The full catalogue run covers the two Node backends. Explorer playback and the standalone Godot and landmass comparisons cover separate fixture sets.

Use `pnpm compare:catalog --verify-only` for a single correctness pass and `--case` to select one scenario. The verifier writes `.comparison/catalog-verification.json` or a per-case file with the same prefix. Pass the custom WASM with `--detour-wasm` to verify the Detour portal-filter and sliced-search bindings.

The November 25, 2026 correctness run with custom WASM covered 164 scenarios. Navcat passed 164 and Detour passed 163. The original valid-zero-reference case is not applicable to Detour. Every applicable case passed. The standalone SDK7 probe also verified the four portal/filter variants and Detour sliced any-angle in Desktop Explorer.

The weighted-route cases compare two native routes after smoothing and record the native area-weighted choice separately. The navcat any-angle case uses the visited polygons from a cost-aware ray as a shortcut candidate and reports the upstream result alongside it. Clutter tests require endpoint snaps to stay in their authored cells.

The original zero-reference case is `not-applicable` on Detour because its reference 0 means no polygon. The companion fixture checks each backend's invalid sentinel, a missing projection and replacement of a tile with a fresh polygon reference. The obstacle-queue case runs the same 65 commands, drain, retry and removal on both backends, with eight commands per batch. The Detour result also includes a separate check of its native TileCache's internal 64-request limit.

The dense-ring test keeps the 0.3 m body and gives native steering 0.06 m of extra radius. The verdict checks spacing. Arrival and stalls are reported separately. The crossing test uses the same starting poses, goals, gate events and deadline for both the controlled and native-crowd runs. The controlled run phases entry, checks every swept move, and stages parking within the original goal discs. Its verdict covers safety and arrival. The JSON also records the native-crowd verdict.

### Per-case performance

Run `pnpm compare:catalog --update-readme` to refresh the table from the current fixtures. The command always measures every runnable case and writes raw samples and verdicts to `.comparison/catalog-comparison.json` and a Markdown copy to `.comparison/catalog-performance.md`. Read the layer, coverage, and verdict before comparing any timings. Large bake or benchmark fixtures and tiny route checks perform different work. See [Recorded results](#recorded-results), [Live Detour probe](#live-detour-probe) and [Crowd load comparison](#crowd-load-comparison) for narrower timings and SDK7 deployment context.

The catalogue measures navcat and Detour in Node. The Godot and landmass adapters use the smaller standalone comparison set. Explorer recipe timings require a separate run in the target client. In an adapted case, timing applies to the approximation described in the JSON report.

In the initial 140-case snapshot on November 24, 2026, both backends passed the first six creator recipes. Detour's median full-case time was 2.7–3.7× lower across those six, mainly from bake time. For a scene that bakes offline, compare isolated queries and crowd updates at your target load. The current table includes the full post-fix catalogue with the optional Detour WASM binding.

<!-- catalog-performance:begin -->
Run on 2026-11-25 UTC with Node 24.22.1, win32 10.0.26300 x64, Intel(R) Core(TM) Ultra 9 275HX. navcat 0.4.1, recast-navigation-js 0.44.0 with custom WASM (SHA-256 732e42f54be51d9f48110e8dd15ea4391fb639f2b357494ef824bdf9c2cb73da). Measured 164/164 cases, 327 case/backend pairs.

Each cell shows median wall time in milliseconds (min–max), then the verdict. One warm-up and 5 measured runs per pair. Timing includes case fixture setup, work and verdict checks, and excludes one-time WASM initialization. Traversal rows sum the required variants within each trial. A published Explorer run, an isolated path query, and a complete test harness have different costs.

<details>
<summary>Per-case timings and verdicts</summary>

| Case | Layer / coverage | navcat (Node) | Detour (Node WASM) |
| --- | --- | ---: | ---: |
| E01 Два этажа с одинаковыми XZ | planner / specified | 65.08 (51.71–86.61) · pass | 12.98 (12.67–15.82) · pass |
| E02 Узкий вертикальный поиск | planner / specified | 51.79 (46.63–58.71) · pass | 11.91 (11.07–14.76) · pass |
| E03 Рампа через многослойный тайл | planner / specified | 24.87 (22.67–28.35) · pass | 7.07 (6.87–7.64) · pass |
| E04 Потолок ровно по высоте агента | planner / specified | 85.67 (75.69–102.71) · pass | 19.20 (18.89–20.26) · pass |
| E05 Размер агента выбирает маршрут | planner / specified | 74.48 (71.56–79.63) · pass | 18.33 (17.62–18.86) · pass |
| E06 Пороги шага и наклона | planner / specified | 23.40 (22.75–24.26) · pass | 7.09 (6.68–7.59) · pass |
| E07 Проход через границу тайла | planner / specified | 32.50 (31.95–40.57) · pass | 12.66 (11.86–18.27) · pass |
| E08 Стена на соседнем тайле | planner / specified | 65.23 (59.37–66.21) · pass | 20.43 (18.61–24.61) · pass |
| E09 Вогнутый контур с двумя отверстиями | planner / specified | 27.46 (26.38–31.78) · pass | 7.18 (6.99–7.21) · pass |
| E10 Вырожденный треугольник на краю | planner / specified | 13.84 (13.01–17.92) · pass | 4.97 (4.89–7.79) · pass |
| E11 Соседние рёбра и ложный переход | planner / specified | 30.27 (29.55–31.39) · pass | 10.86 (10.26–12.31) · pass |
| E12 Несовпадение шага сетки bake и runtime | integration / specified | 5.92 (5.81–6.27) · pass | 2.74 (2.45–2.94) · pass |
| E13 Третий край в одном вокселе | planner / specified | 10.41 (10.08–11.35) · pass | 3.48 (3.17–4.45) · pass |
| E14 Цена области при any-angle | planner / specified | 20.82 (20.65–21.46) · pass | 7.53 (7.32–8.42) · pass |
| E15 Полигон с внутренней ссылкой 0 | planner / specified | 2.81 (2.74–3.25) · pass | not-applicable: Reference 0 denotes no polygon in Detour. Invalid and stale references are checked in Недействительная ссылка после замены тайла. |
| E15B Недействительная ссылка после замены тайла | planner / specified | 5.14 (5.00–5.43) · pass | 2.31 (2.06–2.93) · pass |
| E16 Полный, частичный и ограниченный запросы | planner / specified | 27.40 (26.61–29.74) · pass | 19.71 (18.19–21.08) · pass |
| E17 Односторонний спуск | planner / specified | 89.01 (88.23–91.41) · pass | 38.57 (38.05–39.97) · pass |
| E18 Радиус привязки off-mesh на разных этажах | planner / specified | 55.44 (52.56–57.59) · pass | 14.65 (13.83–15.72) · pass |
| E19 Локальное движение у off-mesh | integration / specified | 0.284 (0.261–0.320) · pass | 0.217 (0.172–0.241) · pass |
| E20 Фильтры регионов и off-mesh | planner / specified | 0.793 (0.756–0.889) · pass | 0.514 (0.437–0.573) · pass |
| E21 Сериализация кэша с переходом | integration / specified | 8.81 (8.37–9.37) · pass | 3.82 (3.53–4.95) · pass |
| E22 Дверь закрылась за один тик до подхода | integration / specified | 19.61 (19.35–20.54) · pass | 4.37 (4.26–4.57) · pass |
| E23 Очередь препятствий под нагрузкой | integration / specified | 431.34 (417.53–461.10) · pass | 119.05 (114.29–143.09) · pass |
| E24 Заменён тайл под сохранённым коридором | integration / specified | 6.04 (5.61–6.44) · pass | 3.40 (2.43–5.83) · pass |
| E25 Выбили агента из коридора | planner / specified | 13.64 (12.43–14.48) · pass | 6.70 (4.91–7.59) · pass |
| E26 Поворот и разъединение острова | integration / specified | 149.34 (127.30–171.04) · pass | 75.03 (60.03–80.28) · pass |
| E27 Разрешённые действия конкретного бота | planner / specified | 119.38 (114.85–123.18) · pass | 62.93 (57.85–64.20) · pass |
| GAME-01 One-way balcony descent | planner / specified | 17.22 (16.83–18.30) · pass | 9.80 (9.67–10.19) · pass |
| GAME-02 Off-mesh anchor near stacked floors | planner / specified | 22.19 (21.05–25.27) · pass | 13.64 (12.61–13.83) · pass |
| GAME-03 Low vent versus stairs by profile | planner / specified | 96.59 (68.08–104.00) · pass | 20.88 (18.93–23.85) · pass |
| GAME-04 Independent step and drop thresholds | planner / specified | 25.51 (24.89–29.00) · pass | 14.19 (13.36–15.33) · pass |
| GAME-05 Head strike while stepping up | controller / specified | 0.043 (0.032–0.216) · pass | 0.043 (0.031–0.104) · pass |
| GAME-06 Slow terrain versus short route | planner / specified | 14.70 (14.44–16.52) · pass | 6.39 (5.48–7.22) · pass |
| GAME-07 Budgeted search in a hairpin | planner / specified | 55.79 (55.56–64.14) · pass | 20.13 (19.52–21.06) · pass |
| GAME-08 Clearance preference across two valid lanes | planner / specified | 14.83 (14.51–15.07) · pass | 6.70 (5.68–6.98) · pass |
| GAME-09 Independently blocked adjacent doors | integration / specified | 35.05 (26.52–40.64) · pass | 15.13 (11.57–16.36) · pass |
| GAME-10 Door opening is a traversal action | integration / specified | 30.79 (27.53–33.83) · pass | 13.19 (11.21–13.49) · pass |
| GAME-11 Team-gated connector | planner / specified | 35.38 (23.83–37.88) · pass | 16.44 (11.23–18.90) · pass |
| GAME-12 Temporary actor versus static blockage | integration / specified | 21.51 (21.26–24.77) · pass | 7.00 (6.00–7.20) · pass |
| GAME-13 Moving docking bridge | integration / specified | 56.84 (48.49–60.52) · pass | 19.96 (17.31–20.85) · pass |
| GAME-14 Batched debris edits across tile seams | integration / specified | 480.82 (453.58–549.26) · pass | 416.73 (393.69–461.00) · pass |
| GAME-15 Escaping a newly inaccessible starting point | integration / specified | 12.52 (12.17–13.53) · pass | 4.37 (4.29–4.94) · pass |
| GAME-16 Multiple occupancy slots | controller / specified | 0.004 (0.003–0.004) · pass | 0.003 (0.003–0.007) · pass |
| GAME-17 Elevator boarding window | integration / specified | 21.35 (18.68–27.39) · pass | 8.04 (6.73–9.65) · pass |
| GAME-18 Reach an approach point for an object outside navmesh | planner / specified | 26.54 (23.41–30.96) · pass | 6.98 (6.19–8.55) · pass |
| GAME-19 Cheapest of multiple approach goals | planner / specified | 35.69 (33.56–38.32) · pass | 17.94 (17.11–17.98) · pass |
| GAME-20 Out-of-order result when target changes floor | planner / specified | 46.56 (40.12–53.33) · pass | 20.95 (17.07–23.93) · pass |
| GAME-21 Unloaded nav tile and streaming frontier | integration / specified | 5.66 (5.15–6.54) · pass | 2.39 (1.98–3.32) · pass |
| GAME-22 Hazard cost changes with identical geometry | planner / specified | 9.65 (8.31–10.62) · pass | 3.76 (3.66–4.41) · pass |
| GAME-23 Shared target and cache invalidation under load | planner / specified | 164.24 (127.45–171.37) · pass | 82.33 (55.58–85.22) · pass |
| GAME-24 Partial route next to a sealed goal | integration / specified | 5.15 (5.02–5.39) · pass | 2.35 (2.03–2.49) · pass |
| GAME-25 Goal tolerance widens accepted endpoints | integration / specified | 5.34 (5.15–5.59) · pass | 2.41 (2.02–2.51) · pass |
| GAME-26 Route around an avoid-only surface | planner / specified | 9.79 (9.48–11.08) · pass | 4.19 (3.79–4.45) · pass |
| GAME-27 Query against repeated updates | integration / specified | 891.41 (749.96–965.74) · pass | 756.78 (660.71–931.34) · pass |
| GAME-28 Rebuild completion fence | integration / specified | 582.43 (496.57–755.67) · pass | 453.26 (435.67–763.62) · pass |
| GAME-29 Navigation tile eviction and repopulation | integration / specified | 4.57 (4.47–4.66) · pass | 1.96 (1.81–2.09) · pass |
| G01 blocked corner | benchmark / specified | 0.126 (0.117–0.152) · pass | 0.117 (0.089–0.132) · pass |
| G02 row/axis and diagonal sanity | benchmark / specified | 652.27 (618.42–687.45) · pass | 194.61 (174.26–202.39) · pass |
| G03 rooms and deceptively close goals | benchmark / specified | 141.68 (136.94–151.65) · pass | 34.17 (30.78–42.70) · pass |
| G04 deep maze | benchmark / specified | 5225.95 (4800.62–5746.11) · pass | 2125.99 (2098.32–2661.27) · pass |
| G05 obstacle density and disconnected islands | benchmark / specified | 553.79 (442.87–601.59) · pass | 312.19 (285.61–380.96) · pass |
| G06 organic dungeon regression | benchmark / specified | 311.19 (307.90–337.74) · pass | 122.06 (109.97–130.03) · pass |
| G07 street-junction stress | benchmark / specified | 7143.14 (6452.17–7362.75) · pass | 4323.90 (4179.87–4530.81) · pass |
| P01 shortest path around a hole | benchmark / specified | 45.65 (31.69–52.40) · pass | 9.51 (8.34–12.26) · pass |
| P02 tessellation invariance | benchmark / specified | 142.08 (138.74–155.77) · pass | 41.78 (40.35–50.82) · pass |
| P03 clearance straddles threshold | benchmark / specified | 1541.45 (1463.44–1614.58) · pass | 358.24 (305.64–398.60) · pass |
| P04 short expensive vs long cheap surfaces | planner / specified | 25.13 (23.58–38.29) · pass | 9.48 (8.32–10.54) · pass |
| P05 stacked, gated directed traversal | planner / specified | 83.73 (81.08–99.80) · pass | 37.64 (32.35–46.74) · pass |
| P06 static many-query scaling | benchmark / specified | 45.49 (42.60–57.80) · pass | 42.94 (33.31–49.36) · pass |
| P07 clutter-speed curves | benchmark / specified | 2015.97 (1972.82–2161.67) · pass | 918.44 (890.50–989.91) · pass |
| T01 edge changes under an existing path | integration / specified | 77.04 (40.39–104.96) · pass | 31.72 (14.12–40.30) · pass |
| T02 wait for a safe doorway | controller / specified | 0.007 (0.007–0.016) · pass | 0.007 (0.007–0.009) · pass |
| T03 stopping distance under scheduled closure | controller / specified | 0.007 (0.006–0.030) · pass | 0.007 (0.007–0.009) · pass |
| T04 collision hidden between ticks | controller / specified | 0.008 (0.005–0.013) · pass | 0.008 (0.007–0.012) · pass |
| T05 weights change under load | integration / specified | 112.57 (63.45–130.97) · pass | 59.27 (29.65–60.39) · pass |
| T06 recurring moving obstacle through clutter | integration / specified | 1983.35 (1505.73–2197.06) · pass | 971.23 (922.51–1136.23) · pass |
| M01 passing bay and opposing swap | controller / specified | 0.066 (0.057–0.082) · pass | 0.063 (0.057–0.095) · pass |
| M02 goal residency changes solvability | controller / specified | 0.043 (0.042–0.044) · pass | 0.044 (0.042–0.047) · pass |
| M03 cyclic traffic vs swaps | controller / specified | 0.014 (0.012–0.016) · pass | 0.018 (0.013–0.120) · pass |
| M04 warehouse aisle scale | benchmark / specified | 2459.69 (2357.14–2489.09) · pass | 981.45 (956.35–1108.03) · pass |
| M05 dense antipodal circle and precision | benchmark / specified | 7039.70 (6856.43–7193.37) · pass | 2793.63 (2713.54–3010.18) · pass |
| M06 crossing flows and gate event | benchmark / specified | 1310.22 (1232.93–1360.71) · pass | 526.97 (484.02–537.90) · pass |
| GAME-T01 Разбег из неподходящей позы | integration / specified | 19.37 (18.08–20.83) · pass | 7.22 (6.89–8.35) · pass |
| GAME-T02 Пролёт через область цели без посадки | integration / specified | 1.59 (1.43–3.37) · pass | 0.902 (0.769–1.19) · pass |
| GAME-T03 Выход из приседа вплотную к рву | integration / specified | 6.88 (6.29–7.57) · pass | 2.47 (2.29–3.02) · pass |
| GAME-T04 Касание пусковой платформы по событию | controller / specified | 0.071 (0.066–0.151) · pass | 0.069 (0.067–0.257) · pass |
| GAME-T05 Импульс перескочил промежуточные точки | controller / specified | 0.107 (0.104–0.145) · pass | 0.114 (0.105–0.156) · pass |
| GAME-T06 Боковой сброс и восстановление посадки | integration / specified | 4.83 (4.68–6.30) · pass | 2.04 (1.99–2.39) · pass |
| GAME-T07 Ресурс закончился после поиска | controller / specified | 0.200 (0.196–0.209) · pass | 0.198 (0.196–0.225) · pass |
| GAME-T08 Перелезание за нужную полку | integration / specified | 10.17 (9.94–12.57) · pass | 4.29 (3.88–5.42) · pass |
| GAME-T09 Зацеп есть, но ставить ноги некуда | controller / specified | 0.017 (0.014–0.024) · pass | 0.017 (0.015–0.026) · pass |
| GAME-T10 Перелезание только с вершины прыжка | controller / specified | 0.094 (0.092–0.105) · pass | 0.103 (0.093–0.119) · pass |
| GAME-T11 Перелезть, проскользить и сразу перепрыгнуть | controller / specified | 1.17 (1.02–1.20) · pass | 1.04 (0.994–1.14) · pass |
| GAME-T12 Боковой контакт со стеной и отскок | integration / specified | 8.54 (8.15–8.77) · pass | 4.59 (4.17–5.35) · pass |
| GAME-T13 Лестница доступна только с правильной стороны | integration / specified | 44.53 (36.50–63.13) · pass | 15.12 (11.20–17.99) · pass |
| GAME-T14 Физика подхватила нисходящую лестницу раньше цели | integration / specified | 0.626 (0.580–0.686) · pass | 0.373 (0.306–0.436) · pass |
| GAME-T15 Верх лестницы ещё не конец перехода | integration / specified | 34.39 (28.55–48.58) · pass | 11.55 (8.32–13.56) · pass |
| GAME-T16 Локальное исключение после повторных промахов | integration / specified | 9.65 (9.36–10.07) · pass | 5.48 (5.45–6.20) · pass |
| GAME-T17 Посадка соскользнула, попытка потратила время | controller / specified | 0.483 (0.444–0.505) · pass | 0.462 (0.440–0.549) · pass |
| TALK-T01 Разбег зависит от состояния в точке старта | integration / specified | 9.77 (7.92–10.99) · pass | 3.46 (2.82–4.61) · pass |
| TALK-T02 Та же высота прыжка, разная дальность из-за быстрого падения | controller / specified | 0.385 (0.253–0.425) · pass | 0.427 (0.252–1.65) · pass |
| TALK-T03 Короткий прыжок с риском против длинного надёжного | controller / specified | 1.54 (1.46–2.31) · pass | 1.90 (1.47–3.00) · pass |
| TALK-T04 Два корректных прыжка образуют непроходимую цепочку | integration / specified | 4.66 (4.08–7.00) · pass | 1.54 (1.42–2.31) · pass |
| TALK-T05 Ускоритель и двойной прыжок через этаж | controller / specified | 1.35 (1.04–1.51) · pass | 1.08 (1.05–1.13) · pass |
| TALK-T06 Генератор 3D-фикстур с доказательством проходимости | integration / specified | 4.08 (3.89–5.39) · pass | 3.22 (3.07–3.53) · pass |
| TALK-T07 Свободная траектория vault без опоры для руки | integration / specified | 25.11 (24.47–29.98) · pass | 13.24 (12.20–17.78) · pass |
| TALK-T08 Тонкая полка между пробами | controller / specified | 0.037 (0.029–0.042) · pass | 0.035 (0.029–0.055) · pass |
| TALK-T09 Mantle перехватывает уже начатый прыжок | controller / specified | 0.436 (0.422–0.448) · pass | 0.434 (0.431–0.462) · pass |
| TALK-T10 Поисковый зонд видит скрытую комнату, капсула не проходит | integration / specified | 5.92 (4.69–6.65) · pass | 1.80 (1.78–2.64) · pass |
| TALK-T11 Цепочка «вис → вис» без возврата на пол | integration / specified | 5.06 (4.06–7.60) · pass | 2.49 (2.22–3.86) · pass |
| TALK-T12 Точка входа валидна только вместе с направлением и клипом | controller / specified | 0.045 (0.040–0.066) · pass | 0.054 (0.043–0.096) · pass |
| TALK-T13 Автогенерация не раздувает граф и сохраняет необходимые переходы | controller / specified | 0.289 (0.269–0.405) · pass | 0.274 (0.265–0.411) · pass |
| TALK-T14 Падение после vault сбрасывает переносимый импульс | controller / specified | 0.492 (0.482–0.574) · pass | 0.505 (0.501–0.509) · pass |
| TALK-T15 Поздняя коррекция прыжка за пределом управляемости | controller / specified | 0.361 (0.328–0.751) · pass | 0.378 (0.349–0.665) · pass |
| EXEC-T01 Отмена запроса в двух фазах прыжка | integration / specified | 19.13 (13.09–19.35) · pass | 6.69 (4.73–7.92) · pass |
| EXEC-T02 Позднее завершение отменённого перехода | controller / specified | 0.006 (0.004–0.016) · pass | 0.006 (0.005–0.030) · pass |
| EXEC-T03 Один источник перемещения и возврат в avoidance | controller / specified | 0.130 (0.122–0.166) · pass | 0.149 (0.123–0.168) · pass |
| EXEC-T04 Повторный вход из события waypoint | integration / specified | 6.57 (6.18–7.59) · pass | 3.99 (3.81–4.07) · pass |
| EXEC-T05 Реверсивный переход и локальные координаты | integration / specified | 24.80 (24.30–28.25) · pass | 13.71 (13.53–14.02) · pass |
| EXEC-T06 Широкий переход с несколькими точками приземления | integration / specified | 25.92 (22.58–38.23) · pass | 11.24 (10.03–13.76) · pass |
| EXEC-T07 Встречная очередь на однополосной лестнице | integration / specified | 139.92 (116.64–179.32) · pass | 41.71 (34.56–54.54) · pass |
| EXEC-T08 Лестница свободна, сход занят | integration / specified | 29.10 (26.53–41.94) · pass | 8.98 (7.70–13.06) · pass |
| EXEC-T09 Привязка к движущейся опоре при ожидании | integration / specified | 3.83 (3.82–3.92) · pass | 1.81 (1.67–2.09) · pass |
| EXEC-T10 Прыжок вдоль стены, ложный контакт пола | controller / specified | 0.116 (0.107–0.162) · pass | 0.113 (0.108–0.146) · pass |
| EXEC-T11 Касание кромки при посадке | controller / specified | 0.068 (0.064–0.081) · pass | 0.067 (0.065–0.074) · pass |
| EXEC-T12 Ложный автоподъём вдоль стены | controller / specified | 0.948 (0.915–1.09) · pass | 0.942 (0.923–1.09) · pass |
| EXEC-T13 Ступень подходящей высоты с непригодным верхом | controller / specified | 0.015 (0.014–0.027) · pass | 0.015 (0.015–0.017) · pass |
| EXEC-T14 Исчезнувшая посадочная поверхность после отрыва | integration / specified | 22.16 (17.43–28.89) · pass | 5.90 (5.13–8.15) · pass |
| EXEC-T15 Анимация закончилась, корпус не дошёл | controller / specified | 0.742 (0.699–2.40) · pass | 0.731 (0.709–0.972) · pass |
| EXEC-T16 Два близких перехода, обязательная промежуточная опора | integration / specified | 15.94 (13.42–18.20) · pass | 4.93 (4.51–6.17) · pass |
| SDK-T01 Подтверждение перехвата пришло через тик | integration / adapted | 3.67 (2.76–4.87) · pass | 1.15 (0.970–1.74) · pass |
| SDK-T02 Запечённая точка посадки ещё без коллайдера | integration / adapted | 6.66 (6.61–6.81) · pass | 4.08 (4.03–4.32) · pass |
| SDK-T03 Два игрока на посадке без уникальных ID луча | controller / adapted | 0.009 (0.005–0.013) · pass | 0.011 (0.008–0.034) · pass |
| SDK-T04 Переход между пространствами координат на поручне | integration / adapted | 3.86 (2.46–4.19) · pass | 2.35 (1.61–2.52) · pass |
| RECIPE-GLB-MASKS Pointer-only glass and a hidden physics wall | integration / specified | 29.74 (28.30–42.43) · pass | 10.00 (9.34–11.24) · pass |
| RECIPE-BAKE-FRESHNESS Refresh a bake after editing a GLB in place | integration / specified | 25.78 (23.41–27.25) · pass | 8.97 (8.44–14.27) · pass |
| RECIPE-CLICK-FLOOR Pick the clicked floor from a ray hit | integration / specified | 100.16 (91.08–108.04) · pass | 25.35 (22.98–30.15) · pass |
| RECIPE-RAYCAST Reject a navmesh shortcut to another floor | integration / specified | 91.81 (89.34–99.27) · pass | 28.08 (26.59–31.33) · pass |
| RECIPE-SWING-DOOR Wait outside a swinging door's arc | integration / specified | 121.96 (119.89–125.78) · pass | 38.32 (36.53–44.73) · pass |
| RECIPE-CROUCH Switch NPC height for a low passage | integration / specified | 121.94 (109.98–124.83) · pass | 37.83 (35.29–39.92) · pass |
| RECIPE-LONG-FRAME Preserve two turns in a long frame | controller / specified | 0.192 (0.185–0.410) · pass | 0.224 (0.193–0.323) · pass |
| RECIPE-INTERCEPT Intercept a patrol on the upper gallery | integration / specified | 110.37 (102.93–119.48) · pass | 28.42 (27.43–30.33) · pass |
| RECIPE-CONCEALED Choose a route with continuous cover | integration / specified | 39.15 (38.06–41.03) · pass | 14.16 (13.69–15.25) · pass |
| RECIPE-CONVEYOR Reverse a conveyor without trapping NPCs | integration / specified | 29.32 (28.60–34.22) · pass | 12.44 (11.20–14.62) · pass |
| RECIPE-ROBOT-TURN Test a long robot's turn at a station | integration / specified | 37.82 (35.76–40.61) · pass | 13.39 (12.95–13.84) · pass |
| RECIPE-PATROL Patrol within a radius on the intended floor | integration / specified | 13.48 (12.90–15.54) · pass | 4.92 (4.46–8.49) · pass |
| RECIPE-AREA-WAYPOINTS Distinguish area crossings from portal crossings | integration / specified | 5.64 (5.50–5.79) · pass | 3.05 (2.87–3.39) · pass |
| RECIPE-SPILL Apply a spill to one floor only | integration / specified | 58.63 (46.99–66.16) · pass | 16.93 (15.93–26.07) · pass |
| RECIPE-LINK-DISPATCH Dispatch distinct actions with coincident off-mesh links | integration / specified | 2.93 (2.87–3.30) · pass | 2.21 (2.07–2.44) · pass |
| RECIPE-BAKE-LANDING Preserve an intermediate landing during bake | integration / specified | 4.61 (4.56–7.66) · pass | 3.13 (2.76–4.96) · pass |
| RECIPE-CROWD-OVERRIDE Override and reset velocity in an active crowd | integration / specified | 19.38 (18.65–21.08) · pass | 5.46 (5.05–5.70) · pass |
| RECIPE-CROWD-POLICY Route one crowd with per-agent access policies | integration / specified | 34.71 (32.39–35.40) · pass | 12.80 (11.79–13.21) · pass |
| RECIPE-PORTAL-WALL Classify a portal as a wall per NPC | integration / specified | 1.83 (1.67–2.02) · pass | 1.16 (1.04–1.32) · pass |
| RECIPE-PRUNE-ISLANDS Prune unreachable islands from multiple spawns | integration / specified | 6.63 (6.44–7.18) · pass | 4.73 (4.62–5.22) · pass |
| RECIPE-MIRRORED-GLB Mirrored ramp in a nested GLB | integration / specified | 23.69 (22.90–24.41) · pass | 8.50 (7.99–8.67) · pass |
| RECIPE-NAMED-MARKERS Follow the named patrol markers | integration / specified | 127.24 (115.39–142.11) · pass | 35.40 (30.45–41.33) · pass |
| RECIPE-L-PARCELS Keep navigation inside L-shaped parcels | integration / specified | 101.31 (87.39–111.54) · pass | 24.90 (23.80–35.17) · pass |
| RECIPE-ANIMATOR Drive in-place animation from actual locomotion | integration / specified | 55.84 (52.11–60.77) · pass | 15.14 (14.98–15.99) · pass |
| RECIPE-SCENE-RESUME Resume navigation after the fullscreen UI closes | integration / specified | 48.38 (43.15–50.57) · pass | 12.42 (11.92–13.78) · pass |
| RECIPE-EXPLORER-REPLAY Replay Explorer navigation events in Node | integration / specified | 125.00 (122.80–162.55) · pass | 31.24 (31.02–31.97) · pass |
| RECIPE-IMPORT-ROLLBACK Keep the previous mesh after a failed import | integration / specified | 20.97 (19.86–23.53) · pass | 8.96 (8.61–10.23) · pass |
| RECIPE-STREAMING-MEMORY Bound tile residency over repeated visits | integration / specified | 20.64 (18.94–21.47) · pass | 14.13 (12.66–16.83) · pass |
| RECIPE-URGENT-REPLAN Schedule an urgent route without starving background work | integration / specified | 12.97 (11.53–13.69) · pass | 5.43 (4.80–7.20) · pass |

</details>

Recipe phase medians use the same measured trials as the end-to-end table. Each cell is bake and setup / query in milliseconds, summed across fixture variants and controls within each trial. A dash marks a phase without a complete sample series.

| Recipe | navcat bake / query (ms) | Detour bake / query (ms) |
| --- | ---: | ---: |
| RECIPE-GLB-MASKS Pointer-only glass and a hidden physics wall | 28.77 / 0.097 | 8.90 / 0.107 |
| RECIPE-BAKE-FRESHNESS Refresh a bake after editing a GLB in place | 23.84 / 0.152 | 7.45 / 0.153 |
| RECIPE-CLICK-FLOOR Pick the clicked floor from a ray hit | 100.00 / 0.126 | 25.16 / 0.111 |
| RECIPE-RAYCAST Reject a navmesh shortcut to another floor | 90.76 / 0.427 | 26.98 / 0.374 |
| RECIPE-SWING-DOOR Wait outside a swinging door's arc | 120.55 / 0.449 | 36.83 / 0.318 |
| RECIPE-CROUCH Switch NPC height for a low passage | 119.69 / 0.604 | 35.11 / 0.425 |
| RECIPE-LONG-FRAME Preserve two turns in a long frame | — / — | — / — |
| RECIPE-INTERCEPT Intercept a patrol on the upper gallery | 108.71 / 0.575 | 27.31 / 0.408 |
| RECIPE-CONCEALED Choose a route with continuous cover | 35.60 / 0.477 | 11.03 / 0.313 |
| RECIPE-CONVEYOR Reverse a conveyor without trapping NPCs | 27.14 / 0.620 | 9.69 / 0.563 |
| RECIPE-ROBOT-TURN Test a long robot's turn at a station | 34.51 / 0.322 | 11.19 / 0.241 |
| RECIPE-PATROL Patrol within a radius on the intended floor | 12.60 / 0.725 | 3.93 / 0.851 |
| RECIPE-AREA-WAYPOINTS Distinguish area crossings from portal crossings | 5.28 / 0.127 | 2.63 / 0.209 |
| RECIPE-SPILL Apply a spill to one floor only | 57.50 / 0.515 | 15.74 / 0.676 |
| RECIPE-LINK-DISPATCH Dispatch distinct actions with coincident off-mesh links | 2.68 / 0.118 | 1.89 / 0.130 |
| RECIPE-BAKE-LANDING Preserve an intermediate landing during bake | 4.47 / 0.065 | 2.94 / 0.098 |
| RECIPE-CROWD-OVERRIDE Override and reset velocity in an active crowd | 14.18 / <0.001 | 4.47 / <0.001 |
| RECIPE-CROWD-POLICY Route one crowd with per-agent access policies | 20.38 / <0.001 | 9.40 / <0.001 |
| RECIPE-PORTAL-WALL Classify a portal as a wall per NPC | 1.61 / 0.077 | 0.891 / 0.092 |
| RECIPE-PRUNE-ISLANDS Prune unreachable islands from multiple spawns | 6.44 / 0.103 | 4.41 / 0.183 |
| RECIPE-MIRRORED-GLB Mirrored ramp in a nested GLB | 22.52 / 0.349 | 7.34 / 0.367 |
| RECIPE-NAMED-MARKERS Follow the named patrol markers | 126.81 / 0.299 | 35.01 / 0.217 |
| RECIPE-L-PARCELS Keep navigation inside L-shaped parcels | 100.86 / 0.242 | 24.35 / 0.205 |
| RECIPE-ANIMATOR Drive in-place animation from actual locomotion | 55.07 / 0.068 | 14.30 / 0.074 |
| RECIPE-SCENE-RESUME Resume navigation after the fullscreen UI closes | 47.99 / 0.139 | 12.12 / 0.101 |
| RECIPE-EXPLORER-REPLAY Replay Explorer navigation events in Node | 124.20 / 0.316 | 30.49 / 0.185 |
| RECIPE-IMPORT-ROLLBACK Keep the previous mesh after a failed import | 19.48 / 0.297 | 8.31 / 0.163 |
| RECIPE-STREAMING-MEMORY Bound tile residency over repeated visits | 4.96 / 3.75 | 3.00 / 6.27 |
| RECIPE-URGENT-REPLAN Schedule an urgent route without starving background work | 10.37 / 2.33 | 3.44 / 1.74 |
<!-- catalog-performance:end -->

The imported grid and MAPF cases use [Moving AI's official map and scenario archives](https://movingai.com/benchmarks/mapf/index.html) and the separate [Dragon Age arena map](https://movingai.com/benchmarks/dao/arena.map.zip). Keep extracted `.map` files at the root of `.comparison/movingai`, with scenario files under `scen-even` and `scen-random`. Set `DCL_MAPF_DATA` to use another directory. The report identifies any expected file that is absent. The benchmark inputs stay local and are excluded from scene deployment.

If the default Detour buffers lose routes in the imported single-agent grid cases, the runner repeats them with 16,384 search nodes, 4,096 corridor polygons and 4,096 output points. The verdict uses the second pass and the report keeps both counts. The reported query percentile is for the default limits.
