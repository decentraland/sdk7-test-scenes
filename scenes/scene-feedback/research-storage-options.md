# Research: where to persist in-world player feedback (SDK7)

Date: 2026-09-29. Scope: a lo-fi feedback template (a series of questions, 1–5 stars, optional text, Submit/Skip) that studios can drop into their own scenes (Genesis City and/or Worlds). Every answer has to be persisted, and the studio has to be able to read all of them later (goal: CSV export).

Legend: **[V]** verified in primary source (docs, source code, published package). **[UNVERIFIED]** inferred, or not confirmed by a live run.

Primary sources used (pinned where possible):

| Ref | Source |
| --- | --- |
| D-MS | Multiplayer Server docs: https://docs.decentraland.org/creator/scenes-sdk7/networking/authoritative-servers.md |
| D-SD | Server Data (storage UI) docs: https://docs.decentraland.org/creator/scene-editor/operate-live/server-data.md |
| D-NC | Network connections / signedFetch docs: https://docs.decentraland.org/creator/scenes-sdk7/networking/network-connections.md |
| D-SF | Signed Fetch protocol: https://docs.decentraland.org/contributor/authentication/signed-fetch.md |
| D-UD | User data: https://docs.decentraland.org/creator/scenes-sdk7/interactivity/user-data.md |
| D-RD | Runtime data: https://docs.decentraland.org/creator/scenes-sdk7/interactivity/runtime-data.md |
| D-PL | Detect platform: https://docs.decentraland.org/creator/build-for-mobile/develop/detect-platform.md |
| D-AN | Scene analytics: https://docs.decentraland.org/creator/scenes-sdk7/other/scene-analytics.md |
| SDK | `@dcl/sdk` `auth-server` branch, commit `502e633` (= npm dist-tag `auth-server` → `7.29.1-36041177279.commit-502e633`): https://github.com/decentraland/js-sdk-toolchain/tree/auth-server/packages/%40dcl/sdk/src/server |
| CLI | `sdk-commands storage` on the same branch: https://github.com/decentraland/js-sdk-toolchain/tree/auth-server/packages/%40dcl/sdk-commands/src/commands/storage |
| WSS | Storage backend `decentraland/world-storage-service`, main @ `f2251b3116` (2026-09-28): https://github.com/decentraland/world-storage-service |
| UI | Storage UI `decentraland/storage-service-site`, main @ `a0fae2228a` (2026-04-09): https://github.com/decentraland/storage-service-site |
| EXP | Unity explorer signedFetch: https://github.com/decentraland/unity-explorer/blob/dev/Explorer/Assets/DCL/Infrastructure/SceneRuntime/Apis/Modules/SignedFetch/SignedFetchWrap.cs |
| LOCAL | This repo: `scenes/90,-9-authoritative-server-leaderboard`, `scenes/92,-9-authoritative-server-gem-rush` (working Storage usage) |

---

## TL;DR

- "Decentraland storage" means the **Multiplayer Server (formerly Authoritative Server) Storage**. It is a key-value service at `https://storage.decentraland.org` (service: `world-storage-service`). The UI at `decentraland.org/storage` shows it. **[V]** D-MS, D-SD, WSS
- It has three namespaces: **scene storage** (shared, per scene/place), **player storage** (per wallet address, inside that scene/place) and **env vars** (encrypted secrets). **[V]** WSS openapi
- **Only the headless server copy of the scene can write to it.** Client-side scene code can't: the SDK throws unless `isServer()`, and the service rejects any request signed by the client runtime (`signer: decentraland-kernel-scene`). **[V]** SDK `utils.ts`, WSS `signed-fetch-policy.ts`
- Data is **private**. Players can't read it. Readers are the scene server, the world owner/deployers (Worlds), LAND owner/operator/updateOperator (Genesis City), and wallets listed in `scene.json` → `logsPermissions`. **[V]** WSS `ai-agent-context.md`, `authorization-middleware.ts`
- Listing works over REST: `GET /values?prefix=&limit<=100&offset=` and `GET /players`. The UI and the CLI have **no CSV export**, and the CLI has **no list** command. A CSV export needs a small signed script, or one of the other options below. **[V]** WSS openapi, CLI source, UI `en.json`
- **The big adoption cost for a drop-in template:** the studio's whole scene must use `@dcl/sdk@auth-server` (not `latest`) with `"authoritativeMultiplayer": true`. That turns on a server for their entire scene and changes how `syncEntity` state is routed. **[V]** D-MS "Setup", "Server / Client Branching"

