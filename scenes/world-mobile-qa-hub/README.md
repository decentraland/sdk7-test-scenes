# Mobile QA Hub (`scenes/world-mobile-qa-hub`)

> The folder has no `<x>,<y>` prefix on purpose: this scene lives in its **own World**, so Genesis
> parcel coordinates do not apply to it. Every other scene in this repo keeps the coordinate naming
> because they are deployed side by side into the shared world.

A single SDK7 scene that works as a **hub of subscenes** for QA of mobile client issues/PRs
(`decentraland/godot-explorer`). Instead of piling every repro in one giant scene, each issue/PR gets
its own subscene folder; the hub lists them with their `#issue` / `#PR`, who registered them and their
status, and mounts **one at a time** on its own stage.

## Deployed to a WORLD, not Genesis City

This scene is meant to be deployed to a **World** (`.dcl.eth` name), so it does not compete for LAND:

- the footprint is **8x8 parcels (64 parcels, 128x128 m)** starting at world-relative `0,0`. Worlds
  charge nothing per parcel (limits scale with the layout, up to 300x300) so the space is free; the
  only real budget is the scene file size (100 MB per NAME, 36 MB for ENS domains) and this scene is
  tiny: primitives and text only, no 3D assets;
- that is why there is **no parcel-collision check** and no hunting for free Genesis coordinates:
  worlds are isolated, nothing to collide with;
- `scene.json` carries the usual `worldConfiguration` block.

### ⚠️ Before you deploy: set the world name

`scene.json` → `worldConfiguration.name` ships as a **placeholder**:

```json
"worldConfiguration": {
  "name": "your-world-name.dcl.eth",
  "minimapVisible": true
}
```

Replace it with the world you actually control (the wallet that deploys must own the NAME or have
world-wide deploy permission). `npm run deploy:check` (and `predeploy`) fail with this message while the
placeholder is still there, so you cannot deploy to nowhere by accident.

### Manual deploy (not run automatically)

World deploys take the target world from `scene.json` — there is **no `--world` flag** in
`sdk-commands` (checked against `@dcl/sdk-commands` 7.30.1 and latest: the deploy options are `--dir`,
`--target`, `--target-content`, `--skip-build`, `--skip-validations`, `--multi-scene`, `--yes`,
`--programmatic`, …). So:

```bash
# 1. set your world in scene.json -> worldConfiguration.name first
cd scenes/world-mobile-qa-hub
npm install
npm run deploy:check          # prints the world + parcel layout, fails on the placeholder
npm run deploy                # = sdk-commands deploy (predeploy regenerates the registry + guards the world name)
```

Notes:

- `npm run deploy` runs `predeploy` → `subscenes:gen` + `check-world-name`, then `sdk-commands deploy`;
- `sdk-commands deploy --multi-scene` deploys **alongside** other scenes already in that world instead of
  replacing the world content — useful when the same world hosts several test scenes;
- the deploy itself was **not executed** as part of this PR: it needs the real world name and the
  owner's wallet.
- the scene is then reachable at `decentraland://?realm=<world-name>` (or via the World's URL in the
  Explorer / Creator Hub).

## What the hub does

1. On load it shows the **hub**: a dais with the hub sign, a floor map with one marker per registered
   subscene, and a UI list on the left (`#issue title / owner · status · stage`), paginated 8 rows per
   page.
2. Pick a subscene → the hub props are removed, the subscene is mounted at its assigned stage, the stage
   gets a floor plate, a low border and a sign with `#issue / #PR title` + owner, and the player is
   teleported in front of it.
3. *Back to hub* → the subscene's `unmount()` runs, every entity and system it created is removed, the
   hub props come back and the player is teleported to the spawn.

Nothing accumulates: a subscene can only be tested in isolation, and the scene always returns to the
same state after leaving it.

## Registering a subscene

Read [`ADDING-A-SUBCENE.md`](./ADDING-A-SUBCENE.md). Short version:

```bash
cd scenes/world-mobile-qa-hub
cp -r src/subscenes/_example src/subscenes/<feature>-<issue>
# edit src/subscenes/<feature>-<issue>/subscene.json
# edit src/subscenes/<feature>-<issue>/index.ts  -> export function mount(ctx) { ... }
npm run build     # prebuild runs subscenes:gen, which validates and regenerates the registry
```

