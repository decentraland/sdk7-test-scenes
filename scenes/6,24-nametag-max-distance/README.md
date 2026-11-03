This scene exercises how far away avatar nametags stay visible:

- `VirtualCamera.nametagMaxDistance` (`PBVirtualCamera.nametag_max_distance`): applies to every nametag while that virtual camera is active, and takes priority over the per-avatar field.
- `AvatarNametag.maxDistance` (`PBAvatarNametag.max_distance`): applies to one avatar and hides its whole nametag (name and plate).
- The client cap: at most the 100 avatars nearest to the player show a nametag.

Distances are measured from the camera. Unset, `<= 0` or NaN means the client default of 40 m. Nametags fade out between 50% and 100% of the effective distance.

### SCENE LAYOUT

Parcels 6,24 to 13,25 (128 m x 32 m). Spawn at x:[2,4] z:[14,18], looking along +x.

- **Row NPCs** on z = 16, at 10, 30, 60 and 100 m from the spawn: "NPC 10 m" ... "NPC 100 m". No `AvatarNametag`.
- **"Tagged 25 m"** at 25 m (z = 20): `AvatarNametag { label: "max 15 m", maxDistance: 15 }`.
- **Player**: `AvatarNametag { label: "You: max 15 m", maxDistance: 15 }` on `engine.PlayerEntity`.
- **Top-down VirtualCamera** 75 m above the middle of the row, looking down, `fov: 45`.

### SCENE TESTING

Use the panel on the left. It shows what to expect for the active step.

1. **Regular camera** (`MainCamera.virtualCameraEntity` unset). NPC 10 m and NPC 30 m show their names (30 m is fading). NPC 60 m and NPC 100 m are hidden (beyond 40 m). "Tagged 25 m" is hidden until you walk within 15 m of it. Your own "You: max 15 m" plate is visible in third person.
2. **Top-down camera, no nametagMaxDistance**. The camera is about 75 m away from everyone, so no nametag is visible.
3. **Top-down camera, nametagMaxDistance = 200**. Every nametag is visible, including "Tagged 25 m" and yours, although their `maxDistance` is 15: the camera field wins. Switching between steps 2 and 3 changes the field on the active camera at runtime.
4. **Spawn 120 NPC crowd** (toggle). A 15 x 8 grid at x:[8,36] z:[1,12]. With the row and you there are more than 100 avatars, so only the 100 nearest to you keep a nametag: the far corner of the crowd loses its tags. Walk around and the set of tagged avatars follows you. Works with every camera step (with step 3, the cap is the only thing that hides tags).

Going back to step 1 must restore the regular culling.
