# Authoritative Server — Leaderboard

A showcase of the **Authoritative Server** leaderboard use case described in the
[SDK7 authorative server docs](https://docs.decentraland.org/creator/scenes-sdk7/networking/authoritative-servers).

A headless, Decentraland-hosted server owns the game state. Players click an orb to
score; the server validates each claim, persists per-player totals, and broadcasts a
ranked leaderboard that every client renders.

## What it demonstrates

| Concept | Where |
| --- | --- |
| `isServer()` branching of a single codebase | `src/index.ts` |
| Client→server / server→client messages via `registerMessages()` | `src/shared/messages.ts` |
| Server-authoritative synced components + `validateBeforeChange()` (server-only writes) | `src/shared/schemas.ts` |
| Server-only `syncEntity()` of server-created entities | `src/server/server.ts` |
| Proximity anti-cheat using server-verified `PlayerIdentityData` + `Transform` | `src/server/server.ts` |
| Persistence across server sleep/redeploys with `Storage` | `src/server/server.ts` |
| Server-verified **admin action** (allow-listed leaderboard reset) | `src/shared/config.ts`, `src/server/server.ts`, `src/client/ui.tsx` |
| Server-liveness **heartbeat** (distinguishing "room synced" from "server awake") | `src/shared/schemas.ts`, `src/client/state.ts` |
| React-ECS UI reading synced state | `src/client/ui.tsx` |

## Anti-cheat model

The client **never reports a score** — only the *intent* to claim a point
(`claimPoint`). The server:

1. Reads the sender's wallet from the verified message `context.from`.
2. Confirms the player is genuinely within `CLAIM_RADIUS` of the orb using
   server-verified positions (`PlayerIdentityData` + `Transform`) — never
   client-reported positions.
3. Increments the score itself and is the *only* writer of the `Leaderboard`
   component (enforced by `validateBeforeChange` → `AUTH_SERVER_PEER_ID`).

## Run it

> **Requires the `auth-server` SDK branch** — not the standard `@dcl/sdk`.
> `package.json` already pins it; install from this scene folder:

```bash
cd "scenes/90,-9-authoritative-server-leaderboard"
npm install @dcl/sdk@auth-server @dcl/js-runtime@auth-server
npm run start
```

The preview launches a local server automatically. To test multiplayer, open a second
client (Preview again in Creator Hub, or
`decentraland://realm=http://127.0.0.1:8000&local-scene=true&debug=true`).

### Notes

- Add your wallet address to `logsPermissions` in `scene.json` to view production
  server logs (`npx sdk-commands sdk-server-logs`).
- The server only runs while at least one player is in the scene; a cold start takes
  ~15 s in production, which is why the heartbeat-based liveness check matters.
- To reset or edit the board, see [Clearing or modifying the leaderboard](#clearing-or-modifying-the-leaderboard).

## Clearing or modifying the leaderboard

A **player cannot** clear or edit the leaderboard — and that's the point of the
authoritative model. Clients only ever send `claimPoint`; the `Leaderboard` component
is writable exclusively by the server (`validateBeforeChange` → `AUTH_SERVER_PEER_ID`).
So any "reset" is an *operator* or *admin* action, never a client one. There are two
ways to do it.

### Option A — Edit the server's Storage directly (ops, no code change)

The board is persisted under the `leaderboard` key as a JSON array of
`[address, { name, score }]` entries. Manage it with the `storage` command:

```bash
cd "scenes/90,-9-authoritative-server-leaderboard"

# Inspect the current persisted board
npx sdk-commands storage scene get leaderboard

# Clear it entirely
npx sdk-commands storage scene delete leaderboard

# Overwrite with an edited value — e.g. rename/re-score a player, drop entries
npx sdk-commands storage scene set leaderboard \
  --value '[["0xabc0000000000000000000000000000000000001",{"name":"Alice","score":5}]]'
```

Locally, this data lives at
`node_modules/@dcl/sdk-commands/.runtime-data/server-storage.json`, which you can also
inspect by hand.

> ⚠️ **The running server keeps the scores in memory.** `delete`/`set` only touch the
> *persisted* copy — a server that is currently awake still holds the old `scores` map,
> keeps broadcasting it, and re-persists it on the next accepted claim, silently undoing
> your edit. To make an edit stick, apply it while the server is **asleep** (production:
> after the last player leaves the scene) or **restart the local preview**
> (`npm run start`) so the server reloads Storage on boot. For a *live* reset with no
> restart, use Option B.

### Option B — Server-verified admin reset (built into this scene)

This scene ships an admin-gated reset: an allow-listed wallet clicks a **🗑 RESET
LEADERBOARD** button and the server wipes both the in-memory map and Storage, then
broadcasts the now-empty board. It resets **live** — no sleep or restart required — and
uses the exact authoritative trust model as `claimPoint`: the server trusts only the
verified `context.from` and ignores anyone not in the allow-list.

**To enable it, edit the admin allow-list** — replace the placeholder wallet in
[`src/shared/config.ts`](src/shared/config.ts) (`ADMINS`) with your address(es),
lower-case:

```ts
export const ADMINS = ['0xYOUR_ADMIN_WALLET'].map((a) => a.toLowerCase())
```

**Where the code lives:**

| Piece | File |
| --- | --- |
| `ADMINS` allow-list (placeholder address to replace) | [`src/shared/config.ts`](src/shared/config.ts) |
| `resetLeaderboard` message definition (empty payload) | [`src/shared/messages.ts`](src/shared/messages.ts) |
| Server handler — allow-list check, `scores.clear()` + `Storage.delete()` + republish | [`src/server/server.ts`](src/server/server.ts) → `registerMessageHandlers()` |
| Client admin check (`isLocalAdmin()`, cosmetic only) | [`src/client/state.ts`](src/client/state.ts) |
| Admin-only reset button that sends `resetLeaderboard` | [`src/client/ui.tsx`](src/client/ui.tsx) |

The client-side check only decides whether to *show* the button — it is never the
security boundary. A non-admin who forces the message anyway is rejected server-side, so
the allow-list in `config.ts` is the single thing that actually grants reset rights.
