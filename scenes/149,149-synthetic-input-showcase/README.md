# synthetic-input-showcase

A 2x2-parcel SDK7 test scene built to be **driven live by an MCP-connected agent** through
unity-explorer's embedded MCP server, exercising every capability of the synthetic input
simulation layer (branch `feat/synthetic-input-simulation`, PR #9889): `walk`, `camera_look`,
`look_at`, `click_entity`, `click_at`, `hover_entity`, `press_input`, and the `ui_*` family
(`ui_list`, `ui_click`, `ui_set_text`, `ui_scroll`, `ui_drag`) -- including writing text into a
scene's `<Input />` fields and dragging a held pointer across a world surface to paint on it.

See **`MCP_SHOWCASE.md`** in this folder for the step-by-step driving script (exact tool
calls, expected results, and expected observables per station) -- that is the document the
driving session should read first.

## Parcels

- Base: `149,149`
- Parcels: `149,149`, `150,149`, `149,150`, `150,150` (2x2, 32m x 32m)
- World bounds: x `2384..2416`, z `2384..2416` (world coordinate = parcel-index * 16; every
  local position in this scene's code maps to world via `(x + 2384, y, z + 2384)` -- see
  `src/constants.ts`, `toWorld()`).
- Spawn: local `(4, 0, 1.5)` / world `(2388, 0, 2385.5)`, camera target local `(4, 1, 10)` /
  world `(2388, 1, 2394)` -- looking straight down the S1 locomotion lane.

## Station map (local coordinates; add `(2384, 0, 2384)` for world)

| Station | What it proves | Local center | Notable marks |
|---|---|---|---|
| S1 -- Locomotion lane | `walk` runs the real locomotion pipeline; collisions apply; `kind` changes speed | corridor x:2-6, z:1-18.5 | metre markers at z=1,5,9,13,17 (0/4/8/12/16m); wall at z=18.5 |
| S2 -- Jump / vertical | `walk(..., jump:true)` reaches an unsteppable platform; contrasts with `press_input JUMP` | platform (4, 0.6, 25) | ground jump mark (4, 0.05, 29) |
| S3 -- Freeze zone | `InputModifier` locks `walk` exactly like WASD; `ignoreInputModifiers` escapes it | zone A (11, 0.05, 20), zone B (11, 0.05, 26) | zone A: `disableAll`+`disableJump`; zone B: `disableRun` only |
| S4 -- Click targets | real reticle raycast: occlusion, `maxDistance`, down/up ordering, offset colliders | (17-30, 1, 3-13) | see `MCP_SHOWCASE.md` for the 8 individual targets |
| S5 -- Hover | `PET_HOVER_ENTER`/`LEAVE`, `hoverText`, distance-gated hover | (20-28, 1, 19) | hover C gated to 2m |
| S6 -- Global input board | `press_input` fan-out: entity-bound vs global broadcast, and the suppression rule | board (24, 3.4, 27) | suppression target (20, 1, 29), bound to `IA_PRIMARY` |
| S7 -- Camera look | `camera_look` (relative) vs `look_at` (absolute); live yaw/pitch readout | stand (16, 0, 16) | 4 markers at (4,6,16) (28,6,16) (16,20,16) (16,0.3,4) |
| S8 -- Scene UI | `ui_list`/`ui_click`/`ui_set_text`/`ui_scroll`/`ui_drag` against `ReactEcsRenderer` UI | toggle button (13, 1, 16) | panel opens on world-button click |
| S9 -- UI text entry | `ui_set_text` as *state*: uncontrolled vs controlled `<Input />`, change vs submit, a `disabled` field that refuses the write, a form read by a later `ui_click` | toggle button (10, 1, 16) | left-anchored panel; never overlaps S8's centered one |
| S10 -- Paint surface | pointer positions become geometry: one dot per click vs a trail from a held, sweeping pointer | canvases (10, 2.1, 9) and (14, 2.2, 9) | stand mark (12, 0, 5.5); decoy strip (14, 0.6, 9); clear button (8, 1, 6) |

A world **RESET ALL STATIONS** button sits at local `(19, 1, 16)` / world `(2403, 1, 2400)`,
and a matching "RESET ALL (UI)" button lives inside the S8 panel. Both call the same
`resetAllStations()` in `src/state.ts`, which zeroes every counter, clears any active
`InputModifier`, closes both UI panels, removes every dot painted at S10, and restores every
station's visuals -- the scene never needs a reload to be re-run from a clean state.

## SDK APIs used

- **Movement / player**: `Transform.get(engine.PlayerEntity)` (read-only position polling),
  `InputModifier` (`Mode.Standard` with `disableAll`/`disableJump`/`disableRun`).
- **Camera**: `Transform.get(engine.CameraEntity)`, `Quaternion.toEulerAngles`, `Vector3.rotate`/`dot`/`normalize`.
- **Interactivity**: `pointerEventsSystem.onPointerDown/onPointerUp/onPointerHoverEnter/onPointerHoverLeave`,
  `PointerEventsResult.get(engine.RootEntity)` read with a timestamp watermark (S6's board and S10's held-pointer
  flag — **not** `inputSystem.isTriggered`, which cannot read the scene root in any form; see below),
  `TriggerArea.setBox` + `triggerAreaEventsSystem.onTriggerEnter/onTriggerExit`.
- **Rendering**: `TextShape`, `Billboard` (`BM_Y`), `MeshRenderer`/`MeshCollider` primitives, `Material.setPbrMaterial`
  (albedo + emissive for the "reacted" visual state).
- **Pointer / raycast**: `PrimaryPointerInfo` (`worldRayDirection`) + `raycastSystem.registerGlobalDirectionRaycast`
  for S10's held-pointer stroke, and `PBPointerEventsResult.hit.position` for its per-click stamps.
- **UI**: `@dcl/sdk/react-ecs` (`ReactEcsRenderer.setUiRenderer`, `UiEntity`, `Label`, `Button`, `Input`, `Dropdown`),
  including `<Input value=... />` (controlled) and `<Input disabled />`. `setUiRenderer` is called
  once, from `src/stations/ui_root.tsx`, which renders S8's and S9's panels side by side. Virtual
  screen pinned to `1920x1080` per the `build-ui` skill's default rule.

No GLB models are used (primitives + `TextShape` only, per the scene-size constraint). No
external permissions are required -- the scene does not call `movePlayerTo`, trigger emotes,
or make network requests.

S10 paints with sphere primitives, which cost 804 triangles each in the client against a 2x2
scene's 40,000 budget, so its dot pool is capped at 40 and recycles oldest-first
(`S10_DOT_POOL_MAX` in `src/constants.ts`).

## Changes after the first live run (2026-08-28)

The scene was driven end-to-end against a running Explorer; the report lives in
`MCP_SHOWCASE_RESULTS.md` and the resulting changes are summarised at the bottom of
`MCP_SHOWCASE.md`. Scene-side:

- **S2 pressure plate** — a 0.1m-thin `TriggerArea` slab never overlaps the avatar capsule
  standing on it, so it never fired. The visual plate stays; the trigger is a separate
  invisible 2m-tall box. (S3's two zones needed the same fix and got it during the run.)
- **S6 board** — reads the scene root's own `PointerEventsResult` grow-only set with a timestamp
  watermark. ~~Now reads `inputSystem.isTriggered(action, type, engine.RootEntity)`~~ — that
  intermediate fix was itself wrong and is superseded: passing `engine.RootEntity` changes
  nothing, because the root entity is `0` and the SDK's `if (entity)` guard treats it as absent
  (JS falsy zero), so it runs the same all-entities scan as omitting the argument. Neither form
  can measure the root. S10's held-pointer flag was fixed the same way on 2026-09-02.
- **S1 gait classifier** — peak per-frame speed misclassified jog as run; it now uses a
  smoothed sustained speed and logs distance, duration, average and sustained speed.
- **S3 zone B** — a 9m corridor (was a 4m pad) so a ~1s run burst stays inside past the
  acceleration ramp; `disableRun` degrades run to jog, so the proof is a speed comparison, not
  a distance one.
- **S1 readout board** — moved to the far end of the lane; at its old position (above the
  spawn point) it was behind the camera from every viewpoint the lane is walked from.

After the second run (also 2026-08-28, report superseded in place):

- **S1 gait thresholds** — the sustained-speed EMA converges on the gait's true top speed as
  the burst lengthens (a 2s jog reads ~8.2 m/s), so the jog/run boundary moved to 9 m/s;
  single-frame displacements above 20 m/s (a `move_to` teleport) are logged and excluded.
- **S3 zones** — the handlers no longer write the `InputModifier` last-writer-wins; every
  enter/exit recomputes it from current zone occupancy, because a teleport crossing both
  volumes delivers `enter(destination)` before `exit(origin)` and the stale exit used to wipe
  the modifier.
- **S2 arrivals** — count only after ~0.4s of dwell inside the trigger; a jump arc passing
  through the volume logs a fly-through instead of an arrival.

## Scene expansion (2026-08-31)

Two stations were added and the docs' world coordinates were rebased.

- **S9 -- UI text entry.** A second React panel, left-anchored, with five `<Input />` fields that
  separate what one field conflates: uncontrolled vs. controlled (`value`), change vs. submit, a
  `disabled` field that must refuse a synthetic write, and a two-field form whose values are read
  by a later `ui_click` rather than by the write itself.
- **S10 -- Paint surface.** The painting idea from the `0,5-primary-cursor-info` reference scene,
  split into the two paths the synthetic-input layer can reach a world surface with: a STAMP
  canvas (one dot per `click_entity`/`click_at`, placed at the event's own `hit.position`) and a
  STROKE canvas (a trail painted while `IA_POINTER` is held and the pointer sweeps, via
  `PrimaryPointerInfo.worldRayDirection` + `raycastSystem`). A non-paintable DECOY strip under the
  stroke canvas proves the trail follows the pointer rather than the camera. The station reports a
  single-dot stroke explicitly, so a drag whose press and release land in one drain window is
  visible as that rather than passing as a short stroke.
- **One UI root.** `ReactEcsRenderer.setUiRenderer` may only be called once per scene, so both UI
  stations now render through `src/stations/ui_root.tsx`. S8's panel is centered and S9's is
  left-anchored so they cannot overlap -- an overlap would make `ui_click`'s occlusion pre-check
  report one station's panel as a cover over the other's element.
- **World coordinates rebased.** The first three live runs happened while the scene sat at base
  parcel `34,20`, so every per-step world coordinate in `MCP_SHOWCASE.md` (and the spawn/reset
  coordinates here) was still on the old `(544, 0, 320)` offset while the prose, `scene.json` and
  `src/constants.ts` had all moved to `149,149`. All of them are now on `(2384, 0, 2384)`. The
  `[INIT] MARK` log lines remain the authority -- they are computed from `toWorld()` at runtime.

## Substitutions from the original spec

- **`TriggerArea` for S2's pressure plate and S3's freeze zones** -- confirmed present and
  used exactly as documented in the `add-interactivity` skill (native SDK7 component, not a
  proximity-check fallback). No substitution needed.
- **"Global input" polling deviates from the `advanced-input` skill, deliberately.** The skill's
  guidance ("Omit the entity argument to check globally") and the `0,1-input-modifier` reference
  scene's `getInputCommand(InputAction.IA_ANY, PET_DOWN)` both answer from **every** entity's
  `PointerEventsResult`, so an entity-bound event satisfies them — they cannot distinguish a
  scene-root broadcast from an entity-bound press, and passing `engine.RootEntity` does not help
  (falsy zero, same scan). S6 and S10 therefore read `PointerEventsResult.get(engine.RootEntity)`
  directly with a timestamp watermark. Worth filing upstream against `js-sdk-toolchain`.
- **`click_entity`/`hover_entity`'s `entityId` argument is a *different id space* from this
  scene's own CRDT entity ids**: it is the Explorer's internal Arch ECS entity id, which is what
  `list_scene_entities` returns. Confirmed in the client source, and the tools report **both**
  ids in their result, so one world-aimed click on a target yields its Arch id for later
  `entityId`-addressed calls. Every station in `MCP_SHOWCASE.md` is therefore driven primarily
  via explicit **world x/y/z aim points** (which this scene logs for every target and floor mark
  at `[INIT]` time).

## Build / validate

```bash
cd scenes/149,149-synthetic-input-showcase
npm install
npm run build      # zero TypeScript errors
```

```bash
# from the repo root
npm install
npm run check-parcels   # No collisions found
```

## Logs

Every station prefixes its `console.log` lines with `[S<n>-<STATION>]` (e.g. `[S4-CLICK]`,
`[S6-GLOBAL]`, `[S8-UI]`). On scene start, `[INIT]` lines map every interactable's purpose to
its CRDT entity id, and `[INIT] MARK ...` lines give the local **and** world coordinates of
every "stand here" floor mark and aim point. `get_scene_logs` reads as a full transcript of
whatever a driving session exercised.
