# Authoritative Server — Avatar Purge (DELETE_ENTITY exploit)

A minimal test scene **dedicated to reproducing the inbound `DELETE_ENTITY`
avatar-purge bug**. It began as a fork of
[`90,-9-authoritative-server-leaderboard`](../90,-9-authoritative-server-leaderboard)
but all the leaderboard gameplay — scoring, proximity anti-cheat, `Storage`
persistence, admin reset — has been stripped out. What remains is only what the
repro needs: a minimal authoritative (headless) server so remote avatars stream in,
a RED orb that fires the exploit, and a UI that lists the affected entities.

## The bug

In `@dcl/ecs` `systems/crdt/index.ts` → `receiveMessages()`, an **inbound**
`DELETE_ENTITY` message is applied with **no reserved-range guard**:

```js
if (msg.type === CrdtMessageType.DELETE_ENTITY) {
  entitiesShouldBeCleaned.push(msg.entityId)   // any id, incl. avatar range 32–256
  ...
}
// cleanup loop:
for (const entity of entitiesShouldBeCleaned)
  for (const definition of engine.componentsIter())
    definition.entityDeleted(entity, true)      // wipes PlayerIdentityData, Transform, ...
```

Avatars of remote players live in the reserved entity range and carry
`PlayerIdentityData` + `Transform`. A crafted CRDT frame carrying a `DELETE_ENTITY`
for one of those ids therefore **purges a live player from another client's scene**,
with no authentication and no range check. Recovery needs a peer reconnect or scene
reload — nothing heals it mid-session.

PR #1544 fixed only the *allocator* half (`removeEntity` is now a no-op on the
avatar range); the receive path above is the deferred half and is still unguarded
in the pinned SDK.

## Two purges, one click

Clicking the RED orb fires the exploit in **two** places (`src/shared/purge.ts` is
the shared primitive — a throwaway `Transport` whose `onmessage` gets a hand-built
12-byte `DELETE_ENTITY` frame, i.e. the exact bytes a hostile peer would send):

1. **CLIENT** (`src/client/repro-delete.ts`) — injects into *this browser's* engine.
   Wipes the other avatars from the client's own ECS view immediately. This is
   **host-independent**: it happens below the scene↔host boundary, so it looks the
   same on hammurabi and bevy.
2. **SERVER** (`purgeOnServer` message → `src/server/server.ts`) — the headless
   server injects the same delete into *its* engine. Besides purging the server's
   own copy, `receiveMessages` re-broadcasts it and `rendererTransport` forwards it
   (a `DELETE_ENTITY` has no `componentId`, so its filter doesn't drop it) across
   the scene→host boundary via `crdtSendToRenderer`. **That is the one place the
   guard runs:** hammurabi denies it, bevy applies it.

Both re-scan every click, so avatars that **join later** are hit next time.
(`engine.removeEntity()` is deliberately *not* used — it's a no-op on the avatar
range in this SDK; only the inbound receive path still purges.)

## What you see — two rosters

The UI panel shows two lists:

- **CLIENT view (this browser):** the live `getEntitiesWith(PlayerIdentityData,
  Transform)` in your own scene engine — id, address, scene-local position, you tinted
  blue and tagged `(me)`. The client-local purge mutates this immediately.
- **SERVER view (server's own copy):** the same query on the headless server, published
  via the synced `ServerRoster` component. A server purge drops rows here **on both
  packages** — the server's local copy is purged below the guard, so this is **not** the
  discriminator; it only tells you the server ran the purge.

The console mirrors the client view (`[exploit/client] BEFORE … / AFTER …`), and the
server logs `[SERVER] purgeOnServer … → injected DELETE_ENTITY for N player(s)`.

## Confirming hammurabi vs bevy

The guard difference is **not** visible on the attacker or in the SERVER view (both are
dominated by the local, below-the-guard purge). It shows up on an independent observer
and in the host's own behavior. Protocol:

1. Start the scene against the server package you want to test (`@dcl/sdk` set to the
   `auth-server` / hammurabi build, or the bevy-headless build).
2. Open **three** preview clients: an **attacker**, and **two observers** who never
   click.
3. Move all three onto the parcel so each sees the others in its CLIENT view.
4. In the attacker, click the RED orb. This fires the client-local purge *and* sends
   `purgeOnServer`, so the server injects the delete and forwards it to the host via
   `crdtSendToRenderer`.
5. **Watch the observers' CLIENT view (and the server logs):**
   - **hammurabi** — the host *denies* the reserved-range delete at the boundary, so the
     observers keep the attacker's avatar. Expect a denial/no-op in the server logs.
   - **bevy** — the host *applies* it, so the removal propagates and the observers lose
     the avatar. Expect no denial log (bevy has no guard).

> **Caveat — this is an experiment, not a guarantee from the SDK code.** What the host
> does *after* the guard (whether bevy propagates the applied delete to other clients,
> whether hammurabi logs the denial) is host-internal code that is not in the scene's
> `node_modules`, so the exact observer/log signal is what you're *measuring*. The server
> injection is the necessary apparatus — it's the only thing that gets the crafted
> reserved-range delete *to* the guard — but the downstream visibility depends on the
> host. Turn on server logs to make the signal as legible as possible:
> `npx sdk-commands sdk-server-logs`, and set `globalThis.DEBUG_NETWORK_MESSAGES = true`
> if you want the network trace.

## Run it

> **Requires an authoritative-server SDK build** (the `auth-server` tag / the
> `bevy-headless-server` branch) — pinned in `package.json`. Local server needs
> **Node 22 or 24** — on Node 20 it exits 1 silently. Switching the server package
> does not change what the exploit shows (see the section above) — the client-side
> purge is host-independent.

```bash
cd "scenes/93,-8-authoritative-server-avatar-purge"
nvm use 24
npm run start
```

Open extra clients with Preview again in Creator Hub, or
`decentraland://realm=http://127.0.0.1:8000&local-scene=true&debug=true`.

- **Just to see the client purge:** two clients. In client 1, click the RED orb — client
  2's avatar vanishes from client 1's roster/console while it stays connected. Host-
  independent; looks the same on every package.
- **To confirm hammurabi vs bevy:** three clients (one attacker, two observers) — follow
  the numbered protocol in *Confirming hammurabi vs bevy* above, and watch the observers'
  CLIENT view plus the server logs.

## Files

| Piece | File |
| --- | --- |
| Shared exploit primitive: injector transport, `DELETE_ENTITY` frame, `createAvatarPurger()` | `src/shared/purge.ts` |
| `purgeOnServer` client→server message | `src/shared/messages.ts` |
| Client-local purge, client roster reader, before/after logging | `src/client/repro-delete.ts` |
| RED orb + click wiring (`onOrbClick` → client purge + `purgeOnServer`) | `src/client/setup.ts` |
| UI panel — CLIENT view vs SERVER view of the `PlayerIdentityData + Transform` roster | `src/client/ui.tsx` |
| Headless server — heartbeat, publishes its roster, and runs the **server-side purge** on `purgeOnServer` | `src/server/server.ts` |
| Synced components (`ServerHeartbeat`, `ServerRoster`) + server-only write guards | `src/shared/schemas.ts` |
