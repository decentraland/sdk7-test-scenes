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
- Local Storage lives at `node_modules/@dcl/sdk-commands/.runtime-data/server-storage.json`.
  Inspect/clear with `npx sdk-commands storage scene get|delete leaderboard`.
- The server only runs while at least one player is in the scene; a cold start takes
  ~15 s in production, which is why the heartbeat-based liveness check matters.
