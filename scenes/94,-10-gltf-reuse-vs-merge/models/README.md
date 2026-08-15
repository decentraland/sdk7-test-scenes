# Models

Drop **`LampostSmall.glb`** here. It is the only file you have to provide.

Everything else in this folder is generated from it:

```bash
blender --background --python tools/make_variants.py
```

| File | Made of |
| --- | --- |
| `LampostSmall.glb` | **you provide this** — one lamp post |
| `dupes/LampostSmall_01..14.glb` | 14 near-identical copies with different bytes (different object/mesh/material names) |
| `LampostRow_Separate.glb` | one file, 14 lamp posts as separate objects, **not** joined |
| `LampostRow_Merged.glb` | one file, the same 14 lamp posts joined into a single mesh (Ctrl-J) |

The dupes must differ in bytes on purpose: a deployed scene addresses files by
content hash, so 14 identical copies would collapse into one and the duplication
test would silently measure the shared case instead.

## What the generator produced here

`LampostSmall.glb` is one visible mesh with **2 material slots** (`Lamp_mat`,
`LampEmissive_mat`) plus a `Lamp_LOD0_collider_box` node, and it references
`Lamp_mat_baseColor.png` as an external file.

| File | Visible nodes | Draw calls | Meshes | Size |
| --- | --- | --- | --- | --- |
| `LampostSmall.glb` | 1 | 2 | 2 | 57 KB + 41 KB external png |
| `dupes/LampostSmall_NN.glb` | 1 | 2 | 2 | 98 KB each, 14 distinct hashes |
| `LampostRow_Separate.glb` | 14 | **28** | 2 (shared by all 14 nodes) | 98 KB |
| `LampostRow_Merged.glb` | 1 | **2** | 2 | **779 KB** |

Two things the generator does deliberately:

- **The dupes embed the texture** instead of pointing at the shared external
  `.png`. Sharing it by URI would let the texture dedup by hash across all 14
  files, and station C would then only duplicate meshes — understating the cost
  the docs describe.
- **Colliders are joined separately from render meshes.** Welding a material-less
  `_collider` box into the visible mesh would draw the box and add a third
  material slot, so the merged file keeps one joined render mesh and one joined
  collider mesh.

`LampostBig.glb` and the `Lampost_mat_*.png` files are unused by this scene.
