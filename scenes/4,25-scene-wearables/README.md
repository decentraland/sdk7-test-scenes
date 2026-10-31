This scene exercises **scene wearables**: wearable GLBs shipped in the scene's own content and worn through
`AvatarShape`, on the avatar's real rig (locomotion and emotes keep working).

`wearables/` holds copies of `base-avatars` items, one folder per item, named `*_<category>.glb`
(`_m_` / `_f_` before the category for per-body-shape models).

> Uses an authoritative server, so it needs the `auth-server` SDK branch (`npm install @dcl/sdk@auth-server`).
> `npm run start` also runs the server locally.

### SCENE LAYOUT

- **Panel** (top-left): pick the target (**Me** / **Mannequin**) and the example (**Local only** / **Synced**), then
  toggle each wearable or take everything off. At the bottom, **Profile wearables** lists each item of the local
  player's profile outfit (`AvatarEquippedData.wearables`) by its short name, as visible, hidden or unknown (flag unset).
- **Mannequin** NPC at (8,0,10): base look plus the scene wearables picked for it.
- **Edge case NPCs** at z=13: **Control** (x=3), **Same category** (x=5.5), **Missing path** (x=10.5),
  **Catalog hides** (x=13), **Scene not hidden** (x=15). **Unknown entry** at (3,0,15).

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
- `wearables`: a non-empty list **replaces** the whole wearable set, like on an NPC. Unlisted categories stay
  empty: the base body shows, with its face. Catalog URNs and scene `.glb` paths are both allowed. An empty list keeps the profile wearables.
- A scene `.glb` is always rendered and hides nothing (a `skin` one still hides the body parts it replaces). Catalog
  URNs keep their own hiding rules.
- `bodyShape`, `skinColor`, `hairColor`, `eyeColor`, `showOnlyWearables` apply when set.
- `name`, `expressionTriggerId`, `expressionTriggerTimestamp`, `emotes` and `talking` are ignored: the nametag stays the
  profile name and no emote plays.
- The override is local to the client and only active while the scene is current. NPCs are unchanged.

### RECIPES

Starting points for a scene, each a case of `playerShape` in `src/client/client.tsx`. They share one helper: it writes
only when the value changes, because every write reloads the avatar, and `undefined` restores the profile look.

```ts
import {
  AvatarBase, AvatarEquippedData, AvatarShape, engine, Entity, PBAvatarShape, PlayerIdentityData
} from '@dcl/sdk/ecs'
import { Color3 } from '@dcl/sdk/math'

const BASE = 'urn:decentraland:off-chain:base-avatars:'
const written = new Map<Entity, string>()

function dressPlayer(player: Entity, shape: Partial<PBAvatarShape> | undefined) {
  const identity = PlayerIdentityData.getOrNull(player)
  if (!identity) return
  const key = identity.address + JSON.stringify(shape ?? null)
  if (written.get(player) === key) return
  written.set(player, key)
  if (shape) AvatarShape.createOrReplace(player, { id: identity.address, emotes: [], wearables: [], ...shape })
  else AvatarShape.deleteFrom(player)
}
```

**Add on top: the player's outfit plus a scene item** (case **Add on top**). The scene item comes last, so it replaces
the profile item of its category. Profile items of other categories stay, since a scene item hides nothing and nothing
hides it: profile dungarees and a scene kilt overlap. The equipped items are in the key, so a backpack change
re-dresses. Pick the model by body shape when the item has one per body.

```ts
const KILT = { male: 'wearables/kilt/kilt_m_lower_body.glb', female: 'wearables/kilt/kilt_f_lower_body.glb' }

engine.addSystem(() => {
  const equipped = AvatarEquippedData.getOrNull(engine.PlayerEntity)
  const avatarBase = AvatarBase.getOrNull(engine.PlayerEntity)
  if (!equipped || !avatarBase) return
  const female = avatarBase.bodyShapeUrn.toLowerCase().endsWith(':basefemale')
  dressPlayer(engine.PlayerEntity, { wearables: [...equipped.wearableUrns, female ? KILT.female : KILT.male] })
})
```

**Uniform: the scene outfit wins outright** (cases **Replace list**, **Full AvatarShape**). List the whole outfit and
leave the equipped items out. Every unlisted category stays empty (no hair, bare feet), so list them too. Catalog URNs
and scene paths mix freely.

```ts
const UNIFORM = ['short_hair', 'black_jacket', 'brown_pants', 'classic_shoes'].map((w) => BASE + w)

engine.addSystem(() =>
  dressPlayer(engine.PlayerEntity, { wearables: [...UNIFORM, 'wearables/laurel_wreath/laurel_wreath_tiara.glb'] })
)
```

