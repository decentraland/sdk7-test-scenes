# Sphere Mesh Sharing Benchmark

## What this demonstrates

This scene validates a Unity Explorer memory optimization: `SpherePrimitive`
now shares **one immutable `Mesh` asset** across every sphere entity in the
scene, instead of allocating a brand new `Mesh` per entity. `Box` / `Plane` /
`Cylinder` primitives are unaffected — they still allocate a distinct mesh
per entity.

The scene starts **empty** and gives you an on-screen panel to spawn shapes in
real time, so you can watch the Memory Profiler react as you add each batch:

- **`+N spheres`** — spawns a batch of sphere entities (`MeshRenderer.setSphere`)
  in the **left half** (blue) — the **optimized** path.
- **`+N boxes`** — spawns a batch of box entities (`MeshRenderer.setBox`) in the
  **right half** (red) — the **control/unoptimized** path.
- **`Delete all`** — removes every spawned shape so you can start over.

The panel also shows the live sphere and box counts. Adding spheres leaves mesh
memory flat; adding boxes climbs it 1:1 — the difference is attributable to the
mesh allocation strategy, not scene layout (both use the same spacing and scale).

Each button press spawns `ADD_BATCH` entities (default `100`). To change the
batch size, edit the single constant near the top of
[`src/spawner.ts`](src/spawner.ts):

```ts
export const ADD_BATCH = 100
```

## Code layout

- [`src/index.ts`](src/index.ts) — entry point; just wires up the UI.
- [`src/spawner.ts`](src/spawner.ts) — all spawn/registry logic (`addSpheres`,
  `addBoxes`, `deleteAll`, live counts) and the layout constants.
- [`src/ui.tsx`](src/ui.tsx) — the on-screen panel with the buttons and counters.

## Scene layout

- Parcels: `40,40` (base) and `41,40` — a 2-parcel-wide, 1-parcel-deep strip
  (32m × 16m in local coordinates), large enough to hold both groups side by
  side.
- Spheres fill the **left half**, anchored at local `x: 2, z: 2`.
- Boxes fill the **right half**, anchored at local `x: 17.4, z: 2`.
- Each group grows a grid `GRID_COLUMNS = 20` wide with 0.6m spacing between
  entity centers and a 0.4m entity scale, wrapping to a new row (`+z`) as more
  are added. At the default parcel depth that's ~26 rows before a group runs
  past the parcel edge; add parcels or reduce `SPACING` if you plan to spawn
  many thousands per group.

## How to run / preview

From this scene's root folder (not the repo root):

```
npm install
npm run start
```

Or open this folder in VS Code with the Decentraland Editor extension and
press **Run Scene**.

## How to validate in the Unity Explorer Profiler

1. Launch the Unity Explorer and preview this scene (point it at the local
   preview server started by `npm run start`, or deploy to a test catalyst).
2. Once the scene has loaded, open the **Profiler** window and switch to the
   **Memory** module. Keep it visible next to the scene.
3. Click **`+N spheres`** several times and watch the **Mesh** asset category:
   the sphere group should stay at a **single shared Mesh asset**, and mesh
   memory should stay flat no matter how many spheres you add.
4. Now click **`+N boxes`** several times: the box group should show a **new
   distinct Mesh asset per entity**, with total mesh memory climbing linearly
   with the box count.
5. Click **`Delete all`** and confirm both counts drop to zero and the
   corresponding mesh memory is released.

That contrast — spheres staying flat while boxes climb 1:1, live as you click —
is the proof that the optimization is working.
