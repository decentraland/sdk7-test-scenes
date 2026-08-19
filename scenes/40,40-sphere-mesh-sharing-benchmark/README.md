# Sphere Mesh Sharing Benchmark

## What this demonstrates

This scene validates a Unity Explorer memory optimization: `SpherePrimitive`
now shares **one immutable `Mesh` asset** across every sphere entity in the
scene, instead of allocating a brand new `Mesh` per entity.

The comparison is made **across Explorer builds**, not within the scene: run
this same scene on an **old build** (no sharing) and on a **new build** (shared
mesh) and watch the Memory Profiler in each. There is deliberately no in-scene
control group — the old build *is* the control.

The scene starts **empty** and gives you an on-screen panel to pile on spheres
in real time:

- **`+N spheres`** — spawns a batch of sphere entities (`MeshRenderer.setSphere`).
- **`Delete all`** — removes every spawned sphere so you can start over.

Each button press spawns `ADD_BATCH` spheres (default `1000`). To change the
batch size, edit the single constant near the top of
[`src/spawner.ts`](src/spawner.ts):

```ts
export const ADD_BATCH = 1000
```

## Code layout

- [`src/index.ts`](src/index.ts) — entry point; just wires up the UI.
- [`src/spawner.ts`](src/spawner.ts) — all spawn/registry logic (`addSpheres`,
  `deleteAll`, live count) and the layout constants.
- [`src/ui.tsx`](src/ui.tsx) — the on-screen panel with the buttons and counter.

## Scene layout

- Parcels: `40,40` (base) and `41,40` — a 2-parcel-wide, 1-parcel-deep strip
  (32m × 16m in local coordinates).
- Spheres fill a fixed `GRID_COLUMNS × GRID_DEPTH` footprint (48 × 24) anchored
  at local `x: 2, z: 1`, with 0.6m spacing and a 0.4m entity scale so spheres
  never touch.
- Once a layer fills (`48 × 24 = 1152` spheres), the stack grows **upward**
  (`+y`) into the next layer. The 2-parcel scene height limit (~31m) allows
  roughly 50 layers before the top starts clipping.

## How to run / preview

From this scene's root folder (not the repo root):

```
npm install
npm run start
```

Then open `http://127.0.0.1:8000?position=40,40` in a browser, or use the
desktop-client link the server prints. Or open this folder in VS Code with the
Decentraland Editor extension and press **Run Scene**.

## How to validate in the Unity Explorer Profiler

1. Load this scene on the **old** Explorer build. Open the **Profiler** →
   **Memory** module and note the **Mesh** asset category.
2. Click **`+N spheres`** several times. On the old build, the Mesh asset count
   and total mesh memory climb **1:1 with the sphere count**.
3. Click **`Delete all`** and confirm the count and memory drop back down.
4. Now load the exact same scene on the **new** Explorer build and repeat.
5. This time the Mesh asset category should stay at a **single shared Mesh
   asset**, and mesh memory should stay **flat** no matter how many spheres you
   spawn.

That difference between the two builds — mesh memory climbing on the old build
vs. staying flat on the new one — is the proof that the optimization is working.
