This scene exercises the `AvatarNametag` core component (`PBAvatarNametag`, id 1221) — a plate
with scene-provided text rendered above an avatar's native nametag.

### SCENE LAYOUT

- **Player** (spawn x:[0,3] z:[0,3]) — starts with a plate applied to `engine.PlayerEntity`.
- **NPC John** at (6,0,6) — `AvatarShape.name = "John"` + plate "Boss". Expected: the plate
  renders above the native "John" nametag.
- **NPC Sign** at (9,0,6) — `AvatarShape.name = ""` (empty native name) + plate "Sign Only".
  Expected: only the plate shows, no empty native-name box underneath.
- **NPC Walker** — patrols x=2, z:[4,14]. Exercises the plate following a moving avatar.
- **Whole-scene hide-nametags toggle** — button-controlled `AvatarModifierArea` (modifier
  `AMT_HIDE_NAMETAGS`) covering the whole parcel.
- **Walk-in zone** at (13,2,13), area 4x6x4 (orange ground marker) — always-on
  `AvatarModifierArea` with `AMT_HIDE_NAMETAGS`, to exercise the natural enter/leave path.

### SCENE TESTING

Use the four-corner control panel to drive every test case with one button press per case — see
the PR description for the full enumerated list and expected results. In short:

1. **TARGET** (top-left) — pick which entity (Player / NPC John / NPC Sign) the rest of the panel
   acts on, and read back the live component state.
2. **LABEL TEXT** (top-right) — free-form input plus presets for empty label, spaces-only label,
   and a deliberately long label (ellipsis truncation).
3. **COLORS** (bottom-left) — swatch rows for `labelColor` / `backgroundColor` / `borderColor`,
   each with a "native" (omit the field) option plus presets, including a label/background pair
   with identical colors (the "hidden word" case).
4. **SCENE & MULTIPLAYER** (bottom-right) — the scene-wide `AvatarModifierArea` toggle, the
   multiplayer auto-tag system's color toggle (applies a deterministic roster to every connected
   player, local and remote), and `deleteFrom` for component removal.
