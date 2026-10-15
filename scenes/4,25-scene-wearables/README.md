This scene exercises **scene wearables**: wearable GLBs shipped in the scene's own content and worn
through `AvatarShape`, on the player's real rigged avatar (locomotion and emotes keep working).

The wearables in `wearables/` are copies of the `base-avatars` collection, one folder per item. File names
follow the contract `*_<category>.glb`; split male/female models use `_m_` / `_f_` before the category.

### SCENE LAYOUT

- **Control panel** (top-left): wear / take off each scene wearable on yourself, take everything off.
- **NPC Mannequin** at (8,0,10): click it to cycle 4 outfits mixing catalyst base URNs and scene GLB paths.

### HOW IT WORKS

- Self: the scene writes `AvatarShape` on `engine.PlayerEntity` with the scene paths of the worn items.
- Other players: each player's outfit is synced as a `SceneOutfit` beacon (`syncEntity`); every client writes
  `AvatarShape` on each player's entity (`PlayerIdentityData`). The explorer applies it locally only and
  broadcasts nothing, so consistency comes from the scene's sync.
- The male or female file is picked from the target player's `AvatarBase.bodyShapeUrn`.

### SCENE TESTING

1. Wear each item. Expected: it appears on your avatar with its texture, hands visible, profile items of the
   same category replaced and the rest kept.
2. Run, jump, glide, play an emote. Expected: wearables follow the rig.
3. Walk off the parcel and back. Expected: profile look outside, scene outfit again inside.
4. Take off all. Expected: exact profile look.
5. Click the mannequin. Expected: outfits cycle.
6. Two clients: A wears an item. Expected: B sees it on A while both are in the scene.
