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

The imported grid and MAPF cases use [Moving AI's official map and scenario archives](https://movingai.com/benchmarks/mapf/index.html) and the separate [Dragon Age arena map](https://movingai.com/benchmarks/dao/arena.map.zip). Keep extracted `.map` files at the root of `.comparison/movingai`, with scenario files under `scen-even` and `scen-random`. Set `DCL_MAPF_DATA` to use another directory. The report identifies any expected file that is absent. The benchmark inputs stay local and are excluded from scene deployment.

If the default Detour buffers lose routes in the imported single-agent grid cases, the runner repeats them with 16,384 search nodes, 4,096 corridor polygons and 4,096 output points. The verdict uses the second pass and the report keeps both counts. The reported query percentile is for the default limits.
