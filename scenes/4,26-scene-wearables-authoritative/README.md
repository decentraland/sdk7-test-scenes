Scene wearables (see `4,25-scene-wearables`) with outfits owned by an **authoritative server** and synced over the
network, instead of each client syncing its own.

> Requires the `auth-server` SDK branch (`npm install @dcl/sdk@auth-server`). `npm run start` also runs the server
> locally.

### HOW IT WORKS

| Step | Where |
| --- | --- |
| The panel sends an intent (`toggleWearable`, `takeOffAll`) for **Me** or the **Mannequin** | `src/client/client.tsx`, `src/shared/messages.ts` |
| The server takes the sender from the verified message context, validates the wearable name and updates the outfit | `src/server/server.ts` |
| The server is the only writer of the synced `Outfits` component (`validateBeforeChange`) | `src/shared/schemas.ts` |
| Every client writes `AvatarShape` on each player's entity (`PlayerIdentityData`) and on the mannequin from `Outfits` | `src/client/client.tsx` |
| A player who leaves the scene loses the outfit | `src/server/server.ts` |

The explorer applies `AvatarShape` on player entities locally and broadcasts nothing, so the server state is what makes
all clients agree.

### SCENE TESTING

1. Toggle wearables on **Me**. Expected: they appear on your avatar shortly after the click (server round trip).
2. Toggle wearables on the **Mannequin**. Expected: its base items get replaced.
3. Second client in the scene. Expected: it sees the same outfits on you and on the mannequin; a late joiner sees them
   right away.
4. Leave the scene with the first client. Expected: its outfit is dropped for everyone.