---

## 1. What "Decentraland storage" is

| Namespace | SDK API (server only) | REST path | Scope | Default limits (`.env.default`) |
| --- | --- | --- | --- | --- |
| Scene ("World") storage | `Storage.get/set/delete/getValues` | `/values`, `/values/{key}` | `(world_name, place_id)`, i.e. per scene/place | 512 KB per value; 10 MB total |
| Player storage | `Storage.player.get/set/delete/getValues(address, …)` | `/players`, `/players/{addr}/values[/{key}]` | `(world_name, place_id, player_addr)` | 100 KB per value; 1 MB per player |
| Env vars | `EnvVar.get(key)` | `/env`, `/env/{key}` | `(world_name, place_id)`, encrypted at rest | 10 KB per value; 256 KB total |

Details:

- **Ownership and scope.**
  - The world name comes only from the **signed-fetch metadata** (`realm.serverName` / `realmName`), never from the URL or body. `place_id = f(world, parcel)` is resolved through the Places API. **[V]** WSS `scene-context-middleware.ts`, `adapters/places/component.ts`
  - A realm ending in `.eth` counts as a World. Anything else (`main`, …) is Genesis City, and storage there is keyed per place, i.e. by the base parcel. **[V]** WSS `ai-agent-context.md` ("Realm Classification")
  - Storage is **per scene/place**, not per creator address. It survives redeploys: "persisted at the location level and shared across all server instances that point to the same scene". **[V]** D-MS "Version Control"
- **How the quota is counted.**
  - Worlds (`*.eth`): the total is summed **across all scenes of the world**.
  - Genesis City: the total is counted **per place**. **[V]** WSS `adapters/world-storage/component.ts` `getSizeInfo`
- **Size limits** are the defaults in https://github.com/decentraland/world-storage-service/blob/main/.env.default. **[UNVERIFIED]** that production uses the same values.
- **Env vars.**
  - The storage UI can't read them back, only replace or delete them. **[V]** D-SD
  - Only the scene's own authoritative worker can `GET /env/:key`. Owners are explicitly blocked from reading values. **[V]** WSS `ai-agent-context.md` (authorization type 3)
  - Use them for secrets such as a webhook token. Don't put feedback in them.

## 2. How scene code writes to it

- **Setup.**
  - Install `npm install @dcl/sdk@auth-server @dcl/js-runtime@auth-server`.
  - Set `"authoritativeMultiplayer": true` at the root of `scene.json` (added automatically on the first build).
  - Without that flag, "`isServer()` always returns false". **[V]** D-MS "Setup"
  - Published `@dcl/sdk@latest` (7.29.0) has **no** `@dcl/sdk/server` module. Checked locally in `scenes/80,-3-ui/node_modules/@dcl/sdk`. **[V]**
- **Where the code runs.** The same `src` code runs on both server and client. Branch on `isServer()` from `@dcl/sdk/network`. **[V]** D-MS
- **API** (imported from `@dcl/sdk/server`). **[V]** SDK `storage/scene.ts`, `storage/player.ts`, `storage/constants.ts`

  ```ts
  Storage.get<T>(key, { fresh? }): Promise<T | null>
  Storage.set<T>(key, value, { skipIfUnchanged? }): Promise<boolean>
  Storage.delete(key): Promise<boolean>
  Storage.getValues({ prefix?, limit?, offset? }): Promise<{ data: {key, value}[], pagination: { offset, total } }>
  Storage.player.get/set/delete(address, key, ...)
  Storage.player.getValues(address, opts)
  Storage.configure({ skipIfUnchanged, cacheReads, cacheMaxEntries, cacheMaxAgeMs })
  EnvVar.get(key): Promise<string>   // '' if missing
  ```

- **Transport.** Each SDK call is a `signedFetch` from the server runtime:
  - scene storage: `PUT/GET/DELETE {base}/values/{key}`
  - player storage: `{base}/players/{addr}/values/{key}`

  The base URL is chosen from `getRealm()`:
  - preview → `realmInfo.baseUrl` (localhost)
  - realm URL contains `.zone` → `storage.decentraland.zone`
  - otherwise → `storage.decentraland.org`

  **[V]** SDK `storage-url.ts`
