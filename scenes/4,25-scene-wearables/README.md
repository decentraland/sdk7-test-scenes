This scene exercises **scene wearables**: wearable GLBs shipped in the scene's own content and worn through
`AvatarShape`, on the avatar's real rig (locomotion and emotes keep working).

`wearables/` holds copies of `base-avatars` items, one folder per item, named `*_<category>.glb`
(`_m_` / `_f_` before the category for per-body-shape models).

### SCENE LAYOUT

- **Panel** (top-left): pick **Me** or **Mannequin**, then toggle each wearable or take everything off.
- **Mannequin** NPC at (8,0,10): base look plus the scene wearables picked for it.

### HOW IT WORKS

- **Me**: the scene writes `AvatarShape` on `engine.PlayerEntity`.
- **Other players**: each player's picks are synced as an `Outfit` entity (`syncEntity`), and every client writes
  `AvatarShape` on each player's entity (`PlayerIdentityData`). The explorer applies it locally and broadcasts nothing.
- The male or female model follows the target player's `AvatarBase.bodyShapeUrn`.

### SCENE TESTING

1. Toggle each wearable on **Me**. Expected: it appears with its texture, hands visible, the profile item of the same
   category replaced and the rest kept.
2. Run, jump, glide, play an emote. Expected: wearables follow the rig.
3. Walk off the parcel and back. Expected: profile look outside, scene outfit again inside.
4. Take off all. Expected: exact profile look.
5. Switch to **Mannequin** and toggle wearables. Expected: they replace its base items.
6. Two clients: A wears an item. Expected: B sees it on A while both are in the scene.
