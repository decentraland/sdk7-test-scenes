# MCP_SHOWCASE.md -- driving script for `synthetic-input-showcase`

This is the script for the session that connects an agent to unity-explorer's embedded MCP
server and drives this scene live in front of the user. Read this top to bottom; each station
is self-contained and can be run independently and re-run at any time (see **Reset**, below).

**World coordinates** used below already include the scene's world offset
`(2384, 0, 2384)` (base parcel `149,149`). Local coordinates (what the scene code and its
`[INIT]` logs use) are always `world - (2384, 0, 2384)`.

> Every world coordinate in this document was rebased on 2026-08-31. The first three live runs
> happened while the scene sat at base parcel `34,20`, so the per-step numbers were still on the
> old `(544, 0, 320)` offset while the prose, `scene.json` and `src/constants.ts` had all moved to
> `149,149`. They now agree. If a coordinate here ever disagrees with the scene again, the
> `[INIT] MARK ... => local (...) world (...)` log lines are the authority -- they are computed
> from `toWorld()` at runtime.

**On `entityId`**: `click_entity`/`hover_entity` accept an `entityId`, but that id is the
Explorer's internal **Arch ECS** entity id (`list_scene_entities` returns `entity.Id`) and is
**not** the same id space as this scene's own CRDT entity ids (logged at `[INIT]`). The bridge
between them: a successful `click_entity`/`hover_entity` result reports **both** `entityId` and
`crdtEntityId`, so one world-aimed click on a target tells you its Arch id for subsequent
`entityId`-addressed calls -- see the README's "Substitutions" section. Every step
below therefore aims with explicit **world `x`/`y`/`z`**, which every tool accepts as an
alternative to (or in addition to) `entityId`. If you'd rather use `entityId`, call
`list_scene_entities` first and cross-reference against the `[INIT]` entity-id map in
`get_scene_logs`.

## Setup

1. Start the scene: `npm install && npm run start -- --mcp` from the scene folder -- this
   serves it on port 8000 and auto-launches the installed client with the MCP server on port
   8123. Log in when the client opens, then connect the driving session
   (`claude mcp add --transport http --scope user explorer http://127.0.0.1:8123/unity-explorer-mcp`)
   and poll `get_scene_state` until the scene reports `isReady: true`.
2. Call `get_scene_logs` once at the top -- the console should show:
   - `[INIT] synthetic-input-showcase starting`
   - `[INIT] base parcel 149,149 -- world offset (2384, 0, 2384); ...`
   - one `[INIT] <purpose> => entityId <id>` line per interactable
   - one `[INIT] MARK <label> => local (...) world (...)` line per floor mark / aim point
   Keep this transcript open -- every step below tells you which later log line to expect.
3. Take a baseline screenshot facing north down the S1 lane (this is the default spawn view).
4. Run the **Pre-flight** below before the stations -- it settles the coordinate space every
   positional step depends on, and its check 2 is the one a session is most likely to
   misread as a client defect.

## Pre-flight -- coordinate self-description (2 minutes, run it first)

Everything positional in this script depends on one property: **a coordinate a tool hands you
can be fed back to a tool verbatim.** On a HiDPI display the client's screen (e.g. `2087x1174`)
is not the size of the screenshot you looked at, and getting that wrong misaims every
screen-space call in S8 and S10. Five checks settle it. Open the S8 panel first
(`click_entity x:2397 y:1 z:2400`), then:

1. **`ui_list stack: sdk` states its space.** The result carries `screen: {width, height}` and
   every element carries a normalized `center` inside 0..1 beside its `screenRect`. Spot-check
   one by hand: `center.x` must equal `(screenRect.x + screenRect.width / 2) / screen.width`.