- **Authentication.**
  - The service requires ADR-44 signed-fetch headers (`X-Identity-Auth-Chain-*`, `X-Identity-Timestamp`, `X-Identity-Metadata`).
  - It accepts: the authoritative server address, or a scene worker holding a scene-scoped delegation (`x-authoritative-scope`); owners/deployers (Worlds) or LAND permission holders (Genesis City, checked through LAMBDAS `/users/{addr}/parcels/{x}/{y}/permissions`); and `logsPermissions` wallets.
  - Requests signed by client scenes (`decentraland-kernel-scene`) are rejected.
  - **[V]** WSS `routes.ts`, `signed-fetch-policy.ts`, `authorization-middleware.ts`, `logic/world-permission/component.ts`
- **Client-side scene code cannot write:**
  - every SDK method calls `assertIsServer()`, which throws `"Storage is only available on server-side scenes"`. **[V]** SDK `utils.ts`
  - calling the REST endpoint directly through `signedFetch` from a client is rejected by `rejectIfSigner('decentraland-kernel-scene')`. **[V]** WSS, EXP line 274
- **The client → server path is messages.**
  - Use `registerMessages({...})`, then `room.send('submitFeedback', payload)` on the client and `room.onMessage('submitFeedback', (data, context) => context.from /* verified wallet */)` on the server. **[V]** D-MS "Messages", LOCAL leaderboard/gem-rush
  - Messages are about 13 KB max and get silently dropped above that. **[V]** D-MS
- **Minimal pattern** (sketch, not compiled):

  ```ts
  // shared/messages.ts
  export const room = registerMessages({
    submitFeedback: Schemas.Map({ surveyId: Schemas.String, qId: Schemas.String, stars: Schemas.Int,
                                  text: Schemas.String, skipped: Schemas.Boolean, platform: Schemas.String }),
    feedbackAck: Schemas.Map({ qId: Schemas.String, ok: Schemas.Boolean })
  })
  // server
  room.onMessage('submitFeedback', async (d, ctx) => {
    if (!ctx) return
    const addr = ctx.from.toLowerCase()
    const key = `fb:${d.surveyId}:${Date.now()}:${addr}:${d.qId}`   // <=255 chars
    const ok = await Storage.set(key, { addr, ...d, ts: Date.now() })
    room.send('feedbackAck', { qId: d.qId, ok }, { to: [addr] })
  })
  ```