Contract (see `src/hub/types.ts`):

```ts
// src/subscenes/<slug>/index.ts
export function mount(ctx: SubsceneContext): void
export function unmount?(): void
```

`subscene.json` holds the metadata (`title`, `issue`, `pr?`, `owner`, `status?`, `note?`, `slot?`,
`size?`) as pure data, so `scripts/gen-subscenes.mjs` can validate it and emit
`src/subscenes/scenes.gen.ts` **without editing a shared registry by hand**. That is what keeps
parallel PRs from conflicting: one folder + one generated file.

## Layout

128x128 m scene (8x8 parcels, world-relative `0,0`..`7,7`), 8x8 grid of **16x16 m stages** → 64
subscenes per page; subscene 65 starts page 1 and reuses the slots (only one stage is ever populated, so
nothing can overlap). Slot 0 is the south-west corner, slot 63 the north-east one:

```
row 7 (north)   slot 56  slot 57  slot 58  slot 59  slot 60  slot 61  slot 62  slot 63
row 6           slot 48  slot 49  slot 50  slot 51  slot 52  slot 53  slot 54  slot 55
row 5           slot 40  slot 41  slot 42  slot 43  slot 44  slot 45  slot 46  slot 47
row 4           slot 32  slot 33  slot 34  slot 35  slot 36  slot 37  slot 38  slot 39
row 3           slot 24  slot 25  slot 26  slot 27  slot 28  slot 29  slot 30  slot 31
row 2           slot 16  slot 17  slot 18  slot 19  slot 20  slot 21  slot 22  slot 23
row 1           slot  8  slot  9  slot 10  slot 11  slot 12  slot 13  slot 14  slot 15
row 0 (south)   slot  0  slot  1  slot  2  slot  3  slot  4  slot  5  slot  6  slot  7
                col 0    col 1    col 2    col 3    col 4    col 5    col 6    col 7
```

Slot `k` covers x = `(k % 8) * 16` .. `+16`, z = `floor(k / 8) * 16` .. `+16`; its center is what you
get as `ctx.origin`. The hub dais and the player spawn sit on the geometric center of the scene
(x = z = 64), which is only dressed while the hub is shown.

Constants live in `src/hub/layout.ts` (`SCENE_SIZE`, `STAGE_SIZE`); the generator reads them from there,
so enlarging the layout is a two line change plus the parcels in `scene.json` (worlds allow up to
300x300).

## Scripts

| script                    | what it does                                                                 |
| ------------------------- | ---------------------------------------------------------------------------- |
| `npm run start`           | local preview (`sdk-commands start`); regenerates the registry first         |
| `npm run build`           | `sdk-commands build`; regenerates the registry first                         |
| `npm run deploy`          | `sdk-commands deploy`; `predeploy` regenerates + guards the world name       |
| `npm run deploy:check`    | prints target world + parcel layout, fails while the world name is a placeholder |
| `npm run subscenes:gen`   | validate every `src/subscenes/*/subscene.json` and rewrite `scenes.gen.ts`   |
| `npm run subscenes:check` | exit 1 if `scenes.gen.ts` is stale (CI)                                      |
| `npm run typecheck`       | `tsc --noEmit`                                                               |

## Files

```
scripts/gen-subscenes.mjs     registry generator + validator (no dependencies)
scripts/check-world-name.mjs  predeploy guard: no deploy with the placeholder world name
src/index.ts                  entry point: sets the UI renderer, boots the hub
src/hub/layout.ts             scene/stage geometry, slotRect(), single source of truth
src/hub/types.ts              SubsceneMeta / SubsceneContext / SubsceneModule / SubsceneEntry
src/hub/tracking.ts           tracked entities + systems (the isolation guarantee)
src/hub/props.ts              static world, hub props, stage dressing (all primitives, no assets)
src/hub/state.ts              session: hub <-> subscene, teleports, cleanup
src/hub/ui.tsx                React-ECS list, pagination, subscene header, Back button
src/subscenes/_example/       template subscene (rotating cube + tap counter)
src/subscenes/scenes.gen.ts   GENERATED — do not edit
```

No 3D assets, no external dependencies beyond `@dcl/sdk`: the scene is all primitives and text, so it
loads fast in the mobile client and stays far below the world file-size budget.
