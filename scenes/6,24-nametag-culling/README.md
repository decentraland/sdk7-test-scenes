Tests `AvatarModifierType.AMT_DISABLE_NAMETAG_CULLING` (`AvatarModifierArea`).

Avatars inside the area (players, NPCs with `AvatarShape`, scene plates via `AvatarNametag`) keep their nametag at any distance, with no fade. Outside it, nametags are culled beyond 40 m from the camera and fade from 20 m. `AMT_HIDE_NAMETAGS` wins if both apply. `exclude_ids` works as for other modifiers. The client also caps visible tags to the 100 nearest to the player.

Main use case: far or top-down cameras (e.g. an ortho-like game camera) that need every nametag, switched on and off at runtime.

### SCENE LAYOUT

Parcels 6,24 to 13,25 (128 m x 32 m). Spawn at x:[2,4] z:[14,18], looking along +x.

- **Row NPCs** on z = 16, at 10, 30, 60 and 100 m from the spawn.
- **"Plate NPC"** (z = 24, 30 m): has `AvatarNametag { label: "Plate 30 m" }`.
- **"Hide wins"** (z = 26, 60 m): inside a sub-area with `AMT_HIDE_NAMETAGS` + `AMT_DISABLE_NAMETAG_CULLING`.
- **Top-down VirtualCamera** 75 m above the row, `fov: 45`.
- **Scene area**: one `AvatarModifierArea` covering the whole scene with `AMT_DISABLE_NAMETAG_CULLING`, added and removed by the panel button.

### SCENE TESTING

Use the panel on the left.

1. Both toggles OFF, regular camera: NPC 10 m, 30 m and "Plate 30 m" show tags (30 m ones fading), 60 m and 100 m hidden.
2. Top-down camera ON, area OFF: no nametag visible.
3. Area ON (top-down): every tag visible, with no fade, including "Plate 30 m". "Hide wins" shows none.
4. Toggle the area OFF and ON again: tags disappear and reappear at runtime.
5. Area ON, regular camera: far NPCs (60 m, 100 m) keep their tags when you look at them from the spawn.
