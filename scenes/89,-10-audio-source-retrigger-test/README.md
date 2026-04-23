# AudioSource Retrigger Test Scene

Scene at parcel `89,-10` (two parcels: `89,-10` and `90,-10`).

## Purpose

This scene validates two AudioSource fixes that ship on separate branches:

| Branch | Repo | Fix |
|--------|------|-----|
| `fix/audio-source-retrigger-dedup` | `js-sdk-toolchain` | `AudioSource.playSound` / `stopSound` now use `createOrReplace` instead of `getMutableOrNull`. Identical-parameter retriggers always emit a CRDT PUT, so the runtime processes every click. |
| `fix/audio-source-same-url-retrigger` | `unity-explorer` | Same-URL PUT with `playing: true` now seeks to `currentTime` and restarts playback even when Unity's `AudioSource.isPlaying` is already `true`. |

Both fixes are required for the same-URL retrigger scenario (Zone B) to work correctly end-to-end.

---

## Zones

### Zone A — Basic Playback
*Objects A1 and A2, front-left area.*

Uses `AudioSource.createOrReplace` directly — no helpers. Confirms the baseline create-and-play path works.

- **A1 (green)** — `createOrReplace(entity, { audioClipUrl: CLIP_A, playing: true, volume: 1 })`. Expected: clip plays every click.
- **A2 (red)** — `createOrReplace(entity, { audioClipUrl: CLIP_A, playing: false })`. Expected: clip stops.

### Zone B — Same-URL Retrigger (THE bug scenario)
*Objects B1 and B2, second column.*

One entity is pre-populated with `AudioSource.create(entity, { audioClipUrl: CLIP_LONG, playing: false })` at scene init.

- **B1 (blue)** — `AudioSource.playSound(entity, CLIP_LONG)`. Expected after the fix: every click restarts the clip from 0, even if it was already playing. Without the fixes: the second and subsequent clicks are silently ignored by the CRDT dedup or by Unity's `isPlaying` guard.
- **B2 (orange)** — `AudioSource.stopSound(entity)`. Expected: clip stops.

### Zone C — URL Swap on the Same Entity
*Objects C1, C2, C3, third column.*

One entity. Each button calls `createOrReplace` with a different clip URL.

- **C1, C2, C3** — swaps to CLIP_A, CLIP_B, CLIP_C respectively, `playing: true`. Expected: clean cut between clips every time; no bleed-over from the previous clip.

### Zone D — resetCursor Semantics
*Objects D1-D4, fourth column.*

One entity pre-populated with the long clip. Exercises the `resetCursor` flag on both `playSound` and `stopSound`.

- **D1** — `playSound(entity, CLIP_LONG, true)`. Expected: starts from 0 every click.
- **D2** — `playSound(entity, CLIP_LONG, false)`. Expected: resumes from the SDK-mirror `currentTime` (which is 0 at scene start unless you previously set it).
- **D3** — `stopSound(entity, true)`. Expected: stops and resets cursor to 0.
- **D4** — `stopSound(entity, false)`. Expected: stops but leaves cursor at its current value.

### Zone E — Property Variations
*Objects E1-E4, second row left.*

Four toggle-play entities, each with a different property setting. Clicking any button toggles between `playSound` / `stopSound`.

- **E1** — `volume: 0.25` (audibly quiet).
- **E2** — `pitch: 0.5` (half-speed, lower tone).
- **E3** — `pitch: 2.0` (double-speed, higher tone).
- **E4** — `loop: true` (clip restarts continuously until stopped).

### Zone F — getMutable Hand-Mutation vs playSound Helper
*Objects F1 and F2, second row right.*

A side-by-side comparison to document why `playSound` is the correct API.

- **F1 (green)** — `AudioSource.playSound(entity, CLIP_SHORT)`. Expected: reliable retrigger on every click because `createOrReplace` always emits a CRDT PUT.
- **F2 (orange)** — sets `getMutable(entity).playing = true` and `.currentTime = 0` by hand. Expected: works on the first click; subsequent clicks may be silently deduped by LWW CRDT if the values did not change.

A sign near F1/F2 explains the difference inline.

---

## Placeholder Audio Files

The following files are intentionally missing — you must supply them before testing:

| Path (relative to scene root) | Description |
|-------------------------------|-------------|
| `audio/placeholder-a.mp3` | Short clip, ~1 s (e.g., a "blip") |
| `audio/placeholder-b.mp3` | Short clip, different timbre |
| `audio/placeholder-c.mp3` | Short clip, different timbre |
| `audio/placeholder-short.mp3` | Very short clip, ~0.5 s |
| `audio/placeholder-long.mp3` | Long clip, ~20 s (so mid-clip retrigger is audibly obvious) |

The scene will build without them. They only produce a missing-asset warning at deployment/preview time.

---

## Local SDK Setup

This scene must consume the locally-built SDK so the fixes under test are what the scene runs against. Run:

```bash
cd /path/to/sdk7-test-scenes/scenes/89,-10-audio-source-retrigger-test
npm install /path/to/js-sdk-toolchain/packages/@dcl/sdk
npm run build
```

Adjust the absolute paths to match your local checkout locations.

---

## Running the Scene

```bash
cd scenes/89,-10-audio-source-retrigger-test
npm run start -- --explorer-alpha
```

Open the preview in the Decentraland Explorer Alpha. Walk to each zone and click the boxes to trigger audio scenarios.