- **Behaviour on the current SDK tag** (PR #1630 "fix: throw when the storage service does not answer usably", merged into `auth-server`: https://github.com/decentraland/js-sdk-toolchain/pull/1630):
  - `get()`/`getValues()`/`delete()` **throw** when a read fails. They resolve null/false only on a confirmed 404.
  - `set()` resolves `false` when the write fails, and throws `TypeError` for values that can't be serialized or for invalid keys (empty, `.`, `..`, NUL, >255 chars) and addresses (not `0x` + 40 hex).
  - Parts of the docs are older: "Storage only accepts strings", "never throw". The SDK and the service accept any JSON value (`UpsertStorageRequestSchema` is a JSONValue). **[V]** SDK `serialize.ts`, `storage/index.ts`; WSS `handlers/schemas.ts`

## 3. Privacy, and whether the creator can read everything

- **Can players see other players' answers?** No, not unless the server chooses to broadcast them. Clients have no read path to storage at all (§2). This is true for scene storage and player storage alike. **[V]**
- **Who can read:**
  - the scene's server;
  - the World owner and deployers, or LAND owner/operator/updateOperator in Genesis City;
  - wallets in `scene.json` `logsPermissions`, which get full read/write/delete on that scene's Scene and Player storage, re-checked about every 30 s.

  **[V]** WSS README "Collaborator Access"
- **Listing and export options:**
  - **Storage UI** (`decentraland.org/storage`, or Creator Hub → Manage → ⋯ → View Storage).
    - What it does: Scene / Player / Environment tabs; you can view, edit and delete. The Player tab lists the players that have data and lets you search by address or name. **[V]** D-SD
    - No export/CSV/download feature: nothing like that in the UI strings. **[V]** UI `src/intl/en.json`. **[UNVERIFIED]** against the live deployment, because the repo was last pushed in April 2026.
  - **CLI** (`npx sdk-commands storage scene|player|env get|set|delete|clear`).
    - Single keys only; **no `list`**. **[V]** CLI `storage/index.ts`, `scene.ts`, `player.ts`
    - Auth goes through the linker dApp, or the `DCL_PRIVATE_KEY` env var. **[V]** CLI `shared.ts`
  - **REST** (anyone authorized above, via ADR-44 signed fetch):
    - `GET /values?prefix=fb:&limit=100&offset=N` lists scene keys A–Z with `{data:[{key,value}], pagination:{limit,offset,total}}`. The limit is capped at 100 per page. **[V]** WSS openapi `/values`, `LimitParam`
    - `GET /players` lists the addresses that have data. `GET /players/{addr}/values` lists that player's keys. **[V]** WSS openapi
    - The metadata the CLI signs, which an export script should copy: `{"realm":{"serverName":"<world>"},"realmName":"<world>","parcel":"<base>"}` (World) or `{"parcel":"<base>"}` (Genesis City). **[V]** CLI `shared.ts` `buildStorageMetadata`
    - The preview server caps offset at 100000 and says it mirrors the deployed pagination helper. **[V]** CLI `start/server/storage-service.ts`
  - **In-scene:** the server can call `Storage.getValues({ prefix })` itself, e.g. for an admin-only "export" message that forwards data out through `fetch`/`signedFetch` (see §5).
- **What this means for CSV:** store **one scene-storage key per answer, under a common prefix**. A roughly 30-line Node script (the owner's or a `logsPermissions` wallet signs) then pages through `GET /values?prefix=` and writes CSV. Keeping answers in player storage would need N+1 calls: `/players`, then one call per player.

## 4. Limits and conditions

- **Size:** see the table in §1. Oversized bodies get HTTP 413. Keys are max 255 chars (varchar(255)). Player address must match `^0x[a-f0-9]{40}$` (lower-cased by the service). **[V]** WSS openapi, `routes.ts`; CLI `storage-service.ts`; SDK `serialize.ts`
  - Rough estimate: 10 MB / ~400 B per answer ≈ 25k answers per World (shared by every scene in that World) or per Genesis City place. **[UNVERIFIED]** estimate.
- **Server runtime:**
  - 40 in-flight host calls, shared by Storage, `signedFetch` and the rest. Calls above that are rejected, not queued.
  - Other caps: 256 MB memory, 10 s synchronous turn, about 300 inbound messages per second per peer, 32 concurrent fetches, 15 s fetch timeout.

  **[V]** D-MS "Server Resource Limits"
- **Rate limiting:** routes have no rate-limit middleware, only a body-size limit. **[V]** WSS `routes.ts`. **[UNVERIFIED]** whether the infrastructure adds one.
- **Caching:**
  - SDK: reads are cached for 60 s by default. **[V]** SDK `constants.ts`
  - Service: per-replica 60 s cache, values up to 32 KB. **[V]** WSS `.env.default`
  - Effect: out-of-band edits (UI or CLI) can take up to about 1 minute to show up.
- **Worlds vs Genesis City:**
  - The storage service, CLI and UI support both (LAND permission path, parcel-based place). **[V]** WSS, CLI `validateWorkspaceAndWorld`, D-SD ("Worlds and LAND locations")
  - The Multiplayer Server itself in Genesis City is implied by the log docs ("parcels in Genesis City … pass a position"). **[V]** D-MS "Debug in Production". **[UNVERIFIED]** by a live Genesis City deploy.
  - Place resolution fails with 400 "Scene not found in Places API" if Places doesn't know the scene. **[V]** WSS `adapters/places/component.ts`. **[UNVERIFIED]** how this behaves for private or unlisted worlds.
- **Preview vs deployed:**
  - Preview starts a local server and storage automatically. Data lives in `node_modules/@dcl/sdk-commands/.runtime-data/server-storage.json` and has nothing to do with production. **[V]** D-MS; LOCAL gem-rush README
  - `npm install` can wipe that folder. **[UNVERIFIED]**
  - Production: the server runs only while at least one player is in the scene, then stays up about 2 minutes. Cold start takes about 15 s, and messages sent before the server is up are **silently lost**, so the client needs an ack and a retry. **[V]** D-MS "Wait for the server to start up"
  - Local auth-server preview needs Node 22 or 24 (`isolated-vm` prebuilds). **[V]** LOCAL gem-rush README
- **Cost:** hosted by Decentraland and "no … need to pay for any hosting". **[V]** D-MS "Overview"

## 5. Alternatives (brief)

| Option | How | Identity it gives you | Pros | Cons |
| --- | --- | --- | --- | --- |
| **A. Multiplayer Server Storage** (above) | client `room.send` → server `Storage.set` | `context.from` (server-verified address) | first-party, private, free, UI | forces auth-server SDK + server on the whole scene |
| **B. Client `signedFetch` POST to your own endpoint** | `signedFetch({ url, init:{ method:'POST', body } })` from `~system/SignedFetch` | Auth chain proves the player's address. Metadata JSON (EXP `CreateSignatureMetadata`): `sceneId`, `parcel` (base), `tld`, `network:"mainnet"`, `isGuest`, `realm{hostname,protocol,serverName}`, `signer:"decentraland-kernel-scene"`, `hashPayload` (sha256 of the body). The ADR-44 payload is `<method>:<path>:<timestamp>:<metadata>`. **[V]** EXP, D-SF, D-NC | works on stock `@dcl/sdk@latest`, no server; the studio owns the data and can export it however it likes | you host, verify and store it yourself. The verifier needs ADR-44 (e.g. `@dcl/crypto-middleware`; example https://github.com/decentraland-scenes/validate-player-authenticity). `isGuest`/`sceneId` are client-reported metadata. |
| **C. Hybrid A+secret** | server gets the message → `Storage.set` **and** `fetch()` to a webhook, with the token kept in `EnvVar` | server-verified | the token never reaches clients (D-MS, D-SD); the webhook can be Google Sheets = free CSV | still needs the auth-server SDK; server fetch caps (32 concurrent, 15 s) |
| **D. Google Sheets via Apps Script `doPost`** directly from the client | plain `fetch` POST | none (anyone can POST) | trivial CSV | spam/forgery; any token in client code is public (published code). **[UNVERIFIED]** that SDK `fetch` follows Apps Script's 302 redirect cleanly. |

Notes:

- Regular (non-portable) scenes run with `AllowEverythingJsApiPermissionsProvider`, so `fetch`/`signedFetch` needs no `USE_FETCH` there. `USE_FETCH` is enforced only for smart wearables and portable experiences. **[V]** unity-explorer `SceneFactory.cs`, `LoadSmartWearableSceneSystem.cs`
- Client scenes can only run one `fetch` at a time; requests are queued. **[V]** D-NC

## 6. Player and context metadata a scene can get

| Datum | API | Side | Notes |
| --- | --- | --- | --- |
| Address, guest flag | `getPlayer()` → `{ name, userId, isGuest, avatar, wearables, position }` (`@dcl/sdk/src/players`) | client | may be empty on the first frames; retry **[V]** D-UD |
| Address, guest flag (verified) | `PlayerIdentityData { address, isGuest }` on each player entity; `context.from` on messages | server | "server-verified" **[V]** D-MS, D-UD |
| Name | `AvatarBase.name` / `getPlayer().name` | both | **[V]** D-UD |
| Platform | `getPlatform()` → `'mobile' \| 'desktop' \| 'web' \| null`, `isMobile()`, `isDesktop()`, `isWeb()` from `@dcl/sdk/platform` | client | null until the explorer answers; wait in a system. Present on the auth-server branch. Must be **sent by the client** in the message (self-reported). **[V]** D-PL, SDK `platform/index.ts` |
| Client agent + platform | `getExplorerInformation({})` → `{ agent, platform, configurations }` (`~system/Runtime`) | client | e.g. `agent: unity-explorer` **[V]** D-RD |
| Language | `getPlayerLanguage()` (BCP-47), `onPlayerLanguageChanged` from `@dcl/sdk/platform` | client | **[V]** SDK `platform/index.ts` |
| Realm | `getRealm({})` → `realmInfo { baseUrl, realmName, isPreview, isConnectedSceneRoom, … }` | both | `isPreview` separates test data from real data **[V]** D-RD |
| Time in scene | `EngineInfo { frameNumber, totalRuntime, tickNumber, sceneHidden }` on `engine.RootEntity` | client | **[V]** D-RD |
| Timestamp | `Date.now()` on the server | server | put it in the server record, not the client payload |
| **First vs returning visit** | **Nothing built in per player.** Compute it on the server: `Storage.player.get(addr, 'fb:visits')` → increment → set (at checkpoints). | server | Creator Hub Analytics has aggregate New/Returning/D7 and a desktop/mobile split, with its own "Export Analytics" .csv, updated once a day and owners/operators only. Scene code can't reach it. **[V]** D-AN |

Guest note: in the unity explorer a guest logs in through a ThirdWeb in-app "guest" wallet (`LoginMethod.GUEST`), so a guest should still have a `0x` address that is valid for `Storage.player`. **[V]** unity-explorer `ThirdWebLoginService.cs` L116-142. **[UNVERIFIED]** that the same guest keeps the same address across sessions/devices, and what `context.from` holds for guests on the server.

---

## Recommendation for the lo-fi MVP

1. **Default path (A): Multiplayer Server Storage, one scene-storage key per answer.**
   - Key: `fb:v1:<surveyId>:<serverTs>:<addr>:<qId>`. Value: `{ addr, isGuest, name, qId, stars|null, text (trimmed, e.g. ≤500 chars), skipped, platform, lang, realm, isPreview, ts, sceneVersion }`.
   - Client: `room.send('submitFeedback')`. Server: validates, `Storage.set`, then sends `feedbackAck` to the sender. The client retries until it gets the ack (this covers cold start and 40-call rejections).
   - Server bookkeeping: `Storage.player` for `seen/visits`, to know first vs returning and to avoid re-prompting.
   - Studio reading: in the storage UI now; CSV through a small `export-feedback.mjs` that signs `GET /values?prefix=fb:v1:<surveyId>&limit=100&offset=…` with the owner's or a `logsPermissions` wallet (the same metadata shape as `buildStorageMetadata`).
2. **Fallback path (B):** for studios who can't or won't move their scene to `@dcl/sdk@auth-server` + `authoritativeMultiplayer`, ship a thin adapter that posts to their own endpoint using client `signedFetch` instead. Put the answer sink behind one interface, e.g. `FeedbackSink.submit(record)`, so the UI template doesn't care which one is used.
3. Don't use env vars or Apps-Script-direct-from-client for answers.

## Unknowns that need a live test

1. Genesis City: does a deployed scene with `authoritativeMultiplayer` actually get a server, and do `Storage.set` and the UI work on a LAND parcel? (The docs only imply it.)
2. Worlds: does storage work for a world or scene that Places doesn't index (private or new world)? Look for the 400 "Scene not found in Places API".
3. Production size limits: are they the `.env.default` values (512 KB / 10 MB scene; 100 KB / 1 MB player)? Check with `GET /usage/world`.
4. Guests: what does `context.from` / `PlayerIdentityData.address` hold for a guest on the server? Is it a valid `0x` address accepted by `Storage.player`? Is it stable across sessions?
5. Does the live `decentraland.org/storage` have any export, or show a `logsPermissions` collaborator the scene? And does it show thousands of scene keys usably (pagination)?
6. Deployed `GET /values` pagination: is the max offset 100000, and is `total` accurate for large prefixes?
7. Adding `authoritativeMultiplayer` + the auth-server SDK to an existing studio scene: what breaks (serverless `syncEntity` semantics, SDK version drift from `latest` 7.29.0, Creator Hub/Scene Editor compatibility)?
8. Cold start: how long until the first `onMessage` is delivered after the first player enters? Validate the ack/retry loop.
9. Does preview storage survive `npm install`/`npm ci` (the `.runtime-data` folder sits inside `node_modules`)?
10. Fallback B: does client `signedFetch` POST get through in a World and in Genesis City to an external HTTPS endpoint, and does server-side ADR-44 verification pass with the explorer's legacy "folded" metadata signing (see WSS `signed-fetch-policy.ts` comment)?
