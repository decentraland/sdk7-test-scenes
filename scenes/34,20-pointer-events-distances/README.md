# Pointer Events - Distance Rules Test Scene

Validates the `PBPointerEvents.Info` distance semantics introduced by:

- unity-explorer PR [#9902](https://github.com/decentraland/unity-explorer/pull/9902)
- protocol PR [decentraland/protocol#470](https://github.com/decentraland/protocol/pull/470)
- SDK PR [decentraland/js-sdk-toolchain#1560](https://github.com/decentraland/js-sdk-toolchain/pull/1560)

Parcels: `34,20` (base) and `35,20`.

**This scene pins `@dcl/sdk@next`** (resolved to `7.27.1-33533891406.commit-6a98834` or newer at
the time of writing) because `maxCameraDistance` is not yet in a stable `@dcl/sdk` release. If you
upgrade this scene later, re-verify the field still exists before assuming a stable release works:

```
grep -n "maxCameraDistance" node_modules/@dcl/ecs/dist/components/generated/pb/decentraland/sdk/components/pointer_events.gen.d.ts
```

## The rules under test

`PBPointerEvents.Info` carries three distance fields. The player threshold is resolved first:

```
resolveMaxPlayer(info):
  maxDistance set AND maxPlayerDistance set -> max(maxDistance, maxPlayerDistance)   // larger wins
  only maxDistance                          -> maxDistance
  only maxPlayerDistance                    -> maxPlayerDistance                    // deprecated alias
  neither                                   -> null
```

**Cursor path** (`interactionType` unset / `CURSOR`), with `cam = maxCameraDistance` (null when unset):

```
(null, null) -> playerDist <= 10                    // rule 4, the implicit default
(p,    null) -> playerDist <= p                     // rule 1 <-- maxDistance is PLAYER distance
(null, c)    -> camDist    <= c                     // rule 2
(p,    c)    -> playerDist <= p || camDist <= c      // rule 3, OR logic
```

**Proximity path** (`pointerEventsSystem.onProximityDown`, which sets `interactionType = PROXIMITY`
internally): `maxCameraDistance` is **ignored entirely** — only the resolved player threshold applies.

## Lane layout

Eight lanes run east from a cube row at `x = 3, y = 1.5` (scene-local coordinates). Each cube is a
1m box (`MeshRenderer.setBox` / `MeshCollider.setBox`) with a distinct albedo color. Walking east
down a lane increases distance from the cube. One ruler is shared by every lane: an emissive
stripe spanning all eight lanes at 2m / 5m / 8m / 10m / 15m from the cube's west-facing surface,
signed at both edges of the lane band and again mid-band (the edge signs fall outside the frustum
while you are walking a lane, so the mid-band sign is the one you actually read).

Cubes are tagged `L1`..`L8` in ascending z order. The tag is a lane *number*, never a distance: an
earlier revision tagged each cube with its z coordinate, and in a scene about distances in metres a
tag like `z=11` reads as "11m" - especially misleading on the one lane whose threshold is 10. The
`At` column below, mirrored by the HUD's `AT` column, gives the physical location.

| Lane | At | Type | Config | Rule proved |
|---|---|---|---|---|
| L1 | z=1  | cursor     | `maxDistance: 2` | Rule 1 - player distance only |
| L2 | z=3  | cursor     | `maxPlayerDistance: 2` | Deprecated alias alone |
| L3 | z=5  | cursor     | `maxDistance: 2, maxPlayerDistance: 6` | Larger wins -> live out to 6m |
| L4 | z=7  | cursor     | `maxCameraDistance: 10` | Rule 2 - camera distance only |
| L5 | z=9  | cursor     | `maxDistance: 2, maxCameraDistance: 10` | Rule 3 - OR |
| L6 | z=11 | cursor     | *(no distance fields)* | Rule 4 - implicit player <= 10 |
| L7 | z=13 | proximity  | `maxDistance: 2, maxCameraDistance: 20` | Camera ignored on proximity |
| L8 | z=15 | proximity  | `maxDistance: 8` | **Deliberate bug probe** - see below |

All cursor lanes use `eventType: PET_DOWN`, `button: IA_POINTER`, `showFeedback: true`,
`showHighlight: true`, plus a `hoverText` naming the lane. Proximity lanes use
`button: IA_PRIMARY` (E) via `pointerEventsSystem.onProximityDown`.

### L8 - the clamp probe

The explorer's proximity broad phase is `Physics.OverlapSphereNonAlloc(origin, 3f, ...)` with a
**hard-coded 3m radius**. A proximity entry asking for `maxDistance: 8` looks like it should fire
out to 8m, but very likely only fires within 3m regardless of the configured value. If L8
goes dead at ~3m instead of ~8m, that is the **expected finding**, not a broken test scene - it
demonstrates the broad-phase clamp, independent of the distance-resolution rules under test.

## Self-verifying readout

Fixed geometry alone cannot prove the camera rules, since camera-to-cube distance depends on which
camera is active and where the player stands. So the scene computes, every frame, what the
explorer *should* be doing - by evaluating the exact resolve-then-branch logic above in TypeScript
(`predictCursor` / `predictProximity` in `src/lanes.ts`) - and shows it in two places:

1. **On each cube**: a compact `TextShape` tag - the lane number (`L1`..`L8`) and `LIVE` (green)
   or `DEAD` (red).
2. **In the HUD table**: one row per lane with its config verbatim, the live player and camera
   distances, and the same verdict.

Verification is then a single check: does the actual hover highlight / hover text / proximity fire
match the verdict? A mismatch between the prediction and the actual in-world behavior is the
signal to investigate.

The split matters because in-world text is world-space: it grows as you approach and shrinks down
the corridor, and the lanes are only 2m apart. An earlier revision put the config and distances on
the cube itself and the labels smeared into each other, so the cube now carries at most 4
characters per line (legible at both 1m and 20m) and every number lives in the HUD, which is
screen-space and legible regardless.

The label system only writes `TextShape.getMutable(...)` when the computed text actually changes,
to keep CRDT traffic down; it never calls `engine.addEntity()` per frame and holds no ECS state of
its own (entity handles are captured once at setup).

## Measurement-origin caveats (read this before treating any mismatch as a bug)

- **Cursor player distance**: measured in the explorer from `CharacterController.transform.position`
  (avatar ROOT / feet) to the raycast hit point on the collider surface. This matches
  `Transform.get(engine.PlayerEntity).position` exactly, so cursor-path player-distance
  predictions should be accurate to the surface-distance approximation below.
- **Cursor camera distance**: the explorer uses `hitInfo.distance`, the ray length from the camera
  to the hit point. This scene approximates it with `Transform.get(engine.CameraEntity).position`
  to the cube surface. Expect **up to ~0.1m of near-plane slop**.
- **Surface vs. center**: all distances in this scene are computed to the collider's **surface**
  (closest point on the cube's 1m AABB), not its center - up to 0.5m less than a naive
  center-to-center measurement would give.
- **Proximity measurement origin differs on both ends**: the explorer's proximity path measures
  from the capsule **center** (`cc.transform.TransformPoint(cc.center)`, ~1m above the feet) to the
  collider's closest point, not from the raycast hit point. This scene approximates the capsule
  center as `playerPos + (0, 1, 0)`. Expect proximity readouts to differ from cursor-path readouts
  by roughly this ~1m vertical offset even when standing in the same spot - that is expected, not a
  bug.
- **Proximity also requires**: a **120° horizontal FOV cone** in front of the player, and an
  **occlusion raycast** (nothing between player and cube). This scene keeps proximity lanes (13,
  15) unobstructed by design, but you must still be **facing the cube** for a proximity interaction
  to fire - this scene does not attempt to compute or predict the FOV/occlusion checks themselves,
  only the distance-threshold rule, so a "dead" proximity cube while not facing it does not
  contradict the PASS/FAIL prediction.

## Virtual cameras - key `1` cycles

Bound to `IA_ACTION_3` (deliberately not `IA_POINTER` / `IA_PRIMARY` / `IA_SECONDARY`, which the
cubes consume). Cycles `DEFAULT -> NEAR -> FAR -> DEFAULT`.

1. **DEFAULT** - no virtual camera (`MainCamera.virtualCameraEntity = undefined`). Proves the
   explorer fix: standing 2m from a `maxDistance: 2` cube (lane 1) must be clickable even though
   the default third-person camera trails ~7m behind the avatar. Before this fix, that cube was
   dead in this situation.
2. **NEAR** - `VirtualCamera` pinned at `(10, 2.5, 8)` looking west at the cube row (fov 75, whose
   ~54deg horizontal half-angle covers the 45deg to the outermost lane, so the whole row stays
   framed without fisheye distortion), ~6.5m from the cubes at all times. Walk east until player
   distance exceeds 20m: L4 and L5 (camera-distance rules) must **stay live** (cam distance is
   still ~6.5m); L1, L2, L3, L6 (player-distance-only rules) must **go dead**.
3. **FAR** - `VirtualCamera` pinned at `(20, 4, 8)` looking west, ~16.6m from the cubes at all
   times. Stand right next to the cube row: L1, L2, L3, L6 must be **live** (player distance is
   small); lane 7 (`maxCameraDistance: 10` only) must be **dead** (camera is ~16.6m away); lane 9
   must stay **live** via its player-distance arm (OR logic).

Both virtual cameras keep the cube row inside their frustum at all times so every cube stays
clickable in every mode.

## HUD

Top-right panel (`src/ui.tsx`) shows: the scene's virtual-camera mode (DEFAULT/NEAR/FAR), the
live `CameraMode` of `engine.CameraEntity` (first- vs. third-person), live player and camera world
positions, the **lane table** (lane / config / player distance / camera distance / expected
verdict, one row per lane - camera distance reads `n/a` on the proximity lanes because that path
ignores it), and a controls legend.

## Console logging

Every cursor click and proximity fire logs to console: lane name, its config, and the measured
player + camera distance at the moment it fired. Search the Explorer log for
`[pointer-events-distances]` to verify a run without relying on the on-screen labels.

## Manual test script

1. Spawn at the east end of the corridor (default spawn), facing west toward the cube row.
2. **DEFAULT camera, walk the cursor lanes (L1-L6) one at a time:**
   - Walk toward each cube until its tag flips to green `LIVE`, then click it. Confirm the
     hover highlight/hover text and the actual click both agree with the green prediction.
   - Walk back out past the threshold and confirm the tag flips red `DEAD` and the cube stops
     responding to hover/click.
   - L1 specifically: stand ~2m away (camera trailing far behind) and confirm it is still
     clickable - this is the #9902 regression check.
3. **Press `1` to enter NEAR mode.** Walk east past 20m player distance:
   - L4 and L5 should stay green/live (camera is pinned ~6.5m away, under their 10m limit).
   - L1, L2, L3, L6 should go red/dead once player distance exceeds their thresholds.
4. **Press `1` again to enter FAR mode.** Stand right at the cube row:
   - L1, L2, L3, L6 should be green/live.
   - L4 should be red/dead (camera is ~16.6m away, over its 10m limit).
   - L5 should stay green/live via its player-distance arm.
5. **Press `1` again to return to DEFAULT.**
6. **Proximity lanes (L7, L8):** face each cube directly, walk it from far to near while
   pressing `E`:
   - L7: confirm it fires out to ~2m (`maxDistance: 2`) and that changing your camera mode
     (NEAR/FAR) has **no effect** on when it fires - proving `maxCameraDistance: 20` is ignored.
   - L8: confirm whether it fires anywhere between 3m-8m or clamps at ~3m. Either way, note
     the observed cutoff distance - a ~3m cutoff is the expected finding for the broad-phase probe,
     not a scene bug.
7. Cross-check every observation against the Explorer log lines tagged
   `[pointer-events-distances]`.
