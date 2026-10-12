This example scene makes usage of `AvatarModifierArea` and `CameraModeArea`.

### SCENE TESTING

Camera Mode Area can be tested with 2 intersected camera mode areas, one for enforcing First Person Camera and the other one for enforcing Third Peron Camera. The clickable cube toggles repositioning one of the areas to the border of the scene to test leaving the scene while inside the area.

Avatar Modifier Area can be tested in the back of the scene, the clickable cube is to toggle adding/removing hardcoded user ids to the excluded lists, currently they have to be configured in the scene code up front.

## Pooled Area Reuse

Regression scene for [unity-explorer PR #10428](https://github.com/decentraland/unity-explorer/pull/10428): an area that reused a pooled collider kept the scale of the collider's previous owner, so it covered only a small spot at its center. In a real scene this showed up as an `AvatarModifierArea` with `AMT_HIDE_AVATARS` that never hid anyone.

The explorer keeps one pool of colliders for `AvatarModifierArea`, `CameraModeArea` and `TriggerArea`. The case is at the front right of the scene, under the **POOLED AREA REUSE** sign:

- **Red box (donor)** — an `AvatarModifierArea` without modifiers, Transform scaled to its own area size (5x2x5), like the areas above.
- **Green box (recipient)** — an `AvatarModifierArea` with `AMT_HIDE_AVATARS`, Transform scale 1, area 5x4x5. It takes the donor's collider from the pool.
- **Blue box (probe)** — a `TriggerArea` sized by its Transform scale (5x4x5). It also takes the donor's collider from the pool.

Every step is logged with the `[pooledAreaReuse]` prefix.

### Open on zone

```sh
Decentraland.exe --dclenv zone --realm sdk7testscenes.dcl.eth --position 9,99 --skip-version-check
```

Run it on the PR build and on `dev`. On `dev` all checks below fail.

The **Pooled Area Reuse — QA info** button (top right, hold **Alt** to use it) opens a panel with these instructions, the auto check result and buttons that do the same as the two cubes.

### Auto check (right cube, **AUTO CHECK** label)

Click the cube and wait about three seconds. The scene removes the red box, creates the blue probe, moves you inside the probe 0.5m from its edge, then prints the result above the cube:

- **PASS** (green): the probe reported you entering. Expected with the fix.
- **FAIL** (red): the probe did not notice you, because its collider kept the donor's scale and covers only a 1x2x1 spot in the middle. Expected on `dev`.

The probe is removed and the red box comes back, so the check can be repeated. A scene can't read whether an avatar is hidden, so the auto check uses a `TriggerArea` from the same pool instead of the green `AvatarModifierArea`. The manual check covers the hiding itself.

### Manual check (left cube, hover text **swap donor / recipient area**)

1. Click the cube: the red box disappears, the green box appears half a second later.
2. Switch to third person and walk into the green box away from its center.
   - **Fixed:** your avatar hides anywhere inside the green box.
   - **Broken:** your avatar stays visible and hides only in a 1m spot at the center.
3. Click again to bring the red box back, then repeat.

Do not run the auto check while the green box exists: it asks you to restore the red box first.

### Multiplayer check (two clients)

The boxes are not shared: each player sees only the boxes they created.

1. Player A clicks the left cube to create the green box and watches from outside it.
2. Player B stands where player A sees the green box, near its edge, not at its center.
   - **Fixed:** player A does not see player B.
   - **Broken:** player A still sees player B.
3. Swap roles.

Whether player B is hidden depends on player A's build. To compare builds, run player A on the PR build once and on `dev` once.

### Run locally

```sh
npm install
npm run build
npm run start
```

Connect the Explorer to the local preview at `9,99`.
