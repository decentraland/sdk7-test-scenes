# Authoritative Server — Badges

Proof scene for scene badge awards. One authoritative scene, two pads, two layers.

| Pad | Message | What it proves |
| --- | --- | --- |
| **Try award** (blue, click from anywhere) | `tryAward` | Platform layer. The server calls `Badges.award` for the sender and for an address that is never in the room, with no validation of its own. The engine signs only the first (presence gate); the badges service rejects the second. |
| **Claim badge** (yellow, stand next to it) | `claimBadge` | Scene layer. The server awards only if *its own* copy of your position is within `CLAIM_RADIUS` of the pad, and only once per player. A click from afar, or a replayed message, never produces a request. |

Results arrive as `awardResult` messages (server → sender only) and are shown on the RESULTS sign and in the console.

## Expected

| Action | Server | Badges service log | Client sees |
| --- | --- | --- | --- |
| Try award, from anywhere | signs award for you; guest-signs for `0x…dEaD` | `ACCEPT` you · `REJECT no claim` | `[present] OK` · `[absent] NO — refused, as expected` |
| Claim badge, standing on the pad | validation passes, signs award | `ACCEPT` | `[claim] OK` |
| Claim badge, from spawn | rejected before any request | nothing | `[claim] NO — too far: N.Nm` |
| Claim badge, twice on the pad | signs both; the service decides | `ACCEPT 201` then `ACCEPT 200` | `[claim] OK` twice; one toast |

The third row is the anti-cheat proof: the service column is empty because a forged intent dies inside the worker.

## Requirements

- `@dcl/sdk`, `@dcl/sdk-commands` and `@dcl/js-runtime` linked from a local `js-sdk-toolchain` checkout of `feat/badges-preview-local` (see `package.json`; expected as a sibling of this repo at `../js-sdk-toolchain-badges-preview`).
- A scene worker (Bevy headless) that signs badge awards with the scene delegation, gated on presence, and accepts `--badges`.
- The local award stub (`scene-badges-award-stub`), with `test-badge` and `target-badge` registered for this world and the orchestrator's root address trusted.

## Run locally

1. SDK: in `js-sdk-toolchain-badges-preview`, `make install && make build`.
2. Delegation: in `scene-badges-award-stub`, `node mint-delegation.mjs --scene <this folder>`. It writes `.delegation.env` and is bound to this scene's preview entity id, `b64-` + base64(`<absolute scene dir>-<hostname>`).
3. Stub: in `scene-badges-award-stub`, `npm install && npm start` (listens on `http://localhost:4000`, trusts the root key from `.dev-root-key.json`).
4. Scene, from this folder:

   ```sh
   npm install
   source <scene-badges-award-stub>/.delegation.env
   BADGES_SERVER_URL=http://localhost:4000 npm run start
   ```

   With `BADGES_SERVER_URL` set, the preview (`localhost:8000`) proxies `PUT /worlds/:world/badges/:badgeId/awards/:player` to the stub unchanged, starts Bevy headless with `--badges=http://localhost:8000`, and opens the desktop client with `badges-url` pointing at the stub. In preview the award path uses `worldConfiguration.name` from `scene.json` (`sdk7testscenes.dcl.eth`).

   To run a locally built Bevy: `DCL_SERVER_PACKAGE=<bevy-explorer>/deploy/headless/launcher` (a launcher that forwards `--badges`) and `DCL_BEVY_SERVER_PATH=<absolute path to the built headless binary>`.

## Files

| File | Role |
| --- | --- |
| `src/index.ts` | `isServer()` split; the server module is dynamically imported so `@dcl/sdk/server` never reaches the client bundle |
| `src/shared/messages.ts` | `tryAward`, `claimBadge`, `awardResult` |
| `src/shared/config.ts` | badge ids, the absent address, pad positions, `CLAIM_RADIUS` |
| `src/server/server.ts` | the two handlers; only place `Badges.award` is called |
| `src/client/setup.ts` | the pads and the results sign |
