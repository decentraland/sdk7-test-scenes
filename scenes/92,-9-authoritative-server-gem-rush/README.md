# Authoritative Server — Gem Rush

A round-based multiplayer game on the **Authoritative Server** SDK
([docs](https://docs.decentraland.org/creator/scenes-sdk7/networking/authoritative-servers))
whose whole point is to showcase **the storage-at-key-moments pattern**:

> The store service is a **checkpoint**, not a per-event database. All live game
> state lives in server **memory** and reaches clients via **synced components**;
> Storage is read **once at server boot** and written **once per round end** —
> and never during gameplay.

Compare with the sibling scene `90,-9-authoritative-server-leaderboard`, which
persists on *every* accepted claim. Here, a 30-second round with dozens of gem
collects produces **zero** Storage calls until the round ends.

## The game

- **LOBBY (10 s)** — countdown holds while the scene is empty.
- **ACTIVE (30 s)** — the server spawns 6 gems (15% chance of a rare gem worth 5)
  at random positions and syncs them; players click gems to collect; the server
  validates proximity and counts scores. The round ends early if every gem is taken.
- **PODIUM (6 s)** — winner announced. **This is the key moment:** the server now
  writes the hall of fame (scene storage) and each scoring player's lifetime stats
  (player storage). Then back to lobby.

## Storage calls — countable in the server logs

Every Storage call lives in **one file**, [`src/server/persistence.ts`](src/server/persistence.ts),
and logs with a `[STORAGE]` prefix so you can literally count them while playing:

| When | Call | Count |
| --- | --- | --- |
| Server boot | `Storage.get('gemrush:hall-of-fame')` | 1 per boot |
| A player's first `getMyStats` | `Storage.player.get(addr, 'gemrush:stats')` → cached in memory | ≤1 per player per session |
| Round end (if anyone scored) | `Storage.set('gemrush:hall-of-fame', …)` | 1 per round |
| Round end, per scoring player | `Storage.player.set(addr, 'gemrush:stats', …)` | N per round |
| **During active gameplay** | — | **0** |

Everything else — round phase, countdown, gems, live scores — is server memory
mirrored into synced components (`RoundState`, `RoundScores`, `LastRound`,
`HallOfFame`, `Gem`), which the CRDT layer broadcasts for free.

## What it demonstrates

| Concept | Where |
| --- | --- |
| `isServer()` branching of a single codebase | `src/index.ts` |
| **Storage only at key moments** (boot GET, round-end SET, all calls in one logged file) | `src/server/persistence.ts` |
| Round **state machine** in server memory (1 Hz dt-accumulator system) | `src/server/rounds.ts` |
| **Dynamic synced entities**: server spawns/despawns gem entities per round (`syncEntity` + `engine.removeEntity`) | `src/server/rounds.ts` |
| Synced component carrying data (`Gem.position`) while clients keep **local-only decorations** (mesh, material, spin animation) on the same entity | `src/shared/schemas.ts`, `src/client/gems.ts` |
| Per-player persistence with `Storage.player` (lifetime stats) | `src/server/persistence.ts` |
| Proximity anti-cheat using server-verified `PlayerIdentityData` + `Transform`, with an observable in-scene rejection (red alert + `[ANTI-CHEAT]` log) when a far click is blocked | `src/server/server.ts`, `src/client/ui.tsx` |
| Server-only component writes via `validateBeforeChange()` → `AUTH_SERVER_PEER_ID` | `src/shared/schemas.ts` |
| Client→server / server→client messages via `registerMessages()` | `src/shared/messages.ts` |
| Server-liveness **heartbeat** (distinguishing "room synced" from "server awake") | `src/shared/schemas.ts`, `src/client/state.ts` |
| React-ECS UI labelling which panels are live-memory vs persisted | `src/client/ui.tsx` |

## Why not sync the gems' `Transform`?

The gem entities sync **only** the custom `Gem` component (id, value, position).
Clients build their own local `Transform` + mesh + material from it and spin the
gems every frame. If `Transform` were synced instead, every client's spin
animation would broadcast Transform writes back through the network (`Transform`
has no server-only guard). Splitting "authoritative data" (synced, guarded) from
"presentation" (local, free) is the same memory-vs-storage lesson applied one
layer down.

## Anti-cheat model

The client **never reports a score or a position** — only the *intent* to collect
(`collectGem { gemId }`). The server:

1. Reads the sender's wallet from the verified message `context.from`.
2. Checks the round is active and the gem still exists (first click wins races).
3. Confirms the player is genuinely within `COLLECT_RADIUS` (2 m) of the gem using
   server-verified positions (`PlayerIdentityData` + `Transform`) and the gem
   position from its own memory — never client-reported data.
4. Counts the score itself and is the *only* writer of every synced component
   (enforced by `validateBeforeChange` → `AUTH_SERVER_PEER_ID`).

**The gem never disappears on the click.** Nothing client-side removes it: the
entity is only despawned by the server inside `acceptCollect` (`engine.removeEntity`)
*after* the three checks pass, and that despawn syncs to every client. A rejected
collect leaves the gem exactly where it was.

### Testing the anti-cheat

The pointer's `maxDistance` (`GEM_POINTER_MAX_DISTANCE`, 16 m) is **deliberately much
larger** than the server's `COLLECT_RADIUS` (2 m). That gap is the test surface:

- **Legit collect** — walk up to a gem (within 2 m) and click. Accepted; the score
  ticks up and the gem despawns for everyone.
- **Trigger the anti-cheat** — stand far from a gem (anywhere across the parcel) and
  click it. The click still *fires* — sending the exact same `collectGem { gemId }`
  intent a hand-crafted cheating client would — but the server rejects it. You get a
  distinct **red "⛔ Server blocked: you were X m from the gem…" banner** in the HUD,
  the server logs an `[ANTI-CHEAT]` line with the measured distance, and **the gem
  stays put**.

Because the client sends only intent (never a position or score), a raw crafted
`collectGem` packet from anywhere produces byte-identical traffic to a far-away
click — and is rejected by the same server-side `Transform` check.

## Run it

> **Requires the `auth-server` SDK branch** — not the standard `@dcl/sdk` —
> and **Node 22 or 24** (the local multiplayer server's `isolated-vm` dependency
> has prebuilds only for those majors; on other versions it exits silently).

```bash
cd "scenes/92,-9-authoritative-server-gem-rush"
nvm use 24
npm install @dcl/sdk@auth-server @dcl/js-runtime@auth-server
npm run start
```

The preview launches a local server automatically. To test multiplayer, open a
second client (Preview again in Creator Hub, or
`decentraland://realm=http://127.0.0.1:8000&local-scene=true&debug=true`).

### Watching the pattern in action

1. Start the preview and watch the terminal: exactly **one** `[STORAGE] GET` line
   at boot.
2. Play a round — collect gems, watch the live scoreboard. **No `[STORAGE]` lines
   appear** while you play.
3. When the round ends, the podium moment logs `1 + N` `[STORAGE] SET` lines
   (hall of fame + one per scoring player).
4. Inspect the persisted data:

```bash
npx sdk-commands storage scene get gemrush:hall-of-fame
# per-player stats & raw store (local): node_modules/@dcl/sdk-commands/.runtime-data/server-storage.json
```

5. Restart the preview — the hall of fame survives (restored by the boot GET),
   while the live round state starts fresh, exactly as intended.

> ⚠️ Like the leaderboard scene: the awake server holds state in memory and
> re-persists it at the next round end, so manual Storage edits only stick if
> applied while the server is asleep (or the local preview is restarted).

### Notes

- Add your wallet address to `logsPermissions` in `scene.json` to view production
  server logs (`npm run server-logs`).
- The server only runs while at least one player is in the scene; a cold start
  takes ~15 s in production, which is why the heartbeat-based liveness check
  matters (the HUD shows "server waking up…" until the heartbeat advances).
- Round pacing, gem counts and radii are all tunables in
  [`src/shared/config.ts`](src/shared/config.ts).
