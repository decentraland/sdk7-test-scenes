# Sphere Mesh Sharing Benchmark

## What this demonstrates

This scene validates a Unity Explorer memory optimization: `SpherePrimitive`
now shares **one immutable `Mesh` asset** across every sphere entity in the
scene, instead of allocating a brand new `Mesh` per entity. `Box` / `Plane` /
`Cylinder` primitives are unaffected — they still allocate a distinct mesh
per entity.

The scene spawns two equal-size grids of `MeshRenderer` entities so the two
code paths can be compared side by side in the same build:

- **Left grid (blue)** — `COUNT_PER_GROUP` sphere entities (`MeshRenderer.setSphere`) — the **optimized** path.
- **Right grid (red)** — `COUNT_PER_GROUP` box entities (`MeshRenderer.setBox`) — the **control/unoptimized** path.

Both groups use the same count, spacing, and entity scale, so any difference
observed between them in the Memory Profiler is attributable to the mesh
allocation strategy, not to scene layout.

Default `COUNT_PER_GROUP = 512` (1024 entities total), which is large enough
to make the Mesh count / memory difference obvious in the Profiler while
still loading quickly. To change it, edit the single constant at the top of
[`src/index.ts`](src/index.ts):

```ts
const COUNT_PER_GROUP = 512
```

## Scene layout

- Parcels: `40,40` (base) and `41,40` — a 2-parcel-wide, 1-parcel-deep strip
  (32m × 16m in local coordinates), large enough to hold both grids side by
  side with margin.
- Sphere grid occupies local `x: 2 → ~15.2`, `z: 2 → ~15.2` (left half).
- Box grid occupies local `x: 17.4 → ~30.6`, `z: 2 → ~15.2` (right half).
- Each grid is a square-ish layout (`GRID_COLUMNS = ceil(sqrt(COUNT_PER_GROUP))`)
  with 0.6m spacing between entity centers and a 0.4m entity scale, so
  entities never overlap. If you raise `COUNT_PER_GROUP` significantly,
  re-check that the grid still fits within the parcels (or add parcels /
  reduce `SPACING`).

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
2. Once the scene has loaded (both grids visible — blue spheres on the left,
   red boxes on the right), open the **Profiler** window and switch to the
   **Memory** module.
3. Inspect the **Mesh** asset category:
   - The **box (red)** group should show **`COUNT_PER_GROUP` distinct Mesh
     assets** (512 by default), with total mesh memory scaling linearly with
     the count.
   - The **sphere (blue)** group should show a **single shared Mesh asset**
     used by all `COUNT_PER_GROUP` sphere entities/renderers, regardless of
     how many spheres are on screen.
4. Compare total mesh memory attributed to each group: the box group's mesh
   memory should be roughly `COUNT_PER_GROUP ×` the memory of one box mesh,
   while the sphere group's mesh memory should stay constant at "one sphere
   mesh" no matter how high `COUNT_PER_GROUP` is set.
5. To make the contrast even more obvious, raise `COUNT_PER_GROUP` (e.g. to
   2048 or 4096), rebuild/re-run, and confirm the box group's Mesh count and
   memory scale up proportionally while the sphere group's stays flat at one
   Mesh asset.

That collapse — many box meshes vs. one shared sphere mesh — is the proof
that the optimization is working.
