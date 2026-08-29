# MCP_SHOWCASE.md -- driving script for `synthetic-input-showcase`

This is the script for the session that connects an agent to unity-explorer's embedded MCP
server and drives this scene live in front of the user. Read this top to bottom; each station
is self-contained and can be run independently and re-run at any time (see **Reset**, below).

**World coordinates** used below already include the scene's world offset
`(2384, 0, 2384)` (base parcel `149,149`). Local coordinates (what the scene code and its
`[INIT]` logs use) are always `world - (2384, 0, 2384)`.

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

## Reset (use between passes, not required before the first one)

Click the world **RESET ALL STATIONS** button at world `(563, 1, 336)`:

```
click_entity  x: 563  y: 1  z: 336
```

Expected result: `hit: true`. Expected log: `[RESET] reset #1 requested ...` then
`[RESET] reset #1 complete -- all counters zeroed, all InputModifiers cleared`. Every counter
shown in every station's readout board goes back to its initial value, and any active
`InputModifier` is cleared -- confirm with a screenshot of any readout board.

---

## S1 -- Locomotion lane

Proves: **(1)** real locomotion pipeline, collisions, speed-by-`kind`. **(3)** `walk` does not
emit `IA_FORWARD`.

1. Face north (default spawn orientation already does this) and check the S1 readout board at
   world `(548, 3.6, 321)`.
2. Walk 4m north at `walk` speed:
   ```
   walk  directionX: 0  directionY: 1  seconds: 3  kind: walk
   ```
   Expected result: `distance` well under the `seconds * speed` ceiling for a fast gait --
   this is the slowest bucket (~1.5 m/s per `AvatarLocomotionSettings` defaults).
   Expected log: `[S1-LOCOMOTION] burst finished: distance=...m avgSpeed=...m/s sustainedSpeed=...m/s bucket=walk`.
   Expected screenshot: the player should be near the "4m" floor marker (world `(548, 0.05, 325)`)
   or short of it.
3. Repeat with `kind: jog` then `kind: run`, each `seconds: 2`, and compare `distance` in the
   three tool results and the three `bucket=` log lines -- `run` should cover visibly more
   ground per second than `jog`, which covers more than `walk`. **Judge by `sustainedSpeed` and
   distance first, `bucket=` second**: the sustained estimate climbs with burst duration (a 0.5s
   jog reads ~5.5 m/s, a 2s jog ~8.2 m/s), so the jog/run boundary sits at 9 m/s — between a
   long jog (~8.2) and a short run (~9.8). A `move_to` between bursts logs a
   `teleport detected ... ignored` line instead of a phantom superhuman burst.
4. Walk all the way into the end wall:
   ```
   walk  directionX: 0  directionY: 1  seconds: 6  kind: run
   ```
   Expected result: `endPosition` stops at/near world z `338.5` (the wall face) even though
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
   press_input  action: FORWARD
   ```
   Screenshot the S1 (or S6) readout again: `global IA_FORWARD count: 1` -- proves divergence
   **(3)**: only `press_input FORWARD` increments the SDK input-action counter; `walk` never
   does, even though both move-shaped inputs exist.

---

## S2 -- Jump / vertical

Proves: **(1)**/(2) jump-gated movement via the real pipeline, contrasted with the global
`IA_JUMP` action.

1. Stand ~2.5m south of the platform (`move_to` world `(548, 0, 342.5)`) and jump onto it in one
   call (platform top is at world y=1.2, the platform sits at world `(548, 0.6, 345)`):
   ```
   walk  directionX: 0  directionY: 1  seconds: 0.5  kind: jog  jump: true
   ```
   **Timing matters** (measured live): at `kind: run` even 1s covers ~7m and the arc sails clean
   over the 3m platform (it landed at z 350.55); `kind: jog, seconds: 0.5` from z 342.5 lands on
   top.
   Expected result: `endPosition.y` ~1.28 (up from ~0.08).
   Expected log: `[S2-JUMP] platform arrival #1 -- reached via walk(..., jump:true)`.
   An arrival is counted only after the player has stayed in the trigger for ~0.4s — a jump arc
   that overshoots through the volume logs `platform fly-through ... not counted` instead.
   Expected screenshot: player standing on the raised platform; the pressure plate
   (world `(548, 1.25, 345)`) should have changed from grey to green.