2. **A `center` fed to `click_at` resolves to that element -- and is refused.** Pass one
   button's `center` verbatim: expect `hit: false` with `blockedByUi: "the scene's UI (crdtId
   <that element's id>)"`, and **no** scene log. Repeat with a second button: the cover must name
   *that* button's id. Naming the right element twice is the proof the round trip is exact --
   a misaim would name a different element or none. `click_at` rays into the 3D world and has no
   SDK-UI delivery leg; **activating scene UI is `ui_click`'s job** (`ui_click stack: sdk crdtId:
   <id>` on the same button logs the click). A `blockedByUi` here is the check passing, not a
   defect -- do not "fix" it by adding `force: true`, which aims *past* the UI into the world.
3. **A drag between two `center`s lands.** S8 step 8's `ui_drag ... path: sdk` must return
   `path: "sdk"` on the first try, with no fallback to the virtual mouse.
4. **Semantic UI results carry the same triple.** `ui_click`, `ui_scroll` and `ui_set_text`
   results carry `screenRect` + `center` + `screen`, on failures as well as successes.
5. **`screenshot` states the screen it downscaled from.** Its caption reads
   `1280x720 (screen 2087x1174)`, and that `screen` matches `ui_list`'s exactly. Try a second
   `maxWidth` to confirm only the capture size moves.

If any check fails, stop and report it before running the stations -- every later positional
step inherits the same coordinate space.

---

## Reset (use between passes, not required before the first one)

Click the world **RESET ALL STATIONS** button at world `(2403, 1, 2400)`:

```
click_entity  x: 2403  y: 1  z: 2400
```

Expected result: `hit: true`. Expected log: `[RESET] reset #1 requested ...` then
`[RESET] reset #1 complete -- all counters zeroed, all InputModifiers cleared`. Every counter
shown in every station's readout board goes back to its initial value, and any active
`InputModifier` is cleared -- confirm with a screenshot of any readout board
Every dot painted at S10 is removed too, and both UI panels close.

---

## S1 -- Locomotion lane

Proves: **(1)** real locomotion pipeline, collisions, speed-by-`kind`. **(3)** `walk` does not
emit `IA_FORWARD`.

1. Face north (default spawn orientation already does this) and check the S1 readout board at
   world `(2388, 3.6, 2401.5)` -- the far end of the lane, next to the end wall (`S1_READOUT`
   is local `(4, 3.6, 17.5)`). It is *not* above the spawn point; it was moved after the first
   live run, and this line kept the old position until the 2026-09-01 run caught it.
2. Walk 4m north at `walk` speed:
   ```
   walk  directionX: 0  directionY: 1  seconds: 3  kind: walk
   ```
   Expected result: `distance` well under the `seconds * speed` ceiling for a fast gait --
   this is the slowest bucket (~1.5 m/s per `AvatarLocomotionSettings` defaults).
   Expected log: `[S1-LOCOMOTION] burst finished: distance=...m avgSpeed=...m/s sustainedSpeed=...m/s bucket=walk`.
   Expected screenshot: the player should be near the "4m" floor marker (world `(2388, 0.05, 2389)`)
   or short of it.
3. Repeat with `kind: jog` then `kind: run` and compare `distance` and `sustainedSpeed` across
   the three -- `run` should cover visibly more ground per second than `jog`, which covers more
   than `walk`.

   > **Use `seconds: 1.2`, not 2, and start all three from the same mark.** The lane is only
   > ~17.5m from the 0m marker to the end wall, and at this client's speeds a 2s jog covers ~20m
   > and a 2s run ~25m -- both end clipped against the wall, which voids the comparison (caught
   > on the 2026-09-03 seventh run, which had written 2s as the script says). 1.2s tops out at
   > ~9.5m and fits, and being equal across the three it compares cleanly. `move_to` back to
   > `(2388, 0, 2385)` between bursts.

   **Judge by `sustainedSpeed` and distance, and ignore `bucket=` entirely.** With
   `JOG_MAX_MS = 9` still miscalibrated the label no longer separates *any* pair: measured
   2026-09-03, a 1.2s jog sustains **10.13** and a free 0.8s jog control **9.08**, so even a
   plain jog reports `bucket=run`. A `move_to` between bursts logs a
   `teleport detected ... ignored` line instead of a phantom superhuman burst (each followed by a
   spurious 0.08m/0.03s micro-burst line -- harmless, ignore it).

   Measured 2026-09-03, three 1.2s bursts from `(2388, 0, 2385)` facing north:

   | burst | tool distance | sustainedSpeed | bucket |
   |---|---|---|---|
   | `walk` | 1.73 | 1.96 | walk |
   | `jog` | 7.99 | 10.13 | run (mislabelled) |
   | `run` | 9.49 | 12.62 | run |
4. Walk all the way into the end wall:
   ```
   walk  directionX: 0  directionY: 1  seconds: 6  kind: run
   ```
   Expected result: `endPosition` stops at/near world z `2402.5` (the wall face) even though
   6 seconds at run speed would cover much more distance in the open -- **collision applied**.
   Screenshot: player pressed up against the wall, past the "16m" marker.
5. Press forward the "wrong" way to show the `IA_FORWARD` divergence:
   ```
   walk  directionX: 0  directionY: 1  seconds: 1
   ```
   Then read the S1 readout board (screenshot it): it prints
   `global IA_FORWARD count: 0 (see S6)`. `walk` moved the player but the counter stayed at 0.
6. Now:
   ```
   press_input  action: forward
   ```
   Screenshot the S1 (or S6) readout again: `global IA_FORWARD count: 1` -- proves divergence
   **(3)**: only `press_input FORWARD` increments the SDK input-action counter; `walk` never
   does, even though both move-shaped inputs exist.

---

## S2 -- Jump / vertical

Proves: **(1)**/(2) jump-gated movement via the real pipeline, contrasted with the global
`IA_JUMP` action.

1. Stand ~2.5m south of the platform (`move_to` world `(2388, 0, 2406.5)`) and jump onto it in one
   call (platform top is at world y=1.2, the platform sits at world `(2388, 0.6, 2409)`):
   ```
   walk  directionX: 0  directionY: 1  seconds: 0.5  kind: jog  jump: true
   ```
   **Timing matters** (measured live): at `kind: run` even 1s covers ~7m and the arc sails clean
   over the 3m platform (it landed at z 2414.55); `kind: jog, seconds: 0.5` from z 2406.5 lands on
   top.
   Expected result: `endPosition.y` ~1.28 (up from ~0.08).
   Expected log: `[S2-JUMP] platform arrival #1 -- reached via walk(..., jump:true)`.
   An arrival is counted only after the player has stayed in the trigger for ~0.4s — a jump arc
   that overshoots through the volume logs `platform fly-through ... not counted` instead.
   Expected screenshot: player standing on the raised platform; the pressure plate
   (world `(2388, 1.25, 2409)`) should have changed from grey to green.
2. Try the same approach **without** `jump: true` from the base of the platform -- the player
   should not mount it (1.2m is taller than the avatar's step-over height), demonstrating the
   platform really requires the jump flag, not just proximity.
3. Walk to the ground-level jump mark at world `(2388, 0.05, 2413)` and:
   ```
   press_input  action: jump
   ```
   Expected log: a `[S6-GLOBAL] IA_JUMP scene-root broadcast -- count now N` line (S6's board),
   and the S2 readout board (world `(2388, 3.6, 2404)`) updates its `global IA_JUMP presses:`
   line to match. (This line said `IA_JUMP global press` for six runs; the scene has always
   logged `scene-root broadcast`. Corrected 2026-09-03.) **Clear the reticle before this
   unaimed press** — see S6 note 1. This is the "jump action event" side of the contrast: it does **not** move the
   player onto the platform, only `walk(..., jump:true)` does.

---

## S3 -- Freeze zone (`InputModifier`)

Proves: **(2)** InputModifier applies to `walk` exactly like WASD; `ignoreInputModifiers`
escapes it; the run-only sub-zone shows the degrade-through-fallback case.

1. Walk from the lane entrance into zone A (world center `(2395, 0.05, 2404)`, spans world
   x `2393..2397`, z `2402..2406`):
   ```
   walk  directionX: 0  directionY: 1  seconds: 2  kind: run
   ```
   (aim the strafe/forward axes so the path crosses x≈2395, or issue a small `directionX`
   correction first if you overshot the lane).
   Expected log: `[S3-FREEZE] zone A entered (#1) -- InputModifier disableAll+disableJump applied`.
   Screenshot: the S3 readout at world `(2395, 3, 2407)` shows `modifier: zone A: disableAll + disableJump`.
2. While standing in zone A, try to walk further:
   ```
   walk  directionX: 0  directionY: 1  seconds: 2  kind: run
   ```
   Expected result: `distance` ~0 -- the freeze applies to `walk` exactly as it would to WASD.
3. Now escape it:
   ```
   walk  directionX: 0  directionY: 1  seconds: 0.7  kind: run  ignoreInputModifiers: true
   ```
   Expected result: `distance` > 0 again -- `ignoreInputModifiers` bypassed the scene's lock.

   > **Keep this burst short — 0.7s, not 2s.** Zone B's north end (`z 2416`) *is* this 2x2 scene's
   > north parcel boundary, so a 2s escape run north out of zone A carries the player clean off the
   > scene (measured ~17m of travel against ~11m of room). Off-parcel every subsequent click fails
   > with "no running current scene". 0.7s lands the player inside zone B at about `z 2410`, which
   > also gets you step 4's zone-A-exit and zone-B-entry **on foot** in the natural order — better
   > evidence than step 4's `move_to`, which reverses the two log lines.
4. Walk out of zone A (south, back the way you came) and confirm the log
   `[S3-FREEZE] zone A exited`, then `move_to` the zone B entry mark at
   world `(2395, 0, 2407.5)` and walk north into the zone (a 9m corridor, world z `2407..2416`).
   Expected log: `[S3-FREEZE] zone B entered (#1) -- InputModifier disableRun applied (walk/jog still work)`.
   **`move_to` between zones is safe but not order-preserving**: a teleport that crosses both
   volumes delivers the destination's `enter` BEFORE the origin's `exit` (a walking player never
   produces that order). The scene now recomputes the `InputModifier` from zone occupancy on
   every event, so the modifier ends up correct either way — but the two log lines will arrive
   in that reversed order, and any scene that writes the modifier directly from its handlers
   would be left unfrozen.
5. In zone B, measure the degradation. **`disableRun` degrades run to jog — it does not stop
   the player**, so this step compares speeds, not distances, and the burst must be long enough
   to leave the acceleration ramp (that is why the zone is a 9m corridor and not a 4m pad: a run
   burst crossed the old pad in ~0.25s, entirely inside the ramp, and an in-zone burst read the
   same as a control burst outside it). From the zone B entry mark, facing north:
   ```
   walk  directionX: 0  directionY: 1  seconds: 0.8  kind: run
   ```
   Expected log (S1's classifier reports the sustained speed): a `sustainedSpeed` clearly below the
   free-run control in step 6 — the run request was degraded to the jog tier.

   > **0.8s, not 1s** — at this client's speeds a 1s run burst covers ~10m and cannot be contained
   > in the 9m corridor at all. 0.8s is still well clear of the acceleration ramp: a measured burst
   > reached `sustainedSpeed 9.51` within 0.49s, so the ramp is far shorter than the corridor
   > budget assumes.
   >
   > **Do not judge this step by the `bucket=` label.** With `JOG_MAX_MS = 9` still miscalibrated
   > (see the fourth-run defects), the degraded in-zone run measures ~9.1 m/s and so labels
   > `bucket=run` by a 0.1 m/s margin. Compare sustained speeds, and take step 6's *two* controls.
6. Controls: leave the zone and repeat the identical 0.8s burst — then run it a third time with
   `kind: jog`.

   > **Take the controls SOUTHWARD from `(2402, 0, 2412)`, not northward from
   > `(2400, 0, 2407.5)`.** A 0.8s free run covers ~10m; from z 2407.5 that lands at ~2417.5,
   > past the scene's north edge at z 2416, and off-parcel every later click fails with "no
   > running current scene". `(2402, 0, 2412)` facing south (`look_at 2402, 1, 2400`) is clear
   > ground with ~10m of room and is outside both zones. This is the same hazard step 3 warns
   > about, one step later; the 2026-09-03 run hit it and rerouted.

   Measured 2026-09-03 (in-zone from the zone B entry mark facing north; controls south from
   `(2402, 0, 2412)`):

   | burst | distance | sustainedSpeed | bucket |
   |---|---|---|---|
   | in-zone `kind: run` | 4.73 | 9.11 | run (mislabelled) |
   | free `kind: run` | 5.74 | 11.16 | run |
   | free `kind: jog` | 4.78 | 9.08 | run (mislabelled) |

   The in-zone run sits **on top of** the free **jog** (9.11 vs 9.08) and 2 m/s below the free
   **run** — that is the proof, and the jog control is what makes it unambiguous. A distance
   comparison over a short burst is not proof (all three are ~5m), and neither is the `bucket=`
   label, which now reads `run` for all three.
7. Also confirm `kind: walk` inside the zone is untouched (`bucket=walk`), i.e. the lock degrades
   the run tier only.

---

## S4 -- Click targets

Proves: **(4)** real camera-origin raycast (occlusion + `maxDistance`), **(5)** click = down
then up on consecutive ticks, hold semantics via separate down/up calls.

All eight targets and marks (world coordinates):

| Target/mark | World position | Notes |
|---|---|---|
| Plain down/up button | `(2402, 1, 2387)` | logs DOWN then UP separately |
| Hold-to-charge target | `(2404.5, 1, 2387)` | down starts charge, up commits |
| Short-range target | `(2407, 1, 2387)` | `maxDistance: 3` |
| Long-range target | `(2409.5, 1, 2387)` | `maxDistance: 16` |
| Secondary-button target | `(2412, 1, 2387)` | bound to `button: secondary` |
| Far mark | `(2408.25, 0, 2399)` | ~12m from both short/long targets |
| Blocked-shot mark | `(2401, 0, 2386)` | south of the occluder |
| Occluder box | `(2401, 1, 2390)` | blocks the blocked-shot line only |
| Occluded target | `(2401, 1, 2394)` | behind the occluder from the south |
| Clear-shot mark | `(2404.5, 0, 2394)` | side approach, same target, no occluder in the way |
| Offset pivot (NO collider) | `(2410, 1, 2397)` | do not aim here |
| Offset target's actual collider | `(2411.2, 1.3, 2396.4)` | aim here instead |
| Big click_at target | `(2414, 1.5, 2397)` | large box for screen-space aiming |
| Big-target stand mark | `(2414, 0, 2393)` | 4m south of the big target |

1. **Down/up ordering (5):**
   ```
   click_entity  x: 2402  y: 1  z: 2387  eventType: down
   ```
   Expected log: `[S4-CLICK] plain button DOWN at frame N`. Then:
   ```
   click_entity  x: 2402  y: 1  z: 2387  eventType: up
   ```
   Expected log: `[S4-CLICK] plain button UP at frame N+k (click #1 complete)` -- the UP frame
   is strictly later than the DOWN frame, proving down-then-up-on-a-later-tick.
   ```
   click_entity  x: 2402  y: 1  z: 2387
   ```
   (default `eventType: click`) does both legs in one call -- confirm `[S4-CLICK] ... UP ...
   (click #2 complete)` appears with only one tool call this time.

2. **Hold-to-charge (5, hold semantics):**
   ```
   click_entity  x: 2404.5  y: 1  z: 2387  eventType: down
   ```
   Wait ~2 seconds (do something else, e.g. read a log), then:
   ```
   click_entity  x: 2404.5  y: 1  z: 2387  eventType: up
   ```
   Expected log: `[S4-CLICK] charge target UP at frame N -- commit #1, held ~2000ms`. Screenshot
   partway through the hold to see the box ramp from grey toward yellow.

3. **maxDistance gating (4):** stand at the far mark `(2408.25, 0, 2399)` (use `walk` to get
   there, then `look_at` each target in turn):
   ```
   look_at  x: 2407  y: 1  z: 2387
   click_entity  x: 2407  y: 1  z: 2387
   ```
   Expected result: `hit: false` (or a miss reason) -- the far mark is ~12m from the
   short-range target, past its `maxDistance: 3`. No `[S4-CLICK]` hit log appears for it.
   ```
   look_at  x: 2409.5  y: 1  z: 2387
   click_entity  x: 2409.5  y: 1  z: 2387
   ```
   Expected result: `hit: true`. Expected log: `[S4-CLICK] long-range target hit #1`.

4. **Occlusion (4):** stand at the blocked-shot mark `(2401, 0, 2386)`:
   ```
   look_at  x: 2401  y: 1  z: 2394
   click_entity  x: 2401  y: 1  z: 2394
   ```
   Expected result: `hit: false`, with `blockedByEntityId`/`blockedByCrdtId`/`blockedByCollider`
   populated (the occluder box). No `[S4-CLICK]` hit log for the occluded target.
   Now walk to the clear-shot mark `(2404.5, 0, 2394)` and repeat:
   ```
   look_at  x: 2401  y: 1  z: 2394
   click_entity  x: 2401  y: 1  z: 2394
   ```
   Expected result: `hit: true`. Expected log: `[S4-CLICK] occluded target hit #1 (clear line of sight)`.

5. **Offset collider (explicit x/y/z):**
   ```
   click_entity  x: 2410  y: 1  z: 2397
   ```
   Expected result: `hit: false` -- the pivot has no collider at all.
   ```
   click_entity  x: 2411.2  y: 1.3  z: 2396.4
   ```
   Expected result: `hit: true`. Expected log: `[S4-CLICK] offset target hit #1`.

6. **click_at (screen-space):** walk to `(2414, 0, 2393)`, then:
   ```
   look_at  x: 2414  y: 1.5  z: 2397
   ```
   Take a screenshot -- the big target should now be roughly centered. Then:
   ```
   click_at  x: 0.5  y: 0.5
   ```
   Expected result: `hit: true` on the big target. Expected log:
   `[S4-CLICK] big target hit #1 (click_at)`.

7. **Secondary button:**
   ```
   click_entity  x: 2412  y: 1  z: 2387  button: secondary
   ```
   Expected log: `[S4-CLICK] secondary-button target hit #1`.

---

## S5 -- Hover

Proves: **(6)** real `PET_HOVER_ENTER`/`PET_HOVER_LEAVE` + `hoverText`, distance-gated hover.

| Target | World position | Notes |
|---|---|---|
| Hover A | `(2404, 1, 2403)` | short hover text |
| Hover B | `(2408, 1, 2403)` | long hover text |
| Hover C | `(2412, 1, 2403)` | `maxDistance: 2` |
| Hover C near mark | `(2412, 0, 2401.5)` | ~1.8m away -- should succeed |
| Hover C far mark | `(2412, 0, 2408)` | ~5m away -- should miss |

> **`hoverText` on hover-only targets**: the client's tooltip only exists for press/release
> entries (a hover-only entity shows no key prompt), so the hover result reads the target's own
> `PointerEvents` text as a fallback. Before that fallback existed these three targets returned
> no `hoverText` at all — if a run reports it missing again, that fallback regressed.

1. ```
   hover_entity  x: 2404  y: 1  z: 2403  seconds: 2
   ```
   Expected result: `hit: true`, `hoverText: "Hover A"`. Expected logs:
   `[S5-HOVER] A: PET_HOVER_ENTER (#1) hoverText="Hover A"` then, after the hold ends,
   `[S5-HOVER] A: PET_HOVER_LEAVE (#1)`.
2. ```
   hover_entity  x: 2408  y: 1  z: 2403  seconds: 2
   ```
   Expected result: `hoverText` is the long string. Confirm the full string round-trips in the
   tool result (not truncated).
3. Walk to the near mark `(2412, 0, 2401.5)`:
   ```
   hover_entity  x: 2412  y: 1  z: 2403  seconds: 2
   ```
   Expected result: `hit: true`. Log: `[S5-HOVER] C: PET_HOVER_ENTER (#1) -- only reachable within 2m`.
4. Walk to the far mark `(2412, 0, 2408)` and repeat the same call. Expected result: `hit: false`
   (out of the 2m gate) -- no `PET_HOVER_ENTER` log for C this time, proving the distance gate.
5. Check C's enter/leave balance on the readout: it must read `1/1`, not `1/0`. The leave used to
   be swallowed for tight-`maxDistance` targets — it was re-qualified against the ray of the
   frame the hover ended on, which points elsewhere and reads as out-of-range. A `1/0` here is
   that bug returning.

---

## S6 -- Global input board + suppression demo

Proves: **(7)** `press_input` fan-out: scene-root broadcast vs entity-bound, and that an
entity-bound edge suppresses the scene-root broadcast for that tick. This is the single best
demo in the scene.

Board: world `(2408, 3.4, 2411)`. Suppression target: world `(2404, 1, 2413)` (bound to
`IA_PRIMARY`).

> **Two things this station gets right that are easy to get wrong.**
>
> 1. **An unaimed `press_input` lands entity-bound whenever the reticle happens to rest on an
>    interactable — so aim every press you mean to be entity-bound, and clear the reticle for
>    every press you mean to reach the scene root.** That is why `press_input` takes an aim
>    (`entityId`, or `x/y/z`): with it the reticle is held on the target for the gesture, which is
>    the only *reliable* way to bind. `look_at` followed by an unaimed `press_input` is not a
>    substitute — but it is not inert either, and that is the trap.
>
>    Corrected on 2026-09-02, having said "can never land entity-bound" for four runs. Measured
>    live: an unaimed `press_input action:forward`, with no `entityId` and no `x/y/z`, returned
>    `entityBound: true` on `crdtEntityId 584` (the S9 world toggle) at `distance 5.54` — and
>    therefore **suppressed** the `IA_FORWARD` scene-root broadcast the step was trying to count.
>    Re-aiming the camera at blank geometry and repeating the identical call gave
>    `entityBound: false` and the expected root broadcast. The binding is not filtered by action:
>    a `forward` press bound to a button that exists to take a pointer click. `cursorState` is
>    `Free` and `pointerLocked` is `false` throughout, so the reticle does rest somewhere.
>
>    **Practical rule for every unaimed step below (S1 step 6, S2 step 3, S6 steps 1 and 4):**
>    **pitch the view into open sky with `camera_look deltaX: 0 deltaY: 8 seconds: 1.5`, then
>    press.** That worked 4/4 on 2026-09-03 (`entityBound: false` every time). A step that
>    reports `entityBound: true` when you passed no aim has measured nothing; re-clear and repeat
>    rather than recording it.
>
>    **Do NOT rely on `look_at`-ing geometry that has no `PointerEvents`** — that was this note's
>    advice for two runs and it does not work, because the reticle follows the free cursor and
>    `look_at` does not move it. Measured 2026-09-03: `look_at` the S1 end wall (no
>    `PointerEvents`, 1m away) followed by an unaimed `press_input action: forward` returned
>    `entityBound: true` on `crdtEntityId 582` — the RESET ALL STATIONS button, **15.87m away and
>    ~15m off the aim axis** — and suppressed the `IA_FORWARD` broadcast the step was counting.
>    Filling the screen with sky is what actually leaves the cursor over nothing.
>
>    (Harmlessly, that stray bind is also evidence for this station: an entity-bound `IA_FORWARD`
>    on the RESET button neither fired the button's pointer handler — no `[RESET]` log — nor
>    produced a root broadcast.)
>
>    Also: **action names are lowercase.** `action: PRIMARY` is rejected outright with
>    `"action is required (e.g. primary, secondary, action_3)"`; `action: primary` works.
> 2. **The board counts the scene-root broadcast by reading the root's own
>    `PointerEventsResult` grow-only set directly** (with a timestamp watermark).
>    `inputSystem.isTriggered` CANNOT make this measurement in any form: without an entity it is
>    answered from every entity's `PointerEventsResult`, and passing `engine.RootEntity` does not
>    help because the root entity is `0` and the SDK's `if (entity)` guard treats it as "no
>    entity" (JavaScript falsy zero) — the same all-entities scan either way. Three live runs
>    misread that artifact as "suppression is broken". If a future edit replaces the direct gset
>    read with any `isTriggered` call, this station silently stops proving anything.

1. Stand away from the suppression target and press with no aim:
   ```
   press_input  action: primary
   ```
   Expected result: `entityBound: false`, plus a `hint` explaining the scene-root delivery.
   Expected log: `[S6-GLOBAL] IA_PRIMARY scene-root broadcast -- count now 1`.
   Screenshot the board: `scene-root PRIMARY: 1   entity PRIMARY: 0`.
2. Now press the same action **aimed at** the suppression target:
   ```
   press_input  action: primary  x: 2404  y: 1  z: 2413
   ```
   Expected result: `entityBound: true`, `entityId`/`crdtEntityId` of the target, `hitPoint`,
   `distance`, and `hoverText: "press_input PRIMARY aimed here (entity-bound)"`.
   Expected log: `[S6-GLOBAL] entity-bound PRIMARY on suppression target (#1) -- global PRIMARY should NOT increment this frame`.
   Screenshot the board again: `scene-root PRIMARY` is **still 1** (unchanged), `entity PRIMARY: 1`
   — the entity-bound edge suppressed the scene-root broadcast. The target's box flashes green.
   (Get within the target's `maxDistance: 16` first; the result reports the distance it used.)
3. Repeat step 2 addressing the target by id instead of by point, to exercise the other form:
   ```
   list_scene_entities            # then match the [INIT] map, or read entityId back from step 2
   press_input  action: primary  entityId: <the target's Arch id>
   ```
   Same expectations as step 2.
4. Exercise a few more rows for completeness (all unaimed, so all scene-root):
   ```
   press_input  action: action_3
   press_input  action: secondary
   press_input  action: jump  holdSeconds: 1
   ```
   Expected logs: one `[S6-GLOBAL] IA_ACTION_3 ...`, one `IA_SECONDARY ...`, one `IA_JUMP ...`
   line each, and the board's corresponding counters increment by 1 each.

---

## S7 -- Camera look

Proves: `camera_look` (relative) and `look_at` (absolute) both drive the real camera; live
yaw/pitch readout.

Stand mark: world `(2400, 0, 2400)`. Markers (world):

| Marker | World position |
|---|---|
| MARKER-L (left) | `(2388, 6, 2400)` |
| MARKER-R (right) | `(2412, 6, 2400)` |
| MARKER-U (up) | `(2400, 20, 2400)` |
| MARKER-D (down) | `(2400, 0.3, 2388)` |

1. Walk to `(2400, 0, 2400)`.
2. ```
   look_at  x: 2388  y: 6  z: 2400
   ```
   Expected result: `cameraRotationEuler` reflects a leftward yaw **and `aimErrorDegrees` ~0**.
   Pass the marker's real position — the aim is refined until the point is actually under the
   reticle, so the y-fudging an earlier run needed (`y: 10.5` for this marker, `y: 80` for
   MARKER-U) is now wrong: it would aim above the marker. Expected log:
   `[S7-CAMERA] MARKER-L (left) entered aim (angle X.X deg)` within a frame or two. Readout
   board at `(2400, 3.6, 2400.01)` should show `L:1` incrementing.
3. ```
   camera_look  deltaX: 6  deltaY: 0  seconds: 1.5
   ```
   Turn right with a relative pan; watch yaw increase in the tool result and in the readout.
   If it crosses into MARKER-R's ~8 deg cone, expect
   `[S7-CAMERA] MARKER-R (right) entered aim`.
4. **MARKER-U needs distance, not a bigger y.** From the stand mark it sits at ~85 deg of
   elevation and a third-person camera clamps its pitch at about -53.6 deg, so it is physically
   unreachable there. `look_at` reports how far short it stopped:
   ```
   look_at  x: 2400  y: 20  z: 2400
   ```
   Expected result: `aimErrorDegrees` well above 2 plus a `warning` naming the rig limit — the
   correct answer for an unreachable target, and the check that `look_at` no longer claims
   success it did not achieve. Then clear the clamp with first person and retry:
   ```
   set_camera_mode  mode: first_person
   look_at  x: 2400  y: 20  z: 2400
   ```
   Expected result: `aimErrorDegrees` ~1. Expected log:
   `[S7-CAMERA] MARKER-U (up) entered aim`. Restore `third_person` afterwards.
   (Backing off to shallow the angle — `move_to (2386, 0, 2386)` then the same `look_at` — does
   **not** work in third person: measured `aimErrorDegrees: 18.0` with the pitch stopping at
   only -22.5 deg, well short of the -53.6 deg clamp; the rising orbit boom most plausibly
   collides with the ground and moves the ray origin under the refiner.)
5. ```
   look_at  x: 2400  y: 0.3  z: 2388
   ```
   Expected: the camera pitches **down** — which in this Euler convention is a *positive*
   `cameraRotationEuler.x` (measured 9.85 with yaw 180), not a negative one; earlier revisions of
   this line had the sign backwards. Log `[S7-CAMERA] MARKER-D (down) entered aim`.
   Each marker's label board prints its own exact world coordinates (visible in a screenshot)
   so the same numbers used above are also readable in-world.

---

## S8 -- Scene UI

Proves: **(8)** SDK UI addressed only by CRDT id; `ui_click`/`ui_set_text`/`ui_scroll` fire the
same events a user would; a covered element fails unless `force: true`; `device: true` replays
through the virtual mouse.

1. Open the panel:
   ```
   click_entity  x: 2397  y: 1  z: 2400
   ```
   Expected log: `[S8-UI] panel opened`. Screenshot: the panel appears **centered** on the
   screen (S9's is the left-anchored one; the bottom-left status bar names which are open).
2. Discover every element's CRDT id (this scene's React UI does not print its own CRDT ids to
   the log -- they are reconciler-managed, so `ui_list` is the source of truth):
   ```
   ui_list  stack: sdk
   ```
   Expected result: a JSON array of elements including the three counter buttons, the text
   input, the dropdown, the scrollable list, the two drag-surface halves, and the modal-open
   button. Note each element's `crdtId` for the steps below (referred to as `<btn1Id>`,
   `<btn2Id>`, `<btn3Id>`, `<inputId>`, `<dropdownId>`, `<scrollId>` here).
3. **Semantic click:**
   ```
   ui_click  stack: sdk  crdtId: <btn1Id>
   ```
   Expected log: `[S8-UI] button 1 clicked -- count 1`. Screenshot: button label changes to
   `Button 1 (1)` and its variant/color flips.
4. **Device-path click (same button, second time) — expected NOT to reach scene UI:**
   ```
   ui_click  stack: sdk  crdtId: <btn1Id>  device: true
   ```
   The virtual mouse drives the client's UI stack; UI Toolkit scene panels consume events sent
   to their elements, so an injected device pointer does not arrive. The tool now says so:
   expect `ok: true` with an `info` line reporting that the element observed no pointer event
   within a few frames, and **no** `[S8-UI] button 1 clicked` log. That is the documented
   boundary between the two paths, not a scene bug — use the semantic path (`device` omitted)
   for scene UI, and the device path for the client interface (`stack: ugui`).
5. **Text input (change + submit):**
   ```
   ui_set_text  stack: sdk  crdtId: <inputId>  text: "hello mcp"
   ```
   Expected log: `[S8-UI] input changed -> "hello mcp" (change #1)`. Screenshot: the echo label
   under the input reads `echo: "hello mcp"`.
   ```
   ui_set_text  stack: sdk  crdtId: <inputId>  text: "submitted value"  submit: true
   ```
   Expected log: both `[S8-UI] input changed -> "submitted value" (change #2)` **and**
   `[S8-UI] input submitted -> "submitted value" (submit #1)`.
6. **Dropdown:**
   ```
   ui_set_text  stack: sdk  crdtId: <dropdownId>  optionIndex: 2
   ```
   Expected log: `[S8-UI] dropdown selected index 2 ("Charlie")`. Screenshot: the dropdown now
   shows "Charlie".
7. **Scroll — mind the sign.** `dy` follows image coordinates: **positive scrolls the content
   down**, toward later rows. A negative `dy` at the top of the list is a no-op by definition
   (the offset is already clamped at 0), which is what an earlier run mistook for a broken tool.
   ```
   ui_scroll  stack: sdk  crdtId: <scrollId>  dy: 400
   ```
   Expected result: `ok` plus an `info` line reporting the offset that was actually achieved
   (e.g. `scroll offset (0, 0) -> (0, 400)`); if it reports "did not move", the container is
   already at that end or its content does not overflow. Screenshot before/after: the visible
   row numbers shift from `ROW 1..~5` to further down the list -- the large row numbers make
   the scroll position verifiable straight off the image.
8. **Drag surface (`ui_drag`, normalized top-left coords):** **take each half's `center`
   straight from `ui_list stack: sdk` and pass it verbatim** -- it is already normalized 0..1.
   Do not compute one from `screenRect`: that rect is in the client's *screen* pixels (the
   result states them as `screen`, e.g. `2087x1174`), which is not the size of the screenshot
   you looked at. If you ever need a point that is not an element centre, normalize it against
   the space you read it from -- a `screenRect`-derived point against `screen`, a point picked
   off a screenshot against that screenshot's own width/height -- and never mix the two.
   Example call shape, using the `center`s the run of 2026-09-01 read back:
   ```
   ui_drag  fromX: 0.4042  fromY: 0.7032  toX: 0.5961  toY: 0.7032  durationFrames: 20  path: sdk
   ```
   (`path: sdk` makes the call *fail* rather than silently dragging the 3D world behind the
   panel if the scene UI does not own the start point.)
   A drag whose start point lands inside the scene UI is delivered to those elements (press on
   the start element, moves along the path, release on the end element) — expect `path: "sdk"`
   in the result. Expected log: `[S8-UI] drag surface: LEFT down (armed)` followed by
   `[S8-UI] drag surface: RIGHT up while armed -- drag #1 completed`, and an `info` line naming
   the two elements involved. Screenshot: the right half visibly reacts.
   The release leg used to be lost (the leave event overwrote the single pointer-event slot
   before the scene drained the release — the 2026-08-28 run's second failure); the tool now
   waits for each event to be consumed and **fails** with "the scene did not consume the
   release" instead of reporting a success it cannot verify. If both log lines arrive, the fix
   holds.
   Adding `device: true` forces the virtual-mouse path instead and, as in step 4, is expected
   **not** to reach the scene UI — worth running once to see the contrast.
9. **Modal occlusion (the negative case).** Note that a plain `ui_click` on scene UI must now
   succeed *without* `force`: the pre-check used to report the scene UI's own panel host
   (`EventSystem/DCLScenePanelSettings`) as a cover, so every SDK click needed `force: true`. If
   `force` is required again for an uncovered element, that false positive is back.

   ```
   ui_click  stack: sdk  crdtId: <btn3Id>
   ```
   Expected log: `[S8-UI] modal overlay opened (covers button 2)`. Screenshot: a translucent
   panel now covers Button 2.
   ```
   ui_click  stack: sdk  crdtId: <btn2Id>
   ```
   Expected result: failure / `blockedBy`-shaped error -- the click does not reach Button 2
   because the modal covers it. No `[S8-UI] button 2 clicked` log appears.
   ```
   ui_click  stack: sdk  crdtId: <btn2Id>  force: true
   ```
   Expected log: `[S8-UI] button 2 clicked -- count 1` -- `force: true` clicked straight
   through the cover.
10. Close the panel from the world button again (`click_entity x:2397 y:1 z:2400`) or leave it
    open for the next pass -- either is fine, the panel state is idempotent.

---

## S9 -- UI text entry (`<Input />`)

Proves: **(9)** text written with `ui_set_text` is *state the scene can read back*, not a
one-shot event. Five fields, each isolating one property of a write: an uncontrolled field, a
controlled field seeded with text a write has to replace, a submit-only field, a disabled field
that must refuse the write, and a two-field form read by a later `ui_click`.

S8's panel renders centered; S9's is anchored hard to the left, so the two never overlap even
with both open. If `ui_click`/`ui_set_text` ever reports one station's panel as a cover over the
other's element, the layout has drifted -- that is the false positive the first live run chased.

1. Open the panel:
   ```
   click_entity  x: 2394  y: 1  z: 2400
   ```
   Expected log: `[S9-TEXT] panel opened`. Screenshot: a green-tinted panel on the left of the
   screen, and the bottom-left status bar flips to `S9 panel: OPEN`.
2. Discover the element ids (React reconciler-managed, so `ui_list` is the only source):
   ```
   ui_list  stack: sdk
   ```
   Expected result: six inputs and two buttons among the elements -- referred to below as
   `<freeId>`, `<seededId>`, `<submitOnlyId>`, `<disabledId>`, `<callsignId>`, `<codeId>`,
   `<formSubmitId>`, `<clearId>`. Field order on screen matches the numbering in the panel.
3. **Write into the uncontrolled field:**
   ```
   ui_set_text  stack: sdk  crdtId: <freeId>  text: "hello from mcp"
   ```
   Expected log: `[S9-TEXT] FREE changed -> "hello from mcp" (14 chars, change #1)`. Screenshot:
   the `read back:` label under the field echoes the same string -- that echo is the scene
   reading the value, not the client re-rendering what it was handed.
4. **Submit it:**
   ```
   ui_set_text  stack: sdk  crdtId: <freeId>  text: "final answer"  submit: true
   ```
   Expected logs: `[S9-TEXT] FREE changed -> "final answer" ...` **and**
   `[S9-TEXT] FREE submitted -> "final answer" (submit #1)`. The header line reads
   `changes 2 / submits 1`.
5. **Replace a seeded value (the field the scene controls):** the field starts holding
   `seeded-value` and the scene passes it back as `value` on every render, so a write that only
   *appends*, or a re-render that echoes the old string over the new one, is visible immediately.
   ```
   ui_set_text  stack: sdk  crdtId: <seededId>  text: "overwritten"
   ```
   Expected log: `[S9-TEXT] SEEDED changed -> "overwritten" (was "seeded-value" at start, change #1)`.
   Screenshot: the label under it flips from grey `still the seed value` to green
   `replaced: "overwritten"`. If it reads `seeded-valueoverwritten`, the write appended instead
   of replacing; if it snaps back to `seeded-value` a frame later, the controlled-value echo
   guard regressed.
6. **Submit-only field -- a plain write must not submit (negative):**
   ```
   ui_set_text  stack: sdk  crdtId: <submitOnlyId>  text: "not submitted"
   ```
   Expected: **no** `[S9-TEXT]` log at all (the field wires `onSubmit` only) and the panel's
   `submits 0` unchanged. Then:
   ```
   ui_set_text  stack: sdk  crdtId: <submitOnlyId>  text: "now submitted"  submit: true
   ```
   Expected log: `[S9-TEXT] SUBMIT-ONLY submitted -> "now submitted" (submit #1)`.
7. **Disabled field (the negative case):**
   ```
   ui_set_text  stack: sdk  crdtId: <disabledId>  text: "should not land"
   ```
   Expected: the call either refuses outright or reports a write the element did not take; either
   way the scene must log **nothing** and the panel's line 4 must stay white and read
   `rejected writes must keep this at 0: 0`. A red line 4 plus
   `[S9-TEXT] DISABLED FIELD ACCEPTED A WRITE` is a client defect, not a scene one -- the field
   is declared `disabled: true`.
8. **Two writes, then a click that reads them.** This is the point of the station: a value has to
   survive until something else asks for it.
   ```
   ui_set_text  stack: sdk  crdtId: <callsignId>  text: "delta-9"
   ui_set_text  stack: sdk  crdtId: <codeId>      text: "77123"
   ui_click     stack: sdk  crdtId: <formSubmitId>
   ```
   Expected logs, in order: `[S9-TEXT] FORM callsign -> "delta-9"`, `[S9-TEXT] FORM code -> "77123"`,
   then `[S9-TEXT] FORM submit #1 -- ACCEPTED callsign="delta-9" code="77123"`. Screenshot: the
   verdict line under the buttons turns green with both values in it.
9. **Empty form is rejected (negative):**
   ```
   ui_click  stack: sdk  crdtId: <clearId>
   ui_click  stack: sdk  crdtId: <formSubmitId>
   ```
   Expected logs: `[S9-TEXT] fields cleared ...` then
   `[S9-TEXT] FORM submit #2 -- REJECTED callsign="" code=""`. The `submits` counter advances,
   `accepted` does not.
10. Close the panel with the same world button, or leave it open -- the state is idempotent.

---

## S10 -- Paint surface (clicks and drags become geometry)

Proves: **(10)** a pointer position is usable as *content*, not just as a hit test. The station
turns pointer positions into spheres by the two paths the synthetic-input layer can reach a
world surface with, and they fail in different ways, so each gets its own canvas:

- **STAMP canvas** -- an ordinary `pointerEventsSystem.onPointerDown`. Every `click_entity` /
  `click_at` / aimed `press_input` paints exactly one dot at the hit position the event itself
  carries (`PBPointerEventsResult.hit.position`). No held button needed; fully deterministic.
- **STROKE canvas** -- the `0,5-primary-cursor-info` pattern: an `IA_POINTER` down/up pair marks
  the button held, and while it is held the station raycasts along
  `PrimaryPointerInfo.worldRayDirection` every ~60 ms and drops a dot wherever the ray lands.
  This is the one that needs the pointer to stay **down across several frames** — and, because
  that ray is built from the camera, the one that needs the camera to *turn* while it is held.
  It arms on a pointer-down on the canvas itself or on an `IA_POINTER` scene-root broadcast.

Layout (world; local = world - `(2384, 0, 2384)`):

| Element | World center | Extent | Role |
|---|---|---|---|
| STAND mark | `(2396, 0, 2389.5)` | -- | both canvases in view, ~4-5m out |
| STAMP canvas | `(2394, 2.1, 2393)` | x `2392.2..2395.8`, y `0.8..3.4` | one white dot per click |
| STROKE canvas | `(2398, 2.2, 2393)` | x `2396.2..2399.8`, y `1.0..3.4` | a coloured trail while held |
| DECOY strip | `(2398, 0.6, 2393)` | y `0.2..1.0`, directly under the stroke canvas | collidable, **never** painted |
| CLEAR CANVAS button | `(2392, 1, 2390)` | -- | wipes every dot |
| S10 readout | `(2396, 5, 2393)` | -- | live dot / stroke / off-canvas counts |

1. Get in position and face the canvases:
   ```
   walk    directionX: 0  directionY: 1  seconds: 1  kind: jog
   look_at  x: 2396  y: 2.1  z: 2393
   ```
   (or `move_to` the stand mark directly -- S10 watches no trigger volumes, so a teleport is
   harmless here). Screenshot: two dark panels ahead, the right one with a red strip under it.
2. **Stamp a diagonal (the deterministic path).** Five clicks stepping across the left canvas:
   ```
   click_entity  x: 2392.8  y: 1.3  z: 2393
   click_entity  x: 2393.4  y: 1.7  z: 2393
   click_entity  x: 2394.0  y: 2.1  z: 2393
   click_entity  x: 2394.6  y: 2.5  z: 2393
   click_entity  x: 2395.2  y: 2.9  z: 2393
   ```
   Expected logs: five `[S10-PAINT] STAMP #n at local (...) world (...)` lines, each world
   position matching the aim point to within the canvas thickness. Screenshot: five white
   spheres on a diagonal. Readout: `STAMP dots (one per click): 5`, `live dots: 5/40`.
   This path is the fallback for everything below -- if the drag path turns out not to hold the
   pointer, a stepped run of `click_entity` calls still draws a legible dotted stroke.
3. **Sweep a stroke (the held-pointer path).** The sampled ray is
   `PrimaryPointerInfo.worldRayDirection`, which is built from the **camera** — so a stroke is
   painted by holding the button and *turning*, never by sliding a pointer across the screen.
   `sweep_pointer` is exactly that gesture (press, camera-look while held, release):
   ```
   look_at        x: 2398  y: 2.2  z: 2393
   sweep_pointer  entityId: <stroke canvas>  deltaX: 4  deltaY: 0  seconds: 2
   ```
   Get the id from `list_scene_entities`, or aim the press with `x: 2398  y: 2.2  z: 2393`
   instead. Expected result: `pressed.hit: true` on the stroke canvas, `swept: true`, and a
   `released` leg. Expected logs:
   `[S10-PAINT] IA_POINTER held (pointer-down on the stroke canvas)`,
   `[S10-PAINT] STROKE #1 started at local (...)`, then
   `[S10-PAINT] STROKE #1 ended -- N dots over X.XXm of surface (0 samples landed off the canvas)`.
   Screenshot: a coloured trail of spheres across the right canvas; the readout's `STROKE dots`
   and `strokes` lines advance and `longest` records N.

   Tune the turn so the ray stays on the canvas: `deltaX` is the same unit `camera_look` takes,
   and 4 for 2 s sweeps a few metres of surface from the stand mark. A sweep that leaves the
   canvas is not a failure — it is step 4's negative case arriving early, and the logs say so.

   **Read N carefully.** If it is 1, the station logs
   `STROKE #1 was a single dot -- the pointer was not held across frames`: the press and the
   release landed inside one drain window, so the gesture was delivered as a click. That is the
   measurement this station exists for — report it as the result, not as a scene failure.

   > **Do not use `ui_drag` here.** Dragging the virtual mouse across the world **pans the
   > camera** (the left button is the camera-pan binding, for a human too), so the call now fails
   > with "the drag panned the camera instead of dragging" and paints nothing. `ui_drag` is for
   > UI. Before 2026-09-02 this step was undrivable: the station armed from the entity-less
   > `inputSystem.isTriggered`, which cannot read the scene root (`RootEntity` is `0`, falsy-zero
   > guard — the trap S6 documents), and the stroke canvas had no `PointerEvents` to arm on
   > either. It now arms from a pointer-down on the canvas itself *or* an `IA_POINTER` scene-root
   > broadcast read with a timestamp watermark, so an unaimed hold *arms* the station too.
   >
   > **`sweep_pointer` is the only gesture that actually paints a stroke** -- the 2026-09-03 run
   > measured the alternatives and they are **not** equivalent, despite arming identically:
   >
   > | Gesture | Arms | Ray samples | Result |
   > |---|---|---|---|
   > | `sweep_pointer` aimed at the canvas | yes | many, ray moves | a real stroke (13-16 dots) |
   > | **unaimed** `press_input action: pointer holdSeconds: 2` + parallel `camera_look` | yes (scene-root broadcast) | **27 taken, none hit the canvas** | nothing painted |
   > | **aimed** `press_input ... x/y/z holdSeconds: 2` + parallel `camera_look` | yes (canvas pointer-down) | **25 taken, all on the same spot** | `STROKE #N ended -- 1 dots over 0.00m` |
   >
   > **`PrimaryPointerInfo.worldRayDirection` is populated in all three cases** -- the run-4/5
   > theory that it was never written is wrong, and the station's `no-ray samples` counter reads
   > `0` for every gesture above.
   >
   > **Why the split gesture fails: the two calls never overlap.** MCP tool calls are
   > **serialised** by the server, so a `press_input ... holdSeconds: 2` issued "alongside" a
   > `camera_look` runs to completion *before* the turn starts, and the camera is stationary for
   > the entire hold. Measured 2026-09-03 with a detached out-of-band yaw poller (~135ms
   > cadence): the hold ran 10:10:28-30 (`STROKE #4 started`/`ended`) with yaw pinned at
   > **29.73 for 60+ consecutive samples spanning the whole hold**, and the turn then ran
   > 10:10:32.45 -> 10:10:34.59 (`29.73 -> 53.85`) — starting **2.4s after the hold ended**.
   > An unaimed press additionally parks the pointer wherever the free cursor sits, so its ray
   > never crosses the canvas at all.
   >
   > This **withdraws the run-6 client defect** ("an aimed press parks a ray that is not
   > re-derived as `camera_look` turns the view"). That diagnosis assumed the calls overlapped;
   > they did not, so the gesture cannot test re-derivation and nothing is established about it.
   > `sweep_pointer` is the only gesture that holds press + turn + release inside one call, and
   > therefore the only one that can sweep. Use it; keep the split gesture only as the negative
   > case above.
   >
   > **Measuring overlap, if you ever need to:** reading `get_player_state` yaw before and after
   > does **not** work — both results arrive in one batch, so there is no moment at which you can
   > sample "as `press_input` returns", and the naive before/after reading (`29.74` then `54.28`)
   > says the opposite of the truth. A poller issued in the *same* tool batch does not work
   > either: it is served for its full window before the gesture is dispatched at all. Only an
   > already-running **detached background** poller samples the hold.
   >
   > Do **not** read `off-canvas samples (decoy / miss)` as "was a sample taken". It only counts
   > misses once a stroke is already active, so it stays `0` through a hold that sampled 27 times
   > and missed every time -- the exact reading that sent runs 5 and 6 down the wrong path. The
   > `hold ended without painting -- N ray samples were taken ...` log line is the honest channel.

4. **Sweep off the canvas onto the decoy (the negative case).** Same gesture, but turn far enough
   (or downward) that the ray leaves the canvas onto the red strip below it:
   ```
   sweep_pointer  entityId: <stroke canvas>  deltaX: 2  deltaY: -6  seconds: 2
   ```
   Expected logs: the stroke starts normally, then up to three
   `[S10-PAINT] stroke sample left the canvas (hit entityId ...) -- no dot painted` lines
   (the rest are counted, not logged -- the ray fires ~16x/s), and the stroke-end line reports
   the off-canvas total. Screenshot: **no** spheres below the canvas's bottom edge. If dots do
   appear on the red strip, the ray is not following the pointer -- it is spraying at whatever is
   in front of the camera.
5. **Pool cap.** Keep stamping past 40 total dots. Expected log, once:
   `[S10-PAINT] dot pool full at 40 -- painting now recycles the oldest dot`. The readout's
   `live dots` sticks at `40/40` while `recycles` climbs, and the oldest dot visibly moves to the
   newest position. A DCL sphere primitive is 804 triangles and a 2x2 scene's whole budget is
   40,000 -- an uncapped painter would blow it in about a minute of dragging.
6. **Clear:**
   ```
   click_entity  x: 2392  y: 1  z: 2390
   ```
   Expected log: `[S10-PAINT] canvas cleared (world button) -- clear #1`. Readout: `live dots: 0/40`
   with every other counter untouched. (`RESET ALL STATIONS` also wipes the dots, but zeroes the
   counters with them.)

---

## Negative-case summary (for quick reference)

| Case | Call | Expected |
|---|---|---|
| Frozen `walk` in zone A | `walk directionY:1 seconds:2` while inside zone A | `distance` ~0, no burst log |
| Escape the freeze | same call + `ignoreInputModifiers: true` | `distance` > 0 |
| `disableRun` degrades the tier | `walk seconds:1 kind:run` inside zone B vs outside | in-zone `bucket=jog`, control `bucket=run` (compare sustained speeds, not distances) |
| Short-range miss from far mark | `click_entity x:2407 y:1 z:2387` from `(2408.25,0,2399)` | `hit:false`, reason names the range |
| Occluded click | `click_entity x:2401 y:1 z:2394` from the blocked-shot mark | `hit:false` + `blockedByEntityId`/`blockedByCrdtId`/`blockedByCollider` naming the occluder |
| Offset-pivot miss | `click_entity x:2410 y:1 z:2397` (the pivot, no collider) | `hit:false` |
| `IA_FORWARD` stays at 0 after `walk` | S1 readout after any `walk` | `global IA_FORWARD count: 0` until `press_input action:forward` |
| Unaimed `press_input` reaches the scene root | `press_input action:primary` with no aim, **reticle resting on geometry with no `PointerEvents`** | `entityBound:false` + `hint`; scene-root counter increments, entity counter does not. With the reticle over an interactable it binds to that entity instead -- see S6 note 1 |
| Scene-root broadcast suppressed | `press_input action:primary x:2404 y:1 z:2413` | `entityBound:true`; entity counter +1, scene-root counter unchanged |
| Covered `ui_click` | `ui_click stack:sdk crdtId:<btn2Id>` while the modal is open | failure + `blockedBy`, no `[S8-UI] button 2 clicked` log |
| Device path does not reach scene UI | `ui_click stack:sdk crdtId:<btn1Id> device:true` | `ok:true` with an `info` line saying the element observed nothing, and no click log |
| Unreachable camera target | `look_at x:2400 y:20 z:2400` from the S7 stand mark | `aimErrorDegrees` >> 2 + a `warning` about the pitch clamp |
| Scroll into a clamp | `ui_scroll stack:sdk crdtId:<scrollId> dy:-400` at the top of the list | `ok` + an `info` line saying the offset did not move |
| Disabled `<Input />` refuses a write | `ui_set_text stack:sdk crdtId:<disabledId> text:"nope"` | no `[S9-TEXT]` log; panel line 4 stays white at `0` |
| A write without `submit` does not submit | `ui_set_text stack:sdk crdtId:<submitOnlyId> text:"x"` | no log, `submits 0` |
| Empty form is rejected | `ui_click` CLEAR FIELDS, then `ui_click` SUBMIT FORM | `FORM submit #N -- REJECTED callsign="" code=""` |
| Paint sample off the canvas | `sweep_pointer` on the stroke canvas turning down onto the decoy strip | `stroke sample left the canvas ... no dot painted`; no sphere below world y `1.0` |
| A sweep that never holds the pointer | any gesture whose press and release land in one drain window | `STROKE #N was a single dot -- the pointer was not held across frames` |
| A world drag pans instead of dragging | `ui_drag path:device` over the STROKE canvas | the call fails with "the drag panned the camera instead of dragging"; no stroke |
| A half-readable aim is refused, not degraded | `press_input action:primary x:2404 z:2413` (no `y`) | fails with "x, y and z must all be numbers to aim the press; omit all three for a scene-root broadcast." — and **no** `[S6-GLOBAL]` root-broadcast log, i.e. it did not silently fall back |
| A rejected number names itself | `click_entity x:2393 y:"3.0" z:2393` | `"Provide entityId, or a full x/y/z world aim point, or both. (y arrived as string \"3.0\", not a number)"` — unreachable from Claude Code's native tools, see the sixth-run note |

---

## What changed after the first live run (2026-08-28)

The first run of this script (`MCP_SHOWCASE_RESULTS.md`) surfaced eleven problems. Their
resolution changed both sides, so the script above differs from the one that was run:

**Explorer fixes** (branch `feat/synthetic-input-simulation`):

| Symptom in the run | Fix |
|---|---|
| `press_input` never landed entity-bound (5 attempts, 2 camera modes, 3 aiming methods) | `press_input` gained an aim (`entityId` / `x,y,z`). An unaimed edge *cannot* land entity-bound: the reticle follows the OS cursor and a driver holds none. `look_at` + unaimed press was never going to work |
| `hover_entity` returned no `hoverText` for hover-only targets | the result falls back to the target's own `PointerEvents` text; the client's tooltip only exists for press/release entries |
| Hover C (`maxDistance: 2`) never fired `PET_HOVER_LEAVE` | the leave was re-qualified against the ray of the frame the hover ended on. It is now issued whenever the ending hover had been qualified (matching the proximity-leave path) — this also fixed real users never seeing a leave after walking away from a tight-range interactable |
| Every SDK `ui_click` reported covered and needed `force` | the occlusion pre-check counted the scene UI's own panel host as a cover; only a surface *above* the panel counts now |
| `ui_scroll` did nothing | sign convention: positive `dy` scrolls down, and the result now reports the offset achieved so a clamp is not a silent success |
| `ui_drag` delivered nothing to scene UI | a drag starting inside the scene UI is now synthesized against its elements; `device:true` still forces the virtual mouse |
| `ui_click device:true` returned a bare `ok` while delivering nothing | it now reports whether the element observed the pointer event |
| `look_at` pitch was wrong (needed `y: 10.5` / `y: 80` fudges) | the production look-at drives an orbit value from an angle at the player's feet; the synthetic look-at now refines the aim until the point is under the reticle, and reports `aimErrorDegrees` when a rig limit stops it |
| Occluded aim-point click reported the occluder in the ordinary `entityId` + a reason, not `blockedBy*` | a ray stopped by geometry *before* the requested aim point now reports blocker fields |

**Scene fixes:**

| Symptom in the run | Fix |
|---|---|
| S2 pressure plate never fired | the 0.1m-thin slab's trigger volume never overlapped the avatar capsule; the trigger is now a separate invisible 2m box (same fix S3's zones already got mid-run) |
| S6 could not show suppression: the "global" counter incremented on entity-bound events too | the board now reads the root's `PointerEventsResult` gset directly. Two prior "corrections" were themselves wrong: entity-less `isTriggered` scans every entity's results, and `isTriggered(..., engine.RootEntity)` does the exact same thing because `RootEntity` is `0` and the SDK's `if (entity)` guard is falsy for it. The suppression itself always worked once measured correctly — see the third-run resolution in `MCP_SHOWCASE_RESULTS.md` |
| Jog was classified `bucket=run` | the classifier used peak per-frame speed (spiky); it now uses a smoothed sustained speed and logs distance/duration/avg/sustained |
| Zone B's `disableRun` was unmeasurable | the zone is a 9m corridor instead of a 4m pad, so a 1s run burst stays inside past the acceleration ramp |
| S1 readout board never rendered | it sat directly above the spawn point — behind the camera from every viewpoint the lane is walked from; it is now at the far end of the lane |

Still true and by design (not defects): a blocked click never reaches the scene, so the scene
cannot count it (`occluded blocked: 0` on the S4 readout is correct — the block is only visible
in the tool result); and the third-person pitch clamp is a rig limit, now reported rather than
hidden.

---

## What changed after the second live run (2026-08-28)

The second run confirmed nine of the eleven fixes and found two failures plus four scene
defects. The third run (same date) then verified everything below in-world **except the
suppression row, which kept failing until the measurement itself was fixed** — see "What
changed after the third live run" at the bottom.

**Explorer fixes** (branch `feat/synthetic-input-simulation`):

| Failure in the run | Fix |
|---|---|
| An entity-bound edge appeared not to suppress the scene-root broadcast (S6 board: both counters incremented; every S4 click also seemed to broadcast `IA_POINTER`) — later traced to the measurement, see the third-run section | suppression used to be decided at consumption time: `WritePointerEventResultsSystem` skipped **all** global entries whenever any entity-bound write happened in the same scene update, which both mis-scoped the suppression (per-frame-all-or-nothing) and depended on the scene draining both buffers in the same update. It is now decided at production time: `ProcessPointerEventsSystem` removes an action edge from the global broadcast buffer the moment it lands entity-bound, so no consumer timing can resurrect it. Covered by new `ProcessPointerEventsSystemShould` EditMode tests (synthetic edge, real key press, no-hover control) |
| Scene UI received `PetDown` but never `PetUp` (`ui_drag` release, and `ui_click` on a `PetUp`-only element) | `UITransformComponent.PointerEventTriggered` is a single slot drained by a throttled scene system, and the simulator sent `PointerUpEvent` and `PointerLeaveEvent` in the same frame — the leave overwrote the release before the scene read it. Every event now waits for the slot to drain before the next is sent (enter → down → up → leave), and an unconsumed release makes the tool **fail** instead of reporting the delivery it only intended |

**Scene fixes:**

| Defect in the run | Fix |
|---|---|
| A 2s jog read `bucket=run` (`sustainedSpeed=8.22`) | the EMA converges on the gait's true top speed as the burst lengthens; the jog/run boundary moved to 9 m/s — between a long jog (~8.2) and a short run (~9.8) |
| `move_to` teleports logged as superhuman locomotion bursts (`avgSpeed=320m/s`) | a single-frame displacement above 20 m/s is logged as `teleport detected ... ignored` and excluded from bursts |
| A `move_to` from zone B into zone A delivered `enter(A)` before `exit(B)` and the stale exit wiped the modifier | the handlers no longer write the `InputModifier` directly; every event recomputes it from current zone occupancy, so event order is irrelevant |
| The S2 platform trigger counted mid-air fly-throughs as arrivals | an arrival now requires ~0.4s of dwell inside the trigger; a pass-through logs `platform fly-through ... not counted` |

**Script corrections applied above:** S2 step 1 recipe is `kind: jog, seconds: 0.5` from
z 2406.5 (a 1s run overshoots the platform); S7 step 4 uses `set_camera_mode first_person` as
the primary MARKER-U recipe (the back-off path stalls at `aimErrorDegrees: 18`); S1 step 3
judges gait by `sustainedSpeed` and distance, not the `bucket=` label alone; S3 step 4 notes
the reversed `enter`/`exit` order a teleport produces.

---

## What changed after the third live run (2026-08-28)

The third run verified all six second-run fixes except suppression, which "failed" a third
time. Instrumenting the Explorer's broadcast buffer settled it: the client wrote **zero**
scene-root results for aimed presses — the suppression works — and the failure was the
scene's measurement all along. `isTriggered(action, type, engine.RootEntity)` never reads
the root: `RootEntity` is `0` and the SDK's `if (entity)` guard (JS falsy zero) routes it to
the same all-entities scan as passing no entity (`@dcl/ecs` `engine/input.js`; worth filing
upstream in js-sdk-toolchain). The station now reads
`PointerEventsResult.get(engine.RootEntity)` directly with a timestamp watermark, and the S6
matrix passes live: unaimed → root +1; aimed by `x/y/z` and by `entityId` → entity +1, root
unchanged.

Script drift the third run reported, folded in here rather than editing every step: S6's
logs read `... scene-root broadcast -- count now N` (not `global press`); the S8 panel
renders centered, not top-left; S2 step 2's blocked distance measures ~0.12 m; S7 MARKER-L
can return `aimErrorDegrees` ~5-6 in third person yet still enter the 8° aim cone (the
refiner can stall short of the clamp on close-range elevated aims — an open, cosmetic
Explorer nit). And a driving essential: **`ui_list`'s `screenRect` is in native
backing-store pixels** (~3424x1926 on a Retina display), not screenshot pixels — normalize
`ui_drag`/`click_at` coordinates by the native size derived from the rects.

> **Superseded on 2026-09-01.** You no longer derive the native size from the rects: `ui_list`
> and every `ui_click`/`ui_scroll`/`ui_set_text` result now state it outright as
> `screen: {width, height}`, and every listed element carries a ready-made normalized
> `center`. Pass the `center` verbatim; only normalize by hand for a point that is not an
> element centre, and then against the space you read it from (`screen` for a `screenRect`
> point, the screenshot's own size for a point picked off a screenshot). A `screenshot`
> caption states the screen size too, as `1280x720 (screen 2087x1174)`.

---

## Scene expansion (2026-08-31): S9 and S10

Two cases were added to the script; nothing above S9 changed except the coordinate rebase noted
at the top of this document.

- **S9 -- UI text entry.** S8 already showed that `ui_set_text` reaches *an* `<Input />`; S9 is
  about the text surviving the round trip. Five fields separate the properties a single field
  conflates: uncontrolled vs. controlled (`value` prop), change vs. submit, a `disabled` field
  that must refuse the write, and a two-field form whose values are read by a later `ui_click`
  rather than by the write itself.
- **S10 -- Paint surface.** Ported from the `0,5-primary-cursor-info` reference scene, split into
  the two paths the synthetic-input layer can reach a world surface with: discrete clicks
  (`pointerEventsSystem.onPointerDown`, painting at the event's own `hit.position`) and a held,
  sweeping pointer (`PrimaryPointerInfo.worldRayDirection` + `raycastSystem`). The stroke path is
  the interesting one, because it is the only case in this scene that needs `IA_POINTER` to stay
  **down across several frames** -- the station reports the single-dot outcome explicitly instead
  of letting a press+release inside one drain window pass as a short stroke.

**Scene-side notes for whoever drives this next:**

- Both UI stations render through **one** `ReactEcsRenderer` root (`src/stations/ui_root.tsx`) --
  `setUiRenderer` may only be called once per scene. S8's panel is centered, S9's is
  left-anchored, and a bottom-left status bar names which are open so a screenshot always says.
  The panels must not overlap: an overlap would make `ui_click`'s occlusion pre-check report one
  station's panel as a cover over the other's element, which is exactly the false positive the
  first live run spent time on.
- The paint dot pool is capped at **40** spheres and recycles oldest-first. A DCL sphere
  primitive is 804 triangles (`SphereFactory`, 24x16 UV sphere) against a 2x2 scene's 40,000
  budget, so an uncapped painter would exceed it in about a minute of dragging.
- S10 arms its held-pointer flag from a pointer-down **on the stroke canvas** or from an
  `IA_POINTER` **scene-root broadcast**, read from `PointerEventsResult.get(engine.RootEntity)`
  with a timestamp watermark (2026-09-02). It used to arm from the entity-less
  `inputSystem.isTriggered`, which was wrong twice over: that call cannot see the root at all
  (the falsy-zero trap S6 documents), and it scans every entity's results, so clicks at S4/S8
  opened phantom strokes — S10's counters were untrustworthy in any pass that also drove those
  stations. A stroke still only becomes *active* once a sample lands on the canvas, and a held
  pointer whose release never arrives is force-ended after 6 seconds so the station cannot paint
  forever.

---

## What changed after the fourth live run (2026-09-01)

The first full-script pass since S9/S10 were added, and the first against the `screen`/`center`
fields. Details and evidence in `MCP_SHOWCASE_RESULTS.md`; the deltas that change how you drive
the script are folded into the steps above.

**Driving changes:** `ui_list` and every semantic UI result now carry `screen: {width, height}`
and a normalized `center` per element -- pass `center` verbatim to `ui_drag` and stop deriving a
native size from `screenRect` (S8 step 8, and the superseding note under the third run).
`screenshot` captions state `(screen WxH)`. `click_at` fed an element's `center` resolves to
exactly that element's `crdtId` but still refuses to *activate* UI (`blockedByUi`) -- use
`ui_click`; that boundary is intended, not a regression.

**Coordinate correction:** S1 step 1 cited the readout at world `(2388, 3.6, 2385)`, its position
before it was moved to the far end of the lane. It is `(2388, 3.6, 2401.5)`. This was the one
coordinate the 2026-08-31 rebase missed; everything else in the tables verified against the
`[INIT] MARK` lines.

**Open defects this run found** (nothing above is written around them -- the steps still describe
what *should* happen):

| Where | Defect |
|---|---|
| S1 step 3, S3 steps 5-6 | `JOG_MAX_MS = 9` (`src/stations/s1_locomotion.ts`) is calibrated to 2026-08-28 client speeds. This client sustains jog **10.2** and run **12.7** m/s, so every long jog reports `bucket=run`. Distances and sustained speeds are correct -- only the label is wrong. Judge by `sustainedSpeed`, as step 3 already says, until the pair is recalibrated |
| S9 step 7 | **A `disabled: true` `<Input />` accepted a synthetic write.** `ui_set_text` returned `ok: true`, `onChange` fired, and the panel's line 4 went red with `[S9-TEXT] DISABLED FIELD ACCEPTED A WRITE`. The station calls this a client defect and it is: the write path does not check `disabled` |
| S9 step 8 | S9's `SUBMIT FORM` / `CLEAR FIELDS` buttons sit under the client chat panel's **invisible** message viewport, so `ui_click` fails with `blockedBy: ".../ChatMessages/Viewport"`. `force: true` completes the step. Same class of false positive as the panel-host cover fixed after the first run -- a transparent client container counted as a cover |
| S9 step 9 | After `CLEAR FIELDS` sets the scene's state back, the **controlled** field 2 still displays the old text on screen (`replaced:`/`still the seed value` label flips correctly, the `<Input>` does not). A programmatic `value` change does not reach a field the client has taken ownership of |
| S10 steps 3-4 | The STROKE path could not be driven at all in this run. Believed resolved 2026-09-02 on both sides (the client gained `sweep_pointer`, and the station now arms from the stroke canvas's own pointer-down or the scene-root broadcast) — but the fifth run found **only the arming half fixed**; the sampler still never fires. **Still open**, see the fifth-run section. Steps 2, 5 and 6 always passed |

**Confirmed still working:** every 08-28 fix held. S6's suppression matrix passes (board:
`scene-root PRIMARY: 1  entity PRIMARY: 2`), and it is independently corroborated from S4 --
seven entity-bound clicks produced **zero** `IA_POINTER` scene-root broadcasts while the three
clicks that failed to bind produced exactly the three the board counted. S5's Hover C reads
`1/1`. `ui_click` on an uncovered SDK element needs no `force`; a covered one still fails.
S7 MARKER-L returned `aimErrorDegrees: 0.6` (the ~5-6 nit did not reproduce) and the
third-person pitch clamp reported `33.8` + a warning on MARKER-U, stopping at exactly -53.56 deg.

**One more driving essential:** `crdtId`s are **not stable across a panel toggle**. Closing and
reopening S8's panel moved its ids from `598/599/600/...` to `66172/66133/66137/...` -- the React
reconciler recreated the entities and the packed id now carries the entity *version* in its high
16 bits (`66165 = (1 << 16) | 629`). Re-run `ui_list` after every open/close; never cache ids
across one.

---

## What changed after the fifth live run (2026-09-02)

The first pass against `sweep_pointer` and the first with the `disabled`-input check. Full evidence
in `MCP_SHOWCASE_RESULTS.md`. Client screen this run was `2017x1135` (the window was a different
size than run 4's `2087x1174` — nothing depends on the absolute numbers, only on their agreement).

**All five pre-flight checks passed**, with one clarification: a `center` fed to `click_at` resolves
to exactly that element's `crdtId` (verified twice, on two different buttons), and `click_at` still
does not *activate* scene UI — `ui_click` does. That boundary is intended; check 2 is about the
round trip being exact, not about activation.

**Driving changes folded into the steps above:**

- **`press_input` action names are lowercase.** `action: PRIMARY` is rejected outright
  (`"action is required (e.g. primary, secondary, action_3)"`). Every `press_input` in this document
  was written uppercase and would have failed as written; all are now lowercase.
- **S6 note 1 was wrong for four runs and is rewritten.** An unaimed `press_input` *can* land
  entity-bound — it binds to whatever `PointerEvents` entity the free reticle rests over, and then
  suppresses the scene-root broadcast you were trying to count. Clear the reticle (aim at geometry
  with no `PointerEvents`) before every unaimed press.
- **S3 step 3 is 0.7s, not 2s** — zone B's north end is the parcel boundary and a 2s escape run
  leaves the scene entirely.
- **S3 steps 5-6 are 0.8s, not 1s**, and step 6 now takes a *jog* control as well as a run control;
  the jog control is what makes the degradation unambiguous while `JOG_MAX_MS` stays miscalibrated.
- **S7 step 5's pitch sign was backwards** — looking down is a positive Euler `x` here.

**Fixed since run 4:** the `disabled: true` `<Input />` now refuses `ui_set_text`
(`"the input is disabled (PBUiInput.disabled); a user could not type into it"`), on the plain and
`submit:true` paths both, and `ui_list` reports `"disabled": true` on the element.

**Still open from run 4:** `JOG_MAX_MS = 9` (now pinned tighter — the degraded in-zone run measures
9.11 m/s, 0.11 above the threshold); the chat panel's invisible `ChatMessages/Viewport` still covers
S9's form buttons (`force: true` still needed, though the failure message is now much clearer); a
programmatic `value` change still does not reach a client-owned `<Input />` (seen on three fields
this run, not just field 2).

**S10 steps 3-4 are still open — the STROKE path remains undrivable.** The arming half is fixed and
fires from all three documented sources, but the sampler never runs. Four gestures were tried
(`sweep_pointer` aimed at the canvas in third person, again square-on to the canvas, again in first
person, and the split `press_input action:pointer holdSeconds` + concurrent `camera_look`); every
one logged `IA_POINTER held`, and none produced a single sample. The decisive measurement is the
readout's `off-canvas samples (decoy / miss)` counter staying at **0** — a misdirected ray would
have incremented it, so no sample was taken at all. `PrimaryPointerInfo.worldRayDirection` is never
populated for a synthetic held pointer (`cursorState: Free`, `pointerLocked: false` in every result,
first person included), and the station's `if (!direction) return` exits silently without touching a
counter. Two follow-ups, different owners: the client needs to populate that component for a
synthetic pointer (turning the camera is not enough — the scene samples the *pointer* ray, not the
camera transform), and the station should count or log the `!direction` branch so this is
diagnosable in one gesture instead of four.

**Other new findings:** run-speed frames are false-flagged
`teleport detected (0.6-0.7m in one frame)` and chopped out of S1's bursts, so the *logged* distance
undercounts the tool's (12.95 m vs 16.92 m) — trust the tool result; failed S4 clicks still emit
root `IA_POINTER` broadcasts that arm phantom S10 strokes, so keep a `RESET ALL` between S4 and S10;
`ui_set_text ... submit:true` intermittently submits the field's *placeholder* with `ok:true`
(passed on retry); a `.0`-suffixed float coordinate is rejected (`x: 2394.0` fails, `x: 2394` works);
`ui_drag path:"device"` returns a bare `ok` with no `info`/`screenRect`/`center`; and run 3's
MARKER-L "5-6 deg" nit reproduced and is symmetric (L 6.0, R 5.9), both still inside the 8 deg cone.

**Coordinates: every world coordinate in this document verified correct.** All station tables were
checked against the `[INIT] MARK` lines and every aim point resolved to the intended entity
(`crdtEntityId` cross-referenced against the `[INIT]` id map). No coordinate changes were needed —
run 4's S1-readout correction to `(2388, 3.6, 2401.5)` is right as it stands.

---

## What changed after the sixth live run (2026-09-03)

Scope: the **Pre-flight (all five checks) + S10 only**, run as a regression against the
still-open STROKE defect. S1-S9 were not re-run. Full evidence in `MCP_SHOWCASE_RESULTS.md`.
Client screen this run was `2190x1232`.

**All five pre-flight checks passed**, with no caveats. `ui_list`'s `center` values are exact to
the reported precision (`598` -> `801/2190 = 0.365753` vs `0.3658`); a `center` fed to `click_at`
named that element's own `crdtId` on two different buttons and produced no scene log, while
`ui_click` on the same id logged the click; `ui_drag` between two `center`s returned `path: "sdk"`
on the first try with both log lines; the triple appears on `ui_click`/`ui_scroll`/`ui_set_text`
results including a `blockedBy` failure; and `screenshot` captioned `1280x720 (screen 2190x1232)`
and `640x360 (screen 2190x1232)`, matching `ui_list` exactly.

**Coordinates: no correction needed.** Every world coordinate used by the Pre-flight and S10 was
re-verified against the `[INIT] MARK` lines and `src/constants.ts`, and each was additionally
confirmed by a `hit: true` `click_entity` returning the expected `crdtEntityId` and `hoverText`.

### S10 steps 3-4 are FIXED -- the STROKE path is drivable

Open since run 4 and undrivable in run 5; this run it works, via `sweep_pointer`:

```
[S10-PAINT] IA_POINTER held (pointer-down on the stroke canvas) -- sweeping the ray until it is released
[S10-PAINT] STROKE #1 started at local (13.91, 2.20, 8.83)
[S10-PAINT] STROKE #1 ended -- 14 dots over 1.88m of surface (0 samples landed off the canvas)
```

Step 4's negative case passes too: three logged `stroke sample left the canvas (hit entityId 591)`
lines naming exactly the DECOY strip, `5 samples landed off the canvas` in the stroke-end line,
and **no spheres on the red strip** in the screenshot. Steps 1, 2, 5 and 6 pass as before -- the
pool cap logged once at 40, `live dots` stuck at `40/40` while `recycles` climbed 2 -> 6, and the
original stamp diagonal visibly recycled into the newest positions.

### Driving changes folded into the steps above

- **The "split gesture" is not equivalent to `sweep_pointer`** and step 3's blockquote no longer
  says it is. Both halves arm the station and both sample a real ray; neither paints a stroke.
  Only `sweep_pointer` drags the parked pointer as the camera turns.
- **Never write a coordinate with a trailing `.0`.** `click_entity x:2393 y:3.0 z:2393` fails with
  `"Provide entityId, or a full x/y/z world aim point, or both."` -- the argument is treated as
  absent. `y: 3` and `y: 2.1` both work.
  **Update 2026-09-03:** the client now names the offender, so the error is diagnosable:
  `"Provide entityId, or a full x/y/z world aim point, or both. (y arrived as string \"3.0\", not
  a number)"`. The leading sentence still points at the wrong cause, but the parenthetical tells
  you it was a *type* problem, not a missing argument. Also established: from Claude Code the trap
  is **unreachable through the native MCP tools** -- the tool-call serializer normalizes `3.0` to
  `3` and coerces a quoted `"3.0"` before it leaves, so all three attempts arrived as the number
  `3` and hit. It had to be sent as a raw JSON-RPC request to reproduce. It remains a hazard for
  clients whose serializer preserves the literal.

### Scene bugs found this run -- all three FIXED and re-verified in-world

| Where | Bug | Fix |
|---|---|---|
| `s10_paint.ts` raycast callback | **A late raycast callback opened a phantom stroke.** Seen once in four sweeps (a race): `STROKE #4 started` appeared with no `IA_POINTER held` line before it, because the callback's on-canvas branch checked only `strokeActive`, never `pointerHeld`. It painted one unbounded dot, left the stroke open, and the *next* gesture was silently merged into it -- no `started` line, and `STROKE #4 ended -- 11 dots over 3.01m` while only 10 were painted | `if (!pointerHeld) return` at the top of the callback. Four post-fix sweeps produced four clean `started`/`ended` pairs and the arithmetic reconciles exactly (16+13+14 = 43 = `STROKE dots`, 43-40 = 3 recycles) |
| `s10_paint.ts` sampler | **The `if (!direction) return` branch was silent** (run 5's open follow-up), so "no ray at all" and "the ray missed" were indistinguishable | Counted as `counters.s10NoDirectionSamples`, shown on the readout as `no-ray samples`, and summarised once per hold. It immediately **disproved the run-4/5 diagnosis** on its first use |
| `s10_paint.ts` stroke-end | **The single-dot diagnostic blamed the wrong cause.** A held pointer whose ray never moved was reported as "the pointer was not held across frames", which is false and points the next run at the wrong bug | Branch on the hold's sample count: 25 samples now report `the ray never moved ... stayed parked where it was pressed` |

### Client defects this run found

| Where | Defect |
|---|---|
| S10 step 3, alternative gesture | The `press_input` hold path never gets a *swept* ray. `worldRayDirection` **is** populated (the run-4/5 theory that it is never written is disproved -- `no-ray samples` reads `0`), but an unaimed press parks the pointer off the canvas and an aimed one parks a ray that is not re-derived as `camera_look` turns the view. Client-side; only the `sweep_pointer` half of the run-4/5 defect was fixed |

**Not re-tested this run** (out of scope, still open from run 4): `JOG_MAX_MS = 9` miscalibration,
the chat `ChatMessages/Viewport` cover on S9's form buttons, and the programmatic `value` that does
not reach a client-owned `<Input />`.

---

## What changed after the seventh live run (2026-09-03)

Scope: **a full pass -- Pre-flight (all five checks) + S1-S10**, the first since the fifth run for
S1-S9. Plus three build changes never exercised in-world and the open overlap measurement. Full
evidence in `MCP_SHOWCASE_RESULTS.md`. Client screen this run was `2188x1231`.

**All five pre-flight checks passed** with no caveats, and **all ten stations passed** every step.
Zero errors in the scene log buffer (seq 0..409) for the whole session.

### The overlap question is settled -- and it withdraws a client defect

An aimed `press_input ... holdSeconds: 2` issued together with a `camera_look deltaX: 4 seconds: 2`
does **not** overlap it: **MCP tool calls are serialised by the server.** Measured with a detached
out-of-band yaw poller, the hold ran with yaw pinned at `29.73` for its entire duration and the
turn began 2.4s *after* the hold ended. Yaw before the hold: **29.73**. Yaw for the whole hold,
including the moment `press_input` returned: **29.73** (it reached 53.85 only once `camera_look`
subsequently ran).

So run 6's client defect -- *"an aimed press parks a ray that is not re-derived as `camera_look`
turns the view"* -- is **withdrawn**: it assumed an overlap that never happened. The split gesture
cannot test ray re-derivation at all. S10 step 3's blockquote is rewritten accordingly, including
how to measure overlap properly (a naive before/after yaw read gives the opposite answer).

### Build changes verified

- **Numeric-argument errors now name what arrived** -- `(y arrived as string "3.0", not a number)`.
  See the corrected sixth-run `.0` note: from Claude Code this is only reachable via raw JSON-RPC,
  because the harness normalizes `3.0` to `3`.
- **`press_input` refuses a half-readable x/y/z aim** instead of degrading to a scene-root
  broadcast: `"x, y and z must all be numbers to aim the press; omit all three for a scene-root
  broadcast."`, with no root-broadcast log. Added to the negative-case summary.
- **Pointer parking / cursor-pipeline `PrimaryPointerInfo`** was probed across S4, S5, S6 and S10:
  no misaim, no mistimed hover, no readout disagreement. `click_at 0.5,0.5` landed on the centred
  target's face; eight aimed stamps each hit within 0.04m of their aim point; every hover leave
  landed exactly at the end of its requested hold; `sweep_pointer` dragged the parked pointer for a
  real 15-dot stroke.

### Driving changes folded into the steps above

- **S1 step 3 is `seconds: 1.2`, not 2** -- the ~17.5m lane cannot contain a 2s jog (~20m) or run
  (~25m), and both bursts end clipped against the wall, voiding the comparison.
- **S3 step 6's controls are taken southward from `(2402, 0, 2412)`** -- the old northward control
  from `(2400, 0, 2407.5)` carries the player off the scene's north edge at 0.8s of run.
- **S6 note 1's reticle-clearing recipe is replaced.** `look_at` geometry with no `PointerEvents`
  does **not** clear the reticle: the S1 end wall at 1m still let an unaimed `press_input` bind to
  the RESET button **15.87m away**. Pitch into open sky with `camera_look deltaY: 8 seconds: 1.5`
  instead -- 4/4 this run.
- **S2 step 3's expected log wording corrected** to `IA_JUMP scene-root broadcast` (the doc said
  `IA_JUMP global press` for six runs; the scene never logged that).
- **`bucket=` is now useless for every pair, not just the jog/run boundary** -- see below.

### Still open (unchanged owners)

| Where | Defect | Status |
|---|---|---|
| S1 step 3, S3 steps 5-6 | `JOG_MAX_MS = 9` miscalibrated | **Still open, and worse.** The *free jog control* now measures 9.08 and labels `bucket=run`, so the threshold sits below the jog tier itself and the label separates nothing. Speeds remain perfectly diagnostic: in-zone degraded run 9.11, free jog 9.08, free run 11.16 |
| S9 step 8 | Chat `ChatMessages/Viewport` covers S9's form buttons; `force: true` completes the step | **Still open.** New detail: the transparent cover reaches normalized `y 0.5366` (mid-screen), higher than the lower-left block the tooling docs describe |
| S9 step 9 | A programmatic `value` does not reach a client-owned `<Input />` | **Still open**, on all three controlled fields. Refined: controlled fields display a *write* correctly and only fail to follow a programmatic *reset*; uncontrolled fields never display the write at all (their boxes read empty while the scene's `read back:` shows the value) |

**Minor, unresolved:** `ui_drag path:"device"` still returns no `screenRect`/`center`/`info` (it
does now carry `screen`); S7's `look_at aimErrorDegrees` (0.6) vs the station's own marker angle
(7.5) diverged further against an 8 deg cone -- benign third-person orbit-boom offset, but worth
widening the cone if it keeps drifting.

**Coordinates: no corrections needed.** Every coordinate used by the pre-flight and all ten
stations was re-verified against the `[INIT] MARK` lines and confirmed by a `hit: true` returning
the expected `crdtEntityId` and `hoverText` (581, 582, 584, 542, 543, 544, 545, 548, 549, 555, 556,
559, 562, 563, 564, 571, 589, 590, 591, 592).
