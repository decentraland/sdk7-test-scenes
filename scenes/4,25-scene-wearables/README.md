This scene exercises **scene wearables**: wearable GLBs shipped in the scene's own content and worn through
`AvatarShape`, on the avatar's real rig (locomotion and emotes keep working).

`wearables/` holds copies of `base-avatars` items, one folder per item, named `*_<category>.glb`
(`_m_` / `_f_` before the category for per-body-shape models).

> Uses an authoritative server, so it needs the `auth-server` SDK branch (`npm install @dcl/sdk@auth-server`).
> `npm run start` also runs the server locally.

### SCENE LAYOUT

- **Panel** (top-left): pick the target (**Me** / **Mannequin**) and the example (**Local only** / **Synced**), then
  toggle each wearable or take everything off.
- **Mannequin** NPC at (8,0,10): base look plus the scene wearables picked for it.
- **Edge case NPCs** at z=13: **Control** (x=3), **Same category** (x=5.5), **Missing path** (x=10.5).

### TWO EXAMPLES

The explorer applies `AvatarShape` written on a player's entity on that client only and broadcasts nothing. Each
client of the scene decides what it shows.

| Example | How | Who sees it |
| --- | --- | --- |
| **Local only** | The client writes `AvatarShape` from its own picks | This client only; others keep seeing your profile |
| **Synced** | The panel sends an intent (`toggleWearable`, `takeOffAll`). The server takes the sender from the verified message context, validates the wearable and is the only writer of the synced `Outfits` component. Every client writes `AvatarShape` on each player (`PlayerIdentityData`) and on the mannequin from it | Everyone in the scene |

Local picks are applied after synced ones, so they win within a category. A player who leaves the scene loses the
synced outfit.

### AvatarShape ON A PLAYER ENTITY

- A field left unset keeps the profile value.
- `wearables`: a non-empty list **replaces** the whole wearable set, like on an NPC. Unlisted categories fall to
  defaults. Catalog URNs and scene `.glb` paths are both allowed. An empty list keeps the profile wearables.
- `bodyShape`, `skinColor`, `hairColor`, `eyeColor`, `showOnlyWearables` apply when set.
- `name`, `expressionTriggerId`, `expressionTriggerTimestamp`, `emotes` and `talking` are ignored: the nametag stays the
  profile name and no emote plays.
- The override is local to the client and only active while the scene is current. NPCs are unchanged.

Because the list replaces, this scene writes the player's equipped items (`AvatarEquippedData.wearableUrns`) followed
by the picked scene paths, which come last and so win per category. It re-dresses when the equipped items change, waits
for `AvatarEquippedData` and `AvatarBase` to exist, and deletes `AvatarShape` when nothing is picked.

| Concern | Where |
| --- | --- |
| Wearable list and paths | `src/shared/wearables.ts` |
| Messages, synced component, server-only writes | `src/shared/messages.ts`, `src/shared/schemas.ts` |
| Server | `src/server/server.ts` |
| Dressing avatars and the panel | `src/client/client.tsx` |

### SCENE TESTING

1. **Local only**, **Me**: toggle each wearable. Expected: it appears with its texture and hands visible. The profile
   item of the same category is replaced; the rest is kept.
2. Run, jump, glide, play an emote. Expected: wearables follow the rig.
3. Walk off the parcel and back. Expected: profile look outside, scene outfit again inside.
4. Take off all. Expected: exact profile look.
   A profile item disappears from the look unless it comes back through `AvatarEquippedData`, so change a profile item
   in the backpack and take everything off again. Expected: the new item shows, the old one is gone.
5. **Mannequin**: toggle wearables in both examples. Expected: they replace its base items.
6. Two clients, A and B. A wears an item in **Local only**. Expected: B does not see it. A wears an item in **Synced**.
   Expected: B sees it on A, and on the mannequin too. A late joiner sees the synced outfits right away.

### EDGE CASES

What scene wearables changed in `AvatarShape` and what they must keep. Compare a build without scene wearables
(before) with one that has them (after).

| Case | Before | After |
| --- | --- | --- |
| **Control** NPC: catalog items only | Red t-shirt, safari pants, sneakers | Same |
| **Same category** NPC: red t-shirt and black jacket, both `upper_body` | Both items render on top of each other | Only the black jacket, the later item |
| **Missing path** NPC: red t-shirt plus a `.glb` path the scene does not ship | Not checked yet | Red t-shirt; the path is skipped with a `Scene wearable ... skipped` warning |

The **On me** / **On others** buttons cycle what this client writes on the player entities (its own / every other
player's). Before scene wearables, any of them spawns a second avatar next to the real one, which stays unchanged.
After, there is never a second avatar:

| Case | `AvatarShape` written | Expected on the real avatar |
| --- | --- | --- |
| **Add on top** | Equipped items, then the scene wearables picked in the panel; deleted when nothing is picked | Profile look plus the picks, each replacing the profile item of its category |
| **Colours only** | Green skin, red hair, empty `wearables` | Profile body and wearables, green skin, red hair |
| **Replace list** | Black jacket, then the picks | Profile body and colours. Black jacket and the picks; every other category falls to the body defaults (face, hair, trousers, shoes) |
| **Other body** | The other body shape, empty `wearables` | Profile wearables and colours on the other body. Emotes still play |
| **Show only wearables** | `showOnlyWearables`, empty `wearables` | Profile wearables only: no skin, hair or face |
| **Only a missing path** | A `.glb` path the scene does not ship | Exact profile look, with a `Scene wearable ... skipped` warning |
| **Full AvatarShape** | Name, male body, green skin, red hair, catalog items (black jacket, brown pants, classic shoes, short hair), the picks and the `wave` expression | Male body, green skin, red hair, the catalog items and the picks. The name stays the profile name, no wave |

Cycling back to **Add on top** with nothing picked deletes `AvatarShape`. Expected: exact profile look.
