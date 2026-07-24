# Authoritative Server — Limits Lab

A QA harness for exercising the runtime limits of the **hammurabi-headless**
authoritative server (the headless runner that executes a scene's server branch).
You join as a normal client, click a per-limit test button in the panel, the
**server** performs the limit-pushing operation, and the outcome syncs back to
every client.

All limit defaults mirrored here come from `hammurabi-headless`
(`src/lib/misc/limits.ts`). An operator can raise any of them with a `HAMMURABI_*`
env var — if they have, a test may simply stop firing, which is itself worth
noting.

## Running it locally

The local multiplayer server needs **Node 22 or 24** (on Node 20 it exits
silently). Then:

```bash
nvm use 24
npm install
npm start
```

Open the preview, then open a **second** client (another browser tab/window) so
the comms tests (#8, #9) have someone to talk to. Watch the panel on the right.

Server-side enforcement logs stream via:

```bash
npm run server-logs
```

> **Log-throttle caveat:** the server logs at most **one line per limit key per
> 10 s**. Pushing a limit repeatedly does *not* produce one log per hit — you get
> one line, then `(N more in Xs)`. So trust the panel's counters/detail strings,
> not the log volume.

## How to read a result

Each row shows a status glyph and a detail line:

- `○` idle · `⏳` running · `✓` **pass** · `✗` **fail**
- **Pass = the limit fired as expected** (the server caught the error, or measured
  the dropped/shed work).
- **Fail = the operation unexpectedly succeeded** (or the wrong error came back) —
  e.g. the limit was raised via env var, or an endpoint was unreachable. The
  detail line says which.

Only one test runs at a time; clicking another while one is running gets you a
"Runner busy" toast.

## The tests

### Safe tests — the server survives

| # | Test | Limit (default) | Expected pass |
| --- | --- | --- | --- |
| 0 | Concurrent fetches | `maxConcurrentFetches = 32` | 40 fired; some reject "too many concurrent requests" |
| 1 | Fetch timeout | `fetchTimeoutMs = 15000` | rejects "timeout after Nms" |
| 2 | Fetch redirects | `maxFetchRedirects = 5` | rejects "too many redirects" |
| 3 | Fetch body size | `maxBodyBytes = 10 MB` | rejects "response body exceeds N bytes" |
| 4 | WebSocket message size | `maxWsMessageBytes = 1 MB` | oversized frame dropped (silent); only the sentinel echoes |
| 5 | Open sockets | `maxOpenSockets = 32` | 33rd socket throws "too many open connections" |
| 6 | In-flight host calls | `maxInflightHostCalls = 40` | excess `Storage.get` reject "too many concurrent host calls" |
| 7 | Outbound comms burst | `maxSendMessages = 512` | clients receive < 700 (excess dropped) |
| 8 | Inbound rate limit | `maxMessagesPerWindow = 300/s` | server receives fewer than the client sent |
| 9 | Entity spam | `maxLiveEntities = 100000` | live count climbs; clients feel sync stress |

Notes on the trickier ones:

- **#4 (WS message size) is a *silent* drop from the scene's side.** The isolate
  bridge wires `ws.send()` with `applyIgnored`, so the host's "message exceeds N
  bytes" throw is swallowed — `send()` returns normally and no `onerror` fires
  (you'll still see `maxWsMessageBytes` in the server logs). So the test detects
  the drop observably: it sends the oversized frame followed by a small sentinel,
  and passes when only the sentinel echoes back (the oversized one, had it been
  sent, would have echoed first). Needs an echo server (`ws.postman-echo.com`).
- **#6 uses `Storage.get`, not `fetch`.** `fetch` would trip its own 32-concurrency
  cap first, so the in-flight host-call cap is pushed with a non-fetch host call.
- **#7 (comms burst)** relies on ≥1 other client being connected to report a
  tally. The server emits 700 messages in one turn; the room batches them into a
  single `sendBinary`, so `maxSendMessages` drops everything past 512. The detail
  line shows received / sent across the reporting clients.
- **#8 (inbound rate limit)** is client-driven: the clicking client floods tiny
  messages (~1200/s) for ~3 s while the server counts arrivals. **Caveat:** the
  SDK batches a client's per-frame messages into one transport packet, and the
  server's limiter counts *packets*, so heavy batching can coalesce the flood
  below the cap. If received ≈ sent, the flood was coalesced or under the cap —
  that is inconclusive, not a server bug.
- **#9 (entity spam)** creates entities **server-side only** (they are *not*
  synced — syncing 100k entities would lock every client's browser). They still
  count toward the server's `maxLiveEntities`. Pick a target (10k / 50k / 100k),
  watch the live/made counters climb via the synced RunnerState, then hit
  **Cleanup** to despawn (also batched over ticks). Near 100k the cap causes
  *silent* drops. Spawn and cleanup are batched (1k/tick, 2k/tick) so the work
  never trips the sync-execution timeout.

### Danger zone — these KILL the server

These dispose the server isolate, so the whole scene dies for everyone until the
runner reboots it. They are gated behind a two-click **ARM → KILL** confirm.

| # | Test | Limit (default) | Pass signal |
| --- | --- | --- | --- |
| 10 | Sync execution timeout | `maxSyncExecutionMs = 10000` | busy-wait >10 s → isolate disposed |
| 11 | Async turn timeout | `maxAsyncTurnMs = 60000` | a turn hangs (transport send never resolves) → isolate disposed |
| 12 | Isolate memory OOM | `isolateMemoryLimitBytes = 256 MB` | allocate until heap exhausted → isolate terminated |

**There is no in-band pass for these** — the isolate is gone before a result can
be written. Instead:

1. Just before executing, the server writes a synced **LastWords** banner naming
   the test ("☠ Executing … — the server is expected to die now") — you'll see it
   on every client.
2. The **server-online dot goes offline** once the heartbeat stops. **That offline
   transition is the pass.** All three freeze the engine loop, so the dot goes
   offline within ~6 s:
   - **#10 and #12** block the isolate's thread synchronously.
   - **#11** hangs a turn by registering a transport whose `send()` never resolves
     (`engine.update` awaits every transport's send). The loop freezes at that
     await; the async-turn watchdog then formally disposes the isolate at the 60 s
     deadline (`maxAsyncTurnMs` in the logs). A detached `await`/`Promise` in scene
     code does NOT work — it never blocks the turn.

### Recovering after a destructive test

Locally: stop (`Ctrl-C`) and re-run `npm start`, or let the runner reboot the
scene. Once the server is back, the heartbeat resumes (dot turns green) and
**TestResults reset to idle** on boot. The LastWords banner clears on the next run.

## Repointing the external endpoints

The fetch/WebSocket tests hit public endpoints that must be reachable **from the
server host**, not the client. If they're blocked or flaky, repoint them in one
place: [`src/shared/config.ts`](src/shared/config.ts) → `ENDPOINTS`. Two gotchas
worth knowing if you swap them:

- The timeout test needs the response **headers** delayed past `fetchTimeoutMs`
  (15 s). `httpbin.org/delay/N` caps at 10 s (under the limit — it won't fire);
  `httpbin.org/drip?delay=25` is uncapped, so that's the default.
- The body-size test needs a body larger than `maxBodyBytes` (10 MB).
  `httpbin.org/bytes/N` caps at ~100 KB, so the default points at a real 100 MB
  file (`proof.ovh.net`).

## Structure

Same shape as the sibling auth-server scenes (`90,-9-…-leaderboard`,
`92,-9-…-gem-rush`):

| Path | Role |
| --- | --- |
| `src/index.ts` | `isServer()` branch; static messages import; dynamic server import |
| `src/shared/tests.ts` | the test registry — single source of truth for UI + server |
| `src/shared/config.ts` | limit values, burst sizes, endpoints |
| `src/shared/schemas.ts` | synced components, all server-write-guarded |
| `src/shared/messages.ts` | intent-only client↔server messages |
| `src/server/server.ts` | bootstrap, heartbeat, message routing |
| `src/server/runner.ts` | one-test-at-a-time orchestration |
| `src/server/tests/safe.ts` | the 10 safe tests |
| `src/server/tests/destructive.ts` | the 3 isolate-killing tests |
| `src/server/spam.ts` | batched entity spawner (test #9) |
| `src/client/ui.tsx` | the panel — safe list, spam controls, danger zone |
| `src/client/setup.ts` | visuals, message handlers, flood driver |
| `src/client/state.ts` | heartbeat liveness, toasts, two-click arming |
