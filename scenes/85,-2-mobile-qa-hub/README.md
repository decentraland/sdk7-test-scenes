# Mobile QA Hub (`scenes/85,-2-mobile-qa-hub`)

A single SDK7 scene that works as a **hub of subscenes** for QA of mobile client issues/PRs
(`decentraland/godot-explorer`). Instead of piling every repro in one giant scene, each issue/PR gets
its own subscene folder; the hub lists them with their `#issue` / `#PR`, who registered them and their
status, and mounts **one at a time** on its own stage.

- parcels: `85..88, -2..1` (4x4 = 64x64 m) — free at the time of writing, checked with
  `npm run check-parcels` at the repo root;
- world: `sdk7testscenes.dcl.eth` (same `worldConfiguration` as every other scene in this repo);
- spawn: x=32, z=26 on the hub dais, camera looking north to the hub sign.

## What the hub does

1. On load it shows the **hub**: a dais with the hub sign, a floor map with one marker per registered
   subscene, and a UI list on the left (`#issue title / owner · status · stage`).
2. Pick a subscene → the hub props are removed, the subscene is mounted at its assigned stage, the
   stage gets a floor plate, a low border and a sign with `#issue / #PR title` + owner, and the player
   is teleported in front of it.
3. *Back to hub* → the subscene's `unmount()` runs, every entity and system it created is removed, the
   hub props come back and the player is teleported to the spawn.

Nothing accumulates: a subscene can only be tested in isolation, and the scene always returns to the
same state after leaving it.

## Registering a subscene

Read [`ADDING-A-SUBCENE.md`](./ADDING-A-SUBCENE.md). Short version:

```bash
cd scenes/85,-2-mobile-qa-hub
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

64x64 m scene, 4x4 grid of **16x16 m stages** → 16 subscenes per page; subscene 17 starts page 1 and
reuses the slots (only one stage is ever populated, so nothing can overlap). Slot 0 is the
south-west corner, slot 15 the north-east one:

```
row 3 (north)   slot 12  slot 13  slot 14  slot 15
row 2           slot  8  slot  9  slot 10  slot 11
row 1           slot  4  slot  5  slot  6  slot  7
row 0 (south)   slot  0  slot  1  slot  2  slot  3
                col 0    col 1    col 2    col 3
```

Constants live in `src/hub/layout.ts` (`SCENE_SIZE`, `STAGE_SIZE`); the generator reads them from there,
so enlarging the layout is a two line change (plus the parcels in `scene.json`).

## Scripts

| script                  | what it does                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| `npm run start`         | local preview (`sdk-commands start`); regenerates the registry first  |
| `npm run build`         | `sdk-commands build`; regenerates the registry first                  |
| `npm run subscenes:gen` | validate every `src/subscenes/*/subscene.json` and rewrite `scenes.gen.ts` |
| `npm run subscenes:check` | exit 1 if `scenes.gen.ts` is stale (CI)                            |
| `npm run typecheck`     | `tsc --noEmit`                                                       |

## Files

```
scripts/gen-subscenes.mjs     registry generator + validator (no dependencies)
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
loads fast in the mobile client and stays small in the shared world.
