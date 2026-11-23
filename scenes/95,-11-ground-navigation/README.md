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

## Reproduce the comparison

Use pinned Rust dependencies and Godot 4.7.2 stable. Set `GODOT_BIN` to the absolute path of the Godot console binary on Windows, or put Godot on PATH. Run Cargo with a native Windows toolchain, or the equivalent native toolchain for the host OS.

```sh
pnpm compare
pnpm compare --node-only
pnpm compare --write-replays
```

The full run writes per-case data to `.comparison/results.json`. The last command also refreshes the reference paths bundled in the scene. `pnpm compare:fixtures` exports the geometry and cases without running the native adapters. Detour runs through WASM in Node, Godot runs headless and landmass runs as a release Rust executable. The Node suite and scene build need neither Godot nor Cargo.

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

Detour was faster than navcat on all six Node route queries in this run, with similar paths. It also used less time on the same Node host for the group. Landmass preserved separation but stalled head-on in the symmetric formation. Godot reached all six with a minimum centre distance of about 0.590 m on this run, above the test's 0.58 m overlap threshold. Native and Node measurements have different runtime and adapter costs. SDK7 execution was checked separately and only navcat's runtime is exercised there. More cases and larger groups are tracked separately.

Explorer smoke check on SDK 7.30.1: switched through the three reference modes and watched each bot reach the upper deck. The live navcat opposing groups reached 6/6 with zero overlap steps.

## SDK7 integration

`pnpm bake` produces both navcat maps. The build and start scripts generate them automatically. Upstream CI calls `npm run build` and `npm run deploy`, equivalent here to `pnpm build` and `pnpm deploy`.

The runtime bundles [navcat](https://github.com/isaac-mason/navcat) and mathcat (MIT). [Recast/Detour](https://github.com/recastnavigation/recastnavigation) (Zlib) through [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js) (MIT), [Godot](https://github.com/godotengine/godot) (MIT) and [landmass](https://github.com/andriyDev/landmass) (MIT OR Apache-2.0) are used by the standalone comparison. Moving Detour's WASM queries into SDK7 needs a separate loader/runtime check. A live Godot port would need to extract its query and avoidance code from the engine. A live landmass port would need a Rust-to-JS boundary or a TS port and a movement adapter.