**Same outfit, other look** (cases **Colours only**, **Other body**, **Show only wearables**). An empty `wearables`
keeps the profile items, and every unset field keeps the profile value. The fields combine with each other and with
either recipe above.

```ts
dressPlayer(engine.PlayerEntity, { skinColor: Color3.Green(), hairColor: Color3.Red(), wearables: [] })
dressPlayer(engine.PlayerEntity, { bodyShape: BASE + 'BaseMale', wearables: [] })
dressPlayer(engine.PlayerEntity, { showOnlyWearables: true, wearables: [] })
```

**Back to the profile look**: `dressPlayer(player, undefined)` deletes `AvatarShape`. Leaving the scene restores the
profile look without any write.

**Everyone sees it** (example **Synced**). The override shows only on the client that writes it, so every client
dresses every player from state the scene syncs, here the server-written `Outfits`:

```ts
engine.addSystem(() => {
  for (const [player, identity] of engine.getEntitiesWith(PlayerIdentityData))
    dressPlayer(player, shapeFor(identity.address.toLowerCase()))
})
```

Not possible yet:

- Keeping some profile categories and dropping others (the player's hair, the scene's clothes):
  `AvatarEquippedData` has URNs only, with no categories or hiding rules.
- Hiding a profile item with a scene item of another category.
- Overriding the name, emotes or expressions.

| Concern | Where |
| --- | --- |
| Wearable list and paths | `src/shared/wearables.ts` |
| Reading `AvatarEquippedData.wearables` before the SDK ships it | `src/client/equippedWearables.ts` |
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
6. Profile wearables: in the backpack, equip an item that another one hides (a helmet hiding a hat). Expected: the
   hidden one shows as hidden, the rest as visible. Items show as unknown only until the avatar has loaded. With a scene
   override active (any **On me** case, or scene wearables picked) the flags must stay the profile's: a scene wearable
   never appears in the list and does not change the flags.
7. Two clients, A and B. A wears an item in **Local only**. Expected: B does not see it. A wears an item in **Synced**.
   Expected: B sees it on A, and on the mannequin too. A late joiner sees the synced outfits right away.

### EDGE CASES

What scene wearables changed in `AvatarShape` and what they must keep. Compare a build without scene wearables
(before) with one that has them (after).

| Case | Before | After |
| --- | --- | --- |
| **Control** NPC: catalog items only | Red t-shirt, safari pants, sneakers | Same |
| **Same category** NPC: red t-shirt and black jacket, both `upper_body` | Both items render on top of each other | Only the black jacket, the later item |
| **Missing path** NPC: red t-shirt plus a `.glb` path the scene does not ship | Not checked yet | Red t-shirt; the path is skipped with a `Scene wearable ... skipped` warning |
| **Catalog hides** NPC: denim dungarees (hide `lower_body`) and safari pants, both catalog | Dungarees, no pants | Same |
| **Scene not hidden** NPC: denim dungarees and the scene kilt (`lower_body`) | Dungarees, no kilt | Dungarees and the kilt |
| **Unknown entry** NPC: red t-shirt, `wearables/kilt/kilt.json` and `not-a-urn` | Not checked yet | Red t-shirt; the two entries are skipped, each with a warning |

The **On me** / **On others** buttons cycle what this client writes on the player entities (its own / every other
player's). Before scene wearables, any of them spawns a second avatar next to the real one, which stays unchanged.
After, there is never a second avatar:

| Case | `AvatarShape` written | Expected on the real avatar |
| --- | --- | --- |
| **Add on top** | Equipped items, then the scene wearables picked in the panel; deleted when nothing is picked | Profile look plus the picks, each replacing the profile item of its category |
| **Colours only** | Green skin, red hair, empty `wearables` | Profile body and wearables, green skin, red hair |
| **Replace list** | Black jacket, then the picks | Profile body and colours. Black jacket and the picks; every other category stays empty: no hair, bare legs and feet |
| **Other body** | The other body shape, empty `wearables` | Profile wearables and colours on the other body. Emotes still play |
| **Show only wearables** | `showOnlyWearables`, empty `wearables` | Profile wearables only: no skin, hair or face |
| **Only a missing path** | A `.glb` path the scene does not ship | Exact profile look, with a `Scene wearable ... skipped` warning |
| **Full AvatarShape** | Name, male body, green skin, red hair, catalog items (black jacket, brown pants, classic shoes, short hair), the picks and the `wave` expression | Male body, green skin, red hair, the catalog items and the picks. The name stays the profile name, no wave |

Cycling back to **Add on top** with nothing picked deletes `AvatarShape`. Expected: exact profile look.
