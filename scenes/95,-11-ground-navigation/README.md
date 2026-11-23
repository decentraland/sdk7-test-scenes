# Ground Navigation Lab (95,-11)

First comparison pass for ground NPCs in a multi-level SDK7 scene. The map has an upper deck over the lower floor, east and west ramps, a gate on the east ramp and an isolated platform. The SDK scene runs navcat. The headless tests use navcat and Recast/Detour on the same surface data. The two gate states are baked at build time.

## Run

With Node 24:

```sh
pnpm install
pnpm test
pnpm types
pnpm start
```

**Upper deck** starts the east route. Click **Toggle gate** early in the run to see the alternate route. It replans from the bot's current position. If the bot occupies the gate footprint as it closes, the run restarts at its start point. **Underpass** stays on the lower floor below the upper deck. **Isolated platform** has no complete route. The bright line is the route and the yellow marker is the bot.

Tests exercise routing and geometry, including floor selection and an unreachable goal. Explorer verifies appearance, controls and in-scene movement. Detour runs via WASM in Node. Godot NavigationServer3D, landmass and native crowd behavior are later comparison iterations.

The surfaces are authored once in `src/arena.ts`. SDK geometry and headless checks read that module. `pnpm bake` produces both navcat maps, and the SDK's build and start commands generate them automatically. The repository's existing CI uses `npm run build` and `npm run deploy`, equivalent here to `pnpm build` and `pnpm deploy`.

## First iteration evidence

- Headless on Node 24: both navigators chose the east ramp with the gate open and the west ramp when closed, including a replan from midway up the east ramp. Both stayed on the lower floor in the underpass and rejected the isolated target and an invalid target height.
- Explorer v0.199.0-alpha-main, SDK 7.30.1: the SDK scene reached the upper deck with the gate open and after closing the gate during movement, completed the underpass and reported the isolated target as unreachable. All four controls were exercised through the Explorer MCP pointer input.
- Example Node route lengths in metres, navcat / Detour: gate open 11.41 / 11.40, gate closed 18.51 / 18.36, underpass 4.50 / 4.50. To repeat query timing locally, set `NAV_BENCHMARK=1` and run `pnpm test`. These measurements exclude rendering, controllers and crowd updates.

For Explorer automation, launch with `pnpm start --mcp` and query its local MCP endpoint. The headless suite needs only Node.

[navcat](https://github.com/isaac-mason/navcat) (MIT) ships in the scene bundle. [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js) (MIT) and its [Recast/Detour](https://github.com/recastnavigation/recastnavigation) core (Zlib) are development dependencies.
