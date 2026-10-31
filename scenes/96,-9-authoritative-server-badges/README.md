# Authoritative Server — Badges

Proof scene for scene badge awards. One authoritative scene, two pads, two layers.

| Pad | Message | What it proves |
| --- | --- | --- |
| **Try award** (blue, click from anywhere) | `tryAward` | Platform layer. The server calls `Badges.award` for the sender and for an address that is never in the room, with no validation of its own. The engine signs only the first (presence gate); the badges service rejects the second. |
| **Claim badge** (yellow, stand next to it) | `claimBadge` | Scene layer. The server awards only if *its own* replicated copy of your position is within `CLAIM_RADIUS` of the pad (horizontal distance), with at most one claim in flight per player. A click from afar never produces a request; repeats are deduplicated by the badges service (`200`). |

Results arrive as `awardResult` messages (server → sender only) and are shown on the RESULTS sign and in the console. **Try award** has no cooldown: every click is two signed award requests, which is fine for a test world.

## Expected

| Action | Server | Badges service | Client sees |
| --- | --- | --- | --- |
| Try award, from anywhere | signs award for you; guest-signs for `0x…dEaD` | accepts you · rejects the guest signature | `[present] OK` · `[absent] NO — refused, as expected` |
| Claim badge, standing on the pad | validation passes, signs award | `201` | `[claim] OK` |
| Claim badge, from spawn | rejected before any request | nothing | `[claim] NO — too far: N.Nm` |
| Claim badge, twice on the pad | signs both; the service decides | `201` then `200` | `[claim] OK` twice; one toast |

The third row is the anti-cheat proof: the service column is empty because the worker rejects the claim before any request, using its own replicated copy of the player position rather than the message. It proves a stock client cannot claim from afar; a modified client that spoofs its own movement updates is outside this scene's scope.

## Requirements

- `@dcl/sdk` and `@dcl/sdk-commands` from js-sdk-toolchain#1642, pinned in `package.json` to the CDN build its CI publishes for the branch (repinned to the released version once it ships). To run against a local checkout instead, point both at it with `file:` links.
- A scene worker (Bevy headless) that signs badge awards with the scene delegation, gated on presence, and accepts `--badges`.
- The `badges` service (api only) with its dev seed, which creates `bdg_000000000001` and `bdg_000000000002` for `sdk7testscenes.dcl.eth` and trusts the orchestrator's root address.

## Run locally

1. SDK: nothing to build; `npm install` fetches the pinned CDN build. (With `file:` links to a local checkout, run `make install && make build` there first.)
2. Delegation: in `scene-badges-award-stub` (a local helper folder, not a published repo: in production the orchestrator mints this), `node mint-delegation.mjs --scene <this folder>`. It writes `.delegation.env` and the dev root key `.dev-root-key.json`, and is bound to this scene's preview entity id, `b64-` + base64(`<absolute scene dir>-<hostname>`), so re-mint after moving or renaming the folder.
3. Badges service: in `badges`, follow "Local end-to-end with the preview" in `docs/scene-badges.md`. In short:

   ```sh
   # a local Postgres: `docker compose up -d postgres`, or brew's postgresql@16 with `createdb badges`
   yarn install
   yarn workspace @badges/common build && yarn workspace @badges/api build
   # PG_COMPONENT_PSQL_CONNECTION_STRING, HTTP_SERVER_PORT=4000, ENV=dev,
   # AUTHORITATIVE_SERVER_ADDRESS=<address in the stub's .dev-root-key.json>, ...
   yarn workspace @badges/api seed:scene-badges:dev
   yarn workspace @badges/api start   # http://localhost:4000
   ```

4. Scene, from this folder:

   ```sh
   npm install
   source <scene-badges-award-stub>/.delegation.env
   BADGES_SERVER_URL=http://localhost:4000 npm run start
   ```

   With `BADGES_SERVER_URL` set, the preview (`localhost:8000`) proxies `PUT /badges/:badgeId/awards/:player` to the badges service unchanged, starts Bevy headless with `--badges=http://localhost:8000`, and opens the desktop client with `badges-url` pointing at the service. The service decides which badges the scene may award from the delegation's world and scene id.

   To run a locally built Bevy: `DCL_SERVER_PACKAGE=<bevy-explorer>/deploy/headless/launcher` (a launcher that forwards `--badges`) and `DCL_BEVY_SERVER_PATH=<absolute path to the built headless binary>`.

## Files

| File | Role |
| --- | --- |
| `src/index.ts` | `isServer()` split; the server module is dynamically imported so `@dcl/sdk/server` never reaches the client bundle |
| `src/shared/messages.ts` | `tryAward`, `claimBadge`, `awardResult` |
| `src/shared/config.ts` | badge ids, the absent address, pad positions, `CLAIM_RADIUS` |
| `src/server/server.ts` | the two handlers; only place `Badges.award` is called |
| `src/client/setup.ts` | the pads and the results sign |