2. Try the same approach **without** `jump: true` from the base of the platform -- the player
   should not mount it (1.2m is taller than the avatar's step-over height), demonstrating the
   platform really requires the jump flag, not just proximity.
3. Walk to the ground-level jump mark at world `(548, 0.05, 349)` and:
   ```
   press_input  action: JUMP
   ```
   Expected log: a `[S6-GLOBAL] IA_JUMP global press -- count now N` line (S6's board), and the
   S2 readout board (world `(548, 3.6, 340)`) updates its `global IA_JUMP presses:` line to
   match. This is the "jump action event" side of the contrast: it does **not** move the
   player onto the platform, only `walk(..., jump:true)` does.

---

## S3 -- Freeze zone (`InputModifier`)

Proves: **(2)** InputModifier applies to `walk` exactly like WASD; `ignoreInputModifiers`
escapes it; the run-only sub-zone shows the degrade-through-fallback case.

1. Walk from the lane entrance into zone A (world center `(555, 0.05, 340)`, spans world
   x `553..557`, z `338..342`):
   ```
   walk  directionX: 0  directionY: 1  seconds: 2  kind: run
   ```
   (aim the strafe/forward axes so the path crosses x≈555, or issue a small `directionX`
   correction first if you overshot the lane).
   Expected log: `[S3-FREEZE] zone A entered (#1) -- InputModifier disableAll+disableJump applied`.
   Screenshot: the S3 readout at world `(555, 3, 343)` shows `modifier: zone A: disableAll + disableJump`.
2. While standing in zone A, try to walk further:
   ```
   walk  directionX: 0  directionY: 1  seconds: 2  kind: run
   ```
   Expected result: `distance` ~0 -- the freeze applies to `walk` exactly as it would to WASD.
3. Now escape it:
   ```
   walk  directionX: 0  directionY: 1  seconds: 2  kind: run  ignoreInputModifiers: true
   ```
   Expected result: `distance` > 0 again -- `ignoreInputModifiers` bypassed the scene's lock.
4. Walk out of zone A (south, back the way you came) and confirm the log
   `[S3-FREEZE] zone A exited`, then `move_to` the zone B entry mark at
   world `(555, 0, 343.5)` and walk north into the zone (a 9m corridor, world z `343..352`).
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
   same as a control burst outside it):
   ```
   walk  directionX: 0  directionY: 1  seconds: 1  kind: run
   ```
   Expected log (S1's classifier reports the sustained speed):
   `[S1-LOCOMOTION] burst finished: ... sustainedSpeed=~7.9m/s bucket=jog` — the run request was
   degraded to a jog.
6. Control: leave the zone (`move_to` world `(560, 0, 343.5)`, outside the corridor) and repeat
   the identical burst. Expected: `sustainedSpeed` ~9.8-10.5m/s, `bucket=run`. The two sustained
   speeds are the proof; a distance comparison over a short burst is not (both are ~1.7m).
7. Also confirm `kind: walk` inside the zone is untouched (`bucket=walk`), i.e. the lock degrades
   the run tier only.

---

## S4 -- Click targets

Proves: **(4)** real camera-origin raycast (occlusion + `maxDistance`), **(5)** click = down
then up on consecutive ticks, hold semantics via separate down/up calls.

All eight targets and marks (world coordinates):

| Target/mark | World position | Notes |
|---|---|---|
| Plain down/up button | `(562, 1, 323)` | logs DOWN then UP separately |
| Hold-to-charge target | `(564.5, 1, 323)` | down starts charge, up commits |
| Short-range target | `(567, 1, 323)` | `maxDistance: 3` |
| Long-range target | `(569.5, 1, 323)` | `maxDistance: 16` |
| Secondary-button target | `(572, 1, 323)` | bound to `button: secondary` |
| Far mark | `(568.25, 0, 335)` | ~12m from both short/long targets |
| Blocked-shot mark | `(561, 0, 322)` | south of the occluder |
| Occluder box | `(561, 1, 326)` | blocks the blocked-shot line only |
| Occluded target | `(561, 1, 330)` | behind the occluder from the south |
| Clear-shot mark | `(564.5, 0, 330)` | side approach, same target, no occluder in the way |
| Offset pivot (NO collider) | `(570, 1, 333)` | do not aim here |
| Offset target's actual collider | `(571.2, 1.3, 332.4)` | aim here instead |
| Big click_at target | `(574, 1.5, 333)` | large box for screen-space aiming |
| Big-target stand mark | `(574, 0, 329)` | 4m south of the big target |

1. **Down/up ordering (5):**
   ```
   click_entity  x: 562  y: 1  z: 323  eventType: down
   ```
   Expected log: `[S4-CLICK] plain button DOWN at frame N`. Then:
   ```
   click_entity  x: 562  y: 1  z: 323  eventType: up
   ```
   Expected log: `[S4-CLICK] plain button UP at frame N+k (click #1 complete)` -- the UP frame
   is strictly later than the DOWN frame, proving down-then-up-on-a-later-tick.
   ```
   click_entity  x: 562  y: 1  z: 323
   ```
   (default `eventType: click`) does both legs in one call -- confirm `[S4-CLICK] ... UP ...
   (click #2 complete)` appears with only one tool call this time.

2. **Hold-to-charge (5, hold semantics):**
   ```
   click_entity  x: 564.5  y: 1  z: 323  eventType: down
   ```
   Wait ~2 seconds (do something else, e.g. read a log), then:
   ```
   click_entity  x: 564.5  y: 1  z: 323  eventType: up
   ```
   Expected log: `[S4-CLICK] charge target UP at frame N -- commit #1, held ~2000ms`. Screenshot
   partway through the hold to see the box ramp from grey toward yellow.

3. **maxDistance gating (4):** stand at the far mark `(568.25, 0, 335)` (use `walk` to get
   there, then `look_at` each target in turn):
   ```
   look_at  x: 567  y: 1  z: 323
   click_entity  x: 567  y: 1  z: 323
   ```
   Expected result: `hit: false` (or a miss reason) -- the far mark is ~12m from the
   short-range target, past its `maxDistance: 3`. No `[S4-CLICK]` hit log appears for it.
   ```
   look_at  x: 569.5  y: 1  z: 323
   click_entity  x: 569.5  y: 1  z: 323
   ```
   Expected result: `hit: true`. Expected log: `[S4-CLICK] long-range target hit #1`.

4. **Occlusion (4):** stand at the blocked-shot mark `(561, 0, 322)`:
   ```
   look_at  x: 561  y: 1  z: 330
   click_entity  x: 561  y: 1  z: 330
   ```
   Expected result: `hit: false`, with `blockedByEntityId`/`blockedByCrdtId`/`blockedByCollider`
   populated (the occluder box). No `[S4-CLICK]` hit log for the occluded target.
   Now walk to the clear-shot mark `(564.5, 0, 330)` and repeat:
   ```
   look_at  x: 561  y: 1  z: 330
   click_entity  x: 561  y: 1  z: 330
   ```
   Expected result: `hit: true`. Expected log: `[S4-CLICK] occluded target hit #1 (clear line of sight)`.

5. **Offset collider (explicit x/y/z):**
   ```
   click_entity  x: 570  y: 1  z: 333
   ```
   Expected result: `hit: false` -- the pivot has no collider at all.
   ```
   click_entity  x: 571.2  y: 1.3  z: 332.4
   ```
   Expected result: `hit: true`. Expected log: `[S4-CLICK] offset target hit #1`.

6. **click_at (screen-space):** walk to `(574, 0, 329)`, then:
   ```
   look_at  x: 574  y: 1.5  z: 333
   ```
   Take a screenshot -- the big target should now be roughly centered. Then:
   ```
   click_at  x: 0.5  y: 0.5
   ```
   Expected result: `hit: true` on the big target. Expected log:
   `[S4-CLICK] big target hit #1 (click_at)`.

7. **Secondary button:**
   ```
   click_entity  x: 572  y: 1  z: 323  button: secondary
   ```
   Expected log: `[S4-CLICK] secondary-button target hit #1`.

---

## S5 -- Hover

Proves: **(6)** real `PET_HOVER_ENTER`/`PET_HOVER_LEAVE` + `hoverText`, distance-gated hover.

| Target | World position | Notes |
|---|---|---|
| Hover A | `(564, 1, 339)` | short hover text |
| Hover B | `(568, 1, 339)` | long hover text |
| Hover C | `(572, 1, 339)` | `maxDistance: 2` |
| Hover C near mark | `(572, 0, 337.5)` | ~1.8m away -- should succeed |
| Hover C far mark | `(572, 0, 344)` | ~5m away -- should miss |

> **`hoverText` on hover-only targets**: the client's tooltip only exists for press/release
> entries (a hover-only entity shows no key prompt), so the hover result reads the target's own
> `PointerEvents` text as a fallback. Before that fallback existed these three targets returned
> no `hoverText` at all — if a run reports it missing again, that fallback regressed.

1. ```
   hover_entity  x: 564  y: 1  z: 339  seconds: 2
   ```
   Expected result: `hit: true`, `hoverText: "Hover A"`. Expected logs:
   `[S5-HOVER] A: PET_HOVER_ENTER (#1) hoverText="Hover A"` then, after the hold ends,
   `[S5-HOVER] A: PET_HOVER_LEAVE (#1)`.
2. ```
   hover_entity  x: 568  y: 1  z: 339  seconds: 2
   ```
   Expected result: `hoverText` is the long string. Confirm the full string round-trips in the
   tool result (not truncated).
3. Walk to the near mark `(572, 0, 337.5)`:
   ```
   hover_entity  x: 572  y: 1  z: 339  seconds: 2
   ```
   Expected result: `hit: true`. Log: `[S5-HOVER] C: PET_HOVER_ENTER (#1) -- only reachable within 2m`.
4. Walk to the far mark `(572, 0, 344)` and repeat the same call. Expected result: `hit: false`
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

Board: world `(568, 3.4, 347)`. Suppression target: world `(564, 1, 349)` (bound to
`IA_PRIMARY`).

> **Two things this station gets right that are easy to get wrong.**
>
> 1. **An unaimed `press_input` can never land entity-bound.** The entity-bound half of the
>    fan-out needs the reticle on the target, and the reticle follows the OS cursor — which no
>    driver is holding over anything. That is why `press_input` takes an aim (`entityId`, or
>    `x/y/z`): with it the reticle is held on the target for the gesture. `look_at` followed by
>    an unaimed `press_input` does **not** work and never did.
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
   press_input  action: PRIMARY
   ```
   Expected result: `entityBound: false`, plus a `hint` explaining the scene-root delivery.
   Expected log: `[S6-GLOBAL] IA_PRIMARY scene-root broadcast -- count now 1`.
   Screenshot the board: `scene-root PRIMARY: 1   entity PRIMARY: 0`.
2. Now press the same action **aimed at** the suppression target:
   ```
   press_input  action: PRIMARY  x: 564  y: 1  z: 349
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
   press_input  action: PRIMARY  entityId: <the target's Arch id>
   ```
   Same expectations as step 2.
4. Exercise a few more rows for completeness (all unaimed, so all scene-root):
   ```
   press_input  action: ACTION_3
   press_input  action: SECONDARY
   press_input  action: JUMP  holdSeconds: 1
   ```
   Expected logs: one `[S6-GLOBAL] IA_ACTION_3 ...`, one `IA_SECONDARY ...`, one `IA_JUMP ...`
   line each, and the board's corresponding counters increment by 1 each.

---

## S7 -- Camera look

Proves: `camera_look` (relative) and `look_at` (absolute) both drive the real camera; live
yaw/pitch readout.

Stand mark: world `(560, 0, 336)`. Markers (world):

| Marker | World position |
|---|---|
| MARKER-L (left) | `(548, 6, 336)` |
| MARKER-R (right) | `(572, 6, 336)` |
| MARKER-U (up) | `(560, 20, 336)` |
| MARKER-D (down) | `(560, 0.3, 324)` |

1. Walk to `(560, 0, 336)`.
2. ```
   look_at  x: 548  y: 6  z: 336
   ```
   Expected result: `cameraRotationEuler` reflects a leftward yaw **and `aimErrorDegrees` ~0**.
   Pass the marker's real position — the aim is refined until the point is actually under the
   reticle, so the y-fudging an earlier run needed (`y: 10.5` for this marker, `y: 80` for
   MARKER-U) is now wrong: it would aim above the marker. Expected log:
   `[S7-CAMERA] MARKER-L (left) entered aim (angle X.X deg)` within a frame or two. Readout
   board at `(560, 3.6, 336.01)` should show `L:1` incrementing.
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
   look_at  x: 560  y: 20  z: 336
   ```
   Expected result: `aimErrorDegrees` well above 2 plus a `warning` naming the rig limit — the
   correct answer for an unreachable target, and the check that `look_at` no longer claims
   success it did not achieve. Then clear the clamp with first person and retry:
   ```
   set_camera_mode  mode: first_person
   look_at  x: 560  y: 20  z: 336
   ```
   Expected result: `aimErrorDegrees` ~1. Expected log:
   `[S7-CAMERA] MARKER-U (up) entered aim`. Restore `third_person` afterwards.
   (Backing off to shallow the angle — `move_to (546, 0, 322)` then the same `look_at` — does
   **not** work in third person: measured `aimErrorDegrees: 18.0` with the pitch stopping at
   only -22.5 deg, well short of the -53.6 deg clamp; the rising orbit boom most plausibly
   collides with the ground and moves the ray origin under the refiner.)
5. ```
   look_at  x: 560  y: 0.3  z: 324
   ```
   Expected: negative pitch (looking down); log `[S7-CAMERA] MARKER-D (down) entered aim`.
   Each marker's label board prints its own exact world coordinates (visible in a screenshot)
   so the same numbers used above are also readable in-world.

---

## S8 -- Scene UI

Proves: **(8)** SDK UI addressed only by CRDT id; `ui_click`/`ui_set_text`/`ui_scroll` fire the
same events a user would; a covered element fails unless `force: true`; `device: true` replays
through the virtual mouse.

1. Open the panel:
   ```
   click_entity  x: 557  y: 1  z: 336
   ```
   Expected log: `[S8-UI] panel opened`. Screenshot: the panel appears top-left of the screen.
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
8. **Drag surface (`ui_drag`, normalized top-left coords):** read the on-screen rects of the
   "START"/"END" halves from `ui_list stack: sdk` (its `screenRect` is already in image pixels)
   or off a screenshot, then divide by the screenshot's width/height to normalize. Example call
   shape once you have the two centers:
   ```
   ui_drag  fromX: 0.10  fromY: 0.70  toX: 0.20  toY: 0.70  durationFrames: 20
   ```
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
10. Close the panel from the world button again (`click_entity x:557 y:1 z:336`) or leave it
    open for the next pass -- either is fine, the panel state is idempotent.

---

## Negative-case summary (for quick reference)

| Case | Call | Expected |
|---|---|---|
| Frozen `walk` in zone A | `walk directionY:1 seconds:2` while inside zone A | `distance` ~0, no burst log |
| Escape the freeze | same call + `ignoreInputModifiers: true` | `distance` > 0 |
| `disableRun` degrades the tier | `walk seconds:1 kind:run` inside zone B vs outside | in-zone `bucket=jog`, control `bucket=run` (compare sustained speeds, not distances) |
| Short-range miss from far mark | `click_entity x:567 y:1 z:323` from `(568.25,0,335)` | `hit:false`, reason names the range |
| Occluded click | `click_entity x:561 y:1 z:330` from the blocked-shot mark | `hit:false` + `blockedByEntityId`/`blockedByCrdtId`/`blockedByCollider` naming the occluder |
| Offset-pivot miss | `click_entity x:570 y:1 z:333` (the pivot, no collider) | `hit:false` |
| `IA_FORWARD` stays at 0 after `walk` | S1 readout after any `walk` | `global IA_FORWARD count: 0` until `press_input FORWARD` |
| Unaimed `press_input` is never entity-bound | `press_input action:PRIMARY` with no aim | `entityBound:false` + `hint`; scene-root counter increments, entity counter does not |
| Scene-root broadcast suppressed | `press_input action:PRIMARY x:564 y:1 z:349` | `entityBound:true`; entity counter +1, scene-root counter unchanged |
| Covered `ui_click` | `ui_click stack:sdk crdtId:<btn2Id>` while the modal is open | failure + `blockedBy`, no `[S8-UI] button 2 clicked` log |
| Device path does not reach scene UI | `ui_click stack:sdk crdtId:<btn1Id> device:true` | `ok:true` with an `info` line saying the element observed nothing, and no click log |
| Unreachable camera target | `look_at x:560 y:20 z:336` from the S7 stand mark | `aimErrorDegrees` >> 2 + a `warning` about the pitch clamp |
| Scroll into a clamp | `ui_scroll stack:sdk crdtId:<scrollId> dy:-400` at the top of the list | `ok` + an `info` line saying the offset did not move |

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
z 342.5 (a 1s run overshoots the platform); S7 step 4 uses `set_camera_mode first_person` as
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
