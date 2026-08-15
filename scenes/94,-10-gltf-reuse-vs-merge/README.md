# gltf-reuse-vs-merge

A measurement bench for the claims added in
[decentraland/docs#164](https://github.com/decentraland/docs/pull/164) and
[decentraland/sdk-skills#75](https://github.com/decentraland/sdk-skills/pull/75):
what reusing one `.glb` across many entities actually saves, what it does not
save, and what merging meshes in Blender buys instead.

Six stations, each in its own 5m strip, each toggled from a pedestal. Only the
stations you switch on exist, so every number you read is a delta you control.

## Setup

1. Drop `LampostSmall.glb` into `models/` (see `models/README.md`).
2. Generate the variants: `blender --background --python tools/make_variants.py`
3. `npm install && npm run start`

Stations D and E stay empty until step 2 has run. A/B/C/F only need step 1.

With the lamp post currently in `models/` — one visible mesh, **2 material slots**,
plus a `_collider` node — the numbers to expect are 2 draw calls per post, so **28
for a 14-post row** at stations B, C and D, against **2** at station E.

## Layout

```
   x=1      6        11       16       21       26      31
    |-------|--------|--------|--------|--------|--------|
z=27 …  A       B        C        D        E        F        <- 14 lamp posts each
                                                                (F: 50)
z=3     [A]     [B]      [C]      [D]      [E]      [F]      <- station pedestals
z=0.8              [CLEAR ALL]  [HIDE MARKERS]  [PRELOAD]    <- utility pedestals
        spawn point is at x=16, z=1, facing +z
```

| # | Station | What it builds |
| --- | --- | --- |
| A | `BASELINE x1` | 1 entity → `LampostSmall.glb` — the per-post cost of everything |
| B | `SHARED x14` | 14 entities → the **same** `LampostSmall.glb` |
| C | `DUPES x14` | 14 entities → 14 **different** near-identical `.glb` files |
| D | `PACKED x1` | 1 entity → one `.glb` holding 14 **separate** objects |
| E | `MERGED x1` | 1 entity → one `.glb` whose meshes were **joined** in Blender |
| F | `BURST x50` | 50 entities → the same `.glb`, all spawned in one frame |

Utility pedestals: **CLEAR ALL** removes every station (use it between
measurements), **HIDE MARKERS** deletes the six station pedestals and their labels
so they are out of the counts (the three utility pedestals stay, so you can click
them again), **PRELOAD** issues an `AssetLoad` for `LampostSmall.glb`.

Every station logs to the scene console what it spawned and what to expect.

## What to measure, per claim

Read the numbers with whatever combination you prefer: Unity **Frame Debugger**
(draw calls and `SRP Batch` grouping), **Profiler → Rendering** (batches, SetPass
calls), **Memory Profiler** (Mesh / Texture / Material object counts), the scene
stats panel (`geometries`, `bodies`, `materials`, `textures`, `triangles`), or the
Explorer MCP tools (`get_scene_content_breakdown`, `get_performance_stats`).

Always **CLEAR ALL** between stations, and press **HIDE MARKERS** before a capture.

| # | Claim under test | Stations | Look at | Expected |
| --- | --- | --- | --- | --- |
| 1 | One file shared by many entities is downloaded once, converted once, and held in memory once | A → B | network/AB conversion, `geometries`, Mesh + Texture counts | flat from A to B: one mesh set, one texture set, one bundle, regardless of 14 entities |
| 2 | Near-identical files per copy cost N downloads and N copies in memory | B → C | same as above | 14× the meshes, textures and downloads of B, for identical pixels |
| 3 | Reuse does **not** save draw calls | B vs D | Frame Debugger draw count with the same posts on screen | equal: 14 renderers × material slots either way |
| 4 | Packing N objects into one `.glb` is not merging | D | Frame Debugger | still 14 renderers → 28 draws for a 2-material post; the single entity changes nothing |
| 5 | Only joining meshes reduces draw calls | E | Frame Debugger | 1 renderer → 2 draws (one per material) |
| 6 | Merging gives up per-object culling and file size | E vs B | walk to the edge of the strip so half the row is off screen; `ls -l models/` | E draws the whole row whenever any part is visible; the merged file is 779 KB against the 57 KB source |
| 7 | Repeating a model adds no materials or textures | A → B | Memory Profiler Material count and Texture count | **textures**: flat. **materials**: expected to scale with copies — see the caveat below |
| 8 | The SRP Batcher makes the many draws cheap, not fewer | B, D | Frame Debugger: `SRP Batch` nodes; Profiler SetPass calls | draws stay at 28, but they collapse into few `SRP Batch` groups and few SetPass calls |
| 9 | Preload before spawning a burst | F, PRELOAD | reload the scene, press PRELOAD, wait for `FINISHED` in the log, then F | copies appear without each one waiting on the same load; compare against a fresh reload where you press F first |
| 10 | One large model lands in a single frame, many small ones spread out | F vs D/E | frame time / hitch when toggling | F fills in progressively under the per-container frame budget; D and E pop in as one indivisible instantiate |

Claim 11 from the docs — *a neighbouring scene using the same file gets it for
free* — cannot be shown from inside one scene. To check it, point a second scene
at a `.glb` with the same content hash and walk between them: the second scene
should skip the download entirely.

## Caveats that will bite the measurements

- **Materials are instantiated per renderer.** After a GltfContainer finishes
  loading, the client writes the scene's clipping planes through
  `Renderer.GetMaterials`, which is the *instantiating* overload. So 14 copies
  produce 14 × slots distinct `Material` objects even though they share one mesh
  and one texture set. Meshes and textures behave exactly as the docs describe;
  the "no new materials" half of claim 7 is the part worth confirming carefully,
  and it is the one place where the measurement may contradict the doc wording.
- **The dupes embed their texture; the source model references it externally.** That
  is on purpose — if the 14 files pointed at the same `Lamp_mat_baseColor.png`, the
  texture would dedup by hash and station C would duplicate meshes only. It does
  mean C is the one station whose per-file size is not directly comparable to A/B.
- **Local development vs deployed hashing.** The local dev server hashes assets by
  path; a deployed scene hashes by content. That only matters for station C: the
  generated dupes are byte-different on purpose so the station means the same
  thing in both. Never conclude anything about download or memory cost from a
  local run alone — texture import in local development skips mipmaps and crunch
  compression, so texture memory there is not representative.
- **`/reload` drains the caches.** Any timing taken right after a reload is a
  cold-cache timing. That is what you want for claim 9, and what you do not want
  for anything else.
- **The bench's own overhead.** Pedestals are 1 box renderer + 1 material each and
  labels are TextShape renderers. HIDE MARKERS deletes them entirely (it does not
  just hide them) so they leave the counts. All lamp posts are spawned with
  `CL_NONE` on both collision masks — no colliders, no physics bodies, nothing but
  renderers in the numbers.
- **Frame Debugger sees the whole client**, not just this scene: terrain, sky,
  avatar and UI are in there too. Compare deltas between stations from the same
  viewpoint rather than absolute totals.
